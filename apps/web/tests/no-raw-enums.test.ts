// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Enum-rendering lint scan. Sprint 2 M1 C1.9.
//
// MISSION: catch any substrate vocabulary that escapes into user-facing
// JSX in apps/web. The translation layer (C1.8) is the FIRST line of
// defence; this scan is the SECOND line — it fires when a developer
// renders `{x.audience_fit}` instead of `<EnumLabel ...>`, types raw
// substrate words ("tombstoned", "provenance", "contested") into JSX
// text, or hard-codes substrate tier strings ('T+1' etc) into TSX.
//
// SCAN STRATEGY (deliberately narrow):
//   - Only `.tsx` files under apps/web/src/ are scanned.
//   - `.ts` files are NOT scanned. They are the substrate-binding layer
//     (api client, types, route URLs, react-query keys) and legitimately
//     carry substrate vocabulary; nothing in a `.ts` file reaches the
//     user without being routed through `<EnumLabel>` or other JSX.
//   - Within each `.tsx` file, three render contexts are checked:
//       1. JSX text         (`<p>tombstoned</p>` — text between > and <)
//       2. JSX attributes   (`title="tombstone..."` — attrs of known UI props)
//       3. JSX expressions  (`{x.audience_fit}` — direct enum-field render)
//   - Tier literals (`'T+1' | 'T0' | 'T-1' | 'T-2'`) are flagged anywhere
//     in a `.tsx` file (no legitimate non-substrate use case in UI code).
//
// ALLOW-LIST: only files that legitimately discuss substrate vocabulary
// without rendering it raw to the user. Today: labels.ts (the
// translation source of truth — a `.ts` and thus skipped anyway, listed
// for explicitness) and the i18n label tests (their assertions quote
// substrate strings on purpose).
//
// POSITIVE SELF-TEST: tests/fixtures/raw-enum-violations.tsx contains
// deliberate violations in every category. If the scanner ever stops
// detecting them, the positive self-test fails — proving the scan still
// works.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// apps/web/
const WEB_ROOT = join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────
// Forbidden vocabulary
// ─────────────────────────────────────────────────────────────────
//
// DO NOT WEAKEN this list to make a violation pass. If `apps/web/src/`
// trips the scan, fix the source (route through `<EnumLabel>` or rewrite
// the JSX text) — don't shorten the list.

const FORBIDDEN_WORDS: ReadonlyArray<string> = [
  // Substrate lifecycle / column / role vocabulary
  'tombstone',
  'tombstoned',
  'provenance',
  'corroborate',
  'corroborated',
  'contested',
  'superseded',
  'extractor',
  'audit_seq',
];

