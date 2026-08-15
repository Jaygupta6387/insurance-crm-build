/**
 * DependencyManagerService — Orchestrates dependency detection, download,
 * and installation for InsuredHub Desktop.
 *
 * Usage:
 *   const dm = getDependencyManager();
 *   await dm.ensureDependency('postgresql', installMode, { onProgress });
 *   const config = await dm.ensurePostgresRunning(onProgress, installMode);
 *
 * Install pipeline:
 *   1. Detect already-installed version         → reuse if compatible
 *   2. Check dependency cache                   → install from cache if hit
 *   3. Download from download server            → verify checksum → cache
 *   4. Run silent installer                     → init cluster → start
 */

import path from 'path';
import { existsSync } from 'fs';
import EventEmitter from 'events';
import {
  loadManifest,
  fetchManifest,
  getDependencyForPlatform,
} from './dependency-manifest';
import { getDependencyConfig } from './dependency-config';
import { platformInfo } from './platform-detector';
import { downloadEngineService, DownloadProgress } from './download-engine.service';
import { dependencyCacheService } from './dependency-cache.service';
import {
  PostgresConfig,
  ProgressFn,
  ensurePostgresCredentials,
  getDefaultPostgresConfig,
  buildDatabaseUrl,
  generatePostgresPassword,
  detectCompatiblePostgres,
  getInstalledVersion,
  isVersionCompatible,
  runSilentInstaller,
  findAvailablePort,
  isPortAvailable,
  isClusterInitialized,
  isClusterHealthy,
  isClusterCompatibleWithRuntime,
  wipeClusterDataDir,
  initDatabase,
  startPostgres,
  stopPostgres,
  waitForPostgresReady,
  createAppUserAndDatabase,
  resetPostgresData,
} from './providers/postgres-provider';
import {
  ensurePortablePostgresDownloaded,
  getVerifiedDownloadedPgCtlPath,
} from './providers/portable-postgres-download';
import { loadSecureStore, saveSecureStore } from '../secure-store.service';
import type { DependencyManifest, PlatformDependency, DependencyEntry } from './dependency-manifest';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DependencyStatus {
  id: string;
  name: string;
  status:
    | 'not-checked'
    | 'installed'
    | 'not-installed'
    | 'downloading'
    | 'installing'
    | 'error'
    | 'skipped';
  installedVersion?: string;
  installedPath?: string;
  error?: string;
}

export interface InstallOptions {
  /** Skip detection+install if already installed (default: true) */
  skipIfInstalled?: boolean;
  useCache?: boolean;
  onProgress?: (step: string, detail: string, percentage: number) => void;
  onDownloadProgress?: (progress: DownloadProgress) => void;
}

/** Options object used by the IPC handler variant of ensurePostgresRunning */
export interface EnsurePostgresOptions {
  mode?: string;
  isCancelled?: () => boolean;
}

/** Cache information returned by getCacheInfo */
export interface CacheInfo {
  totalBytes: number;
  entries: Array<{ filename: string; bytes: number; cachedAt: string }>;
}

// ---------------------------------------------------------------------------
// DependencyManagerService class
// ---------------------------------------------------------------------------

class DependencyManagerService extends EventEmitter {
  private _manifest: DependencyManifest | null = null;
  private statusMap = new Map<string, DependencyStatus>();

  // -------------------------------------------------------------------------
  // Manifest
  // -------------------------------------------------------------------------

