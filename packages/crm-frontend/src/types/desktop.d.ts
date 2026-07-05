export {};

declare global {
  interface Window {
    desktop?: {
      getStore?: () => Promise<{
        hasLicense: boolean;
        setupComplete: boolean;
        companyName?: string;
        adminEmail?: string;
      }>;
      selectDocumentRoot?: () => Promise<{ canceled: boolean; path?: string }>;
      openExternal?: (url: string) => Promise<void>;
      resetForNewLicense?: () => Promise<{ success: boolean }>;
    };
  }
}
