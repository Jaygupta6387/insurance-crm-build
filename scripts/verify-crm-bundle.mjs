#!/usr/bin/env node
/**
 * Fail CI if the CRM backend bundle is missing runtime artifacts.
 * Raw source (src/) is intentionally absent — it is compiled into crm-bootstrap.cjs.
 */
import { existsSync, statSync } from 'fs';
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

// Sanity: make sure src/ was NOT shipped (it must not appear in the bundle)
if (existsSync(join(backend, 'src'))) {
  console.error(
    'ERROR: src/ directory found inside .crm-bundle/backend — raw source must not ship.\n' +
    'Re-run: node scripts/sync-crm-app.mjs'
  );
  process.exit(1);
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

// ── 4. Frontend dist ───────────────────────────────────────────────────────
const frontendDist = join(root, '.crm-bundle', 'frontend', 'dist', 'index.html');
if (!existsSync(frontendDist)) {
  console.error('Missing frontend bundle:', frontendDist);
  process.exit(1);
}
console.log('  ✓ crm-frontend/dist/index.html');

console.log('\n✅ CRM bundle verification passed — no raw source code in bundle.');
