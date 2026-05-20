// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Root component for the Phase 0 operator shell. Owns screen routing.
//
// Phase 0 §6 affordance discipline: every screen renders via a Frame
// that surfaces the literal CLI equivalent, the current operation,
// and the audit-visible action (when any). The router itself owns no
// substrate state — it carries the workspace handle and the current
// screen marker, nothing else.
//
// All five Phase 0 surfaces are now wired:
//   1. Home          — `screen.kind === 'home'`
//   2. Run Plan      — `screen.kind === 'run-plan'`
//   3. Replay        — `screen.kind === 'replay'`
//   4. Review Facts  — `screen.kind === 'review'`
//   5. Next Action   — `screen.kind === 'next'` (same component as Home,
//                      different label; reachable from any screen via
//                      the [n] key — the "what should I do now?" escape
//                      hatch the §6 affordance contract requires)
//
// No further surfaces. Adding a sixth would violate the §1 scope of
// UI_PHASE0_IMPLEMENTATION_CONTRACT.md.

import { Box, Text, useApp, useInput } from 'ink';
import { useState } from 'react';
import { HomeScreen } from './screens/home.js';
import { ReplayScreen } from './screens/replay.js';
import { ReviewScreen } from './screens/review.js';
import { RunPlanScreen } from './screens/run-plan.js';
import type { WorkspaceHandle } from './substrate.js';

export type Screen =
  | { readonly kind: 'home' }
  | { readonly kind: 'next' }
  | { readonly kind: 'run-plan' }
  | { readonly kind: 'replay'; readonly initialRunId: string | null }
  | { readonly kind: 'review' }
  | { readonly kind: 'drop-to-cli'; readonly command: string };

export interface AppProps {
  readonly workspace: WorkspaceHandle;
}

export function App({ workspace }: AppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const { exit } = useApp();

  useInput((input, key) => {
    // Global [n] = jump to Next Action (the "what should I do now?"
    // affordance). Reachable from any screen, mirroring the CLI's
    // `manthan next` escape hatch — Phase 0 §6 replay-path /
    // current-operation discipline applied to navigation, not data.
    if (input === 'n' && screen.kind !== 'next' && screen.kind !== 'drop-to-cli') {
      setScreen({ kind: 'next' });
      return;
    }
    if (screen.kind === 'drop-to-cli') {
      if (key.return || input === 'q') exit();
      if (input === 'b' || key.escape) setScreen({ kind: 'home' });
    }
  });

  if (screen.kind === 'home' || screen.kind === 'next') {
    return (
      <HomeScreen
        workspaceRoot={workspace.root}
        screenLabel={screen.kind === 'home' ? 'Home' : 'Next'}
        onRunPlan={() => setScreen({ kind: 'run-plan' })}
        onReview={() => setScreen({ kind: 'review' })}
        onReplay={() => setScreen({ kind: 'replay', initialRunId: null })}
        onExit={() => setScreen({ kind: 'drop-to-cli', command: 'manthan next' })}
      />
    );
  }
  if (screen.kind === 'run-plan') {
    return (
      <RunPlanScreen
        workspaceRoot={workspace.root}
        onPlanComplete={(runId) => setScreen({ kind: 'replay', initialRunId: runId })}
        onBack={() => setScreen({ kind: 'home' })}
      />
    );
  }
  if (screen.kind === 'replay') {
    return (
      <ReplayScreen
        workspace={workspace}
        initialRunId={screen.initialRunId}
        onBack={() => setScreen({ kind: 'home' })}
      />
    );
  }
  if (screen.kind === 'review') {
    return <ReviewScreen workspace={workspace} onBack={() => setScreen({ kind: 'home' })} />;
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>Drop to CLI.</Text>
      <Text color="gray">The equivalent CLI command for the current state is:</Text>
      <Box marginTop={1}>
        <Text color="cyan">{screen.command}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">[enter / q] exit · [b / esc] back to home</Text>
      </Box>
    </Box>
  );
}
