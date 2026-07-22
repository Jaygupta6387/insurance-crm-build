#!/usr/bin/env node
/**
 * install-windows-service.mjs
 *
 * Installs the InsuredHub backend as a native Windows Service using `node-windows`.
 *
 * REQUIREMENTS
 * ─────────────
 *   Node.js 18+
 *   node-windows package  (npm install -g node-windows OR bundled in resources/)
 *   Administrator privileges
 *
 * USAGE
 * ─────
 *   node install-windows-service.mjs --action install    (installs + starts the service)
 *   node install-windows-service.mjs --action uninstall  (stops + removes the service)
 *   node install-windows-service.mjs --action status     (prints current service status)
 *
 * WHAT IT DOES
 * ─────────────
 *   • Registers the backend (crm-bootstrap.cjs or server.js) as a Windows Service.
 *   • Configures automatic start on Windows boot.
 *   • Sets recovery actions: restart on first/second failure, reboot on third.
 *   • Writes logs to %ProgramData%\InsuredHub\logs\service.log
 */

import { execSync, exec as execCb } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const exec = promisify(execCb);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const require    = createRequire(import.meta.url);

// ── Constants ────────────────────────────────────────────────────────────────
const SERVICE_NAME        = 'InsuredHubServer';
const SERVICE_DISPLAY     = 'InsuredHub CRM Server';
const SERVICE_DESCRIPTION = 'InsuredHub Enterprise CRM Backend — Node.js API, PostgreSQL integration, UDP discovery and health monitoring.';
const LOG_DIR             = join(process.env.ProgramData || 'C:\\ProgramData', 'InsuredHub', 'logs');
const DATA_DIR            = join(process.env.ProgramData || 'C:\\ProgramData', 'InsuredHub');

// Resolve the backend entry point
const BACKEND_ENTRY = process.env.CRM_BACKEND_PATH
  || join(__dirname, '..', '.crm-bundle', 'backend', 'crm-bootstrap.cjs');

// ── Parse arguments ──────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const action  = args.find(a => a.startsWith('--action='))?.split('=')[1]
             || args[args.indexOf('--action') + 1]
             || 'install';

const log = (msg) => console.log(`[service-installer] ${msg}`);
const err = (msg) => console.error(`[service-installer] ERROR: ${msg}`);

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log(`Action: ${action}`);
  log(`Platform: ${process.platform}`);

  if (process.platform !== 'win32') {
    err('This script only works on Windows.');
    process.exit(1);
  }

  switch (action) {
    case 'install':   await install();   break;
    case 'uninstall': await uninstall(); break;
    case 'status':    await status();    break;
    default:
      err(`Unknown action: ${action}. Use install | uninstall | status`);
      process.exit(1);
  }
}

async function install() {
  log('Starting service installation...');

  // 1. Ensure data directories
  [LOG_DIR, DATA_DIR, join(DATA_DIR, 'Backups'), join(DATA_DIR, 'Uploads')].forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      log(`Created directory: ${dir}`);
    }
  });

  // 2. Check if node-windows is available
  let Service;
  try {
    const nw = require('node-windows');
    Service = nw.Service;
  } catch {
    log('node-windows not found — falling back to sc.exe installation');
    await installViaSc();
    return;
  }

  // 3. Build environment variables for the service
  const envVars = buildServiceEnv();

  // 4. Create node-windows Service
  const svc = new Service({
    name:        SERVICE_NAME,
    description: SERVICE_DESCRIPTION,
    script:      BACKEND_ENTRY,
    nodeOptions: ['--max-old-space-size=512'],
    env:         envVars,
    workingDirectory: dirname(BACKEND_ENTRY),
    logpath:     LOG_DIR,
    wait:        2,    // seconds to wait before restarting
    grow:        0.25, // increase wait by 25% each restart
    maxRestarts: 10,
    abortOnError: false,
  });

  svc.on('install', () => {
    log('Service installed successfully — starting...');
    svc.start();
  });

  svc.on('start', () => {
    log(`✅ Service "${SERVICE_DISPLAY}" started successfully!`);
    log(`   Run 'sc query ${SERVICE_NAME}' to verify.`);
    writeInstallLog({ action: 'install', success: true, timestamp: new Date().toISOString() });
  });

  svc.on('error', (e) => {
    err(`Service event error: ${e}`);
    writeInstallLog({ action: 'install', success: false, error: String(e) });
    process.exit(1);
  });

  svc.install();

  // 5. Configure recovery actions via sc.exe
  await configureRecovery();
}