// Substrate tier strings. Quoted in source. Case-sensitive (capital T).
const TIER_LITERAL_RE = /(['"`])T(?:\+1|0|-1|-2)\1/g;

// Enum field names that must never be rendered directly in JSX.
// Wrapping in `<EnumLabel>` / `getEnumLabel(...)` is the sanctioned path.
const ENUM_FIELD_NAMES: ReadonlyArray<string> = [
  'audience_fit',
  'conversation_type',
  'outcome',
  'fact_extraction_status',
  'tier',
  'lifecycle_state',
  'provenance_kind',
];

// Tokens whose presence on a line means the line is already routed
// through the sanctioned translation surface. Used to suppress the
// raw-enum-jsx scan for lines like
//   `<EnumLabel kind="audience_fit" value={c.audience_fit} />`
const SANCTIONED_HELPERS: ReadonlyArray<string> = ['<EnumLabel', 'getEnumLabel(', 'useEnumLabel('];

// User-facing JSX attributes whose string values are visible to the user.
// `placeholder`, `title`, `aria-label`, `alt`, `label`. Not `name`/`id`
// (technical). Not `value`/`defaultValue` (often a state expression).
const USER_FACING_ATTRS: ReadonlyArray<string> = [
  'title',
  'aria-label',
  'placeholder',
  'alt',
  'label',
];

// ─────────────────────────────────────────────────────────────────
// Allow-list
// ─────────────────────────────────────────────────────────────────
//
// Files allowed to contain forbidden vocabulary because they ARE the
// translation/types layer or assert on it in tests. Keep this list
// short — any new entry needs a one-line justification beside it.

const ALLOW_LIST: ReadonlyArray<string> = [
  // Translation source of truth. Defines every substrate→UI mapping.
  // A `.ts` file (already skipped by the .tsx-only scan), listed for
  // explicitness so a future scan extension stays correct.
  'src/i18n/labels.ts',
  // Label assertions: every test in this file quotes substrate strings
  // on purpose ("tombstoned", "T+1", "contested", etc.) to verify the
  // translation map.
  'tests/i18n-labels.test.tsx',
  // The scanner itself defines the forbidden vocabulary as data.
  'tests/no-raw-enums.test.ts',
];

function isAllowListed(relPath: string): boolean {
  // Normalise to POSIX separators for cross-platform comparison.
  const norm = relPath.split(sep).join('/');
  return ALLOW_LIST.includes(norm);
}

// ─────────────────────────────────────────────────────────────────
// Violation types
// ─────────────────────────────────────────────────────────────────

type ViolationCategory = 'jsx-text' | 'jsx-attr' | 'jsx-expr' | 'tier-literal';

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly category: ViolationCategory;
  readonly token: string;
  readonly snippet: string;
}

// ─────────────────────────────────────────────────────────────────
// Scanners (per category)
// ─────────────────────────────────────────────────────────────────

function wordRegex(word: string): RegExp {
  return new RegExp(`\\b${word}\\b`, 'gi');
}

/** Extract JSX text content (chunks between `>` and `<`) from a line.
 *  Skips text that starts with `{` (those are JSX expressions, scanned
 *  separately) and pure whitespace. */
function extractJsxTextChunks(line: string): string[] {
  const out: string[] = [];
  const re = />([^<{][^<]*)</g;
  let m: RegExpExecArray | null = re.exec(line);
  while (m !== null) {
    const chunk = m[1].trim();
    if (chunk.length > 0) out.push(chunk);
    m = re.exec(line);
  }
  return out;
}

/** Extract user-facing JSX attribute string values from a line.
 *  Matches `title="..."`, `aria-label='...'`, etc. for known props. */
function extractAttrStrings(line: string): Array<{ attr: string; value: string }> {
  const out: Array<{ attr: string; value: string }> = [];
  for (const attr of USER_FACING_ATTRS) {
    const re = new RegExp(`${attr}=(["'])([^"']*)\\1`, 'g');
    let m: RegExpExecArray | null = re.exec(line);
    while (m !== null) {
      out.push({ attr, value: m[2] });
      m = re.exec(line);
    }
  }
  return out;
}

function scanJsxText(file: string, lines: ReadonlyArray<string>): Violation[] {
  const out: Violation[] = [];
  lines.forEach((line, i) => {
    const chunks = extractJsxTextChunks(line);
    for (const chunk of chunks) {
      for (const word of FORBIDDEN_WORDS) {
        if (wordRegex(word).test(chunk)) {
          out.push({
            file,
            line: i + 1,
            category: 'jsx-text',
            token: word,
            snippet: line.trim(),
          });
        }
      }
    }
  });
  return out;
}

function scanJsxAttrs(file: string, lines: ReadonlyArray<string>): Violation[] {
  const out: Violation[] = [];
  lines.forEach((line, i) => {
    const attrs = extractAttrStrings(line);
    for (const { value } of attrs) {
      for (const word of FORBIDDEN_WORDS) {
        if (wordRegex(word).test(value)) {
          out.push({
            file,
            line: i + 1,
            category: 'jsx-attr',
            token: word,
            snippet: line.trim(),
          });
        }
      }
    }
  });
  return out;
}

function scanRawEnumJsx(file: string, lines: ReadonlyArray<string>): Violation[] {
  const out: Violation[] = [];
  const re = new RegExp(`\\{\\s*\\w+\\.(?:${ENUM_FIELD_NAMES.join('|')})\\s*\\}`, 'g');
  lines.forEach((line, i) => {
    if (SANCTIONED_HELPERS.some((h) => line.includes(h))) return;
    const matches = line.match(re);
    if (matches && matches.length > 0) {
      for (const match of matches) {
        out.push({
          file,
          line: i + 1,
          category: 'jsx-expr',
          token: match,
          snippet: line.trim(),
        });
      }
    }
  });
  return out;
}

function scanTierLiterals(file: string, lines: ReadonlyArray<string>): Violation[] {
  const out: Violation[] = [];
  lines.forEach((line, i) => {
    TIER_LITERAL_RE.lastIndex = 0;
    let m: RegExpExecArray | null = TIER_LITERAL_RE.exec(line);
    while (m !== null) {
      out.push({
        file,
        line: i + 1,
        category: 'tier-literal',
        token: m[0],
        snippet: line.trim(),
      });
      m = TIER_LITERAL_RE.exec(line);
    }
  });
  return out;
}

// Strip both line comments and block comments from source. Newlines
// are preserved so line numbers in violation reports stay correct. The
// `://` in URLs is left intact (rare in TSX, but cheap to guard against).
// Comments are stripped because they sometimes document the scan itself
// (e.g. an EnumLabel.tsx comment that mentions the forbidden pattern)
// and are not user-facing — so they should not trip the scanner.
function stripComments(content: string): string {
  // Block comments — replace contents with spaces, keep newlines.
  let out = content.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
  // Line comments — strip from `//` to end of line, unless preceded by `:`.
  out = out
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      if (idx === -1) return line;
      if (idx > 0 && line[idx - 1] === ':') return line;
      return line.slice(0, idx);
    })
    .join('\n');
  return out;
}

