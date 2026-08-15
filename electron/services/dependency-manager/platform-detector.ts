/**
 * PlatformDetector — Identifies the current OS, architecture, and platform key.
 * Returns the correct platform key matching dependency-manifest.json.
 */

export type SupportedPlatform =
  | 'win32-x64'
  | 'win32-arm64'
  | 'darwin-x64'
  | 'darwin-arm64'
  | 'linux-x64';

export interface PlatformInfo {
  platform: NodeJS.Platform;
  arch: string;
  /** Key used to look up the correct entry in the dependency manifest */
  platformKey: SupportedPlatform;
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
  isAppleSilicon: boolean;
  isIntelMac: boolean;
  displayName: string;
}

/**
 * Detects the current platform and returns a fully-populated PlatformInfo
 * object. The `platformKey` matches the keys used in dependency-manifest.json.
 */
export const detectPlatform = (): PlatformInfo => {
  const platform = process.platform;
  const arch = process.arch;

  const isWindows = platform === 'win32';
  const isMac = platform === 'darwin';
  const isLinux = platform === 'linux';
  const isAppleSilicon = isMac && arch === 'arm64';
  const isIntelMac = isMac && arch === 'x64';

  let platformKey: SupportedPlatform;
  let displayName: string;

  if (isWindows && arch === 'arm64') {
    platformKey = 'win32-arm64';
    displayName = 'Windows ARM64';
  } else if (isWindows) {
    platformKey = 'win32-x64';
    displayName = 'Windows x64';
  } else if (isAppleSilicon) {
    platformKey = 'darwin-arm64';
    displayName = 'macOS Apple Silicon (ARM64)';
  } else if (isIntelMac) {
    platformKey = 'darwin-x64';
    displayName = 'macOS Intel (x64)';
  } else if (isLinux) {
    platformKey = 'linux-x64';
    displayName = 'Linux x64';
  } else {
    platformKey = 'linux-x64';
    displayName = `Unknown (${platform}-${arch})`;
  }

  return {
    platform,
    arch,
    platformKey,
    isWindows,
    isMac,
    isLinux,
    isAppleSilicon,
    isIntelMac,
    displayName,
  };
};

/** Singleton platform info — evaluated once at module load time */
export const platformInfo = detectPlatform();
