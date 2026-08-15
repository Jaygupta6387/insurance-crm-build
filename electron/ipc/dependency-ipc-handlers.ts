/**
 * dependency-ipc-handlers.ts
 *
 * IPC handlers for the dependency management system.
 *
 * REGISTRATION
 * ────────────
 * Add the following to electron/main.ts (after the BrowserWindow is created):
 *
 *   import { registerDependencyIpcHandlers } from './ipc/dependency-ipc-handlers';
 *   registerDependencyIpcHandlers(mainWindow);
 *
 * PRELOAD ADDITIONS
 * ─────────────────
 * The following must also be added to electron/preload.ts so the renderer
 * can reach these channels via window.desktop:
 *
 *   ensurePostgres: (options) => ipcRenderer.invoke('dependency:ensure-postgres', options),
 *   cancelDependency: () => ipcRenderer.invoke('dependency:cancel'),
 *   retryDependency: () => ipcRenderer.invoke('dependency:retry'),
 *   onDependencyStepUpdate: (cb) => {
 *     const h = (_: unknown, d: unknown) => cb(d as StepUpdatePayload);
 *     ipcRenderer.on('dependency:step-update', h);
 *     return () => ipcRenderer.removeListener('dependency:step-update', h);
 *   },
 *   onDependencyDownloadProgress: (cb) => {
 *     const h = (_: unknown, d: unknown) => cb(d as DownloadProgressPayload);
 *     ipcRenderer.on('dependency:download-progress', h);
 *     return () => ipcRenderer.removeListener('dependency:download-progress', h);
 *   },
 *   onDependencyLog: (cb) => {
 *     const h = (_: unknown, line: unknown) => cb(line as string);
 *     ipcRenderer.on('dependency:log', h);
 *     return () => ipcRenderer.removeListener('dependency:log', h);
 *   },
 */

import { ipcMain, BrowserWindow } from 'electron';

// ─── Payload types ────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'complete' | 'error' | 'skipped';

export interface StepUpdatePayload {
  stepId: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

export interface DownloadProgressPayload {
  filename: string;
  percentage: number;
  speedKBps: number;
  etaSeconds: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'pending' | 'downloading' | 'verifying' | 'complete' | 'error' | 'cancelled';
  error?: string;
}

export interface DependencyStatus {
  name: string;
  status: 'installed' | 'not-installed' | 'checking' | 'error';
  version?: string;
  error?: string;
}

export interface CacheInfo {
  totalBytes: number;
  entries: Array<{ filename: string; bytes: number; cachedAt: string }>;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Send a typed dependency event to the renderer window.
 * All dependency IPC events are funnelled through this helper.
 */
export function sendDependencyProgress(
  win: BrowserWindow | null,
  type: 'dependency:step-update' | 'dependency:download-progress' | 'dependency:log',
  data: StepUpdatePayload | DownloadProgressPayload | string
): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(type, data);
}

// ─── Cancellation token ───────────────────────────────────────────────────────

let _cancelRequested = false;

/** Returns true if a cancellation was requested for the current operation. */
export function isCancelRequested(): boolean {
  return _cancelRequested;
}

/** Reset the cancel flag (call at the start of a new operation). */
export function resetCancelFlag(): void {
  _cancelRequested = false;
}

// ─── Handler registration ─────────────────────────────────────────────────────

/**
 * registerDependencyIpcHandlers
 *
 * Registers all IPC handlers for the dependency management system.
 * Call once after the main BrowserWindow is created.
 *
 * @param win - The main BrowserWindow. May be null; handlers guard against this.
 */
export function registerDependencyIpcHandlers(win: BrowserWindow | null): void {
  // ── dependency:status ──────────────────────────────────────────────────────
  // Returns the current install status of all managed dependencies.
  ipcMain.handle('dependency:status', async (): Promise<DependencyStatus[]> => {
    try {
      // Lazy-import to avoid circular deps at module load time
      const { getDependencyManager } = await import(
        '../services/dependency-manager/dependency-manager.service'
      );
      const mgr = getDependencyManager();
      return await mgr.getStatus();
    } catch (err) {
      console.error('[dependency:status] error:', err);
      return [
        {
          name: 'PostgreSQL',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        },
      ];
    }
  });

  // ── dependency:ensure-postgres ─────────────────────────────────────────────
  // Kicks off the full installation flow and streams progress back to the
  // renderer via win.webContents.send.
  ipcMain.handle(
    'dependency:ensure-postgres',
    async (_event, options: { mode?: string } = {}): Promise<{ success: boolean; error?: string }> => {
      resetCancelFlag();
      try {
        const { getDependencyManager } = await import(
          '../services/dependency-manager/dependency-manager.service'
        );
        const mgr = getDependencyManager();

        // Wire up progress callbacks before starting
        mgr.on('step-update', (payload: StepUpdatePayload) => {
          sendDependencyProgress(win, 'dependency:step-update', payload);
        });
        mgr.on('download-progress', (payload: DownloadProgressPayload) => {
          sendDependencyProgress(win, 'dependency:download-progress', payload);
        });
        mgr.on('log', (line: string) => {
          sendDependencyProgress(win, 'dependency:log', line);
        });

        await mgr.ensurePostgresRunning({
          mode: options.mode ?? 'DESKTOP',
          isCancelled: () => _cancelRequested,
        });

        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[dependency:ensure-postgres] failed:', msg);
        return { success: false, error: msg };
      }
    }
  );

  // ── dependency:cancel ──────────────────────────────────────────────────────
  // Signals the running installation to cancel at the next checkpoint.
  ipcMain.handle('dependency:cancel', async (): Promise<void> => {
    _cancelRequested = true;
    sendDependencyProgress(win, 'dependency:step-update', {
      stepId: 'download',
      status: 'error',
      error: 'Cancelled by user',
    });
  });

  // ── dependency:retry ───────────────────────────────────────────────────────
  // Resets the cancel flag so the renderer can restart the install flow.
  ipcMain.handle('dependency:retry', async (): Promise<void> => {
    resetCancelFlag();
  });

  // ── dependency:get-manifest ────────────────────────────────────────────────
  // Returns the loaded dependency manifest (versions, URLs, checksums).
  ipcMain.handle('dependency:get-manifest', async (): Promise<unknown> => {
    try {
      const { getDependencyManager } = await import(
        '../services/dependency-manager/dependency-manager.service'
      );
      const mgr = getDependencyManager();
      return mgr.getManifest();
    } catch (err) {
      console.error('[dependency:get-manifest] error:', err);
      return null;
    }
  });

  // ── dependency:cache-info ──────────────────────────────────────────────────
  // Returns cache size and a list of cached download entries.
  ipcMain.handle('dependency:cache-info', async (): Promise<CacheInfo> => {
    try {
      const { getDependencyManager } = await import(
        '../services/dependency-manager/dependency-manager.service'
      );
      const mgr = getDependencyManager();
      return await mgr.getCacheInfo();
    } catch (err) {
      console.error('[dependency:cache-info] error:', err);
      return { totalBytes: 0, entries: [] };
    }
  });

  // ── dependency:clear-cache ─────────────────────────────────────────────────
  // Deletes all locally cached dependency downloads.
  ipcMain.handle(
    'dependency:clear-cache',
    async (): Promise<{ cleared: boolean; error?: string }> => {
      try {
        const { getDependencyManager } = await import(
          '../services/dependency-manager/dependency-manager.service'
        );
        const mgr = getDependencyManager();
        await mgr.clearCache();
        return { cleared: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[dependency:clear-cache] error:', msg);
        return { cleared: false, error: msg };
      }
    }
  );
}
