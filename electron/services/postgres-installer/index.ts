import { randomBytes } from 'crypto';
import { spawnSync, execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, rmSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import net from 'net';
import { app } from 'electron';

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dataDir: string;
}

const PORT_CANDIDATES = [54329, 54330, 54331, 54332, 54333];
const START_TIMEOUT_SEC = 120;

const getAppDataDir = () => join(app.getPath('userData'), 'postgresql');

const randomPassword = () => randomBytes(16).toString('hex');

export const getDefaultPostgresConfig = (): PostgresConfig => ({
  host: '127.0.0.1',
  port: PORT_CANDIDATES[0],
  user: 'insurecrm',
  password: randomPassword(),
  database: 'insurecrm_local',
  dataDir: join(getAppDataDir(), 'pgdata'),
});

export const resetPostgresData = (): void => {
  const base = getAppDataDir();
  if (!existsSync(base)) return;
  const stamp = Date.now();
  try {
    renameSync(join(base, 'pgdata'), join(base, `pgdata.failed.${stamp}`));
  } catch {
    rmSync(join(base, 'pgdata'), { recursive: true, force: true });
  }
};

const bundledPgBin = (bin: string): string | null => {
  const platform = process.platform === 'win32' ? 'postgresql-win' : 'postgresql-mac';
  const packaged = join(process.resourcesPath, 'resources', platform, 'bin', bin);
  if (existsSync(packaged)) return packaged;
  const dev = join(__dirname, '../../../resources', platform, 'bin', bin);
  if (existsSync(dev)) return dev;
  return null;
};

const findWindowsPgBin = (bin: string): string | null => {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean) as string[];

  for (const root of roots) {
    const pgRoot = join(root, 'PostgreSQL');
    if (!existsSync(pgRoot)) continue;

    let versions: string[] = [];
    try {
      versions = readdirSync(pgRoot).filter((name) => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a));
    } catch {
      continue;
    }

    for (const version of versions) {
      const candidate = join(pgRoot, version, 'bin', bin);
      if (existsSync(candidate)) return candidate;
    }
  }

  try {
    const output = execSync(`where ${bin}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const first = output.split(/\r?\n/).find((line) => line.trim());
    if (first && existsSync(first.trim())) return first.trim();
  } catch {
    // not on PATH
  }

  return null;
};

const findMacPgBin = (bin: string): string | null => {
  const candidates = [
    `/opt/homebrew/opt/postgresql@16/bin/${bin}`,
    `/opt/homebrew/opt/postgresql@18/bin/${bin}`,
    `/opt/homebrew/opt/postgresql@15/bin/${bin}`,
    `/usr/local/opt/postgresql@16/bin/${bin}`,
    `/opt/homebrew/bin/${bin}`,
    `/usr/local/bin/${bin}`,
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  try {
    const output = execSync(`which ${bin}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (output && existsSync(output)) return output;
  } catch {
    // not on PATH
  }

  return null;
};

const resolvePgBin = (bin: string): string | null => {
  const bundled = bundledPgBin(bin);
  if (bundled) return bundled;
  if (process.platform === 'win32') return findWindowsPgBin(bin);
  if (process.platform === 'darwin') return findMacPgBin(bin);
  return null;
};

const isPortListening = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });

export const isPostgresRunning = async (port: number): Promise<boolean> => {
  if (await isPortListening(port)) return true;

  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -an | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return /LISTENING/i.test(out);
    }
    execSync(`lsof -i :${port}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

const pgRuntimeEnv = (pgCtl: string, dataDir: string): NodeJS.ProcessEnv => {
  const pgBinDir = dirname(pgCtl);
  const pgRoot = dirname(pgBinDir);
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const existingPath = process.env[pathKey] || '';
  return {
    ...process.env,
    PGDATA: dataDir,
    [pathKey]: `${pgBinDir}${pathSep}${pgRoot}${pathSep}${existingPath}`,
  };
};

const isClusterInitialized = (dataDir: string): boolean =>
  existsSync(join(dataDir, 'PG_VERSION'));

const readRecentLog = (dataDir: string): string => {
  const candidates = [
    join(dataDir, 'log'),
    join(dataDir, 'postgresql.log'),
    join(getAppDataDir(), 'postgres.log'),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const content = readFileSync(file, 'utf8');
      return content.split('\n').slice(-12).join('\n').trim();
    } catch {
      // try next
    }
  }
  return '';
};

const removeStalePidFile = (dataDir: string, port: number): void => {
  const pidFile = join(dataDir, 'postmaster.pid');
  if (!existsSync(pidFile)) return;
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -an | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      if (/LISTENING/i.test(out)) return;
    } else {
      execSync(`lsof -i :${port}`, { stdio: 'pipe' });
      return;
    }
  } catch {
    // port not in use — safe to remove stale pid
  }
  try {
    unlinkSync(pidFile);
  } catch {
    // ignore
  }
};

const runInitdb = (
  initdb: string,
  pgCtl: string,
  config: PostgresConfig,
  pgEnv: NodeJS.ProcessEnv,
  onProgress: (msg: string) => void
): void => {
  mkdirSync(config.dataDir, { recursive: true });
  onProgress('Initializing local PostgreSQL data directory…');
  const initArgs = process.platform === 'win32'
    ? ['-D', config.dataDir, '-U', config.user, '--auth-local=trust', '--auth-host=scram-sha-256', '-E', 'UTF8']
    : ['-D', config.dataDir, '-U', config.user, '-E', 'UTF8'];

  const result = spawnSync(initdb, initArgs, {
    env: pgEnv,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    cwd: dirname(pgCtl),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const err = [result.stderr, result.stdout].filter(Boolean).join('\n');
    throw new Error(err || 'initdb failed');
  }
};

const startPostgresServer = (
  pgCtl: string,
  config: PostgresConfig,
  pgEnv: NodeJS.ProcessEnv,
  onProgress: (msg: string) => void
): void => {
  const logFile = join(getAppDataDir(), 'postgres.log');
  mkdirSync(dirname(logFile), { recursive: true });

  onProgress(`Starting PostgreSQL on port ${config.port}…`);

  const args = [
    '-D', config.dataDir,
    '-o', `-p ${config.port}`,
    '-w',
    '-t', String(START_TIMEOUT_SEC),
    '-l', logFile,
    'start',
  ];

  const result = spawnSync(pgCtl, args, {
    env: pgEnv,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    cwd: dirname(pgCtl),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    let logTail = readRecentLog(config.dataDir);
    if (!logTail) {
      try {
        logTail = readFileSync(logFile, 'utf8').slice(-800);
      } catch {
        // no log yet
      }
    }
    const detail = [result.stderr, result.stdout, logTail].filter(Boolean).join('\n').trim();
    throw new Error(detail || 'pg_ctl start failed');
  }
};

const pickAvailablePort = async (onProgress: (msg: string) => void): Promise<number> => {
  for (const port of PORT_CANDIDATES) {
    if (!(await isPostgresRunning(port))) return port;
  }
  onProgress('Default ports busy — using 54329 anyway');
  return PORT_CANDIDATES[0];
};

const buildStartFailureMessage = (port: number, dataDir: string, cause?: string): string => {
  const log = readRecentLog(dataDir);
  const tips = [
    'Quit other PostgreSQL services or apps using the same port.',
    'Temporarily disable antivirus/firewall blocking local apps.',
    'Click "Reset database & retry" in setup to recreate the local data folder.',
    'Restart your computer and run setup again.',
  ];

  const parts = [
    `PostgreSQL did not start on port ${port} within ${START_TIMEOUT_SEC}s.`,
    cause ? `Details: ${cause}` : null,
    log ? `Log:\n${log}` : null,
    `Try:\n${tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
  ].filter(Boolean);

  return parts.join('\n\n');
};

