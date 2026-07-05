#!/usr/bin/env node
/**
 * Fail CI if the CRM backend bundle is missing runtime dependencies.
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, '.crm-bundle', 'backend');
const nm = join(backend, 'node_modules');

if (!existsSync(join(backend, 'package.json'))) {
  console.error('Missing .crm-bundle/backend — run: node scripts/sync-crm-app.mjs');
  process.exit(1);
}

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
  'swagger-jsdoc',
  'swagger-ui-express',
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

const generated = [
  join(backend, 'src/generated/company-client/index.js'),
  join(backend, 'src/generated/superadmin-client/index.js'),
];

for (const file of generated) {
  if (!existsSync(file)) {
    console.error('Missing Prisma client:', file);
    process.exit(1);
  }
}

const frontendDist = join(root, '.crm-bundle', 'frontend', 'dist', 'index.html');
if (!existsSync(frontendDist)) {
  console.error('Missing frontend bundle:', frontendDist);
  process.exit(1);
}

const serverJs = join(backend, 'src', 'server.js');
if (!existsSync(serverJs)) {
  console.error('Missing backend server.js:', serverJs);
  process.exit(1);
}

const serverSource = await import('fs').then((fs) => fs.readFileSync(serverJs, 'utf8'));
if (!serverSource.includes('DESKTOP_FRONTEND_DIST')) {
  console.error('Backend server.js is missing desktop SPA routes (DESKTOP_FRONTEND_DIST).');
  process.exit(1);
}

console.log('CRM bundle verification passed.');
