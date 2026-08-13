import { app, BrowserWindow, dialog, ipcMain, shell, powerMonitor } from 'electron';
import { join } from 'path';
import {
  loadSecureStore,
  saveSecureStore,
  clearSecureStore,
  saveLoginCredentials,
  getLoginCredentials,
  clearLoginCredentials,
  getDbCredentialsFromStore,
  ensureDesktopJwtSecrets,
} from './services/secure-store.service';
import { collectFingerprint } from './services/fingerprint.service';
import { activateLicense, heartbeatLicenseWithRetry, requestTransfer, lookupDeviceByHash } from './services/license.service';
import {
  getDefaultPostgresConfig,
  resetPostgresData,
  ensurePostgresRunning,
  stopEmbeddedPostgres,
} from './services/postgres-installer';
import { createDatabase, buildDatabaseUrl } from './services/db-bootstrap.service';
import { startCrmServer, stopCrmServer, getCrmAppUrl, getCrmPort } from './services/crm-server.service';
import { initAutoUpdater, installUpdate, checkForUpdates } from './services/updater.service';

// ── Phase 3/5: Enterprise On-Premise Services ─────────────────────────────────
import { SystemTrayService } from './services/system-tray.service';
import { WindowsServiceManager } from './services/windows-service-manager.service';
import { getInstallationMode } from './services/installation-mode.service';
import { ServerConnectionService } from './services/server-connection.service';

let mainWindow: BrowserWindow | null = null;
let trayService: SystemTrayService | null = null;
let windowsServiceManager: WindowsServiceManager | null = null;
let serverConnectionService: ServerConnectionService | null = null;
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

  // Open http(s) links from CRM (e.g. Gmail App Password help) in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

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
    subscription_end?: string | null;
    features?: Record<string, string>;
    enabled_features?: string[];
  }
) => {
  const plan = data.plan || data.plan_type;
  const hasFeatures = data.features || data.enabled_features;
  const hasSubscriptionEnd = Object.prototype.hasOwnProperty.call(data, 'subscription_end');
  if (!plan && !hasSubscriptionEnd && data.user_limit == null && !hasFeatures) return store;
  return {
    ...store,
    planType: plan || store.planType,
    // Always prefer cloud value when present (including null after clearing expiry).
    ...(hasSubscriptionEnd
      ? { subscriptionEnd: data.subscription_end || undefined }
      : {}),
    maxEmployees: data.user_limit ?? store.maxEmployees,
    ...(data.enabled_features ? { enabledFeatures: data.enabled_features } : {}),
    ...(data.features ? { featureMap: data.features } : {}),
  };
};

const isSubscriptionExpired = (subscriptionEnd?: string | null): boolean => {
  if (!subscriptionEnd) return false;
  const end = new Date(subscriptionEnd);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() < Date.now();
};

const isLicenseRejectionError = (err: unknown): boolean => {
  const statusCode =
    err && typeof err === 'object' && 'statusCode' in err
      ? Number((err as { statusCode?: number }).statusCode)
      : undefined;
  if (statusCode === 401 || statusCode === 403) return true;

  const message = err instanceof Error ? err.message : String(err);
  const networkish = /timeout|ECONN|ENOTFOUND|ENETUNREACH|network|cannot reach|aborted/i.test(
    message
  );
  if (networkish) return false;

  return /\b(invalid|revoked|expired|suspended|blocked|inactive|deactivated)\b|unauthorized|forbidden/i.test(
    message
  );
};

const lockAppForLicense = (reason: string): void => {
  console.warn('[license] locking app:', reason);
  stopCrmServer();
  mainWindow?.webContents.send('app:state', 'locked');
  // Reload shell UI so LockScreen is visible even if CRM URL was loaded in the window.
  if (mainWindow && !mainWindow.webContents.getURL().includes('index.html') && !process.env.ELECTRON_RENDERER_URL) {
    reloadShellUI();
  } else if (mainWindow?.webContents.getURL().includes('localhost') || mainWindow?.webContents.getURL().includes('127.0.0.1')) {
    reloadShellUI();
  }
};

/**
 * Ask Super Admin for current entitlement and refresh the local subscription cache.
 * Must run BEFORE locking on a stale local subscriptionEnd (renewals would never unlock otherwise).
 */
