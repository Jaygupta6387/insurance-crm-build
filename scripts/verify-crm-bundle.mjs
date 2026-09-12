#!/usr/bin/env node
/**
 * Fail CI if the CRM backend bundle is missing runtime artifacts.
 * Business source is compiled into crm-bootstrap.cjs; only Prisma query
 * engines may remain under src/generated/*.
 */
import { existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, '.crm-bundle', 'backend');
const nm = join(backend, 'node_modules');

// ── 1. Bundle entry point ──────────────────────────────────────────────────
const bootstrap = join(backend, 'crm-bootstrap.cjs');
if (!existsSync(bootstrap)) {
  console.error('Missing crm-bootstrap.cjs — run: node scripts/sync-crm-app.mjs');
  process.exit(1);
}
const bootstrapKB = (statSync(bootstrap).size / 1024).toFixed(1);
console.log(`  ✓ crm-bootstrap.cjs (${bootstrapKB} KB)`);

// Sanity: raw business source must not ship. Prisma engines under
// src/generated/{company,superadmin}-client/ are required at runtime.
const srcDir = join(backend, 'src');
if (existsSync(srcDir)) {
  const banned = ['server.js', 'modules', 'core', 'config', 'middleware', 'validators'];
  const leaked = banned.filter((name) => existsSync(join(srcDir, name)));
  if (leaked.length) {
    console.error(
      'ERROR: raw CRM source found in .crm-bundle/backend/src (' +
        leaked.join(', ') +
        ').\nRe-run: node scripts/sync-crm-app.mjs'
    );
    process.exit(1);
  }
  const generated = join(srcDir, 'generated');
  if (!existsSync(generated)) {
    console.error('ERROR: src/ exists but src/generated/ (Prisma engines) is missing');
    process.exit(1);
  }
  console.log('  ✓ src/ contains only Prisma generated engines');
} else {
  console.warn('  ⚠ no src/generated engines — Windows/Mac native Prisma may fail at runtime');
}

// ── 2. Required npm packages ───────────────────────────────────────────────
const required = [
  'express',
  'cors',
  'helmet',
  'cookie-parser',
  'dotenv',
  'zod',
  'winston',
  'bcryptjs',
  'jsonwebtoken',
  'express-rate-limit',
  'nodemailer',
  'multer',
  'exceljs',
  '@prisma/client',
  'prisma',
];

const missing = required.filter((pkg) => !existsSync(join(nm, pkg, 'package.json')));
if (missing.length) {
  console.error('CRM backend missing npm packages:', missing.join(', '));
  process.exit(1);
}
console.log(`  ✓ node_modules (${required.length} required packages present)`);

// ── 3. Prisma schemas + migrations ────────────────────────────────────────
const prismaFiles = [
  join(backend, 'prisma', 'company.prisma'),
  join(backend, 'prisma', 'superadmin.prisma'),
];
for (const f of prismaFiles) {
  if (!existsSync(f)) {
    console.error('Missing Prisma schema:', f);
    process.exit(1);
  }
}
console.log('  ✓ prisma/ schemas present');

// Prefer at least one query engine binary for the platforms we ship
const engineRoots = [
  join(backend, 'src', 'generated', 'company-client'),
  join(backend, 'src', 'generated', 'superadmin-client'),
];
let engineCount = 0;
for (const dir of engineRoots) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.includes('query_engine') || name.endsWith('.node')) engineCount += 1;
  }
}
if (engineCount === 0) {
  console.error('Missing Prisma query engine binaries under src/generated/');
  process.exit(1);
}
console.log(`  ✓ Prisma query engines (${engineCount})`);

// ── 4. Frontend dist ───────────────────────────────────────────────────────
const frontendDist = join(root, '.crm-bundle', 'frontend', 'dist', 'index.html');
if (!existsSync(frontendDist)) {
  console.error('Missing frontend bundle:', frontendDist);
  process.exit(1);
}
console.log('  ✓ crm-frontend/dist/index.html');

console.log('\n✅ CRM bundle verification passed — no raw source code in bundle.');
