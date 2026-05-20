// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Phase 0 UI smoke test. Confirms each landed screen mounts without
// throwing against a real initialized workspace. As subsequent
// screens land (per the Phase 0 implementation contract §1 order),
// they each add their own assertions to this file.
//
// Substrate behavior is covered by orchestrator + CLI test suites
// already in tree. The UI tests are scoped to rendering and routing.

import { execSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getPlatform } from '@manthanos/platform';
import { render } from 'ink-testing-library';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { resolveWorkspace } from '../src/substrate.js';

let workspaceRoot: string;
let workspaceHandle: Awaited<ReturnType<typeof resolveWorkspace>>;

beforeAll(async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-ui-test-'));
  workspaceRoot = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);
  execSync('git init -q', { cwd: workspaceRoot, stdio: 'ignore' });
  await writeFile(
    path.join(workspaceRoot, 'package.json'),
    JSON.stringify({ name: 'ui-phase0-test-fixture', type: 'module' }),
  );
  execSync('manthan init', { cwd: workspaceRoot, stdio: 'ignore' });
  workspaceHandle = await resolveWorkspace(workspaceRoot);
});

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 200));
  if (workspaceRoot)
    await rm(workspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const rendered: Array<{ unmount: () => void }> = [];
afterEach(() => {
  while (rendered.length > 0) rendered.pop()?.unmount();
});

describe('manthan-ui Phase 0 — Home screen', () => {
  it('App mounts at the Home screen', () => {
    if (!workspaceHandle) throw new Error('workspace not prepared');
    const inst = render(<App workspace={workspaceHandle} />);
    rendered.push(inst);
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('manthan-ui');
    expect(frame).toContain('Home');
  });

  it('Home shows the CLI equivalent affordance (Phase 0 §6 required)', () => {
    if (!workspaceHandle) throw new Error('workspace not prepared');
    const inst = render(<App workspace={workspaceHandle} />);
    rendered.push(inst);
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('CLI equivalent:');
    expect(frame).toContain('manthan next');
  });

  it('Home shows navigation hints for landed screens', () => {
    if (!workspaceHandle) throw new Error('workspace not prepared');
    const inst = render(<App workspace={workspaceHandle} />);
    rendered.push(inst);
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('[p] run plan');
    expect(frame).toContain('[q] drop to CLI');
  });
});

describe('manthan-ui Phase 0 — Review Facts screen', () => {
  it('navigates from Home to Review Facts when [r] is pressed', async () => {
    if (!workspaceHandle) throw new Error('workspace not prepared');
    const inst = render(<App workspace={workspaceHandle} />);
    rendered.push(inst);
    await new Promise((r) => setTimeout(r, 50));
    inst.stdin.write('r');
    await new Promise((r) => setTimeout(r, 50));
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('Review Facts');
    expect(frame).toContain('CLI equivalent:');
    expect(frame).toContain('manthan brain review');
  });
});

describe('manthan-ui Phase 0 — Replay screen', () => {
  it('navigates from Home to Replay when [v] is pressed', async () => {
    if (!workspaceHandle) throw new Error('workspace not prepared');
    const inst = render(<App workspace={workspaceHandle} />);
    rendered.push(inst);
    await new Promise((r) => setTimeout(r, 50));
    inst.stdin.write('v');
    await new Promise((r) => setTimeout(r, 50));
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('Replay');
    expect(frame).toContain('CLI equivalent:');
    expect(frame).toContain('manthan replay');
  });
});

describe('manthan-ui Phase 0 — Run Plan screen', () => {
  it('navigates from Home to Run Plan when [p] is pressed', async () => {
    if (!workspaceHandle) throw new Error('workspace not prepared');
    const inst = render(<App workspace={workspaceHandle} />);
    rendered.push(inst);
    await new Promise((r) => setTimeout(r, 50));
    inst.stdin.write('p');
    await new Promise((r) => setTimeout(r, 50));
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('Run Plan');
    expect(frame).toContain('Brief');
  });

  it('Run Plan shows the CLI equivalent affordance with the current brief', async () => {
    if (!workspaceHandle) throw new Error('workspace not prepared');
    const inst = render(<App workspace={workspaceHandle} />);
    rendered.push(inst);
    await new Promise((r) => setTimeout(r, 50));
    inst.stdin.write('p');
    await new Promise((r) => setTimeout(r, 50));
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('CLI equivalent:');
    expect(frame).toContain('manthan plan');
  });
});
