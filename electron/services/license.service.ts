import axios, { AxiosError } from 'axios';
import type { MachineFingerprint } from './fingerprint.service';

const CLOUD_API =
  process.env.LICENSE_CLOUD_API_URL ||
  'https://super-admin-panel-crm-backend.onrender.com/api';

const api = axios.create({ timeout: 30_000 });

const cloudError = (err: unknown, fallback: string): Error => {
  const ax = err as AxiosError<{ message?: string }>;
  return new Error(ax.response?.data?.message || ax.message || fallback);
};

export interface ActivationResult {
  tenant_id: string;
  company_name: string;
  subdomain: string;
  admin_email: string;
  admin_name: string;
  admin_password_hash: string;
  plan: string;
  user_limit: number;
  subscription_end: string;
  license_token: string;
  features?: Record<string, string>;
  enabled_features?: string[];
}

export const activateLicense = async (
  licenseKey: string,
  fingerprint: MachineFingerprint
): Promise<ActivationResult> => {
  try {
    const res = await api.post(`${CLOUD_API}/licenses/activate`, {
      license_key: licenseKey,
      machine_hash: fingerprint.machineHash,
      machine_name: fingerprint.machineName,
      machine_meta: fingerprint.machineMeta,
    });
    return res.data.data;
  } catch (err) {
    throw cloudError(err, 'License activation failed');
  }
};

export const heartbeatLicense = async (licenseToken: string, machineHash: string) => {
  try {
    const res = await api.post(
      `${CLOUD_API}/licenses/heartbeat`,
      { machine_hash: machineHash },
      { headers: { Authorization: `Bearer ${licenseToken}` } }
    );
    return res.data.data;
  } catch (err) {
    throw cloudError(err, 'License heartbeat failed');
  }
};

export const heartbeatLicenseWithRetry = async (
  licenseToken: string,
  machineHash: string,
  attempts = 3
): Promise<unknown> => {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await heartbeatLicense(licenseToken, machineHash);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr ?? new Error('License heartbeat failed');
};

export const requestTransfer = async (
  licenseToken: string,
  payload: { reason: string; new_device_name: string; new_machine_hash: string }
) => {
  try {
    const res = await api.post(`${CLOUD_API}/licenses/transfer-request`, payload, {
      headers: { Authorization: `Bearer ${licenseToken}` },
    });
    return res.data.data;
  } catch (err) {
    throw cloudError(err, 'Transfer request failed');
  }
};

export const getLicenseStatus = async (licenseToken: string) => {
  try {
    const res = await api.get(`${CLOUD_API}/licenses/status`, {
      headers: { Authorization: `Bearer ${licenseToken}` },
    });
    return res.data.data;
  } catch (err) {
    throw cloudError(err, 'Could not fetch license status');
  }
};
