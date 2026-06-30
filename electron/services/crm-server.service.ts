import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { getCrmBackendPath, getCrmFrontendDistPath } from './app-paths.service';
import { crmChildEnv, getNodeExecutable } from './process-spawn.service';
import getPort from './get-port';

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

  crmPort = await getPort();
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

  lastCrmOutput = '';
  let exited = false;
  let exitCode: number | null = null;

  const childEnv = crmChildEnv({
    ...env,
    CRM_MODE: 'desktop',
    PORT: String(crmPort),
    NODE_ENV: 'production',
    FRONTEND_URL: `http://127.0.0.1:${crmPort}`,
    DATABASE_URL: env.DESKTOP_DATABASE_URL || env.DATABASE_URL || '',
    DESKTOP_DATABASE_URL: env.DESKTOP_DATABASE_URL || env.DATABASE_URL || '',
    CRM_LOG_DIR: logDir,
    DESKTOP_FRONTEND_DIST: frontendDist,
    LICENSE_CLOUD_API_URL: env.LICENSE_CLOUD_API_URL || CLOUD_LICENSE_API,
  });

  const scriptPath = existsSync(bootstrap) ? bootstrap : entry;
  const nodeExe = getNodeExecutable();

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
