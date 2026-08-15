import { createHash } from 'crypto';
import { hostname } from 'os';
import { machineIdSync } from 'node-machine-id';
import si from 'systeminformation';
import { hashMachineComponents } from './secure-store.service';

export interface MachineFingerprint {
  /** Primary stable hash used for new binds (no volatile NIC MAC). */
  machineHash: string;
  /**
   * Legacy hash (includes MAC) so Super Admin can still recognize
   * machines activated before the stable-fingerprint change.
   */
  legacyMachineHash: string;
  machineName: string;
  machineMeta: Record<string, string>;
}

type SiNet = { mac?: string; internal?: boolean };

const stableParts = (
  machineId: string,
  system: { uuid?: string; serial?: string; manufacturer?: string; model?: string },
  primaryDisk: { serialNum?: string; name?: string } | undefined,
  osInfo: { serial?: string; uuid?: string }
): string[] => [
  machineId,
  system.uuid || system.serial || '',
  system.manufacturer || '',
  system.model || '',
  primaryDisk?.serialNum || primaryDisk?.name || '',
  osInfo.serial || osInfo.uuid || '',
  'fpv2',
];

const legacyParts = (
  machineId: string,
  system: { uuid?: string; serial?: string; manufacturer?: string; model?: string },
  primaryDisk: { serialNum?: string; name?: string } | undefined,
  osInfo: { serial?: string; uuid?: string },
  mac: string
): string[] => [
  machineId,
  system.uuid || system.serial || '',
  system.manufacturer || '',
  system.model || '',
  primaryDisk?.serialNum || primaryDisk?.name || '',
  osInfo.serial || osInfo.uuid || '',
  mac,
];

export const collectFingerprint = async (): Promise<MachineFingerprint> => {
  const [system, disk, osInfo, net] = await Promise.all([
    si.system(),
    si.diskLayout(),
    si.osInfo(),
    si.networkInterfaces(),
  ]);

  const machineId = machineIdSync(true);
  const primaryDisk = disk[0];
  const stableNet = (net as SiNet[]).find(
    (n) => n.mac && n.mac !== '00:00:00:00:00:00' && !n.internal
  );
  const mac = stableNet?.mac || '';

  const machineHash = hashMachineComponents(
    stableParts(machineId, system, primaryDisk, osInfo)
  );
  const legacyMachineHash = hashMachineComponents(
    legacyParts(machineId, system, primaryDisk, osInfo, mac)
  );
  const machineName = hostname();

  return {
    machineHash,
    legacyMachineHash,
    machineName,
    machineMeta: {
      os: `${osInfo.platform} ${osInfo.release}`,
      cpu: system.model || 'unknown',
      disk: primaryDisk?.name || 'unknown',
      fingerprint: 'fpv2',
    },
  };
};

export const fingerprintHash = (fp: MachineFingerprint): string =>
  createHash('sha256').update(fp.machineHash).digest('hex');
