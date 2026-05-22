// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Daemon configuration loaded from environment.
//
// Validation is strict — an invalid value throws at load time
// rather than producing a misconfigured daemon. The daemon never
// silently coerces a bad port or log level to a default.

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly logLevel: LogLevel;
  readonly workspaceRoot: string;
}

const DEFAULT_PORT = 7373;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

const VALID_LOG_LEVELS: ReadonlySet<LogLevel> = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.MANTHANOS_PORT),
    host: env.MANTHANOS_HOST?.trim() || DEFAULT_HOST,
    logLevel: parseLogLevel(env.MANTHANOS_LOG_LEVEL),
    workspaceRoot: parseWorkspaceRoot(env),
  };
}

function parseWorkspaceRoot(env: NodeJS.ProcessEnv): string {
  const explicit = env.MANTHANOS_WORKSPACE_ROOT?.trim();
  if (explicit) {
    return explicit;
  }
  const dataDir = env.MANTHANOS_DATA_DIR?.trim();
  const home = env.HOME ?? env.USERPROFILE;
  const base = dataDir || (home ? `${home}/.manthanos` : '.manthanos');
  return `${base}/workspaces/default`;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_PORT;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || String(n) !== raw.trim()) {
    throw new Error(`MANTHANOS_PORT must be an integer; received ${JSON.stringify(raw)}`);
  }
  if (n < 1 || n > 65535) {
    throw new Error(`MANTHANOS_PORT must be between 1 and 65535; received ${n}`);
  }
  return n;
}

function parseLogLevel(raw: string | undefined): LogLevel {
  if (raw === undefined || raw === '') {
    return DEFAULT_LOG_LEVEL;
  }
  const lower = raw.toLowerCase() as LogLevel;
  if (!VALID_LOG_LEVELS.has(lower)) {
    throw new Error(
      `MANTHANOS_LOG_LEVEL must be one of ${[...VALID_LOG_LEVELS].join(', ')}; received ${JSON.stringify(raw)}`,
    );
  }
  return lower;
}
