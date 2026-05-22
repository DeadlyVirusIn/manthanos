// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Rejects requests whose Host header does not point at a loopback
// address. The daemon binds to 127.0.0.1 so non-loopback TCP
// connections cannot reach it; the Host-header check defends
// against DNS-rebinding attacks where a browser is tricked into
// sending requests with a non-loopback Host.

import type { FastifyInstance } from 'fastify';

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Returns true when the Host header points at a loopback address.
 * Accepts `host`, `host:port`, `[ipv6]`, and `[ipv6]:port` forms.
 */
export function isLoopbackHost(rawHostHeader: string | undefined): boolean {
  if (!rawHostHeader) {
    return false;
  }
  const trimmed = rawHostHeader.trim();
  if (trimmed === '') {
    return false;
  }

  let hostPart: string;
  if (trimmed.startsWith('[')) {
    // IPv6 bracket form: `[::1]` or `[::1]:7373`
    const end = trimmed.indexOf(']');
    if (end === -1) {
      return false;
    }
    hostPart = trimmed.slice(0, end + 1);
  } else if (trimmed.includes(':')) {
    // Could be `host:port` or bare IPv6 (without brackets).
    const firstColon = trimmed.indexOf(':');
    const lastColon = trimmed.lastIndexOf(':');
    if (firstColon === lastColon) {
      // Exactly one colon → `host:port`.
      hostPart = trimmed.slice(0, lastColon);
    } else {
      // Multiple colons → bare IPv6.
      hostPart = trimmed;
    }
  } else {
    hostPart = trimmed;
  }

  return LOOPBACK_HOSTS.has(hostPart.toLowerCase());
}

export function registerLoopbackGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host;
    if (!isLoopbackHost(host)) {
      await reply.code(403).send({
        error: 'forbidden',
        reason: 'non-loopback host header',
      });
    }
  });
}
