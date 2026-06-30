#!/usr/bin/env node
/**
 * Fail CI if the CRM backend bundle is missing runtime dependencies.
 * Catches "Cannot find module" errors before they reach Windows installers.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, 'packages/crm-backend');
const nm = join(backend, 'node_modules');

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
  '@prisma/client',
  'prisma',
];

const missing = required.filter((pkg) => !existsSync(join(nm, pkg, 'package.json')));

if (missing.length) {
  console.error('CRM backend missing npm packages:', missing.join(', '));
  console.error('Run: cd packages/crm-backend && npm ci');
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

const srcFiles = [];
const walk = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p);
    else if (name.name.endsWith('.js')) srcFiles.push(p);
  }
};
walk(join(backend, 'src'));

const forbidden = ['axios'];
for (const mod of forbidden) {
  const used = srcFiles.some((f) => readFileSync(f, 'utf8').includes(`require('${mod}')`));
  if (used) {
    console.error(`CRM src still requires '${mod}' — add to package.json or remove the require`);
    process.exit(1);
  }
}

const externals = new Set();
const requireRe = /require\(['"]([^.'"][^'"]*)['"]\)/g;
for (const file of srcFiles) {
  const content = readFileSync(file, 'utf8');
  let m;
  while ((m = requireRe.exec(content))) {
    const name = m[1].split('/')[0];
    if (!name.startsWith('.') && name !== 'node:') externals.add(name);
  }
}

const allowedBuiltin = new Set([
  'fs', 'path', 'crypto', 'util', 'os', 'stream', 'http', 'https', 'url', 'buffer', 'events',
  'child_process', 'tty', 'async_hooks', 'node:crypto', 'node:fs', 'node:path', 'node:util',
]);
const undeclared = [...externals].filter((name) => {
  if (allowedBuiltin.has(name) || name.startsWith('node:')) return false;
  return !existsSync(join(nm, name)) && !existsSync(join(nm, name, 'package.json'));
});

if (undeclared.length) {
  console.error('CRM src requires packages not installed in node_modules:', undeclared.join(', '));
  process.exit(1);
}

console.log('CRM bundle verification passed.');