async function uninstall() {
  log('Uninstalling service...');

  let Service;
  try {
    const nw = require('node-windows');
    Service = nw.Service;
  } catch {
    await uninstallViaSc();
    return;
  }

  const svc = new Service({ name: SERVICE_NAME, script: BACKEND_ENTRY });

  svc.on('uninstall', () => {
    log(`✅ Service "${SERVICE_DISPLAY}" removed successfully.`);
    writeInstallLog({ action: 'uninstall', success: true, timestamp: new Date().toISOString() });
  });

  svc.on('error', (e) => {
    err(`Uninstall error: ${e}`);
  });

  svc.uninstall();
}

async function status() {
  try {
    const { stdout } = await exec(`sc query "${SERVICE_NAME}"`);
    log('Service status:');
    console.log(stdout);
  } catch (e) {
    if (e.message.includes('1060')) {
      log(`Service "${SERVICE_NAME}" is NOT installed.`);
    } else {
      err(e.message);
    }
  }
}

// ── Fallback: raw sc.exe installation (no node-windows) ─────────────────────
async function installViaSc() {
  log('Installing via sc.exe (no node-windows)...');

  const nodePath  = process.execPath;
  const binPath   = `"${nodePath}" "${BACKEND_ENTRY}"`;

  // sc create
  await exec(`sc create "${SERVICE_NAME}" binPath= "${binPath}" start= auto DisplayName= "${SERVICE_DISPLAY}"`);
  await exec(`sc description "${SERVICE_NAME}" "${SERVICE_DESCRIPTION}"`);
  await exec(`sc start "${SERVICE_NAME}"`);
  await configureRecovery();

  log(`✅ Service installed and started via sc.exe`);
  writeInstallLog({ action: 'install', method: 'sc.exe', success: true });
}

async function uninstallViaSc() {
  try {
    await exec(`sc stop "${SERVICE_NAME}"`);
    await new Promise(r => setTimeout(r, 2000));
  } catch { /* already stopped */ }
  await exec(`sc delete "${SERVICE_NAME}"`);
  log(`✅ Service removed via sc.exe`);
}

async function configureRecovery() {
  // Restart on first and second failure, restart on third
  // actions= <action type>,<delay ms>,<action type>,<delay ms>,...
  try {
    await exec(
      `sc failure "${SERVICE_NAME}" reset= 86400 actions= restart/5000/restart/10000/restart/30000`
    );
    log('Recovery actions configured (restart on failure)');
  } catch (e) {
    log(`Warning: Could not set recovery actions: ${e.message}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildServiceEnv() {
  // Read from config file if present
  const configPath = join(DATA_DIR, 'server-config.json');
  let config = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { /* ignore */ }
  }

  return [
    { name: 'NODE_ENV',        value: 'production' },
    { name: 'CRM_MODE',        value: 'server' },
    { name: 'PORT',            value: String(config.port || 5000) },
    { name: 'DATA_ROOT',       value: config.dataRoot || DATA_DIR },
    { name: 'LOG_DIR',         value: LOG_DIR },
    { name: 'DEPLOYMENT_MODE', value: 'SELF_HOSTED' },
    { name: 'DISCOVERY_ENABLED', value: 'true' },
    ...(config.databaseUrl ? [{ name: 'DATABASE_URL', value: config.databaseUrl }] : []),
  ];
}

function writeInstallLog(data) {
  const logFile = join(LOG_DIR, 'install.log');
  const line    = JSON.stringify({ ...data, timestamp: new Date().toISOString() }) + '\n';
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const existing = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
    writeFileSync(logFile, existing + line);
  } catch { /* ignore */ }
}

main().catch((e) => {
  console.error('[service-installer] Fatal:', e.message);
  process.exit(1);
});
