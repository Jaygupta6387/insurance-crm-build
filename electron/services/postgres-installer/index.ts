import { randomBytes } from 'crypto';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, rmSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import net from 'net';
import { app } from 'electron';
import { loadSecureStore, saveSecureStore } from '../secure-store.service';
import { sanitizeProcessEnv } from '../env-utils';

const execFileAsync = promisify(execFile);

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dataDir: string;
}

const PORT_CANDIDATES = [54329, 54330, 54331, 54332, 54333];
const START_TIMEOUT_MS = 120_000;

const getAppDataDir = () => join(app.getPath('userData'), 'postgresql');

export const generatePostgresPassword = () => randomBytes(16).toString('hex');

/** Persist DB password once so retries/restarts use the same credentials as the cluster. */
export const ensurePostgresCredentials = (): PostgresConfig => {
  const store = loadSecureStore();
  const password = store.dbPassword ?? generatePostgresPassword();
  const user = store.dbUser ?? 'insurecrm';
  const database = store.dbName ?? 'insurecrm_local';
  const port = store.dbPort ?? PORT_CANDIDATES[0];

  if (!store.dbPassword || !store.dbUser || !store.dbName) {
    saveSecureStore({ ...store, dbPassword: password, dbUser: user, dbName: database, dbPort: port });
  }

  return {
    host: '127.0.0.1',
    port,
    user,
    password,
    database,
    dataDir: join(getAppDataDir(), 'pgdata'),
  };
};

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const getDefaultPostgresConfig = (): PostgresConfig => ensurePostgresCredentials();

const stopPostgresCluster = async (dataDir: string): Promise<void> => {
  const binName = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl';
  const pgCtl = await resolvePgBin(binName);
  if (!pgCtl || !isClusterInitialized(dataDir)) return;

  const pgEnv = pgRuntimeEnv(pgCtl, dataDir);
  await runPgAsync(pgCtl, ['-D', dataDir, 'stop', 'fast', '-m', 'fast'], {
    env: pgEnv,
    cwd: dirname(pgCtl),
  });
  await sleep(2000);
};

