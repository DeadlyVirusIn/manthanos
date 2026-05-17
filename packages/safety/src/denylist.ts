// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Shell denylist per SAFETY_MODEL.md §5.
// Non-bypassable — these patterns cannot be approved into execution.
//
// Two passes:
//   1. Literal substring / regex against the resolved command + args.
//   2. Resolution-aware: aliases resolved before matching (Phase 1+).

export interface DenylistMatch {
  /** Identifier of the rule that matched, for audit. */
  readonly rule: string;
  /** Human-readable explanation. */
  readonly reason: string;
}

interface DenylistRule {
  readonly id: string;
  readonly description: string;
  readonly test: (command: string, args: readonly string[], joined: string) => boolean;
}

const HOME_OR_ROOT = /(?:^|\s)~(?:\s|\/|$)|(?:^|\s)\/$|^\/(?:\s|$)/;

const RULES: readonly DenylistRule[] = Object.freeze([
  {
    id: 'rm-rf-root',
    description: 'Recursive force-delete of root, home, or workspace root',
    test: (cmd, args, joined) => {
      if (cmd !== 'rm') return false;
      const hasRf =
        args.some((a) => a === '-rf' || a === '-fr' || a === '-Rf' || a === '-fR') ||
        (args.includes('-r') && args.includes('-f'));
      if (!hasRf) return false;
      // Reject if any positional target resolves to a dangerous path.
      const targets = args.filter((a) => !a.startsWith('-'));
      return (
        targets.some((t) => t === '/' || t === '~' || t.startsWith('~/') || t === '/*') ||
        HOME_OR_ROOT.test(joined)
      );
    },
  },
  {
    id: 'pipe-to-shell',
    description: 'Pipe-into-shell (curl|sh, wget|bash, etc.)',
    test: (_cmd, _args, joined) => {
      const lower = joined.toLowerCase();
      // We only execute as argv; this rule guards against shell-mediated invocations.
      return (
        /\|\s*(?:sh|bash|zsh|ksh|csh|tcsh|fish|python\s*-|node\s*-|perl\s*-|ruby\s*-)\b/.test(
          lower,
        ) ||
        // PowerShell equivalents
        /\|\s*(?:iex|invoke-expression)\b/.test(lower)
      );
    },
  },
  {
    id: 'base64-decode-execute',
    description: 'Base64 decode piped to shell',
    test: (_cmd, _args, joined) => {
      const lower = joined.toLowerCase();
      return /base64\s+(?:-d|--decode|-D)\s*\|\s*(?:sh|bash|zsh|node|python|iex)/.test(lower);
    },
  },
  {
    id: 'powershell-encoded',
    description: 'PowerShell -EncodedCommand (base64 payload)',
    test: (cmd, args, _joined) => {
      const isPs =
        /^(?:pwsh|powershell)(?:\.exe)?$/i.test(cmd) ||
        /^(?:pwsh|powershell)(?:\.exe)?$/i.test(cmd.split(/[\\/]/).pop() ?? '');
      if (!isPs) return false;
      // Match -EncodedCommand, -EC, -Enc, and the partial -e <base64>.
      return args.some((a) => /^-(?:encodedcommand|ec|enc|e)$/i.test(a));
    },
  },
  {
    id: 'iwr-pipe-iex',
    description: 'Invoke-WebRequest piped to Invoke-Expression',
    test: (_cmd, _args, joined) => {
      const lower = joined.toLowerCase();
      return /(?:iwr|invoke-webrequest|invoke-restmethod)\b[^|]*\|\s*(?:iex|invoke-expression)/.test(
        lower,
      );
    },
  },
  {
    id: 'kubectl-delete-ns-pv',
    description: 'kubectl delete on namespaces or persistent volumes',
    test: (cmd, args, _joined) => {
      if (cmd !== 'kubectl') return false;
      const i = args.indexOf('delete');
      if (i < 0) return false;
      const target = args[i + 1] ?? '';
      return /^(?:ns|namespace|namespaces|pv|persistentvolume|persistentvolumes)$/i.test(target);
    },
  },
  {
    id: 'terraform-destroy',
    description: 'terraform destroy',
    test: (cmd, args, _joined) => cmd === 'terraform' && args[0] === 'destroy',
  },
  {
    id: 'dropdb',
    description: 'dropdb command',
    test: (cmd, _args, _joined) => cmd === 'dropdb',
  },
  {
    id: 'chmod-777-recursive',
    description: 'chmod -R 777',
    test: (cmd, args, _joined) =>
      cmd === 'chmod' &&
      args.some((a) => a === '-R' || a === '--recursive') &&
      args.includes('777'),
  },
  {
    id: 'dd-to-device',
    description: 'dd of=/dev/...',
    test: (cmd, args, _joined) => cmd === 'dd' && args.some((a) => a.startsWith('of=/dev/')),
  },
  {
    id: 'windows-remove-item-recursive',
    description: 'Remove-Item -Recurse -Force on root/home',
    test: (cmd, args, _joined) => {
      if (!/^remove-item$/i.test(cmd) && !/^(rm|rd|del)$/i.test(cmd)) return false;
      const recursive = args.some((a) => /^-recurse$/i.test(a));
      const force = args.some((a) => /^-force$/i.test(a));
      if (!(recursive && force)) return false;
      const targets = args.filter((a) => !a.startsWith('-'));
      return targets.some((t) =>
        /^(?:[A-Z]:[\\/]?|[A-Z]:[\\/].{0,5}|~|\$home|\$env:userprofile)$/i.test(t),
      );
    },
  },
  {
    id: 'windows-format-volume',
    description: 'Format-Volume / Clear-Disk / cipher /w',
    test: (cmd, args, _joined) => {
      if (/^(?:format-volume|clear-disk)$/i.test(cmd)) return true;
      if (cmd.toLowerCase() === 'cipher' && args.some((a) => /^\/w(:|$)/i.test(a))) return true;
      return false;
    },
  },
  {
    id: 'force-push',
    description: 'git push --force',
    test: (cmd, args, _joined) =>
      cmd === 'git' &&
      args[0] === 'push' &&
      args.some(
        (a) => a === '--force' || a === '-f' || a === '--force-with-lease' || a === '--mirror',
      ),
  },
  {
    id: 'git-history-rewrite',
    description: 'git history rewrite (filter-branch / filter-repo)',
    test: (cmd, args, _joined) =>
      cmd === 'git' && (args[0] === 'filter-branch' || args[0] === 'filter-repo'),
  },
  {
    id: 'git-reset-hard',
    description: 'git reset --hard',
    test: (cmd, args, _joined) =>
      cmd === 'git' && args[0] === 'reset' && args.some((a) => a === '--hard'),
  },
]);

export function checkDenylist(command: string, args: readonly string[]): DenylistMatch | null {
  // Resolve to basename for cross-platform matching (e.g. `/usr/bin/rm` → `rm`).
  const cmdLower = command.toLowerCase();
  const base = (cmdLower.split(/[\\/]/).pop() ?? '').replace(/\.exe$/, '');
  const joined = [base, ...args].join(' ');
  for (const rule of RULES) {
    if (rule.test(base, args, joined)) {
      return { rule: rule.id, reason: rule.description };
    }
  }
  return null;
}

export const _RULES = RULES; // exported for tests
