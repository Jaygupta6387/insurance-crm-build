import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'path';
import {
  loadSecureStore,
  saveSecureStore,
  clearSecureStore,
  saveLoginCredentials,
  getLoginCredentials,
  clearLoginCredentials,
  getDbCredentialsFromStore,
} from './services/secure-store.service';
import { collectFingerprint } from './services/fingerprint.service';
import { activateLicense, heartbeatLicenseWithRetry, requestTransfer } from './services/license.service';
import {
  getDefaultPostgresConfig,
  installPostgres,
  resetPostgresData,
  ensurePostgresRunning,
} from './services/postgres-installer';
import { createDatabase, buildDatabaseUrl } from './services/db-bootstrap.service';
import { startCrmServer, stopCrmServer, getCrmAppUrl } from './services/crm-server.service';
import { initAutoUpdater, installUpdate, checkForUpdates } from './services/updater.service';

// ── Phase 3: Enterprise On-Premise Services ───────────────────────────────────
import { SystemTrayService } from './services/system-tray.service';
import { WindowsServiceManager } from './services/windows-service-manager.service';

let mainWindow: BrowserWindow | null = null;
let trayService: SystemTrayService | null = null;
let windowsServiceManager: WindowsServiceManager | null = null;
let setupRunInFlight: Promise<{ success: boolean; crmUrl: string }> | null = null;
let lastPasswordVerifiedAt = 0;
const PASSWORD_VERIFY_TTL_MS = 5 * 60 * 1000;

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
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  await resetPostgresData();
  clearSecureStore();
};

const returnToActivationScreen = async (): Promise<void> => {
  await resetLocalInstallation();
  if (!mainWindow) return;

  await new Promise<void>((resolve, reject) => {
    const wc = mainWindow!.webContents;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out returning to license activation'));
    }, 30_000);

    const onFinish = () => {
      const current = wc.getURL();
      if (current.includes('127.0.0.1')) return;
      cleanup();
      wc.send('app:state', 'activation');
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeout);
      wc.removeListener('did-finish-load', onFinish);
    };

    wc.on('did-finish-load', onFinish);
    reloadShellUI();
  });
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

const cacheSubscriptionFromLicense = (
  store: ReturnType<typeof loadSecureStore>,
  data: {
    plan?: string;
    plan_type?: string;
    user_limit?: number;
    subscription_end?: string;
    features?: Record<string, string>;
    enabled_features?: string[];
  }
) => {
  const plan = data.plan || data.plan_type;
  const hasFeatures = data.features || data.enabled_features;
  if (!plan && !data.subscription_end && data.user_limit == null && !hasFeatures) return store;
  return {
    ...store,
    planType: plan || store.planType,
    subscriptionEnd: data.subscription_end || store.subscriptionEnd,
    maxEmployees: data.user_limit ?? store.maxEmployees,
    ...(data.enabled_features ? { enabledFeatures: data.enabled_features } : {}),
    ...(data.features ? { featureMap: data.features } : {}),
  };
};