export const resetPostgresData = async (): Promise<void> => {
  const base = getAppDataDir();
  const pgdata = join(base, 'pgdata');
  if (!existsSync(pgdata)) return;

  await stopPostgresCluster(pgdata);

  const stamp = Date.now();
  const failedPath = join(base, `pgdata.failed.${stamp}`);

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      renameSync(pgdata, failedPath);
      return;
    } catch {
      await stopPostgresCluster(pgdata);
      await sleep(1000 * (attempt + 1));
    }
  }

  try {
    rmSync(pgdata, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not remove local database folder (still in use). Close InsureCRM Desktop, end any postgres.exe in Task Manager, then retry.\n\n${message}`
    );
  }
};

const bundledPgBin = (bin: string): string | null => {
  const platform = process.platform === 'win32' ? 'postgresql-win' : 'postgresql-mac';
  const candidates = [
    join(process.resourcesPath, 'resources', platform, 'bin', bin),
    join(process.resourcesPath, platform, 'bin', bin),
    join(__dirname, '../../../resources', platform, 'bin', bin),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

const findWindowsPgBin = async (bin: string): Promise<string | null> => {
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
    const { stdout } = await execFileAsync('where', [bin], { windowsHide: true });
    const first = stdout.trim().split(/\r?\n/).find((line) => line.trim());
    if (first && existsSync(first.trim())) return first.trim();
  } catch {
    // not on PATH
  }

  return null;
};

const findMacPgBin = async (bin: string): Promise<string | null> => {
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
    const { stdout } = await execFileAsync('which', [bin]);
    const path = stdout.trim();
    if (path && existsSync(path)) return path;
  } catch {
    // not on PATH
  }

  return null;
};

const resolvePgBin = async (bin: string): Promise<string | null> => {
  const bundled = bundledPgBin(bin);
  if (bundled) return bundled;
  if (app.isPackaged && process.platform === 'win32') return null;
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

export const isPostgresRunning = async (port: number): Promise<boolean> =>
  isPortListening(port);

const pgRuntimeEnv = (pgCtl: string, dataDir: string): NodeJS.ProcessEnv => {
  const pgBinDir = dirname(pgCtl);
  const pgRoot = dirname(pgBinDir);
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const existingPath = process.env[pathKey] || '';
  return sanitizeProcessEnv({
    ...process.env,
    PGDATA: dataDir,
    [pathKey]: `${pgBinDir}${pathSep}${pgRoot}${pathSep}${existingPath}`,
  });
};

const runPgAsync = (
  executable: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; cwd: string }
): Promise<{ stdout: string; stderr: string; status: number | null }> =>
  new Promise((resolve, reject) => {
    if (!executable?.trim()) {
      reject(new Error('PostgreSQL executable not found'));
      return;
    }

    const child = spawn(executable, args.map((arg) => String(arg)), {
      env: sanitizeProcessEnv(options.env),
      cwd: options.cwd,
      stdio: 'pipe',
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => reject(new Error(`${executable} failed: ${err.message}`)));
    child.on('close', (status) => resolve({ stdout, stderr, status }));
  });

const isClusterInitialized = (dataDir: string): boolean =>
  existsSync(join(dataDir, 'PG_VERSION'));

/** Read the port this cluster was created for (postgresql.conf or postmaster.pid). */
const readClusterPort = (dataDir: string): number | null => {
  const pidFile = join(dataDir, 'postmaster.pid');
  if (existsSync(pidFile)) {
    try {
      const lines = readFileSync(pidFile, 'utf8').split(/\r?\n/);
      const fromPid = parseInt(lines[3]?.trim() ?? '', 10);
      if (fromPid > 0) return fromPid;
    } catch {
      // fall through
    }
  }

  const confPath = join(dataDir, 'postgresql.conf');
  if (existsSync(confPath)) {
    try {
      const match = readFileSync(confPath, 'utf8').match(/^port\s*=\s*(\d+)/m);
      if (match) return parseInt(match[1], 10);
    } catch {
      // fall through
    }
  }

  return null;
};

const isOurClusterRunning = async (dataDir: string, pgCtl: string): Promise<number | null> => {
  if (!isClusterInitialized(dataDir)) return null;

  const pgEnv = pgRuntimeEnv(pgCtl, dataDir);
  const status = await runPgAsync(pgCtl, ['-D', dataDir, 'status'], {
    env: pgEnv,
    cwd: dirname(pgCtl),
  });

  if (!status.stdout?.includes('server is running')) return null;

  const clusterPort = readClusterPort(dataDir);
  if (clusterPort && (await isPortListening(clusterPort))) return clusterPort;

  for (const port of PORT_CANDIDATES) {
    if (await isPortListening(port)) return port;
  }

  return clusterPort ?? PORT_CANDIDATES[0];
};

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

const removeStalePidFile = async (dataDir: string): Promise<void> => {
  const pidFile = join(dataDir, 'postmaster.pid');
  if (!existsSync(pidFile)) return;

  const clusterPort = readClusterPort(dataDir);
  if (clusterPort && (await isPortListening(clusterPort))) return;

  try {
    unlinkSync(pidFile);
  } catch {
    // ignore
  }
};

const runInitdb = async (
  initdb: string,
  pgCtl: string,
  config: PostgresConfig,
  pgEnv: NodeJS.ProcessEnv,
  onProgress: (msg: string) => void
): Promise<void> => {
  mkdirSync(config.dataDir, { recursive: true });
  onProgress('Initializing local PostgreSQL data directory… (may take 1–2 min)');

  const pwFile = join(getAppDataDir(), '.initdb-pw');
  writeFileSync(pwFile, `${config.password}\n`, { encoding: 'utf8', mode: 0o600 });

  const initArgs = [
    '-D',
    config.dataDir,
    '-U',
    config.user,
    '--auth-local=trust',
    '--auth-host=scram-sha-256',
    '-E',
    'UTF8',
    '--pwfile',
    pwFile,
  ];

  try {
    const result = await runPgAsync(initdb, initArgs, {
      env: pgEnv,
      cwd: dirname(pgCtl),
    });

    if (result.status !== 0) {
      const err = [result.stderr, result.stdout].filter(Boolean).join('\n');
      throw new Error(err || 'initdb failed');
    }
  } finally {
    try {
      unlinkSync(pwFile);
    } catch {
      // ignore
    }
  }
};

const runPsqlCommand = async (
  psql: string,
  pgCtl: string,
  config: PostgresConfig,
  sql: string,
  useTcp: boolean
): Promise<{ stdout: string; stderr: string; status: number | null }> => {
  const pgEnv = pgRuntimeEnv(pgCtl, config.dataDir);
  const args = ['-U', config.user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql];
  if (useTcp) args.splice(0, 0, '-h', config.host, '-p', String(config.port));
  return runPgAsync(psql, args, { env: pgEnv, cwd: dirname(psql) });
};

const withTemporaryTrustHost = async (
  config: PostgresConfig,
  pgCtl: string,
  fn: () => Promise<void>
): Promise<void> => {
  const hbaPath = join(config.dataDir, 'pg_hba.conf');
  if (!existsSync(hbaPath)) {
    await fn();
    return;
  }

  const original = readFileSync(hbaPath, 'utf8');
  const trustRule = 'host    all             all             127.0.0.1/32            trust';
  if (/host\s+all\s+all\s+127\.0\.0\.1\/32\s+trust/m.test(original)) {
    await fn();
    return;
  }

  const patched = original.replace(
    /^host\s+all\s+all\s+127\.0\.0\.1\/32\s+\S+/m,
    trustRule
  );
  if (patched === original) {
    await fn();
    return;
  }

  writeFileSync(hbaPath, patched, 'utf8');
  const pgEnv = pgRuntimeEnv(pgCtl, config.dataDir);
  await runPgAsync(pgCtl, ['-D', config.dataDir, 'reload'], { env: pgEnv, cwd: dirname(pgCtl) });
  await sleep(500);

  try {
    await fn();
  } finally {
    writeFileSync(hbaPath, original, 'utf8');
    await runPgAsync(pgCtl, ['-D', config.dataDir, 'reload'], { env: pgEnv, cwd: dirname(pgCtl) });
  }
};

/** Set role password via trust auth (local socket / named pipe — no TCP password). */
const syncPostgresRolePassword = async (
  config: PostgresConfig,
  pgCtl: string,
  onProgress: (msg: string) => void
): Promise<void> => {
  const psqlName = process.platform === 'win32' ? 'psql.exe' : 'psql';
  const psql = await resolvePgBin(psqlName);
  if (!psql) throw new Error('psql not found');

  onProgress('Configuring database credentials…');
  const escaped = config.password.replace(/'/g, "''");
  const sql = `ALTER USER "${config.user}" WITH PASSWORD '${escaped}'`;

  let result = await runPsqlCommand(psql, pgCtl, config, sql, false);
  if (result.status === 0) return;

  await withTemporaryTrustHost(config, pgCtl, async () => {
    result = await runPsqlCommand(psql, pgCtl, config, sql, true);
  });

  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(detail || 'Could not set PostgreSQL user password');
  }
};

const startPostgresServer = async (
  pgCtl: string,
  config: PostgresConfig,
  pgEnv: NodeJS.ProcessEnv,
  onProgress: (msg: string) => void
): Promise<void> => {
  const logFile = join(getAppDataDir(), 'postgres.log');
  mkdirSync(dirname(logFile), { recursive: true });

  onProgress(`Starting PostgreSQL on port ${config.port}… (please wait, app stays open)`);

  const args = ['-D', config.dataDir, '-o', `-p ${config.port}`, '-l', logFile, 'start'];

  const result = await runPgAsync(pgCtl, args, {
    env: pgEnv,
    cwd: dirname(pgCtl),
  });

  if (result.status !== 0) {
    const runningPort = await isOurClusterRunning(config.dataDir, pgCtl);
    if (runningPort) {
      config.port = runningPort;
      return;
    }

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

const pickAvailablePort = async (): Promise<number> => {
  for (const port of PORT_CANDIDATES) {
    if (!(await isPortListening(port))) return port;
  }
  return PORT_CANDIDATES[0];
};

const buildStartFailureMessage = (port: number, dataDir: string, cause?: string): string => {
  const log = readRecentLog(dataDir);
  const tips = [
    'Click "Reset database & retry" (stops PostgreSQL first, then recreates the folder).',
    'Close InsureCRM Desktop fully, end postgres.exe in Task Manager if needed, reopen and retry.',
    'Temporarily disable antivirus/firewall blocking local apps.',
    'Restart your computer and run setup again.',
  ];

  const parts = [
    `PostgreSQL did not become ready on port ${port} within ${START_TIMEOUT_MS / 1000}s.`,
    cause ? `Details: ${cause}` : null,
    log ? `Log:\n${log}` : null,
    `Try:\n${tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
  ].filter(Boolean);

  return parts.join('\n\n');
};

/** Wait for Postgres on config.port or any candidate port (fixes 54329 vs 54330 mismatch). */
const waitForPostgresReady = async (config: PostgresConfig, pgCtl: string, timeoutMs: number): Promise<void> => {
  const preferred = [config.port, readClusterPort(config.dataDir), ...PORT_CANDIDATES]
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const ports = [...new Set(preferred)];

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const port of ports) {
      if (!(await isPortListening(port))) continue;
      const running = await isOurClusterRunning(config.dataDir, pgCtl);
      if (running || !isClusterInitialized(config.dataDir)) {
        config.port = port;
        return;
      }
    }
    await yieldToEventLoop();
    await sleep(500);
  }

  throw new Error(`PostgreSQL not ready on ports: ${ports.join(', ')}`);
};

