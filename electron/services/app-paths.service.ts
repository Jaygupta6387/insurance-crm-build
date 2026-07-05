import { app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';

/** Local dev: New-CRM 2 sits beside insurecrm-desktop in the workspace. */
const devCrmAppBackend = (): string => join(app.getAppPath(), '..', 'New-CRM 2', 'backend');
const devCrmAppFrontendDist = (): string => join(app.getAppPath(), '..', 'New-CRM 2', 'frontend', 'dist');

/** Build staging area populated by scripts/sync-crm-app.mjs before packaging. */
const devBundledBackend = (): string => join(app.getAppPath(), '.crm-bundle', 'backend');
const devBundledFrontendDist = (): string => join(app.getAppPath(), '.crm-bundle', 'frontend', 'dist');

export const getCrmBackendPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'crm-backend');
  }
  if (existsSync(join(devCrmAppBackend(), 'package.json'))) return devCrmAppBackend();
  if (existsSync(join(devBundledBackend(), 'package.json'))) return devBundledBackend();
  throw new Error(
    `CRM backend not found. Expected New-CRM 2 at ${devCrmAppBackend()} or a synced bundle at ${devBundledBackend()}.`
  );
};

export const getCrmFrontendDistPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'crm-frontend', 'dist');
  }
  if (existsSync(join(devCrmAppFrontendDist(), 'index.html'))) return devCrmAppFrontendDist();
  if (existsSync(join(devBundledFrontendDist(), 'index.html'))) return devBundledFrontendDist();
  throw new Error(
    `CRM frontend not found. Build New-CRM 2 frontend or run npm run sync:crm. Looked in ${devCrmAppFrontendDist()} and ${devBundledFrontendDist()}.`
  );
};
