export const DICTIONARY_STORAGE_KEYS = {
  directory: "dict:dictionary-directory",
  activeFile: "dict:active-dictionary-file",
  enabledFiles: "dict:enabled-dictionary-files",
  sources: "dict:dictionary-sources",
};

export const DICTIONARY_AI_STORAGE_KEYS = {
  apiKey: "dict:ai-api-key",
  endpoint: "dict:ai-endpoint",
  model: "dict:ai-model",
};

export const DICTIONARY_SETTINGS_UPDATED_EVENT = "dict:settings-updated";
export const ALL_DICTIONARIES_VALUE = "__all_imported_dictionaries__";
export const DEFAULT_AI_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
export const DEFAULT_AI_MODEL = "deepseek-chat";

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

function isDictionarySource(value: unknown): value is DictionarySource {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DictionarySource>;

  return (
    typeof candidate.filePath === "string" &&
    typeof candidate.fileName === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.hasMdd === "boolean" &&
    (typeof candidate.mddPath === "string" || candidate.mddPath === null)
  );
}

export function readPersistedDictionarySources() {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(DICTIONARY_STORAGE_KEYS.sources);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    return Array.isArray(parsedValue)
      ? parsedValue.filter(isDictionarySource)
      : [];
  } catch {
    return [];
  }
}

export function persistDictionarySources(sources: DictionarySource[]) {
  if (typeof window === "undefined") {
    return;
  }

  if (sources.length > 0) {
    window.localStorage.setItem(
      DICTIONARY_STORAGE_KEYS.sources,
      JSON.stringify(sources),
    );
  } else {
    window.localStorage.removeItem(DICTIONARY_STORAGE_KEYS.sources);
  }

  window.dispatchEvent(new CustomEvent(DICTIONARY_SETTINGS_UPDATED_EVENT));
}

export function readPersistedDictionaryEnabledFiles() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(DICTIONARY_STORAGE_KEYS.enabledFiles);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    return Array.isArray(parsedValue)
      ? parsedValue.filter((value): value is string => typeof value === "string")
      : null;
  } catch {
    return null;
  }
}

export function persistDictionaryEnabledFiles(filePaths: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DICTIONARY_STORAGE_KEYS.enabledFiles,
    JSON.stringify(filePaths),
  );
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
  if (filePath === ALL_DICTIONARIES_VALUE) {
    return "全部导入词典";
  }

  const normalizedPath = filePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() ?? filePath;

  return fileName.replace(/\.mdx$/i, "");
}