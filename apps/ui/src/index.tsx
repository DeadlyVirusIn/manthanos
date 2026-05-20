#!/usr/bin/env node
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// manthan-ui — spike entry point. Resolves the workspace, then mounts
// the React/Ink tree. No CLI flags beyond an optional workspace path.

import { render } from 'ink';
import React from 'react';
import { App } from './app.js';
import { resolveWorkspace } from './substrate.js';

async function main(): Promise<number> {
  const cwd = process.argv[2] ?? process.cwd();
  const workspace = await resolveWorkspace(cwd);
  if (!workspace) {
    process.stderr.write(
      `manthan-ui: no ManthanOS workspace at ${cwd}\n  Initialize one first: manthan init\n`,
    );
    return 2;
  }
  const { waitUntilExit } = render(React.createElement(App, { workspace }));
  await waitUntilExit();
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`manthan-ui: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
