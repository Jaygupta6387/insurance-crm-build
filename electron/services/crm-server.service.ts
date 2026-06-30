import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { getCrmBackendPath, getCrmFrontendDistPath } from './app-paths.service';
import { getNodeExecutable, nodeRuntimeEnv } from './process-spawn.service';
import getPort from './get-port';

let crmProcess: ChildProcess | null = null;
let crmPort = 0;

export const startCrmServer = async (env: Record<string, string>): Promise<number> => {
  if (crmProcess) return crmPort;

  crmPort = await getPort();
  const backendPath = getCrmBackendPath();
  const entry = join(backendPath, 'src/server.js');

  crmProcess = spawn(getNodeExecutable(), [entry], {
    cwd: backendPath,
    env: nodeRuntimeEnv({
      ...env,
      CRM_MODE: 'desktop',
      PORT: String(crmPort),
      NODE_ENV: 'production',
      FRONTEND_URL: `http://127.0.0.1:${crmPort}`,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });

  crmProcess.stdout?.on('data', (d) => console.log('[CRM]', String(d)));
  crmProcess.stderr?.on('data', (d) => console.error('[CRM]', String(d)));
  crmProcess.on('error', (err) => console.error('[CRM] spawn error', err));
  crmProcess.on('exit', () => { crmProcess = null; });

  await waitForServer(crmPort);
  return crmPort;
};

export const stopCrmServer = (): void => {
  if (crmProcess) {
    crmProcess.kill();
    crmProcess = null;
  }
};

export const getCrmUrl = (): string => `http://127.0.0.1:${crmPort}`;

export const getFrontendPath = (): string => getCrmFrontendDistPath();

const waitForServer = (port: number, timeout = 60000): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      fetch(`http://127.0.0.1:${port}/api/health`).then(() => resolve()).catch(() => {
        if (Date.now() - start > timeout) reject(new Error('CRM server failed to start'));
        else setTimeout(check, 500);
      });
    };
    check();
  });