function scanContent(relPath: string, content: string): Violation[] {
  const lines = stripComments(content).split('\n');
  return [
    ...scanJsxText(relPath, lines),
    ...scanJsxAttrs(relPath, lines),
    ...scanRawEnumJsx(relPath, lines),
    ...scanTierLiterals(relPath, lines),
  ];
}

// ─────────────────────────────────────────────────────────────────
// Filesystem walker
// ─────────────────────────────────────────────────────────────────

function walkTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsxFiles(full));
    } else if (full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe('Enum-rendering lint scan (M1 C1.9)', () => {
  // ── Negative test: current src/ is clean ───────────────────────
  it('apps/web/src/ has zero raw-substrate violations', () => {
    const srcRoot = join(WEB_ROOT, 'src');
    const files = walkTsxFiles(srcRoot);
    const all: Violation[] = [];
    for (const f of files) {
      const rel = relative(WEB_ROOT, f);
      if (isAllowListed(rel)) continue;
      const content = readFileSync(f, 'utf8');
      all.push(...scanContent(rel, content));
    }
    // If this fails, the violation list itself is the report.
    expect(all).toEqual([]);
  });

  // ── Positive self-test: fixture violations are detected ────────
  describe('positive self-test (fixture)', () => {
    const fixturePath = join(WEB_ROOT, 'tests/fixtures/raw-enum-violations.tsx');
    const violations = scanContent(
      relative(WEB_ROOT, fixturePath),
      readFileSync(fixturePath, 'utf8'),
    );

    it('detects violations of every category', () => {
      const cats = new Set(violations.map((v) => v.category));
      expect(cats.has('jsx-text')).toBe(true);
      expect(cats.has('jsx-attr')).toBe(true);
      expect(cats.has('jsx-expr')).toBe(true);
      expect(cats.has('tier-literal')).toBe(true);
    });

    it('detects every required substrate word at least once', () => {
      const tokens = new Set(violations.map((v) => v.token));
      const required: ReadonlyArray<string> = [
        'tombstone',
        'tombstoned',
        'provenance',
        'corroborate',
        'corroborated',
        'contested',
        'superseded',
        'extractor',
        'audit_seq',
      ];
      const missing = required.filter((w) => !tokens.has(w));
      expect(missing).toEqual([]);
    });

    it('detects all four tier literals', () => {
      const tierTokens = violations
        .filter((v) => v.category === 'tier-literal')
        .map((v) => v.token);
      expect(tierTokens).toContain("'T+1'");
      expect(tierTokens).toContain("'T0'");
      expect(tierTokens).toContain("'T-1'");
      expect(tierTokens).toContain("'T-2'");
    });

    it('detects raw enum-field renders for each known field', () => {
      const exprTokens = violations.filter((v) => v.category === 'jsx-expr').map((v) => v.token);
      const fields = exprTokens.map((t) => t.replace(/[{}\s]/g, '').split('.')[1]);
      expect(fields).toContain('audience_fit');
      expect(fields).toContain('conversation_type');
      expect(fields).toContain('outcome');
      expect(fields).toContain('tier');
    });

    it('detects forbidden vocabulary in user-facing JSX attributes', () => {
      const attrViolations = violations.filter((v) => v.category === 'jsx-attr');
      const tokens = new Set(attrViolations.map((v) => v.token));
      expect(tokens.has('tombstone')).toBe(true);
      expect(tokens.has('contested')).toBe(true);
      expect(tokens.has('provenance')).toBe(true);
    });

    it('reports a substantial number of violations (no silent regressions)', () => {
      expect(violations.length).toBeGreaterThanOrEqual(20);
    });
  });

  // ── Allow-list mechanics ──────────────────────────────────────
  describe('allow-list', () => {
    it('proves the allow-list is doing real work (the i18n test file would otherwise trigger)', () => {
      const i18nTest = join(WEB_ROOT, 'tests/i18n-labels.test.tsx');
      const content = readFileSync(i18nTest, 'utf8');
      const found = scanContent(relative(WEB_ROOT, i18nTest), content);
      expect(found.length).toBeGreaterThan(0);
      expect(isAllowListed(relative(WEB_ROOT, i18nTest).split(sep).join('/'))).toBe(true);
    });

    it('does NOT allow-list arbitrary src files', () => {
      // Sanity: the allow-list should remain minimal. Today it has
      // exactly three entries. If a future PR adds more, that PR
      // should justify each new entry in code review.
      expect(ALLOW_LIST.length).toBeLessThanOrEqual(4);
    });
  });

  // ── Forbidden list is intact ──────────────────────────────────
  it('does not weaken the forbidden-word list', () => {
    const required: ReadonlyArray<string> = [
      'tombstone',
      'tombstoned',
      'provenance',
      'corroborate',
      'corroborated',
      'contested',
      'superseded',
      'extractor',
      'audit_seq',
    ];
    for (const word of required) {
      expect(FORBIDDEN_WORDS).toContain(word);
    }
  });
});
