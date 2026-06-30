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
  clearStore: () => Promise<void>;
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
  clearStore: () => ipcRenderer.invoke('store:clear'),
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
