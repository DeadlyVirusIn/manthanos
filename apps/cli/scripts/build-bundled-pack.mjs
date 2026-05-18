#!/usr/bin/env node
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn
//
// Build a self-contained `npm install -g`-able tarball.
//
// Why this exists (P1.5):
//
//   The repo uses pnpm workspaces, so `apps/cli` declares its
//   intra-repo dependencies as `workspace:*` (rewritten by
//   `pnpm pack` to concrete `0.0.0` version specs). Those
//   `@manthanos/*` packages are not published to the npm
//   registry, so a raw `npm install -g <pnpm-pack-tarball>` fails
//   with 404 for every workspace dep.
//
//   This script bundles `dist/index.js` together with all
//   workspace deps into a single ESM file via esbuild, externalizes
//   the native + npm-registry dependencies (better-sqlite3,
//   @anthropic-ai/sdk, openai, commander, env-paths), writes a
//   slim publishable package.json that lists only those externals,
//   and runs `npm pack` against the staging dir. The resulting
//   `manthanos-cli-<version>.tgz` is installable with
//   `npm install -g <tarball>` on a clean machine.
//
// What this script does NOT do:
//
//   - publish to the npm registry (out of scope; manual step).
//   - bundle native modules (better-sqlite3 stays an external
//     dependency; npm-install will build it on the target host).
//   - rewrite history or alter any source file.

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(cliRoot, '..', '..');

// Externals: anything we should NOT bundle. These get fetched by
// npm at install time on the target host.
const EXTERNALS = [
  'better-sqlite3', // native binding; must stay external
  '@anthropic-ai/sdk',
  'openai',
  'commander',
  'env-paths',
];

function log(msg) {
  process.stdout.write(`[pack:bundled] ${msg}\n`);
}

function pickRuntimeDeps(rootPackageJson) {
  // Read the workspace-root pnpm-lock.yaml to resolve concrete
  // versions of the externals. For simplicity we read each
  // package's dependency declaration from its source package.json.
  const versions = {};
  for (const ext of EXTERNALS) {
    versions[ext] = findVersion(ext, rootPackageJson);
  }
  return versions;
}

function findVersion(pkgName, rootPackageJson) {
  // Walk every package.json under the workspace to find the FIRST
  // dependency declaration that names `pkgName`. Returns the spec
  // verbatim (e.g., "^0.13.0", "^12.1.0"). Deterministic.
  const checked = new Set();
  const candidates = [
    path.join(cliRoot, 'package.json'),
    ...[
      'adapter-claude',
      'adapter-claude-cli',
      'adapter-codex-cli',
      'adapter-gemini-cli',
      'adapter-openai',
      'adapters-sdk',
      'context',
      'memory',
      'orchestrator',
      'platform',
      'safety',
    ].map((p) => path.join(repoRoot, 'packages', p, 'package.json')),
  ];
  for (const candidate of candidates) {
    if (checked.has(candidate)) continue;
    checked.add(candidate);
    if (!existsSync(candidate)) continue;
    const pkg = JSON.parse(readFileSync(candidate, 'utf8'));
    const dep = pkg.dependencies?.[pkgName];
    if (dep) return dep;
  }
  // Fall back to the root package.json (some toolchain deps live
  // there only as devDependencies).
  const dep = rootPackageJson.dependencies?.[pkgName] ?? rootPackageJson.devDependencies?.[pkgName];
  if (dep) return dep;
  throw new Error(`could not resolve external version for ${pkgName}`);
}

