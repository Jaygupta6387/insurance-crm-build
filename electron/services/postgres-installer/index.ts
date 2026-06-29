import { randomBytes } from 'crypto';
import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
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
  const base = join(process.resourcesPath, 'resources', platform, 'bin', bin);
  if (existsSync(base)) return base;
  const devBase = join(__dirname, '../../resources', platform, 'bin', bin);
  if (existsSync(devBase)) return devBase;
  return null;
};

/** Try system PostgreSQL first, then bundled binaries */
export const isPostgresRunning = async (port: number): Promise<boolean> => {
  try {
    if (process.platform === 'win32') {
      execSync(`netstat -an | findstr :${port}`, { stdio: 'pipe' });
      return true;
    }
    execSync(`lsof -i :${port}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

export const installPostgres = async (
  config: PostgresConfig,
  onProgress: (msg: string) => void
): Promise<void> => {
  onProgress('Detecting PostgreSQL installation…');

  if (await isPostgresRunning(config.port)) {
    onProgress('PostgreSQL already running on port ' + config.port);
    return;
  }

  if (process.platform === 'win32') {
    await installWindows(config, onProgress);
  } else if (process.platform === 'darwin') {
    await installMacOS(config, onProgress);
  } else {
    onProgress('Using system PostgreSQL — ensure it is installed');
  }
};

const installWindows = async (config: PostgresConfig, onProgress: (msg: string) => void) => {
  const pgCtl = bundledPgBin('pg_ctl.exe');
  const initdb = bundledPgBin('initdb.exe');

  if (!pgCtl || !initdb) {
    onProgress('Bundled PostgreSQL not found — checking system install…');
    try {
      execSync('where psql', { stdio: 'pipe' });
      onProgress('System PostgreSQL detected');
      return;
    } catch {
      throw new Error('PostgreSQL not found. Install PostgreSQL 16 or bundle binaries in resources/postgresql-win/');
    }
  }

  if (!existsSync(config.dataDir)) {
    mkdirSync(config.dataDir, { recursive: true });
    onProgress('Initializing PostgreSQL data directory…');
    execSync(`"${initdb}" -D "${config.dataDir}" -U ${config.user} --auth-local=trust --auth-host=scram-sha-256`, {
      env: { ...process.env, PGDATA: config.dataDir },
    });
  }

  onProgress('Starting PostgreSQL server…');
  spawn(pgCtl, ['-D', config.dataDir, '-o', `-p ${config.port}`, 'start'], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  await waitForPort(config.port, 30000);
  onProgress('PostgreSQL started');
};

const installMacOS = async (config: PostgresConfig, onProgress: (msg: string) => void) => {
  const pgCtl = bundledPgBin('pg_ctl');
  const initdb = bundledPgBin('initdb');

  if (!pgCtl || !initdb) {
    try {
      execSync('which psql', { stdio: 'pipe' });
      onProgress('System PostgreSQL detected via Homebrew');
      return;
    } catch {
      throw new Error('PostgreSQL not found. Install via Homebrew or bundle in resources/postgresql-mac/');
    }
  }

  if (!existsSync(config.dataDir)) {
    mkdirSync(config.dataDir, { recursive: true });
    onProgress('Running initdb…');
    execSync(`"${initdb}" -D "${config.dataDir}" -U ${config.user}`, {
      env: { ...process.env, PGDATA: config.dataDir },
    });
  }

  onProgress('Starting pg_ctl…');
  spawn(pgCtl, ['-D', config.dataDir, '-o', `-p ${config.port}`, '-w', 'start'], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  await waitForPort(config.port, 30000);
  onProgress('PostgreSQL ready');
};

const waitForPort = (port: number, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      if (await isPostgresRunning(port)) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('PostgreSQL failed to start'));
      setTimeout(check, 500);
    };
    check();
  });

export const buildDatabaseUrl = (config: PostgresConfig): string =>
  `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;
