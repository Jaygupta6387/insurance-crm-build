/**
 * WindowsServiceManagerService — manages the InsuredHub Windows Service.
 *
 * Uses `node-windows` to install, uninstall, start, and stop the backend
 * as a native Windows Service (Service Control Manager).
 *
 * The service runs the backend (server.js / crm-bootstrap.cjs) as a
 * background process that:
 *   • Starts automatically on Windows boot (before user login)
 *   • Restarts automatically after crashes
 *   • Runs under LocalSystem (or a dedicated service account)
 *   • Writes to Windows Event Log
 *
 * NOTE: Installation requires Administrator privileges.
 *       On non-Windows platforms all methods are no-ops.
 *
 * USAGE (in main.ts IPC handlers)
 * ────────────────────────────────
 *   import { WindowsServiceManager } from './services/windows-service-manager.service';
 *   const svc = new WindowsServiceManager();
 *   await svc.install();    // one-time setup
 *   await svc.getStatus();  // RUNNING / STOPPED / NOT_INSTALLED
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { app } from 'electron';

const execAsync = promisify(exec);

export type ServiceStatus = 'RUNNING' | 'STOPPED' | 'STARTING' | 'STOPPING' | 'NOT_INSTALLED' | 'UNKNOWN';

const SERVICE_NAME        = 'InsuredHubServer';
const SERVICE_DISPLAY     = 'InsuredHub CRM Server';
const SERVICE_DESCRIPTION = 'InsuredHub Enterprise CRM Backend Service — manages the Node.js API, PostgreSQL, discovery and health endpoints.';

export class WindowsServiceManager {
  private isWindows = process.platform === 'win32';

  /**
   * Get the current status of the Windows Service.
   */
  async getStatus(): Promise<ServiceStatus> {
    if (!this.isWindows) return 'NOT_INSTALLED';
    try {
      const { stdout } = await execAsync(
        `sc query "${SERVICE_NAME}"`,
        { timeout: 5000 }
      );
      if (stdout.includes('RUNNING'))  return 'RUNNING';
      if (stdout.includes('STOPPED'))  return 'STOPPED';
      if (stdout.includes('START_PENDING')) return 'STARTING';
      if (stdout.includes('STOP_PENDING'))  return 'STOPPING';
      return 'UNKNOWN';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('does not exist') || msg.includes('1060')) return 'NOT_INSTALLED';
      return 'UNKNOWN';
    }
  }

  /**
   * Install the service via the node-windows install script.
   * The script lives at resources/install-service.js in the packaged app.
   */
  async install(): Promise<{ success: boolean; message: string }> {
    if (!this.isWindows) {
      return { success: false, message: 'Windows Service installation is only supported on Windows.' };
    }
    try {
      const script = this._resolveInstallScript();
      await execAsync(`node "${script}" --action install`, { timeout: 60_000 });
      return { success: true, message: 'Service installed successfully' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Uninstall the service.
   */
  async uninstall(): Promise<{ success: boolean; message: string }> {
    if (!this.isWindows) return { success: false, message: 'Not on Windows' };
    try {
      const script = this._resolveInstallScript();
      await execAsync(`node "${script}" --action uninstall`, { timeout: 60_000 });
      return { success: true, message: 'Service uninstalled successfully' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Start the service via `sc start`.
   */
  async start(): Promise<{ success: boolean; message: string }> {
    if (!this.isWindows) return { success: false, message: 'Not on Windows' };
    try {
      await execAsync(`sc start "${SERVICE_NAME}"`, { timeout: 30_000 });
      return { success: true, message: 'Service started' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Stop the service via `sc stop`.
   */
  async stop(): Promise<{ success: boolean; message: string }> {
    if (!this.isWindows) return { success: false, message: 'Not on Windows' };
    try {
      await execAsync(`sc stop "${SERVICE_NAME}"`, { timeout: 30_000 });
      return { success: true, message: 'Service stopped' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Restart via stop → start.
   */
  async restart(): Promise<{ success: boolean; message: string }> {
    if (!this.isWindows) return { success: false, message: 'Not on Windows' };
    await this.stop().catch(() => {});
    await this._sleep(2000);
    return this.start();
  }

  /** Returns the service name constant. */
  getServiceName() { return SERVICE_NAME; }
  getDisplayName()  { return SERVICE_DISPLAY; }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _resolveInstallScript(): string {
    // In packaged app: resources/install-service.js
    // In dev: scripts/install-windows-service.mjs
    const candidates = [
      join(process.resourcesPath || '', 'install-service.js'),
      join(app.getAppPath(), 'resources', 'install-service.js'),
      join(app.getAppPath(), '..', 'scripts', 'install-windows-service.mjs'),
    ];
    for (const p of candidates) {
      try {
        require('fs').accessSync(p);
        return p;
      } catch { /* try next */ }
    }
    return candidates[0];
  }

  private _sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
