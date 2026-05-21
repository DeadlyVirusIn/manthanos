// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Run Plan screen — four internal phases:
//   1. Brief input — typed-form replacement for `manthan plan "<brief>"`
//   2. Running — live phase markers from the PhaseCallback
//   3. Result — plan body + run summary
//   4. (UX prototype 9.2) Inline replay verification co-located with
//      the result. Automatically invoked once the plan completes;
//      collapsed-by-default if verified, expanded if not.
//
// Substrate-boundary discipline: `replayRun` is a read-only
// verification against just-recorded artifacts. It produces no
// audit events, mutates no state, and is mechanically equivalent
// to the operator pressing 'v' from the Home screen and entering
// the just-recorded runId. The 9.2 co-location is presentation-only.

import { createClaudeCliAdapter, presetToConfig } from '@manthanos/adapter-claude-cli';
import {
  type PhaseEvent,
  type ReplayResult,
  RunPlanError,
  type RunPlanResult,
  replayRun,
  runPlanWorkflow,
} from '@manthanos/orchestrator';
import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useState } from 'react';
import { Frame } from '../components/frame.js';

export interface RunPlanScreenProps {
  readonly workspaceRoot: string;
  readonly onPlanComplete: (runId: string) => void;
  readonly onBack: () => void;
}

/**
 * Inline replay verification state attached to the 'done' phase
 * (UX prototype 9.2). The verification fires automatically once
 * the plan run completes; the operator can toggle the panel's
 * expansion with the [e] key.
 */
export type InlineVerification =
  | { readonly state: 'pending' }
  | { readonly state: 'complete'; readonly result: ReplayResult }
  | { readonly state: 'error'; readonly message: string };

type Phase =
  | { readonly kind: 'input'; readonly brief: string }
  | { readonly kind: 'running'; readonly brief: string; readonly events: readonly PhaseEvent[] }
  | {
      readonly kind: 'done';
      readonly brief: string;
      readonly result: RunPlanResult;
      readonly verification: InlineVerification;
      readonly expanded: boolean;
    }
  | {
      readonly kind: 'error';
      readonly brief: string;
      readonly message: string;
      readonly code?: string;
    };

