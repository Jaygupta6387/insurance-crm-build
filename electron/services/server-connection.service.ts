/**
 * ServerConnectionService — orchestrates the full server discovery + connection flow.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIORITY ORDER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. SAVED SERVER — try the previously saved server address first.
 *      Fast path: < 3 seconds. No network scanning.
 *
 *   2. UDP DISCOVERY — listen for broadcasts on port 47912.
 *      Finds the server automatically on the same LAN/WiFi.
 *      Timeout: configurable (default 15 seconds).
 *      Validates every packet (signature, version, tenant).
 *
 *   3. MANUAL ENTRY — ask the user once, save forever.
 *      Only reached if 1 + 2 both fail.
 *      The saved address is used on all future starts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONNECTION HEALTH CHECK
 * ─────────────────────────────────────────────────────────────────────────────
 *   Before trusting a saved address, a /api/server/info health check is done.
 *   This prevents stale saved addresses from blocking discovery.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE (in main.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 *   const conn = new ServerConnectionService(mainWindow, installMode);
 *   const result = await conn.discoverAndConnect();
 *   // result: { serverUrl, serverInfo, method: 'saved' | 'udp' | 'manual' }
 */

import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';
import { loadSecureStore, saveSecureStore } from './secure-store.service';
import type { InstallationModeService } from './installation-mode.service';

// ── Type definitions ──────────────────────────────────────────────────────────
export interface ServerInfo {
  app:         string;
  serverId:    string;
  serverName:  string;
  version:     string;
  ip:          string;
  port:        number;
  companyName: string;
  tenantId:    string;
  licenseId:   string;
  deploymentMode: string;
}

export interface DiscoveryResult {
  serverUrl:  string;
  serverInfo: ServerInfo;
  method:     'saved' | 'udp' | 'manual';
}

const CONNECT_TIMEOUT_MS  = 5_000;   // saved server check
const UDP_TIMEOUT_MS      = 15_000;  // UDP discovery window
const DISCOVERY_PORT      = 47912;

export class ServerConnectionService extends EventEmitter {
  private _mainWindow: BrowserWindow;
  private _installMode: InstallationModeService;
  private _savedServerKey = 'savedServerUrl';

  constructor(mainWindow: BrowserWindow, installMode: InstallationModeService) {
    super();
    this._mainWindow  = mainWindow;
    this._installMode = installMode;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Main entry point — runs the full discovery pipeline.
   */
  async discoverAndConnect(): Promise<DiscoveryResult> {
    this._notify('Connecting to InsuredHub Server...', 'connecting');

    // ── 1. Saved server ──────────────────────────────────────────────────
    const savedUrl = this._getSavedServerUrl();
    if (savedUrl) {
      this._notify(`Trying saved server: ${savedUrl}`, 'connecting');
      const info = await this._probeServer(savedUrl);
      if (info) {
        this._notify('Connected to saved server', 'connected');
        return { serverUrl: savedUrl, serverInfo: info, method: 'saved' };
      }
      this._notify('Saved server unreachable — starting discovery...', 'discovering');
    }

    // ── 2. UDP discovery ─────────────────────────────────────────────────
    this._notify('Listening for InsuredHub server broadcasts...', 'discovering');
    try {
      const discovered = await this._discoverViaUdp();
      const serverUrl  = `http://${discovered.ip}:${discovered.port}`;
      // Full HTTP probe after UDP discovery
      const info = await this._probeServer(serverUrl);
      if (info) {
        this._saveServerUrl(serverUrl);
        this._notify('Server discovered and connected!', 'connected');
        return { serverUrl, serverInfo: info, method: 'udp' };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._notify(`UDP discovery: ${msg}`, 'discovering');
    }

    // ── 3. Manual entry ──────────────────────────────────────────────────
    this._notify('Could not find server automatically. Please enter the server address.', 'manual');
    const manualUrl = await this._promptManualAddress();
    const info = await this._probeServer(manualUrl);
    if (!info) {
      throw new Error(`Cannot connect to server at ${manualUrl}. Check the address and try again.`);
    }
    this._saveServerUrl(manualUrl);
    this._notify('Connected to server', 'connected');
    return { serverUrl: manualUrl, serverInfo: info, method: 'manual' };
  }

  /**
   * Try to connect to the server — returns serverInfo or null.
   * Used to check if the server at a given URL is an InsuredHub server.
   */
  async probeServer(url: string): Promise<ServerInfo | null> {
    return this._probeServer(url);
  }

  getSavedServerUrl() { return this._getSavedServerUrl(); }
  clearSavedServerUrl() { this._saveServerUrl(null); }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _probeServer(url: string): Promise<ServerInfo | null> {
    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
      const response   = await fetch(`${url}/api/server/info`, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) return null;
      const body = await response.json() as { success: boolean; data?: ServerInfo };
      if (body.success && body.data?.app === 'InsuredHub') {
        return body.data!;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async _discoverViaUdp(): Promise<{ ip: string; port: number }> {
    const { UDPDiscoveryClientService } = await import('./udp-discovery-client.service');
    const store  = loadSecureStore();
    const secret = store.licenseToken?.slice(0, 32) || '';
    const client = new UDPDiscoveryClientService(secret);
    return client.discover(UDP_TIMEOUT_MS);
  }

  private async _promptManualAddress(): Promise<string> {
    return new Promise((resolve) => {
      // Send request to renderer to show manual address input dialog
      this._mainWindow?.webContents?.send('server:request-manual-address');

      // Listen for the renderer's response
      const { ipcMain } = require('electron');
      const handler = (_event: unknown, address: string) => {
        ipcMain.removeListener('server:manual-address-response', handler);
        resolve(address.startsWith('http') ? address : `http://${address}`);
      };
      ipcMain.once('server:manual-address-response', handler);
    });
  }

  private _getSavedServerUrl(): string | null {
    try {
      const store = loadSecureStore() as Record<string, unknown>;
      return (store[this._savedServerKey] as string) || null;
    } catch {
      return null;
    }
  }

  private _saveServerUrl(url: string | null) {
    try {
      const store = loadSecureStore();
      saveSecureStore({ ...store, [this._savedServerKey]: url || undefined });
    } catch { /* non-fatal */ }
  }

  private _notify(message: string, stage: string) {
    console.log(`[server-connection] ${message}`);
    this._mainWindow?.webContents?.send('server:discovery-status', { message, stage });
    this.emit('status', { message, stage });
  }
}
