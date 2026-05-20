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
// Screens implemented so far: Home (and its "Next" re-render). The
// remaining four — Run Plan, Replay, Review Facts, Next Action wiring
// — arrive in subsequent commits per the Phase 0 implementation
// contract.

import { Box, Text, useApp, useInput } from 'ink';
import { useState } from 'react';
import { HomeScreen } from './screens/home.js';
import type { WorkspaceHandle } from './substrate.js';

export type Screen =
  | { readonly kind: 'home' }
  | { readonly kind: 'drop-to-cli'; readonly command: string };

export interface AppProps {
  readonly workspace: WorkspaceHandle;
}

export function App({ workspace }: AppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const { exit } = useApp();

  useInput((input, key) => {
    if (screen.kind === 'drop-to-cli') {
      if (key.return || input === 'q') exit();
      if (input === 'b' || key.escape) setScreen({ kind: 'home' });
    }
  });

  if (screen.kind === 'home') {
    return (
      <HomeScreen
        workspaceRoot={workspace.root}
        screenLabel="Home"
        onExit={() => setScreen({ kind: 'drop-to-cli', command: 'manthan next' })}
      />
    );
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
