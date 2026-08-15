/**
 * postgres-installer/index.ts
 *
 * Prefer order for Admin / DESKTOP mode:
 *   1. InsureCRM portable PostgreSQL under userData (downloaded once via Super Admin metadata)
 *   2. System PostgreSQL if present at manifest detectPaths
 *   3. Fetch metadata from Super Admin → download ZIP from GitHub → verify SHA-256
 *
 * The Electron installer does not ship PostgreSQL binaries.
 * After the runtime is cached, CRM/database operation works offline.
 */

import { getDependencyManager } from '../dependency-manager/dependency-manager.service';
import {
  ensurePostgresCredentials,
  getDefaultPostgresConfig,
  buildDatabaseUrl,
  generatePostgresPassword,
  resetPostgresData,
  stopEmbeddedPostgres,
  PostgresConfig,
} from '../dependency-manager/providers/postgres-provider';

// ---------------------------------------------------------------------------
// Re-exports — same interface as the original postgres-installer
// ---------------------------------------------------------------------------

export type { PostgresConfig };
export {
  ensurePostgresCredentials,
  getDefaultPostgresConfig,
  buildDatabaseUrl,
  generatePostgresPassword,
  resetPostgresData,
  stopEmbeddedPostgres,
};

/** Progress callback type used across the installer API */
export type ProgressFn = (msg: string) => void;

// ---------------------------------------------------------------------------
// installPostgres
// ---------------------------------------------------------------------------

/**
 * Downloads and installs PostgreSQL if not already present on the system.
 *
 * Supports two call signatures for backward compatibility:
 *   - `installPostgres(onProgress)` — new single-arg form
 *   - `installPostgres(config, onProgress)` — legacy two-arg form used by main.ts
 *
 * Delegates to DependencyManagerService which handles:
 *  - Platform detection (win32-x64, darwin-arm64, etc.)
 *  - Portable ZIP download + checksum verification
 *  - Cluster initialisation (via ensurePostgresRunning)
 */
export const installPostgres = async (
  configOrProgress: PostgresConfig | ProgressFn,
  maybeProgress?: ProgressFn
): Promise<void> => {
  const onProgress: ProgressFn =
    typeof configOrProgress === 'function'
      ? configOrProgress
      : (maybeProgress ?? (() => void 0));

  const dm = getDependencyManager();
  await dm.installPostgres(onProgress);
};

// ---------------------------------------------------------------------------
// ensurePostgresRunning
// ---------------------------------------------------------------------------

/**
 * Ensures PostgreSQL is installed, initialised, and running.
 *
 * Returns the active PostgresConfig (host, port, user, password, database,
 * dataDir) so callers can build a connection URL via `buildDatabaseUrl`.
 *
 * @param onProgress  Called with human-readable status messages
 */
export const ensurePostgresRunning = async (
  onProgress: ProgressFn
): Promise<PostgresConfig> => {
  const dm = getDependencyManager();
  return dm.ensurePostgresRunning(onProgress);
};