const ensureLicenseMetadata = async () => {
  let store = loadSecureStore();
  if (!store.licenseKey) return store;

  try {
    const fp = await collectFingerprint();
    const result = await activateLicense(store.licenseKey, fp);
    store = cacheSubscriptionFromLicense(
      {
        ...store,
        licenseToken: result.license_token,
        licenseKey: store.licenseKey,
        tenantId: result.tenant_id,
        companyName: result.company_name,
        adminEmail: result.admin_email,
        adminName: result.admin_name,
        adminPasswordHash: result.admin_password_hash,
        subdomain: result.subdomain,
        machineHash: fp.machineHash,
        enabledFeatures: result.enabled_features || store.enabledFeatures || [],
        featureMap: result.features || store.featureMap || {},
      },
      result
    );
    saveSecureStore(store);
  } catch (err) {
    console.warn('[license] metadata refresh skipped:', err instanceof Error ? err.message : err);
  }

  return loadSecureStore();
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

/**
 * Start the CRM backend, wait for it to be ready, then navigate to the CRM.
 * All database migration, seeding, and module provisioning is performed by the
 * backend server itself (desktop-bootstrap.service.js in New-CRM 2) — not here.
 */
const launchCrm = async (store: ReturnType<typeof loadSecureStore>): Promise<string> => {
  if (!store.setupComplete) {
    throw new Error('Setup is not complete yet');
  }

  const refreshed = await ensureLicenseMetadata();
  const config = await ensurePostgresRunning((msg) => console.log('[postgres]', msg));
  const databaseUrl = buildDatabaseUrl(config);
  saveSecureStore({ ...loadSecureStore(), databaseUrl, dbPort: config.port });

  const slug = refreshed.subdomain || store.subdomain || 'local';

  stopCrmServer();

  await startCrmServer({
    DESKTOP_DATABASE_URL: databaseUrl,
    DESKTOP_LICENSE_TOKEN: refreshed.licenseToken || store.licenseToken || '',
    DESKTOP_MACHINE_HASH: refreshed.machineHash || store.machineHash || '',
    DESKTOP_COMPANY_SLUG: slug,
    DESKTOP_COMPANY_NAME: refreshed.companyName || store.companyName || '',
    DESKTOP_ADMIN_EMAIL: refreshed.adminEmail || store.adminEmail || '',
    DESKTOP_ADMIN_NAME: refreshed.adminName || store.adminName || '',
    DESKTOP_ADMIN_PASSWORD_HASH: refreshed.adminPasswordHash || store.adminPasswordHash || '',
    DESKTOP_ENABLED_FEATURES: (refreshed.enabledFeatures || store.enabledFeatures || []).join(','),
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'desktop-access-secret-min-32-chars!!',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'desktop-refresh-secret-min-32-chars!',
    MAIL_FROM_ADDRESS: 'noreply@example.com',
    SMTP_HOST: 'localhost',
    SMTP_USER: 'local',
    SMTP_PASS: 'local',
  });

  const url = getCrmAppUrl(slug);
  await navigateMainWindowTo(url);
  return url;
};

const resolveBootstrapState = async (): Promise<'activation' | 'setup' | 'crm' | 'locked'> => {
  const store = loadSecureStore();
  const hasActivationData = Boolean(
    store.licenseKey &&
      store.licenseToken &&
      store.adminEmail &&
      store.adminPasswordHash &&
      store.subdomain
  );

  if (!hasActivationData) {
    return 'activation';
  }

  try {
    const fp = await collectFingerprint();
    const machineHash = store.machineHash || fp.machineHash;
    if (!store.machineHash) {
      saveSecureStore({ ...store, machineHash });
    }
    await heartbeatLicenseWithRetry(store.licenseToken!, machineHash, 2);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const licenseRejected = /invalid|revoked|expired|unauthorized|forbidden|not found|403|401/i.test(message);
    if (licenseRejected) {
      console.warn('[license] stored license rejected — returning to activation:', message);
      await resetLocalInstallation();
      return 'activation';
    }
    console.warn('[license] heartbeat skipped (offline or cloud unreachable):', message);
  }

  if (!store.setupComplete) return 'setup';
  return 'crm';
};

app.whenReady().then(() => {
  mainWindow = createWindow();
  initAutoUpdater(mainWindow);

  // ── Phase 3: System Tray — hide-to-tray instead of close ─────────────────
  trayService = new SystemTrayService(mainWindow);
  trayService.init();

  // Wire up optional tray actions
  trayService.setCallbacks({
    onRestartBackend: async () => {
      stopCrmServer();
      await new Promise((r) => setTimeout(r, 1500));
      const store = loadSecureStore();
      if (store.setupComplete) await launchCrm(store).catch(console.error);
    },
    onViewLogs: () => {
      const { shell: electronShell } = require('electron');
      const { join: pathJoin } = require('path');
      const logsDir = pathJoin(app.getPath('userData'), 'logs');
      electronShell.openPath(logsDir).catch(() => {});
    },
  });

  // Intercept window close — hide to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (trayService) {
      trayService.handleWindowClose(e);
    }
  });

  // ── Phase 3: Windows Service Manager ─────────────────────────────────────
  windowsServiceManager = new WindowsServiceManager();

  mainWindow.webContents.once('did-finish-load', () => {
    void resolveBootstrapState()
      .then((state) => mainWindow?.webContents.send('app:state', state))
      .catch(() => mainWindow?.webContents.send('app:state', 'activation'));
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  // In server mode (non-desktop/offline) the backend is a Windows Service —
  // never stop the backend when Electron quits.
  // In desktop (single-machine) mode we do stop the embedded CRM server.
  if (process.env.CRM_MODE !== 'server') {
    stopCrmServer();
  }
  trayService?.destroy();
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
    hasLicense: Boolean(
      s.licenseKey && s.licenseToken && s.adminEmail && s.adminPasswordHash && s.subdomain
    ),
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
      planType: result.plan,
      subscriptionEnd: result.subscription_end,
      maxEmployees: result.user_limit,
      enabledFeatures: result.enabled_features || [],
      featureMap: result.features || {},
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
  if (setupRunInFlight) return setupRunInFlight;

  setupRunInFlight = (async () => {
    const activation = loadSecureStore();
    if (!activation.licenseKey || !activation.licenseToken) {
      throw new Error('License not activated. Close the app, reopen it, and enter your license key first.');
    }
    if (!activation.adminEmail || !activation.adminPasswordHash) {
      throw new Error('License activation is incomplete. Enter your license key again to continue setup.');
    }

    const config = getDefaultPostgresConfig();

    // Setup steps — schema, seeding and module provisioning are handled by
    // the backend (desktop-bootstrap.service.js) when it starts in step 3.
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
        id: 'crm',
        label: 'Starting CRM & Setting Up',
        run: async (onProgress) => {
          onProgress('Starting CRM server — this may take a moment…');
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
          // Pass all credentials — backend bootstrap creates schema, admin & modules.
          await startCrmServer({
            DESKTOP_DATABASE_URL: dbUrl,
            DESKTOP_LICENSE_TOKEN: activation.licenseToken || '',
            DESKTOP_MACHINE_HASH: activation.machineHash || '',
            DESKTOP_COMPANY_SLUG: activation.subdomain || 'local',
            DESKTOP_COMPANY_NAME: activation.companyName || '',
            DESKTOP_ADMIN_EMAIL: activation.adminEmail || '',
            DESKTOP_ADMIN_NAME: activation.adminName || '',
            DESKTOP_ADMIN_PASSWORD_HASH: activation.adminPasswordHash || '',
            DESKTOP_ENABLED_FEATURES: (activation.enabledFeatures || []).join(','),
            JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'desktop-access-secret-min-32-chars!!',
            JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'desktop-refresh-secret-min-32-chars!',
            MAIL_FROM_ADDRESS: 'noreply@example.com',
            SMTP_HOST: 'localhost',
            SMTP_USER: 'local',
            SMTP_PASS: 'local',
          });
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
  })();

  try {
    return await setupRunInFlight;
  } finally {
    setupRunInFlight = null;
  }
});

ipcMain.handle('crm:open', async () => {
  const store = await ensureLicenseMetadata();
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
  const data = await heartbeatLicenseWithRetry(store.licenseToken, store.machineHash || '');
  const updated = cacheSubscriptionFromLicense(store, data as { plan?: string; plan_type?: string; user_limit?: number; subscription_end?: string });
  saveSecureStore(updated);
  return data;
});

ipcMain.handle('auth:save-login', (_e, email: string, password: string, expiresAt: number) => {
  saveLoginCredentials(email, password, expiresAt);
});

ipcMain.handle('auth:get-saved-login', () => getLoginCredentials());

ipcMain.handle('auth:clear-saved-login', () => {
  clearLoginCredentials();
});

ipcMain.handle('settings:mark-password-verified', () => {
  lastPasswordVerifiedAt = Date.now();
});

ipcMain.handle('settings:reveal-db-credentials', () => {
  if (!lastPasswordVerifiedAt || Date.now() - lastPasswordVerifiedAt > PASSWORD_VERIFY_TTL_MS) {
    throw new Error('Password verification required — verify again in Settings');
  }
  return getDbCredentialsFromStore();
});

ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url));

