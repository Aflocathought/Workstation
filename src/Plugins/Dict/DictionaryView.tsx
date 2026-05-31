import { invoke } from "@tauri-apps/api/core";
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { useChatBridge } from "./ChatBridgeContext";
import {
  ALL_DICTIONARIES_VALUE,
  DICTIONARY_STORAGE_KEYS,
  type DictionarySource,
  readPersistedDictionaryEnabledFiles,
  readPersistedDictionarySources,
  readPersistedValue,
  subscribeToDictionarySettings,
} from "./dictionarySettings";

const LAST_LOOKUP_STORAGE_KEY = "dict:lastLookupWord";
const DEFAULT_ENTRY_HTML = `
  <article>
    <h1>开始查词</h1>
    <p>输入一个单词并按回车开始查询本地 MDX 词典。</p>
    <blockquote>提示：在软件设置中心选择词典目录后，左侧栏会列出可用词典。</blockquote>
  </article>
`;

type AskButtonPosition = {
  left: number;
  top: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeCsvField(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function DictionaryView() {
  const { requestAskAi } = useChatBridge();
  const [query, setQuery] = createSignal("");
  const [currentWord, setCurrentWord] = createSignal("");
  const [entryHtml, setEntryHtml] = createSignal(DEFAULT_ENTRY_HTML);
  const [isLoading, setIsLoading] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal("");
  const [selectedText, setSelectedText] = createSignal("");
  const [askButtonPosition, setAskButtonPosition] =
    createSignal<AskButtonPosition | null>(null);
  const [activeDictionaryFile, setActiveDictionaryFile] = createSignal(
    readPersistedValue(DICTIONARY_STORAGE_KEYS.activeFile, ""),
  );
  const [dictionarySources, setDictionarySources] = createSignal<DictionarySource[]>(
    readPersistedDictionarySources(),
  );
  const [enabledDictionaryFiles, setEnabledDictionaryFiles] = createSignal<
    string[] | null
  >(readPersistedDictionaryEnabledFiles());

  let articleRef: HTMLDivElement | undefined;

  const currentSummary = createMemo(() => stripHtml(entryHtml()).slice(0, 180));
  const availableDictionaryFiles = createMemo(() => {
    const filePaths = dictionarySources().map((source) => source.filePath);
    const enabledFiles = enabledDictionaryFiles();

    if (!enabledFiles) {
      return filePaths;
    }

    const enabledFileSet = new Set(enabledFiles);

    return filePaths.filter((filePath) => enabledFileSet.has(filePath));
  });

  const hideAskButton = () => {
    setSelectedText("");
    setAskButtonPosition(null);
  };

  const lookupWord = async (preferredWord?: string) => {
    const nextWord = (preferredWord ?? query()).trim();

    if (!nextWord) {
      setErrorMessage("请输入要查询的单词");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setCurrentWord(nextWord);
    hideAskButton();

    try {
      const selectedDictionary = activeDictionaryFile().trim();
      const dictionaryFiles = availableDictionaryFiles();
      const html = await invoke<string>("lookup_word", {
        word: nextWord,
        dictionaryFile:
          selectedDictionary &&
          selectedDictionary !== ALL_DICTIONARIES_VALUE &&
          dictionaryFiles.includes(selectedDictionary)
            ? selectedDictionary
            : null,
        dictionaryFiles,
      });
      setEntryHtml(html);
      window.localStorage.setItem(LAST_LOOKUP_STORAGE_KEY, nextWord);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSelectedText = (event: MouseEvent) => {
    const container = articleRef;

    if (!container) {
      return;
    }

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      hideAskButton();
      return;
    }

    const normalizedText = selection.toString().replace(/\s+/g, " ").trim();
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;

    if (
      !normalizedText ||
      (anchorNode && !container.contains(anchorNode)) ||
      (focusNode && !container.contains(focusNode))
    ) {
      hideAskButton();
      return;
    }

    const range = selection.getRangeAt(0);
    const rangeRect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const rawLeft =
      (rangeRect.left || event.clientX) -
      containerRect.left +
      container.scrollLeft;
    const rawTop =
      (rangeRect.bottom || event.clientY) -
      containerRect.top +
      container.scrollTop +
      14;

    const minLeft = container.scrollLeft + 12;
    const maxLeft = container.scrollLeft + container.clientWidth - 124;
    const minTop = container.scrollTop + 12;
    const maxTop = container.scrollTop + container.clientHeight - 52;

    setSelectedText(normalizedText);
    setAskButtonPosition({
      left: clamp(rawLeft, minLeft, Math.max(minLeft, maxLeft)),
      top: clamp(rawTop, minTop, Math.max(minTop, maxTop)),
    });
  };

  const playDictionaryAudio = (event: MouseEvent) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const audioLink = target.closest<HTMLAnchorElement>("a[href^='data:audio']");

    if (!audioLink?.href) {
      return;
    }

    event.preventDefault();
    void new Audio(audioLink.href).play();
  };

  const exportVocabularyToCsv = () => {
    if (!currentWord()) {
      return;
    }

    // 这里先演示浏览器侧 Blob 下载，后续桌面版可替换为 tauri-plugin-fs + dialog 保存到指定路径。
    const csvRows = [
      ["word", "excerpt", "exportedAt"],
      [currentWord(), currentSummary(), new Date().toISOString()],
    ];

    const csvContent = csvRows
      .map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
      .join("\r\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = `${currentWord()}-vocabulary.csv`;
    anchor.click();

    URL.revokeObjectURL(objectUrl);
  };

  onMount(() => {
    const savedWord = window.localStorage.getItem(LAST_LOOKUP_STORAGE_KEY);
    const syncDictionarySettings = () => {
      setActiveDictionaryFile(
        readPersistedValue(DICTIONARY_STORAGE_KEYS.activeFile, ""),
      );
      setDictionarySources(readPersistedDictionarySources());
      setEnabledDictionaryFiles(readPersistedDictionaryEnabledFiles());
    };

    if (savedWord) {
      setQuery(savedWord);
      void lookupWord(savedWord);
    }

    const handleSelectionChange = () => {
      if (!window.getSelection()?.toString().trim()) {
        hideAskButton();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    const unsubscribe = subscribeToDictionarySettings(syncDictionarySettings);

    onCleanup(() => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      unsubscribe();
    });
  });

  return (
    <div class="flex h-full flex-col overflow-hidden rounded-xl border border-white/60 bg-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
      <div class="flex-none px-8 pt-8 pb-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-[14px] bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
            </div>
            <h1 class="text-xl font-bold tracking-tight text-slate-800">
              本地词典
            </h1>
          </div>

          <Show when={currentWord()}>
            <div class="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50/80 px-5 py-2 text-sm font-medium text-indigo-700 backdrop-blur-sm">
              <span class="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
              {currentWord()}
            </div>
          </Show>
        </div>

        <form
          class="mt-6 flex flex-col gap-3 md:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void lookupWord();
          }}
        >
          <div class="relative flex-1">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5 text-slate-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <input
              type="text"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              class="h-14 w-full rounded-2xl border border-white/80 bg-white/80 pl-12 pr-6 text-[15px] font-medium text-slate-800 shadow-sm outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
              placeholder="输入你想查找的单词..."
              spellcheck={false}
            />
          </div>

          <button
            type="submit"
            class="inline-flex h-14 w-16 items-center justify-center gap-2 rounded-2xl bg-slate-900 p-2 font-medium text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            disabled={isLoading()}
          >
            <Show
              when={!isLoading()}
              fallback={
                <svg
                  class="h-5 w-5 animate-spin text-white/70"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              }
            >
              <span>查 词</span>
            </Show>
          </button>
        </form>

        <Show when={errorMessage()}>
          <div class="mt-4 flex items-center gap-3 rounded-2xl border border-rose-200/60 bg-rose-50/80 px-5 py-4 text-[15px] font-medium text-rose-700 backdrop-blur-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="m9 9 6 6" />
            </svg>
            {errorMessage()}
          </div>
        </Show>
      </div>

      <div class="min-h-0 flex-1 px-8 pb-4">
        <div class="relative h-full overflow-hidden rounded-[20px] border border-white/60 bg-white/50 shadow-inner">
          <div
            ref={articleRef}
            class="dictionary-scroll relative h-full overflow-auto p-6 md:p-8"
            onClick={playDictionaryAudio}
            onMouseUp={updateSelectedText}
            onDblClick={updateSelectedText}
          >
            <Show when={!isLoading()}>
              <div class="dictionary-html" innerHTML={entryHtml()} />
            </Show>

            <Show when={askButtonPosition()}>
              {(position) => (
                <button
                  type="button"
                  class="animate-button-pop absolute z-20 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold tracking-wide text-white shadow-lg shadow-indigo-600/30 transition hover:-translate-y-0.5 hover:bg-indigo-500"
                  style={{
                    left: `${position().left}px`,
                    top: `${position().top}px`,
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    requestAskAi(selectedText());
                    hideAskButton();
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3ZM5 3v4M19 17v4M3 5h4M17 19h4" />
                  </svg>
                  <span>询问AI</span>
                </button>
              )}
            </Show>
          </div>
        </div>
      </div>

      <div class="flex flex-none items-center justify-between border-t border-slate-200/50 px-8 py-5 bg-white/30 backdrop-blur-md">
        <p class="text-[14px] font-medium text-slate-500">
          选中文本后点击 Ask AI 召唤助教
        </p>

        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[14px] font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 hover:text-indigo-600 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!currentWord()}
          onClick={exportVocabularyToCsv}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          <span>导出 CSV</span>
        </button>
      </div>
    </div>
  );
}

export default DictionaryView;
