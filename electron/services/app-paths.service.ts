import { app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';

const bundledBackend = () => join(__dirname, '../../../packages/crm-backend');
const devBackend = () => join(__dirname, '../../../../New-CRM 2/backend');
const bundledFrontendDist = () => join(__dirname, '../../../packages/crm-frontend/dist');
const devFrontendDist = () => join(__dirname, '../../../../New-CRM 2/frontend/dist');

export const getCrmBackendPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'crm-backend');
  }
  if (existsSync(join(bundledBackend(), 'package.json'))) return bundledBackend();
  if (existsSync(join(devBackend(), 'package.json'))) return devBackend();
  return bundledBackend();
};

export const getCrmFrontendDistPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'crm-frontend', 'dist');
  }
  if (existsSync(bundledFrontendDist())) return bundledFrontendDist();
  if (existsSync(devFrontendDist())) return devFrontendDist();
  return bundledFrontendDist();
};