  /** Loads (or returns cached) manifest. Tries to fetch a fresh copy first. */
  async getManifest(): Promise<DependencyManifest> {
    if (this._manifest) return this._manifest;

    const config = getDependencyConfig();

    // Try to refresh manifest from server (non-fatal failure)
    try {
      this._manifest = await fetchManifest(config.manifestUrl);
      return this._manifest;
    } catch (err) {
      console.warn(
        '[dependency-manager] Could not fetch remote manifest, falling back to bundled:',
        err
      );
    }

    this._manifest = loadManifest();
    return this._manifest;
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /** Returns the last known status for a dependency. */
  getDependencyStatus(id: string): DependencyStatus {
    return (
      this.statusMap.get(id) ?? {
        id,
        name: id,
        status: 'not-checked',
      }
    );
  }

  /**
   * Returns the current install status of all known dependencies.
   * The status strings are narrowed to the values expected by dependency-ipc-handlers.ts:
   * `'installed' | 'not-installed' | 'checking' | 'error'`.
   */
  async getStatus(): Promise<
    Array<{
      name: string;
      status: 'installed' | 'not-installed' | 'checking' | 'error';
      version?: string;
      error?: string;
    }>
  > {
    type IpcStatus = 'installed' | 'not-installed' | 'checking' | 'error';

    const toIpcStatus = (s: DependencyStatus['status']): IpcStatus => {
      switch (s) {
        case 'installed':    return 'installed';
        case 'error':        return 'error';
        case 'downloading':
        case 'installing':
        case 'not-checked':  return 'checking';
        default:             return 'not-installed';
      }
    };

    try {
      const manifest = await this.getManifest();
      return manifest.dependencies.map((dep) => {
        const cached = this.statusMap.get(dep.id);
        if (!cached) return { name: dep.name, status: 'checking' as IpcStatus };
        return {
          name: dep.name,
          status: toIpcStatus(cached.status),
          version: cached.installedVersion,
          error: cached.error,
        };
      });
    } catch {
      return [];
    }
  }

  private setStatus(status: DependencyStatus): void {
    this.statusMap.set(status.id, status);
  }

  // -------------------------------------------------------------------------
  // Cache info
  // -------------------------------------------------------------------------

  /** Returns total cache size and a list of cached download entries. */
  async getCacheInfo(): Promise<CacheInfo> {
    const entries = dependencyCacheService.getAll();
    const totalBytes = dependencyCacheService.getCacheSize();
    return {
      totalBytes,
      entries: entries.map((e) => ({
        filename: e.filename,
        bytes: e.size,
        cachedAt: e.downloadedAt,
      })),
    };
  }

  /** Clears all cached dependency downloads. */
  async clearCache(): Promise<void> {
    dependencyCacheService.cleanup(0); // 0 days = delete everything
  }

  // -------------------------------------------------------------------------
  // ensureDependency
  // -------------------------------------------------------------------------

  /**
   * Ensures that the given dependency is installed and ready.
   *
   * - CLIENT mode: PostgreSQL is always skipped (returns 'skipped').
   * - SERVER / DESKTOP mode: full detection → download → install pipeline.
   */
  async ensureDependency(
    id: string,
    installMode: 'SERVER' | 'DESKTOP' | 'CLIENT',
    options: InstallOptions = {}
  ): Promise<DependencyStatus> {
    const {
      skipIfInstalled = true,
      useCache = true,
      onProgress,
      onDownloadProgress,
    } = options;

    const manifest = await this.getManifest();
    const entry = manifest.dependencies.find((d) => d.id === id);
    if (!entry) {
      const status: DependencyStatus = {
        id,
        name: id,
        status: 'error',
        error: `Dependency "${id}" not found in manifest`,
      };
      this.setStatus(status);
      return status;
    }

    // CLIENT mode: skip server-only dependencies
    if (installMode === 'CLIENT' && id === 'postgresql') {
      const status: DependencyStatus = {
        id,
        name: entry.name,
        status: 'skipped',
      };
      this.setStatus(status);
      return status;
    }

    const platformKey = platformInfo.platformKey;
    const platformDep = getDependencyForPlatform(manifest, id, platformKey);

    if (!platformDep) {
      const status: DependencyStatus = {
        id,
        name: entry.name,
        status: 'error',
        error: `No installer available for platform: ${platformKey}`,
      };
      this.setStatus(status);
      return status;
    }

    const config = getDependencyConfig();

    // ------------------------------------------------------------------
    // Step 1: Detect already-installed version
    // ------------------------------------------------------------------
    const report = (step: string, detail: string, pct: number) => {
      onProgress?.(step, detail, pct);
      this.emit('step-update', { stepId: step, status: 'running', detail });
      this.emit('log', detail);
    };

    report('detect', `Checking for installed ${entry.name}…`, 5);

    // ------------------------------------------------------------------
    // PostgreSQL: Super Admin metadata → GitHub ZIP — never bundled
    // ------------------------------------------------------------------
    if (id === 'postgresql') {
      const runtimePath = await getVerifiedDownloadedPgCtlPath();
      if (runtimePath && skipIfInstalled) {
        const version = (await getInstalledVersion(runtimePath)) ?? 'installed';
        const status: DependencyStatus = {
          id,
          name: entry.name,
          status: 'installed',
          installedVersion: version,
          installedPath: runtimePath,
        };
        this.setStatus(status);
        report('detect', `${entry.name} ${version} runtime already available`, 100);
        this.emit('step-update', { stepId: 'detect', status: 'complete' });
        return status;
      }

      const systemPath = await detectCompatiblePostgres(platformDep);
      if (systemPath && skipIfInstalled) {
        const version = (await getInstalledVersion(systemPath)) ?? 'installed';
        const status: DependencyStatus = {
          id,
          name: entry.name,
          status: 'installed',
          installedVersion: version,
          installedPath: systemPath,
        };
        this.setStatus(status);
        report('detect', `${entry.name} ${version} already installed`, 100);
        this.emit('step-update', { stepId: 'detect', status: 'complete' });
        return status;
      }

      this.setStatus({ id, name: entry.name, status: 'downloading' });
      report('download', 'Downloading PostgreSQL…', 25);

      const downloaded = await ensurePortablePostgresDownloaded((detail) => {
        report('download', detail, 50);
        this.emit('log', detail);
      });

      if (!downloaded) {
        const status: DependencyStatus = {
          id,
          name: entry.name,
          status: 'error',
          error:
            'Unable to download the PostgreSQL database component. Please check your internet connection and try again.',
        };
        this.setStatus(status);
        this.emit('step-update', { stepId: 'download', status: 'error', error: status.error });
        return status;
      }

      const version = (await getInstalledVersion(downloaded)) ?? 'installed';
      const finalStatus: DependencyStatus = {
        id,
        name: entry.name,
        status: 'installed',
        installedVersion: version,
        installedPath: downloaded,
      };
      this.setStatus(finalStatus);
      report('install', `PostgreSQL ${version} ready`, 100);
      this.emit('step-update', { stepId: 'install', status: 'complete' });
      return finalStatus;
    }

    // ------------------------------------------------------------------
    // Non-PostgreSQL dependencies: existing detect → cache → download → install
    // ------------------------------------------------------------------
    const detectedPath =
      (platformDep.detectPaths ?? []).find((candidate) => existsSync(candidate)) ?? null;

    if (detectedPath && skipIfInstalled) {
      const version = await getInstalledVersion(detectedPath).catch(() => null);
      const compatible =
        !version ||
        isVersionCompatible(
          version,
          entry.minimumVersion ?? '0.0',
          entry.maximumVersion ?? '99.99'
        );

      if (compatible) {
        const status: DependencyStatus = {
          id,
          name: entry.name,
          status: 'installed',
          installedVersion: version ?? undefined,
          installedPath: detectedPath,
        };
        this.setStatus(status);
        report('detect', `${entry.name} ${version ?? ''} already installed`, 100);
        this.emit('step-update', { stepId: 'detect', status: 'complete' });
        return status;
      }
      report(
        'detect',
        `Installed version ${version} is not compatible, will reinstall`,
        10
      );
    }

    // ------------------------------------------------------------------
    // Step 2: Check cache
    // ------------------------------------------------------------------
    let installerPath: string | null = null;

    if (useCache && config.useCache) {
      report('cache', 'Checking download cache…', 15);
      installerPath = await dependencyCacheService.getCachedPath(
        id,
        entry.currentVersion,
        platformKey
      );
      if (installerPath) {
        report('cache', `Using cached installer: ${path.basename(installerPath)}`, 20);
      }
    }

    // ------------------------------------------------------------------
    // Step 3: Download if not cached
    // ------------------------------------------------------------------
    if (!installerPath) {
      const cacheDir = config.cacheDir;
      const destPath = path.join(cacheDir, platformDep.filename);
      const fullUrl = platformDep.url.startsWith('http')
        ? platformDep.url
        : `${manifest.baseUrl}${platformDep.url}`;

      this.setStatus({ id, name: entry.name, status: 'downloading' });
      report('download', `Downloading ${entry.name} ${entry.currentVersion}…`, 20);

      try {
        const result = await downloadEngineService.downloadFile({
          url: fullUrl,
          destPath,
          expectedChecksum: platformDep.checksum,
          onProgress: (prog) => {
            onDownloadProgress?.(prog);
            this.emit('download-progress', {
              filename: prog.filename,
              percentage: prog.percentage,
              speedKBps: prog.speedKBps,
              etaSeconds: prog.etaSeconds,
              bytesDownloaded: prog.bytesDownloaded,
              totalBytes: prog.totalBytes,
              status: prog.status,
              error: prog.error,
            });
            report(
              'download',
              `${prog.percentage.toFixed(1)}% — ${prog.speedKBps.toFixed(0)} KB/s`,
              20 + Math.floor(prog.percentage * 0.5) // 20–70%
            );
          },
        });

        installerPath = result.path;

        // Cache the verified download
        dependencyCacheService.addToCache({
          id,
          version: entry.currentVersion,
          platform: platformKey,
          filename: platformDep.filename,
          filePath: installerPath,
          checksum: platformDep.checksum,
          size: result.size,
          downloadedAt: new Date().toISOString(),
        });
      } catch (dlErr) {
        const errMsg = dlErr instanceof Error ? dlErr.message : String(dlErr);
        const isDns =
          /ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|ETIMEDOUT/i.test(errMsg);

        const hint = isDns
          ? '\n\nThe download server is unreachable. Check your network and retry.'
          : '\n\nRetry by restarting the application.';

        const status: DependencyStatus = {
          id,
          name: entry.name,
          status: 'error',
          error: `Download failed: ${errMsg}${hint}`,
        };
        this.setStatus(status);
        this.emit('step-update', { stepId: 'download', status: 'error', error: errMsg });
        return status;
      }
    }

    // ------------------------------------------------------------------
    // Step 4: Install
    // ------------------------------------------------------------------
    this.setStatus({ id, name: entry.name, status: 'installing' });
    report('install', `Installing ${entry.name}…`, 72);

    try {
      const pgConfig = ensurePostgresCredentials();
      await runSilentInstaller(
        installerPath,
        platformDep,
        pgConfig,
        (msg) => {
          report('install', msg, 80);
        }
      );
    } catch (installErr) {
      const errMsg = installErr instanceof Error ? installErr.message : String(installErr);
      const status: DependencyStatus = {
        id,
        name: entry.name,
        status: 'error',
        error: `Installation failed: ${errMsg}`,
      };
      this.setStatus(status);
      this.emit('step-update', { stepId: 'install', status: 'error', error: errMsg });
      return status;
    }

    // Re-detect after installation
    const freshPath =
      (platformDep.detectPaths ?? []).find((candidate) => existsSync(candidate)) ?? null;
    const freshVersion = freshPath ? await getInstalledVersion(freshPath).catch(() => null) : null;

    const finalStatus: DependencyStatus = {
      id,
      name: entry.name,
      status: 'installed',
      installedVersion: freshVersion ?? entry.currentVersion,
      installedPath: freshPath ?? undefined,
    };
    this.setStatus(finalStatus);
    report('install', `${entry.name} installed successfully`, 100);
    this.emit('step-update', { stepId: 'install', status: 'complete' });
    return finalStatus;
  }

  // -------------------------------------------------------------------------
  // ensurePostgresRunning
  // -------------------------------------------------------------------------

  /**
   * High-level entry point.
   *
   * Supports two call signatures:
   *   - `ensurePostgresRunning(onProgress, installMode?)` — used by main.ts / postgres-installer
   *   - `ensurePostgresRunning({ mode, isCancelled })` — used by dependency-ipc-handlers
   *
   * Flow:
   *   1. If CLIENT mode → throw (caller should not invoke this in CLIENT mode)
   *   2. Ensure postgresql binary is installed via ensureDependency
   *   3. If cluster not initialised → initdb
   *   4. If not running → start
   *   5. Return PostgresConfig
   */
  async ensurePostgresRunning(
    onProgressOrOptions: ProgressFn | EnsurePostgresOptions,
    installMode?: string
  ): Promise<PostgresConfig> {
    // Normalise the two call signatures
    let onProgress: ProgressFn;
    let mode: string;
    let isCancelled: () => boolean;

    if (typeof onProgressOrOptions === 'function') {
      onProgress = onProgressOrOptions;
      mode = installMode ?? 'DESKTOP';
      isCancelled = () => false;
    } else {
      const opts = onProgressOrOptions as EnsurePostgresOptions;
      mode = opts.mode ?? 'DESKTOP';
      isCancelled = opts.isCancelled ?? (() => false);
      onProgress = (msg: string) => this.emit('log', msg);
    }

    if (mode === 'CLIENT') {
      throw new Error('ensurePostgresRunning must not be called in CLIENT mode');
    }

    const pgConfig = ensurePostgresCredentials();
    onProgress('Checking PostgreSQL installation…');

    if (isCancelled()) throw new Error('Cancelled');

    // Ensure installed
    const installStatus = await this.ensureDependency(
      'postgresql',
      mode as 'SERVER' | 'DESKTOP',
      {
        onProgress: (_step, detail) => {
          onProgress(detail);
        },
      }
    );

    if (installStatus.status === 'error') {
      throw new Error(installStatus.error ?? 'PostgreSQL installation failed');
    }

    if (isCancelled()) throw new Error('Cancelled');

    // Resolve pg_ctl path
    const manifest = await this.getManifest();
    const platformDep = getDependencyForPlatform(
      manifest,
      'postgresql',
      platformInfo.platformKey
    );

    if (!platformDep) {
      throw new Error(
        `No PostgreSQL manifest entry for platform ${platformInfo.platformKey}`
      );
    }

    let pgCtlPath = await detectCompatiblePostgres(platformDep);
    if (!pgCtlPath) {
      onProgress('Downloading PostgreSQL for Admin PC…');
      pgCtlPath = await ensurePortablePostgresDownloaded(onProgress);
    }
    if (!pgCtlPath) {
      throw new Error(
        'Unable to download the PostgreSQL database component. Please check your internet connection and try again.'
      );
    }

    // Corrupt / half-wiped clusters — NEVER auto-wipe. Wiping deletes all policy data.
    // Attempt start with the existing directory; if it truly cannot start, surface the error.
    if (isClusterInitialized(pgConfig.dataDir) && !isClusterHealthy(pgConfig.dataDir)) {
      onProgress(
        'PostgreSQL data directory looks incomplete — keeping existing data and attempting start…'
      );
      console.warn(
        '[postgres] Cluster files look incomplete; refusing automatic wipe to protect customer/policy data:',
        pgConfig.dataDir
      );
    }

    // Major-version mismatch (e.g. leftover PG 16 data + new PG 18 runtime) cannot start.
    // Re-init a fresh cluster. Dump/restore across majors is out of scope for desktop setup.
    if (isClusterInitialized(pgConfig.dataDir)) {
      const compat = await isClusterCompatibleWithRuntime(pgConfig.dataDir, pgCtlPath);
      if (!compat.compatible) {
        onProgress(
          `Existing database was created with PostgreSQL ${compat.clusterVersion}, ` +
            `but this app uses PostgreSQL ${compat.runtimeVersion}. Creating a fresh database…`
        );
        console.warn(
          `[postgres] Incompatible cluster ${compat.clusterVersion} vs runtime ${compat.runtimeVersion}; wiping data dir only (license kept)`
        );
        await wipeClusterDataDir(pgCtlPath, pgConfig.dataDir, onProgress);
      }
    }

    const startFreshCluster = async () => {
      onProgress('Initialising PostgreSQL cluster…');

      if (isCancelled()) throw new Error('Cancelled');
      await stopPostgres(pgCtlPath, pgConfig.dataDir).catch(() => undefined);

      await initDatabase(
        pgCtlPath,
        pgConfig.dataDir,
        pgConfig.user,
        pgConfig.password,
        onProgress
      );

      const port = await findAvailablePort();
      pgConfig.port = port;
      saveSecureStore({ ...loadSecureStore(), dbPort: port });

      if (isCancelled()) throw new Error('Cancelled');
      await startPostgres(pgCtlPath, pgConfig.dataDir, port, onProgress);
      await createAppUserAndDatabase(pgCtlPath, pgConfig, pgConfig.password, onProgress);
    };

    // Init cluster if needed
    if (!isClusterInitialized(pgConfig.dataDir)) {
      await startFreshCluster();
    } else {
      // Prefer configured port; if something else holds it, pick another and persist.
      let port = pgConfig.port;
      const running = await waitForPostgresReady(pgConfig.host, port, 2_000);
      if (!running) {
        if (!(await isPortAvailable(port))) {
          port = await findAvailablePort();
          pgConfig.port = port;
          saveSecureStore({ ...loadSecureStore(), dbPort: port });
        }
        if (isCancelled()) throw new Error('Cancelled');
        onProgress('Starting PostgreSQL…');
        try {
          await startPostgres(pgCtlPath, pgConfig.dataDir, port, onProgress);
        } catch (startErr) {
          const msg = startErr instanceof Error ? startErr.message : String(startErr);
          const needsReinit =
            /incompatible with server|control file appears to be corrupt|database files are incompatible/i.test(
              msg
            );
          if (!needsReinit) throw startErr;

          onProgress(
            'Existing PostgreSQL data cannot be used with this version. Creating a fresh database…'
          );
          console.warn('[postgres] Start failed with incompatible/corrupt cluster; reinitialising:', msg);
          await wipeClusterDataDir(pgCtlPath, pgConfig.dataDir, onProgress);
          await startFreshCluster();
          return pgConfig;
        }
      } else {
        onProgress('PostgreSQL is already running');
      }

      // Ensure app database exists even on retries of a previously failed setup.
      try {
        await createAppUserAndDatabase(pgCtlPath, pgConfig, pgConfig.password, onProgress);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `${msg}\n\nIf setup keeps failing, use "Reset database" then retry.`
        );
      }
    }

    return pgConfig;
  }

