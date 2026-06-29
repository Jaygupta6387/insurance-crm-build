import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';
import { loadSecureStore, saveSecureStore, clearSecureStore } from './services/secure-store.service';
import { collectFingerprint } from './services/fingerprint.service';
import { activateLicense, heartbeatLicense, requestTransfer } from './services/license.service';
import {
  getDefaultPostgresConfig,
  installPostgres,
  resetPostgresData,
} from './services/postgres-installer';
import { createDatabase, runMigrations, buildDatabaseUrl } from './services/db-bootstrap.service';
import { startCrmServer, stopCrmServer, getCrmUrl } from './services/crm-server.service';
import { initAutoUpdater, installUpdate, checkForUpdates } from './services/updater.service';

let mainWindow: BrowserWindow | null = null;

const createWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'InsureCRM Desktop',
  });

  win.once('ready-to-show', () => win.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
};

const bootstrapApp = async (): Promise<'activation' | 'setup' | 'crm' | 'locked'> => {
  const store = loadSecureStore();
  if (!store.licenseToken) return 'activation';
  if (!store.setupComplete) return 'setup';

  try {
    await heartbeatLicense(store.licenseToken, store.machineHash || '');
    await launchCrm(store);
    return 'crm';
  } catch {
    return 'locked';
  }
};

const launchCrm = async (store: ReturnType<typeof loadSecureStore>) => {
  const port = await startCrmServer({
    DESKTOP_DATABASE_URL: store.databaseUrl || '',
    DESKTOP_LICENSE_TOKEN: store.licenseToken || '',
    DESKTOP_MACHINE_HASH: store.machineHash || '',
    DESKTOP_COMPANY_SLUG: store.subdomain || 'local',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'desktop-access-secret-min-32-chars!!',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'desktop-refresh-secret-min-32-chars!',
    MAIL_FROM_ADDRESS: 'noreply@insurecrm.local',
    SMTP_HOST: 'localhost',
    SMTP_USER: 'local',
    SMTP_PASS: 'local',
    FRONTEND_RESET_PASSWORD_URL: 'http://localhost/reset',
  });

  if (mainWindow) {
    mainWindow.loadURL(getCrmUrl());
  }
};

app.whenReady().then(() => {
  mainWindow = createWindow();
  initAutoUpdater(mainWindow);

  // Never block the main process before the window is interactive.
  mainWindow.webContents.once('did-finish-load', () => {
    void bootstrapApp()
      .then((state) => mainWindow?.webContents.send('app:state', state))
      .catch(() => mainWindow?.webContents.send('app:state', 'activation'));
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  stopCrmServer();
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC handlers ───────────────────────────────────────────────────────────

ipcMain.handle('updater:install', () => {
  installUpdate();
});

ipcMain.handle('updater:check', () => {
  checkForUpdates();
});

ipcMain.handle('store:get', () => {
  const s = loadSecureStore();
  return {
    hasLicense: !!s.licenseToken,
    setupComplete: !!s.setupComplete,
    companyName: s.companyName,
    adminEmail: s.adminEmail,
  };
});

ipcMain.handle('license:activate', async (_e, licenseKey: string) => {
  try {
    const fp = await collectFingerprint();
    const result = await activateLicense(licenseKey, fp);
    saveSecureStore({
      licenseToken: result.license_token,
      licenseKey,
      tenantId: result.tenant_id,
      companyName: result.company_name,
      adminEmail: result.admin_email,
      subdomain: result.subdomain,
      machineHash: fp.machineHash,
      setupComplete: false,
    });
    return result;
  } catch (err: unknown) {
    const ax = err as { response?: { data?: { message?: string } }; message?: string };
    throw new Error(ax.response?.data?.message || ax.message || 'Activation failed');
  }
});

ipcMain.handle('setup:reset-postgres', () => {
  resetPostgresData();
});

ipcMain.handle('setup:run', async () => {
  const store = loadSecureStore();
  const config = getDefaultPostgresConfig();
  const steps: Array<{ id: string; label: string; run: (onProgress: (m: string) => void) => Promise<void> }> = [
    {
      id: 'postgres',
      label: 'Installing PostgreSQL',
      run: async (onProgress) => installPostgres(config, onProgress),
    },
    {
      id: 'database',
      label: 'Creating Database',
      run: async (onProgress) => createDatabase(config, onProgress),
    },
    {
      id: 'migrations',
      label: 'Creating Tables',
      run: async (onProgress) => runMigrations(config, onProgress),
    },
    {
      id: 'crm',
      label: 'Connecting CRM',
      run: async (onProgress) => {
        onProgress('Starting CRM server…');
        const dbUrl = buildDatabaseUrl(config);
        saveSecureStore({
          ...loadSecureStore(),
          databaseUrl: dbUrl,
          dbUser: config.user,
          dbPassword: config.password,
          dbName: config.database,
          dbPort: config.port,
          setupComplete: true,
        });
        await launchCrm(loadSecureStore());
        onProgress('Ready');
      },
    },
  ];

  const send = (payload: object) => mainWindow?.webContents.send('setup:progress', payload);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    send({ step: i + 1, total: steps.length, label: step.label, progress: Math.round((i / steps.length) * 100), status: 'running' });
    await step.run((msg) => send({ step: i + 1, total: steps.length, label: step.label, message: msg, progress: Math.round(((i + 0.5) / steps.length) * 100), status: 'running' }));
    send({ step: i + 1, total: steps.length, label: step.label, progress: Math.round(((i + 1) / steps.length) * 100), status: 'done' });
  }

  send({ step: steps.length, total: steps.length, label: 'Ready', progress: 100, status: 'complete' });
  return { success: true, crmUrl: getCrmUrl() };
});

ipcMain.handle('license:transfer', async (_e, payload: { reason: string; new_device_name: string }) => {
  const store = loadSecureStore();
  const fp = await collectFingerprint();
  return requestTransfer(store.licenseToken!, {
    ...payload,
    new_machine_hash: fp.machineHash,
  });
});

ipcMain.handle('license:heartbeat', async () => {
  const store = loadSecureStore();
  return heartbeatLicense(store.licenseToken!, store.machineHash || '');
});

ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url));

ipcMain.handle('store:clear', () => {
  clearSecureStore();
  stopCrmServer();
});
