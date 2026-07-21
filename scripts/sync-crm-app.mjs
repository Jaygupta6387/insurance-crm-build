#!/usr/bin/env node
/**
 * Sync the CRM application from New-CRM 2 into .crm-bundle for desktop packaging.
 *
 * What ships in the installer:
 *   crm-backend/
 *     crm-bootstrap.cjs   ← all backend source bundled into one opaque file
 *     node_modules/       ← npm packages (required at runtime; cannot be bundled due to native modules)
 *     prisma/             ← schemas + migrations (needed for DB bootstrap)
 *     package.json        ← required for node module resolution
 *   crm-frontend/dist/    ← compiled frontend assets
 *
 * Raw source code (src/) is NOT copied — it is compiled away into crm-bootstrap.cjs.
 *
 * Override source path (CI): CRM_APP_PATH=/path/to/crm-app node scripts/sync-crm-app.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const crmApp = process.env.CRM_APP_PATH || join(root, '..', 'New-CRM 2');
const crmBackend = join(crmApp, 'backend');
const crmFrontend = join(crmApp, 'frontend');
const bundle = join(root, '.crm-bundle');
const bundleBackend = join(bundle, 'backend');
const bundleFrontendDist = join(bundle, 'frontend', 'dist');

const run = (cmd, cwd, env = {}) => {
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
};

if (!existsSync(join(crmBackend, 'package.json'))) {
  console.error('CRM backend not found at:', crmBackend);
  console.error('Set CRM_APP_PATH to your New-CRM 2 checkout.');
  process.exit(1);
}

console.log('Syncing CRM app from:', crmApp);

// ── Clean slate ────────────────────────────────────────────────────────────
if (existsSync(bundle)) rmSync(bundle, { recursive: true, force: true });
mkdirSync(bundleBackend, { recursive: true });
mkdirSync(dirname(bundleFrontendDist), { recursive: true });

// ── Copy only runtime-required non-source files ────────────────────────────
// Raw source (src/) is intentionally NOT copied — it will be bundled below.
const RUNTIME_DIRS = ['prisma', 'scripts'];
const RUNTIME_FILES = ['package.json', 'package-lock.json'];

console.log('→ Copying runtime assets (prisma, package.json)...');
for (const dir of RUNTIME_DIRS) {
  const src = join(crmBackend, dir);
  if (existsSync(src)) {
    cpSync(src, join(bundleBackend, dir), { recursive: true });
    console.log(`  ✓ ${dir}/`);
  }
}
for (const file of RUNTIME_FILES) {
  const src = join(crmBackend, file);
  if (existsSync(src)) {
    cpSync(src, join(bundleBackend, file));
    console.log(`  ✓ ${file}`);
  }
}

// ── Install backend dependencies ───────────────────────────────────────────
console.log('→ Installing backend dependencies...');
run('npm ci --ignore-scripts', bundleBackend);

// ── Generate Prisma clients ────────────────────────────────────────────────
console.log('→ Generating Prisma clients...');
run('npx prisma generate --schema=prisma/company.prisma', bundleBackend);
run('npx prisma generate --schema=prisma/superadmin.prisma', bundleBackend);

// ── Bundle backend source into a single opaque file ───────────────────────
// Uses esbuild installed in the desktop project (devDependency).
// All local require() chains from src/ are inlined; npm packages stay external.
// The result is a single crm-bootstrap.cjs — no src/ shipped in the installer.
console.log('→ Bundling backend source into crm-bootstrap.cjs...');
const esbuildBin = join(root, 'node_modules', '.bin', 'esbuild');
const outFile = join(bundleBackend, 'crm-bootstrap.cjs');

run(
  [
    `"${esbuildBin}"`,
    'src/server.js',
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--packages=external',
    '--keep-names',
    `--outfile="${outFile}"`,
  ].join(' '),
  crmBackend,
);

const bundleSize = (statSync(outFile).size / 1024).toFixed(1);
console.log(`  ✓ crm-bootstrap.cjs (${bundleSize} KB) — src/ not shipped`);

// ── Build frontend ─────────────────────────────────────────────────────────
if (!existsSync(join(crmFrontend, 'package.json'))) {
  console.error('CRM frontend not found at:', crmFrontend);
  process.exit(1);
}

console.log('→ Building frontend (same-origin /api for desktop)...');
run('npm ci', crmFrontend);
run('npm run build', crmFrontend, { VITE_API_URL: '' });

console.log('→ Copying frontend dist...');
cpSync(join(crmFrontend, 'dist'), bundleFrontendDist, { recursive: true });

console.log('\n✅ CRM bundle ready at .crm-bundle/');
console.log('   crm-backend/crm-bootstrap.cjs  ← bundled source (no raw src/)');
console.log('   crm-backend/node_modules/       ← npm packages');
console.log('   crm-backend/prisma/             ← schemas + migrations');
console.log('   crm-frontend/dist/              ← compiled UI');
