/**
 * SystemTrayService — manages the Electron system tray icon and menu.
 *
 * BEHAVIOUR
 * ──────────
 * • Closing the main window hides it to the tray (NEVER quits the app).
 * • The tray icon shows a context menu with server controls.
 * • "Exit Server" shows a confirmation dialog before quitting.
 * • Double-clicking the tray icon shows / focuses the main window.
 *
 * USAGE (in main.ts)
 * ──────────────────
 *   import { SystemTrayService } from './services/system-tray.service';
 *   const tray = new SystemTrayService(mainWindow);
 *   tray.init();
 *   // Intercept window close:
 *   mainWindow.on('close', (e) => tray.handleWindowClose(e));
 */

import { Tray, Menu, MenuItem, app, BrowserWindow, dialog, nativeImage } from 'electron';
import { join } from 'path';
import type { MenuItemConstructorOptions } from 'electron';

export interface TrayServerInfo {
  status: string;
  ip?: string;
  version?: string;
  connectedUsers?: number;
  dbStatus?: string;
}

export class SystemTrayService {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow;
  private serverInfo: TrayServerInfo = { status: 'Starting...' };
  private refreshInterval: NodeJS.Timer | null = null;
  private onRestartBackend?: () => Promise<void>;
  private onRestartOcr?: () => Promise<void>;
  private onBackupNow?: () => Promise<void>;
  private onViewLogs?: () => void;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Register optional action callbacks from main.ts.
   */
  setCallbacks(callbacks: {
    onRestartBackend?: () => Promise<void>;
    onRestartOcr?: () => Promise<void>;
    onBackupNow?: () => Promise<void>;
    onViewLogs?: () => void;
  }) {
    this.onRestartBackend = callbacks.onRestartBackend;
    this.onRestartOcr    = callbacks.onRestartOcr;
    this.onBackupNow     = callbacks.onBackupNow;
    this.onViewLogs      = callbacks.onViewLogs;
  }

  /**
   * Initialise the tray icon.  Call once after createWindow().
   */
  init() {
    const iconPath = this._resolveIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    this.tray.setToolTip('InsuredHub — Server');
    this.tray.on('double-click', () => this._showWindow());
    this._buildMenu();

    // Refresh menu every 10 seconds to reflect live server data
    this.refreshInterval = setInterval(() => this._buildMenu(), 10_000);
  }

  /** Destroy the tray instance and stop refresh timer. */
  destroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval as unknown as number);
    this.tray?.destroy();
    this.tray = null;
  }

  /**
   * Update the cached server info (called from main.ts when health data arrives).
   */
  updateServerInfo(info: Partial<TrayServerInfo>) {
    this.serverInfo = { ...this.serverInfo, ...info };
    this._buildMenu();
  }

  /**
   * Call this from mainWindow's 'close' event.
   * Prevents the window from closing — hides to tray instead.
   *
   *   mainWindow.on('close', (e) => tray.handleWindowClose(e));
   */
  handleWindowClose(event: Electron.Event) {
    event.preventDefault();
    this.mainWindow.hide();
    this.tray?.displayBalloon?.({
      iconType: 'info',
      title: 'InsuredHub',
      content: 'Server is running in the background. Click the tray icon to reopen.',
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _showWindow() {
    if (!this.mainWindow) return;
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  private _buildMenu() {
    const { status, ip, version, connectedUsers, dbStatus } = this.serverInfo;

    const template: MenuItemConstructorOptions[] = [
      // ── Header (non-clickable info) ─────────────────────────────────────
      { label: '📋 InsuredHub Server', enabled: false },
      { type: 'separator' },

      // ── Navigation ───────────────────────────────────────────────────────
      {
        label: '🖥  Open Dashboard',
        click: () => this._showWindow(),
      },

      { type: 'separator' },

      // ── Live status (read-only) ──────────────────────────────────────────
      {
        label: `⚡ Status: ${status || 'Unknown'}`,
        enabled: false,
      },
      {
        label: `🌐 IP: ${ip || 'Detecting...'}`,
        enabled: false,
      },
      {
        label: `🔢 Version: ${version || app.getVersion()}`,
        enabled: false,
      },
      {
        label: `👥 Connected Users: ${connectedUsers ?? '—'}`,
        enabled: false,
      },
      {
        label: `🗄  Database: ${dbStatus || 'Unknown'}`,
        enabled: false,
      },

      { type: 'separator' },

      // ── Actions ──────────────────────────────────────────────────────────
      {
        label: '🔄 Restart Backend',
        click: () => this._withConfirm(
          'Restart Backend?',
          'This will briefly disconnect all users.',
          async () => { await this.onRestartBackend?.(); }
        ),
      },
      {
        label: '🔁 Restart OCR',
        click: async () => { await this.onRestartOcr?.(); },
      },
      {
        label: '💾 Backup Now',
        click: async () => { await this.onBackupNow?.(); },
      },
      {
        label: '📄 View Logs',
        click: () => this.onViewLogs?.(),
      },

      { type: 'separator' },

      // ── Exit ─────────────────────────────────────────────────────────────
      {
        label: '🔴 Exit Server',
        click: () => this._withConfirm(
          'Exit InsuredHub Server?',
          'All connected users will be disconnected. The Windows Service (if installed) will restart the backend automatically.',
          () => {
            this.destroy();
            app.exit(0);
          }
        ),
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    this.tray?.setContextMenu(menu);
  }

  private _withConfirm(title: string, message: string, action: () => void | Promise<void>) {
    const win = BrowserWindow.getFocusedWindow() || this.mainWindow;
    dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Cancel', 'Confirm'],
      defaultId: 0,
      cancelId: 0,
      title,
      message,
    }).then(({ response }) => {
      if (response === 1) void action();
    });
  }

  private _resolveIconPath(): string {
    // Look for icon in several locations (packaged vs dev)
    const candidates = [
      join(__dirname, '../../resources/tray-icon.png'),
      join(__dirname, '../../resources/icon.png'),
      join(app.getAppPath(), 'resources/tray-icon.png'),
      join(process.resourcesPath || '', 'tray-icon.png'),
    ];
    for (const p of candidates) {
      try {
        const fs = require('fs');
        if (fs.existsSync(p)) return p;
      } catch { /* ignore */ }
    }
    return candidates[0]; // nativeImage.createFromPath returns empty for missing files
  }
}
