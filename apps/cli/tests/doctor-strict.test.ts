// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// P0 Follow-on A: `manthan doctor --strict` exits non-zero on
// corruption. Default behavior (no --strict) is read-only and
// never fails. These tests pin the exit-code mapping.

import { describe, expect, it } from 'vitest';
import { computeDoctorExitCode } from '../src/commands/doctor.js';

describe('computeDoctorExitCode', () => {
  it('default mode: clean → 0', () => {
    expect(computeDoctorExitCode({ recoveryStatus: 'clean' }, false)).toBe(0);
  });

  it('default mode: partial → 0', () => {
    expect(computeDoctorExitCode({ recoveryStatus: 'partial' }, false)).toBe(0);
  });

  it('default mode: corrupted → 0 (default doctor is non-failing)', () => {
    expect(computeDoctorExitCode({ recoveryStatus: 'corrupted' }, false)).toBe(0);
  });

  it('default mode: unrecoverable → 0 (default doctor is non-failing)', () => {
    expect(computeDoctorExitCode({ recoveryStatus: 'unrecoverable' }, false)).toBe(0);
  });

  it('strict mode: clean → 0', () => {
    expect(computeDoctorExitCode({ recoveryStatus: 'clean' }, true)).toBe(0);
  });

  it('strict mode: partial → 0', () => {
    expect(computeDoctorExitCode({ recoveryStatus: 'partial' }, true)).toBe(0);
  });

  it('strict mode: corrupted → 3 (non-zero)', () => {
    expect(computeDoctorExitCode({ recoveryStatus: 'corrupted' }, true)).toBe(3);
  });

  it('strict mode: unrecoverable → 3 (non-zero)', () => {
    expect(computeDoctorExitCode({ recoveryStatus: 'unrecoverable' }, true)).toBe(3);
  });

  it('strict mode: missing recoveryStatus → 0 (workspace not initialized; no chain to judge)', () => {
    expect(computeDoctorExitCode({}, true)).toBe(0);
  });
});
