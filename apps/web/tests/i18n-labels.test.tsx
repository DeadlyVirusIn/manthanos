// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Translation-map tests — Sprint 2 M1 C1.8.
//
// Coverage:
//   - per-enum exhaustiveness (every ALLOWED_X value has a label)
//   - non-empty labels (except `extractor: 'manual'` which is hidden)
//   - no forbidden substrate jargon in any label
//   - getEnumLabel happy paths for every kind
//   - unknown-value / unknown-kind protection (returns raw value, warns)
//   - audit_action payload parameterisation
//   - EnumLabel component renders (via renderToString — no jsdom needed)
//   - useEnumLabel hook returns the same string as getEnumLabel

import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALLOWED_AUDIENCE_FIT,
  ALLOWED_CANDIDATE_DUPLICATE_KIND,
  ALLOWED_CONFIDENCE_BUCKET,
  ALLOWED_CONVERSATION_OUTCOME,
  ALLOWED_CONVERSATION_TYPE,
  ALLOWED_EXTRACTION_REASON,
  ALLOWED_EXTRACTION_SOURCE,
  ALLOWED_EXTRACTOR,
  ALLOWED_FACT_EXTRACTION_STATUS,
  ALLOWED_FACT_TIER,
  ALLOWED_LIFECYCLE_STATE,
  ALLOWED_PROVENANCE_KIND,
  ALLOWED_WORKSPACE_STATUS,
} from '../src/api/types.js';
import { EnumLabel } from '../src/i18n/EnumLabel.js';
import {
  type AuditActionKey,
  type FactActionKey,
  type FieldLabelKey,
  LABEL_KINDS,
  type LabelKind,
  getEnumLabel,
} from '../src/i18n/labels.js';
import { useEnumLabel } from '../src/i18n/useEnumLabel.js';

// Forbidden substrate jargon that must NEVER appear in any rendered
// label. The lint scan (C1.9) will enforce a broader version of this
// across all JSX; here we assert the labels file itself doesn't leak.
const FORBIDDEN_SUBSTRINGS = [
  // Tier letters
  'T+1',
  'T-1',
  'T-2',
  // 'T0' substring would collide with words like "to" — skip; the lint scan
  // targets the bare token in JSX context.
  // Substrate lifecycle / column jargon
  'tombstoned',
  'tombstone_',
  'superseded',
  'corroborate',
  'corroborated',
  'corroboration',
  'provenance',
  'audit_seq',
  'audit_chain',
  'extractor',
  'verbatim',
  // Raw enum values that should always render via the friendly label
  'audience_fit',
  'conversation_type',
  'fact_extraction_status',
  'follow_up',
  // Workspace status raw
  'killed',
] as const;

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

// ─────────────────────────────────────────────────────────────────
// Exhaustiveness — every API enum value has a label
// ─────────────────────────────────────────────────────────────────

