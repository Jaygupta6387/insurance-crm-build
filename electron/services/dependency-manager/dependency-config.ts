/**
 * DependencyManagerConfig — All configuration for the dependency manager.
 * Nothing hardcoded. All values come from environment or app defaults.
 */

import { app } from 'electron';
import path from 'path';

export interface DependencyManagerConfig {
  /** Base URL for dependency downloads */
  downloadServerUrl: string;
  /** URL to fetch the latest dependency manifest */
  manifestUrl: string;
  /** Maximum download retry attempts */
  maxRetries: number;
  /** Download timeout in milliseconds */
  downloadTimeoutMs: number;
  /** Directory for cached downloads */
  cacheDir: string;
  /** Whether to verify SHA256 checksums */
  verifyChecksums: boolean;
  /** Whether to use cached downloads */
  useCache: boolean;
  /** Proxy URL (optional) */
  proxyUrl?: string;
}

const getDefaultCacheDir = (): string => {
  try {
    return path.join(app.getPath('userData'), 'dependency-cache');
  } catch {
    return path.join(
      process.env.APPDATA || process.env.HOME || '.',
      '.insuredhub',
      'dependency-cache'
    );
  }
};

/**
 * Returns the current DependencyManagerConfig, reading all values from
 * environment variables with sensible defaults.
 */
export const getDependencyConfig = (): DependencyManagerConfig => ({
  downloadServerUrl:
    process.env.DEPENDENCY_SERVER_URL || 'https://download.insuredhub.com',
  manifestUrl:
    process.env.DEPENDENCY_MANIFEST_URL ||
    'https://download.insuredhub.com/manifest.json',
  maxRetries: parseInt(process.env.DEPENDENCY_MAX_RETRIES || '3', 10),
  downloadTimeoutMs: parseInt(
    process.env.DEPENDENCY_TIMEOUT_MS || '300000',
    10
  ), // 5 min
  cacheDir: process.env.DEPENDENCY_CACHE_DIR || getDefaultCacheDir(),
  verifyChecksums: process.env.DEPENDENCY_VERIFY_CHECKSUMS !== 'false',
  useCache: process.env.DEPENDENCY_USE_CACHE !== 'false',
  proxyUrl: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
});

/** PostgreSQL port candidates to try if the default port is busy */
export const PG_PORT_CANDIDATES = [54329, 54330, 54331, 54332, 54333, 5432];
