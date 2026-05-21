// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Default PromptIo implementation backed by node:readline. The setup
// engine accepts an injected PromptIo for tests; this module just
// provides the standard one used by the CLI command.

import { createInterface } from 'node:readline/promises';
import type { PromptIo } from './types.js';

export interface DefaultIoOptions {
  /** Defaults to process.stdout.write. */
  readonly writeLine?: (s: string) => void;
}

export function createDefaultIo(opts: DefaultIoOptions = {}): PromptIo {
  const writeLine = opts.writeLine ?? ((s: string) => process.stdout.write(`${s}\n`));
  let lastStatusOnLine = false;

  const clearStatusLine = (): void => {
    if (lastStatusOnLine) {
      process.stdout.write('\n');
      lastStatusOnLine = false;
    }
  };

  return {
    async confirm(question, { default: def = true } = {}) {
      clearStatusLine();
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const hint = def ? '[Y/n]' : '[y/N]';
        const ans = (await rl.question(`${question} ${hint} `)).trim().toLowerCase();
        if (ans === '') return def;
        return ans === 'y' || ans === 'yes';
      } finally {
        rl.close();
      }
    },
    async ask(question) {
      clearStatusLine();
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return (await rl.question(`${question} `)).trim();
      } finally {
        rl.close();
      }
    },
    async askSecret(question) {
      clearStatusLine();
      // node:readline doesn't natively suppress echo. We can mute stdout
      // by overriding the writer, but only while reading. For now we
      // print the question, read the line, and best-effort hide the
      // typed characters via ANSI back-erase. On a real TTY the line is
      // still visible briefly — acceptable for novice key pastes; the
      // key is the secret, not its presence on screen.
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const raw = await rl.question(`${question} `);
        // Move cursor up + erase the echoed line.
        process.stdout.write('\x1b[1A\x1b[2K');
        process.stdout.write(`${question} ${'*'.repeat(Math.min(raw.length, 32))}\n`);
        return raw.trim();
      } finally {
        rl.close();
      }
    },
    log(line) {
      clearStatusLine();
      writeLine(line);
    },
    status(line) {
      if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[2K${line}`);
        lastStatusOnLine = true;
      } else {
        writeLine(line);
      }
    },
    header(title, subtitle) {
      clearStatusLine();
      writeLine('');
      writeLine(`──── ${title} ────`);
      if (subtitle) writeLine(`  ${subtitle}`);
    },
  };
}

/** Returns true iff both stdin and stdout are TTYs. */
export function isInteractiveTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