describe('Exhaustiveness (M1 C1.8)', () => {
  it('every audience_fit value has a non-empty label', () => {
    for (const v of ALLOWED_AUDIENCE_FIT) {
      const label = getEnumLabel('audience_fit', v);
      expect(label).toBeTruthy();
      expect(label).not.toBe(v);
    }
  });

  it('every conversation_type value has a non-empty label', () => {
    for (const v of ALLOWED_CONVERSATION_TYPE) {
      const label = getEnumLabel('conversation_type', v);
      expect(label).toBeTruthy();
      expect(label).not.toBe(v);
    }
  });

  it('every outcome value has a non-empty label', () => {
    for (const v of ALLOWED_CONVERSATION_OUTCOME) {
      const label = getEnumLabel('outcome', v);
      expect(label).toBeTruthy();
      expect(label).not.toBe(v);
    }
  });

  it('every fact_extraction_status value has a non-empty label', () => {
    for (const v of ALLOWED_FACT_EXTRACTION_STATUS) {
      const label = getEnumLabel('fact_extraction_status', v);
      expect(label).toBeTruthy();
      expect(label).not.toBe(v);
    }
  });

  it('every fact tier has a non-empty label', () => {
    for (const v of ALLOWED_FACT_TIER) {
      const label = getEnumLabel('tier', v);
      expect(label).toBeTruthy();
      expect(label).not.toBe(v);
    }
  });

  it('every workspace_status value has a non-empty label (and `killed` → `Archived`)', () => {
    for (const v of ALLOWED_WORKSPACE_STATUS) {
      const label = getEnumLabel('workspace_status', v);
      expect(label).toBeTruthy();
    }
    // Substrate's 'killed' must translate to 'Archived' — never leaks raw.
    expect(getEnumLabel('workspace_status', 'killed')).toBe('Archived');
  });

  it('every lifecycle_state value has a non-empty label', () => {
    for (const v of ALLOWED_LIFECYCLE_STATE) {
      const label = getEnumLabel('lifecycle_state', v);
      expect(label).toBeTruthy();
      expect(label).not.toBe(v);
    }
  });

  it('every provenance_kind value has a non-empty label', () => {
    for (const v of ALLOWED_PROVENANCE_KIND) {
      const label = getEnumLabel('provenance_kind', v);
      expect(label).toBeTruthy();
      expect(label).not.toBe(v);
    }
  });

  it('extractor=manual returns the empty string (hidden in UI by design)', () => {
    for (const v of ALLOWED_EXTRACTOR) {
      const label = getEnumLabel('extractor', v);
      // Deliberate empty — the extractor enum is hidden in M1 (journey review §1.4).
      expect(label).toBe('');
    }
  });

  it('every field_label key has a non-empty label', () => {
    const keys: FieldLabelKey[] = [
      'area',
      'statement',
      'verbatim_quotes',
      'summary',
      'person_name',
      'occurred_at',
      'tombstone_reason',
      'contested_reason',
    ];
    for (const k of keys) {
      const label = getEnumLabel('field_label', k);
      expect(label).toBeTruthy();
      expect(label).not.toBe(k);
    }
    // The single highest-leverage rename in Sprint 2 (journey review §3.5).
    expect(getEnumLabel('field_label', 'area')).toBe("What's this about?");
  });

  it('every fact_action key has a non-empty label using the "follow-up" rename', () => {
    const keys: FactActionKey[] = [
      'promote',
      'demote',
      'revise',
      'contest',
      'uncontest',
      'tombstone',
    ];
    for (const k of keys) {
      const label = getEnumLabel('fact_action', k);
      expect(label).toBeTruthy();
    }
    // C4.1.1 D9 — follow-up reframed as "double-check"; "contest" /
    // "uncontest" never appear in UI.
    expect(getEnumLabel('fact_action', 'contest')).toBe('Mark to double-check');
    expect(getEnumLabel('fact_action', 'uncontest')).toBe('Mark as checked');
  });

  it('every audit_action key has a non-empty label (some are payload-parameterised)', () => {
    const keys: AuditActionKey[] = [
      'workspace.create',
      'workspace.update',
      'conversation.create',
      'conversation.update',
      'conversation.tombstone',
      'conversation.skip_extraction',
      'fact.create',
      'fact.update',
      'fact.revise',
      'fact.promote',
      'fact.demote',
      'fact.contest',
      'fact.uncontest',
      'fact.corroborate',
      'fact.tombstone',
    ];
    for (const k of keys) {
      const label = getEnumLabel('audit_action', k, {
        person_name: 'Alex',
        previous_person_name: 'Alex',
        statement: 'sample',
        previous_statement: 'older sample',
      });
      expect(label).toBeTruthy();
    }
  });

  it('LABEL_KINDS enumerates every registered kind', () => {
    const expected: readonly LabelKind[] = [
      'audience_fit',
      'conversation_type',
      'outcome',
      'fact_extraction_status',
      'tier',
      'workspace_status',
      'lifecycle_state',
      'provenance_kind',
      'extractor',
      'confidence_bucket',
      'extraction_reason',
      'extraction_source',
      'duplicate_warning',
      'field_label',
      'fact_action',
      'audit_action',
      'mutation_error',
    ];
    expect([...LABEL_KINDS].sort()).toEqual([...expected].sort());
  });
});

