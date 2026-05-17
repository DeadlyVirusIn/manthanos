// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// The structured-plan schema returned by `manthan plan`.
// Per WORKFLOWS_SPEC.md, plan output is a typed artifact (not free-form
// text). We instruct the adapter to emit JSON matching this shape, then
// validate it on the runtime side.

export interface PlanArtifact {
  readonly summary: string;
  readonly steps: ReadonlyArray<PlanStep>;
  readonly assumptions: ReadonlyArray<string>;
  readonly risks: ReadonlyArray<PlanRisk>;
  readonly open_questions: ReadonlyArray<string>;
}

export interface PlanStep {
  readonly id: string;
  readonly description: string;
  readonly files_affected: ReadonlyArray<string>;
  readonly depends_on: ReadonlyArray<string>;
  readonly estimated_difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface PlanRisk {
  readonly description: string;
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly mitigation: string;
}

export const PLAN_INSTRUCTIONS = [
  'Produce a structured plan as a single JSON object inside a ```json fenced block.',
  'The JSON must match this TypeScript shape:',
  '',
  '{',
  '  "summary": string,                                  // one paragraph',
  '  "steps": [{',
  '    "id": string,                                     // e.g. "S1"',
  '    "description": string,',
  '    "files_affected": string[],                       // relative repo paths',
  '    "depends_on": string[],                           // ids of prior steps',
  '    "estimated_difficulty": 1 | 2 | 3 | 4 | 5',
  '  }],',
  '  "assumptions": string[],',
  '  "risks": [{',
  '    "description": string,',
  '    "severity": 1 | 2 | 3 | 4 | 5,',
  '    "mitigation": string',
  '  }],',
  '  "open_questions": string[]',
  '}',
  '',
  'Constraints:',
  '- Emit exactly one fenced ```json block, with no leading or trailing prose outside it.',
  '- Do not include comments inside the JSON.',
  '- Keep step ids stable across re-plans of the same task (S1, S2, ...).',
  '- If you are unsure about a file path, name it tentatively and add an open_question.',
].join('\n');

const JSON_FENCE_RE = /```json\s*\n([\s\S]*?)\n```/;

export interface ParseResult {
  readonly ok: boolean;
  readonly plan?: PlanArtifact;
  readonly error?: string;
}

export function parsePlan(text: string): ParseResult {
  const match = JSON_FENCE_RE.exec(text);
  if (!match) {
    // Fallback: try to find the first { ... } block at top-level.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return { ok: false, error: 'no ```json``` fenced block and no top-level object found' };
    }
    return tryParse(text.slice(start, end + 1));
  }
  const body = match[1];
  if (!body) return { ok: false, error: 'empty json fenced block' };
  return tryParse(body);
}

function tryParse(body: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'plan must be an object' };
  }
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];

  const summary = typeof r.summary === 'string' ? r.summary : '';
  if (!summary) errors.push('summary missing or not a string');

  const steps = Array.isArray(r.steps) ? r.steps : [];
  const parsedSteps: PlanStep[] = [];
  for (const [i, s] of steps.entries()) {
    if (!s || typeof s !== 'object') {
      errors.push(`steps[${i}] not an object`);
      continue;
    }
    const o = s as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.description !== 'string') {
      errors.push(`steps[${i}] missing id/description`);
      continue;
    }
    parsedSteps.push({
      id: o.id,
      description: o.description,
      files_affected: Array.isArray(o.files_affected)
        ? (o.files_affected.filter((x) => typeof x === 'string') as string[])
        : [],
      depends_on: Array.isArray(o.depends_on)
        ? (o.depends_on.filter((x) => typeof x === 'string') as string[])
        : [],
      estimated_difficulty: ([1, 2, 3, 4, 5] as const).includes(o.estimated_difficulty as 1)
        ? (o.estimated_difficulty as 1 | 2 | 3 | 4 | 5)
        : 3,
    });
  }

  const risks = Array.isArray(r.risks) ? r.risks : [];
  const parsedRisks: PlanRisk[] = [];
  for (const x of risks) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.description !== 'string') continue;
    parsedRisks.push({
      description: o.description,
      severity: ([1, 2, 3, 4, 5] as const).includes(o.severity as 1)
        ? (o.severity as 1 | 2 | 3 | 4 | 5)
        : 3,
      mitigation: typeof o.mitigation === 'string' ? o.mitigation : '',
    });
  }

  const assumptions = Array.isArray(r.assumptions)
    ? (r.assumptions.filter((s) => typeof s === 'string') as string[])
    : [];
  const openQs = Array.isArray(r.open_questions)
    ? (r.open_questions.filter((s) => typeof s === 'string') as string[])
    : [];

  if (errors.length > 0) {
    return { ok: false, error: errors.join('; ') };
  }

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
