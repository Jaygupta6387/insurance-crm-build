#!/usr/bin/env node
/**
 * Sync the CRM application from New-CRM 2 into .crm-bundle for desktop packaging.
 * New-CRM 2 is the single source of truth — this folder is build output only.
 *
 * Override source path (CI): CRM_APP_PATH=/path/to/crm-app node scripts/sync-crm-app.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const crmApp = process.env.CRM_APP_PATH || join(root, '..', 'New-CRM 2');
const crmBackend = join(crmApp, 'backend');
const crmFrontend = join(crmApp, 'frontend');
const bundle = join(root, '.crm-bundle');
const bundleBackend = join(bundle, 'backend');
const bundleFrontendDist = join(bundle, 'frontend', 'dist');

const skipDir = new Set(['node_modules', 'logs', '.git']);
const skipFile = /\.env(\.|$)/;

const shouldCopy = (base, srcPath) => {
  const rel = relative(base, srcPath);
  if (!rel || rel === '.') return true;
  const parts = rel.split(/[/\\]/);
  if (parts.some((p) => skipDir.has(p))) return false;
  if (skipFile.test(parts[parts.length - 1] || '')) return false;
  return true;
};

const copyTree = (src, dest) => {
  cpSync(src, dest, {
    recursive: true,
    filter: (srcPath) => shouldCopy(src, srcPath),
  });
};

const run = (cmd, cwd) => {
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
};

if (!existsSync(join(crmBackend, 'package.json'))) {
  console.error('CRM backend not found at:', crmBackend);
  console.error('Set CRM_APP_PATH to your New-CRM 2 (or crm-app repo) checkout.');
  process.exit(1);
}

console.log('Syncing CRM app from:', crmApp);

if (existsSync(bundle)) rmSync(bundle, { recursive: true, force: true });
mkdirSync(bundleBackend, { recursive: true });
mkdirSync(dirname(bundleFrontendDist), { recursive: true });

console.log('→ Copying backend...');
copyTree(crmBackend, bundleBackend);

console.log('→ Installing backend dependencies...');
run('npm ci', bundleBackend);

console.log('→ Generating Prisma clients...');
run('npx prisma generate --schema=prisma/company.prisma', bundleBackend);
run('npx prisma generate --schema=prisma/superadmin.prisma', bundleBackend);

if (!existsSync(join(crmFrontend, 'package.json'))) {
  console.error('CRM frontend not found at:', crmFrontend);
  process.exit(1);
}

console.log('→ Building frontend...');
run('npm ci', crmFrontend);
run('npm run build', crmFrontend);

console.log('→ Copying frontend dist...');
cpSync(join(crmFrontend, 'dist'), bundleFrontendDist, { recursive: true });

console.log('CRM bundle ready at .crm-bundle/');
