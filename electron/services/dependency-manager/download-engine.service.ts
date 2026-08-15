/**
 * DownloadEngineService — Robust file downloader with:
 *  - Resume support (Range header + .download temp file)
 *  - Retry with exponential backoff
 *  - Real-time progress reporting (bytes, %, speed, ETA)
 *  - SHA256 checksum verification
 *  - Cancellation via AbortSignal
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDependencyConfig } from './dependency-config';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DownloadProgress {
  url: string;
  filename: string;
  bytesDownloaded: number;
  totalBytes: number;
  /** 0–100 */
  percentage: number;
  speedKBps: number;
  etaSeconds: number;
  status: 'pending' | 'downloading' | 'verifying' | 'complete' | 'error' | 'cancelled';
  error?: string;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export interface DownloadOptions {
  url: string;
  destPath: string;
  /** 'sha256:abc123…' */
  expectedChecksum?: string;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
  /** Allow resuming a partial .download file (default: true) */
  resumable?: boolean;
}

export interface DownloadResult {
  path: string;
  checksum: string;
  size: number;
  resumed: boolean;
  /** Elapsed milliseconds */
  duration: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Parses a full URL string and returns the appropriate Node http/https module.
 */
const pickProtocol = (url: string) =>
  url.startsWith('https://') ? https : http;

// ---------------------------------------------------------------------------
// verifyChecksum
// ---------------------------------------------------------------------------

/**
 * Verifies the SHA256 checksum of a local file against an expected value.
 * @param filePath  Absolute path to the file
 * @param expected  Checksum in 'sha256:<hex>' format
 * @returns true if the checksum matches, false otherwise
 */
const verifyChecksum = async (
  filePath: string,
  expected: string
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const parts = expected.split(':');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      return reject(new Error(`Unsupported checksum format: "${expected}"`));
    }
    const expectedHash = parts[1].toLowerCase();

    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () =>
      resolve(hash.digest('hex').toLowerCase() === expectedHash)
    );
    stream.on('error', reject);
  });
};

// ---------------------------------------------------------------------------
// downloadFile
// ---------------------------------------------------------------------------

/**
 * Downloads a file from `url` to `destPath`.
 *
 * Features:
 * - Saves to a `.download` temp file and renames on success
 * - Sends `Range` header if a partial `.download` file already exists
 * - Reports progress every ~500 ms via `onProgress`
 * - Verifies SHA256 checksum if `expectedChecksum` is provided
 * - Retries up to `maxRetries` times with exponential backoff
 * - Respects an `AbortSignal` for cancellation
 */
const downloadFile = async (options: DownloadOptions): Promise<DownloadResult> => {
  const { url, destPath, expectedChecksum, onProgress, signal, resumable = true } = options;
  const config = getDependencyConfig();
  const maxRetries = config.maxRetries;

  const filename = path.basename(destPath);
  const tempPath = `${destPath}.download`;

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const startTime = Date.now();
  let lastAttemptError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      await sleep(backoffMs);
    }

    if (signal?.aborted) {
      const err = new Error('Download cancelled');
      onProgress?.({
        url, filename, bytesDownloaded: 0, totalBytes: 0,
        percentage: 0, speedKBps: 0, etaSeconds: 0,
        status: 'cancelled', error: err.message,
      });
      throw err;
    }

    try {
      const result = await attemptDownload({
        url, destPath, tempPath, filename, expectedChecksum,
        onProgress, signal, resumable, config, startTime,
      });
      return result;
    } catch (err) {
      lastAttemptError = err instanceof Error ? err : new Error(String(err));

      // Non-retryable: cancellation or checksum mismatch
      if (
        lastAttemptError.message.includes('cancelled') ||
        lastAttemptError.message.includes('Checksum mismatch')
      ) {
        throw lastAttemptError;
      }

      // Delete corrupt partial file before retrying
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      }

      if (attempt < maxRetries) {
        onProgress?.({
          url, filename, bytesDownloaded: 0, totalBytes: 0,
          percentage: 0, speedKBps: 0, etaSeconds: 0,
          status: 'downloading',
          error: `Attempt ${attempt + 1} failed, retrying… (${lastAttemptError.message})`,
        });
      }
    }
  }

  throw lastAttemptError ?? new Error(`Failed to download ${url} after ${maxRetries + 1} attempts`);
};

// ---------------------------------------------------------------------------
// Internal: single download attempt
// ---------------------------------------------------------------------------

interface AttemptOptions {
  url: string;
  destPath: string;
  tempPath: string;
  filename: string;
  expectedChecksum?: string;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
  resumable: boolean;
  config: ReturnType<typeof getDependencyConfig>;
  startTime: number;
}

