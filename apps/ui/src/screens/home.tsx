// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Home / Next screen — Phase 0 §1 surface #1 + surface #5.
//
// Renders the substrate's WorkflowState the same way `manthan next`
// does on the CLI. The Home and Next surfaces share this component;
// the difference is only the Frame label and the entry point. Same
// data, two access patterns — see Phase 0 contract §1.
//
// Phase 0 §6 required affordances satisfied here:
//   - CLI equivalent: rendered via Frame, always "manthan next"
//   - Replay path: keyboard hint exposes [v] (active once the Replay
//     screen lands in commit 3)
//   - Current operation: the "inspecting workspace state…" loading line
//   - Audit-visible action: this screen is read-only, so no audit
//     events are produced — exempt per Phase 0 §6

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Frame } from '../components/frame.js';
import { type WorkflowState, inspectWorkflowState } from '../substrate.js';

export interface HomeScreenProps {
  readonly workspaceRoot: string;
  readonly screenLabel: 'Home' | 'Next';
  readonly onRunPlan?: () => void;
  readonly onReview?: () => void;
  readonly onReplay?: () => void;
  readonly onExit: () => void;
}

export function HomeScreen({
  workspaceRoot,
  screenLabel,
  onRunPlan,
  onReview,
  onReplay,
  onExit,
}: HomeScreenProps) {
  const [state, setState] = useState<
    WorkflowState | { kind: 'loading' } | { kind: 'error'; msg: string }
  >({
    kind: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    inspectWorkflowState(workspaceRoot)
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ kind: 'error', msg: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot]);

  useInput((input) => {
    if (input === 'p' && onRunPlan) onRunPlan();
    else if (input === 'r' && onReview) onReview();
    else if (input === 'v' && onReplay) onReplay();
    else if (input === 'q') onExit();
  });

  const body = renderState(state);
  const hints = buildHints({ onRunPlan, onReview, onReplay });
  return (
    <Frame
      screen={screenLabel}
      workspaceRoot={workspaceRoot}
      cliCommand="manthan next"
      hints={hints}
    >
      {body}
    </Frame>
  );
}

function buildHints(opts: {
  onRunPlan?: () => void;
  onReview?: () => void;
  onReplay?: () => void;
}): readonly string[] {
  const parts: string[] = [];
  if (opts.onRunPlan) parts.push('[p] run plan');
  if (opts.onReview) parts.push('[r] review facts');
  if (opts.onReplay) parts.push('[v] replay');
  parts.push('[q] drop to CLI');
  return [parts.join('   ')];
}

function renderState(
  state: WorkflowState | { kind: 'loading' } | { kind: 'error'; msg: string },
): React.ReactNode {
  if (state.kind === 'loading') return <Text color="gray">inspecting workspace state…</Text>;
  if (state.kind === 'error')
    return (
      <Box flexDirection="column">
        <Text color="red">workspace inspection failed:</Text>
        <Text>{state.msg}</Text>
      </Box>
    );
  switch (state.kind) {
    case 'no_workspace':
      return (
        <Box flexDirection="column">
          <Text color="yellow">No ManthanOS workspace at this path.</Text>
          <Text color="gray">{state.cwd}</Text>
          <Box marginTop={1}>
            <Text>Initialize the workspace from the CLI: </Text>
            <Text color="cyan">manthan init</Text>
          </Box>
        </Box>
      );
    case 'workspace_row_missing':
      return (
        <Box flexDirection="column">
          <Text color="yellow">Workspace partially initialized (internal row missing).</Text>
          <Box marginTop={1}>
            <Text>Re-initialize from the CLI: </Text>
            <Text color="cyan">manthan init --force</Text>
          </Box>
        </Box>
      );
    case 'recovery_not_clean':
      return (
        <Box flexDirection="column">
          <Text color="red">
            Audit chain status: {state.recoveryStatus} ({state.findingCount} findings)
          </Text>
          <Box marginTop={1}>
            <Text>Inspect from CLI: </Text>
            <Text color="cyan">cat .manthan/audit-corruption.log</Text>
          </Box>
          <Box marginTop={1}>
            <Text>Then: </Text>
            <Text color="cyan">manthan doctor</Text>
          </Box>
        </Box>
      );
    case 'last_plan_failed':
      return (
        <Box flexDirection="column">
          <Text color="yellow">Last plan run did not finish: status={state.status}</Text>
          <Text color="gray">run id: {state.runId}</Text>
          <Box marginTop={1}>
            <Text>Diagnose: </Text>
            <Text color="cyan">manthan doctor</Text>
          </Box>
        </Box>
      );
    case 'no_plans_yet':
      return (
        <Box flexDirection="column">
          <Text>Workspace initialized. No plans run yet.</Text>
          <Box marginTop={1}>
            <Text color="cyan">[p]</Text>
            <Text> to run your first plan.</Text>
          </Box>
        </Box>
      );
    case 'has_quarantine': {
      const factWord = state.quarantineCount === 1 ? 'fact' : 'facts';
      return (
        <Box flexDirection="column">
          <Text>
            {state.quarantineCount} new {factWord} captured for review (T0 quarantine).
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">[r]</Text>
            <Text> to review the queue.</Text>
          </Box>
        </Box>
      );
    }
    case 'idle_with_trust': {
      const factWord = state.trustedCount === 1 ? 'fact' : 'facts';
      return (
        <Box flexDirection="column">
          <Text>
            Workspace healthy. {state.trustedCount} trusted {factWord} in continuity.
          </Text>
          <Text color="gray">Review queue empty.</Text>
          <Box marginTop={1}>
            <Text color="cyan">[p]</Text>
            <Text> to run another plan.</Text>
          </Box>
        </Box>
      );
    }
    case 'idle_empty_trust':
      return (
        <Box flexDirection="column">
          <Text>Workspace healthy. No trusted facts recorded yet.</Text>
          <Box marginTop={1}>
            <Text color="cyan">[p]</Text>
            <Text> to run another plan and start building context.</Text>
          </Box>
        </Box>
      );
  }
}