const removeDataDirSafely = async (dataDir: string, pgCtl: string, onProgress: (msg: string) => void): Promise<void> => {
  onProgress('Stopping PostgreSQL and cleaning up old data folder…');
  await stopPostgresCluster(dataDir);
  await sleep(1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      return;
    } catch {
      await stopPostgresCluster(dataDir);
      await sleep(1000 * (attempt + 1));
    }
  }

  throw new Error('Could not remove old database folder — close the app, end postgres.exe in Task Manager, then retry.');
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
    const runningPort = await isOurClusterRunning(config.dataDir, pgCtl);
    if (runningPort) {
      config.port = runningPort;
      onProgress(`PostgreSQL already running on port ${runningPort}`);
      await syncPostgresRolePassword(config, pgCtl, onProgress);
      return;
    }

    await removeStalePidFile(config.dataDir);
    const clusterPort = readClusterPort(config.dataDir);
    if (clusterPort) config.port = clusterPort;
  } else if (existsSync(config.dataDir)) {
    await removeDataDirSafely(config.dataDir, pgCtl, onProgress);
  }

  if (!isClusterInitialized(config.dataDir)) {
    await runInitdb(initdb, pgCtl, config, pgEnv, onProgress);
  }

  try {
    await startPostgresServer(pgCtl, config, pgEnv, onProgress);
    await waitForPostgresReady(config, pgCtl, START_TIMEOUT_MS);
    await syncPostgresRolePassword(config, pgCtl, onProgress);
    onProgress(`PostgreSQL started on port ${config.port}`);
  } catch (firstErr) {
    if (!allowReset) throw firstErr;

    onProgress('Startup failed — stopping PostgreSQL and retrying with a fresh database…');
    await resetPostgresData();
    config.dataDir = join(getAppDataDir(), 'pgdata');
    config.port = await pickAvailablePort();
    const retryEnv = pgRuntimeEnv(pgCtl, config.dataDir);
    await runInitdb(initdb, pgCtl, config, retryEnv, onProgress);
    await startPostgresServer(pgCtl, config, retryEnv, onProgress);
    await waitForPostgresReady(config, pgCtl, START_TIMEOUT_MS);
    await syncPostgresRolePassword(config, pgCtl, onProgress);
    onProgress(`PostgreSQL started on port ${config.port} after reset`);
  }
};

