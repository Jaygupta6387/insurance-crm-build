/**
 * Download portable PostgreSQL for Admin PC using Super Admin dependency metadata.
 *
 * Flow: Super Admin API → URL + SHA-256 → Desktop downloads ZIP from GitHub directly.
 * Existing postgres-provider setup (initdb/start/…) is unchanged.
 */

import { createHash } from 'crypto';
import { execFile } from 'child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
} from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { app } from 'electron';
import https from 'https';
import { platformInfo } from '../platform-detector';
import { matchesServerVersion } from '../postgres-version';
import {
  fetchPostgresqlDependency,
  reportPostgresqlRuntime,
  mapDesktopPlatform,
  type PostgresDependencyMeta,
} from '../dependency-api-client';

const execFileAsync = promisify(execFile);
const MAX_REDIRECTS = 5;

const USER_DOWNLOAD_ERROR =
  'Unable to download the PostgreSQL database component. Please check your internet connection and try again.';

export const getPortableRuntimeDir = (): string => {
  const folder = platformInfo.isWindows ? 'postgresql-win' : 'postgresql-mac';
  return join(app.getPath('userData'), 'postgresql-runtime', folder);
};

const getMetaCachePath = (): string =>
  join(app.getPath('userData'), 'postgresql-runtime', 'last-dependency.json');

export const getDownloadedPgCtlPath = (): string | null => {
  const binName = platformInfo.isWindows ? 'pg_ctl.exe' : 'pg_ctl';
  const candidate = join(getPortableRuntimeDir(), 'bin', binName);
  return existsSync(candidate) ? candidate : null;
};

const getPgCtlVersion = async (pgCtlPath: string): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync(pgCtlPath, ['--version'], { timeout: 5_000 });
    const match = stdout.trim().match(/(\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const readCachedMeta = (): PostgresDependencyMeta | null => {
  try {
    const p = getMetaCachePath();
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8')) as PostgresDependencyMeta;
  } catch {
    return null;
  }
};

const writeCachedMeta = (meta: PostgresDependencyMeta) => {
  mkdirSync(join(getMetaCachePath(), '..'), { recursive: true });
  writeFileSync(getMetaCachePath(), JSON.stringify(meta, null, 2), 'utf8');
};

/**
 * Returns pg_ctl for an existing local runtime when it looks healthy.
 * Does not call the network — offline-safe for subsequent launches.
 */
export const getVerifiedDownloadedPgCtlPath = async (): Promise<string | null> => {
  const existing = getDownloadedPgCtlPath();
  if (!existing) return null;

  const version = await getPgCtlVersion(existing);
  if (!version) return null;

  const cached = readCachedMeta();
  if (cached?.serverVersion && !matchesServerVersion(version, cached.serverVersion)) {
    console.warn(
      `[postgres] Local runtime ${version} does not match last known serverVersion ${cached.serverVersion}; keeping local runtime (no auto-upgrade)`
    );
  }

  // Existing working runtime wins — never auto-replace on startup.
  return existing;
};

const downloadToFile = (
  url: string,
  destFile: string,
  onProgress: (msg: string) => void,
  redirects = 0
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) {
      reject(new Error('Too many redirects while downloading PostgreSQL'));
      return;
    }
    if (!url.startsWith('https://')) {
      reject(new Error('PostgreSQL downloads must use HTTPS'));
      return;
    }

    const req = https.get(
      url,
      { headers: { 'User-Agent': 'InsureCRM-Desktop/1.0' }, timeout: 600_000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          downloadToFile(next, destFile, onProgress, redirects + 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Download failed HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(String(res.headers['content-length'] || '0'), 10);
        let received = 0;
        let lastPct = -1;
        const out = createWriteStream(destFile);
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.floor((received / total) * 100);
            if (pct >= lastPct + 5) {
              lastPct = pct;
              onProgress(`Downloading PostgreSQL… ${pct}%`);
            }
          }
        });
        res.pipe(out);
        out.on('finish', () => resolve());
        out.on('error', reject);
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('PostgreSQL download timed out'));
    });
  });

const isZipFile = (filePath: string): boolean => {
  try {
    const fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    readSync(fd, buf, 0, 4, 0);
    closeSync(fd);
    return buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
  } catch {
    return false;
  }
};

const sha256File = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const extractZip = async (zipPath: string, outDir: string) => {
  mkdirSync(outDir, { recursive: true });
  if (platformInfo.isWindows) {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
      ],
      { timeout: 600_000 }
    );
  } else {
    await execFileAsync('unzip', ['-qo', zipPath, '-d', outDir], { timeout: 600_000 });
  }
};

const findPgsqlRoot = (extractedDir: string): string | null => {
  const direct = join(extractedDir, 'pgsql');
  if (existsSync(join(direct, 'bin'))) return direct;
  for (const name of readdirSync(extractedDir)) {
    const candidate = join(extractedDir, name, 'pgsql');
    if (existsSync(join(candidate, 'bin'))) return candidate;
    const nested = join(extractedDir, name);
    if (existsSync(join(nested, 'bin', platformInfo.isWindows ? 'pg_ctl.exe' : 'pg_ctl'))) {
      return nested;
    }
  }
  return null;
};

