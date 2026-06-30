import { fork, ChildProcess } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { getCrmBackendPath, getCrmFrontendDistPath } from './app-paths.service';
import { nodeRuntimeEnv } from './process-spawn.service';
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

const tailOutput = (text: string, maxLines = 16): string =>
  text.split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n').trim();

export const startCrmServer = async (env: Record<string, string>): Promise<number> => {
  if (crmProcess) return crmPort;

  crmPort = await getPort();
  const backendPath = getCrmBackendPath();
  const entry = join(backendPath, 'src/server.js');
  const frontendDist = getCrmFrontendDistPath();
  const logDir = getCrmLogDir();

  lastCrmOutput = '';
  let exited = false;
  let exitCode: number | null = null;

  const childEnv = nodeRuntimeEnv({
    ...env,
    CRM_MODE: 'desktop',
    PORT: String(crmPort),
    NODE_ENV: 'production',
    FRONTEND_URL: `http://127.0.0.1:${crmPort}`,
    DATABASE_URL: env.DESKTOP_DATABASE_URL || env.DATABASE_URL || '',
    CRM_LOG_DIR: logDir,
    DESKTOP_FRONTEND_DIST: frontendDist,
    LICENSE_CLOUD_API_URL: env.LICENSE_CLOUD_API_URL || CLOUD_LICENSE_API,
  });

  crmProcess = fork(entry, [], {
    cwd: backendPath,
    env: childEnv,
    silent: true,
    windowsHide: true,
  });

  const appendOutput = (chunk: Buffer | string) => {
    const text = String(chunk);
    lastCrmOutput += text;
    if (lastCrmOutput.length > 32_000) lastCrmOutput = lastCrmOutput.slice(-24_000);
    console.log('[CRM]', text.trimEnd());
  };

  crmProcess.stdout?.on('data', appendOutput);
  crmProcess.stderr?.on('data', appendOutput);
  crmProcess.on('error', (err) => {
    lastCrmOutput += `\n${err.message}`;
    console.error('[CRM] spawn error', err);
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
    throw err;
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
      const { exited, exitCode, output } = getStatus();
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
