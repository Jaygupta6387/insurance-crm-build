import { app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';

/** Local dev: New-CRM 2 sits beside insurecrm-desktop in the workspace. */
const devCrmAppBackend = (): string => join(app.getAppPath(), '..', 'New-CRM 2', 'backend');
const devCrmAppFrontendDist = (): string => join(app.getAppPath(), '..', 'New-CRM 2', 'frontend', 'dist');

export const getCrmBackendPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'crm-backend');
  }
  if (existsSync(join(devCrmAppBackend(), 'package.json'))) return devCrmAppBackend();
  throw new Error(
    `CRM backend not found. Expected New-CRM 2 at ${devCrmAppBackend()}.\n` +
    `Make sure the New-CRM 2 folder is beside insurecrm-desktop in the workspace.`
  );
};

export const getCrmFrontendDistPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'crm-frontend', 'dist');
  }
  if (existsSync(join(devCrmAppFrontendDist(), 'index.html'))) return devCrmAppFrontendDist();
  throw new Error(
    `CRM frontend dist not found. Build New-CRM 2/frontend first (npm run build).\n` +
    `Looked in: ${devCrmAppFrontendDist()}`
  );
};
