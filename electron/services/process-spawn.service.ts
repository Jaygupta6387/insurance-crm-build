import { spawn } from 'child_process';
import { sanitizeProcessEnv } from './env-utils';

/** Electron bundles Node — system `node` / `npx` are often missing in packaged Windows installs. */
export const getNodeExecutable = (): string => process.execPath;

export const nodeRuntimeEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
  const env = sanitizeProcessEnv({ ...process.env, ...extra });
  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = '1';
    delete env.NODE_OPTIONS;
  }
  return env;
};

export const spawnAsync = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; label?: string }
): Promise<{ stdout: string; stderr: string; code: number | null }> =>
  new Promise((resolve, reject) => {
    const executable = command?.trim();
    if (!executable) {
      reject(new Error('Cannot start process: executable path is empty'));
      return;
    }

    const safeArgs = args.map((arg) => (arg == null ? '' : String(arg)));
    const env = options.env ? sanitizeProcessEnv(options.env) : sanitizeProcessEnv(process.env);
    const label = options.label ?? executable;

    const child = spawn(executable, safeArgs, {
      cwd: options.cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      reject(new Error(`${label} failed: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      const detail = [stderr, stdout].filter(Boolean).join('\n').trim();
      reject(new Error(detail ? `${label} exited ${code}: ${detail}` : `${label} exited ${code}`));
    });
  });

export const runNodeScript = (
  scriptPath: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; label?: string }
): Promise<{ stdout: string; stderr: string; code: number | null }> =>
  spawnAsync(getNodeExecutable(), [scriptPath, ...args], {
    cwd: options.cwd,
    env: nodeRuntimeEnv(options.env),
    label: options.label,
  });