const refreshEntitlementFromCloud = async (): Promise<{
  store: ReturnType<typeof loadSecureStore>;
  cloudOk: boolean;
  rejection?: Error;
}> => {
  let store = loadSecureStore();
  const licenseToken = store.licenseToken;
  if (!licenseToken) {
    return { store, cloudOk: false };
  }

  try {
    const fp = await collectFingerprint();
    const machineHash = store.machineHash || fp.machineHash;
    if (!store.machineHash) {
      saveSecureStore({ ...store, machineHash });
      store = loadSecureStore();
    }

    const hb = await heartbeatLicenseWithRetry(licenseToken, machineHash, 2);
    const refreshed = cacheSubscriptionFromLicense(
      loadSecureStore(),
      hb as {
        plan?: string;
        plan_type?: string;
        user_limit?: number;
        subscription_end?: string | null;
        features?: Record<string, string>;
        enabled_features?: string[];
      }
    );
    saveSecureStore(refreshed);
    return { store: loadSecureStore(), cloudOk: true };
  } catch (err) {
    const rejection = err instanceof Error ? err : new Error(String(err));
    if (isLicenseRejectionError(err)) {
      return { store: loadSecureStore(), cloudOk: false, rejection };
    }
    console.warn('[license] entitlement refresh soft-fail:', rejection.message);
    return { store: loadSecureStore(), cloudOk: false };
  }
};

let licenseWatchTimer: ReturnType<typeof setInterval> | null = null;

const runLicenseWatchTick = async (): Promise<void> => {
  const store = loadSecureStore();
  if (!store.licenseToken || !store.setupComplete) return;

  const { store: refreshed, cloudOk, rejection } = await refreshEntitlementFromCloud();

  if (rejection) {
    lockAppForLicense(rejection.message);
    return;
  }

  if (isSubscriptionExpired(refreshed.subscriptionEnd)) {
    lockAppForLicense('subscription expired');
    return;
  }

  // Offline: still enforce last-known local end date.
  if (!cloudOk && isSubscriptionExpired(store.subscriptionEnd)) {
    lockAppForLicense('local subscription_end passed (offline)');
  }
};

const startLicenseWatch = (): void => {
  if (licenseWatchTimer) return;
  // Option B — default every 15 minutes (override with LICENSE_WATCH_INTERVAL_MS).
  const intervalMs = parseInt(process.env.LICENSE_WATCH_INTERVAL_MS || String(15 * 60 * 1000), 10);
  // Run once soon after start so expiry is caught without waiting a full interval.
  void runLicenseWatchTick();
  licenseWatchTimer = setInterval(() => {
    void runLicenseWatchTick();
  }, intervalMs);
  console.log(`[license] watch started (every ${Math.round(intervalMs / 60000)} min)`);
};

/** Re-check when the PC wakes or the window is focused (still Option B). */
const attachLicenseWatchLifecycle = (): void => {
  let lastFocusCheckAt = 0;
  const FOCUS_THROTTLE_MS = 60_000;

  try {
    powerMonitor.on('resume', () => {
      console.log('[license] power resume — rechecking entitlement');
      void runLicenseWatchTick();
    });
  } catch {
    /* powerMonitor unavailable in some environments */
  }

  app.on('browser-window-focus', () => {
    const now = Date.now();
    if (now - lastFocusCheckAt < FOCUS_THROTTLE_MS) return;
    lastFocusCheckAt = now;
    void runLicenseWatchTick();
  });
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
    if (isLicenseRejectionError(err)) {
      lockAppForLicense(err instanceof Error ? err.message : String(err));
      throw err instanceof Error ? err : new Error(String(err));
    }
    console.warn('[license] metadata refresh skipped:', err instanceof Error ? err.message : err);
  }

  return loadSecureStore();
};

