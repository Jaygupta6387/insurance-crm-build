import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { getCrmBackendPath, getCrmFrontendDistPath } from './app-paths.service';
import { crmChildEnv, getNodeExecutable } from './process-spawn.service';
import getPort from './get-port';
import { getInstallationMode } from './installation-mode.service';

let crmProcess: ChildProcess | null = null;
let crmPort = 0;
let lastCrmOutput = '';

const CLOUD_LICENSE_API =
  process.env.LICENSE_CLOUD_API_URL ||
  'https://super-admin-panel-crm-backend.onrender.com/api';

const getCrmLogDir = (): string => {
  const dir = join(app.getPath('userData'), 'logs', 'crm');
  mkdirSync(dir, { recursive: true });
  return dir;
};

const persistCrmLog = (output: string): string => {
  const dir = getCrmLogDir();
  const file = join(dir, 'last-startup.log');
  try {
    writeFileSync(file, output, 'utf8');
    return file;
  } catch {
    return file;
  }
};

const tailOutput = (text: string, maxLines = 40): string =>
  text.split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n').trim();

export const startCrmServer = async (env: Record<string, string>): Promise<number> => {
  if (crmProcess && crmPort > 0) {
    try {
      const res = await fetch(`http://127.0.0.1:${crmPort}/api/health`);
      if (res.ok) return crmPort;
    } catch {
      // stale — restart
    }
    stopCrmServer();
  }

  // Admin PC uses a stable port so employees can type a known address.
  // Desktop / single-PC can use any free port.
  const preferredPort = getInstallationMode().isServer() ? 18765 : 0;
  crmPort = await getPort(preferredPort);
  const backendPath = getCrmBackendPath();
  const bootstrap = join(backendPath, 'crm-bootstrap.cjs');
  const entry = join(backendPath, 'src/server.js');
  const frontendDist = getCrmFrontendDistPath();
  const logDir = join(getCrmLogDir(), 'runtime');
  mkdirSync(logDir, { recursive: true });

  if (!existsSync(bootstrap) && !existsSync(entry)) {
    throw new Error(`CRM backend not found: ${backendPath}`);
  }
  if (!existsSync(join(frontendDist, 'index.html'))) {
    throw new Error(`CRM frontend not found: ${join(frontendDist, 'index.html')}`);
  }
  if (!existsSync(join(backendPath, 'node_modules', 'express'))) {
    throw new Error(
      `CRM dependencies missing from install (${join(backendPath, 'node_modules')}). Reinstall InsureCRM Desktop.`
    );
  }

  const requiredModules = ['bcryptjs', 'zod', 'winston', '@prisma/client', 'jsonwebtoken', 'pg', 'prisma'];
  const missingMods = requiredModules.filter((m) => !existsSync(join(backendPath, 'node_modules', m)));
  if (missingMods.length) {
    throw new Error(`CRM install is incomplete (missing: ${missingMods.join(', ')}). Reinstall the latest version.`);
  }
  if (!existsSync(join(backendPath, 'node_modules', 'prisma', 'build', 'index.js'))) {
    throw new Error('Prisma CLI missing from install. Reinstall the latest InsureCRM Desktop.');
  }

  lastCrmOutput = '';
  let exited = false;
  let exitCode: number | null = null;

  const scriptPath = existsSync(bootstrap) ? bootstrap : entry;
  const nodeExe = getNodeExecutable();
  const installMode = getInstallationMode();
  const shareOnWifi = installMode.isServer();

  const childEnv = crmChildEnv({
    ...env,
    CRM_MODE: 'desktop',
    INSTALL_MODE: installMode.hasChosenMode() ? installMode.getMode() : 'DESKTOP',
    // Admin PC: listen on all interfaces + UDP so employees on the same Wi‑Fi find us.
    // Desktop / single-PC: localhost only (DESKTOP_LAN_SHARE=false).
    DESKTOP_LAN_SHARE: shareOnWifi ? 'true' : 'false',
    DISCOVERY_ENABLED: shareOnWifi ? 'true' : (env.DISCOVERY_ENABLED || 'false'),
    // Stable identity lets Employee PCs recognize this Admin after DHCP changes.
    DESKTOP_SERVER_ID: env.DESKTOP_SERVER_ID || env.DESKTOP_MACHINE_HASH || '',
    DEPLOYMENT_MODE: shareOnWifi ? 'SELF_HOSTED' : (env.DEPLOYMENT_MODE || 'OFFLINE'),
    PORT: String(crmPort),
    NODE_ENV: 'production',
    // Packaged Electron always marks the CRM child as packaged — blocks SKIP_LICENSE_*.
    INSURECRM_PACKAGED: app.isPackaged ? 'true' : 'false',
    // Meaningful auth brute-force limit (LAN-reachable Admin PCs especially).
    RATE_LIMIT_WINDOW_MS: '900000',
    RATE_LIMIT_MAX: shareOnWifi ? '5000' : '2000',
    AUTH_RATE_LIMIT_MAX: shareOnWifi ? '30' : '20',
    FRONTEND_URL: `http://127.0.0.1:${crmPort}`,
    FRONTEND_RESET_PASSWORD_URL: `http://127.0.0.1:${crmPort}`,
    DATABASE_URL: env.DESKTOP_DATABASE_URL || env.DATABASE_URL || '',
    DESKTOP_DATABASE_URL: env.DESKTOP_DATABASE_URL || env.DATABASE_URL || '',
    DESKTOP_BACKEND_ROOT: backendPath,
    DESKTOP_NODE_BINARY: nodeExe,
    CRM_LOG_DIR: logDir,
    DESKTOP_FRONTEND_DIST: frontendDist,
    LICENSE_CLOUD_API_URL: env.LICENSE_CLOUD_API_URL || CLOUD_LICENSE_API,
    // Persist last successful license heartbeat under userData (offline grace).
    DESKTOP_DATA_DIR: env.DESKTOP_DATA_DIR || app.getPath('userData'),
    // Bootstrap env — backend uses these to seed schema/admin/modules on first start
    DESKTOP_ADMIN_EMAIL: env.DESKTOP_ADMIN_EMAIL || '',
    DESKTOP_ADMIN_NAME: env.DESKTOP_ADMIN_NAME || '',
    DESKTOP_ENABLED_FEATURES: env.DESKTOP_ENABLED_FEATURES || '',
    DESKTOP_PLAN_TYPE: env.DESKTOP_PLAN_TYPE || '',
    DESKTOP_SUBSCRIPTION_END: env.DESKTOP_SUBSCRIPTION_END || '',
    DESKTOP_MAX_EMPLOYEES: env.DESKTOP_MAX_EMPLOYEES || '',
  });

  // Never inherit local-dev license bypass into the CRM child (release or accidental shell env).
  delete childEnv.SKIP_LICENSE_CHECK_FOR_LOCAL;
  delete childEnv.LOCAL_DEV_ADMIN_EMAIL;
  delete childEnv.LOCAL_DEV_ADMIN_PASSWORD;

  // utilityProcess passes Chromium --type=utility flags that break ELECTRON_RUN_AS_NODE on Windows.
  crmProcess = spawn(nodeExe, [scriptPath], {
    cwd: backendPath,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });

  const appendOutput = (chunk: Buffer | string) => {
    const text = String(chunk);
    lastCrmOutput += text;
    if (lastCrmOutput.length > 64_000) lastCrmOutput = lastCrmOutput.slice(-48_000);
    console.log('[CRM]', text.trimEnd());
  };

  crmProcess.stdout?.on('data', appendOutput);
  crmProcess.stderr?.on('data', appendOutput);
  crmProcess.on('error', (err) => {
    lastCrmOutput += `\n${err.message}`;
  });
  crmProcess.on('exit', (code) => {
    exited = true;
    exitCode = code ?? null;
    crmProcess = null;
  });

  try {
    await waitForServer(crmPort, () => ({ exited, exitCode, output: lastCrmOutput }));
  } catch (err) {
    if (crmProcess) {
      crmProcess.kill();
      crmProcess = null;
    }
    const logFile = persistCrmLog(lastCrmOutput);
    const base = err instanceof Error ? err.message : String(err);
    throw new Error(`${base}\n\nLog saved: ${logFile}`);
  }

  return crmPort;
};

