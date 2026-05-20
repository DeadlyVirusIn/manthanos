// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// UX prototype 9.1 — Persistent Workspace Context Strip + Pane-Based
// Layout. Three regions:
//   1. Thin top bar: tool name + workspace path
//   2. Two-column body:
//      - Left context pane: workspace identity, summary state,
//        counts (trusted / quarantine / runs), current surface label
//      - Main pane: the active screen's body
//   3. Bottom status ribbon: CLI equivalent, current operation,
//      keyboard hints
//
// Substrate-boundary discipline: the left pane and ribbon render
// values from a `WorkspaceContext` loaded by the App on each
// navigation. No background polling, no cached truth, no UI-side
// state.
//
// Information hierarchy: workspace name and screen label are bold
// (primary); summary state and counts are regular weight (secondary);
// the path, CLI equivalent, and hints are dimmed (contextual). No
// colors are used for decoration — only to encode substrate status
// (green=ok, yellow=warn, red=problem).

import { Box, Text } from 'ink';
import { type Context, createContext, useContext } from 'react';
import type React from 'react';
import type { WorkspaceContext } from '../substrate.js';

export const WorkspaceCtx: Context<WorkspaceContext | null> =
  createContext<WorkspaceContext | null>(null);

export interface FrameProps {
  readonly screen: string;
  readonly workspaceRoot: string;
  readonly cliCommand: string;
  readonly hints?: readonly string[];
  readonly currentOp?: string;
  readonly children: React.ReactNode;
}

export function Frame({
  screen,
  workspaceRoot,
  cliCommand,
  hints,
  currentOp,
  children,
}: FrameProps) {
  const ctx = useContext(WorkspaceCtx);
  const shortRoot =
    workspaceRoot.length > 64
      ? `…${workspaceRoot.slice(workspaceRoot.length - 63)}`
      : workspaceRoot;
  const op = currentOp ?? deriveOp(ctx);
  return (
    <Box flexDirection="column">
      {/* Top bar — thin, single line of context */}
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text bold>manthan-ui</Text>
        <Text color="gray"> · </Text>
        <Text color="gray">{shortRoot}</Text>
      </Box>

      {/* Two-column body: left context pane + main pane */}
      <Box flexDirection="row">
        <LeftPane screen={screen} ctx={ctx} />
        <Box flexGrow={1} flexDirection="column" paddingX={1} paddingY={1}>
          {children}
        </Box>
      </Box>

      {/* Bottom status ribbon */}
      <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="gray">
        <Box>
          <Text color="gray">CLI: </Text>
          <Text>{cliCommand}</Text>
          <Text color="gray"> op: </Text>
          <Text>{op}</Text>
        </Box>
        {hints && hints.length > 0 && (
          <Box marginTop={0} flexDirection="column">
            {hints.map((h) => (
              <Text key={h} color="gray">
                {h}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function LeftPane({
  screen,
  ctx,
}: {
  readonly screen: string;
  readonly ctx: WorkspaceContext | null;
}) {
  return (
    <Box width={26} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {/* Primary: workspace name */}
      <Text bold>{ctx?.workspaceName ?? '…'}</Text>

      {/* Secondary: state badge */}
      <Box marginTop={1}>
        <StateBadge ctx={ctx} />
      </Box>

      {/* Contextual: counts */}
      <Box marginTop={1} flexDirection="column">
        <Text color="gray">{ctx ? ctx.trustedCount : '…'} trusted</Text>
        <Text color="gray">{ctx ? ctx.quarantineCount : '…'} in quarantine</Text>
        <Text color="gray">
          {ctx ? ctx.runCount : '…'} {ctx?.runCount === 1 ? 'run' : 'runs'}
        </Text>
      </Box>

      {/* Secondary: current surface */}
      <Box marginTop={1}>
        <Text color="gray">on: </Text>
        <Text>{screen}</Text>
      </Box>
    </Box>
  );
}

function StateBadge({ ctx }: { readonly ctx: WorkspaceContext | null }) {
  if (!ctx) return <Text color="gray">◇ loading…</Text>;
  const s = ctx.workflowState;
  switch (s.kind) {
    case 'loading':
      return <Text color="gray">◇ loading…</Text>;
    case 'error':
      return <Text color="red">◆ error</Text>;
    case 'no_workspace':
      return <Text color="yellow">◇ no workspace</Text>;
    case 'workspace_row_missing':
      return <Text color="yellow">◇ partial init</Text>;
    case 'recovery_not_clean':
      return <Text color="red">◆ chain {s.recoveryStatus}</Text>;
    case 'last_plan_failed':
      return <Text color="yellow">◆ plan {s.status}</Text>;
    case 'no_plans_yet':
      // Note: the CLI has a `recent_correction_no_plans` variant (fix
      // B) that the UI's local `inspectWorkflowState` mirror does not
      // yet emit. The UI friction note flagged consolidation; out of
      // scope for this prototype. For now, both cases fall under
      // "no plans yet" on the badge.
      return <Text color="gray">◇ no plans yet</Text>;
    case 'has_quarantine':
      return <Text color="yellow">◆ {s.quarantineCount} to review</Text>;
    case 'idle_with_trust':
      return <Text color="green">◆ workspace healthy</Text>;
    case 'idle_empty_trust':
      return <Text>◇ idle, no trust yet</Text>;
  }
}

function deriveOp(ctx: WorkspaceContext | null): string {
  if (!ctx) return 'loading workspace…';
  const s = ctx.workflowState;
  if (s.kind === 'loading') return 'loading workspace…';
  if (s.kind === 'error') return 'error';
  return 'idle';
}
