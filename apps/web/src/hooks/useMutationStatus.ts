// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useMutationStatus — Sprint 2 M2.5 C25.1.
//
// Thin wrapper over TanStack `useMutation` that centralises three
// concerns for the mutation framework:
//
//   1. Cache invalidation. The consumer declares which query-key
//      prefixes to invalidate via `invalidates(input, result)`; this
//      hook calls `queryClient.invalidateQueries` for each on success.
//   2. Success-message lifecycle. On success this hook records a
//      string that the consuming page renders via
//      `MutationSuccessMessage`. The page clears it via dismissSuccess.
//   3. Error categorisation. ApiError envelopes are mapped to one of
//      seven MutationErrorCategory values for MutationErrorBanner.
//
// Per F.3: the page calls `reset()` whenever a dialog opens, so a
// fresh attempt starts with a fresh slate.

import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { ApiError, type ApiErrorBody } from '../api/index.js';
import type { MutationErrorCategory } from '../i18n/labels.js';

export interface MutationConfig<TInput, TResult> {
  readonly mutationFn: (input: TInput) => Promise<TResult>;
  readonly invalidates: (input: TInput, result: TResult) => readonly QueryKey[];
  readonly successMessage: string | ((result: TResult) => string);
}

export interface MutationStatus<TInput, TResult> {
  readonly mutate: (input: TInput) => void;
  readonly mutateAsync: (input: TInput) => Promise<TResult>;
  readonly reset: () => void;
  readonly status: 'idle' | 'submitting' | 'success' | 'error';
  readonly isSubmitting: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly errorBody: ApiErrorBody | null;
  readonly errorCategory: MutationErrorCategory | null;
  readonly successMessage: string | null;
  readonly dismissSuccess: () => void;
}

const KNOWN_CATEGORIES: ReadonlySet<MutationErrorCategory> = new Set([
  'validation',
  'not_found',
  'invalid_lifecycle',
  'duplicate_fact',
  'invalid_tier_transition',
]);

function categoriseError(err: unknown): MutationErrorCategory {
  if (err instanceof ApiError) {
    const body = err.body;
    if (body !== null && body !== undefined && typeof body.error === 'string') {
      if ((KNOWN_CATEGORIES as ReadonlySet<string>).has(body.error)) {
        return body.error as MutationErrorCategory;
      }
    }
    return 'unknown';
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      msg.includes('failed to fetch') ||
      msg.includes('econnrefused')
    ) {
      return 'network';
    }
  }
  return 'unknown';
}

function extractErrorBody(err: unknown): ApiErrorBody | null {
  if (err instanceof ApiError && err.body !== null && err.body !== undefined) {
    return err.body;
  }
  return null;
}

function resolveErrorInstance(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === 'string' ? err : 'Unknown error');
}

export function useMutationStatus<TInput, TResult>(
  config: MutationConfig<TInput, TResult>,
): MutationStatus<TInput, TResult> {
  const client = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mutation = useMutation<TResult, unknown, TInput>({
    mutationFn: config.mutationFn,
    onSuccess: (result, input) => {
      for (const key of config.invalidates(input, result)) {
        client.invalidateQueries({ queryKey: key });
      }
      const msg =
        typeof config.successMessage === 'function'
          ? config.successMessage(result)
          : config.successMessage;
      setSuccessMessage(msg);
    },
  });

  // P0 fix (post-M2.5 review): double-submit guard. The ref latches
  // synchronously when a mutation starts, so a second click that
  // arrives before React commits `isSubmitting = true` is dropped
  // (or, for mutateAsync, deduplicated to the existing in-flight
  // promise). Cleared synchronously on settle so retries after error
  // and re-attempts after success both work.
  const inFlightRef = useRef<Promise<TResult> | null>(null);

  const guardedMutateAsync = useCallback(
    (input: TInput): Promise<TResult> => {
      if (inFlightRef.current !== null) return inFlightRef.current;
      const p = mutation.mutateAsync(input).finally(() => {
        inFlightRef.current = null;
      });
      inFlightRef.current = p;
      return p;
    },
    [mutation],
  );

  const guardedMutate = useCallback(
    (input: TInput): void => {
      if (inFlightRef.current !== null) return;
      // Promise rejection here is harmless — the error surfaces via
      // mutation.error (TanStack records it on the useMutation state).
      void guardedMutateAsync(input).catch(() => undefined);
    },
    [guardedMutateAsync],
  );

  const reset = useCallback(() => {
    mutation.reset();
    setSuccessMessage(null);
    inFlightRef.current = null;
  }, [mutation]);

  const dismissSuccess = useCallback(() => {
    setSuccessMessage(null);
  }, []);

  let status: MutationStatus<TInput, TResult>['status'];
  if (mutation.status === 'pending') status = 'submitting';
  else if (mutation.status === 'success') status = 'success';
  else if (mutation.status === 'error') status = 'error';
  else status = 'idle';

  const error = mutation.error === null ? null : resolveErrorInstance(mutation.error);
  const errorBody = mutation.error === null ? null : extractErrorBody(mutation.error);
  const errorCategory = mutation.error === null ? null : categoriseError(mutation.error);

  return {
    mutate: guardedMutate,
    mutateAsync: guardedMutateAsync,
    reset,
    status,
    isSubmitting: mutation.status === 'pending',
    isSuccess: mutation.status === 'success',
    isError: mutation.status === 'error',
    error,
    errorBody,
    errorCategory,
    successMessage,
    dismissSuccess,
  };
}