// ─────────────────────────────────────────────────────────────────
// Forbidden substrate jargon never appears in any label
// ─────────────────────────────────────────────────────────────────

describe('No raw substrate jargon (M1 C1.8)', () => {
  it('no label across any enum contains forbidden substrings', () => {
    const offenders: Array<{ kind: LabelKind; value: string; label: string; bad: string }> = [];

    const enumChecks: Array<[LabelKind, readonly string[]]> = [
      ['audience_fit', ALLOWED_AUDIENCE_FIT],
      ['conversation_type', ALLOWED_CONVERSATION_TYPE],
      ['outcome', ALLOWED_CONVERSATION_OUTCOME],
      ['fact_extraction_status', ALLOWED_FACT_EXTRACTION_STATUS],
      ['tier', ALLOWED_FACT_TIER],
      ['workspace_status', ALLOWED_WORKSPACE_STATUS],
      ['lifecycle_state', ALLOWED_LIFECYCLE_STATE],
      ['provenance_kind', ALLOWED_PROVENANCE_KIND],
      ['extractor', ALLOWED_EXTRACTOR],
      ['confidence_bucket', ALLOWED_CONFIDENCE_BUCKET],
      ['extraction_reason', ALLOWED_EXTRACTION_REASON],
      ['extraction_source', ALLOWED_EXTRACTION_SOURCE],
      ['duplicate_warning', ALLOWED_CANDIDATE_DUPLICATE_KIND],
    ];

    for (const [kind, values] of enumChecks) {
      for (const v of values) {
        const label = getEnumLabel(kind, v);
        for (const bad of FORBIDDEN_SUBSTRINGS) {
          if (label.includes(bad)) {
            offenders.push({ kind, value: v, label, bad });
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('audit_action labels do not contain forbidden substrings (for a representative payload)', () => {
    const payload = {
      person_name: 'Alex',
      previous_person_name: 'Alex',
      statement: 'they use Toggl',
      previous_statement: 'they use Toggl maybe',
    };
    const offenders: Array<{ action: string; label: string; bad: string }> = [];
    const actions: readonly AuditActionKey[] = [
      'workspace.create',
      'workspace.update',
      'conversation.create',
      'conversation.update',
      'conversation.tombstone',
      'conversation.skip_extraction',
      'fact.create',
      'fact.update',
      'fact.revise',
      'fact.promote',
      'fact.demote',
      'fact.contest',
      'fact.uncontest',
      'fact.corroborate',
      'fact.tombstone',
    ];
    for (const action of actions) {
      const label = getEnumLabel('audit_action', action, payload);
      for (const bad of FORBIDDEN_SUBSTRINGS) {
        if (label.includes(bad)) {
          offenders.push({ action, label, bad });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────
// Unknown-value / unknown-kind protection
// ─────────────────────────────────────────────────────────────────

describe('Unknown input protection (M1 C1.8)', () => {
  it('unknown value returns the raw value and warns in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = getEnumLabel('audience_fit', 'definitely-not-a-real-value');
    expect(out).toBe('definitely-not-a-real-value');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('Unknown audience_fit value');
  });

  it('unknown kind returns the raw value and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Casting through unknown to bypass the type check intentionally —
    // simulating bad runtime input.
    const out = getEnumLabel('not_a_kind' as unknown as LabelKind, 'foo');
    expect(out).toBe('foo');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('Unknown label kind');
  });
});

// ─────────────────────────────────────────────────────────────────
// audit_action payload parameterisation
// ─────────────────────────────────────────────────────────────────

describe('audit_action payload parameterisation (M1 C1.8)', () => {
  it('conversation.create interpolates person_name', () => {
    const label = getEnumLabel('audit_action', 'conversation.create', {
      person_name: 'Maya',
    });
    expect(label).toBe('Captured a conversation with Maya.');
  });

  it('conversation.create with missing payload uses the fallback', () => {
    const label = getEnumLabel('audit_action', 'conversation.create', {});
    expect(label).toBe('Captured a conversation with that person.');
  });

  it('fact.create distinguishes direct creates from extractions', () => {
    const direct = getEnumLabel('audit_action', 'fact.create', { statement: 's' });
    const fromExtraction = getEnumLabel('audit_action', 'fact.create', {
      statement: 's',
      extraction_source: { conversation_id: 'conv-x' },
    });
    expect(direct).toBe('Added a finding: "s".');
    expect(fromExtraction).toBe('Pulled a finding from a conversation: "s".');
  });

  it('fact.contest renders the double-check rename', () => {
    expect(
      getEnumLabel('audit_action', 'fact.contest', {
        statement: 'they use Toggl',
      }),
    ).toBe('Marked "they use Toggl" to double-check.');
  });

  it('fact.uncontest renders the double-check rename', () => {
    expect(getEnumLabel('audit_action', 'fact.uncontest', { statement: 'they use Toggl' })).toBe(
      'Checked "they use Toggl".',
    );
  });

  it('plain-string audit actions ignore the payload', () => {
    expect(getEnumLabel('audit_action', 'workspace.create', { person_name: 'X' })).toBe(
      'Started this project.',
    );
  });

  it('unknown audit action returns the raw action string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(getEnumLabel('audit_action', 'fact.refactor')).toBe('fact.refactor');
    expect(warn).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────
// EnumLabel component (via react-dom/server — no jsdom)
// ─────────────────────────────────────────────────────────────────

describe('<EnumLabel /> (M1 C1.8)', () => {
  it('renders the translated label as plain text', () => {
    const html = renderToString(<EnumLabel kind="audience_fit" value="target" />);
    expect(html).toBe('Exact match');
  });

  it('renders the tier visual-name (not the substrate letter)', () => {
    expect(renderToString(<EnumLabel kind="tier" value="T+1" />)).toBe('Well-supported');
    expect(renderToString(<EnumLabel kind="tier" value="T0" />)).toBe('Noted');
    expect(renderToString(<EnumLabel kind="tier" value="T-1" />)).toBe('Shaky');
    expect(renderToString(<EnumLabel kind="tier" value="T-2" />)).toBe('Doubted');
  });

  it('renders an audit-action label with payload interpolation', () => {
    const html = renderToString(
      <EnumLabel
        kind="audit_action"
        value="conversation.create"
        payload={{ person_name: 'Cara' }}
      />,
    );
    expect(html).toBe('Captured a conversation with Cara.');
  });

  it('renders empty string for hidden extractor (no DOM bytes)', () => {
    const html = renderToString(<EnumLabel kind="extractor" value="manual" />);
    expect(html).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────
// useEnumLabel hook (via renderToString helper component)
// ─────────────────────────────────────────────────────────────────

function HookProbe({
  kind,
  value,
  payload,
}: {
  kind: LabelKind;
  value: string;
  payload?: Record<string, unknown>;
}): JSX.Element {
  const label = useEnumLabel(kind, value, payload);
  return <span data-label={label}>{label}</span>;
}

describe('useEnumLabel (M1 C1.8)', () => {
  it('returns the same string as getEnumLabel for an enum value', () => {
    const html = renderToString(<HookProbe kind="audience_fit" value="adjacent" />);
    expect(html).toContain('Adjacent');
  });

  it('returns the same string as getEnumLabel for an audit action with payload', () => {
    const html = renderToString(
      <HookProbe
        kind="audit_action"
        value="conversation.tombstone"
        payload={{ previous_person_name: 'Sam' }}
      />,
    );
    expect(html).toContain('Erased the conversation with Sam.');
  });
});
