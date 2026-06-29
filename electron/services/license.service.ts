import axios from 'axios';
import type { MachineFingerprint } from './fingerprint.service';

const CLOUD_API =
  process.env.LICENSE_CLOUD_API_URL ||
  'https://super-admin-panel-crm-backend.onrender.com/api';

const api = axios.create({ timeout: 15000 });

export interface ActivationResult {
  tenant_id: string;
  company_name: string;
  subdomain: string;
  admin_email: string;
  plan: string;
  user_limit: number;
  subscription_end: string;
  license_token: string;
}

export const activateLicense = async (
  licenseKey: string,
  fingerprint: MachineFingerprint
): Promise<ActivationResult> => {
  const res = await api.post(`${CLOUD_API}/licenses/activate`, {
    license_key: licenseKey,
    machine_hash: fingerprint.machineHash,
    machine_name: fingerprint.machineName,
    machine_meta: fingerprint.machineMeta,
  });
  return res.data.data;
};

export const heartbeatLicense = async (licenseToken: string, machineHash: string) => {
  const res = await api.post(
    `${CLOUD_API}/licenses/heartbeat`,
    { machine_hash: machineHash },
    { headers: { Authorization: `Bearer ${licenseToken}` } }
  );
  return res.data.data;
};

export const requestTransfer = async (
  licenseToken: string,
  payload: { reason: string; new_device_name: string; new_machine_hash: string }
) => {
  const res = await api.post(`${CLOUD_API}/licenses/transfer-request`, payload, {
    headers: { Authorization: `Bearer ${licenseToken}` },
  });
  return res.data.data;
};

export const getLicenseStatus = async (licenseToken: string) => {
  const res = await api.get(`${CLOUD_API}/licenses/status`, {
    headers: { Authorization: `Bearer ${licenseToken}` },
  });
  return res.data.data;
};
