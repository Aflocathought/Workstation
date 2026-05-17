export const DICTIONARY_STORAGE_KEYS = {
  directory: "dict:dictionary-directory",
  activeFile: "dict:active-dictionary-file",
};

export const DICTIONARY_SETTINGS_UPDATED_EVENT = "dict:settings-updated";

export type DictionarySource = {
  filePath: string;
  fileName: string;
  displayName: string;
  hasMdd: boolean;
  mddPath: string | null;
};

export function readPersistedValue(key: string, fallbackValue: string) {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  return window.localStorage.getItem(key) ?? fallbackValue;
}

export function persistDictionarySetting(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.localStorage.setItem(key, value);
  } else {
    window.localStorage.removeItem(key);
  }

  window.dispatchEvent(new CustomEvent(DICTIONARY_SETTINGS_UPDATED_EVENT));
}

export function subscribeToDictionarySettings(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener(DICTIONARY_SETTINGS_UPDATED_EVENT, onChange);

  return () => {
    window.removeEventListener(DICTIONARY_SETTINGS_UPDATED_EVENT, onChange);
  };
}

export function getDictionaryLabel(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() ?? filePath;

  return fileName.replace(/\.mdx$/i, "");
}