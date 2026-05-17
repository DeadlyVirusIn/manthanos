// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Extract a PlanArtifact from an adapter response.
//
// Primary path (Phase 1.5+): the response contains a `tool_call` to
// `record_plan` whose `arguments` is the PlanArtifact JSON shape.
//
// Fallback path: legacy fenced-JSON parser, for adapters that don't
// support tool-use or models that ignored the tool directive. This
// path is INTENTIONALLY SECONDARY — production calls should always
// take the tool-use route. The fallback exists so a one-off SDK quirk
// doesn't lose a workflow run.

import type { AgentResponse } from '@manthanos/adapters-sdk';
import { type ParseResult, parsePlan as parseFencedPlan } from './plan-schema.js';
import { PLAN_TOOL_NAME } from './plan-tool.js';

export type ExtractMethod = 'tool_use' | 'fenced_json' | 'none';

export interface PlanExtractResult extends ParseResult {
  readonly method: ExtractMethod;
}

/**
 * Extract a structured plan from an adapter response.
 * Prefers tool-use; falls back to fenced JSON.
 */
export function extractPlan(response: AgentResponse): PlanExtractResult {
  // ---- Primary: tool_use ----
  const planCall = response.toolCalls.find((tc) => tc.name === PLAN_TOOL_NAME);
  if (planCall) {
    const parsed = validateToolArguments(planCall.arguments);
    if (parsed.ok) {
      return { ...parsed, method: 'tool_use' };
    }
    // Tool was called but arguments are malformed — try the text fallback
    // before giving up.
    const fallback = parseFencedPlan(response.text);
    if (fallback.ok) return { ...fallback, method: 'fenced_json' };
    return { ...parsed, method: 'tool_use' };
  }

  // ---- Fallback: fenced JSON in text ----
  if (response.text.length > 0) {
    const parsed = parseFencedPlan(response.text);
    if (parsed.ok) return { ...parsed, method: 'fenced_json' };
    return { ...parsed, method: 'fenced_json' };
  }

  return { ok: false, error: 'no tool call and no text in response', method: 'none' };
}

function validateToolArguments(args: unknown): ParseResult {
  if (!args || typeof args !== 'object') {
    return { ok: false, error: 'tool arguments not an object' };
  }
  // We piggyback on the lenient validator from plan-schema by reusing its
  // shape-checking via a synthetic fenced wrapper. Simpler: validate inline
  // because we already know it's a parsed object.
  const r = args as Record<string, unknown>;
  const summary = typeof r.summary === 'string' ? r.summary : '';
  if (!summary) return { ok: false, error: 'summary missing' };

  const steps = Array.isArray(r.steps) ? r.steps : [];
  const parsedSteps = steps
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const o = s as Record<string, unknown>;
      if (typeof o.id !== 'string' || typeof o.description !== 'string') return null;
      return {
        id: o.id,
        description: o.description,
        files_affected: Array.isArray(o.files_affected)
          ? (o.files_affected.filter((x) => typeof x === 'string') as string[])
          : [],
        depends_on: Array.isArray(o.depends_on)
          ? (o.depends_on.filter((x) => typeof x === 'string') as string[])
          : [],
        estimated_difficulty: clampDifficulty(o.estimated_difficulty),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const risks = Array.isArray(r.risks) ? r.risks : [];
  const parsedRisks = risks
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      if (typeof o.description !== 'string') return null;
      return {
        description: o.description,
        severity: clampSeverity(o.severity),
        mitigation: typeof o.mitigation === 'string' ? o.mitigation : '',
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const assumptions = Array.isArray(r.assumptions)
    ? (r.assumptions.filter((s) => typeof s === 'string') as string[])
    : [];
  const openQs = Array.isArray(r.open_questions)
    ? (r.open_questions.filter((s) => typeof s === 'string') as string[])
    : [];

  return {
    ok: true,
    plan: {
      summary,
      steps: parsedSteps,
      assumptions,
      risks: parsedRisks,
      open_questions: openQs,
    },
  };
}

function clampDifficulty(v: unknown): 1 | 2 | 3 | 4 | 5 {
  return ([1, 2, 3, 4, 5] as const).includes(v as 1) ? (v as 1 | 2 | 3 | 4 | 5) : 3;
}
function clampSeverity(v: unknown): 1 | 2 | 3 | 4 | 5 {
  return ([1, 2, 3, 4, 5] as const).includes(v as 1) ? (v as 1 | 2 | 3 | 4 | 5) : 3;
}
