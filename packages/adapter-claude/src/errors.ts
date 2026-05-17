// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Map Anthropic SDK errors to the canonical AdapterErrorCode taxonomy
// per ADAPTER_SPEC.md §8.

import { AdapterError, type AdapterErrorCode } from '@manthanos/adapters-sdk';

interface SdkErrorLike {
  readonly status?: number;
  readonly message?: string;
  readonly headers?: Record<string, string | undefined>;
  readonly error?: { type?: string; message?: string };
  readonly name?: string;
}

const RECOVERABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EPIPE',
]);

function mapByStatus(
  status: number,
  body: { type?: string; message?: string } | undefined,
): { code: AdapterErrorCode; retriable: boolean } | null {
  switch (status) {
    case 400:
      // Anthropic uses 400 for context_window overflow.
      if ((body?.type ?? '').includes('context_window')) {
        return { code: 'context_window', retriable: false };
      }
      return { code: 'invalid_request', retriable: false };
    case 401:
    case 403:
      return { code: 'auth', retriable: false };
    case 422:
      return { code: 'invalid_request', retriable: false };
    case 429:
      return { code: 'rate_limited', retriable: true };
    case 500:
    case 502:
    case 504:
      return { code: 'overloaded', retriable: true };
    case 503:
      return { code: 'overloaded', retriable: true };
    default:
      return null;
  }
}

function parseRetryAfter(headers?: Record<string, string | undefined>): number | undefined {
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (!raw) return undefined;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.round(n * 1000);
  return undefined;
}

export function mapAnthropicError(err: unknown): AdapterError {
  if (err instanceof AdapterError) return err;

  // AbortError — name comes from Node's AbortController.
  const e = err as SdkErrorLike & { code?: string };
  if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') {
    return new AdapterError({
      code: 'cancelled',
      message: 'request aborted',
      retriable: false,
      cause: err,
    });
  }

  // Node network errors.
  if (e?.code && RECOVERABLE_NETWORK_CODES.has(e.code)) {
    return new AdapterError({
      code: 'network',
      message: `network error: ${e.code}`,
      retriable: true,
      cause: err,
    });
  }

  // SDK-style errors with status + headers.
  if (typeof e?.status === 'number') {
    const mapped = mapByStatus(e.status, e.error);
    if (mapped) {
      return new AdapterError({
        code: mapped.code,
        message: e.error?.message ?? e.message ?? `http ${e.status}`,
        retriable: mapped.retriable,
        retryAfterMs: parseRetryAfter(e.headers),
        cause: err,
      });
    }
  }

  // Refusal / content_filter from the body type even without an http status.
  if (e?.error?.type === 'permission_error') {
    return new AdapterError({
      code: 'content_filter',
      message: e.error?.message ?? 'permission denied by provider',
      retriable: false,
      cause: err,
    });
  }

  // Unknown — internal.
  return new AdapterError({
    code: 'internal',
    message: e?.message ?? 'unknown adapter error',
    retriable: false,
    cause: err,
  });
}
