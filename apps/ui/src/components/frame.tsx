// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Common layout frame for every UI screen. Header (workspace path,
// screen name) + footer (key hints + "drop to CLI" affordance).

import { Box, Text } from 'ink';
import type React from 'react';

export interface FrameProps {
  readonly screen: string;
  readonly workspaceRoot: string;
  readonly cliCommand: string;
  readonly hints?: readonly string[];
  readonly children: React.ReactNode;
}

export function Frame({ screen, workspaceRoot, cliCommand, hints, children }: FrameProps) {
  const shortRoot =
    workspaceRoot.length > 56
      ? `…${workspaceRoot.slice(workspaceRoot.length - 55)}`
      : workspaceRoot;
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Box>
          <Text color="cyan">manthan-ui </Text>
          <Text color="gray">· </Text>
          <Text>{screen}</Text>
        </Box>
        <Text color="gray">{shortRoot}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {children}
      </Box>
      <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
        <Text color="gray">CLI equivalent:</Text>
        <Text>{cliCommand}</Text>
        {hints && hints.length > 0 && (
          <Box marginTop={1} flexDirection="column">
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
