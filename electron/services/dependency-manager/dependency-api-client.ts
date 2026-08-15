/**
 * Fetches PostgreSQL dependency metadata from Super Admin.
 * Desktop downloads the ZIP directly from GitHub using the returned URL + SHA-256.
 * Super Admin never proxies the binary.
 */

import https from 'https';
import http from 'http';
import { platformInfo } from './platform-detector';

export interface PostgresDependencyMeta {
  name: string;
  version: string;
  serverVersion: string;
  platform: 'windows' | 'macos';
  architecture: 'x64' | 'arm64';
  fileName: string;
  downloadUrl: string;
  sha256: string;
  channel: string;
}

const DEFAULT_CLOUD_API =
  process.env.LICENSE_CLOUD_API_URL ||
  process.env.DEPENDENCY_API_BASE_URL ||
  'https://super-admin-panel-crm-backend.onrender.com/api';

const getApiBase = (): string => {
  const raw = (
    process.env.DEPENDENCY_API_BASE_URL ||
    process.env.LICENSE_CLOUD_API_URL ||
    DEFAULT_CLOUD_API
  ).trim().replace(/\/$/, '');
  // Accept either .../api or .../api/dependencies style — normalize to .../api
  if (raw.endsWith('/dependencies')) return raw.replace(/\/dependencies$/, '');
  return raw;
};

export const mapDesktopPlatform = (): {
  platform: 'windows' | 'macos';
  architecture: 'x64' | 'arm64';
} => {
  if (platformInfo.isWindows) {
    return { platform: 'windows', architecture: 'x64' };
  }
  if (platformInfo.isAppleSilicon) {
    return { platform: 'macos', architecture: 'arm64' };
  }
  if (platformInfo.isIntelMac || platformInfo.isMac) {
    return { platform: 'macos', architecture: 'x64' };
  }
  throw new Error(`Unsupported platform for PostgreSQL: ${platformInfo.displayName}`);
};

const isHexSha256 = (value: string): boolean => /^[a-fA-F0-9]{64}$/.test(value);

const validateMeta = (raw: unknown): PostgresDependencyMeta => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid dependency API response');
  }
  const d = raw as Record<string, unknown>;
  const name = String(d.name || '');
  const version = String(d.version || '');
  const serverVersion = String(d.serverVersion || d.server_version || '');
  const platform = String(d.platform || '') as PostgresDependencyMeta['platform'];
  const architecture = String(d.architecture || '') as PostgresDependencyMeta['architecture'];
  const fileName = String(d.fileName || d.file_name || '');
  const downloadUrl = String(d.downloadUrl || d.download_url || '');
  const sha256 = String(d.sha256 || '').toLowerCase();
  const channel = String(d.channel || 'stable');

  if (name !== 'postgresql') throw new Error('Dependency name must be postgresql');
  if (!version) throw new Error('Dependency version missing');
  if (!serverVersion) throw new Error('Dependency serverVersion missing');
  if (platform !== 'windows' && platform !== 'macos') throw new Error('Invalid platform in dependency metadata');
  if (architecture !== 'x64' && architecture !== 'arm64') {
    throw new Error('Invalid architecture in dependency metadata');
  }
  if (!fileName) throw new Error('Dependency fileName missing');
  if (!downloadUrl.startsWith('https://')) throw new Error('Dependency downloadUrl must be HTTPS');
  if (!isHexSha256(sha256)) throw new Error('Dependency sha256 must be 64 hex characters');

  return {
    name,
    version,
    serverVersion,
    platform,
    architecture,
    fileName,
    downloadUrl,
    sha256,
    channel,
  };
};

const httpGetJson = (url: string, redirects = 0): Promise<unknown> =>
  new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects fetching dependency metadata'));
      return;
    }
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      reject(new Error('Dependency API URL must be http(s)'));
      return;
    }
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      { headers: { 'User-Agent': 'InsureCRM-Desktop/1.0', Accept: 'application/json' }, timeout: 30_000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          httpGetJson(next, redirects + 1).then(resolve).catch(reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) {
            let message = `Dependency API HTTP ${res.statusCode}`;
            try {
              const parsed = JSON.parse(body);
              if (parsed?.message) message = parsed.message;
            } catch {
              /* ignore */
            }
            const err = new Error(message) as Error & { statusCode?: number };
            err.statusCode = res.statusCode;
            reject(err);
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Dependency API returned non-JSON'));
          }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Dependency API request timed out'));
    });
  });

/**
 * Resolve PostgreSQL package metadata for this machine from Super Admin.
 */
export const fetchPostgresqlDependency = async (
  channel = 'stable'
): Promise<PostgresDependencyMeta> => {
  const { platform, architecture } = mapDesktopPlatform();

  if (platform === 'macos' && architecture === 'x64') {
    throw new Error(
      'This version of InsureHub does not currently support PostgreSQL on Intel Mac.'
    );
  }

  const base = getApiBase();
  const qs = new URLSearchParams({ platform, architecture, channel }).toString();
  const url = `${base}/dependencies/postgresql?${qs}`;

  const payload = (await httpGetJson(url)) as {
    success?: boolean;
    data?: { dependency?: unknown };
    dependency?: unknown;
  };

  if (!payload?.success) {
    throw new Error('Dependency API returned unsuccessful response');
  }

  const dep = payload.data?.dependency ?? payload.dependency;
  const meta = validateMeta(dep);

  if (meta.platform !== platform || meta.architecture !== architecture) {
    throw new Error('Dependency API returned metadata for a different platform/architecture');
  }

  return meta;
};

/**
 * Anonymous runtime report (counts only — no company/PII).
 */
export const reportPostgresqlRuntime = async (meta: {
  package_version: string;
  server_version?: string;
  platform: string;
  architecture: string;
}): Promise<void> => {
  const base = getApiBase();
  const url = `${base}/dependencies/runtime-report`;
  const body = JSON.stringify({
    dependency_name: 'postgresql',
    ...meta,
  });

  await new Promise<void>((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'InsureCRM-Desktop/1.0',
        },
        timeout: 15_000,
      },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Runtime report HTTP ${res.statusCode}`));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Runtime report timed out'));
    });
    req.write(body);
    req.end();
  });
};

export { getApiBase };
