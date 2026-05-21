// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Per-spawn environment isolation. Provider subprocesses should not see
// unrelated API keys belonging to other providers — that prevents
// accidental cross-billing and reduces credential exposure.
//
// `buildIsolatedEnv(allowedKeys)` returns an env that contains:
//   - the always-allowed shell baseline (PATH/HOME/TMPDIR/TEMP/LANG/LC_*)
//   - exactly the requested provider-specific keys (only when set)
// All other env entries — including other providers' keys — are dropped.

const BASELINE_ALLOWLIST: ReadonlyArray<string> = Object.freeze([
  'PATH',
  'Path', // Windows env names are case-insensitive at the OS layer.
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'NODE_NO_WARNINGS',
]);

export interface BuildIsolatedEnvOptions {
  /** Source env (defaults to process.env). */
  readonly source?: Readonly<Record<string, string | undefined>>;
  /** Provider-specific keys to allow through. Order is not significant. */
  readonly allowKeys?: ReadonlyArray<string>;
  /**
   * Additional baseline keys to allow on top of the default shell baseline.
   * Use for niche cases (e.g. SSL_CERT_FILE for corporate trust stores).
   */
  readonly extraBaseline?: ReadonlyArray<string>;
}

export function buildIsolatedEnv(opts: BuildIsolatedEnvOptions = {}): Record<string, string> {
  const source = opts.source ?? (process.env as Record<string, string | undefined>);
  const allow = new Set<string>([
    ...BASELINE_ALLOWLIST,
    ...(opts.extraBaseline ?? []),
    ...(opts.allowKeys ?? []),
  ]);
  const out: Record<string, string> = {};
  for (const name of allow) {
    const v = source[name];
    if (typeof v === 'string' && v.length > 0) {
      out[name] = v;
    }
  }
  return out;
}
