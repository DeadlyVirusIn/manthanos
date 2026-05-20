// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Replay screen — the substrate's trust mechanism, surfaced as a
// first-class UI screen rather than buried behind a forensic menu.
// The discriminated 4-status verification result is rendered inline.

import { ReplayError, type ReplayResult, replayRun } from '@manthanos/orchestrator';
import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useState } from 'react';
import { Frame } from '../components/frame.js';
import { type WorkspaceHandle, listRecentRunIds } from '../substrate.js';

export interface ReplayScreenProps {
  readonly workspace: WorkspaceHandle;
  readonly initialRunId: string | null;
  readonly onBack: () => void;
}

type Mode =
  | { readonly kind: 'choosing'; readonly runIds: readonly string[]; readonly cursor: number }
  | { readonly kind: 'verifying'; readonly runId: string }
  | { readonly kind: 'result'; readonly runId: string; readonly result: ReplayResult }
  | { readonly kind: 'error'; readonly runId: string; readonly message: string };

export function ReplayScreen({ workspace, initialRunId, onBack }: ReplayScreenProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'choosing', runIds: [], cursor: 0 });

  // Load run-id list for the chooser branch.
  useEffect(() => {
    if (mode.kind !== 'choosing' || mode.runIds.length > 0) return;
    let cancelled = false;
    listRecentRunIds(workspace, 20)
      .then((ids) => {
        if (cancelled) return;
        setMode({ kind: 'choosing', runIds: ids, cursor: 0 });
      })
      .catch(() => {
        if (cancelled) return;
        setMode({ kind: 'choosing', runIds: [], cursor: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [mode, workspace]);

  const verify = useCallback(
    (runId: string) => {
      setMode({ kind: 'verifying', runId });
      replayRun({ workspaceRoot: workspace.root, runId })
        .then((result) => setMode({ kind: 'result', runId, result }))
        .catch((e: unknown) => {
          const msg =
            e instanceof ReplayError ? e.message : e instanceof Error ? e.message : String(e);
          setMode({ kind: 'error', runId, message: msg });
        });
    },
    [workspace],
  );

  // Auto-verify once if the screen was opened with an initialRunId.
  // Stable across re-renders because `initialRunId` is a prop and
  // `verify` is `useCallback`-wrapped against `workspace`.
  useEffect(() => {
    if (initialRunId !== null) verify(initialRunId);
  }, [initialRunId, verify]);

  useInput((input, key) => {
    if (mode.kind === 'choosing') {
      if (key.escape || input === 'b') return onBack();
      if (mode.runIds.length === 0) return;
      if (key.downArrow || input === 'j') {
        setMode({ ...mode, cursor: Math.min(mode.runIds.length - 1, mode.cursor + 1) });
      } else if (key.upArrow || input === 'k') {
        setMode({ ...mode, cursor: Math.max(0, mode.cursor - 1) });
      } else if (key.return) {
        const runId = mode.runIds[mode.cursor];
        if (runId) verify(runId);
      }
    } else if (mode.kind === 'result' || mode.kind === 'error') {
      if (input === 'b' || key.escape || key.return) onBack();
    }
  });

  return (
    <Frame
      screen="Replay"
      workspaceRoot={workspace.root}
      cliCommand={
        mode.kind === 'choosing' ? 'manthan replay <runId>' : `manthan replay ${runIdOf(mode)}`
      }
      hints={hintsFor(mode)}
    >
      {renderMode(mode)}
    </Frame>
  );
}

function runIdOf(mode: Mode): string {
  if (mode.kind === 'choosing') return '<runId>';
  if (mode.kind === 'verifying') return mode.runId;
  if (mode.kind === 'result') return mode.runId;
  return mode.runId;
}

function hintsFor(mode: Mode): readonly string[] {
  if (mode.kind === 'choosing') return ['[↑/↓] move · [enter] verify · [esc] back'];
  if (mode.kind === 'verifying') return ['verifying…'];
  return ['[b] back · [enter] back'];
}

function renderMode(mode: Mode) {
  if (mode.kind === 'choosing') {
    if (mode.runIds.length === 0) {
      return <Text>No recorded runs yet. Run a plan first.</Text>;
    }
    return (
      <Box flexDirection="column">
        <Text>Recent runs:</Text>
        <Box marginTop={1} flexDirection="column">
          {mode.runIds.map((id, i) => (
            <Box key={id}>
              <Text color={i === mode.cursor ? 'cyan' : undefined}>
                {i === mode.cursor ? '› ' : '  '}
              </Text>
              <Text>{id}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }
  if (mode.kind === 'verifying') {
    return (
      <Box flexDirection="column">
        <Text>Verifying {mode.runId}…</Text>
        <Text color="gray">(integrity check of recorded artifacts; no model re-invocation)</Text>
      </Box>
    );
  }
  if (mode.kind === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">Replay failed for {mode.runId}:</Text>
        <Text>{mode.message}</Text>
      </Box>
    );
  }
  // result
  const v = mode.result.verification;
  const statusColor =
    v.status === 'verified'
      ? 'green'
      : v.status === 'legacy'
        ? 'yellow'
        : v.status === 'unverifiable'
          ? 'yellow'
          : 'red';
  return (
    <Box flexDirection="column">
      <Box>
        <Text>Status: </Text>
        <Text color={statusColor}>{v.status}</Text>
      </Box>
      <Text color="gray">run id: {mode.result.runId}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Checks:</Text>
        <Text color={v.checks.chain === 'ok' ? 'green' : 'red'}>
          {'  '}chain: {v.checks.chain}
        </Text>
        <Text
          color={
            v.checks.canonicalHash === 'ok'
              ? 'green'
              : v.checks.canonicalHash === 'mismatch'
                ? 'red'
                : 'yellow'
          }
        >
          {'  '}canonical_hash: {v.checks.canonicalHash}
        </Text>
        <Text
          color={
            v.checks.bundleHash === 'ok'
              ? 'green'
              : v.checks.bundleHash === 'mismatch'
                ? 'red'
                : 'yellow'
          }
        >
          {'  '}bundle_hash: {v.checks.bundleHash}
        </Text>
        <Text color={v.checks.blobs.failed === 0 && v.checks.blobs.missing === 0 ? 'green' : 'red'}>
          {'  '}blobs: checked={v.checks.blobs.checked} failed={v.checks.blobs.failed} missing=
          {v.checks.blobs.missing}
        </Text>
      </Box>
      {v.failures.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red">Failures:</Text>
          {v.failures.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordering stable
            <Text key={i}>
              {'  '}· {f.check}: {f.detail}
            </Text>
          ))}
        </Box>
      )}
      {v.legacy.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Legacy reasons:</Text>
          {v.legacy.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordering stable
            <Text key={i}>
              {'  '}· {l.check}: {l.detail}
            </Text>
          ))}
        </Box>
      )}
      {v.unverifiable.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Unverifiable reasons:</Text>
          {v.unverifiable.map((u, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordering stable
            <Text key={i}>
              {'  '}· {u.check}: {u.detail}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
