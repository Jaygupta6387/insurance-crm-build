export interface DesktopBridge {
  resetForNewLicense?: () => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export {};
