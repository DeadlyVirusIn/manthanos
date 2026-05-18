// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { checkDenylist } from '../src/denylist.js';

describe('checkDenylist', () => {
  it('blocks rm -rf /', () => {
    expect(checkDenylist('rm', ['-rf', '/'])?.rule).toBe('rm-rf-root');
  });

  it('blocks rm -rf ~', () => {
    expect(checkDenylist('rm', ['-rf', '~'])?.rule).toBe('rm-rf-root');
  });

  it('blocks rm -rf with split flags', () => {
    expect(checkDenylist('rm', ['-r', '-f', '/'])?.rule).toBe('rm-rf-root');
  });

  it('allows rm -rf on a specific subdir', () => {
    expect(checkDenylist('rm', ['-rf', 'build'])).toBeNull();
  });

  it('blocks rm -rf on POSIX system roots (OCTO_REVIEW §B14)', () => {
    for (const root of [
      '/etc',
      '/var',
      '/usr',
      '/bin',
      '/sbin',
      '/lib',
      '/lib64',
      '/boot',
      '/sys',
      '/proc',
      '/dev',
      '/opt',
      '/root',
    ]) {
      expect(checkDenylist('rm', ['-rf', root])?.rule).toBe('rm-rf-root');
    }
  });

  it('blocks rm -rf on descendants of system roots', () => {
    expect(checkDenylist('rm', ['-rf', '/etc/passwd'])?.rule).toBe('rm-rf-root');
    expect(checkDenylist('rm', ['-rf', '/var/log/'])?.rule).toBe('rm-rf-root');
    expect(checkDenylist('rm', ['-rf', '/usr/local/bin'])?.rule).toBe('rm-rf-root');
  });

  it('blocks rm -rf on path-traversal targets', () => {
    expect(checkDenylist('rm', ['-rf', '..'])?.rule).toBe('rm-rf-root');
    expect(checkDenylist('rm', ['-rf', '../../..'])?.rule).toBe('rm-rf-root');
    expect(checkDenylist('rm', ['-rf', './../sibling'])?.rule).toBe('rm-rf-root');
    expect(checkDenylist('rm', ['-rf', 'subdir/../../escape'])?.rule).toBe('rm-rf-root');
  });

  it('blocks PowerShell -EncodedCommand', () => {
    expect(checkDenylist('pwsh', ['-EncodedCommand', 'SQB...'])?.rule).toBe('powershell-encoded');
    expect(checkDenylist('powershell.exe', ['-Enc', 'SQ=='])?.rule).toBe('powershell-encoded');
  });

  it('blocks git push --force', () => {
    expect(checkDenylist('git', ['push', '--force'])?.rule).toBe('force-push');
    expect(checkDenylist('git', ['push', '-f'])?.rule).toBe('force-push');
    expect(checkDenylist('git', ['push', '--force-with-lease'])?.rule).toBe('force-push');
  });

  it('blocks git reset --hard', () => {
    expect(checkDenylist('git', ['reset', '--hard'])?.rule).toBe('git-reset-hard');
  });

  it('blocks terraform destroy', () => {
    expect(checkDenylist('terraform', ['destroy'])?.rule).toBe('terraform-destroy');
  });

  it('blocks kubectl delete ns', () => {
    expect(checkDenylist('kubectl', ['delete', 'ns', 'prod'])?.rule).toBe('kubectl-delete-ns-pv');
  });

  it('allows safe git commands', () => {
    expect(checkDenylist('git', ['status'])).toBeNull();
    expect(checkDenylist('git', ['commit', '-m', 'msg'])).toBeNull();
    expect(checkDenylist('git', ['push', 'origin', 'feature/branch'])).toBeNull();
  });

  it('resolves absolute paths via basename', () => {
    expect(checkDenylist('/usr/bin/rm', ['-rf', '/'])?.rule).toBe('rm-rf-root');
  });

  it('blocks chmod -R 777', () => {
    expect(checkDenylist('chmod', ['-R', '777', '/some/path'])?.rule).toBe('chmod-777-recursive');
  });
});
