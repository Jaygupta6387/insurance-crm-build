/**
 * InsuredHub CRM — Windows Service Daemon Entry Point
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is the script that node-windows (or sc.exe) runs as the actual
 * Windows Service process.  It:
 *
 *   1. Sets INSTALL_MODE=SERVER so the backend knows it is running as a service.
 *   2. Loads service-daemon-config.json for database credentials, ports, paths.
 *   3. Forks the real backend (crm-bootstrap.cjs or src/server.js) in a child
 *      process so it can be independently restarted on crash.
 *   4. Implements automatic restart with exponential back-off.
 *   5. Writes Windows Event Log entries (via event-log npm package or console).
 *   6. Exposes a named-pipe / HTTP health endpoint so Electron can check status.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW IT IS INSTALLED
 * ─────────────────────────────────────────────────────────────────────────────
 *   Run:  node scripts/install-windows-service.mjs
 *   Or:   server-installer.ps1  (automated server setup)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO TEST WITHOUT WINDOWS SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 *   node resources/service-daemon.js --standalone
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCATION ON PRODUCTION SERVER
 * ─────────────────────────────────────────────────────────────────────────────
 *   C:\InsuredHub\service-daemon.js     ← this file
 *   C:\InsuredHub\service-daemon-config.json
 *   C:\InsuredHub\backend\crm-bootstrap.cjs  (or src/server.js)
 */

'use strict';

const { spawn }        = require('child_process');
const path             = require('path');
const fs               = require('fs');
const http             = require('http');
const os               = require('os');

// ── Constants ─────────────────────────────────────────────────────────────────
const SERVICE_NAME      = 'InsuredHubCRM';
const CONFIG_FILE       = path.join(__dirname, 'service-daemon-config.json');
const HEALTH_PORT       = Number(process.env.DAEMON_HEALTH_PORT || 47920);
const MIN_RESTART_MS    = 2_000;
const MAX_RESTART_MS    = 60_000;
const MAX_CRASH_COUNT   = 10;   // Give up restarting after 10 rapid crashes

// ── Load configuration ────────────────────────────────────────────────────────
function loadConfig() {
  const defaults = {
    backendDir:  path.join(__dirname, 'backend'),
    port:        5000,
    socketPort:  5001,
    dataRoot:    'C:\\InsuredHubData',
    logDir:      'C:\\InsuredHubData\\Logs',
    databaseUrl: '',
    installMode: 'SERVER',
    nodeEnv:     'production',
  };

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (err) {
    log('WARN', `Could not load config: ${err.message} — using defaults`);
  }
  return defaults;
}

