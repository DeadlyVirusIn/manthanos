// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Review Facts screen. Lists the T0 quarantine queue, accepts an
// explicit per-fact action (promote/skip/demote), commits via the
// existing brain-trust API. The screen is the spatial equivalent of
// `manthan brain review` interactive mode.

import { hostname, userInfo } from 'node:os';
import { AsyncMutex, openDb } from '@manthanos/memory';
import { BrainTrustError, demoteFact, promoteFact } from '@manthanos/orchestrator';
import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useState } from 'react';
import { Frame } from '../components/frame.js';
import { type ReviewCandidate, type WorkspaceHandle, loadReviewQueue } from '../substrate.js';

export interface ReviewScreenProps {
  readonly workspace: WorkspaceHandle;
  readonly onBack: () => void;
}

type Action = 'promote' | 'skip' | 'demote';

interface State {
  readonly candidates: readonly ReviewCandidate[];
  readonly cursor: number;
  readonly selections: ReadonlyMap<string, Action>;
  readonly status: 'loading' | 'ready' | 'applying' | 'done' | 'error';
  readonly statusMsg: string;
  readonly applyResult: {
    readonly promoted: number;
    readonly demoted: number;
    readonly errors: number;
  } | null;
}

const INITIAL: State = {
  candidates: [],
  cursor: 0,
  selections: new Map(),
  status: 'loading',
  statusMsg: 'loading T0 queue…',
  applyResult: null,
};

function approver(): string {
  try {
    return `${userInfo().username}@${hostname()} (manthan-ui)`;
  } catch {
    return `unknown@${hostname()} (manthan-ui)`;
  }
}

export function ReviewScreen({ workspace, onBack }: ReviewScreenProps) {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    loadReviewQueue(workspace, 50)
      .then((candidates) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          candidates,
          status: 'ready',
          statusMsg: candidates.length === 0 ? 'review queue is empty' : '',
        }));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          status: 'error',
          statusMsg: e instanceof Error ? e.message : String(e),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const apply = useCallback(async () => {
    setState((s) => ({ ...s, status: 'applying', statusMsg: 'applying selections…' }));
    const m = await openDb({ dbPath: workspace.dbPath });
    let promoted = 0;
    let demoted = 0;
    let errors = 0;
    try {
      const wsRow = m.handle
        .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
        .get(workspace.root) as { id: string } | undefined;
      if (!wsRow) throw new Error(`workspace row missing for ${workspace.root}`);
      const ctx = {
        db: m.handle,
        blobs: workspace.blobs,
        jsonlPath: workspace.jsonlPath,
        mutex: new AsyncMutex(),
      };
      for (const [factId, action] of state.selections) {
        try {
          if (action === 'promote') {
            await promoteFact({
              ctx,
              db: m.handle,
              workspaceId: wsRow.id,
              factId,
              targetTier: 'T+1',
              approver: approver(),
            });
            promoted += 1;
          } else if (action === 'demote') {
            await demoteFact({
              ctx,
              db: m.handle,
              workspaceId: wsRow.id,
              factId,
              targetTier: 'T-1',
              approver: approver(),
              reason: 'manthan-ui: demoted via review screen',
            });
            demoted += 1;
          }
          // 'skip' is a no-op
        } catch (e) {
          errors += 1;
          if (e instanceof BrainTrustError) {
            setState((s) => ({ ...s, statusMsg: `${e.code}: ${e.message}` }));
          }
        }
      }
    } finally {
      m.close();
    }
    setState((s) => ({
      ...s,
      status: 'done',
      statusMsg: '',
      applyResult: { promoted, demoted, errors },
    }));
  }, [workspace, state.selections]);

  useInput((input, key) => {
    if (state.status === 'loading' || state.status === 'applying') return;
    if (state.status === 'done' || state.status === 'error') {
      if (input === 'b' || key.escape || key.return) onBack();
      return;
    }
    // 'ready' state
    if (key.escape) return onBack();
    if (key.downArrow || input === 'j') {
      setState((s) => ({ ...s, cursor: Math.min(s.candidates.length - 1, s.cursor + 1) }));
    } else if (key.upArrow || input === 'k') {
      setState((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }));
    } else if (input === 'p' || input === 's' || input === 'd') {
      setState((s) => {
        const c = s.candidates[s.cursor];
        if (!c) return s;
        const next = new Map(s.selections);
        const action: Action = input === 'p' ? 'promote' : input === 's' ? 'skip' : 'demote';
        next.set(c.factId, action);
        const newCursor = Math.min(s.candidates.length - 1, s.cursor + 1);
        return { ...s, selections: next, cursor: newCursor };
      });
    } else if (input === 'u') {
      setState((s) => {
        const c = s.candidates[s.cursor];
        if (!c) return s;
        const next = new Map(s.selections);
        next.delete(c.factId);
        return { ...s, selections: next };
      });
    } else if (input === 'c') {
      if (state.selections.size > 0) {
        void apply();
      }
    }
  });

  return (
    <Frame
      screen="Review Facts"
      workspaceRoot={workspace.root}
      cliCommand="manthan brain review"
      hints={renderHints(state)}
    >
      {renderBody(state)}
    </Frame>
  );
}

