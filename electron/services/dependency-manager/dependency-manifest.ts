/**
 * DependencyManifest — Types and loader for the dependency manifest.
 *
 * Load order:
 *   1. Bundled manifest at `resources/dependency-manifest.json`
 *   2. Downloaded manifest at `<userData>/dependency-manifest.json`
 *
 * The bundled manifest ships with the app and is always available offline.
 * A fresher copy can be fetched from the server and cached in userData.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformDependency {
  url: string;
  filename: string;
  checksum: string;
  size: number;
  installerType: 'exe' | 'dmg' | 'pkg' | 'zip' | 'tar.gz' | 'deb' | 'rpm';
  silentArgs?: string[];
  detectPaths?: string[];
  serviceName?: string;
  homebrewPackage?: string;
  postInstallScript?: string;
  verifyCommand?: string;
}

export interface DependencyEntry {
  id: string;
  name: string;
  currentVersion: string;
  minimumVersion?: string;
  maximumVersion?: string;
  platforms: Record<string, PlatformDependency>;
  /** If true, this dependency is optional and failures won't abort startup */
  optional?: boolean;
  /** If true, never install on CLIENT mode machines */
  serverOnly?: boolean;
}

export interface DependencyManifest {
  version: string;
  updatedAt: string;
  baseUrl: string;
  dependencies: DependencyEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the path to the bundled manifest shipped inside the app package.
 */
const getBundledManifestPath = (): string => {
  // In production (packaged app), resources/ is next to the app bundle.
  // In development (electron-vite), it lives under the workspace root.
  const candidates = [
    // Packaged: process.resourcesPath points to the app Resources dir
    path.join(process.resourcesPath ?? '', 'dependency-manifest.json'),
    // Dev: relative to the project root
    path.join(__dirname, '..', '..', '..', '..', 'resources', 'dependency-manifest.json'),
    path.join(__dirname, '..', '..', '..', 'resources', 'dependency-manifest.json'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[candidates.length - 1]; // fallback path (may not exist)
};

/**
 * Returns the path to the downloaded (cached) manifest in userData.
 */
const getDownloadedManifestPath = (): string => {
  try {
    return path.join(app.getPath('userData'), 'dependency-manifest.json');
  } catch {
    return path.join(
      process.env.APPDATA || process.env.HOME || '.',
      '.insuredhub',
      'dependency-manifest.json'
    );
  }
};

const validateManifest = (obj: unknown): obj is DependencyManifest => {
  if (!obj || typeof obj !== 'object') return false;
  const m = obj as Record<string, unknown>;
  return (
    typeof m['version'] === 'string' &&
    typeof m['baseUrl'] === 'string' &&
    Array.isArray(m['dependencies'])
  );
};

// ---------------------------------------------------------------------------
// loadManifest
// ---------------------------------------------------------------------------

/**
 * Loads the dependency manifest.
 *
 * Priority:
 *  1. Bundled `resources/dependency-manifest.json` (ships with app)
 *  2. `<userData>/dependency-manifest.json` (downloaded copy)
 *
 * @throws Error if neither source is available or both are malformed
 */
export const loadManifest = (): DependencyManifest => {
  const bundledPath = getBundledManifestPath();
  const downloadedPath = getDownloadedManifestPath();

  for (const filePath of [bundledPath, downloadedPath]) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const obj = JSON.parse(raw);
      if (validateManifest(obj)) return obj;
      console.warn('[dependency-manifest] Skipping invalid manifest at', filePath);
    } catch (err) {
      console.warn('[dependency-manifest] Failed to parse manifest at', filePath, err);
    }
  }

  throw new Error(
    'Dependency manifest not found.\n' +
    `Tried:\n  ${bundledPath}\n  ${downloadedPath}\n\n` +
    'Reinstall the application or contact support.'
  );
};

// ---------------------------------------------------------------------------
// fetchManifest
// ---------------------------------------------------------------------------

/**
 * Downloads the dependency manifest from `manifestUrl` and saves it to
 * `<userData>/dependency-manifest.json` for offline fallback.
 *
 * @throws Error if the download or validation fails
 */
export const fetchManifest = (manifestUrl: string): Promise<DependencyManifest> => {
  return new Promise((resolve, reject) => {
    const protocol = manifestUrl.startsWith('https://') ? https : http;

    const req = protocol.get(manifestUrl, { timeout: 30_000 }, (res) => {
      // Follow redirects
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        req.destroy();
        fetchManifest(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        req.destroy();
        return reject(new Error(`Failed to fetch manifest: HTTP ${res.statusCode}`));
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const obj = JSON.parse(raw);
          if (!validateManifest(obj)) {
            return reject(new Error('Fetched manifest failed validation'));
          }

          // Persist to userData for offline fallback
          try {
            const destPath = getDownloadedManifestPath();
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            fs.writeFileSync(destPath, raw, 'utf8');
          } catch (saveErr) {
            console.warn('[dependency-manifest] Failed to cache manifest:', saveErr);
          }

          resolve(obj);
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Manifest fetch timed out'));
    });
  });
};

// ---------------------------------------------------------------------------
// getDependencyForPlatform
// ---------------------------------------------------------------------------

/**
 * Looks up the platform-specific entry for a dependency.
 *
 * @param manifest   The loaded DependencyManifest
 * @param id         Dependency ID (e.g. 'postgresql')
 * @param platformKey Platform key (e.g. 'darwin-arm64')
 * @returns PlatformDependency or null if not found
 */
export const getDependencyForPlatform = (
  manifest: DependencyManifest,
  id: string,
  platformKey: string
): PlatformDependency | null => {
  const entry = manifest.dependencies.find((d) => d.id === id);
  if (!entry) return null;
  return entry.platforms[platformKey] ?? null;
};
