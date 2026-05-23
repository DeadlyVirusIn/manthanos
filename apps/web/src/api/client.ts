// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Centralised API client for the ManthanOS web app. Sprint 2 M1 C1.7.
//
// Design:
//   - Thin wrapper around fetch(). No third-party HTTP client.
//   - All non-2xx responses become ApiError with the parsed body
//     attached as `body` (so callers can inspect the error shape
//     without re-parsing).
//   - The dev-mode Vite proxy (configured in C1.6's vite.config.ts)
//     forwards /api/* to the daemon. In dev, the default base URL
//     of "" works: fetch('/api/v1/...') hits the proxy.
//   - In production builds, callers can pass `baseUrl` (or read
//     `import.meta.env.VITE_API_BASE_URL`) to point at a different
//     origin. The default API client uses an empty base URL.

import type { ApiErrorBody } from './types.js';

export interface ApiClientOptions {
  /** Base URL prefix prepended to every request path. Default ''. */
  readonly baseUrl?: string;
  /**
   * Override the fetch implementation. Defaults to global fetch.
   * Tests inject a mock here; production never sets it.
   */
  readonly fetch?: typeof fetch;
}

/** Error thrown by ApiClient methods on any non-2xx response or
 *  on transport / parse failure. `status` is `0` when fetch itself
 *  threw (e.g. network down); `body` is the parsed JSON body when
 *  the server responded with a JSON error envelope, or `null`
 *  otherwise. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;
  readonly path: string;

  constructor(status: number, message: string, path: string, body: ApiErrorBody | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

export class ApiClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? '';
    // Bind to avoid `Illegal invocation` on some platforms.
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Compose the full URL for a path like "/api/v1/workspaces". */
  resolve(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  /** Fetch a non-JSON response (e.g. Markdown export). Returns text. */
  async getText(path: string): Promise<string> {
    const url = this.resolve(path);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: 'GET' });
    } catch (cause) {
      throw new ApiError(
        0,
        `network error: ${cause instanceof Error ? cause.message : String(cause)}`,
        path,
        null,
      );
    }
    const text = await response.text();
    if (!response.ok) {
      const body = tryParseJson(text);
      throw new ApiError(response.status, `${response.status} ${response.statusText}`, path, body);
    }
    return text;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = this.resolve(path);
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (cause) {
      throw new ApiError(
        0,
        `network error: ${cause instanceof Error ? cause.message : String(cause)}`,
        path,
        null,
      );
    }

    // 204 No Content has no body — return null typed as T.
    if (response.status === 204) {
      return null as unknown as T;
    }

    const text = await response.text();
    const parsed = text === '' ? null : tryParseJson(text);

    if (!response.ok) {
      throw new ApiError(
        response.status,
        `${response.status} ${response.statusText}`,
        path,
        parsed,
      );
    }

    return parsed as T;
  }
}

function tryParseJson(text: string): ApiErrorBody | null {
  try {
    return JSON.parse(text) as ApiErrorBody;
  } catch {
    return null;
  }
}

/** Convenience constructor matching the rest of the codebase's style. */
export function createApiClient(opts: ApiClientOptions = {}): ApiClient {
  return new ApiClient(opts);
}

/** Default singleton client used by the per-entity modules. Browser
 *  consumers can swap this out for testing via dependency injection
 *  (pass an ApiClient explicitly to each call). */
export const defaultApiClient = createApiClient();
