import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopApi {
  getStore: () => Promise<{ hasLicense: boolean; setupComplete: boolean; companyName?: string; adminEmail?: string }>;
  activateLicense: (licenseKey: string) => Promise<unknown>;
  runSetup: () => Promise<{ success: boolean; crmUrl: string }>;
  openCrm: () => Promise<{ url: string }>;
  resetPostgresData: () => Promise<void>;
  requestTransfer: (payload: { reason: string; new_device_name: string }) => Promise<unknown>;
  heartbeat: () => Promise<unknown>;
  openExternal: (url: string) => Promise<void>;
  selectDocumentRoot: () => Promise<{ canceled: boolean; path?: string }>;
  clearStore: () => Promise<void>;
  resetForNewLicense: () => Promise<{ success: boolean }>;
  saveLogin: (email: string, password: string, expiresAt: number) => Promise<void>;
  getSavedLogin: () => Promise<{ email: string; password: string; expiresAt: number } | null>;
  clearSavedLogin: () => Promise<void>;
  markPasswordVerified: () => Promise<void>;
  revealDbCredentials: () => Promise<{
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  }>;
  onAppState: (cb: (state: string) => void) => () => void;
  onSetupProgress: (cb: (data: Record<string, unknown>) => void) => () => void;
  onUpdateStatus: (cb: (data: { status: string; version?: string; percent?: number; message?: string }) => void) => () => void;
  installUpdate: () => Promise<void>;
  checkForUpdates: () => Promise<void>;

  // ── Phase 3: Windows Service ────────────────────────────────────────────────
  getServiceStatus: () => Promise<string>;
  installService: () => Promise<{ success: boolean; message: string }>;
  uninstallService: () => Promise<{ success: boolean; message: string }>;
  startService: () => Promise<{ success: boolean; message: string }>;
  stopService: () => Promise<{ success: boolean; message: string }>;
  restartService: () => Promise<{ success: boolean; message: string }>;

  // ── Phase 3: Server Discovery ───────────────────────────────────────────────
  discoverServer: (timeoutMs?: number) => Promise<{
    success: boolean;
    data?: { ip: string; port: number; serverId: string; serverName: string; version: string };
    message?: string;
  }>;

  // ── Phase 3: Tray ───────────────────────────────────────────────────────────
  updateTrayInfo: (info: Record<string, unknown>) => Promise<void>;

  // ── Phase 3: Socket events from server ─────────────────────────────────────
  onSocketConnected: (cb: (data: { serverUrl: string }) => void) => () => void;
  onSocketDisconnected: (cb: (data: { reason: string }) => void) => () => void;
}

const api: DesktopApi = {
  getStore: () => ipcRenderer.invoke('store:get'),
  activateLicense: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
  runSetup: () => ipcRenderer.invoke('setup:run'),
  openCrm: () => ipcRenderer.invoke('crm:open'),
  resetPostgresData: () => ipcRenderer.invoke('setup:reset-postgres'),
  requestTransfer: (payload) => ipcRenderer.invoke('license:transfer', payload),
  heartbeat: () => ipcRenderer.invoke('license:heartbeat'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  selectDocumentRoot: () => ipcRenderer.invoke('dialog:select-document-root'),
  clearStore: () => ipcRenderer.invoke('store:clear'),
  resetForNewLicense: () => ipcRenderer.invoke('store:reset-for-new-license'),
  saveLogin: (email, password, expiresAt) => ipcRenderer.invoke('auth:save-login', email, password, expiresAt),
  getSavedLogin: () => ipcRenderer.invoke('auth:get-saved-login'),
  clearSavedLogin: () => ipcRenderer.invoke('auth:clear-saved-login'),
  markPasswordVerified: () => ipcRenderer.invoke('settings:mark-password-verified'),
  revealDbCredentials: () => ipcRenderer.invoke('settings:reveal-db-credentials'),
  onAppState: (cb) => {
    const handler = (_: unknown, state: string) => cb(state);
    ipcRenderer.on('app:state', handler);
    return () => ipcRenderer.removeListener('app:state', handler);
  },
  onSetupProgress: (cb) => {
    const handler = (_: unknown, data: Record<string, unknown>) => cb(data);
    ipcRenderer.on('setup:progress', handler);
    return () => ipcRenderer.removeListener('setup:progress', handler);
  },
  onUpdateStatus: (cb) => {
    const handler = (_: unknown, data: { status: string; version?: string; percent?: number; message?: string }) => cb(data);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),

  // ── Phase 3: Windows Service ────────────────────────────────────────────────
  getServiceStatus:  () => ipcRenderer.invoke('service:status'),
  installService:    () => ipcRenderer.invoke('service:install'),
  uninstallService:  () => ipcRenderer.invoke('service:uninstall'),
  startService:      () => ipcRenderer.invoke('service:start'),
  stopService:       () => ipcRenderer.invoke('service:stop'),
  restartService:    () => ipcRenderer.invoke('service:restart'),

  // ── Phase 3: Server Discovery ───────────────────────────────────────────────
  discoverServer: (timeoutMs) => ipcRenderer.invoke('discovery:start', timeoutMs),

  // ── Phase 3: Tray ───────────────────────────────────────────────────────────
  updateTrayInfo: (info) => ipcRenderer.invoke('tray:update-info', info),

  // ── Phase 3: Socket events ──────────────────────────────────────────────────
  onSocketConnected: (cb) => {
    const handler = (_: unknown, data: { serverUrl: string }) => cb(data);
    ipcRenderer.on('socket:connected', handler);
    return () => ipcRenderer.removeListener('socket:connected', handler);
  },
  onSocketDisconnected: (cb) => {
    const handler = (_: unknown, data: { reason: string }) => cb(data);
    ipcRenderer.on('socket:disconnected', handler);
    return () => ipcRenderer.removeListener('socket:disconnected', handler);
  },

  // ── Phase 5: Installation Mode ──────────────────────────────────────────────
  getInstallMode: () => ipcRenderer.invoke('install-mode:get'),
  setInstallMode: (mode: string) => ipcRenderer.invoke('install-mode:set', mode),

  // ── Phase 5: Server connection status ──────────────────────────────────────
  onServerDiscoveryStatus: (cb) => {
    const handler = (_: unknown, data: { message: string; stage: string }) => cb(data);
    ipcRenderer.on('server:discovery-status', handler);
    return () => ipcRenderer.removeListener('server:discovery-status', handler);
  },
  onInstallMode: (cb) => {
    const handler = (_: unknown, info: Record<string, unknown>) => cb(info);
    ipcRenderer.on('app:install-mode', handler);
    return () => ipcRenderer.removeListener('app:install-mode', handler);
  },

  // Phase 5: Manual server address response (used in CLIENT discovery flow)
  respondManualAddress: (address: string) => ipcRenderer.send('server:manual-address-response', address),

  // Phase 5: Error channel
  onAppError: (cb) => {
    const handler = (_: unknown, data: { message: string }) => cb(data);
    ipcRenderer.on('app:error', handler);
    return () => ipcRenderer.removeListener('app:error', handler);
  },
};

contextBridge.exposeInMainWorld('desktop', api);

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}
