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
};

contextBridge.exposeInMainWorld('desktop', api);

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}
