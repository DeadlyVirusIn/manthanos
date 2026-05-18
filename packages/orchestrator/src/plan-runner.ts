// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Built-in `plan` workflow runner — Phase 1 vertical slice.
//
// Sequence:
//   1. Open brain DB; recover (CRASH_CONSISTENCY §5.1).
//   2. Read charter facts + recent decisions from brain.
//   3. Pack context bundle (context.pack).
//   4. Estimate cost; refuse if over budget.
//   5. Invoke adapter (single Claude in Phase 1).
//   6. Redact secret patterns from response text.
//   7. Audit the invocation (audited-write).
//   8. Parse plan from response text (best-effort).
//   9. Persist plan summary + parse result.
//   10. Return run summary.

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  AdapterError,
  type AgentAdapter,
  type AgentRequest,
  hashCanonicalPayload,
} from '@manthanos/adapters-sdk';
import { type ContextBundle, pack } from '@manthanos/context';
import {
  AsyncMutex,
  type AuditedWriteContext,
  type ManthanDb,
  auditedWrite,
  createBlobStore,
  openDb,
  runRecovery,
} from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';
import { redactSecrets, scanGitHooks } from '@manthanos/safety';
import { compoundFromPlan, inferArea } from './brain-compound.js';
import { type ExtractMethod, extractPlan } from './plan-extract.js';
import type { PlanArtifact } from './plan-schema.js';
import { PLAN_TOOL, PLAN_TOOL_SYSTEM_INSTRUCTIONS } from './plan-tool.js';

export interface RunPlanOptions {
  readonly workspaceRoot: string;
  readonly taskBrief: string;
  readonly adapter: AgentAdapter;
  /** Hard ceiling in USD micro-units; default $0.10. */
  readonly maxUsdMicro?: number;
  /** Hard token budget for the context bundle; default 60_000. */
  readonly contextTokenBudget?: number;
  /** Max tokens the model may produce; default 4096. */
  readonly maxOutputTokens?: number;
  readonly abortSignal?: AbortSignal;
  /** When set, only the listed files participate in the context. */
  readonly explicitFiles?: readonly string[];
  /** When true, T0 (quarantine) facts also enter the context bundle. */
  readonly includeQuarantine?: boolean;
}

export interface RunPlanResult {
  readonly runId: string;
  readonly workspaceId: string;
  readonly bundleHash: string;
  readonly auditSeqStart: number;
  readonly auditSeqEnd: number;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly usdMicro: number;
  };
  readonly finishReason: string;
  readonly rawText: string;
  readonly redacted: ReadonlyArray<{ pattern: string; count: number }>;
  readonly plan: PlanArtifact | null;
  readonly planParseError: string | null;
  readonly extractMethod: ExtractMethod;
  readonly compound: {
    readonly openIssuesCreated: number;
    readonly factsQuarantined: number;
    readonly auditEventsWritten: number;
  };
  /** Phase 1.6 trust-loop metrics — how much trusted cognition shaped this run. */
  readonly bundleMetrics: {
    readonly trustedFactsInBundle: number;
    readonly quarantineFactsInBundle: number;
    readonly trustedTokens: number;
    readonly untrustedTokens: number;
  };
  readonly gitHooksWarning: string | null;
  readonly elapsedMs: number;
}

export class RunPlanError extends Error {
  constructor(
    readonly code: 'NOT_INITIALIZED' | 'CHAIN_CORRUPTED' | 'BUDGET_EXCEEDED' | 'ADAPTER_FAILED',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RunPlanError';
  }
}

