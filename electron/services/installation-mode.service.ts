/**
 * InstallationModeService — persists and exposes the installation type.
 *
 *   SERVER  — Admin PC (CRM + Postgres + Wi‑Fi share)
 *   CLIENT  — Employee PC (discover Admin)
 *   DESKTOP — Single-PC offline
 *
 * Stored in: %APPDATA%/InsureCRM Desktop/install-mode.json
 * Override: INSTALL_MODE=SERVER|CLIENT|DESKTOP
 */

import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

export type InstallMode = 'SERVER' | 'CLIENT' | 'DESKTOP';

const VALID_MODES: InstallMode[] = ['SERVER', 'CLIENT', 'DESKTOP'];
const DEFAULT_MODE: InstallMode = 'DESKTOP';

export class InstallationModeService {
  private _mode: InstallMode | null = null;
  private _filePath: string;

  constructor() {
    this._filePath = join(app.getPath('userData'), 'install-mode.json');
  }

  /**
   * True once the user (or env) has chosen a valid mode.
   * Corrupt/empty file → treat as unchosen so role-select shows.
   */
  hasChosenMode(): boolean {
    if (
      process.env.INSTALL_MODE &&
      VALID_MODES.includes(process.env.INSTALL_MODE.toUpperCase() as InstallMode)
    ) {
      return true;
    }
    try {
      if (!existsSync(this._filePath)) return false;
      const data = JSON.parse(readFileSync(this._filePath, 'utf8'));
      return Boolean(data?.mode && VALID_MODES.includes(data.mode));
    } catch {
      return false;
    }
  }

  getMode(): InstallMode {
    if (this._mode) return this._mode;

    const envMode = process.env.INSTALL_MODE?.toUpperCase() as InstallMode;
    if (envMode && VALID_MODES.includes(envMode)) {
      this._mode = envMode;
      return this._mode;
    }

    try {
      if (existsSync(this._filePath)) {
        const data = JSON.parse(readFileSync(this._filePath, 'utf8'));
        if (data.mode && VALID_MODES.includes(data.mode)) {
          this._mode = data.mode as InstallMode;
          return this._mode;
        }
      }
    } catch {
      /* corrupted */
    }

    this._mode = DEFAULT_MODE;
    return this._mode;
  }

  isServer() {
    return this.getMode() === 'SERVER';
  }
  isClient() {
    return this.getMode() === 'CLIENT';
  }
  isDesktop() {
    return this.getMode() === 'DESKTOP';
  }

  setMode(mode: InstallMode): void {
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`Invalid installation mode: ${mode}. Valid: ${VALID_MODES.join(', ')}`);
    }
    try {
      mkdirSync(join(this._filePath, '..'), { recursive: true });
      writeFileSync(
        this._filePath,
        JSON.stringify({ mode, setAt: new Date().toISOString() }, null, 2)
      );
      this._mode = mode;
      console.log(`[install-mode] Mode set to: ${mode}`);
    } catch (err) {
      console.error('[install-mode] Failed to persist mode:', err);
    }
  }

  /** Clear persisted mode so first-run role select shows again. */
  clearMode(): void {
    try {
      if (existsSync(this._filePath)) unlinkSync(this._filePath);
      this._mode = null;
      console.log('[install-mode] Mode cleared — role select will show');
    } catch (err) {
      console.error('[install-mode] Failed to clear mode:', err);
    }
  }

  getInfo() {
    return {
      mode: this.hasChosenMode() ? this.getMode() : null,
      chosen: this.hasChosenMode(),
      isServer: this.hasChosenMode() && this.isServer(),
      isClient: this.hasChosenMode() && this.isClient(),
      isDesktop: this.hasChosenMode() && this.isDesktop(),
      filePath: this._filePath,
      source: process.env.INSTALL_MODE
        ? 'env'
        : existsSync(this._filePath)
          ? 'file'
          : 'unset',
    };
  }

  async promptAndSet(mainWindow: Electron.BrowserWindow): Promise<InstallMode> {
    const { dialog } = await import('electron');
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'InsureCRM — This computer is…',
      message: 'How will this computer be used?',
      detail: [
        'Admin PC (Server): installs database + CRM. Employees on the same Wi‑Fi find it automatically.',
        'Employee PC: no database — connects to the Admin PC over Wi‑Fi.',
        'Single PC only: offline standalone (other PCs will not connect).',
      ].join('\n\n'),
      buttons: ['Admin PC (Server)', 'Employee PC', 'Single PC only'],
      defaultId: 0,
      cancelId: 0,
    });

    const map: InstallMode[] = ['SERVER', 'CLIENT', 'DESKTOP'];
    const selected = map[result.response] ?? 'SERVER';
    this.setMode(selected);
    return selected;
  }
}

let _instance: InstallationModeService | null = null;
export const getInstallationMode = (): InstallationModeService => {
  if (!_instance) _instance = new InstallationModeService();
  return _instance;
};
