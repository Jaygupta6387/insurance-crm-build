/**
 * PostgresProvider — PostgreSQL-specific detection, installation, and lifecycle.
 *
 * Responsibilities:
 *  - Detect if PostgreSQL is already installed (via detectPaths in manifest)
 *  - Parse and compare version strings for compatibility
 *  - Run the platform installer silently (Windows exe / macOS dmg / pkg)
 *  - Initialize a new PostgreSQL cluster (initdb)
 *  - Start / stop the cluster (pg_ctl)
 *  - Create the application user and database
 *  - Health-check the running server
 *  - Manage credentials via the secure store
 */

import { execFile, spawn } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmSync,
  symlinkSync,
  readdirSync,
} from 'fs';
import { dirname, join } from 'path';
import os from 'os';
import { promisify } from 'util';
import net from 'net';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import { loadSecureStore, saveSecureStore } from '../../secure-store.service';
import { PlatformDependency } from '../dependency-manifest';
import { platformInfo } from '../platform-detector';
import { PG_PORT_CANDIDATES } from '../dependency-config';
import { getDownloadedPgCtlPath, getVerifiedDownloadedPgCtlPath } from './portable-postgres-download';

const execFileAsync = promisify(execFile);

/** Homebrew-patched portable PG looks up share/lib via these fixed paths. */
const MAC_SHARE_COMPAT = '/tmp/insurecrm-pgshare';
const MAC_LIB_COMPAT = '/tmp/insurecrm-pglib';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dataDir: string;
}

export type ProgressFn = (msg: string) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const START_TIMEOUT_MS = 120_000;
const INITDB_TIMEOUT_MS = 180_000;
const PSQL_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Password & credentials
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically-random 32-hex-character password.
 */
export const generatePostgresPassword = (): string =>
  crypto.randomBytes(16).toString('hex');

/**
 * Loads credentials from the secure store or generates and persists fresh ones.
 * Always returns a fully-populated PostgresConfig.
 */
export const ensurePostgresCredentials = (): PostgresConfig => {
  const store = loadSecureStore();
  const password = store.dbPassword ?? generatePostgresPassword();
  const user = store.dbUser ?? 'insurecrm';
  const database = store.dbName ?? 'insurecrm_local';
  const port = store.dbPort ?? PG_PORT_CANDIDATES[0];

  if (!store.dbPassword || !store.dbUser || !store.dbName) {
    saveSecureStore({ ...store, dbPassword: password, dbUser: user, dbName: database, dbPort: port });
  }

  const dataDir = getDataDir();
  return { host: '127.0.0.1', port, user, password, database, dataDir };
};

/**
 * Returns the PostgresConfig — equivalent to ensurePostgresCredentials().
 */
export const getDefaultPostgresConfig = (): PostgresConfig =>
  ensurePostgresCredentials();

/**
 * Builds a libpq-compatible connection URL.
 */
export const buildDatabaseUrl = (config: PostgresConfig): string =>
  `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${encodeURIComponent(config.database)}`;

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

const getDataDir = (): string => {
  try {
    return join(app.getPath('userData'), 'postgresql', 'pgdata');
  } catch {
    return join(
      process.env.APPDATA || process.env.HOME || '.',
      '.insuredhub',
      'postgresql',
      'pgdata'
    );
  }
};

/**
 * Returns `true` if the PostgreSQL data directory looks like an initialised
 * cluster (contains a `PG_VERSION` file).
 */
export const isClusterInitialized = (dataDir: string): boolean =>
  existsSync(join(dataDir, 'PG_VERSION'));

/**
 * Reads the cluster version from `PG_VERSION` (e.g. "16" or "18").
 */
