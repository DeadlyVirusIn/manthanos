// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Action classification per SAFETY_MODEL.md §3.

export type ActionKind =
  | 'read'
  | 'network-read'
  | 'write-local'
  | 'write-userdata'
  | 'git-local'
  | 'git-remote'
  | 'shell'
  | 'shell-restricted'
  | 'network-write'
  | 'secret-access'
  | 'deploy';

export type Decision =
  | { kind: 'auto-approve'; reason: string }
  | { kind: 'require-approval'; reason: string }
  | { kind: 'deny'; reason: string };

export interface PolicyContext {
  /** Whether the current session has scoped --yes flags active. */
  readonly yesScopes: ReadonlySet<ActionKind>;
}

/**
 * Default policy per SAFETY_MODEL.md §4. The user may tighten via
 * config.yaml; loosening is restricted to write-local and shell only
 * (and never for git-remote, secret-access, or deploy).
 */
export function defaultPolicy(action: ActionKind, ctx: PolicyContext): Decision {
  const yes = (k: ActionKind) => ctx.yesScopes.has(k);

  switch (action) {
    case 'read':
      return { kind: 'auto-approve', reason: 'pure read' };
    case 'network-read':
      return { kind: 'auto-approve', reason: 'provider call within budget' };

    case 'write-local':
      return yes('write-local')
        ? { kind: 'auto-approve', reason: '--yes-write scoped' }
        : { kind: 'require-approval', reason: 'workspace file write' };

    case 'write-userdata':
      return yes('write-userdata')
        ? { kind: 'auto-approve', reason: '--yes-write-userdata scoped' }
        : { kind: 'require-approval', reason: 'user-data write outside workspace' };

    case 'git-local':
      return yes('git-local')
        ? { kind: 'auto-approve', reason: '--yes-git-local scoped' }
        : { kind: 'require-approval', reason: 'git mutation in workspace' };

    case 'git-remote':
      // Non-bypassable: even --yes does not auto-approve remote mutations.
      return { kind: 'require-approval', reason: 'git remote mutation (non-bypassable)' };

    case 'shell-restricted':
      return { kind: 'auto-approve', reason: 'restricted shell descriptor (first run prompts)' };

    case 'shell':
      return yes('shell')
        ? { kind: 'auto-approve', reason: '--yes-shell scoped' }
        : { kind: 'require-approval', reason: 'arbitrary shell' };

    case 'network-write':
      return yes('network-write')
        ? { kind: 'auto-approve', reason: '--yes-network-write scoped' }
        : { kind: 'require-approval', reason: 'outbound network mutation' };

    case 'secret-access':
      // Non-bypassable: per-workflow first access always prompts.
      return { kind: 'require-approval', reason: 'secret access (non-bypassable)' };

    case 'deploy':
      // Requires both an explicit flag AND approval.
      return yes('deploy')
        ? { kind: 'require-approval', reason: 'deploy (requires explicit approval)' }
        : { kind: 'deny', reason: 'deploy not enabled (use --allow-deploy)' };

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return { kind: 'deny', reason: 'unknown action class' };
    }
  }
}
