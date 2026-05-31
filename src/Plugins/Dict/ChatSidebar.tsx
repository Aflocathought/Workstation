import { SolidMarkdown } from "solid-markdown";
import { useChat } from "@ai-sdk/solid";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { useChatBridge } from "./ChatBridgeContext";
import {
  ALL_DICTIONARIES_VALUE,
  DICTIONARY_STORAGE_KEYS,
  type DictionarySource,
  getDictionaryLabel,
  persistDictionarySources,
  persistDictionarySetting,
  readPersistedDictionarySources,
  readPersistedValue,
} from "./dictionarySettings";

const STORAGE_KEYS = {
  apiKey: "dict:ai-api-key",
  endpoint: "dict:ai-endpoint",
  model: "dict:ai-model",
};

const DEFAULT_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_SYSTEM_PROMPT =
  "你是一名桌面词典中的外语学习助教。请优先解释语义、典型搭配、语法作用，并给出自然例句。";

type ChatMessagePayload = {
  role?: string;
  content?: string;
  parts?: Array<{
    type?: string;
    text?: string;
  }>;
};

type ChatApiRequestBody = {
  messages?: ChatMessagePayload[];
};

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function parseRequestBody(body: BodyInit | null | undefined): ChatApiRequestBody {
  if (typeof body !== "string") {
    return {};
  }

  try {
    return JSON.parse(body) as ChatApiRequestBody;
  } catch {
    return {};
  }
}

function extractMessageText(message: ChatMessagePayload) {
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  return (
    message.parts
      ?.filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

function createTextStreamResponse(text: string) {
  const encoder = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,28}/g) ?? [text];

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          await Promise.resolve();
        }

        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
}

function buildMockReply(prompt: string) {
  const quotedPrompt = prompt || "请先从左侧选择一段文本或直接在下方输入问题。";

  return [
    "### Mock 助教回复",
    "",
    `当前没有检测到可用的 API Key，所以这是一段本地 mock 回复。`,
    "",
    `你刚才提问的是：${quotedPrompt}`,
    "",
    "1. 这段表达通常需要先看语境，尤其是它在句子里承担的是名词、动词还是固定搭配。",
    "2. 学习时建议同时记录词义、搭配对象、常见语域，以及一个你自己能复述的例句。",
    "3. 等你填入 DeepSeek API Key 后，这里会直接切换成真实模型回复。",
    "",
    "示例句：When you meet a new expression, write down one sentence that belongs to your own context.",
  ].join("\n");
}

