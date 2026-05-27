#!/usr/bin/env node
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn
//
// Advisory enum-mirror drift check (R2b, static-check scope).
//
// The web client (apps/web/src/api/types.ts) hand-declares `ALLOWED_*`
// tuples that mirror enum value sets independently declared on the API
// side (apps/api/src/services/*). The C1.9 no-raw-enums scan only covers
// `.tsx`, so it does NOT catch drift between these `.ts` declarations.
// This script compares each mirrored enum's value SET and warns on any
// divergence that is not a documented, intentional exception.
//
// ADVISORY-FIRST: the drift run prints warnings and ALWAYS exits 0 in this
// phase. It never blocks CI. (A later, separately-approved step may flip it
// to fail-closed once a canonical source of truth is chosen.) It performs a
// static text parse only — no module execution, no codegen, no generated
// output, no product-code change.
//
// Usage:
//   node scripts/check-enum-drift.mjs            # advisory drift run (exit 0)
//   node scripts/check-enum-drift.mjs --selftest # verify the comparison logic

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── static parse ──────────────────────────────────────────────────
// Collect single-quoted string literals appearing after `anchor`, up to
// the first tuple/union terminator (`]` or `;`). Works for both
// `const X = [ 'a', 'b' ] as const` and `type X = 'a' | 'b';`.
function literalsAfter(text, anchor) {
  const idx = text.indexOf(anchor);
  if (idx < 0) return null; // anchor not present → caller decides
  const rest = text.slice(idx + anchor.length);
  const bracket = rest.indexOf(']');
  const semi = rest.indexOf(';');
  const ends = [bracket, semi].filter((i) => i >= 0);
  const end = ends.length > 0 ? Math.min(...ends) : rest.length;
  const window = rest.slice(0, end);
  return [...window.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function readFile(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8');
}

// ── pure comparison (exported for the self-test) ──────────────────
// Returns the values present on one side only, after removing
// documented intentional exceptions.
export function diffEnum(webValues, apiValues, allow = {}) {
  const apiExtraAllow = new Set(allow.apiExtra ?? []);
  const webExtraAllow = new Set(allow.webExtra ?? []);
  const w = new Set(webValues);
  const a = new Set(apiValues);
  const missingInApi = webValues.filter((v) => !a.has(v) && !webExtraAllow.has(v));
  const extraInApi = apiValues.filter((v) => !w.has(v) && !apiExtraAllow.has(v));
  return { missingInApi, extraInApi };
}

function hasDrift(d) {
  return d.missingInApi.length > 0 || d.extraInApi.length > 0;
}

// ── enum mirror map ───────────────────────────────────────────────
// web: anchor pointing at the `ALLOWED_*` tuple in types.ts.
// api: { file, anchor } pointing at the canonical API declaration, OR
//      null when there is no single canonical API source (ambiguous /
//      web-only) — reported as INFO, never as drift.
const WEB = 'apps/web/src/api/types.ts';
const CONV = 'apps/api/src/services/conversations.ts';
const FACTS = 'apps/api/src/services/facts.ts';
const WS = 'apps/api/src/services/workspace.ts';
const PROV = 'apps/api/src/services/provenance.ts';
const CONF = 'apps/api/src/services/extraction/confidence.ts';
const DUP = 'apps/api/src/services/extraction/duplicates.ts';

const ENUMS = [
  {
    name: 'audience_fit',
    web: 'ALLOWED_AUDIENCE_FIT =',
    api: { file: CONV, anchor: 'type AudienceFit =' },
  },
  {
    name: 'conversation_type',
    web: 'ALLOWED_CONVERSATION_TYPE =',
    api: { file: CONV, anchor: 'type ConversationType =' },
  },
  {
    name: 'conversation_outcome',
    web: 'ALLOWED_CONVERSATION_OUTCOME =',
    api: { file: CONV, anchor: 'type ConversationOutcome =' },
  },
  {
    name: 'fact_extraction_status',
    web: 'ALLOWED_FACT_EXTRACTION_STATUS =',
    api: { file: CONV, anchor: 'type FactExtractionStatus =' },
  },
  // Canonical 4-tier source only. The simulator's 6-tier variant
  // (long-horizon.ts, T+3..T-2) is a different internal scale and is
  // intentionally NOT referenced here.
  {
    name: 'fact_tier',
    web: 'ALLOWED_FACT_TIER =',
    api: { file: FACTS, anchor: 'type FactTier =' },
  },
  {
    name: 'workspace_status',
    web: 'ALLOWED_WORKSPACE_STATUS =',
    api: { file: WS, anchor: 'type WorkspaceStatus =' },
  },
  {
    name: 'provenance_kind',
    web: 'ALLOWED_PROVENANCE_KIND =',
    api: { file: PROV, anchor: 'type ProvenanceSourceKind =' },
  },
  {
    name: 'extractor',
    web: 'ALLOWED_EXTRACTOR =',
    api: { file: PROV, anchor: 'type ProvenanceExtractor =' },
  },
  {
    name: 'extraction_source',
    web: 'ALLOWED_EXTRACTION_SOURCE =',
    api: { file: CONF, anchor: 'EXTRACTION_SOURCES =' },
  },
  {
    name: 'extraction_reason',
    web: 'ALLOWED_EXTRACTION_REASON =',
    api: { file: CONF, anchor: 'CONFIDENCE_REASON_FLAGS =' },
  },
  // Intentional divergence: the API models a "no duplicate" state `none`
  // that the web never surfaces (candidate warnings only show real
  // duplicates). Allow `none` as an API-only extra.
  {
    name: 'candidate_duplicate_kind',
    web: 'ALLOWED_CANDIDATE_DUPLICATE_KIND =',
    api: { file: DUP, anchor: 'type DuplicateKind =' },
    allow: { apiExtra: ['none'] },
  },
  // No single canonical API tuple — lifecycle states are scattered across
  // derived flags + error states. Source-of-truth ambiguous → INFO only.
  {
    name: 'lifecycle_state',
    web: 'ALLOWED_LIFECYCLE_STATE =',
    api: null,
    note: 'scattered API source (derived flags + error states); no single tuple to compare',
  },
  // Web-only view: the API sends a numeric score + Title-case display
  // labels, not a snake_case bucket-key enum. No API mirror → INFO only.
  {
    name: 'confidence_bucket',
    web: 'ALLOWED_CONFIDENCE_BUCKET =',
    api: null,
    note: 'web-only view over the numeric score; API uses Title-case labels + thresholds, no key enum',
  },
];

// ── runner ────────────────────────────────────────────────────────
function runDriftCheck() {
  const webText = readFile(WEB);
  let warnings = 0;
  let infos = 0;
  let checked = 0;

  for (const e of ENUMS) {
    const webValues = literalsAfter(webText, e.web);
    if (webValues === null) {
      console.warn(`[enum-drift] WARN: ${e.name} — web anchor not found ('${e.web}')`);
      warnings++;
      continue;
    }
    if (e.api === null) {
      console.info(`[enum-drift] INFO: ${e.name} — ${e.note}`);
      infos++;
      continue;
    }
    const apiText = readFile(e.api.file);
    const apiValues = literalsAfter(apiText, e.api.anchor);
    if (apiValues === null) {
      console.warn(
        `[enum-drift] WARN: ${e.name} — API anchor not found ('${e.api.anchor}' in ${e.api.file})`,
      );
      warnings++;
      continue;
    }
    checked++;
    const d = diffEnum(webValues, apiValues, e.allow);
    if (hasDrift(d)) {
      warnings++;
      console.warn(
        `[enum-drift] WARN: ${e.name} — web {${webValues.join(', ')}} vs api {${apiValues.join(', ')}}${d.missingInApi.length ? ` | missing in api: ${d.missingInApi.join(', ')}` : ''}${d.extraInApi.length ? ` | extra in api: ${d.extraInApi.join(', ')}` : ''}`,
      );
    }
  }

  console.log(
    `[enum-drift] checked ${checked} mirrored enum(s); ${warnings} warning(s), ${infos} info note(s). (advisory — exit 0)`,
  );
  // Advisory-first: never block in this phase.
  process.exit(0);
}

// ── self-test ─────────────────────────────────────────────────────
function runSelfTest() {
  const cases = [
    { name: 'identical → no drift', got: hasDrift(diffEnum(['a', 'b'], ['a', 'b'])), want: false },
    {
      name: 'divergent (web has extra) → drift',
      got: hasDrift(diffEnum(['a', 'b'], ['a'])),
      want: true,
    },
    {
      name: 'allow-listed api extra → no drift',
      got: hasDrift(
        diffEnum(['exact', 'likely'], ['exact', 'likely', 'none'], { apiExtra: ['none'] }),
      ),
      want: false,
    },
    {
      name: 'non-allow-listed api extra → drift',
      got: hasDrift(diffEnum(['a', 'b'], ['a', 'b', 'c'])),
      want: true,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = c.got === c.want;
    if (!ok) failed++;
    console.log(
      `[selftest] ${ok ? 'PASS' : 'FAIL'} — ${c.name} (got drift=${c.got}, want=${c.want})`,
    );
  }
  // The advisory drift RUN always exits 0 even when drift is present; that
  // is a property of runDriftCheck(), demonstrated by a real run.
  console.log(
    '[selftest] note: the drift run exits 0 even when drift is present (advisory phase).',
  );
  if (failed > 0) {
    console.error(
      `[selftest] ${failed} self-test case(s) failed — the comparison logic is broken.`,
    );
    process.exit(1); // a broken tool is a real failure (distinct from drift detection)
  }
  console.log('[selftest] all cases passed.');
  process.exit(0);
}

if (process.argv.includes('--selftest')) {
  runSelfTest();
} else {
  runDriftCheck();
}