const deleteQuietly = (target: string) => {
  try {
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
};

/**
 * Ensures portable PostgreSQL exists under userData.
 * Existing verified runtime is reused offline (no API, no download).
 */
export const ensurePortablePostgresDownloaded = async (
  onProgress: (msg: string) => void
): Promise<string | null> => {
  const existing = await getVerifiedDownloadedPgCtlPath();
  if (existing) {
    onProgress('Using previously downloaded PostgreSQL');
    return existing;
  }

  const runtimeDir = getPortableRuntimeDir();
  const cacheDir = join(app.getPath('userData'), 'dependency-cache');
  mkdirSync(cacheDir, { recursive: true });

  let meta: PostgresDependencyMeta;
  try {
    onProgress('Checking PostgreSQL...');
    meta = await fetchPostgresqlDependency('stable');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[postgres] dependency API error:', msg);
    if (/Intel Mac/i.test(msg)) {
      onProgress(msg);
    } else {
      onProgress(
        `${USER_DOWNLOAD_ERROR} Could not reach the InsureHub dependency service.`
      );
    }
    return null;
  }

  const zipPath = join(cacheDir, meta.fileName);
  const extractTmp = join(cacheDir, `pg-extract-${Date.now()}`);
  const stagingRuntime = `${runtimeDir}.staging-${Date.now()}`;

  try {
    if (!existsSync(zipPath)) {
      onProgress(`Downloading PostgreSQL ${meta.version}...`);
      const partial = `${zipPath}.partial`;
      deleteQuietly(partial);
      try {
        await downloadToFile(meta.downloadUrl, partial, onProgress);
        renameSync(partial, zipPath);
      } catch (dlErr) {
        deleteQuietly(partial);
        throw dlErr;
      }
    } else {
      onProgress(`Using cached PostgreSQL ${meta.version} package…`);
    }

    if (!isZipFile(zipPath)) {
      deleteQuietly(zipPath);
      throw new Error('Downloaded PostgreSQL package is not a valid ZIP');
    }

    onProgress(`Verifying PostgreSQL ${meta.version}…`);
    const actual = await sha256File(zipPath);
    if (actual !== meta.sha256.toLowerCase()) {
      deleteQuietly(zipPath);
      throw new Error(
        `PostgreSQL package checksum mismatch (expected ${meta.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…).`
      );
    }

    onProgress('Extracting PostgreSQL...');
    mkdirSync(extractTmp, { recursive: true });
    await extractZip(zipPath, extractTmp);

    const pgsqlRoot = findPgsqlRoot(extractTmp);
    if (!pgsqlRoot) throw new Error('PostgreSQL binaries not found inside downloaded zip');

    const binName = platformInfo.isWindows ? 'pg_ctl.exe' : 'pg_ctl';
    if (!existsSync(join(pgsqlRoot, 'bin', binName))) {
      throw new Error('pg_ctl missing inside downloaded PostgreSQL package');
    }

    mkdirSync(join(runtimeDir, '..'), { recursive: true });
    deleteQuietly(stagingRuntime);
    renameSync(pgsqlRoot, stagingRuntime);

    const stagedCtl = join(stagingRuntime, 'bin', binName);
    const version = await getPgCtlVersion(stagedCtl);
    if (!matchesServerVersion(version, meta.serverVersion)) {
      deleteQuietly(stagingRuntime);
      throw new Error(
        `Downloaded PostgreSQL reports ${version ?? 'unknown'}, expected server ${meta.serverVersion}`
      );
    }

    onProgress('Verifying PostgreSQL...');
    if (existsSync(runtimeDir)) {
      const backup = `${runtimeDir}.bak-${Date.now()}`;
      renameSync(runtimeDir, backup);
      try {
        renameSync(stagingRuntime, runtimeDir);
        deleteQuietly(backup);
      } catch (swapErr) {
        try {
          if (!existsSync(runtimeDir) && existsSync(backup)) renameSync(backup, runtimeDir);
        } catch {
          /* ignore */
        }
        throw swapErr;
      }
    } else {
      renameSync(stagingRuntime, runtimeDir);
    }

    const ctl = getDownloadedPgCtlPath();
    if (!ctl) throw new Error('pg_ctl missing after extract');

    writeCachedMeta(meta);

    try {
      const mapped = mapDesktopPlatform();
      await reportPostgresqlRuntime({
        package_version: meta.version,
        server_version: meta.serverVersion,
        platform: mapped.platform,
        architecture: mapped.architecture,
      });
    } catch (reportErr) {
      console.warn('[postgres] anonymous runtime report failed:', reportErr);
    }

    onProgress('PostgreSQL ready.');
    return ctl;
  } catch (err) {
    console.error('[postgres] portable download failed:', err);
    const technical = err instanceof Error ? err.message : String(err);
    if (/Intel Mac/i.test(technical)) onProgress(technical);
    else onProgress(`${USER_DOWNLOAD_ERROR} (${technical})`);
    return null;
  } finally {
    deleteQuietly(extractTmp);
    deleteQuietly(stagingRuntime);
  }
};