export const stopCrmServer = (): void => {
  if (crmProcess) {
    crmProcess.kill();
    crmProcess = null;
  }
};

export const getCrmUrl = (): string => `http://127.0.0.1:${crmPort}`;

export const getCrmPort = (): number => crmPort;

export const getCrmAppUrl = (companySlug = 'local'): string => {
  const slug = encodeURIComponent(companySlug.replace(/^\/+|\/+$/g, '') || 'local');
  return `${getCrmUrl()}/${slug}/login`;
};

export const getFrontendPath = (): string => getCrmFrontendDistPath();

const waitForServer = (
  port: number,
  getStatus: () => { exited: boolean; exitCode: number | null; output: string },
  timeout = 90_000
): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now();

    const fail = (message: string) => {
      const { output } = getStatus();
      const log = tailOutput(output);
      reject(new Error(log ? `${message}\n\n${log}` : message));
    };

    const check = () => {
      const { exited, exitCode } = getStatus();
      if (exited) {
        fail(`CRM process exited before it was ready (code ${exitCode ?? 'unknown'})`);
        return;
      }

      fetch(`http://127.0.0.1:${port}/api/health`)
        .then((res) => {
          if (res.ok) resolve();
          else if (Date.now() - start > timeout) fail('CRM server failed to start');
          else setTimeout(check, 500);
        })
        .catch(() => {
          if (Date.now() - start > timeout) fail('CRM server failed to start');
          else setTimeout(check, 500);
        });
    };

    check();
  });
