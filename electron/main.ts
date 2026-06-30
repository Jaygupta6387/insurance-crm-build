import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { loadSecureStore, saveSecureStore, clearSecureStore } from './services/secure-store.service';
import { collectFingerprint } from './services/fingerprint.service';
import { activateLicense, heartbeatLicenseWithRetry, requestTransfer } from './services/license.service';
import {
  getDefaultPostgresConfig,
  installPostgres,
  resetPostgresData,
  ensurePostgresRunning,
} from './services/postgres-installer';
import { createDatabase, runMigrations, seedAdminUser, buildDatabaseUrl } from './services/db-bootstrap.service';
import { getCrmBackendPath } from './services/app-paths.service';
import { startCrmServer, stopCrmServer, getCrmAppUrl } from './services/crm-server.service';
import { initAutoUpdater, installUpdate, checkForUpdates } from './services/updater.service';

let mainWindow: BrowserWindow | null = null;

const normalizeLicenseKey = (key: string): string => key.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const reloadShellUI = (): void => {
  if (!mainWindow) return;
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

const resetLocalInstallation = async (): Promise<void> => {
  stopCrmServer();
  await resetPostgresData();
  clearSecureStore();
};

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

const ensureLicenseMetadata = async () => {
  let store = loadSecureStore();
  if (store.adminPasswordHash && store.adminName) return store;
  if (!store.licenseKey) return store;

  try {
    const fp = await collectFingerprint();
    const result = await activateLicense(store.licenseKey, fp);
    store = {
      ...store,
      licenseToken: result.license_token,
      adminPasswordHash: result.admin_password_hash,
      adminName: result.admin_name,
      adminEmail: result.admin_email,
      subdomain: result.subdomain,
      companyName: result.company_name,
      machineHash: fp.machineHash,
    };
    saveSecureStore(store);
  } catch (err) {
    console.warn('[license] metadata refresh skipped:', err instanceof Error ? err.message : err);
  }

  return loadSecureStore();
};

const ensureAdminSeeded = async (store: ReturnType<typeof loadSecureStore>) => {
  if (!store.adminEmail || !store.adminPasswordHash) return;
  try {
    const config = await ensurePostgresRunning();
    await seedAdminUser(
      config,
      store.adminEmail,
      store.adminPasswordHash,
      store.adminName || store.companyName || 'Admin',
      () => {}
    );
  } catch (err) {
    console.warn('[setup] admin seed skipped:', err instanceof Error ? err.message : err);
  }
};

const navigateMainWindowTo = async (url: string): Promise<void> => {
  if (!mainWindow) throw new Error('Application window is not ready');

  await new Promise<void>((resolve, reject) => {
    const wc = mainWindow!.webContents;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out loading CRM in the main window'));
    }, 60_000);

    const onFail = (_event: Electron.Event, code: number, description: string) => {
      cleanup();
      reject(new Error(`Could not open CRM page (${code}): ${description}`));
    };

    const onFinish = () => {
      const current = wc.getURL();
      if (!current.includes('127.0.0.1')) return;
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeout);
      wc.removeListener('did-fail-load', onFail);
      wc.removeListener('did-finish-load', onFinish);
    };

    wc.once('did-fail-load', onFail);
    wc.once('did-finish-load', onFinish);
    void wc.loadURL(url);
  });
};

const launchCrm = async (store: ReturnType<typeof loadSecureStore>): Promise<string> => {
  if (!store.setupComplete) {
    throw new Error('Setup is not complete yet');
  }

  const config = await ensurePostgresRunning((msg) => console.log('[postgres]', msg));
  const databaseUrl = buildDatabaseUrl(config);
  saveSecureStore({ ...loadSecureStore(), databaseUrl, dbPort: config.port });

  const slug = store.subdomain || 'local';
  const backendEntry = join(getCrmBackendPath(), 'src', 'server.js');
  if (!existsSync(backendEntry)) {
    throw new Error(`CRM backend missing from install: ${backendEntry}`);
  }

  stopCrmServer();

  await startCrmServer({
    DESKTOP_DATABASE_URL: databaseUrl,
    DESKTOP_LICENSE_TOKEN: store.licenseToken || '',
    DESKTOP_MACHINE_HASH: store.machineHash || '',
    DESKTOP_COMPANY_SLUG: slug,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'desktop-access-secret-min-32-chars!!',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'desktop-refresh-secret-min-32-chars!',
    MAIL_FROM_ADDRESS: 'noreply@example.com',
    SMTP_HOST: 'localhost',
    SMTP_USER: 'local',
    SMTP_PASS: 'local',
    FRONTEND_RESET_PASSWORD_URL: 'http://127.0.0.1/reset',
  });

  const url = getCrmAppUrl(slug);
  await navigateMainWindowTo(url);
  return url;
};