export const getClusterDataVersion = (dataDir: string): string | null => {
  try {
    const raw = readFileSync(join(dataDir, 'PG_VERSION'), 'utf8').trim();
    const match = raw.match(/^(\d+(?:\.\d+)?)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const majorOf = (version: string | null | undefined): number | null => {
  if (!version) return null;
  const major = parseInt(version.split('.')[0] ?? '', 10);
  return Number.isFinite(major) ? major : null;
};

/**
 * True when the on-disk cluster major version matches the pg_ctl binary major.
 * Mismatched majors (e.g. PG 16 data + PG 18 binaries) cannot start.
 */
export const isClusterCompatibleWithRuntime = async (
  dataDir: string,
  pgCtlPath: string
): Promise<{ compatible: boolean; clusterVersion: string | null; runtimeVersion: string | null }> => {
  const clusterVersion = getClusterDataVersion(dataDir);
  const runtimeVersion = await getInstalledVersion(pgCtlPath);
  const cMaj = majorOf(clusterVersion);
  const rMaj = majorOf(runtimeVersion);
  if (cMaj === null || rMaj === null) {
    return { compatible: true, clusterVersion, runtimeVersion };
  }
  return { compatible: cMaj === rMaj, clusterVersion, runtimeVersion };
};

/**
 * Removes only the cluster data directory + log (keeps license / app credentials).
 * Used when upgrading portable PostgreSQL majors where dump/restore is not available.
 */
export const wipeClusterDataDir = async (
  pgCtlPath: string | null,
  dataDir: string,
  onProgress?: ProgressFn
): Promise<void> => {
  const report = onProgress ?? (() => void 0);
  report('Stopping old PostgreSQL cluster…');
  if (pgCtlPath) {
    try {
      await stopPostgres(pgCtlPath, dataDir);
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, 500));
  report('Removing incompatible PostgreSQL data directory…');
  try {
    if (existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
    const parent = path.dirname(dataDir);
    const logFile = path.join(parent, 'postgresql.log');
    if (existsSync(logFile)) {
      try {
        unlinkSync(logFile);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error('[postgres-provider] Failed to wipe data dir:', err);
    throw new Error(
      `Could not remove incompatible PostgreSQL data at ${dataDir}. ` +
        'Close InsureCRM, delete that folder manually, then retry setup.'
    );
  }
};

/**
 * Returns `true` if the cluster looks complete enough to start (not mid-wipe).
 */
export const isClusterHealthy = (dataDir: string): boolean =>
  isClusterInitialized(dataDir) &&
  existsSync(join(dataDir, 'global', 'pg_filenode.map')) &&
  existsSync(join(dataDir, 'base'));

/**
 * Locates the initdb share directory (folder containing postgres.bki).
 * Homebrew layouts use share/postgresql@N; EDB uses share/postgresql.
 */
const resolveInitdbShareDir = (pgCtl: string): string | null => {
  const pgRoot = dirname(dirname(pgCtl));
  const shareRoot = join(pgRoot, 'share');
  const directCandidates = [
    join(shareRoot, 'postgresql'),
    join(shareRoot, 'postgresql@18'),
    join(shareRoot, 'postgresql@17'),
    join(shareRoot, 'postgresql@16'),
    join(shareRoot, 'postgresql@15'),
    shareRoot,
  ];

  for (const candidate of directCandidates) {
    if (existsSync(join(candidate, 'postgres.bki'))) return candidate;
  }

  if (!existsSync(shareRoot)) return null;
  try {
    for (const entry of readdirSync(shareRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(shareRoot, entry.name);
      if (existsSync(join(candidate, 'postgres.bki'))) return candidate;
    }
  } catch {
    /* ignore */
  }
  return null;
};

/**
 * Locates pkglibdir (folder containing dict_snowball / plpgsql extension modules).
 */
const resolvePkglibDir = (pgCtl: string): string | null => {
  const pgRoot = dirname(dirname(pgCtl));
  const candidates = [
    join(pgRoot, 'lib', 'postgresql'),
    join(pgRoot, 'lib'),
  ];
  for (const candidate of candidates) {
    if (
      existsSync(join(candidate, 'dict_snowball.dylib')) ||
      existsSync(join(candidate, 'dict_snowball.so')) ||
      existsSync(join(candidate, 'plpgsql.dylib')) ||
      existsSync(join(candidate, 'plpgsql.so'))
    ) {
      return candidate;
    }
  }
  return null;
};

/**
 * Creates /tmp/insurecrm-pgshare and /tmp/insurecrm-pglib symlinks so the
 * Homebrew-relocated postgres binary can find share files and $libdir modules
 * (dict_snowball, plpgsql, …) inside the app bundle.
 */
const ensureMacPostgresCompatibilityLinks = (pgCtl: string): void => {
  if (process.platform !== 'darwin') return;

  const linkDir = (compatPath: string, target: string | null): void => {
    if (!target) return;
    try {
      rmSync(compatPath, { recursive: true, force: true });
      symlinkSync(target, compatPath, 'dir');
    } catch (err) {
      console.warn(
        `[postgres-provider] Failed to link ${compatPath} -> ${target}:`,
        err
      );
    }
  };

  linkDir(MAC_SHARE_COMPAT, resolveInitdbShareDir(pgCtl));
  linkDir(MAC_LIB_COMPAT, resolvePkglibDir(pgCtl));
};

/**
 * Environment for initdb / pg_ctl / psql so bundled dylibs resolve on macOS
 * and Windows portable builds.
 */
const pgRuntimeEnv = (pgCtl: string, dataDir?: string): NodeJS.ProcessEnv => {
  const pgBinDir = dirname(pgCtl);
  const pgRoot = dirname(pgBinDir);
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const existingPath = process.env[pathKey] || '';
  const pathParts = [pgBinDir];

  const libDir = join(pgRoot, 'lib');
  if (existsSync(libDir)) pathParts.push(libDir);
  const pgLibDir = join(libDir, 'postgresql');
  if (existsSync(pgLibDir)) pathParts.push(pgLibDir);
  pathParts.push(existingPath);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [pathKey]: pathParts.filter(Boolean).join(pathSep),
    // macOS: unset/invalid locale makes postmaster multithreaded at startup
    // ("FATAL: postmaster became multithreaded during startup").
    LC_ALL: process.env.LC_ALL || 'C',
    LANG: process.env.LANG || 'C',
  };

  if (dataDir) env.PGDATA = dataDir;

  if (process.platform === 'darwin') {
    const dyldParts = [libDir, pgLibDir].filter((p) => existsSync(p));
    if (dyldParts.length) {
      const existing = process.env.DYLD_LIBRARY_PATH || '';
      env.DYLD_LIBRARY_PATH = [...dyldParts, existing].filter(Boolean).join(':');
    }
  }

  return env;
};

// ---------------------------------------------------------------------------
// Detection & version
// ---------------------------------------------------------------------------

/**
 * Returns the path to the InsureCRM portable PostgreSQL runtime under userData
 * (downloaded on first Admin setup), or null.
 *
 * PostgreSQL is NOT shipped inside the Electron installer.
 */
export const getRuntimePgCtlPath = (): string | null => getDownloadedPgCtlPath();

/** @deprecated Use getRuntimePgCtlPath — name kept for older call sites. */
export const getBundledPgCtlPath = (): string | null => getRuntimePgCtlPath();

/**
 * Searches for PostgreSQL in this order:
 *  1. InsureCRM portable runtime (userData)
 *  2. System install paths from the dependency manifest
 */
export const detectInstalledPostgres = (
  platformDep: PlatformDependency
): string | null => {
  const runtime = getRuntimePgCtlPath();
  if (runtime) return runtime;

  for (const candidate of platformDep.detectPaths ?? []) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

/**
 * Prefer InsureCRM portable runtime. System installs are only used when they
 * respond to `pg_ctl --version` (no hardcoded version pin — Super Admin owns that).
 */
export const detectCompatiblePostgres = async (
  platformDep: PlatformDependency
): Promise<string | null> => {
  const verified = await getVerifiedDownloadedPgCtlPath();
  if (verified) return verified;

  for (const candidate of platformDep.detectPaths ?? []) {
    if (!existsSync(candidate)) continue;
    const version = await getInstalledVersion(candidate);
    if (version) return candidate;
  }
  return null;
};

/**
 * Runs `pg_ctl --version` and returns the version string (e.g. '18.4'),
 * or `null` if the binary fails or produces unexpected output.
 */
export const getInstalledVersion = async (
  pgCtlPath: string
): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync(pgCtlPath, ['--version'], { timeout: 5_000 });
    // e.g. "pg_ctl (PostgreSQL) 18.4"
    const match = stdout.trim().match(/(\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

/**
 * Compares a version string against min/max bounds.
 * Uses simple numeric comparison on major.minor pairs.
 */
export const isVersionCompatible = (
  version: string,
  min: string,
  max: string
): boolean => {
  const parse = (v: string): [number, number] => {
    const [major, minor = '0'] = v.split('.');
    return [parseInt(major, 10), parseInt(minor, 10)];
  };

  const [vMaj, vMin] = parse(version);
  const [minMaj, minMin] = parse(min);
  const [maxMaj, maxMin] = parse(max);

  const toNum = (maj: number, min2: number) => maj * 10000 + min2;

  return (
    toNum(vMaj, vMin) >= toNum(minMaj, minMin) &&
    toNum(vMaj, vMin) <= toNum(maxMaj, maxMin)
  );
};

/**
 * Convenience: finds `pg_ctl` from the manifest detectPaths.
 * Alias for detectInstalledPostgres.
 */
export const resolvePgCtl = (
  platformDep: PlatformDependency
): string | null => detectInstalledPostgres(platformDep);

// ---------------------------------------------------------------------------
// Port availability
// ---------------------------------------------------------------------------

/**
 * Attempts a TCP connection to `host:port`. Returns `true` if the port is
 * free (connection refused), `false` if something is already listening.
 */
export const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(500);

    sock.on('connect', () => {
      sock.destroy();
      resolve(false); // port is in use
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(true); // port is free
    });
    sock.on('timeout', () => {
      sock.destroy();
      resolve(true); // no response → treat as free
    });

    sock.connect(port, '127.0.0.1');
  });
};

/**
 * Returns the first available port from PG_PORT_CANDIDATES.
 * Throws if all candidates are busy.
 */
export const findAvailablePort = async (): Promise<number> => {
  for (const port of PG_PORT_CANDIDATES) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(
    `All PostgreSQL port candidates are in use: ${PG_PORT_CANDIDATES.join(', ')}`
  );
};

// ---------------------------------------------------------------------------
// Silent installer
// ---------------------------------------------------------------------------

/**
 * Runs the platform-specific installer with silent / unattended arguments.
 * Replaces template placeholders ({{SUPERPASSWORD}}, {{PORT}}, {{DATADIR}})
 * with actual values from `config`.
 */
export const runSilentInstaller = async (
  installerPath: string,
  platformDep: PlatformDependency,
  config: PostgresConfig,
  onProgress: ProgressFn
): Promise<void> => {
  const { installerType, silentArgs = [] } = platformDep;

  const substitute = (arg: string): string =>
    arg
      .replace('{{SUPERPASSWORD}}', config.password)
      .replace('{{PORT}}', String(config.port))
      .replace('{{DATADIR}}', config.dataDir);

  const args = silentArgs.map(substitute);

  onProgress(`Running installer: ${path.basename(installerPath)}`);

  if (installerType === 'exe') {
    // Windows: run the exe directly
    await execFileAsync(installerPath, args, { timeout: 600_000 });
  } else if (installerType === 'dmg') {
    // macOS DMG: attach → install pkg inside → detach
    await installFromDmg(installerPath, config, onProgress);
  } else if (installerType === 'pkg') {
    // macOS PKG: sudo installer -pkg … -target /
    await execFileAsync(
      'sudo',
      ['/usr/sbin/installer', '-pkg', installerPath, '-target', '/'],
      { timeout: 600_000 }
    );
  } else {
    throw new Error(`Unsupported installer type: ${installerType}`);
  }

  onProgress('Installer completed successfully');
};

/**
 * Mounts a macOS DMG, finds the first `.pkg` inside, installs it, then
 * unmounts the DMG.
 */
const installFromDmg = async (
  dmgPath: string,
  _config: PostgresConfig,
  onProgress: ProgressFn
): Promise<void> => {
  const mountPoint = `/Volumes/PGInstall_${Date.now()}`;
  onProgress('Mounting DMG…');

  try {
    await execFileAsync('hdiutil', [
      'attach', dmgPath,
      '-mountpoint', mountPoint,
      '-nobrowse', '-quiet',
    ], { timeout: 60_000 });

    // Find the first .pkg in the mount
    const { stdout: lsOut } = await execFileAsync('ls', [mountPoint]);
    const pkgName = lsOut.split('\n').find((f) => f.trim().endsWith('.pkg'));
    if (!pkgName) throw new Error('No .pkg found inside DMG');

    const pkgPath = path.join(mountPoint, pkgName.trim());
    onProgress(`Installing ${pkgName.trim()}…`);

    await execFileAsync(
      'sudo',
      ['/usr/sbin/installer', '-pkg', pkgPath, '-target', '/'],
      { timeout: 600_000 }
    );
  } finally {
    onProgress('Unmounting DMG…');
    try {
      await execFileAsync('hdiutil', ['detach', mountPoint, '-quiet'], { timeout: 30_000 });
    } catch { /* ignore unmount errors */ }
  }
};

// ---------------------------------------------------------------------------
// Cluster init & lifecycle
// ---------------------------------------------------------------------------

/**
 * Runs `initdb` to create a new PostgreSQL data directory.
 * The application user is the cluster superuser so desktop setup can manage
 * databases without a separate lost postgres password.
 */
export const initDatabase = async (
  pgCtlPath: string,
  dataDir: string,
  username: string,
  password: string,
  onProgress: ProgressFn
): Promise<void> => {
  const pgBinDir = path.dirname(pgCtlPath);
  const initdbPath = path.join(pgBinDir, platformInfo.isWindows ? 'initdb.exe' : 'initdb');

  if (!existsSync(initdbPath)) {
    throw new Error(`initdb not found at: ${initdbPath}`);
  }

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  onProgress(`Initialising PostgreSQL cluster at ${dataDir}…`);

  ensureMacPostgresCompatibilityLinks(pgCtlPath);

  // Local sockets trust the OS user; TCP still requires the password (SCRAM).
  const args = [
    '-D', dataDir,
    '--auth-local', 'trust',
    '--auth-host', 'scram-sha-256',
    '--username', username,
    '-E', 'UTF8',
  ];
  const shareDir = resolveInitdbShareDir(pgCtlPath);
  if (shareDir) {
    args.push('-L', shareDir);
  }

  // Write superuser password to a temp file (initdb --pwfile)
  // so we avoid platform issues with stdin piping.
  const pwFile = join(os.tmpdir(), `.pg_pwfile_${Date.now()}`);
  try {
    writeFileSync(pwFile, password + '\n', { mode: 0o600 });
    args.push(`--pwfile=${pwFile}`);
    await execFileAsync(initdbPath, args, {
      timeout: INITDB_TIMEOUT_MS,
      env: pgRuntimeEnv(pgCtlPath, dataDir),
    });
  } finally {
    try { unlinkSync(pwFile); } catch { /* ignore */ }
  }

  // Portable Windows builds may default unix_socket_directories to /tmp, which does not exist.
  patchClusterConfForDesktop(dataDir);

  onProgress('Cluster initialised successfully');
};

/**
 * Append desktop-safe settings to postgresql.conf after initdb.
 * On Windows, disable Unix-domain sockets so postmaster does not try `/tmp`.
 */
const patchClusterConfForDesktop = (dataDir: string): void => {
  const confPath = join(dataDir, 'postgresql.conf');
  if (!existsSync(confPath)) return;
  try {
    let conf = readFileSync(confPath, 'utf8');
    const additions: string[] = [];
    if (!/^\s*listen_addresses\s*=/m.test(conf)) {
      additions.push("listen_addresses = '127.0.0.1'");
    }
    if (platformInfo.isWindows) {
      // Force empty even if a commented default mentions /tmp.
      if (!/^\s*unix_socket_directories\s*=\s*''/m.test(conf)) {
        conf = conf.replace(/^\s*#?\s*unix_socket_directories\s*=.*$/gm, '');
        additions.push("unix_socket_directories = ''");
      }
    }
    if (additions.length === 0) return;
    writeFileSync(
      confPath,
      `${conf.trimEnd()}\n\n# InsureCRM Desktop\n${additions.join('\n')}\n`,
      'utf8'
    );
  } catch (err) {
    console.warn('[postgres-provider] Could not patch postgresql.conf:', err);
  }
};

/**
 * Starts the PostgreSQL server using `pg_ctl start` and waits until it
 * accepts connections.
 */
export const startPostgres = async (
  pgCtlPath: string,
  dataDir: string,
  port: number,
  onProgress: ProgressFn
): Promise<void> => {
  if (!existsSync(dataDir)) {
    throw new Error(`PostgreSQL data directory not found: ${dataDir}`);
  }

  // Never attach a second postmaster to the same data directory.
  await stopPostgres(pgCtlPath, dataDir).catch(() => undefined);

  // Re-apply desktop conf (e.g. Windows: no /tmp unix sockets) on every start.
  patchClusterConfForDesktop(dataDir);

  onProgress(`Starting PostgreSQL on port ${port}…`);

  ensureMacPostgresCompatibilityLinks(pgCtlPath);

  const logFile = path.join(path.dirname(dataDir), 'postgresql.log');

  // Unix sockets (-k) are macOS/Linux only. On Windows they break pg_ctl start.
  const extraOptions = platformInfo.isWindows
    ? `-p ${port}`
    : `-p ${port} -k /tmp`;

  try {
    await execFileAsync(
      pgCtlPath,
      [
        '-D', dataDir,
        '-l', logFile,
        '-o', extraOptions,
        'start',
      ],
      {
        timeout: START_TIMEOUT_MS,
        env: pgRuntimeEnv(pgCtlPath, dataDir),
      }
    );
  } catch (err) {
    let logTail = '';
    try {
      logTail = readFileSync(logFile, 'utf8').trim().split('\n').slice(-20).join('\n');
    } catch { /* ignore */ }
    const base = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not start PostgreSQL.\n${base}` +
        (logTail ? `\n\npostgresql.log:\n${logTail}` : '')
    );
  }

  onProgress('Waiting for PostgreSQL to accept connections…');
  const ready = await waitForPostgresReady('127.0.0.1', port, START_TIMEOUT_MS);
  if (!ready) {
    let logTail = '';
    try {
      logTail = readFileSync(logFile, 'utf8').trim().split('\n').slice(-12).join('\n');
    } catch { /* ignore */ }
    throw new Error(
      `PostgreSQL did not become ready within ${START_TIMEOUT_MS / 1000}s` +
        (logTail ? `\n\n${logTail}` : '')
    );
  }
  onProgress('PostgreSQL is ready');
};

/**
 * Stops the PostgreSQL server using `pg_ctl stop -m immediate`.
 */
export const stopPostgres = async (
  pgCtlPath: string,
  dataDir: string
): Promise<void> => {
  if (!isClusterInitialized(dataDir)) return;
  ensureMacPostgresCompatibilityLinks(pgCtlPath);
  await execFileAsync(
    pgCtlPath,
    ['-D', dataDir, 'stop', '-m', 'immediate'],
    {
      timeout: 30_000,
      env: pgRuntimeEnv(pgCtlPath, dataDir),
    }
  );
};

/**
 * Best-effort stop of the portable/local Postgres used by desktop.
 * Call on app quit so Windows uninstall is not blocked by locked postgres.exe files.
 */
export const stopEmbeddedPostgres = async (): Promise<void> => {
  try {
    const config = getDefaultPostgresConfig();
    const pgCtlPath = getRuntimePgCtlPath();
    if (!pgCtlPath || !config?.dataDir) return;
    await stopPostgres(pgCtlPath, config.dataDir);
  } catch {
    /* ignore — force-kill happens in NSIS uninstaller if still running */
  }
};

/**
 * Polls the given host:port until PostgreSQL accepts a TCP connection or the
 * timeout is reached.
 *
 * @returns `true` if ready within `timeoutMs`, `false` otherwise
 */
export const waitForPostgresReady = (
  host: string,
  port: number,
  timeoutMs: number
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;

  const tryConnect = (): Promise<boolean> => {
    if (Date.now() >= deadline) return Promise.resolve(false);

    return new Promise((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(1000);

      sock.on('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        sock.destroy();
        setTimeout(() => resolve(tryConnect()), 500);
      });
      sock.on('timeout', () => {
        sock.destroy();
        resolve(tryConnect());
      });

      sock.connect(port, host);
    });
  };

  return tryConnect();
};

// ---------------------------------------------------------------------------
// Data directory reset
// ---------------------------------------------------------------------------

/**
 * Stops PostgreSQL (if running), removes the data directory, and clears stored
 * credentials so the cluster will be re-initialised on next startup.
 *
 * Used for factory-reset and troubleshooting scenarios.
 */
export const resetPostgresData = async (onProgress?: ProgressFn): Promise<void> => {
  const config = ensurePostgresCredentials();
  const report = onProgress ?? (() => void 0);

  report('Stopping PostgreSQL…');
  const pgCtlPath = getRuntimePgCtlPath();
  if (pgCtlPath) {
    try {
      await stopPostgres(pgCtlPath, config.dataDir);
    } catch { /* ignore – cluster may already be stopped */ }
  } else {
    // Last resort: try PATH pg_ctl
    try {
      const binName = platformInfo.isWindows ? 'pg_ctl.exe' : 'pg_ctl';
      await execFileAsync(binName, ['-D', config.dataDir, 'stop', '-m', 'immediate'], {
        timeout: 15_000,
        env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
      });
    } catch { /* ignore */ }
  }

  // Brief pause so file handles release before wipe (avoids dual-postmaster corruption).
  await new Promise((r) => setTimeout(r, 500));

  report('Removing PostgreSQL data directory…');
  try {
    if (existsSync(config.dataDir)) {
      rmSync(config.dataDir, { recursive: true, force: true });
    }
    const parent = path.dirname(config.dataDir);
    const logFile = path.join(parent, 'postgresql.log');
    if (existsSync(logFile)) {
      try { unlinkSync(logFile); } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('[postgres-provider] Failed to remove data dir:', err);
  }

  report('Clearing stored credentials…');
  try {
    const store = loadSecureStore();
    saveSecureStore({
      ...store,
      dbPassword: undefined,
      dbUser: undefined,
      dbName: undefined,
      dbPort: undefined,
      databaseUrl: undefined,
      setupComplete: false,
    });
  } catch { /* ignore */ }

  report('PostgreSQL data reset complete');
};

// ---------------------------------------------------------------------------
// User & database creation
// ---------------------------------------------------------------------------

/**
 * Ensures the application database exists. The app user is the cluster
 * superuser (created by initdb), so role creation is not required.
 */
export const createAppUserAndDatabase = async (
  pgCtlPath: string,
  config: PostgresConfig,
  _superPassword: string,
  onProgress: ProgressFn
): Promise<void> => {
  const pgBinDir = path.dirname(pgCtlPath);
  const psqlBin = path.join(pgBinDir, platformInfo.isWindows ? 'psql.exe' : 'psql');

  if (!existsSync(psqlBin)) {
    throw new Error(`psql not found at: ${psqlBin}`);
  }

  ensureMacPostgresCompatibilityLinks(pgCtlPath);

  const env: NodeJS.ProcessEnv = {
    ...pgRuntimeEnv(pgCtlPath, config.dataDir),
    PGPASSWORD: config.password,
  };

  onProgress(`Ensuring database "${config.database}" exists…`);

  const { stdout } = await execFileAsync(
    psqlBin,
    [
      '-U', config.user,
      '-h', config.host,
      '-p', String(config.port),
      '-d', 'postgres',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname = '${config.database.replace(/'/g, "''")}'`,
    ],
    { timeout: PSQL_TIMEOUT_MS, env }
  );

  if (!String(stdout).trim()) {
    await execFileAsync(
      psqlBin,
      [
        '-U', config.user,
        '-h', config.host,
        '-p', String(config.port),
        '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1',
        '-c', `CREATE DATABASE "${config.database}" OWNER "${config.user}"`,
      ],
      { timeout: PSQL_TIMEOUT_MS, env }
    );
  }

  onProgress('Database setup complete');
};