export function RunPlanScreen({ workspaceRoot, onPlanComplete, onBack }: RunPlanScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'input', brief: '' });

  const start = useCallback(
    (brief: string) => {
      setPhase({ kind: 'running', brief, events: [] });
      const adapter = createClaudeCliAdapter(
        presetToConfig('sonnet', {
          recommendedFor: ['architecture', 'implementation'],
        }),
      );
      runPlanWorkflow({
        workspaceRoot,
        taskBrief: brief,
        adapter,
        maxUsdMicro: 100_000,
        contextTokenBudget: 60_000,
        onPhase: (event) => {
          setPhase((prev) => {
            if (prev.kind !== 'running') return prev;
            return { ...prev, events: [...prev.events, event] };
          });
        },
      })
        .then((result) =>
          setPhase({
            kind: 'done',
            brief,
            result,
            verification: { state: 'pending' },
            // Default expansion is set when verification completes — see useEffect below.
            expanded: false,
          }),
        )
        .catch((e: unknown) => {
          if (e instanceof RunPlanError) {
            setPhase({ kind: 'error', brief, message: e.message, code: e.code });
          } else {
            setPhase({
              kind: 'error',
              brief,
              message: e instanceof Error ? e.message : String(e),
            });
          }
        });
    },
    [workspaceRoot],
  );

  // UX 9.2: automatically run replay verification once the plan
  // completes. Read-only; produces no audit events; equivalent to
  // the operator manually pressing 'v' on the Home screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: phase.kind is the trigger; we only want to fire once per plan completion.
  useEffect(() => {
    if (phase.kind !== 'done') return;
    if (phase.verification.state !== 'pending') return;
    let cancelled = false;
    const runId = phase.result.runId;
    replayRun({ workspaceRoot, runId }).then(
      (result) => {
        if (cancelled) return;
        const expandByDefault = result.verification.status !== 'verified';
        setPhase((prev) => {
          if (prev.kind !== 'done') return prev;
          return {
            ...prev,
            verification: { state: 'complete', result },
            expanded: expandByDefault,
          };
        });
      },
      (e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setPhase((prev) => {
          if (prev.kind !== 'done') return prev;
          return {
            ...prev,
            verification: { state: 'error', message: msg },
            expanded: true,
          };
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [phase.kind, workspaceRoot]);

  useInput((input, key) => {
    if (phase.kind === 'input') {
      if (key.return) {
        const brief = phase.brief.trim();
        if (brief.length === 0) return;
        start(brief);
      } else if (key.escape) {
        onBack();
      } else if (key.backspace || key.delete) {
        setPhase({ kind: 'input', brief: phase.brief.slice(0, -1) });
      } else if (input && !key.ctrl && !key.meta) {
        setPhase({ kind: 'input', brief: phase.brief + input });
      }
    } else if (phase.kind === 'done') {
      if (input === 'e') {
        // Toggle inline verification expansion.
        setPhase({ ...phase, expanded: !phase.expanded });
      } else if (input === 'c') {
        // Continue to the dedicated Replay screen for full forensic
        // detail (audit-event seq, full hashes, raw payload paths).
        // The inline panel is the default trust surface; 'c' is the
        // upgrade path.
        onPlanComplete(phase.result.runId);
      } else if (input === 'b' || key.escape) onBack();
    } else if (phase.kind === 'error') {
      if (input === 'b' || key.escape || key.return) onBack();
    }
  });

  return (
    <Frame
      screen="Run Plan"
      workspaceRoot={workspaceRoot}
      cliCommand={`manthan plan "${phase.brief || '<brief>'}"`}
      hints={phaseHints(phase)}
    >
      {renderPhase(phase)}
    </Frame>
  );
}

function phaseHints(phase: Phase): readonly string[] {
  switch (phase.kind) {
    case 'input':
      return ['[enter] run · [esc] back · [n] next'];
    case 'running':
      return ['running… · [n] next'];
    case 'done':
      return [
        `[e] ${phase.expanded ? 'collapse' : 'expand'} verification · [c] open replay screen · [b] back to home · [n] next`,
      ];
    case 'error':
      return ['[b] back · [enter] back · [n] next'];
  }
}

function renderPhase(phase: Phase) {
  if (phase.kind === 'input') {
    return (
      <Box flexDirection="column">
        <Text>Brief (what should this plan address?):</Text>
        <Box marginTop={1}>
          <Text color="cyan">› </Text>
          <Text>{phase.brief}</Text>
          <Text color="gray">_</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">A real adapter (Claude CLI) will be invoked. Real cost applies.</Text>
        </Box>
      </Box>
    );
  }
  if (phase.kind === 'running') {
    return (
      <Box flexDirection="column">
        <Text>Brief:</Text>
        <Text color="gray"> {phase.brief}</Text>
        <Box marginTop={1} flexDirection="column">
          {phase.events.length === 0 && <Text color="gray">starting…</Text>}
          {phase.events.map((e, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: events are append-only
            <Text key={i}>{formatPhase(e)}</Text>
          ))}
        </Box>
      </Box>
    );
  }
  if (phase.kind === 'done') {
    const r = phase.result;
    const m = r.bundleMetrics;
    return (
      <Box flexDirection="column">
        <Text color="green">Plan complete.</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>run id: {r.runId}</Text>
          <Text color="gray">
            context: {m.trustedFactsInBundle} trusted · {m.quarantineFactsExcluded} quarantine
            excluded · {m.omittedFactsCount} omitted
          </Text>
          <Text color="gray">
            tokens: in={r.usage.inputTokens} out={r.usage.outputTokens} · cost: $
            {(r.usage.usdMicro / 1_000_000).toFixed(6)}
          </Text>
          <Text color="gray">
            compound: {r.compound.factsQuarantined} new T0 fact(s), {r.compound.openIssuesCreated}
            {' open issue(s)'}
          </Text>
        </Box>
        {r.plan && (
          <Box marginTop={1} flexDirection="column">
            <Text>Summary:</Text>
            <Text color="gray"> {r.plan.summary}</Text>
            <Text>Steps:</Text>
            {r.plan.steps.slice(0, 5).map((s) => (
              <Text key={s.id} color="gray">
                {' '}
                · {s.id} (D{s.estimated_difficulty}) {s.description}
              </Text>
            ))}
            {r.plan.steps.length > 5 && (
              <Text color="gray"> · …and {r.plan.steps.length - 5} more</Text>
            )}
          </Box>
        )}

        {/* UX 9.2: inline replay verification panel, co-located with the result. */}
        <Box marginTop={1} flexDirection="column">
          {renderInlineVerification(phase.verification, phase.expanded, r.runId)}
        </Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text color="red">Plan failed.</Text>
      {phase.code && <Text color="gray">code: {phase.code}</Text>}
      <Text>{phase.message}</Text>
    </Box>
  );
}

/**
 * Render the inline replay verification panel (UX prototype 9.2).
 *
 * One-line summary always visible. The 4-check breakdown + the
 * literal `manthan replay <runId>` CLI equivalent appears when
 * expanded — automatically when the status is anything other than
 * `verified`, or when the operator presses [e].
 *
 * Visual discipline: quiet by default, no alert iconography, no
 * notification energy. Color encodes substrate status only.
 *
 * Exported for direct unit testing without invoking `replayRun`.
 */
export function renderInlineVerification(v: InlineVerification, expanded: boolean, runId: string) {
  if (v.state === 'pending') {
    return (
      <Box>
        <Text color="gray">Trust: </Text>
        <Text color="gray">verifying…</Text>
      </Box>
    );
  }
  if (v.state === 'error') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="gray">Trust: </Text>
          <Text color="red">verification error</Text>
        </Box>
        <Text color="gray"> {v.message}</Text>
      </Box>
    );
  }
  // complete
  const r = v.result;
  const status = r.verification.status;
  const statusColor =
    status === 'verified'
      ? 'green'
      : status === 'legacy' || status === 'unverifiable'
        ? 'yellow'
        : 'red';
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="gray">Trust: </Text>
        <Text color={statusColor}>{status}</Text>
        <Text color="gray"> ({r.verification.checks.blobs.checked} blobs checked)</Text>
      </Box>
      {expanded && (
        <Box marginTop={0} flexDirection="column">
          <Text color={r.verification.checks.chain === 'ok' ? 'green' : 'red'}>
            {' '}
            · chain: {r.verification.checks.chain}
          </Text>
          <Text color={checkColor(r.verification.checks.canonicalHash)}>
            {' '}
            · canonical_hash: {r.verification.checks.canonicalHash}
          </Text>
          <Text color={checkColor(r.verification.checks.bundleHash)}>
            {' '}
            · bundle_hash: {r.verification.checks.bundleHash}
          </Text>
          <Text
            color={
              r.verification.checks.blobs.failed === 0 && r.verification.checks.blobs.missing === 0
                ? 'green'
                : 'red'
            }
          >
            {' '}
            · blobs: {r.verification.checks.blobs.checked} checked,{' '}
            {r.verification.checks.blobs.failed} failed, {r.verification.checks.blobs.missing}{' '}
            missing
          </Text>
          <Box marginTop={1}>
            <Text color="gray">CLI: manthan replay {runId}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function checkColor(c: 'ok' | 'mismatch' | 'legacy' | 'unverifiable'): string {
  if (c === 'ok') return 'green';
  if (c === 'mismatch') return 'red';
  return 'yellow';
}

function formatPhase(event: PhaseEvent): string {
  switch (event.kind) {
    case 'bundle_ready':
      return `· bundle ready: ${event.trustedFactsInBundle} trusted, ${event.quarantineFactsExcluded} quarantine excluded, ~${event.estimatedTokens} tokens`;
    case 'adapter_invoke_start':
      return `· calling ${event.adapterId}…`;
    case 'adapter_invoke_heartbeat':
      return `· still waiting (${Math.round(event.elapsedMs / 1000)}s)`;
    case 'adapter_invoke_done':
      return `· response received: ${event.outputTokens} tokens in ${Math.round(event.elapsedMs / 1000)}s`;
    case 'extracted':
      return `· extracted plan; ${event.factsRecorded} new fact${event.factsRecorded === 1 ? '' : 's'} recorded for review`;
  }
}
