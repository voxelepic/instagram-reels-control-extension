import {
  DEFAULT_SETTINGS,
  normalizePatch,
  normalizeSettings,
  type ExtensionSettings,
  type SettingsPatch,
} from "./settings";

function storageAvailable() {
  try {
    return Boolean(
      typeof chrome !== "undefined" &&
        chrome.runtime?.id &&
        chrome.storage?.local,
    );
  } catch {
    return false;
  }
}

function lastRuntimeError() {
  try {
    return chrome.runtime?.lastError?.message;
  } catch {
    return "Extension context is unavailable";
  }
}

export function extensionContextAvailable() {
  return storageAvailable();
}

export async function readSettings(): Promise<ExtensionSettings> {
  if (!storageAvailable()) return { ...DEFAULT_SETTINGS };

  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(DEFAULT_SETTINGS, (result) => {
        const error = lastRuntimeError();
        if (error) {
          console.warn("[Reels Control] Could not read settings:", error);
          resolve({ ...DEFAULT_SETTINGS });
          return;
        }
        resolve(normalizeSettings(result));
      });
    } catch (error) {
      console.warn("[Reels Control] Could not read settings:", error);
      resolve({ ...DEFAULT_SETTINGS });
    }
  });
}

export async function writeSettings(patch: SettingsPatch): Promise<void> {
  if (!storageAvailable()) {
    throw new Error("Extension context is unavailable");
  }

  const normalized = normalizePatch(patch);
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(normalized, () => {
        const error = lastRuntimeError();
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function subscribeToSettings(
  listener: (settings: ExtensionSettings, patch: SettingsPatch) => void,
) {
  if (!storageAvailable()) return () => undefined;

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;

    const patch: SettingsPatch = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof ExtensionSettings>) {
      if (changes[key]) {
        Object.assign(patch, { [key]: changes[key].newValue });
      }
    }

    if (Object.keys(patch).length === 0) return;
    void readSettings().then((settings) => listener(settings, normalizePatch(patch)));
  };

  try {
    chrome.storage.onChanged.addListener(handleChange);
  } catch (error) {
    console.warn("[Reels Control] Could not watch settings:", error);
    return () => undefined;
  }

  return () => {
    try {
      chrome.storage.onChanged.removeListener(handleChange);
    } catch (error) {
      console.warn("[Reels Control] Could not stop watching settings:", error);
    }
  };
}
