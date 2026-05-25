// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan seed-demo` / `manthan reset-demo` — C4.4-E1.
//
// These commands DO NOT touch the substrate in-process. They POST to the
// running daemon's loopback-only demo routes, so the demo is seeded through
// the exact audited write paths the daemon owns (single source of truth).
// The daemon must be running (E3's `manthan start` brings it up first).

interface DemoEnvelope {
  readonly demo: {
    readonly workspace_id: string;
    readonly conversation_count: number;
    readonly fact_count: number;
  };
}

/** Daemon base URL from the same env the daemon's config reads. */
export function daemonBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.MANTHANOS_HOST?.trim() || '127.0.0.1';
  const portRaw = Number.parseInt(env.MANTHANOS_PORT ?? '', 10);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 7373;
  // The default host is IPv4; if an operator points at a bare IPv6 they can
  // bracket it themselves via MANTHANOS_HOST.
  return `http://${host}:${port}`;
}

async function postDemo(path: string): Promise<DemoEnvelope> {
  const url = `${daemonBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  } catch (cause) {
    throw new Error("Couldn't reach ManthanOS. Make sure it's running, then try again.", {
      cause,
    });
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { details?: string; error?: string };
      if (typeof body.details === 'string') detail = body.details;
      else if (typeof body.error === 'string') detail = body.error;
    } catch {
      // non-JSON body; keep the status-code detail.
    }
    throw new Error(`ManthanOS could not set up the demo (${detail}).`);
  }
  return (await res.json()) as DemoEnvelope;
}

function reportSuccess(verb: string, env: DemoEnvelope): void {
  const { conversation_count, fact_count } = env.demo;
  process.stdout.write(
    `${verb} the demo project — ${conversation_count} conversations, ${fact_count} findings.\n`,
  );
}

export async function runSeedDemo(): Promise<void> {
  try {
    reportSuccess('Set up', await postDemo('/api/v1/demo/seed'));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

export async function runResetDemo(): Promise<void> {
  try {
    reportSuccess('Reset', await postDemo('/api/v1/demo/reset'));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