export async function runPlanWorkflow(opts: RunPlanOptions): Promise<RunPlanResult> {
  const t0 = Date.now();
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(opts.workspaceRoot);
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  const jsonlPath = path.join(manthanDir, 'audit.log');

  const blobs = createBlobStore(path.join(manthanDir, 'audit', 'blobs'));

  // 1. Open DB + recover.
  let m: ManthanDb;
  try {
    m = await openDb({ dbPath });
  } catch (err) {
    throw new RunPlanError(
      'NOT_INITIALIZED',
      `workspace not initialized at ${workspaceRoot} — run \`manthan init\` first`,
      { cause: (err as Error).message },
    );
  }

  try {
    const ws = m.handle
      .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
      .get(workspaceRoot) as { id: string } | undefined;
    if (!ws) {
      throw new RunPlanError('NOT_INITIALIZED', 'workspaces row missing — run `manthan init`');
    }
    const workspaceId = ws.id;

    const recovery = await runRecovery({
      db: m.handle,
      blobs,
      jsonlPath,
      workspaceId,
    });
    // Mutating workflows refuse to run unless recovery is clean or
    // only had recoverable reconciliations (orphan blobs, tail-of-JSONL
    // append). `corrupted` and `unrecoverable` require operator
    // inspection of .manthan/audit-corruption.log before the system
    // can be trusted to write new audit events.
    if (recovery.status !== 'clean' && recovery.status !== 'partial') {
      throw new RunPlanError(
        'CHAIN_CORRUPTED',
        `recovery status=${recovery.status}; ${recovery.findings.length} corruption finding(s). Inspect .manthan/audit-corruption.log; refusing to mutate.`,
        {
          status: recovery.status,
          findings: recovery.findings,
          failedAtSeq: recovery.chainFailedAtSeq,
        },
      );
    }

    // 1b. Git-hook detection (informational warning string).
    const hooks = await scanGitHooks(workspaceRoot);
    const gitHooksWarning =
      hooks.length > 0
        ? `${hooks.length} non-sample git hook(s) detected in this workspace (Phase 1 informational; auto-commit refusal lands in Phase 2). Hooks: ${hooks
            .map((h) => `${path.basename(h.path)}:${h.sha256.slice(0, 8)}`)
            .join(', ')}`
        : null;

    const ctx: AuditedWriteContext = {
      db: m.handle,
      blobs,
      jsonlPath,
      mutex: new AsyncMutex(),
    };

    // 2. Read brain context. Phase 1.6 splits by trust tier:
    //    - charterFacts: bootstrap-derived facts (always rendered with [T0] marker —
    //      they're operationally reliable, e.g. language=typescript, regardless of tier).
    //    - trustedFacts: T+1 / T+2 / T+3 — the human-promoted cognition that re-enters
    //      the prompt as high-signal priors. THE COMPOUNDING LOOP.
    //    - quarantineFacts: T0 non-charter — opt-in via --include-quarantine.
    const charterFacts = m.handle
      .prepare(
        `SELECT area, statement, tier FROM semantic_facts
         WHERE workspace_id = ? AND area IN ('language', 'project', 'package_manager', 'testing')
         ORDER BY area ASC, statement ASC`,
      )
      .all(workspaceId) as Array<{ area: string; statement: string; tier: string }>;

    const trustedFactsRaw = m.handle
      .prepare(
        `SELECT id, area, statement, tier, confidence, provenance_workflow_id
         FROM semantic_facts
         WHERE workspace_id = ? AND tier IN ('T+1', 'T+2', 'T+3')
         ORDER BY
           CASE tier WHEN 'T+3' THEN 1 WHEN 'T+2' THEN 2 ELSE 3 END ASC,
           area ASC, statement ASC`,
      )
      .all(workspaceId) as Array<{
      id: string;
      area: string;
      statement: string;
      tier: 'T+1' | 'T+2' | 'T+3';
      confidence: number;
      provenance_workflow_id: string | null;
    }>;
    const trustedFacts = trustedFactsRaw.map((f) => ({
      id: f.id,
      area: f.area,
      statement: f.statement,
      tier: f.tier,
      confidence: f.confidence,
      provenanceWorkflowId: f.provenance_workflow_id,
    }));

    const quarantineFactsRaw = m.handle
      .prepare(
        `SELECT id, area, statement, confidence, provenance_workflow_id
         FROM semantic_facts
         WHERE workspace_id = ? AND tier = 'T0'
              AND area NOT IN ('language', 'project', 'package_manager', 'testing')
         ORDER BY area ASC, statement ASC`,
      )
      .all(workspaceId) as Array<{
      id: string;
      area: string;
      statement: string;
      confidence: number;
      provenance_workflow_id: string | null;
    }>;
    const quarantineFacts = quarantineFactsRaw.map((f) => ({
      id: f.id,
      area: f.area,
      statement: f.statement,
      tier: 'T0' as const,
      confidence: f.confidence,
      provenanceWorkflowId: f.provenance_workflow_id,
    }));

    const decisions = m.handle
      .prepare(
        `SELECT area, summary, rationale, signed_at FROM decisions
         WHERE workspace_id = ?
         ORDER BY signed_at DESC NULLS LAST, summary ASC
         LIMIT 20`,
      )
      .all(workspaceId) as Array<{
      area: string;
      summary: string;
      rationale: string;
      signed_at: string | null;
    }>;

    // 3. Pack context.
    const bundle: ContextBundle = await pack({
      workspaceRoot,
      taskBrief: opts.taskBrief,
      charterFacts,
      trustedFacts,
      quarantineFacts,
      includeQuarantine: opts.includeQuarantine ?? false,
      decisions,
      includeFiles: opts.explicitFiles,
      tokenBudget: opts.contextTokenBudget ?? 60_000,
    });

    // 4. Budget gate.
    const maxUsdMicro = opts.maxUsdMicro ?? 100_000; // $0.10
    const estInputCost = Math.round(
      (bundle.totalEstimatedTokens * opts.adapter.metadata.cost.inputUsdMicroPer1k) / 1000,
    );
    if (estInputCost > maxUsdMicro) {
      throw new RunPlanError(
        'BUDGET_EXCEEDED',
        `estimated cost ${estInputCost} micro-USD exceeds budget ${maxUsdMicro}`,
        { estInputCost, maxUsdMicro, totalTokens: bundle.totalEstimatedTokens },
      );
    }

    // 4b. Open the workflow row.
    const runId = `wf_${randomUUID()}`;
    const startTs = new Date().toISOString();
    m.handle
      .prepare(
        `INSERT INTO workflows (id, workspace_id, type, version, started_at, finished_at, status,
                                total_input_tokens, total_output_tokens, total_usd_micro)
         VALUES (?, ?, 'plan', '1.0.0', ?, NULL, 'running', 0, 0, 0)`,
      )
      .run(runId, workspaceId, startTs);

    // Audit: workflow start.
    const startAudit = await auditedWrite(ctx, {
      workspaceId,
      actor: `workflow:plan#${runId}`,
      action: 'workflow.start',
      kind: 'system',
      decision: 'auto-approve',
      payload: {
        workflow: 'plan',
        version: '1.0.0',
        task_brief: opts.taskBrief,
        bundle_hash: bundle.bundleHash,
      },
    });

    // Audit: context bundle snapshot (no secrets — these are repo content).
    await auditedWrite(ctx, {
      workspaceId,
      actor: `workflow:plan#${runId}`,
      action: 'context.pack',
      kind: 'system',
      decision: 'auto-approve',
      payload: {
        bundle_hash: bundle.bundleHash,
        layer_count: bundle.layers.length,
        estimated_tokens: bundle.totalEstimatedTokens,
        layer_summary: bundle.layers.map((l) => ({
          kind: l.kind,
          provenance: l.provenance,
          tokens: l.estimatedTokens,
          trust: l.trust,
        })),
        // Phase 1.6 trust-loop metrics — see RunPlanResult.bundleMetrics.
        trusted_facts_in_bundle: bundle.metrics.trustedFactsInBundle,
        quarantine_facts_in_bundle: bundle.metrics.quarantineFactsInBundle,
        trusted_tokens: bundle.metrics.trustedTokens,
        untrusted_tokens: bundle.metrics.untrustedTokens,
      },
    });
    m.handle
      .prepare(
        `INSERT INTO context_snapshots (id, workspace_id, workflow_id, bundle_hash, layers_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `cs_${runId}`,
        workspaceId,
        runId,
        bundle.bundleHash,
        // Persist per-layer content_sha256 alongside the metadata so
        // `manthan replay` can recompute bundle_hash from the snapshot
        // alone — without re-rendering layer content. P0.3.
        JSON.stringify(
          bundle.layers.map((l, i) => ({
            kind: l.kind,
            wrap_as: l.wrapAs,
            attributes: l.attributes,
            trust: l.trust,
            estimated_tokens: l.estimatedTokens,
            provenance: l.provenance,
            content_sha256: bundle.layerContentHashes[i],
          })),
        ),
        startTs,
      );

    // 5. Build request and invoke adapter.
    //    Phase 1.5: tool-use schema is primary; fenced-JSON parser exists
    //    only as a fallback inside extractPlan().
    const fullSystemPrompt = `${bundle.systemPrompt}\n\n${PLAN_TOOL_SYSTEM_INSTRUCTIONS}`;
    const req: AgentRequest = {
      system: fullSystemPrompt,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: bundle.userPrompt }],
        },
      ],
      tools: [PLAN_TOOL],
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      temperature: 0,
      correlationId: runId,
      abortSignal: opts.abortSignal,
    };

    let response: Awaited<ReturnType<typeof opts.adapter.invoke>>;
    try {
      response = await opts.adapter.invoke(req);
    } catch (err) {
      // Audit the failure before re-throwing.
      const code = err instanceof AdapterError ? err.code : 'internal';
      await auditedWrite(ctx, {
        workspaceId,
        actor: `workflow:plan#${runId}`,
        action: 'agent.invoke.failed',
        kind: 'network-read',
        decision: 'auto-approve',
        payload: {
          adapter: opts.adapter.metadata.id,
          error_code: code,
          error_message: err instanceof Error ? err.message : String(err),
        },
      });
      m.handle
        .prepare('UPDATE workflows SET status = ?, finished_at = ? WHERE id = ?')
        .run('failed', new Date().toISOString(), runId);
      throw new RunPlanError(
        'ADAPTER_FAILED',
        `adapter ${opts.adapter.metadata.id} failed: ${code}`,
        { error: err instanceof Error ? err.message : String(err), code },
      );
    }

    // 6. Redact secrets from the response text + tool result content before
    //    persisting the response blob.
    const { text: redactedText, redactions } = redactSecrets(response.text);
    const redactedCanonical = {
      ...response.canonical,
      text: redactedText,
      content: response.canonical.content.map((p) => {
        if (p.type === 'text') {
          return { ...p, text: redactSecrets(p.text).text };
        }
        if (p.type === 'tool_result') {
          if (typeof p.content === 'string') {
            return { ...p, content: redactSecrets(p.content).text };
          }
        }
        return p;
      }),
    };

    // Canonical-response hash, committed into the audit payload so that
    // `manthan replay` can recompute and compare without re-deriving
    // canonical projection.
    const responseHash = hashCanonicalPayload(redactedCanonical).payloadHash;

    // 7. Audit the invocation. Persist redacted canonical + raw side-by-side.
    const invokeAudit = await auditedWrite(ctx, {
      workspaceId,
      actor: `workflow:plan#${runId}`,
      action: 'agent.invoke',
      kind: 'network-read',
      decision: 'auto-approve',
      payload: {
        adapter: opts.adapter.metadata.id,
        canonical: redactedCanonical,
        canonical_hash: responseHash,
        redactions: [...redactions],
        latency_ms: response.latencyMs,
        // The `raw` is intentionally excluded from the audit payload hash
        // (per ADAPTER_SPEC §3.1) but we record its existence by storing
        // its sha256 separately.
      },
    });

    // 8. Extract plan — tool-use primary, fenced-JSON fallback.
    //    We pass the redacted-canonical response so toolCalls + text align
    //    with what was persisted.
    const extractResponse = {
      ...response,
      text: redactedText,
      content: redactedCanonical.content,
      canonical: redactedCanonical,
    };
    const parseResult = extractPlan(extractResponse);
    const extractMethod: ExtractMethod = parseResult.method;

    // 8b. Audit the extraction method + plan summary (no full plan body —
    //     that's already in the agent.invoke blob).
    await auditedWrite(ctx, {
      workspaceId,
      actor: `workflow:plan#${runId}`,
      action: 'plan.extracted',
      kind: 'system',
      decision: 'auto-approve',
      payload: {
        method: extractMethod,
        ok: parseResult.ok,
        error: parseResult.error ?? null,
        summary: parseResult.plan?.summary ?? null,
        step_count: parseResult.plan?.steps.length ?? 0,
        risk_count: parseResult.plan?.risks.length ?? 0,
        assumption_count: parseResult.plan?.assumptions.length ?? 0,
      },
    });

    // 8c. Compound the brain.
    //     - risks (severity >= 3) → open_issues
    //     - assumptions → semantic_facts at T0 (quarantine)
    //     Per directive: NO auto-promotion, all stays at T0.
    let compoundResult = {
      openIssuesCreated: 0,
      factsQuarantined: 0,
      auditEventsWritten: 0,
    };
    if (parseResult.ok && parseResult.plan) {
      const area = inferArea(opts.taskBrief);
      compoundResult = await compoundFromPlan({
        ctx,
        db: m.handle,
        workspaceId,
        workflowId: runId,
        area,
        plan: parseResult.plan,
      });
    }

    // 9. Update workflow row + write workflow_step.
    const finishTs = new Date().toISOString();
    m.handle
      .prepare(
        `UPDATE workflows
         SET status = ?, finished_at = ?,
             total_input_tokens = ?, total_output_tokens = ?, total_usd_micro = ?
         WHERE id = ?`,
      )
      .run(
        parseResult.ok ? 'completed' : 'completed_with_warnings',
        finishTs,
        response.usage.inputTokens,
        response.usage.outputTokens,
        response.usage.usdMicro,
        runId,
      );
    m.handle
      .prepare(
        `INSERT INTO workflow_steps
           (id, workflow_id, step_order, kind, payload_json, adapter_id,
            input_tokens, output_tokens, usd_micro, latency_ms, status, audit_seq)
         VALUES (?, ?, 1, 'agent.invoke', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `ws_${runId}_1`,
        runId,
        JSON.stringify({
          adapter: opts.adapter.metadata.id,
          finish_reason: response.finishReason,
        }),
        opts.adapter.metadata.id,
        response.usage.inputTokens,
        response.usage.outputTokens,
        response.usage.usdMicro,
        response.latencyMs,
        'ok',
        invokeAudit.seq,
      );

    // Audit: workflow end.
    const endAudit = await auditedWrite(ctx, {
      workspaceId,
      actor: `workflow:plan#${runId}`,
      action: 'workflow.end',
      kind: 'system',
      decision: 'auto-approve',
      payload: {
        status: parseResult.ok ? 'completed' : 'completed_with_warnings',
        usd_micro: response.usage.usdMicro,
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        finish_reason: response.finishReason,
        plan_parsed: parseResult.ok,
        extract_method: extractMethod,
        compound: {
          open_issues_created: compoundResult.openIssuesCreated,
          facts_quarantined: compoundResult.factsQuarantined,
        },
      },
    });

    return {
      runId,
      workspaceId,
      bundleHash: bundle.bundleHash,
      auditSeqStart: startAudit.seq,
      auditSeqEnd: endAudit.seq,
      usage: response.usage,
      finishReason: response.finishReason,
      rawText: redactedText,
      redacted: redactions,
      plan: parseResult.plan ?? null,
      planParseError: parseResult.error ?? null,
      extractMethod,
      compound: compoundResult,
      bundleMetrics: {
        trustedFactsInBundle: bundle.metrics.trustedFactsInBundle,
        quarantineFactsInBundle: bundle.metrics.quarantineFactsInBundle,
        trustedTokens: bundle.metrics.trustedTokens,
        untrustedTokens: bundle.metrics.untrustedTokens,
      },
      gitHooksWarning,
      elapsedMs: Date.now() - t0,
    };
  } finally {
    m.close();
  }
}
