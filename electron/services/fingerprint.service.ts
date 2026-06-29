import { createHash } from 'crypto';
import { hostname } from 'os';
import { machineIdSync } from 'node-machine-id';
import si from 'systeminformation';
import { hashMachineComponents } from './secure-store.service';

export interface MachineFingerprint {
  machineHash: string;
  machineName: string;
  machineMeta: Record<string, string>;
}

export const collectFingerprint = async (): Promise<MachineFingerprint> => {
  const [system, disk, osInfo, net] = await Promise.all([
    si.system(),
    si.diskLayout(),
    si.osInfo(),
    si.networkInterfaces(),
  ]);

  const primaryDisk = disk[0];
  const stableNet = (net as Array<{ mac?: string; internal?: boolean }>)
    .find((n) => n.mac && n.mac !== '00:00:00:00:00:00' && !n.internal);

  const parts = [
    machineIdSync(true),
    system.uuid || system.serial || '',
    system.manufacturer || '',
    system.model || '',
    primaryDisk?.serialNum || primaryDisk?.name || '',
    osInfo.serial || osInfo.uuid || '',
    stableNet?.mac || '',
  ];

  const machineHash = hashMachineComponents(parts);
  const machineName = hostname();

  return {
    machineHash,
    machineName,
    machineMeta: {
      os: `${osInfo.platform} ${osInfo.release}`,
      cpu: system.model || 'unknown',
      disk: primaryDisk?.name || 'unknown',
    },
  };
};

export const fingerprintHash = (fp: MachineFingerprint): string =>
  createHash('sha256').update(fp.machineHash).digest('hex');