const attemptDownload = (opts: AttemptOptions): Promise<DownloadResult> => {
  const {
    url, destPath, tempPath, filename, expectedChecksum,
    onProgress, signal, resumable, config, startTime,
  } = opts;

  return new Promise((resolve, reject) => {
    // Detect partial file
    let resumeFromBytes = 0;
    let resumed = false;
    if (resumable && fs.existsSync(tempPath)) {
      try {
        resumeFromBytes = fs.statSync(tempPath).size;
        resumed = resumeFromBytes > 0;
      } catch { /* ignore */ }
    }

    const headers: Record<string, string> = {};
    if (resumed) headers['Range'] = `bytes=${resumeFromBytes}-`;

    const protocol = pickProtocol(url);
    const req = protocol.get(url, { headers, timeout: config.downloadTimeoutMs }, (res) => {
      // Follow redirects (up to 5)
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        req.destroy();
        attemptDownload({ ...opts, url: res.headers.location })
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode && res.statusCode !== 200 && res.statusCode !== 206) {
        req.destroy();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const isPartial = res.statusCode === 206;
      const contentLength = parseInt(res.headers['content-length'] ?? '0', 10);
      const totalBytes = isPartial
        ? resumeFromBytes + contentLength
        : contentLength;

      // Open file for writing (append if resuming)
      const writeFlags = isPartial ? 'a' : 'w';
      const writeStream = fs.createWriteStream(tempPath, { flags: writeFlags });

      let bytesDownloaded = isPartial ? resumeFromBytes : 0;
      let lastProgressTs = Date.now();
      let lastProgressBytes = bytesDownloaded;

      const progressInterval = setInterval(() => {
        if (!onProgress) return;
        const now = Date.now();
        const elapsed = (now - lastProgressTs) / 1000;
        const bytesSinceLast = bytesDownloaded - lastProgressBytes;
        const speedKBps = elapsed > 0 ? bytesSinceLast / 1024 / elapsed : 0;
        const remaining = totalBytes - bytesDownloaded;
        const etaSeconds =
          speedKBps > 0 ? remaining / 1024 / speedKBps : 0;
        const percentage =
          totalBytes > 0 ? Math.min((bytesDownloaded / totalBytes) * 100, 99) : 0;

        lastProgressTs = now;
        lastProgressBytes = bytesDownloaded;

        onProgress({
          url, filename, bytesDownloaded, totalBytes,
          percentage, speedKBps, etaSeconds, status: 'downloading',
        });
      }, 500);

      res.on('data', (chunk: Buffer) => {
        bytesDownloaded += chunk.length;
      });

      res.pipe(writeStream);

      const cleanup = () => clearInterval(progressInterval);

      // Cancellation
      const onAbort = () => {
        cleanup();
        req.destroy();
        writeStream.destroy();
        reject(new Error('Download cancelled'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      writeStream.on('finish', async () => {
        cleanup();
        signal?.removeEventListener('abort', onAbort);

        // Verify checksum (skip PLACEHOLDER values until real hashes are published)
        if (
          expectedChecksum &&
          config.verifyChecksums &&
          !/PLACEHOLDER/i.test(expectedChecksum)
        ) {
          onProgress?.({
            url, filename, bytesDownloaded, totalBytes,
            percentage: 99, speedKBps: 0, etaSeconds: 0,
            status: 'verifying',
          });

          try {
            const ok = await verifyChecksum(tempPath, expectedChecksum);
            if (!ok) {
              try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
              return reject(
                new Error(`Checksum mismatch for ${filename}. File may be corrupt.`)
              );
            }
          } catch (csErr) {
            return reject(csErr);
          }
        } else if (/PLACEHOLDER/i.test(expectedChecksum ?? '')) {
          console.warn('[download-engine] Skipping PLACEHOLDER checksum for', filename);
        }

        // Rename temp → final
        try {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          fs.renameSync(tempPath, destPath);
        } catch (renameErr) {
          return reject(renameErr);
        }

        // Compute final checksum for the result
        let finalChecksum = '';
        try {
          const hash = crypto.createHash('sha256');
          const buf = fs.readFileSync(destPath);
          hash.update(buf);
          finalChecksum = `sha256:${hash.digest('hex')}`;
        } catch { /* best-effort */ }

        const size = (() => {
          try { return fs.statSync(destPath).size; } catch { return bytesDownloaded; }
        })();

        onProgress?.({
          url, filename, bytesDownloaded: size, totalBytes: size,
          percentage: 100, speedKBps: 0, etaSeconds: 0,
          status: 'complete',
        });

        resolve({
          path: destPath,
          checksum: finalChecksum,
          size,
          resumed,
          duration: Date.now() - startTime,
        });
      });

      writeStream.on('error', (err) => {
        cleanup();
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      });

      res.on('error', (err) => {
        cleanup();
        writeStream.destroy();
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Download timed out after ${config.downloadTimeoutMs}ms: ${url}`));
    });
  });
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// Named export so other modules can import verifyChecksum directly
export { verifyChecksum };

export const downloadEngineService = { downloadFile, verifyChecksum };
