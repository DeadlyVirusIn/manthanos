// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Secret-pattern redactor per SAFETY_MODEL.md §8.
//
// Applied to model `text` and `tool_result.content` BEFORE persisting
// to audit blobs. Replaces matched patterns with [REDACTED:<name>:len=<n>].

export interface SecretPattern {
  readonly name: string;
  readonly regex: RegExp;
}

// The patterns below are deliberately conservative. We over-match by
// design — false positives on a `text` field are acceptable; secret
// leakage is not. A user can disable a specific pattern via config
// (Phase 1+).
export const DEFAULT_SECRET_PATTERNS: readonly SecretPattern[] = Object.freeze([
  // Anthropic keys
  { name: 'anthropic_api_key', regex: /sk-ant-(?:api03|admin)-[A-Za-z0-9_-]{20,200}/g },
  // OpenAI keys (legacy + project)
  { name: 'openai_project_key', regex: /sk-proj-[A-Za-z0-9_-]{20,200}/g },
  { name: 'openai_user_key', regex: /sk-[A-Za-z0-9]{20,200}/g },
  // Google AI / GCP
  { name: 'google_ai_key', regex: /AIza[0-9A-Za-z_-]{35}/g },
  // GitHub tokens
  { name: 'github_token', regex: /gh[pousr]_[A-Za-z0-9]{36,255}/g },
  // Slack tokens
  { name: 'slack_token', regex: /xox[bpsoa]-[A-Za-z0-9-]{10,200}/g },
  // AWS access keys
  { name: 'aws_access_key_id', regex: /AKIA[0-9A-Z]{16}/g },
  // Stripe
  { name: 'stripe_secret', regex: /sk_(?:test|live)_[A-Za-z0-9]{24,99}/g },
  // PEM-encoded private keys (header-anchored — high specificity)
  {
    name: 'pem_private_key',
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
]);

export interface RedactionResult {
  readonly text: string;
  readonly redactions: ReadonlyArray<{ pattern: string; count: number }>;
}

export function redactSecrets(
  input: string,
  patterns: readonly SecretPattern[] = DEFAULT_SECRET_PATTERNS,
): RedactionResult {
  const counts = new Map<string, number>();
  let out = input;
  for (const p of patterns) {
    // Reset regex.lastIndex via fresh exec; with /g flag we use String#replace.
    out = out.replace(p.regex, (match) => {
      counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
      return `[REDACTED:${p.name}:len=${match.length}]`;
    });
  }
  const redactions = Array.from(counts.entries())
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => (a.pattern < b.pattern ? -1 : 1));
  return { text: out, redactions };
}
