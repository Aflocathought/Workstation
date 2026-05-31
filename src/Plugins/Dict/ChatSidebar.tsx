import { invoke } from "@tauri-apps/api/core";
import { SolidMarkdown } from "solid-markdown";
import { useChat } from "@ai-sdk/solid";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { useChatBridge } from "./ChatBridgeContext";
import {
  DEFAULT_AI_ENDPOINT,
  DEFAULT_AI_MODEL,
  DICTIONARY_AI_STORAGE_KEYS,
  readPersistedValue,
  subscribeToDictionarySettings,
} from "./dictionarySettings";

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

function ChatSidebar() {
  const { pendingAsk } = useChatBridge();
  const [handledRequestId, setHandledRequestId] = createSignal(0);
  const [apiKey, setApiKey] = createSignal(
    readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.apiKey, ""),
  );
  const [endpoint, setEndpoint] = createSignal(
    readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.endpoint, DEFAULT_AI_ENDPOINT),
  );
  const [model, setModel] = createSignal(
    readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.model, DEFAULT_AI_MODEL),
  );

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
      const assistantText = await invoke<string>("deepseek_chat", {
        messages: normalizedMessages,
        endpoint: endpoint().trim() || DEFAULT_AI_ENDPOINT,
        model: model().trim() || DEFAULT_AI_MODEL,
        apiKey: apiKey().trim() || undefined,
      });

      return createTextStreamResponse(assistantText.trim() || "模型返回了空内容。");
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
        return apiKey().trim() ? "DeepSeek 设置密钥" : "DeepSeek 后端 .env";
    }
  });

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
    const syncAiSettings = () => {
      setApiKey(readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.apiKey, ""));
      setEndpoint(
        readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.endpoint, DEFAULT_AI_ENDPOINT),
      );
      setModel(readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.model, DEFAULT_AI_MODEL));
    };

    const unsubscribe = subscribeToDictionarySettings(syncAiSettings);

    onCleanup(unsubscribe);
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

          <span class="rounded-full bg-slate-100/80 px-4 py-2 text-[13px] font-semibold text-slate-500">
            由软件设置中心配置
          </span>
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
                <span class="flex h-6 items-center rounded-md bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700">ENV</span>
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