const bootstrapApp = async (): Promise<'activation' | 'setup' | 'crm' | 'locked'> => {
  const store = loadSecureStore();
  if (!store.licenseToken) return 'activation';
  if (!store.setupComplete) return 'setup';
  return 'crm';
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
    const incoming = normalizeLicenseKey(licenseKey);
    const store = loadSecureStore();
    const previous = store.licenseKey ? normalizeLicenseKey(store.licenseKey) : '';

    if (previous && previous !== incoming) {
      await resetLocalInstallation();
    }

    const fp = await collectFingerprint();
    const result = await activateLicense(licenseKey, fp);
    saveSecureStore({
      licenseToken: result.license_token,
      licenseKey,
      tenantId: result.tenant_id,
      companyName: result.company_name,
      adminEmail: result.admin_email,
      adminName: result.admin_name,
      adminPasswordHash: result.admin_password_hash,
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

ipcMain.handle('setup:reset-postgres', async () => {
  await resetPostgresData();
});

ipcMain.handle('setup:run', async () => {
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
      id: 'seed',
      label: 'Creating Admin User',
      run: async (onProgress) => {
        const creds = loadSecureStore();
        if (!creds.adminEmail || !creds.adminPasswordHash) {
          onProgress('Skipping admin seed — use welcome-email password after Super Admin is updated');
          return;
        }
        await seedAdminUser(
          config,
          creds.adminEmail,
          creds.adminPasswordHash,
          creds.adminName || creds.companyName || 'Admin',
          onProgress
        );
      },
    },
    {
      id: 'crm',
      label: 'Connecting CRM',
      run: async (onProgress) => {
        onProgress('Starting CRM server…');
        const dbUrl = buildDatabaseUrl(config);
        const partialStore = {
          ...loadSecureStore(),
          databaseUrl: dbUrl,
          dbUser: config.user,
          dbPassword: config.password,
          dbName: config.database,
          dbPort: config.port,
          setupComplete: false,
        };
        saveSecureStore(partialStore);
        saveSecureStore({ ...loadSecureStore(), setupComplete: true });
        await launchCrm(loadSecureStore());
        onProgress('Ready — use the welcome email password to sign in');
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

  const finalStore = loadSecureStore();
  const crmUrl = getCrmAppUrl(finalStore.subdomain || 'local');
  send({ step: steps.length, total: steps.length, label: 'Ready', progress: 100, status: 'complete' });
  return { success: true, crmUrl };
});

ipcMain.handle('crm:open', async () => {
  let store = await ensureLicenseMetadata();
  await ensureAdminSeeded(store);
  store = loadSecureStore();
  const url = await launchCrm(store);
  void heartbeatLicenseWithRetry(store.licenseToken!, store.machineHash || '').catch((err) => {
    console.warn('[license] heartbeat after open:', err.message);
  });
  return { url };
});

ipcMain.handle('license:transfer', async (_e, payload: { reason: string; new_device_name: string }) => {
  const store = loadSecureStore();
  if (!store.licenseToken) throw new Error('No license activated on this device');
  const fp = await collectFingerprint();
  try {
    return await requestTransfer(store.licenseToken, {
      reason: payload.reason,
      new_device_name: payload.new_device_name,
      new_machine_hash: fp.machineHash,
    });
  } catch (err) {
    throw err instanceof Error ? err : new Error('Transfer request failed');
  }
});

ipcMain.handle('license:heartbeat', async () => {
  const store = loadSecureStore();
  if (!store.licenseToken) throw new Error('No license activated');
  return heartbeatLicenseWithRetry(store.licenseToken, store.machineHash || '');
});

ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url));

ipcMain.handle('store:clear', () => {
  clearSecureStore();
  stopCrmServer();
});

ipcMain.handle('store:reset-for-new-license', async () => {
  await resetLocalInstallation();
  reloadShellUI();
  mainWindow?.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('app:state', 'activation');
  });
  return { success: true };
});
