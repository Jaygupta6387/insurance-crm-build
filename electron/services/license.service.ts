import axios, { AxiosError } from 'axios';
import type { MachineFingerprint } from './fingerprint.service';

const CLOUD_API =
  process.env.LICENSE_CLOUD_API_URL ||
  'https://super-admin-panel-crm-backend.onrender.com/api';

const api = axios.create({ timeout: 30_000 });

const cloudError = (err: unknown, fallback: string): Error & { statusCode?: number } => {
  const ax = err as AxiosError<{ message?: string }>;
  let message = ax.response?.data?.message || ax.message || fallback;
  const status = ax.response?.status;

  // Normalize older Super Admin wording + map by status for the activation UI.
  if (
    status === 409 ||
    /already activated on another device|already used on another/i.test(message)
  ) {
    message =
      'This license is already used on another system. Contact your administrator to reset hardware.';
  } else if (status === 404 && /invalid license/i.test(message)) {
    message = 'Invalid license key';
  }

  const error = new Error(message) as Error & { statusCode?: number };
  if (status) error.statusCode = status;
  return error;
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
      // Lets Super Admin recognize installs bound before the stable fingerprint change.
      legacy_machine_hash: fingerprint.legacyMachineHash,
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

export type DeviceLookupResult = {
  known: boolean;
  role?: 'ADMIN' | 'EMPLOYEE';
  license_id?: string;
  company_name?: string;
  subdomain?: string;
  license_status?: string;
  admin_blocked?: boolean;
  machine_name?: string;
};

export const lookupDeviceByHash = async (machineHash: string): Promise<DeviceLookupResult> => {
  try {
    const res = await api.get(`${CLOUD_API}/licenses/device-lookup`, {
      params: { machine_hash: machineHash },
      timeout: 12_000,
    });
    return (res.data?.data || res.data) as DeviceLookupResult;
  } catch (err) {
    throw cloudError(err, 'Device lookup failed');
  }
};

export const enrollEmployeeDevice = async (
  licenseKey: string,
  fingerprint: MachineFingerprint
): Promise<{ role: string; company_name: string; subdomain: string; license_id: string }> => {
  try {
    const res = await api.post(`${CLOUD_API}/licenses/enroll-employee`, {
      license_key: licenseKey,
      machine_hash: fingerprint.machineHash,
      legacy_machine_hash: fingerprint.legacyMachineHash,
      machine_name: fingerprint.machineName,
      machine_meta: fingerprint.machineMeta,
    });
    return res.data.data;
  } catch (err) {
    throw cloudError(err, 'Employee enrollment failed');
  }
};
