import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;
let updateDownloaded = false;

const sendStatus = (payload: Record<string, unknown>): void => {
  mainWindow?.webContents.send('updater:status', payload);
};

export const initAutoUpdater = (win: BrowserWindow): void => {
  mainWindow = win;
  updateDownloaded = false;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    sendStatus({ status: 'available', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({
      status: 'downloading',
      percent: Math.round(progress.percent),
      version: progress.version,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    console.log('[Updater] Update downloaded:', info.version);
    sendStatus({ status: 'ready', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatus({ status: 'idle' });
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater]', err.message);
    sendStatus({ status: 'error', message: err.message });
  });

  // Check on startup (packaged builds only)
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  }
};

export const checkForUpdates = (): void => {
  autoUpdater.checkForUpdates().catch(() => {});
};

export const installUpdate = (): void => {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall(false, true);
  } else {
    autoUpdater.checkForUpdates().catch(() => {});
  }
};
