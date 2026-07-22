/**
 * InstallationModeService — persists and exposes the installation type.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INSTALLATION MODES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   SERVER  — This machine IS the CRM server.
 *             • Backend runs as a Windows Service (started at boot).
 *             • Electron connects to localhost.
 *             • System tray always visible.
 *             • Never runs its own embedded backend.
 *
 *   CLIENT  — This is an employee workstation.
 *             • No backend, no PostgreSQL, no Windows Service.
 *             • Electron discovers the server via UDP or saved address.
 *             • Connects to the remote CRM server.
 *
 *   DESKTOP — Legacy single-machine all-in-one mode (original behaviour).
 *             • Electron starts its own embedded backend.
 *             • PostgreSQL runs locally.
 *             • Used for offline single-user installs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PERSISTENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *   Stored in: %APPDATA%/InsureCRM Desktop/install-mode.json
 *   Set once during installation / first run and never changed automatically.
 *   Can be overridden by environment variable: INSTALL_MODE=SERVER|CLIENT|DESKTOP
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export type InstallMode = 'SERVER' | 'CLIENT' | 'DESKTOP';

const VALID_MODES: InstallMode[] = ['SERVER', 'CLIENT', 'DESKTOP'];
const DEFAULT_MODE: InstallMode  = 'DESKTOP'; // backward-compatible default

export class InstallationModeService {
  private _mode: InstallMode | null = null;
  private _filePath: string;

  constructor() {
    this._filePath = join(app.getPath('userData'), 'install-mode.json');
  }

  /**
   * Get the current installation mode.
   * Priority: env var → persisted file → default (DESKTOP)
   */
  getMode(): InstallMode {
    if (this._mode) return this._mode;

    // 1. Environment variable override (useful for CI / testing / installer scripts)
    const envMode = process.env.INSTALL_MODE?.toUpperCase() as InstallMode;
    if (envMode && VALID_MODES.includes(envMode)) {
      this._mode = envMode;
      return this._mode;
    }

    // 2. Persisted file
    try {
      if (existsSync(this._filePath)) {
        const data = JSON.parse(readFileSync(this._filePath, 'utf8'));
        if (data.mode && VALID_MODES.includes(data.mode)) {
          this._mode = data.mode as InstallMode;
          return this._mode;
        }
      }
    } catch { /* corrupted — use default */ }

    // 3. Default
    this._mode = DEFAULT_MODE;
    return this._mode;
  }

  /** Convenience getters */
  isServer()  { return this.getMode() === 'SERVER'; }
  isClient()  { return this.getMode() === 'CLIENT'; }
  isDesktop() { return this.getMode() === 'DESKTOP'; }

  /**
   * Persist the installation mode.
   * Call this during first-run setup or from the installer.
   */
  setMode(mode: InstallMode): void {
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`Invalid installation mode: ${mode}. Valid: ${VALID_MODES.join(', ')}`);
    }
    try {
      mkdirSync(join(this._filePath, '..'), { recursive: true });
      writeFileSync(this._filePath, JSON.stringify({ mode, setAt: new Date().toISOString() }, null, 2));
      this._mode = mode;
      console.log(`[install-mode] Mode set to: ${mode}`);
    } catch (err) {
      console.error('[install-mode] Failed to persist mode:', err);
    }
  }

  /**
   * Get full info object (used for logging and IPC).
   */
  getInfo() {
    return {
      mode:      this.getMode(),
      isServer:  this.isServer(),
      isClient:  this.isClient(),
      isDesktop: this.isDesktop(),
      filePath:  this._filePath,
      source:    process.env.INSTALL_MODE ? 'env' : existsSync(this._filePath) ? 'file' : 'default',
    };
  }

  /**
   * Called from the installer IPC handler when the user selects their install type.
   */
  async promptAndSet(mainWindow: Electron.BrowserWindow): Promise<InstallMode> {
    const { dialog } = await import('electron');
    const result = await dialog.showMessageBox(mainWindow, {
      type:    'question',
      title:   'InsuredHub — Installation Type',
      message: 'How is this machine being used?',
      detail:  [
        'SERVER: This machine hosts the CRM backend for all employees.',
        'CLIENT: This is an employee workstation that connects to the server.',
        'DESKTOP: Single-machine standalone mode (legacy).',
      ].join('\n'),
      buttons:   ['SERVER', 'CLIENT', 'DESKTOP'],
      defaultId: 2,
      cancelId:  2,
    });

    const selected = VALID_MODES[result.response] ?? DEFAULT_MODE;
    this.setMode(selected);
    return selected;
  }
}

// Module-level singleton — created lazily to avoid app.getPath() before app.ready
let _instance: InstallationModeService | null = null;
export const getInstallationMode = (): InstallationModeService => {
  if (!_instance) _instance = new InstallationModeService();
  return _instance;
};
