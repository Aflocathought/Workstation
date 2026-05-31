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
  prompts: "dict:ai-prompts",
};

export const DICTIONARY_SETTINGS_UPDATED_EVENT = "dict:settings-updated";
export const ALL_DICTIONARIES_VALUE = "__all_imported_dictionaries__";
export const DEFAULT_AI_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const DEFAULT_AI_MODEL = "deepseek-v4-pro";

export type DictionaryAIPrompt = {
  id: string;
  keyword: string;
  description: string;
  prompt: string;
  builtin?: boolean;
};

export const DICTIONARY_AI_PROMPT_INPUT_TOKEN = "{{input}}";

export const DEFAULT_DICTIONARY_AI_PROMPTS: DictionaryAIPrompt[] = [
  {
    id: "builtin-chat",
    keyword: "chat",
    description: "默认闲聊或随机提问；没有 @ 时自动使用。",
    prompt: DICTIONARY_AI_PROMPT_INPUT_TOKEN,
    builtin: true,
  },
];

export type DictionarySource = {
  filePath: string;
  fileName: string;
  displayName: string;
  hasMdd: boolean;
  mddPath: string | null;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function normalizeDictionaryAIPromptKeyword(keyword: string) {
  return keyword
    .trim()
    .replace(/^@+/, "")
    .replace(/@+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 32)
    .toLowerCase();
}

function normalizeDictionaryAIPrompt(
  value: unknown,
  index: number,
): DictionaryAIPrompt | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const keywordValue = value.keyword;
  const promptValue = value.prompt;

  if (typeof keywordValue !== "string" || typeof promptValue !== "string") {
    return null;
  }

  const keyword = normalizeDictionaryAIPromptKeyword(keywordValue);
  const prompt = promptValue.trim();

  if (!keyword || !prompt) {
    return null;
  }

  const idValue = value.id;
  const descriptionValue = value.description;

  return {
    id:
      typeof idValue === "string" && idValue.trim()
        ? idValue.trim()
        : `prompt-${keyword}-${index}`,
    keyword,
    description:
      typeof descriptionValue === "string" ? descriptionValue.trim() : "",
    prompt,
    builtin: value.builtin === true,
  };
}

export function normalizeDictionaryAIPrompts(
  prompts: unknown[],
): DictionaryAIPrompt[] {
  const requiredPrompts = DEFAULT_DICTIONARY_AI_PROMPTS.map((prompt) => ({
    ...prompt,
    builtin: true,
  }));
  const requiredKeywords = new Set(requiredPrompts.map((prompt) => prompt.keyword));
  const customPrompts = new Map<string, DictionaryAIPrompt>();

  prompts.forEach((value, index) => {
    const prompt = normalizeDictionaryAIPrompt(value, index);

    if (!prompt || requiredKeywords.has(prompt.keyword)) {
      return;
    }

    if (!customPrompts.has(prompt.keyword)) {
      customPrompts.set(prompt.keyword, {
        ...prompt,
        builtin: false,
      });
    }
  });

  return [...requiredPrompts, ...customPrompts.values()];
}

export function readPersistedAIPrompts() {
  if (typeof window === "undefined") {
    return normalizeDictionaryAIPrompts([]);
  }

  const rawValue = window.localStorage.getItem(DICTIONARY_AI_STORAGE_KEYS.prompts);

  if (!rawValue) {
    return normalizeDictionaryAIPrompts([]);
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    return Array.isArray(parsedValue)
      ? normalizeDictionaryAIPrompts(parsedValue)
      : normalizeDictionaryAIPrompts([]);
  } catch {
    return normalizeDictionaryAIPrompts([]);
  }
}

export function persistDictionaryAIPrompts(prompts: DictionaryAIPrompt[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DICTIONARY_AI_STORAGE_KEYS.prompts,
    JSON.stringify(normalizeDictionaryAIPrompts(prompts)),
  );
  window.dispatchEvent(new CustomEvent(DICTIONARY_SETTINGS_UPDATED_EVENT));
}

export function getDictionaryAIPromptByKeyword(
  keyword: string,
  prompts: DictionaryAIPrompt[] = readPersistedAIPrompts(),
) {
  const normalizedKeyword = normalizeDictionaryAIPromptKeyword(keyword || "chat");
  const normalizedPrompts = normalizeDictionaryAIPrompts(prompts);

  return (
    normalizedPrompts.find((prompt) => prompt.keyword === normalizedKeyword) ??
    DEFAULT_DICTIONARY_AI_PROMPTS[0]
  );
}

export function buildDictionaryAIPromptContent(
  prompt: DictionaryAIPrompt,
  userInput: string,
) {
  const normalizedInput = userInput.trim();
  const template = prompt.prompt.trim() || DICTIONARY_AI_PROMPT_INPUT_TOKEN;

  if (template === DICTIONARY_AI_PROMPT_INPUT_TOKEN) {
    return normalizedInput;
  }

  if (template.includes(DICTIONARY_AI_PROMPT_INPUT_TOKEN)) {
    return template.split(DICTIONARY_AI_PROMPT_INPUT_TOKEN).join(normalizedInput);
  }

  return normalizedInput
    ? `${template}\n\n用户输入：${normalizedInput}`
    : template;
}

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