/**
 * ServerConnectionService — automatic Admin PC discovery for Employee PCs.
 *
 * Uses Node.js http (NOT Chromium fetch) so Windows LAN probes work the same
 * as curl.exe. Manual Connect is a first-class IPC invoke that always works,
 * even if the background search race has ended.
 */

import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import { loadSecureStore, saveSecureStore } from './secure-store.service';
import type { InstallationModeService } from './installation-mode.service';

export interface ServerInfo {
  app: string;
  serverId: string;
  serverName: string;
  version: string;
  ip: string;
  port: number;
  companyName: string;
  tenantId: string;
  licenseId: string;
  deploymentMode: string;
}

export interface DiscoveryResult {
  serverUrl: string;
  serverInfo: ServerInfo;
  method: 'saved' | 'udp' | 'scan' | 'manual';
}

/** Fixed Admin CRM port (SERVER mode). Employees scan this port on the LAN. */
export const ADMIN_CRM_PORT = 18765;
const CONNECT_TIMEOUT_MS = 5_000;
const DISCOVERY_WINDOW_MS = 3 * 60_000;
const SCAN_TIMEOUT_MS = 15_000;
const SCAN_RETRY_MS = 8_000;

type RaceWinner = { url: string; method: 'udp' | 'scan' | 'manual'; info: ServerInfo };

/** Node http GET — reliable on Windows LAN (unlike Electron/Chromium fetch). */
export function httpGetJson(
  url: string,
  timeoutMs = CONNECT_TIMEOUT_MS
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        timeout: timeoutMs,
        headers: { Accept: 'application/json', Connection: 'close' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let body: unknown = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode || 0, body });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    });
    req.on('error', reject);
    req.end();
  });
}

