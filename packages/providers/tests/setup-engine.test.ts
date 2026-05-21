// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSetup } from '../src/setup/engine.js';
import type { PhaseResult, PromptIo, SetupRunners } from '../src/setup/types.js';

interface RecordedIo extends PromptIo {
  readonly lines: string[];
}

function recordingIo(answers: ReadonlyArray<string> = []): RecordedIo {
  const lines: string[] = [];
  let idx = 0;
  return {
    lines,
    async confirm() {
      return true;
    },
    async ask() {
      const a = answers[idx];
      idx += 1;
      return a ?? '';
    },
    async askSecret() {
      const a = answers[idx];
      idx += 1;
      return a ?? '';
    },
    log(line: string) {
      lines.push(line);
    },
    status(line: string) {
      lines.push(line);
    },
    header(title: string, subtitle?: string) {
      lines.push(`HEADER: ${title}${subtitle ? ` — ${subtitle}` : ''}`);
    },
  };
}

const okPhase = (phase: PhaseResult['phase']): PhaseResult => ({
  phase,
  status: 'ok',
  detail: 'ok',
});

function makeRunners(state: { authCalled: boolean; installCalled: boolean }): SetupRunners {
  return {
    async install() {
      state.installCalled = true;
      return okPhase('install');
    },
    async auth() {
      state.authCalled = true;
      return okPhase('auth');
    },
    async postInstall() {
      return okPhase('post-install');
    },
  };
}

describe('runSetup', () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await mkdtemp(path.join(tmpdir(), 'mnth-setup-'));
  });
  afterEach(async () => {
    await rm(tmpHome, { recursive: true, force: true });
  });

  it('skips providers that probe as already-runnable', async () => {
    const io = recordingIo([]);
    const state = { authCalled: false, installCalled: false };
    const summary = await runSetup({
      providerIds: ['codex-cli'],
      forceTty: true,
      io,
      runners: makeRunners(state),
      probe: async () => ({ runnable: true, detail: 'ready' }),
    });
    expect(summary.readyCount).toBe(1);
    expect(state.installCalled).toBe(false);
    expect(state.authCalled).toBe(false);
  });

  it('runs install + auth + verify for a not-yet-runnable provider', async () => {
    const io = recordingIo(['y']);
    const state = { authCalled: false, installCalled: false };
    let probeCount = 0;
    const summary = await runSetup({
      providerIds: ['codex-cli'],
      forceTty: true,
      io,
      runners: makeRunners(state),
      probe: async () => {
        probeCount += 1;
        // Probes per provider: 1) survey-pass, 2) detect, 3) verify.
        // First two must report not-runnable so install/auth run; verify true.
        return {
          runnable: probeCount > 2,
          detail: probeCount > 2 ? 'ready' : 'needs setup',
        };
      },
    });
    expect(state.installCalled).toBe(true);
    expect(state.authCalled).toBe(true);
    expect(summary.readyCount).toBe(1);
    expect(summary.failedCount).toBe(0);
  });

  it('reports failure when verify still not runnable after install+auth', async () => {
    const io = recordingIo(['y']);
    const state = { authCalled: false, installCalled: false };
    const summary = await runSetup({
      providerIds: ['codex-cli'],
      forceTty: true,
      io,
      runners: makeRunners(state),
      probe: async () => ({ runnable: false, detail: 'still missing' }),
    });
    expect(summary.failedCount).toBe(1);
    expect(summary.readyCount).toBe(0);
  });

  it('skip-all halts processing after the first decline', async () => {
    const io = recordingIo(['skip-all']);
    const state = { authCalled: false, installCalled: false };
    const summary = await runSetup({
      providerIds: ['codex-cli', 'gemini-cli'],
      forceTty: true,
      io,
      runners: makeRunners(state),
      probe: async () => ({ runnable: false, detail: 'needs setup' }),
    });
    expect(state.installCalled).toBe(false);
    expect(state.authCalled).toBe(false);
    expect(summary.skippedCount).toBe(2);
  });

  it('non-interactive mode defers every provider and writes a script', async () => {
    const io = recordingIo([]);
    const state = { authCalled: false, installCalled: false };
    const summary = await runSetup({
      providerIds: ['qwen', 'openai'],
      forceTty: false, // simulate non-TTY shell
      nonInteractive: true,
      io,
      runners: makeRunners(state),
      probe: async () => ({ runnable: false, detail: 'needs setup' }),
      scriptDir: tmpHome,
    });
    expect(state.installCalled).toBe(false);
    expect(state.authCalled).toBe(false);
    expect(summary.deferredCount).toBe(2);
    const scriptPath = path.join(tmpHome, 'setup-continue.sh');
    expect(existsSync(scriptPath)).toBe(true);
    const body = readFileSync(scriptPath, 'utf8');
    expect(body).toContain('Alibaba Qwen');
    expect(body).toContain('npm install -g @qwen-code/qwen-code');
    expect(body).toContain('OpenAI (HTTP API)');
  });

  it('dry-run never invokes runners and never writes scripts', async () => {
    const io = recordingIo([]);
    const state = { authCalled: false, installCalled: false };
    const summary = await runSetup({
      providerIds: ['codex-cli', 'qwen'],
      forceTty: true,
      dryRun: true,
      io,
      runners: makeRunners(state),
      probe: async () => ({ runnable: false, detail: 'needs setup' }),
      scriptDir: tmpHome,
    });
    expect(state.installCalled).toBe(false);
    expect(state.authCalled).toBe(false);
    expect(summary.failedCount).toBe(0);
    expect(existsSync(path.join(tmpHome, 'setup-continue.sh'))).toBe(false);
  });
});
