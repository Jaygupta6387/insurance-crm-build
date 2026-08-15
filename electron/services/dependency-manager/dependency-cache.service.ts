/**
 * DependencyCacheService — Manages cached dependency downloads.
 * Prevents re-downloading already-verified installers by persisting a
 * JSON index alongside the cached files in the user's data directory.
 */

import fs from 'fs';
import path from 'path';
import { getDependencyConfig } from './dependency-config';
import { verifyChecksum } from './download-engine.service';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface CacheEntry {
  /** Dependency ID (e.g. 'postgresql') */
  id: string;
  version: string;
  platform: string;
  filename: string;
  /** Absolute path to the cached installer file */
  filePath: string;
  /** 'sha256:<hex>' */
  checksum: string;
  /** File size in bytes */
  size: number;
  /** ISO-8601 timestamp */
  downloadedAt: string;
}

interface CacheIndex {
  version: '1.0';
  entries: CacheEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getIndexPath = (): string => {
  const { cacheDir } = getDependencyConfig();
  return path.join(cacheDir, 'cache-index.json');
};

const ensureCacheDir = (): void => {
  const { cacheDir } = getDependencyConfig();
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
};

const loadIndex = (): CacheIndex => {
  try {
    const indexPath = getIndexPath();
    if (!fs.existsSync(indexPath)) return { version: '1.0', entries: [] };
    const raw = fs.readFileSync(indexPath, 'utf8');
    return JSON.parse(raw) as CacheIndex;
  } catch {
    return { version: '1.0', entries: [] };
  }
};

const saveIndex = (index: CacheIndex): void => {
  try {
    ensureCacheDir();
    fs.writeFileSync(getIndexPath(), JSON.stringify(index, null, 2), 'utf8');
  } catch (err) {
    console.error('[dependency-cache] Failed to save cache index:', err);
  }
};

const buildKey = (id: string, version: string, platform: string) =>
  `${id}@${version}/${platform}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to a cached file if it exists on disk and its
 * checksum still matches. Returns `null` otherwise.
 */
const getCachedPath = async (
  id: string,
  version: string,
  platform: string
): Promise<string | null> => {
  const index = loadIndex();
  const key = buildKey(id, version, platform);
  const entry = index.entries.find(
    (e) => buildKey(e.id, e.version, e.platform) === key
  );

  if (!entry) return null;
  if (!fs.existsSync(entry.filePath)) {
    // File was deleted externally — remove stale entry
    removeEntry(id, version, platform);
    return null;
  }

  // Re-verify checksum to guard against corruption
  try {
    const ok = await verifyChecksum(entry.filePath, entry.checksum);
    if (!ok) {
      console.warn('[dependency-cache] Checksum mismatch for cached file, evicting:', entry.filePath);
      removeEntry(id, version, platform);
      try { fs.unlinkSync(entry.filePath); } catch { /* ignore */ }
      return null;
    }
  } catch {
    return null;
  }

  return entry.filePath;
};

/**
 * Returns `true` synchronously if a cache entry exists (file existence only,
 * no checksum re-verification). Use `getCachedPath` for a verified lookup.
 */
const isCached = (id: string, version: string, platform: string): boolean => {
  const index = loadIndex();
  const key = buildKey(id, version, platform);
  const entry = index.entries.find(
    (e) => buildKey(e.id, e.version, e.platform) === key
  );
  return !!entry && fs.existsSync(entry.filePath);
};

/**
 * Adds or updates a cache entry in the index.
 */
const addToCache = (entry: CacheEntry): void => {
  const index = loadIndex();
  const key = buildKey(entry.id, entry.version, entry.platform);
  const existing = index.entries.findIndex(
    (e) => buildKey(e.id, e.version, e.platform) === key
  );
  if (existing >= 0) {
    index.entries[existing] = entry;
  } else {
    index.entries.push(entry);
  }
  saveIndex(index);
};

/**
 * Removes a single entry from the index (does NOT delete the file).
 */
const removeEntry = (id: string, version: string, platform: string): void => {
  const index = loadIndex();
  const key = buildKey(id, version, platform);
  index.entries = index.entries.filter(
    (e) => buildKey(e.id, e.version, e.platform) !== key
  );
  saveIndex(index);
};

/**
 * Returns the total size of all cached files in bytes.
 */
const getCacheSize = (): number => {
  const index = loadIndex();
  return index.entries.reduce((acc, e) => acc + (e.size ?? 0), 0);
};

/**
 * Removes cached entries (and their files) that are older than `olderThanDays`
 * days. Defaults to 30 days.
 */
const cleanup = (olderThanDays = 30): void => {
  const index = loadIndex();
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const kept: CacheEntry[] = [];

  for (const entry of index.entries) {
    const ts = new Date(entry.downloadedAt).getTime();
    if (ts < cutoff) {
      try { fs.unlinkSync(entry.filePath); } catch { /* ignore */ }
    } else {
      kept.push(entry);
    }
  }

  index.entries = kept;
  saveIndex(index);
};

/**
 * Returns all cache entries.
 */
const getAll = (): CacheEntry[] => loadIndex().entries;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type { CacheEntry };

export const dependencyCacheService = {
  getCachedPath,
  addToCache,
  isCached,
  getCacheSize,
  cleanup,
  getAll,
};
