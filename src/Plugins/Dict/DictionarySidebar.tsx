import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  ALL_DICTIONARIES_VALUE,
  DICTIONARY_STORAGE_KEYS,
  type DictionarySource,
  getDictionaryLabel,
  persistDictionaryEnabledFiles,
  persistDictionarySetting,
  readPersistedDictionaryEnabledFiles,
  readPersistedDictionarySources,
  readPersistedValue,
  subscribeToDictionarySettings,
} from "./dictionarySettings";

function DictionarySidebar() {
  const [activeDictionaryFile, setActiveDictionaryFile] = createSignal(
    readPersistedValue(DICTIONARY_STORAGE_KEYS.activeFile, ""),
  );
  const [dictionarySources, setDictionarySources] = createSignal<DictionarySource[]>(
    readPersistedDictionarySources(),
  );
  const [enabledDictionaryFiles, setEnabledDictionaryFiles] = createSignal<
    string[] | null
  >(readPersistedDictionaryEnabledFiles());

  const sourceFiles = createMemo(() =>
    dictionarySources().map((source) => source.filePath),
  );
  const enabledFileSet = createMemo(() => {
    const persistedFiles = enabledDictionaryFiles();

    return new Set(persistedFiles ?? sourceFiles());
  });
  const enabledCount = createMemo(() =>
    sourceFiles().filter((filePath) => enabledFileSet().has(filePath)).length,
  );
  const isAllDictionariesActive = createMemo(
    () =>
      activeDictionaryFile().trim() === ALL_DICTIONARIES_VALUE ||
      (!activeDictionaryFile().trim() && dictionarySources().length > 0),
  );

  const setActiveDictionary = (filePath: string) => {
    setActiveDictionaryFile(filePath);
    persistDictionarySetting(DICTIONARY_STORAGE_KEYS.activeFile, filePath);
  };

  const persistEnabledFiles = (filePaths: string[]) => {
    setEnabledDictionaryFiles(filePaths);
    persistDictionaryEnabledFiles(filePaths);
  };

  const toggleDictionary = (filePath: string) => {
    const currentFiles = enabledDictionaryFiles() ?? sourceFiles();
    const nextFiles = currentFiles.includes(filePath)
      ? currentFiles.filter((currentFile) => currentFile !== filePath)
      : [...currentFiles, filePath];

    persistEnabledFiles(nextFiles);

    if (activeDictionaryFile() === filePath && !nextFiles.includes(filePath)) {
      setActiveDictionary(ALL_DICTIONARIES_VALUE);
    }
  };

  const enableAllDictionaries = () => {
    persistEnabledFiles(sourceFiles());
  };

  const disableAllDictionaries = () => {
    persistEnabledFiles([]);
    setActiveDictionary(ALL_DICTIONARIES_VALUE);
  };

  onMount(() => {
    const syncDictionarySettings = () => {
      setActiveDictionaryFile(
        readPersistedValue(DICTIONARY_STORAGE_KEYS.activeFile, ""),
      );
      setDictionarySources(readPersistedDictionarySources());
      setEnabledDictionaryFiles(readPersistedDictionaryEnabledFiles());
    };

    const unsubscribe = subscribeToDictionarySettings(syncDictionarySettings);

    onCleanup(unsubscribe);
  });

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/60 bg-white/70 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
      <div class="border-b border-slate-200/60 px-5 py-5">
        <p class="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Dictionaries
        </p>
        <h2 class="mt-2 text-lg font-bold tracking-tight text-slate-800">
          词典选择
        </h2>
        <p class="mt-2 text-[13px] leading-5 text-slate-500">
          在设置中心导入目录后，这里控制查词范围和启用状态。
        </p>
      </div>

      <div class="flex-none border-b border-slate-200/60 px-5 py-4">
        <div class="flex items-center justify-between gap-3 text-[13px] font-semibold text-slate-500">
          <span>{dictionarySources().length} 本词典</span>
          <span>{enabledCount()} 本启用</span>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={dictionarySources().length === 0}
            onClick={enableAllDictionaries}
          >
            全部启用
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={dictionarySources().length === 0}
            onClick={disableAllDictionaries}
          >
            全部关闭
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <Show
          when={dictionarySources().length > 0}
          fallback={
            <div class="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-5 text-[13px] leading-5 text-slate-500">
              暂无已导入词典。请在软件设置中心的插件页选择词典目录并扫描。
            </div>
          }
        >
          <div class="space-y-2">
            <button
              type="button"
              class="w-full rounded-xl border p-3 text-left transition"
              classList={{
                "border-indigo-300 bg-indigo-50/70 shadow-sm ring-1 ring-inset ring-indigo-200":
                  isAllDictionariesActive(),
                "border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white":
                  !isAllDictionariesActive(),
              }}
              onClick={() => setActiveDictionary(ALL_DICTIONARIES_VALUE)}
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-[14px] font-semibold text-slate-800">
                    全部启用词典
                  </p>
                  <p class="mt-1 text-[12px] text-slate-500">
                    查找 {enabledCount()} 本已启用词典
                  </p>
                </div>

                <Show when={isAllDictionariesActive()}>
                  <span class="rounded-md bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-700">
                    ON
                  </span>
                </Show>
              </div>
            </button>

            <For each={dictionarySources()}>
              {(source) => {
                const isEnabled = () => enabledFileSet().has(source.filePath);
                const isActive = () => source.filePath === activeDictionaryFile();

                return (
                  <button
                    type="button"
                    class="w-full rounded-xl border p-3 text-left transition"
                    classList={{
                      "border-indigo-300 bg-indigo-50/70 shadow-sm ring-1 ring-inset ring-indigo-200":
                        isActive(),
                      "border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white":
                        !isActive(),
                      "opacity-55": !isEnabled(),
                    }}
                    onClick={() => {
                      if (isEnabled()) {
                        setActiveDictionary(source.filePath);
                      }
                    }}
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-[14px] font-semibold text-slate-800">
                          {source.displayName || getDictionaryLabel(source.filePath)}
                        </p>
                        <p class="mt-1 text-[12px] text-slate-500">
                          {source.hasMdd ? "含资源包" : "仅 MDX"}
                        </p>
                      </div>

                      <span
                        class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
                        classList={{
                          "bg-indigo-600": isEnabled(),
                          "bg-slate-300": !isEnabled(),
                        }}
                        role="switch"
                        aria-checked={isEnabled()}
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleDictionary(source.filePath);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleDictionary(source.filePath);
                          }
                        }}
                      >
                        <span
                          class="inline-block h-5 w-5 rounded-full bg-white shadow transition"
                          classList={{
                            "translate-x-5": isEnabled(),
                            "translate-x-0.5": !isEnabled(),
                          }}
                        />
                      </span>
                    </div>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

export default DictionarySidebar;