const startDedicatedCluster = async (
  config: PostgresConfig,
  pgCtl: string,
  initdb: string,
  onProgress: (msg: string) => void,
  allowReset: boolean
): Promise<void> => {
  const pgEnv = pgRuntimeEnv(pgCtl, config.dataDir);

  if (isClusterInitialized(config.dataDir)) {
    removeStalePidFile(config.dataDir, config.port);
    const status = spawnSync(pgCtl, ['-D', config.dataDir, 'status'], {
      env: pgEnv,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      cwd: dirname(pgCtl),
    });
    if (status.stdout?.includes('server is running')) {
      onProgress('PostgreSQL cluster already running');
      return;
    }
  } else if (existsSync(config.dataDir)) {
    onProgress('Removing incomplete database folder…');
    rmSync(config.dataDir, { recursive: true, force: true });
  }

  if (!isClusterInitialized(config.dataDir)) {
    runInitdb(initdb, pgCtl, config, pgEnv, onProgress);
  }

  try {
    startPostgresServer(pgCtl, config, pgEnv, onProgress);
    await waitForPort(config.port, 15000);
    onProgress('PostgreSQL started');
  } catch (firstErr) {
    if (!allowReset) throw firstErr;

    onProgress('Startup failed — resetting local database and retrying once…');
    resetPostgresData();
    config.dataDir = join(getAppDataDir(), 'pgdata');
    const retryEnv = pgRuntimeEnv(pgCtl, config.dataDir);
    runInitdb(initdb, pgCtl, config, retryEnv, onProgress);
    startPostgresServer(pgCtl, config, retryEnv, onProgress);
    await waitForPort(config.port, 20000);
    onProgress('PostgreSQL started after reset');
  }
};

export const installPostgres = async (
  config: PostgresConfig,
  onProgress: (msg: string) => void
): Promise<void> => {
  onProgress('Detecting PostgreSQL…');

  config.port = await pickAvailablePort(onProgress);

  if (await isPostgresRunning(config.port)) {
    onProgress(`PostgreSQL already running on port ${config.port}`);
    return;
  }

  const binName = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl';
  const initName = process.platform === 'win32' ? 'initdb.exe' : 'initdb';
  const pgCtl = resolvePgBin(binName);
  const initdb = resolvePgBin(initName);

  if (!pgCtl || !initdb) {
    const help =
      process.platform === 'win32'
        ? 'Install PostgreSQL 16 from https://www.postgresql.org/download/windows/ (use default options), then restart InsureCRM Desktop and run setup again.'
        : 'Install PostgreSQL via Homebrew (`brew install postgresql@16`) or bundle binaries in resources/postgresql-mac/.';
    throw new Error(`PostgreSQL was not found on this computer. ${help}`);
  }

  const source = bundledPgBin(binName) ? 'bundled' : 'system';
  onProgress(`Using ${source} PostgreSQL tools on port ${config.port}…`);

  try {
    await startDedicatedCluster(config, pgCtl, initdb, onProgress, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(buildStartFailureMessage(config.port, config.dataDir, message));
  }
};

const waitForPort = (port: number, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      if (await isPostgresRunning(port)) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`port ${port} not accepting connections`));
      }
      setTimeout(check, 400);
    };
    check();
  });

export const buildDatabaseUrl = (config: PostgresConfig): string =>
  `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;
