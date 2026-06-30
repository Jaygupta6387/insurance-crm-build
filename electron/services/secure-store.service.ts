import { createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app, safeStorage } from 'electron';

export interface SecureStoreData {
  licenseToken?: string;
  licenseKey?: string;
  tenantId?: string;
  companyName?: string;
  adminEmail?: string;
  adminName?: string;
  adminPasswordHash?: string;
  subdomain?: string;
  machineHash?: string;
  databaseUrl?: string;
  dbUser?: string;
  dbPassword?: string;
  dbName?: string;
  dbPort?: number;
  setupComplete?: boolean;
}

const STORE_FILENAME = 'secure-store.enc';

const getStorePath = () => {
  const dir = join(app.getPath('userData'), 'secure');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, STORE_FILENAME);
};

const deriveKey = (): Buffer => {
  const salt = app.getName() + app.getPath('userData');
  return scryptSync(salt, 'insurecrm-desktop-v1', 32);
};

const encrypt = (plaintext: string): string => {
  if (safeStorage.isEncryptionAvailable()) {
    return 'ss:' + safeStorage.encryptString(plaintext).toString('base64');
  }
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'aes:' + Buffer.concat([iv, tag, enc]).toString('base64');
};

const decrypt = (payload: string): string => {
  if (payload.startsWith('ss:')) {
    return safeStorage.decryptString(Buffer.from(payload.slice(3), 'base64'));
  }
  const buf = Buffer.from(payload.slice(4), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const key = deriveKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

export const loadSecureStore = (): SecureStoreData => {
  const path = getStorePath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(decrypt(raw)) as SecureStoreData;
  } catch {
    return {};
  }
};

export const saveSecureStore = (data: SecureStoreData): void => {
  const path = getStorePath();
  const json = JSON.stringify(data);
  writeFileSync(path, encrypt(json), 'utf8');
};

export const clearSecureStore = (): void => {
  const path = getStorePath();
  if (existsSync(path)) writeFileSync(path, '', 'utf8');
};

export const hashMachineComponents = (parts: string[]): string =>
  createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex');