  // -------------------------------------------------------------------------
  // installPostgres (backward-compat shim)
  // -------------------------------------------------------------------------

  /**
   * Ensures PostgreSQL portable binaries are available (metadata from Super Admin,
   * ZIP from GitHub). The Electron installer does not ship PostgreSQL.
   */
  async installPostgres(
    configOrProgress: PostgresConfig | ProgressFn,
    maybeProgress?: ProgressFn
  ): Promise<void> {
    const onProgress: ProgressFn =
      typeof configOrProgress === 'function' ? configOrProgress : (maybeProgress ?? (() => void 0));

    const status = await this.ensureDependency('postgresql', 'DESKTOP', {
      skipIfInstalled: true,
      onProgress: (_step, detail) => onProgress(detail),
    });

    if (status.status === 'error') {
      throw new Error(status.error ?? 'PostgreSQL installation failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: DependencyManagerService | null = null;

/**
 * Returns (or creates) the singleton DependencyManagerService instance.
 */
export const getDependencyManager = (): DependencyManagerService => {
  if (!_instance) _instance = new DependencyManagerService();
  return _instance;
};

// Re-export postgres types & helpers for convenience
export type { PostgresConfig, ProgressFn };
export {
  ensurePostgresCredentials,
  getDefaultPostgresConfig,
  buildDatabaseUrl,
  generatePostgresPassword,
  resetPostgresData,
};