export function normalizeAdminUrl(address: string): string {
  let raw = String(address || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('Enter the Admin address, e.g. 192.168.1.110:18765');
  if (!/^https?:\/\//i.test(raw) && !raw.includes(':')) {
    raw = `${raw}:${ADMIN_CRM_PORT}`;
  }
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  // If user typed host:port/path, keep origin only
  const u = new URL(raw);
  return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
}

export class ServerConnectionService extends EventEmitter {
  private _mainWindow: BrowserWindow;
  private _installMode: InstallationModeService;
  private _savedServerKey = 'savedServerUrl';
  private _manualHandler: ((event: Electron.IpcMainEvent, address: string) => void) | null = null;
  private _udpAbort: (() => void) | null = null;
  private _raceReject: ((err: Error) => void) | null = null;
  private _raceTimers = new Set<NodeJS.Timeout>();

  constructor(mainWindow: BrowserWindow, installMode: InstallationModeService) {
    super();
    this._mainWindow = mainWindow;
    this._installMode = installMode;
  }

  async discoverAndConnect(): Promise<DiscoveryResult> {
    this._notify('Searching for Admin PC on this Wi‑Fi…', 'discovering');

    const savedUrl = this._getSavedServerUrl();
    if (savedUrl) {
      this._notify('Checking last Admin address…', 'connecting');
      const info = await this.probeServer(savedUrl);
      if (info) {
        this._notify('Connected to Admin PC', 'connected');
        return { serverUrl: savedUrl, serverInfo: info, method: 'saved' };
      }
      this._notify('Admin moved — searching Wi‑Fi again…', 'discovering');
      this._saveServerUrl(null);
    }

    this._notify('Listening for Admin PC broadcasts…', 'discovering');
    const winner = await this._raceDiscovery();
    this._saveServerUrl(winner.url);
    this._notify('Connected to Admin PC', 'connected');
    return { serverUrl: winner.url, serverInfo: winner.info, method: winner.method };
  }

  /**
   * Direct connect used by the Connect button (IPC invoke).
   * Independent of the discovery race — always available.
   */
  async connectManual(address: string): Promise<DiscoveryResult> {
    const url = normalizeAdminUrl(address);
    this._notify(`Connecting to ${url.replace(/^https?:\/\//, '')}…`, 'connecting');
    const info = await this.probeServer(url);
    if (!info) {
      const reason = await this._describeConnectFailure(url);
      this._notify(reason, 'manual');
      throw new Error(reason);
    }
    // Stop any in-flight auto-search so it doesn't fight navigation
    this.abortRace();
    this._saveServerUrl(url);
    this._notify('Connected to Admin PC', 'connected');
    return { serverUrl: url, serverInfo: info, method: 'manual' };
  }

  abortRace() {
    this._udpAbort?.();
    this._udpAbort = null;
    if (this._manualHandler) {
      ipcMain.removeListener('server:manual-address-response', this._manualHandler);
      this._manualHandler = null;
    }
    if (this._raceReject) {
      const reject = this._raceReject;
      this._raceReject = null;
      reject(new Error('Discovery cancelled'));
    }
  }

  async probeServer(url: string): Promise<ServerInfo | null> {
    const base = url.replace(/\/+$/, '');
    return (
      (await this._fetchServerEndpoint(`${base}/api/server/discovery`)) ??
      (await this._fetchServerEndpoint(`${base}/api/server/info`)) ??
      (await this._probeHealthFallback(base))
    );
  }

  getSavedServerUrl() {
    return this._getSavedServerUrl();
  }

  clearSavedServerUrl() {
    this._saveServerUrl(null);
  }

  // ── Race ──────────────────────────────────────────────────────────────────

  private _raceDiscovery(): Promise<RaceWinner> {
    return new Promise((resolve, reject) => {
      let settled = false;
      this._raceReject = (err) => {
        if (settled) return;
        settled = true;
        this._cleanupRaceListenersOnly();
        reject(err);
      };

      const finish = (winner: RaceWinner) => {
        if (settled) return;
        settled = true;
        this._raceReject = null;
        this._cleanupRaceListenersOnly();
        resolve(winner);
      };

      const tryCandidate = async (url: string, method: RaceWinner['method']) => {
        if (settled) return;
        try {
          const info = await this.probeServer(url);
          if (info) finish({ url, method, info });
        } catch {
          /* keep searching */
        }
      };

      this._armManualListener(async (url) => {
        this._notify(`Connecting to ${url.replace(/^https?:\/\//, '')}…`, 'connecting');
        const info = await this.probeServer(url);
        if (info) {
          finish({ url, method: 'manual', info });
          return;
        }
        this._notify(await this._describeConnectFailure(url), 'manual');
      });

      void this._discoverViaUdp()
        .then(async (d) => {
          await tryCandidate(`http://${d.ip}:${d.port}`, 'udp');
          if (!settled && d.advertisedIp && d.advertisedIp !== d.ip) {
            await tryCandidate(`http://${d.advertisedIp}:${d.port}`, 'udp');
          }
        })
        .catch(() => {});

      const scanRepeatedly = () => {
        if (settled) return;
        this._notify('Scanning Wi‑Fi for Admin PC…', 'discovering');
        void this._scanLanForAdmin().then((url) => {
          if (url) void tryCandidate(url, 'scan');
          if (!settled) {
            this._trackTimer(setTimeout(scanRepeatedly, SCAN_RETRY_MS));
          }
        });
      };
      this._trackTimer(setTimeout(scanRepeatedly, 1_500));

      this._trackTimer(setTimeout(() => {
        if (settled) return;
        this._notify(
          'Still searching automatically. Keep both computers on the same Wi‑Fi and InsureCRM open on the Admin PC.',
          'manual'
        );
      }, 6_000));

      this._trackTimer(setTimeout(() => {
        if (!settled) {
          this._raceReject = null;
          settled = true;
          this._cleanupRaceListenersOnly();
          reject(
            new Error(
              'Could not find the Admin PC on this Wi‑Fi. Make sure InsureCRM is open on the Admin PC, then search again.'
            )
          );
        }
      }, DISCOVERY_WINDOW_MS));
    });
  }

  private _cleanupRaceListenersOnly() {
    this._udpAbort?.();
    this._udpAbort = null;
    if (this._manualHandler) {
      ipcMain.removeListener('server:manual-address-response', this._manualHandler);
      this._manualHandler = null;
    }
    for (const timer of this._raceTimers) clearTimeout(timer);
    this._raceTimers.clear();
  }

  private _trackTimer(timer: NodeJS.Timeout) {
    this._raceTimers.add(timer);
    return timer;
  }

  private _armManualListener(onAddress: (url: string) => void | Promise<void>) {
    if (this._manualHandler) {
      ipcMain.removeListener('server:manual-address-response', this._manualHandler);
    }
    this._manualHandler = (_event, address: string) => {
      try {
        const url = normalizeAdminUrl(address);
        void onAddress(url);
      } catch (err) {
        this._notify(err instanceof Error ? err.message : String(err), 'manual');
      }
    };
    ipcMain.on('server:manual-address-response', this._manualHandler);
  }

  private async _discoverViaUdp(): Promise<{
    ip: string;
    advertisedIp?: string;
    port: number;
  }> {
    const { UDPDiscoveryClientService } = await import('./udp-discovery-client.service');
    const client = new UDPDiscoveryClientService('');
    this._udpAbort = () => client.abort();
    return client.discover(DISCOVERY_WINDOW_MS);
  }

  private async _scanLanForAdmin(): Promise<string | null> {
    const prefixes = this._localSubnetPrefixes();
    if (!prefixes.length) return null;

    const hosts: string[] = [];
    for (const prefix of prefixes) {
      for (let i = 1; i <= 254; i++) hosts.push(`${prefix}.${i}`);
    }

    const deadline = Date.now() + SCAN_TIMEOUT_MS;
    const concurrency = 50;
    let index = 0;
    let found: string | null = null;

    await new Promise<void>((resolve) => {
      let inFlight = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      const pump = () => {
        if (done || found) return finish();
        if (Date.now() > deadline) return finish();
        while (inFlight < concurrency && index < hosts.length && !found) {
          const host = hosts[index++];
          inFlight += 1;
          const url = `http://${host}:${ADMIN_CRM_PORT}`;
          void this._probeHealthOnly(url, 700)
            .then((ok) => {
              inFlight -= 1;
              if (ok && !found) {
                found = url;
                finish();
                return;
              }
              if (index >= hosts.length && inFlight === 0) finish();
              else pump();
            })
            .catch(() => {
              inFlight -= 1;
              if (index >= hosts.length && inFlight === 0) finish();
              else pump();
            });
        }
        if (index >= hosts.length && inFlight === 0) finish();
      };
      pump();
    });

    return found;
  }

  private _localSubnetPrefixes(): string[] {
    const prefixes = new Set<string>();
    try {
      for (const iface of Object.values(os.networkInterfaces())) {
        for (const addr of iface || []) {
          if (addr.family !== 'IPv4' || addr.internal) continue;
          const parts = addr.address.split('.');
          if (parts.length === 4) prefixes.add(parts.slice(0, 3).join('.'));
        }
      }
    } catch {
      /* ignore */
    }
    return [...prefixes];
  }

  private async _probeHealthOnly(url: string, timeoutMs: number): Promise<boolean> {
    try {
      const { status, body } = await httpGetJson(`${url}/api/health`, timeoutMs);
      return status === 200 && !!(body as { success?: boolean })?.success;
    } catch {
      return false;
    }
  }

  private async _probeHealthFallback(url: string): Promise<ServerInfo | null> {
    try {
      const { status, body } = await httpGetJson(`${url}/api/health`, CONNECT_TIMEOUT_MS);
      if (status !== 200 || !(body as { success?: boolean })?.success) return null;
      // Prefer discovery for real tenant slug; health alone would wrongly use "local"
      const disc = await this._fetchServerEndpoint(`${url}/api/server/discovery`);
      if (disc) return disc;
      return this._syntheticInfo(url);
    } catch {
      return null;
    }
  }

  private async _fetchServerEndpoint(endpoint: string): Promise<ServerInfo | null> {
    try {
      const { status, body } = await httpGetJson(endpoint, CONNECT_TIMEOUT_MS);
      if (status !== 200 || !body || typeof body !== 'object') return null;
      const parsed = body as {
        success?: boolean;
        data?: Partial<ServerInfo> & { app?: string; appName?: string; tenantId?: string };
      };
      if (!parsed.success || !parsed.data) return null;
      const appId = parsed.data.app ?? parsed.data.appName;
      if (appId !== 'InsuredHub') return null;
      const base = new URL(endpoint);
      return {
        app: 'InsuredHub',
        serverId: String(parsed.data.serverId || 'unknown'),
        serverName: String(parsed.data.serverName || base.hostname),
        version: String(parsed.data.version || 'unknown'),
        ip: String(parsed.data.ip || base.hostname),
        port: Number(parsed.data.port || base.port || ADMIN_CRM_PORT),
        companyName: String(parsed.data.companyName || 'local'),
        tenantId: String(parsed.data.tenantId || 'local'),
        licenseId: String(parsed.data.licenseId || 'local'),
        deploymentMode: String(parsed.data.deploymentMode || 'SELF_HOSTED'),
      };
    } catch {
      return null;
    }
  }

  private _syntheticInfo(url: string): ServerInfo {
    let host = '127.0.0.1';
    let port = ADMIN_CRM_PORT;
    try {
      const u = new URL(url);
      host = u.hostname;
      port = Number(u.port || ADMIN_CRM_PORT);
    } catch {
      /* ignore */
    }
    return {
      app: 'InsuredHub',
      serverId: 'unknown',
      serverName: host,
      version: 'unknown',
      ip: host,
      port,
      companyName: 'local',
      tenantId: 'local',
      licenseId: 'local',
      deploymentMode: 'SELF_HOSTED',
    };
  }

  private async _describeConnectFailure(url: string): Promise<string> {
    try {
      await httpGetJson(`${url}/api/health`, CONNECT_TIMEOUT_MS);
      return `Reached ${url} but it is not an InsureCRM Admin. Check the port (should be 18765).`;
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'ETIMEDOUT' || code === 'ABORT_ERR') {
        return `No response from ${url}. Firewall or different Wi‑Fi.`;
      }
      if (code === 'ECONNREFUSED') {
        return `${url} refused the connection. Is InsureCRM open on the Admin PC?`;
      }
      if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
        return `Cannot reach ${url}. Wrong network.`;
      }
      return `Could not connect to ${url}${code ? ` (${code})` : ''}.`;
    }
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
    } catch {
      /* non-fatal */
    }
  }

  private _notify(message: string, stage: string) {
    console.log(`[server-connection] ${message}`);
    try {
      if (!this._mainWindow.isDestroyed()) {
        this._mainWindow.webContents.send('server:discovery-status', { message, stage });
      }
    } catch {
      /* ignore */
    }
    this.emit('status', { message, stage });
  }
}
