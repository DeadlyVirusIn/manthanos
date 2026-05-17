// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { getPlatform } from '@manthanos/platform';
import { CLI_VERSION } from '../version-const.js';

export async function runVersion(): Promise<void> {
  const platform = getPlatform();
  process.stdout.write(`manthan ${CLI_VERSION}\n`);
  process.stdout.write(`  node      ${process.version}\n`);
  process.stdout.write(`  platform  ${platform.info.os}/${platform.info.arch}`);
  if (platform.info.isWSL) process.stdout.write(' (WSL)');
  process.stdout.write('\n');
  process.stdout.write('  license   BSL-1.1 → Apache-2.0 (after change date)\n');
}