async function main() {
  // 1. Ensure dist/ is up to date.
  log('running pnpm build from repo root');
  execSync('pnpm build', { cwd: repoRoot, stdio: 'inherit' });

  // 2. Bundle CLI + workspace deps into a single ESM file.
  const bundleDir = path.join(cliRoot, 'bundle');
  rmSync(bundleDir, { recursive: true, force: true });
  mkdirSync(bundleDir, { recursive: true });
  const bundleOutfile = path.join(bundleDir, 'index.js');

  log('bundling via esbuild');
  await esbuild({
    entryPoints: [path.join(cliRoot, 'dist', 'index.js')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: bundleOutfile,
    external: EXTERNALS,
    // The source `dist/index.js` already begins with `#!/usr/bin/env
    // node`. esbuild does not auto-strip it; using `banner.js` here
    // would produce a duplicate shebang on line 1 and a syntax error
    // on line 2. We rely on the source shebang flowing through and
    // post-process below if needed.
    // Workspace deps are NOT externalized; they get bundled inline.
    // This is the whole point of this script.
    legalComments: 'inline',
    logLevel: 'info',
  });

  // Post-process: collapse any duplicate leading shebang lines into
  // a single shebang. Defensive — if esbuild's behavior changes in a
  // future minor version, this normalizes the output.
  {
    const { readFileSync: rf, writeFileSync: wf } = await import('node:fs');
    let bundleText = rf(bundleOutfile, 'utf8');
    const lines = bundleText.split('\n');
    const i = 0;
    while (
      i + 1 < lines.length &&
      lines[i] === '#!/usr/bin/env node' &&
      lines[i + 1] === '#!/usr/bin/env node'
    ) {
      lines.splice(i + 1, 1);
    }
    if (lines[0] !== '#!/usr/bin/env node') {
      lines.unshift('#!/usr/bin/env node');
    }
    bundleText = lines.join('\n');
    wf(bundleOutfile, bundleText);
  }

  // chmod +x so the tarball preserves the executable bit on POSIX.
  execSync(`chmod +x ${JSON.stringify(bundleOutfile)}`);

  // 3. Stage a publishable package directory.
  const stageDir = path.join(cliRoot, 'bundle-stage');
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(path.join(stageDir, 'bundle'), { recursive: true });

  copyFileSync(bundleOutfile, path.join(stageDir, 'bundle', 'index.js'));
  execSync(`chmod +x ${JSON.stringify(path.join(stageDir, 'bundle', 'index.js'))}`);

  const sourcePkg = JSON.parse(readFileSync(path.join(cliRoot, 'package.json'), 'utf8'));
  const rootPkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const runtimeDeps = pickRuntimeDeps(rootPkg);

  // Slim publishable package.json: no workspace deps (bundled),
  // only externals declared. Different "name" optional — we keep
  // @manthanos/cli for consistency.
  const stagedPkg = {
    name: sourcePkg.name,
    version: sourcePkg.version,
    description: sourcePkg.description,
    license: sourcePkg.license,
    type: 'module',
    main: './bundle/index.js',
    bin: { manthan: './bundle/index.js' },
    files: ['bundle'],
    engines: sourcePkg.engines,
    dependencies: runtimeDeps,
  };
  writeFileSync(path.join(stageDir, 'package.json'), `${JSON.stringify(stagedPkg, null, 2)}\n`);

  // Bring in licensing + a minimal README so the published tarball
  // is not a black box.
  const licenseSrc = path.join(repoRoot, 'LICENSE');
  if (existsSync(licenseSrc)) {
    copyFileSync(licenseSrc, path.join(stageDir, 'LICENSE'));
  }
  writeFileSync(
    path.join(stageDir, 'README.md'),
    [
      '# @manthanos/cli (bundled)',
      '',
      'This tarball is the bundled CLI for ManthanOS. It contains',
      'a single ESM file with the workspace dependencies inlined and',
      'a short list of external dependencies that npm installs at',
      'install time.',
      '',
      'Install:',
      '',
      '```',
      'npm install -g <path-to-tarball>',
      '```',
      '',
      'Source repository: https://github.com/DeadlyVirusIn/manthanos',
      '',
      'License: BSL-1.1 — see LICENSE.',
      '',
    ].join('\n'),
  );

  // 4. npm pack into apps/cli/.
  log('running npm pack on staged dir');
  execSync(`npm pack --pack-destination ${JSON.stringify(cliRoot)}`, {
    cwd: stageDir,
    stdio: 'inherit',
  });

  // Clean up the staging dir but leave the produced tarball in
  // apps/cli/ for downstream tooling to find.
  rmSync(stageDir, { recursive: true, force: true });

  log('done.');
}

await main();