// ── Phase 3: Windows Service IPC handlers ────────────────────────────────────

ipcMain.handle('service:status', async () => {
  return windowsServiceManager?.getStatus() ?? 'NOT_INSTALLED';
});

ipcMain.handle('service:install', async () => {
  if (!windowsServiceManager) return { success: false, message: 'Service manager not initialised' };
  return windowsServiceManager.install();
});

ipcMain.handle('service:uninstall', async () => {
  if (!windowsServiceManager) return { success: false, message: 'Service manager not initialised' };
  return windowsServiceManager.uninstall();
});

ipcMain.handle('service:start', async () => {
  if (!windowsServiceManager) return { success: false, message: 'Service manager not initialised' };
  return windowsServiceManager.start();
});

ipcMain.handle('service:stop', async () => {
  if (!windowsServiceManager) return { success: false, message: 'Service manager not initialised' };
  return windowsServiceManager.stop();
});

ipcMain.handle('service:restart', async () => {
  if (!windowsServiceManager) return { success: false, message: 'Service manager not initialised' };
  return windowsServiceManager.restart();
});

// ── Phase 3: Server discovery IPC handlers ────────────────────────────────────

ipcMain.handle('discovery:start', async (_e, timeoutMs?: number) => {
  const { UDPDiscoveryClientService } = await import('./services/udp-discovery-client.service');
  const store  = loadSecureStore();
  const secret = store.licenseToken?.slice(0, 32) || '';
  const client = new UDPDiscoveryClientService(secret);
  try {
    const result = await client.discover(timeoutMs ?? 15_000);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('tray:update-info', (_e, info: Record<string, unknown>) => {
  trayService?.updateServerInfo(info as Parameters<SystemTrayService['updateServerInfo']>[0]);
});

ipcMain.handle('dialog:select-document-root', async () => {
  if (!mainWindow) throw new Error('Application window is not ready');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose InsureCRM Document Storage Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  return {
    canceled: result.canceled,
    path: result.filePaths[0],
  };
});

ipcMain.handle('store:clear', () => {
  clearSecureStore();
  stopCrmServer();
});

ipcMain.handle('store:reset-for-new-license', async () => {
  try {
    await returnToActivationScreen();
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const closeHint =
      process.platform === 'win32'
        ? 'open Task Manager, end all postgres.exe'
        : 'open Activity Monitor, end any postgres process';
    throw new Error(
      `${message}\n\nIf this keeps failing: close InsureCRM Desktop, ${closeHint}, then reopen the app and try again.`
    );
  }
});