// ── Logger ────────────────────────────────────────────────────────────────────
function log(level, message) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] [${SERVICE_NAME}] ${message}`;
  console.log(line);
  appendServiceLog(line);
}

let _logStream = null;
function appendServiceLog(line) {
  try {
    const cfg = loadConfig();
    const dir = cfg.logDir || path.join(os.homedir(), 'InsuredHubData', 'Logs');
    fs.mkdirSync(dir, { recursive: true });
    if (!_logStream) {
      const file = path.join(dir, 'windows-service.log');
      _logStream  = fs.createWriteStream(file, { flags: 'a' });
    }
    _logStream.write(line + '\n');
  } catch { /* non-fatal */ }
}

// ── Backend process manager ───────────────────────────────────────────────────
let backendProcess = null;
let restartMs      = MIN_RESTART_MS;
let crashCount     = 0;
let _shuttingDown  = false;

function resolveEntryScript(cfg) {
  const bundled = path.join(cfg.backendDir, 'crm-bootstrap.cjs');
  const source  = path.join(cfg.backendDir, 'src', 'server.js');
  if (fs.existsSync(bundled)) return bundled;
  if (fs.existsSync(source))  return source;
  throw new Error(`Backend entry not found in ${cfg.backendDir}`);
}

function buildEnv(cfg) {
  return {
    ...process.env,
    INSTALL_MODE:     cfg.installMode || 'SERVER',
    NODE_ENV:         cfg.nodeEnv     || 'production',
    PORT:             String(cfg.port || 5000),
    SOCKET_PORT:      String(cfg.socketPort || 5001),
    DATA_ROOT:        cfg.dataRoot    || 'C:\\InsuredHubData',
    LOG_DIR:          cfg.logDir      || '',
    DATABASE_URL:     cfg.databaseUrl || '',
    CRM_MODE:         'server',
    BROADCAST_COMPANY_NAME: cfg.companyName || os.hostname(),
    BROADCAST_LICENSE_ID:   cfg.licenseId   || '',
    BROADCAST_TENANT_ID:    cfg.tenantId    || '',
  };
}

function startBackend() {
  if (_shuttingDown) return;
  const cfg = loadConfig();

  let entry;
  try {
    entry = resolveEntryScript(cfg);
  } catch (err) {
    log('ERROR', err.message);
    return;
  }

  log('INFO', `Starting backend: ${entry}`);
  backendProcess = spawn(process.execPath, [entry], {
    cwd:        cfg.backendDir,
    env:        buildEnv(cfg),
    stdio:      ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProcess.stdout?.on('data', (d) => log('INFO',  String(d).trimEnd()));
  backendProcess.stderr?.on('data', (d) => log('ERROR', String(d).trimEnd()));

  backendProcess.on('error', (err) => {
    log('ERROR', `Backend process error: ${err.message}`);
  });

  backendProcess.on('exit', (code, signal) => {
    backendProcess = null;
    if (_shuttingDown) {
      log('INFO', 'Backend stopped (daemon shutting down)');
      return;
    }

    crashCount++;
    log('WARN', `Backend exited (code ${code}, signal ${signal}). Crash #${crashCount}`);

    if (crashCount >= MAX_CRASH_COUNT) {
      log('ERROR', `Too many crashes (${crashCount}). Stopping restart attempts.`);
      return;
    }

    log('INFO', `Restarting backend in ${restartMs}ms...`);
    setTimeout(() => {
      restartMs = Math.min(restartMs * 2, MAX_RESTART_MS);
      startBackend();
    }, restartMs);
  });

  // Reset back-off after stable run (>60s)
  setTimeout(() => {
    if (backendProcess && !_shuttingDown) {
      restartMs  = MIN_RESTART_MS;
      crashCount = 0;
    }
  }, 60_000);
}

// ── Daemon health server (used by Electron to check if daemon is alive) ────────
function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        service:       SERVICE_NAME,
        running:       !!backendProcess,
        pid:           backendProcess?.pid || null,
        crashCount,
        restartMs,
        uptimeSeconds: Math.floor(process.uptime()),
        hostname:      os.hostname(),
        time:          new Date().toISOString(),
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(HEALTH_PORT, '127.0.0.1', () => {
    log('INFO', `Daemon health server listening on port ${HEALTH_PORT}`);
  });

  server.on('error', (err) => {
    log('WARN', `Daemon health server error: ${err.message}`);
  });
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────
function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  log('INFO', `Received ${signal} — initiating graceful shutdown...`);

  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    // Give it 10s to shut down gracefully then SIGKILL
    setTimeout(() => {
      if (backendProcess) {
        log('WARN', 'Backend did not stop in time — force killing');
        backendProcess.kill('SIGKILL');
      }
      process.exit(0);
    }, 10_000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Startup ───────────────────────────────────────────────────────────────────
log('INFO', '═══════════════════════════════════════════════════════');
log('INFO', '  InsuredHub CRM Windows Service Daemon Starting');
log('INFO', `  Hostname : ${os.hostname()}`);
log('INFO', `  PID      : ${process.pid}`);
log('INFO', `  Node     : ${process.version}`);
log('INFO', '═══════════════════════════════════════════════════════');

startHealthServer();
startBackend();
