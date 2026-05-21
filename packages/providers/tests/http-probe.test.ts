// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultLocalHttpProbe } from '../src/health.js';

describe('defaultLocalHttpProbe', () => {
  let serverUrl: string;
  let slowServerUrl: string;
  let okServer: ReturnType<typeof createServer>;
  let slowServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    okServer = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => okServer.listen(0, '127.0.0.1', () => resolve()));
    const okPort = (okServer.address() as AddressInfo).port;
    serverUrl = `http://127.0.0.1:${okPort}/`;

    slowServer = createServer((_req, _res) => {
      // Hang the request — never write. Forces the probe's timeout path.
    });
    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', () => resolve()));
    const slowPort = (slowServer.address() as AddressInfo).port;
    slowServerUrl = `http://127.0.0.1:${slowPort}/`;
  });

  afterAll(async () => {
    await Promise.all([
      new Promise<void>((resolve) => {
        okServer.closeAllConnections?.();
        okServer.close(() => resolve());
      }),
      new Promise<void>((resolve) => {
        slowServer.closeAllConnections?.();
        slowServer.close(() => resolve());
      }),
    ]);
  });

  it('returns true on a 2xx response', async () => {
    expect(await defaultLocalHttpProbe(serverUrl)).toBe(true);
  });

  it('returns false on a closed port (connection refused)', async () => {
    // Port 1 on localhost: privileged, never bound in a normal session.
    expect(await defaultLocalHttpProbe('http://127.0.0.1:1/')).toBe(false);
  });

  it('returns false when the server hangs past the timeout', async () => {
    const t0 = Date.now();
    const result = await defaultLocalHttpProbe(slowServerUrl, 100);
    const elapsed = Date.now() - t0;
    expect(result).toBe(false);
    expect(elapsed).toBeLessThan(1000); // honors the short timeout
  });

  it('returns false on a malformed URL', async () => {
    expect(await defaultLocalHttpProbe('not-a-url')).toBe(false);
  });
});