const navigateMainWindowTo = async (url: string): Promise<void> => {
  if (!mainWindow) throw new Error('Application window is not ready');

  // webContents.loadURL already rejects on did-fail-load. Do not require
  // 127.0.0.1 here: Employee PCs intentionally load the Admin's LAN address.
  await Promise.race([
    mainWindow.loadURL(url),
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Timed out loading CRM page: ${url}`)), 60_000);
    }),
  ]);
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

  const jwt = ensureDesktopJwtSecrets();

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
    // Cached subscription for fast /api/settings/account (no long cloud wait).
    DESKTOP_PLAN_TYPE: refreshed.planType || store.planType || '',
    DESKTOP_SUBSCRIPTION_END: refreshed.subscriptionEnd || store.subscriptionEnd || '',
    DESKTOP_MAX_EMPLOYEES:
      refreshed.maxEmployees != null
        ? String(refreshed.maxEmployees)
        : store.maxEmployees != null
          ? String(store.maxEmployees)
          : '',
    JWT_ACCESS_SECRET: jwt.accessSecret,
    JWT_REFRESH_SECRET: jwt.refreshSecret,
    MAIL_FROM_ADDRESS: 'noreply@example.com',
    SMTP_HOST: 'localhost',
    SMTP_USER: 'local',
    SMTP_PASS: 'local',
  });

  const url = getCrmAppUrl(slug);
  await navigateMainWindowTo(url);

  // Show Admin share address in tray so employees know what to type.
  if (getInstallationMode().isServer()) {
    try {
      const os = await import('os');
      let lanIp = '127.0.0.1';
      for (const iface of Object.values(os.networkInterfaces())) {
        for (const addr of iface || []) {
          if (addr.family === 'IPv4' && !addr.internal) {
            lanIp = addr.address;
            break;
          }
        }
        if (lanIp !== '127.0.0.1') break;
      }
      const port = getCrmPort();
      trayService?.updateServerInfo({
        status: 'Running (Admin / Wi‑Fi)',
        ip: `${lanIp}:${port}`,
      });
      console.log(`[main] Admin share address: ${lanIp}:${port}`);
    } catch { /* non-fatal */ }
  }

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

  // Always refresh from Super Admin first. Checking a stale local subscriptionEnd
  // before heartbeat was locking renewed licenses until a manual hardware reset.
  const { store: refreshed, cloudOk, rejection } = await refreshEntitlementFromCloud();

  if (rejection) {
    console.warn('[license] stored license rejected — locking app (data kept):', rejection.message);
    stopCrmServer();
    return 'locked';
  }

  if (isSubscriptionExpired(refreshed.subscriptionEnd)) {
    stopCrmServer();
    return 'locked';
  }

  // Offline: fail closed only when the last-known local end date has passed.
  if (!cloudOk && isSubscriptionExpired(store.subscriptionEnd)) {
    stopCrmServer();
    return 'locked';
  }

  if (!refreshed.setupComplete && !store.setupComplete) return 'setup';
  startLicenseWatch();
  return store.setupComplete || refreshed.setupComplete ? 'crm' : 'setup';
};

// ── Phase 5: SERVER mode — connect to local Windows Service backend ───────────
/**
 * SERVER mode: Electron connects to localhost.
 * If the backend is starting, show "Starting Server..." and retry every 3s.
 * Once connected, load the CRM dashboard.
 */
async function _connectToLocalServer() {
  const LOCAL_URL = `http://127.0.0.1:${process.env.CRM_SERVER_PORT || 5000}`;
  const MAX_WAIT_MS = 120_000;
  const RETRY_MS   = 3_000;
  const start      = Date.now();

  const attempt = async (): Promise<void> => {
    try {
      const res = await fetch(`${LOCAL_URL}/api/server/info`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) {
        const body = await res.json() as { success: boolean; data?: { app: string } };
        if (body.success && body.data?.app === 'InsuredHub') {
          mainWindow?.webContents.send('app:state', 'ready');
          mainWindow?.loadURL(`${LOCAL_URL}/local/login`);
          console.log('[main] Connected to local server:', LOCAL_URL);
          return;
        }
      }
    } catch { /* not ready yet */ }

    if (Date.now() - start >= MAX_WAIT_MS) {
      mainWindow?.webContents.send('app:state', 'server-error');
      mainWindow?.webContents.send('app:error', { message: 'Backend did not start within 2 minutes. Check the Windows Service.' });
      return;
    }

    mainWindow?.webContents.send('app:state', 'server-starting');
    mainWindow?.webContents.send('server:discovery-status', {
      message: 'Starting InsuredHub Server...',
      stage:   'server-starting',
    });
    setTimeout(() => void attempt(), RETRY_MS);
  };

  void attempt();
}

// ── Phase 5: CLIENT mode — full discovery pipeline ────────────────────────────
/**
 * CLIENT mode: saved server → UDP discovery → manual entry.
 * Once connected: auto-bind this PC under Admin license, then open login.
 */
async function enrollEmployeeViaAdminServer(serverUrl: string): Promise<void> {
  try {
    const fp = await collectFingerprint();
    const axios = (await import('axios')).default;
    const res = await axios.post(
      `${serverUrl.replace(/\/+$/, '')}/api/server/enroll-employee-device`,
      {
        machine_hash: fp.machineHash,
        machine_name: fp.machineName,
        machine_meta: fp.machineMeta,
      },
      { timeout: 20_000 }
    );
    const data = res.data?.data || {};
    saveSecureStore({
      ...loadSecureStore(),
      machineHash: fp.machineHash,
      companyName: data.company_name || loadSecureStore().companyName,
      subdomain: data.subdomain || loadSecureStore().subdomain,
    });
    console.log('[main] Employee device auto-registered with Admin license');
  } catch (err) {
    // Do not block login — Admin may be offline from cloud; login still works.
    const ax = err as { response?: { data?: { message?: string } }; message?: string };
    console.warn(
      '[main] Employee auto-register skipped:',
      ax.response?.data?.message || ax.message || err
    );
  }
}

async function _openEmployeeLogin(result: {
  serverUrl: string;
  serverInfo: { tenantId?: string };
  method: string;
}) {
  const tenantSlug = encodeURIComponent(
    String(result.serverInfo.tenantId || 'local').replace(/^\/+|\/+$/g, '') || 'local'
  );
  const loginUrl = `${result.serverUrl}/${tenantSlug}/login`;
  console.log(`[main] Server connected (${result.method}): opening ${loginUrl}`);
  mainWindow?.webContents.send('app:state', 'employee-opening');
  mainWindow?.webContents.send('server:discovery-status', {
    message: 'Registering this PC with Admin…',
    stage: 'connecting',
  });
  await enrollEmployeeViaAdminServer(result.serverUrl);
  await navigateMainWindowTo(loginUrl);
  mainWindow?.webContents.send('app:state', 'ready');
}

async function _discoverAndConnect() {
  if (!mainWindow) return;
  if (!serverConnectionService) {
    serverConnectionService = new ServerConnectionService(mainWindow, getInstallationMode());
    serverConnectionService.on('status', ({ message, stage }: { message: string; stage: string }) => {
      console.log(`[server-connection] ${stage}: ${message}`);
      trayService?.updateServerInfo({ status: stage });
    });
  }
  try {
    const result = await serverConnectionService.discoverAndConnect();
    await _openEmployeeLogin(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // "Discovery cancelled" is expected when user clicks Connect mid-search
    if (/cancelled/i.test(message)) return;
    console.error('[main] Server discovery failed:', message);
    mainWindow?.webContents.send('app:state', 'server-error');
    mainWindow?.webContents.send('app:error', { message });
  }
}

/**
 * After the window loads (and after the user picks Admin/Employee),
 * route into the correct bootstrap path.
 *
 * Cloud lookup (unless preferLocalChoice):
 *   known ADMIN → Admin path | known EMPLOYEE → discovery | unknown → role-select
 * preferLocalChoice=true after user just picked a role (do not wipe that choice).
 */
async function bootstrapAfterWindowReady(opts?: { preferLocalChoice?: boolean }) {
  const preferLocal = opts?.preferLocalChoice === true;
  const installMode = getInstallationMode();
  mainWindow?.webContents.send('app:install-mode', installMode.getInfo());

  if (!preferLocal) {
    mainWindow?.webContents.send('app:state', 'loading');
    try {
      const fp = await collectFingerprint();
      const lookup = await lookupDeviceByHash(fp.machineHash);
      console.log('[bootstrap] device-lookup:', JSON.stringify(lookup));

      if (lookup.known && lookup.admin_blocked) {
        mainWindow?.webContents.send('app:state', 'locked');
        return;
      }

      if (lookup.known && lookup.role === 'ADMIN') {
        if (!installMode.hasChosenMode() || installMode.isClient()) {
          installMode.setMode('SERVER');
        }
        mainWindow?.webContents.send('app:install-mode', installMode.getInfo());
        const state = await resolveBootstrapState();
        mainWindow?.webContents.send('app:state', state);
        return;
      }

      if (lookup.known && lookup.role === 'EMPLOYEE') {
        installMode.setMode('CLIENT');
        mainWindow?.webContents.send('app:install-mode', installMode.getInfo());
        mainWindow?.webContents.send('app:state', 'discovering');
        await _discoverAndConnect();
        return;
      }

      // Not in Super Admin DB — force role select (fixes leftover CLIENT AppData).
      if (lookup.known === false) {
        installMode.clearMode();
        mainWindow?.webContents.send('app:install-mode', installMode.getInfo());
        mainWindow?.webContents.send('app:state', 'role-select');
        return;
      }
    } catch (err) {
      console.warn(
        '[bootstrap] device-lookup skipped (offline?):',
        err instanceof Error ? err.message : err
      );
      // Offline / API not deployed: do not trust bare CLIENT leftovers from old installs.
      const store = loadSecureStore();
      if (installMode.isClient() && !store.companyName && !store.licenseToken) {
        installMode.clearMode();
        mainWindow?.webContents.send('app:install-mode', installMode.getInfo());
        mainWindow?.webContents.send('app:state', 'role-select');
        return;
      }
    }
  }

  if (!installMode.hasChosenMode()) {
    mainWindow?.webContents.send('app:state', 'role-select');
    return;
  }

  if (installMode.isClient()) {
    mainWindow?.webContents.send('app:state', 'discovering');
    await _discoverAndConnect();
    return;
  }

  void resolveBootstrapState()
    .then((state) => mainWindow?.webContents.send('app:state', state))
    .catch(() => mainWindow?.webContents.send('app:state', 'activation'));
}

app.whenReady().then(() => {
  mainWindow = createWindow();
  initAutoUpdater(mainWindow);
  attachLicenseWatchLifecycle();

  // ── Phase 5: Resolve installation mode ───────────────────────────────────
  const installMode = getInstallationMode();
  console.log(`[main] Installation mode: ${installMode.getMode()}`);

  // ── Phase 3/5: System Tray — hide-to-tray instead of close ───────────────
  trayService = new SystemTrayService(mainWindow);
  trayService.init();

  // Wire up optional tray actions
  trayService.setCallbacks({
    onRestartBackend: async () => {
      if (installMode.isDesktop()) {
        // Desktop mode: restart embedded CRM server
        stopCrmServer();
        await new Promise((r) => setTimeout(r, 1500));
        const store = loadSecureStore();
        if (store.setupComplete) await launchCrm(store).catch(console.error);
      } else if (installMode.isServer()) {
        // Server mode: restart via Windows Service manager
        windowsServiceManager?.restart();
      }
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

  // ── Phase 3/5: Windows Service Manager ────────────────────────────────────
  windowsServiceManager = new WindowsServiceManager();

  // ── Phase 5: Server Connection Service (created lazily for CLIENT) ────────
  // Admin/DESKTOP use embedded CRM; CLIENT discovers Admin over Wi‑Fi.

  mainWindow.webContents.once('did-finish-load', () => {
    void bootstrapAfterWindowReady();
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

// User explicitly asked to quit (Cmd+Q, menu Quit, tray Exit, dock right-click Quit).
// Mark the app as quitting so the window 'close' handler stops hiding to tray and
// actually lets the app exit instead of forcing a force-quit.
app.on('before-quit', () => {
  (app as unknown as { isQuitting?: boolean }).isQuitting = true;
  if (process.env.CRM_MODE !== 'server') {
    stopCrmServer();
  }
  // Release locks on bundled postgres.exe so Windows uninstall can delete files.
  void stopEmbeddedPostgres();
  trayService?.destroy();
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
    const ax = err as { response?: { data?: { message?: string } }; message?: string; statusCode?: number };
    const message = ax.response?.data?.message || ax.message || 'Activation failed';
    throw new Error(message);
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
        label: 'Setting up PostgreSQL',
        // Use ensurePostgresRunning — uses bundled portable PG (no download server required).
        run: async (onProgress) => {
          const running = await ensurePostgresRunning(onProgress);
          // Keep setup credentials in sync with the live config (port may change).
          Object.assign(config, running);
        },
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
          const jwt = ensureDesktopJwtSecrets();
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
            DESKTOP_PLAN_TYPE: activation.planType || '',
            DESKTOP_SUBSCRIPTION_END: activation.subscriptionEnd || '',
            DESKTOP_MAX_EMPLOYEES:
              activation.maxEmployees != null ? String(activation.maxEmployees) : '',
            JWT_ACCESS_SECRET: jwt.accessSecret,
            JWT_REFRESH_SECRET: jwt.refreshSecret,
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
  // Refresh entitlement (and subscription_end) before any local expiry lock.
  const { store, rejection } = await refreshEntitlementFromCloud();
  if (rejection) {
    lockAppForLicense(rejection.message);
    throw rejection;
  }
  // Also pull admin metadata / token if needed.
  const withMeta = await ensureLicenseMetadata();
  if (isSubscriptionExpired(withMeta.subscriptionEnd || store.subscriptionEnd)) {
    lockAppForLicense('subscription expired');
    throw new Error('Subscription expired. Please renew to continue.');
  }
  const url = await launchCrm(withMeta);
  startLicenseWatch();
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
  try {
    const data = await heartbeatLicenseWithRetry(store.licenseToken, store.machineHash || '');
    const updated = cacheSubscriptionFromLicense(store, data as { plan?: string; plan_type?: string; user_limit?: number; subscription_end?: string });
    saveSecureStore(updated);
    return data;
  } catch (err) {
    if (isLicenseRejectionError(err)) {
      lockAppForLicense(err instanceof Error ? err.message : String(err));
    }
    throw err;
  }
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

// ── Phase 5: Installation mode IPC ───────────────────────────────────────────

ipcMain.handle('install-mode:get', () => {
  return getInstallationMode().getInfo();
});

ipcMain.handle('install-mode:set', (_e, mode: string) => {
  try {
    getInstallationMode().setMode(mode as 'SERVER' | 'CLIENT' | 'DESKTOP');
    return { success: true, mode };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('install-mode:clear', () => {
  getInstallationMode().clearMode();
  return { success: true };
});

ipcMain.handle('install-mode:continue', async () => {
  await bootstrapAfterWindowReady({ preferLocalChoice: true });
  return { success: true };
});

ipcMain.handle('install-mode:reset-to-role-select', async () => {
  getInstallationMode().clearMode();
  reloadShellUI();
  mainWindow?.webContents.send('app:state', 'role-select');
  return { success: true };
});

ipcMain.handle('license:enroll-employee', async () => {
  throw new Error(
    'Employees do not enter a license key. Choose Employee PC and connect to the Admin PC — this device registers automatically.'
  );
});

ipcMain.handle('server:retry-discovery', async () => {
  mainWindow?.webContents.send('app:state', 'discovering');
  await _discoverAndConnect();
  return { success: true };
});

/**
 * Direct Connect button path — does NOT depend on the discovery race.
 * Probe with Node http, then navigate to Admin login.
 */
ipcMain.handle('server:connect-manual', async (_e, address: string) => {
  try {
    if (!mainWindow) return { success: false, message: 'Window not ready' };
    if (!serverConnectionService) {
      serverConnectionService = new ServerConnectionService(mainWindow, getInstallationMode());
    }
    const result = await serverConnectionService.connectManual(String(address || ''));
    await _openEmployeeLogin(result);
    return { success: true, url: `${result.serverUrl}/${result.serverInfo.tenantId}/login` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    mainWindow?.webContents.send('app:error', { message });
    return { success: false, message };
  }
});

// ── Phase 5: Server connection IPC ───────────────────────────────────────────

ipcMain.handle('server:connect', async (_e, serverUrl: string) => {
  if (!serverConnectionService) {
    serverConnectionService = new ServerConnectionService(mainWindow!, getInstallationMode());
  }
  try {
    const result = await serverConnectionService.connectManual(String(serverUrl || ''));
    await _openEmployeeLogin(result);
    return { success: true, data: result.serverInfo };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('server:get-saved', () => {
  return serverConnectionService?.getSavedServerUrl() ?? null;
});

ipcMain.handle('server:clear-saved', () => {
  serverConnectionService?.clearSavedServerUrl();
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