export const installPostgres = async (
  config: PostgresConfig,
  onProgress: (msg: string) => void
): Promise<void> => {
  onProgress('Detecting PostgreSQL…');

  const binName = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl';
  const initName = process.platform === 'win32' ? 'initdb.exe' : 'initdb';
  const pgCtl = await resolvePgBin(binName);
  const initdb = await resolvePgBin(initName);

  if (!pgCtl || !initdb) {
    const help =
      process.platform === 'win32'
        ? 'Bundled PostgreSQL is missing from this install. Reinstall InsureCRM Desktop from the latest release.'
        : 'Install PostgreSQL via Homebrew (`brew install postgresql@16`) or bundle binaries in resources/postgresql-mac/.';
    throw new Error(`PostgreSQL was not found on this computer. ${help}`);
  }

  const runningPort = await isOurClusterRunning(config.dataDir, pgCtl);
  if (runningPort) {
    config.port = runningPort;
    onProgress(`PostgreSQL already running on port ${runningPort}`);
    await syncPostgresRolePassword(config, pgCtl, onProgress);
    saveSecureStore({ ...loadSecureStore(), dbPort: runningPort });
    return;
  }

  const savedPort = readClusterPort(config.dataDir);
  config.port = savedPort ?? (await pickAvailablePort());

  const source = bundledPgBin(binName) ? 'bundled' : 'system';
  onProgress(`Using ${source} PostgreSQL on port ${config.port}…`);

  try {
    await startDedicatedCluster(config, pgCtl, initdb, onProgress, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(buildStartFailureMessage(config.port, config.dataDir, message));
  }

  const store = loadSecureStore();
  saveSecureStore({
    ...store,
    dbPort: config.port,
    dbUser: config.user,
    dbPassword: config.password,
    dbName: config.database,
    databaseUrl: buildDatabaseUrl(config),
  });
};

/**
 * Start local PostgreSQL if needed and return config with the live port/credentials.
 * Safe to call on every CRM launch (does not reset data).
 */
export const ensurePostgresRunning = async (
  onProgress: (msg: string) => void = () => {}
): Promise<PostgresConfig> => {
  const config = ensurePostgresCredentials();

  const binName = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl';
  const initName = process.platform === 'win32' ? 'initdb.exe' : 'initdb';
  const pgCtl = await resolvePgBin(binName);
  const initdb = await resolvePgBin(initName);

  if (!pgCtl || !initdb) {
    throw new Error(
      'PostgreSQL is not available in this install. Reinstall InsureCRM Desktop or run setup again.'
    );
  }

  if (!isClusterInitialized(config.dataDir)) {
    throw new Error('Local database has not been set up. Complete setup in InsureCRM Desktop.');
  }

  const runningPort = await isOurClusterRunning(config.dataDir, pgCtl);
  if (runningPort) {
    config.port = runningPort;
    onProgress(`PostgreSQL already running on port ${runningPort}`);
    await syncPostgresRolePassword(config, pgCtl, onProgress);
  } else {
    await removeStalePidFile(config.dataDir);
    const clusterPort = readClusterPort(config.dataDir);
    if (clusterPort) config.port = clusterPort;

    const pgEnv = pgRuntimeEnv(pgCtl, config.dataDir);
    onProgress(`Starting PostgreSQL on port ${config.port}…`);
    await startPostgresServer(pgCtl, config, pgEnv, onProgress);
    await waitForPostgresReady(config, pgCtl, START_TIMEOUT_MS);
    await syncPostgresRolePassword(config, pgCtl, onProgress);
    onProgress(`PostgreSQL ready on port ${config.port}`);
  }

  const store = loadSecureStore();
  const databaseUrl = buildDatabaseUrl(config);
  saveSecureStore({
    ...store,
    dbPort: config.port,
    dbUser: config.user,
    dbPassword: config.password,
    dbName: config.database,
    databaseUrl,
  });

  return config;
};

export const buildDatabaseUrl = (config: PostgresConfig): string =>
  `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${encodeURIComponent(config.database)}?sslmode=disable`;