function ChatSidebar() {
  const { pendingAsk } = useChatBridge();
  const [showSettings, setShowSettings] = createSignal(false);
  const [handledRequestId, setHandledRequestId] = createSignal(0);
  const [apiKey, setApiKey] = createSignal(
    readPersistedValue(STORAGE_KEYS.apiKey, ""),
  );
  const [endpoint, setEndpoint] = createSignal(
    readPersistedValue(STORAGE_KEYS.endpoint, DEFAULT_ENDPOINT),
  );
  const [model, setModel] = createSignal(
    readPersistedValue(STORAGE_KEYS.model, DEFAULT_MODEL),
  );
  const [dictionaryDirectory, setDictionaryDirectory] = createSignal(
    readPersistedValue(DICTIONARY_STORAGE_KEYS.directory, ""),
  );
  const [activeDictionaryFile, setActiveDictionaryFile] = createSignal(
    readPersistedValue(DICTIONARY_STORAGE_KEYS.activeFile, ""),
  );
  const [dictionarySources, setDictionarySources] = createSignal<DictionarySource[]>(
    readPersistedDictionarySources(),
  );
  const [isScanningDictionaries, setIsScanningDictionaries] = createSignal(false);
  const [dictionaryScanMessage, setDictionaryScanMessage] = createSignal("");

  createEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.apiKey, apiKey());
    window.localStorage.setItem(STORAGE_KEYS.endpoint, endpoint());
    window.localStorage.setItem(STORAGE_KEYS.model, model());
  });

  createEffect(() => {
    persistDictionarySetting(
      DICTIONARY_STORAGE_KEYS.directory,
      dictionaryDirectory().trim(),
    );
    persistDictionarySetting(
      DICTIONARY_STORAGE_KEYS.activeFile,
      activeDictionaryFile().trim(),
    );
  });

  const {
    append,
    error,
    input,
    isLoading,
    messages,
    reload,
    setInput,
    status,
    stop,
  } = useChat({
    api: "/api/local-dictionary-chat",
    streamProtocol: "text",
    initialMessages: [
      {
        id: "assistant-welcome",
        role: "assistant",
        content:
          "欢迎来到 AI 学习侧边栏。你可以直接在下方输入问题，或者在左侧词典正文里划词后点击 ✨ Ask AI。",
      },
    ],
    // useChat 需要一个可流式读取的响应，这里在前端把第三方接口结果适配成 text stream。
    fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = parseRequestBody(init?.body);
      const normalizedMessages = (requestBody.messages ?? [])
        .map((message) => ({
          role:
            message.role === "assistant" || message.role === "system"
              ? message.role
              : "user",
          content: extractMessageText(message),
        }))
        .filter((message) => message.content.length > 0);
      const latestPrompt =
        [...normalizedMessages].reverse().find((message) => message.role === "user")
          ?.content ?? "";

      if (!apiKey().trim()) {
        return createTextStreamResponse(buildMockReply(latestPrompt));
      }

      const response = await globalThis.fetch(endpoint().trim() || DEFAULT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey().trim()}`,
        },
        body: JSON.stringify({
          model: model().trim() || DEFAULT_MODEL,
          stream: false,
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: DEFAULT_SYSTEM_PROMPT,
            },
            ...normalizedMessages,
          ],
        }),
        signal: init?.signal,
      });

      if (!response.ok) {
        return new Response(await response.text(), {
          status: response.status,
          statusText: response.statusText,
        });
      }

      const payload = (await response.json()) as DeepSeekResponse;
      const assistantText =
        payload.choices?.[0]?.message?.content?.trim() || "模型返回了空内容。";

      return createTextStreamResponse(assistantText);
    },
  });

  const statusLabel = createMemo(() => {
    switch (status()) {
      case "submitted":
        return "请求已发出";
      case "streaming":
        return "正在流式生成";
      case "error":
        return "请求失败";
      default:
        return apiKey().trim() ? "DeepSeek 已连接" : "当前使用 mock 回复";
    }
  });

  const isAllDictionariesActive = createMemo(
    () =>
      activeDictionaryFile().trim() === ALL_DICTIONARIES_VALUE ||
      (!activeDictionaryFile().trim() && dictionarySources().length > 0),
  );

  const activeDictionaryLabel = createMemo(() => {
    const activeFile = activeDictionaryFile().trim();

    if (isAllDictionariesActive()) {
      return `当前查词范围：全部导入词典（${dictionarySources().length} 本）。`;
    }

    if (!activeFile) {
      return "当前还没有选中词典。";
    }

    return `当前活动词典：${getDictionaryLabel(activeFile)}`;
  });

  const scanDictionaryDirectory = async (preferredPath?: string) => {
    const nextDirectory = (preferredPath ?? dictionaryDirectory()).trim();

    if (!nextDirectory) {
      setDictionarySources([]);
      persistDictionarySources([]);
      setDictionaryScanMessage("请先输入词典目录或点击“选择文件夹”。");
      return;
    }

    setIsScanningDictionaries(true);
    setDictionaryScanMessage("");

    try {
      const sources = await invoke<DictionarySource[]>("scan_dictionary_directory", {
        directory: nextDirectory,
      });

      setDictionarySources(sources);
      persistDictionarySources(sources);

      if (sources.length === 0) {
        setActiveDictionaryFile("");
        setDictionaryScanMessage("没有扫描到 .mdx 词典文件。支持递归扫描子目录。");
        return;
      }

      const currentActiveFile = activeDictionaryFile().trim();
      const hasActiveFile = sources.some(
        (source) => source.filePath === currentActiveFile,
      ) || currentActiveFile === ALL_DICTIONARIES_VALUE;

      if (!hasActiveFile) {
        setActiveDictionaryFile(ALL_DICTIONARIES_VALUE);
      }

      setDictionaryScanMessage(
        `已导入 ${sources.length} 本 MDX 词典。左侧查词会使用真实词典内容。`,
      );
    } catch (error) {
      setDictionarySources([]);
      persistDictionarySources([]);
      setActiveDictionaryFile("");
      const message = error instanceof Error ? error.message : String(error);
      setDictionaryScanMessage(message);
    } finally {
      setIsScanningDictionaries(false);
    }
  };

  const chooseDictionaryDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: dictionaryDirectory().trim() || undefined,
        title: "选择词典目录",
      });

      if (typeof selected !== "string") {
        return;
      }

      setDictionaryDirectory(selected);
      await scanDictionaryDirectory(selected);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDictionaryScanMessage(
        message.includes("window.__TAURI_INTERNALS__")
          ? "当前浏览器预览环境不支持系统目录选择，请手动输入路径。"
          : message,
      );
    }
  };

  const submitCurrentInput = async () => {
    const prompt = input().trim();

    if (!prompt) {
      return;
    }

    if (isLoading()) {
      stop();
    }

    await append({
      role: "user",
      content: prompt,
    });

    setInput("");
  };

  createEffect(() => {
    const request = pendingAsk();

    if (!request || request.id === handledRequestId()) {
      return;
    }

    setHandledRequestId(request.id);

    if (isLoading()) {
      stop();
    }

    void append({
      role: "user",
      content: request.prompt,
    });
  });

  onMount(() => {
    const initialDirectory = dictionaryDirectory().trim();

    if (initialDirectory) {
      void scanDictionaryDirectory(initialDirectory);
    }
  });

  return (
    <div class="flex h-full flex-col overflow-hidden rounded-xl border border-white/60 bg-white/70 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
      <div class="border-b border-slate-200/50 bg-white/40 px-6 py-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
             <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
            </div>
            <div>
              <h2 class="text-[17px] font-bold tracking-tight text-slate-800">AI 助教</h2>
              <p class="mt-0.5 text-[11px] font-semibold text-slate-400">
                {statusLabel()}
              </p>
            </div>
          </div>

          <button
            type="button"
            class="flex items-center gap-1.5 rounded-full bg-slate-100/80 px-4 py-2 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
            onClick={() => setShowSettings((current) => !current)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            {showSettings() ? "收起" : "设置"}
          </button>
        </div>

        <Show when={error()}>
          {(chatError) => (
            <div class="mt-4 flex items-center gap-2 rounded-xl border border-rose-200/60 bg-rose-50/80 px-4 py-3 text-[13px] font-medium text-rose-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
              {chatError().message}
            </div>
          )}
        </Show>
      </div>

      <Show when={showSettings()}>
        <div class="border-b border-slate-200/50 bg-slate-50/80 p-5 px-6">
          <p class="mb-4 text-[13px] font-medium text-slate-500">
            语言模型与词典参数设置
          </p>

          <div class="space-y-4">
            <div class="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-[11px] font-bold tracking-widest text-slate-400 uppercase">
                    Local Dictionary
                  </p>
                  <p class="mt-1.5 text-xs text-slate-600">
                    选择包含 .mdx 词典的系统文件夹。
                  </p>
                </div>

                <button
                  type="button"
                  class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  onClick={() => void chooseDictionaryDirectory()}
                >
                  浏览...
                </button>
              </div>

              <div class="mt-3 flex gap-2">
                <input
                  type="text"
                  value={dictionaryDirectory()}
                  onInput={(event) => setDictionaryDirectory(event.currentTarget.value)}
                  class="h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-[13px] text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  placeholder="词典目录路径"
                  spellcheck={false}
                />

                <button
                  type="button"
                  class="rounded-xl bg-indigo-50 px-5 py-2 text-[13px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isScanningDictionaries()}
                  onClick={() => void scanDictionaryDirectory()}
                >
                  {isScanningDictionaries() ? "扫描中" : "扫描"}
                </button>
              </div>

              <Show when={dictionaryScanMessage()}>
                <p class="mt-2.5 text-[13px] font-medium text-indigo-600/80">
                  {dictionaryScanMessage()}
                </p>
              </Show>

              <p class="mt-2 text-[12px] font-semibold text-slate-500">
                {activeDictionaryLabel()}
              </p>

              <Show when={dictionarySources().length > 0}>
                <div class="mt-4 space-y-2">
                  <button
                    type="button"
                    class="w-full rounded-xl border p-4 text-left transition"
                    classList={{
                      "border-indigo-300 bg-indigo-50/50 ring-1 ring-inset ring-indigo-300 shadow-sm":
                        isAllDictionariesActive(),
                      "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50":
                        !isAllDictionariesActive(),
                    }}
                    onClick={() => setActiveDictionaryFile(ALL_DICTIONARIES_VALUE)}
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-[14px] font-semibold text-slate-800">
                          全部导入词典
                        </p>
                        <p class="mt-1 text-[12px] text-slate-500">
                          {dictionarySources().length} 本 MDX
                        </p>
                      </div>

                      <Show when={isAllDictionariesActive()}>
                        <div class="rounded-md bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-700">
                          ON
                        </div>
                      </Show>
                    </div>
                  </button>

                  <For each={dictionarySources()}>
                    {(source) => {
                      const isActive = () => source.filePath === activeDictionaryFile();

                      return (
                        <button
                          type="button"
                          class="w-full rounded-xl border p-4 text-left transition"
                          classList={{
                            "border-indigo-300 bg-indigo-50/50 ring-1 ring-inset ring-indigo-300 shadow-sm":
                              isActive(),
                            "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50": !isActive(),
                          }}
                          onClick={() => setActiveDictionaryFile(source.filePath)}
                        >
                          <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0">
                              <p class="truncate text-[14px] font-semibold text-slate-800" classList={{ "text-indigo-900": isActive() }}>
                                {source.displayName}
                              </p>
                            </div>

                            <div class="shrink-0 flex items-center gap-2">
                              <Show when={source.hasMdd}>
                                <div class="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                                  MDD
                                </div>
                              </Show>
                              <Show when={isActive()}>
                                <div class="rounded-md bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-700">
                                  ON
                                </div>
                              </Show>
                            </div>
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>

            <div class="flex flex-col gap-3">
              <label class="block">
                <span class="text-[11px] font-bold tracking-widest text-slate-400 uppercase">Endpoint</span>
                <input
                  type="text"
                  value={endpoint()}
                  onInput={(event) => setEndpoint(event.currentTarget.value)}
                  class="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  spellcheck={false}
                />
              </label>

              <label class="block">
                <span class="text-[11px] font-bold tracking-widest text-slate-400 uppercase">Model</span>
                <input
                  type="text"
                  value={model()}
                  onInput={(event) => setModel(event.currentTarget.value)}
                  class="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  spellcheck={false}
                />
              </label>

              <label class="block">
                <span class="text-[11px] font-bold tracking-widest text-slate-400 uppercase">API Key</span>
                <input
                  type="password"
                  value={apiKey()}
                  onInput={(event) => setApiKey(event.currentTarget.value)}
                  class="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  placeholder="留空即使用 Mock 数据"
                  spellcheck={false}
                />
              </label>
            </div>
          </div>
        </div>
      </Show>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div class="space-y-6">
          <For each={messages()}>
            {(message) => (
              <div
                class="flex"
                classList={{
                  "justify-end": message.role === "user",
                  "justify-start": message.role !== "user",
                }}
              >
                <div class="flex max-w-[88%] flex-col gap-1.5">
                  <div class="flex items-center gap-2 px-1" classList={{ "justify-end": message.role === "user" }}>
                    <span class="text-[12px] px-1 font-bold text-slate-400">
                      {message.role === "user" ? "YOU" : "ASSISTANT"}
                    </span>
                  </div>
                  <div
                    class="rounded-[20px] px-5 py-4"
                    classList={{
                      "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 rounded-tr-sm": message.role === "user",
                      "bg-white border border-slate-200/60 shadow-sm rounded-tl-sm text-slate-700": message.role !== "user",
                    }}
                  >
                    <Show
                      when={message.role !== "user"}
                      fallback={
                        <p class="whitespace-pre-wrap text-[15px] leading-relaxed">
                          {message.content}
                        </p>
                      }
                    >
                      <SolidMarkdown
                        class="chat-markdown text-[15px] leading-relaxed"
                        children={message.content || "正在思考..."}
                      />
                    </Show>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="border-t border-slate-200/50 bg-white/40 p-4">
        <form
          class="relative flex flex-col rounded-3xl border border-slate-200 bg-white p-3 shadow-sm transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-500/10"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCurrentInput();
          }}
        >
          <textarea
            rows={3}
            value={input()}
            onInput={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitCurrentInput();
              }
            }}
            class="w-full resize-none border-0 bg-transparent px-4 py-3 text-[15px] text-slate-800 outline-none placeholder:text-slate-400"
            placeholder="提问或从左侧划词..."
          />

          <div class="mt-2 flex items-center justify-between px-2 pb-1">
             <div class="flex items-center gap-1.5">
               <Show when={!apiKey().trim()}>
                  <span class="flex h-6 items-center rounded-md bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">MOCK</span>
               </Show>
            </div>

            <div class="flex items-center gap-2">
              <Show when={messages().length > 1 && !isLoading()}>
                <button
                  type="button"
                  class="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 bg-slate-50 transition hover:bg-slate-100 hover:text-slate-600"
                  title="重新生成"
                  onClick={() => void reload()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
              </Show>

              <Show when={isLoading()}>
                <button
                  type="button"
                  class="flex h-9 w-9 items-center justify-center rounded-full text-rose-400 bg-rose-50 transition hover:bg-rose-100 hover:text-rose-600"
                  title="停止生成"
                  onClick={stop}
                >
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
                </button>
              </Show>

              <button
                type="submit"
                class="flex h-10 items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 text-[14px] font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                disabled={!input().trim()}
              >
                <span>发送</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChatSidebar;