type WebExtensionApi = typeof chrome;

const firefoxApi = (globalThis as typeof globalThis & { browser?: WebExtensionApi }).browser;

export const webExtension = firefoxApi ?? chrome;
