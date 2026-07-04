import { app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';

/** Single source of truth: New-CRM 2 (local dev) */
const crmAppBackend = () => join(__dirname, '../../../../New-CRM 2/backend');
const crmAppFrontendDist = () => join(__dirname, '../../../../New-CRM 2/frontend/dist');

/** Build staging area populated by scripts/sync-crm-app.mjs before packaging */
const bundledBackend = () => join(__dirname, '../../../.crm-bundle/backend');
const bundledFrontendDist = () => join(__dirname, '../../../.crm-bundle/frontend/dist');

export const getCrmBackendPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'crm-backend');
  }
  if (existsSync(join(crmAppBackend(), 'package.json'))) return crmAppBackend();
  if (existsSync(join(bundledBackend(), 'package.json'))) return bundledBackend();
  return crmAppBackend();
};

export const getCrmFrontendDistPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'crm-frontend', 'dist');
  }
  if (existsSync(crmAppFrontendDist())) return crmAppFrontendDist();
  if (existsSync(bundledFrontendDist())) return bundledFrontendDist();
  return crmAppFrontendDist();
};
