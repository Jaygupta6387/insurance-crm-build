import { randomBytes } from 'crypto';
import { spawn, spawnSync, execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { app } from 'electron';

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dataDir: string;
}

const getAppDataDir = () => join(app.getPath('userData'), 'postgresql');

const randomPassword = () => randomBytes(16).toString('hex');

export const getDefaultPostgresConfig = (): PostgresConfig => ({
  host: '127.0.0.1',
  port: 54329,
  user: 'insurecrm',
  password: randomPassword(),
  database: 'insurecrm_local',
  dataDir: join(getAppDataDir(), 'pgdata'),
});

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
    `/opt/homebrew/opt/postgresql@15/bin/${bin}`,
    `/usr/local/opt/postgresql@16/bin/${bin}`,
    `/usr/local/opt/postgresql@15/bin/${bin}`,
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

/** Try system PostgreSQL first, then bundled binaries */
export const isPostgresRunning = async (port: number): Promise<boolean> => {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -an | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return out.includes('LISTENING');
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

const startDedicatedCluster = async (
  config: PostgresConfig,
  pgCtl: string,
  initdb: string,
  onProgress: (msg: string) => void
): Promise<void> => {
  const pgEnv = pgRuntimeEnv(pgCtl, config.dataDir);

  if (!existsSync(config.dataDir)) {
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
    });
    if (result.status !== 0) {
      const err = [result.stderr?.toString(), result.stdout?.toString()].filter(Boolean).join('\n');
      throw new Error(err || 'initdb failed');
    }
  }

  onProgress(`Starting PostgreSQL on port ${config.port}…`);
  const args = ['-D', config.dataDir, '-o', `-p ${config.port}`, '-w', 'start'];
  if (process.platform === 'win32') args.splice(3, 1);

  spawn(pgCtl, args, {
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
    cwd: dirname(pgCtl),
    env: pgEnv,
  }).unref();

  await waitForPort(config.port, 45000);
  onProgress('PostgreSQL started');
};

export const installPostgres = async (
  config: PostgresConfig,
  onProgress: (msg: string) => void
): Promise<void> => {
  onProgress('Detecting PostgreSQL…');

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
  onProgress(`Using ${source} PostgreSQL tools…`);
  await startDedicatedCluster(config, pgCtl, initdb, onProgress);
};

const waitForPort = (port: number, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      if (await isPostgresRunning(port)) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`PostgreSQL did not start on port ${port} within ${Math.round(timeoutMs / 1000)}s`));
      }
      setTimeout(check, 500);
    };
    check();
  });

export const buildDatabaseUrl = (config: PostgresConfig): string =>
  `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;