function renderHints(state: State): readonly string[] {
  if (state.status === 'loading') return ['loading… · [n] next'];
  if (state.status === 'applying') return ['applying selections… · [n] next'];
  if (state.status === 'done') return ['[b] back · [enter] back · [n] next'];
  if (state.status === 'error') return ['[b] back · [enter] back · [n] next'];
  if (state.candidates.length === 0) return ['[b] back · [n] next'];
  return [
    '[↑/↓] move · [p] promote · [s] skip · [d] demote · [u] undo · [c] commit · [esc] back · [n] next',
  ];
}

function renderBody(state: State) {
  if (state.status === 'loading') return <Text color="gray">{state.statusMsg}</Text>;
  if (state.status === 'error')
    return (
      <Box flexDirection="column">
        <Text color="red">error: {state.statusMsg}</Text>
      </Box>
    );
  if (state.status === 'applying') return <Text color="gray">{state.statusMsg}</Text>;
  if (state.status === 'done' && state.applyResult) {
    const r = state.applyResult;
    return (
      <Box flexDirection="column">
        <Text color="green">Applied.</Text>
        <Text>
          promoted: {r.promoted} · demoted: {r.demoted} · errors: {r.errors}
        </Text>
        {state.statusMsg && <Text color="yellow">{state.statusMsg}</Text>}
      </Box>
    );
  }
  if (state.candidates.length === 0)
    return <Text>Review queue is empty. Run a plan to surface new facts.</Text>;

  return (
    <Box flexDirection="column">
      <Text>
        {state.candidates.length} fact{state.candidates.length === 1 ? '' : 's'} pending.{' '}
        {state.selections.size} marked.
      </Text>
      <Box marginTop={1} flexDirection="column">
        {state.candidates.map((c, i) => {
          const action = state.selections.get(c.factId);
          const isCursor = i === state.cursor;
          const prefix = isCursor ? '› ' : '  ';
          const tag = !action
            ? '       '
            : action === 'promote'
              ? '[promote]'
              : action === 'skip'
                ? '[skip]   '
                : '[demote] ';
          const color = !action
            ? undefined
            : action === 'promote'
              ? 'green'
              : action === 'skip'
                ? 'gray'
                : 'yellow';
          return (
            <Box key={c.factId} flexDirection="column">
              <Box>
                <Text color={isCursor ? 'cyan' : undefined}>{prefix}</Text>
                <Text color={color}>{tag}</Text>
                <Text color="gray"> {c.area}</Text>
                <Text color="gray"> · age={c.ageDays}d</Text>
                <Text color="gray"> · conf={c.confidence.toFixed(2)}</Text>
              </Box>
              <Text color={isCursor ? undefined : 'gray'}>
                {'      '}
                {c.statement}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
