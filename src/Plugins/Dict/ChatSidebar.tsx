import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SolidMarkdown } from "solid-markdown";
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
  type DictionaryAIPrompt,
  buildDictionaryAIPromptContent,
  getDictionaryAIPromptByKeyword,
  normalizeDictionaryAIPromptKeyword,
  readPersistedAIPrompts,
  readPersistedValue,
  subscribeToDictionarySettings,
} from "./dictionarySettings";

const DEEPSEEK_STREAM_EVENT = "deepseek-chat-stream";
const DEEPSEEK_USER_ID = "workstation-dict";
const MESSAGE_LIST_BOTTOM_THRESHOLD = 48;

type ChatRole = "user" | "assistant";
type ChatStatus =
  | "idle"
  | "submitted"
  | "thinking"
  | "streaming"
  | "cancelling"
  | "error";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  apiContent?: string;
  promptKeyword?: string;
  promptDescription?: string;
  reasoning: string;
  reasoningExpanded: boolean;
  startedAt?: number;
  thinkingElapsedMs?: number;
  responseElapsedMs?: number;
  isStreaming?: boolean;
  isCancelled?: boolean;
  isWelcome?: boolean;
  error?: string;
};

type DeepSeekStreamPayload = {
  requestId: string;
  event:
    | "started"
    | "reasoning"
    | "content"
    | "done"
    | "cancelled"
    | "error"
    | "keepAlive";
  content?: string | null;
  error?: string | null;
  elapsedMs: number;
};

type ActiveRequest = {
  requestId: string;
  assistantMessageId: string;
};

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatElapsed(milliseconds = 0) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createAssistantMessage(id: string): ChatMessage {
  return {
    id,
    role: "assistant",
    content: "",
    reasoning: "",
    reasoningExpanded: true,
    startedAt: Date.now(),
    isStreaming: true,
  };
}

function findLastUserMessageIndex(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      return index;
    }
  }

  return -1;
}

type PromptMention = {
  start: number;
  end: number;
  query: string;
};

function findPromptMention(inputValue: string, cursorPosition: number): PromptMention | null {
  const cursor = Math.max(0, Math.min(cursorPosition, inputValue.length));
  const textBeforeCursor = inputValue.slice(0, cursor);
  const match = textBeforeCursor.match(/(^|\s)@([^\s@]*)$/);

  if (!match) {
    return null;
  }

  const query = match[2] ?? "";

  return {
    start: cursor - query.length - 1,
    end: cursor,
    query,
  };
}

function removePromptToken(inputValue: string, tokenStart: number, tokenEnd: number) {
  const before = inputValue.slice(0, tokenStart).trim();
  const after = inputValue.slice(tokenEnd).trim();

  return [before, after].filter(Boolean).join("\n");
}

function resolvePromptInvocation(rawPrompt: string, prompts: DictionaryAIPrompt[]) {
  const trimmedPrompt = rawPrompt.trim();
  const promptTokenMatch = trimmedPrompt.match(/(^|\s)@([^\s@]+)/);

  if (!promptTokenMatch) {
    const chatPrompt = getDictionaryAIPromptByKeyword("chat", prompts);

    return {
      prompt: chatPrompt,
      apiContent: buildDictionaryAIPromptContent(chatPrompt, trimmedPrompt),
    };
  }

  const tokenStart = promptTokenMatch.index ?? 0;
  const tokenEnd = tokenStart + promptTokenMatch[0].length;
  const requestedKeyword = normalizeDictionaryAIPromptKeyword(promptTokenMatch[2] ?? "chat");
  const requestedPrompt = getDictionaryAIPromptByKeyword(requestedKeyword, prompts);

  if (requestedPrompt.keyword === "chat" && requestedKeyword !== "chat") {
    return {
      prompt: requestedPrompt,
      apiContent: buildDictionaryAIPromptContent(requestedPrompt, trimmedPrompt),
    };
  }

  return {
    prompt: requestedPrompt,
    apiContent: buildDictionaryAIPromptContent(
      requestedPrompt,
      removePromptToken(trimmedPrompt, tokenStart, tokenEnd),
    ),
  };
}

function ChatSidebar() {
  const { pendingAsk } = useChatBridge();
  const [handledRequestId, setHandledRequestId] = createSignal(0);
  const [input, setInput] = createSignal("");
  const [cursorPosition, setCursorPosition] = createSignal(0);
  const [selectedPromptIndex, setSelectedPromptIndex] = createSignal(0);
  const [messages, setMessages] = createSignal<ChatMessage[]>([
    {
      id: "assistant-welcome",
      role: "assistant",
      content:
        "欢迎来到 AI 学习侧边栏。你可以直接提问，输入 @ 选择 prompt，或者在左侧词典正文里划词后点击 ✨ Ask AI。",
      reasoning: "",
      reasoningExpanded: false,
      isWelcome: true,
    },
  ]);
  const [status, setStatus] = createSignal<ChatStatus>("idle");
  const [chatError, setChatError] = createSignal("");
  const [clockTick, setClockTick] = createSignal(Date.now());
  const [activeRequest, setActiveRequest] = createSignal<ActiveRequest | null>(null);
  const [shouldStickToLatest, setShouldStickToLatest] = createSignal(true);
  const [apiKey, setApiKey] = createSignal(
    readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.apiKey, ""),
  );
  const [endpoint, setEndpoint] = createSignal(
    readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.endpoint, DEFAULT_AI_ENDPOINT),
  );
  const [model, setModel] = createSignal(
    readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.model, DEFAULT_AI_MODEL),
  );
  const [aiPrompts, setAiPrompts] = createSignal<DictionaryAIPrompt[]>(
    readPersistedAIPrompts(),
  );

  let messageListRef: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;
  let activeStreamCleanup: (() => void) | null = null;
  let latestMessageListSignature = "";

  const isLoading = createMemo(() => activeRequest() !== null);
  const hasUserMessages = createMemo(() =>
    messages().some((message) => message.role === "user"),
  );
  const statusLabel = createMemo(() => {
    switch (status()) {
      case "submitted":
        return "请求已发出";
      case "thinking":
        return "正在思考";
      case "streaming":
        return "正在流式输出";
      case "cancelling":
        return "正在中断";
      case "error":
        return "请求失败";
      default:
        return apiKey().trim() ? "DeepSeek 设置密钥" : "DeepSeek 后端 .env";
    }
  });
  const promptMention = createMemo(() => findPromptMention(input(), cursorPosition()));
  const promptSuggestions = createMemo(() => {
    const mention = promptMention();

    if (!mention) {
      return [];
    }

    const query = mention.query.toLowerCase();

    return aiPrompts()
      .filter((prompt) => {
        if (!query) {
          return true;
        }

        return (
          prompt.keyword.toLowerCase().includes(query) ||
          prompt.description.toLowerCase().includes(query)
        );
      })
      .slice(0, 8);
  });
  const activeInputPrompt = createMemo(
    () => resolvePromptInvocation(input(), aiPrompts()).prompt,
  );

  const updateAssistantMessage = (
    assistantMessageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === assistantMessageId ? updater(message) : message,
      ),
    );
  };

  const buildApiMessages = (nextMessages: ChatMessage[]) =>
    nextMessages
      .filter((message) => !message.isWelcome && message.content.trim())
      .map((message) => ({
        role: message.role,
        content: (message.apiContent ?? message.content).trim(),
      }));

  const updateInputSelection = (target: HTMLTextAreaElement) => {
    setCursorPosition(target.selectionStart ?? target.value.length);
  };

  const isMessageListNearBottom = () => {
    if (!messageListRef) {
      return true;
    }

    return (
      messageListRef.scrollHeight -
        messageListRef.scrollTop -
        messageListRef.clientHeight <=
      MESSAGE_LIST_BOTTOM_THRESHOLD
    );
  };

  const scrollMessageListToBottom = () => {
    if (messageListRef) {
      messageListRef.scrollTop = messageListRef.scrollHeight;
    }
  };

  const handleMessageListScroll = () => {
    setShouldStickToLatest(isMessageListNearBottom());
  };

  const handleMessageListWheel = () => {
    setShouldStickToLatest(false);
  };

  const choosePromptSuggestion = (prompt: DictionaryAIPrompt) => {
    const mention = promptMention();
    const currentInput = input();

    if (!mention) {
      const nextValue = `@${prompt.keyword} ${currentInput}`;
      const nextCursor = prompt.keyword.length + 2;

      setInput(nextValue);
      setCursorPosition(nextCursor);
      queueMicrotask(() => {
        inputRef?.focus();
        inputRef?.setSelectionRange(nextCursor, nextCursor);
      });
      return;
    }

    const nextValue = `${currentInput.slice(0, mention.start)}@${prompt.keyword} ${currentInput
      .slice(mention.end)
      .replace(/^\s+/, "")}`;
    const nextCursor = mention.start + prompt.keyword.length + 2;

    setInput(nextValue);
    setCursorPosition(nextCursor);
    queueMicrotask(() => {
      inputRef?.focus();
      inputRef?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const cleanupActiveStream = () => {
    activeStreamCleanup?.();
    activeStreamCleanup = null;
  };

  const finishActiveRequest = (requestId: string, nextStatus: ChatStatus) => {
    setActiveRequest((currentRequest) =>
      currentRequest?.requestId === requestId ? null : currentRequest,
    );
    setStatus(nextStatus);
  };

  const handleStreamPayload = (
    payload: DeepSeekStreamPayload,
    requestId: string,
    assistantMessageId: string,
  ) => {
    if (payload.requestId !== requestId) {
      return;
    }

    switch (payload.event) {
      case "started":
      case "keepAlive":
        setStatus("thinking");
        updateAssistantMessage(assistantMessageId, (message) => ({
          ...message,
          responseElapsedMs: payload.elapsedMs,
        }));
        return;
      case "reasoning":
        setStatus("thinking");
        updateAssistantMessage(assistantMessageId, (message) => ({
          ...message,
          reasoning: `${message.reasoning}${payload.content ?? ""}`,
          reasoningExpanded: true,
          thinkingElapsedMs: payload.elapsedMs,
          responseElapsedMs: payload.elapsedMs,
        }));
        return;
      case "content":
        setStatus("streaming");
        updateAssistantMessage(assistantMessageId, (message) => ({
          ...message,
          content: `${message.content}${payload.content ?? ""}`,
          thinkingElapsedMs:
            message.thinkingElapsedMs ??
            (message.content.trim() ? undefined : payload.elapsedMs),
          responseElapsedMs: payload.elapsedMs,
        }));
        return;
      case "done":
        updateAssistantMessage(assistantMessageId, (message) => ({
          ...message,
          content: message.content.trim() || "模型返回了空内容。",
          isStreaming: false,
          thinkingElapsedMs: message.thinkingElapsedMs ?? payload.elapsedMs,
          responseElapsedMs: payload.elapsedMs,
        }));
        finishActiveRequest(requestId, "idle");
        return;
      case "cancelled":
        updateAssistantMessage(assistantMessageId, (message) => ({
          ...message,
          content: message.content.trim() || "已中断本次聊天。",
          isStreaming: false,
          isCancelled: true,
          responseElapsedMs: payload.elapsedMs,
        }));
        finishActiveRequest(requestId, "idle");
        return;
      case "error": {
        const errorMessage = payload.error || "DeepSeek 请求失败。";
        setChatError(errorMessage);
        updateAssistantMessage(assistantMessageId, (message) => ({
          ...message,
          content: message.content.trim() || errorMessage,
          isStreaming: false,
          error: errorMessage,
          responseElapsedMs: payload.elapsedMs,
        }));
        finishActiveRequest(requestId, "error");
        return;
      }
    }
  };

  const stopActiveStream = (markCancelled = true) => {
    const currentRequest = activeRequest();

    if (!currentRequest) {
      return;
    }

    setStatus("cancelling");
    void invoke("deepseek_cancel_chat", { requestId: currentRequest.requestId });
    cleanupActiveStream();

    if (markCancelled) {
      updateAssistantMessage(currentRequest.assistantMessageId, (message) => ({
        ...message,
        content: message.content.trim() || "已中断本次聊天。",
        isStreaming: false,
        isCancelled: true,
        responseElapsedMs: message.responseElapsedMs,
      }));
    }

    setActiveRequest(null);
    setStatus("idle");
  };

  const sendPrompt = async (rawPrompt: string, resetFromIndex?: number) => {
    const prompt = rawPrompt.trim();

    if (!prompt) {
      return;
    }

    stopActiveStream();

    const requestId = createMessageId("deepseek-request");
    const assistantMessageId = createMessageId("assistant");
    const baseMessages =
      typeof resetFromIndex === "number"
        ? messages().slice(0, resetFromIndex)
        : messages();
    const promptInvocation = resolvePromptInvocation(prompt, aiPrompts());
    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content: prompt,
      apiContent: promptInvocation.apiContent,
      promptKeyword: promptInvocation.prompt.keyword,
      promptDescription: promptInvocation.prompt.description,
      reasoning: "",
      reasoningExpanded: false,
    };
    const assistantMessage = createAssistantMessage(assistantMessageId);
    const nextMessages = [...baseMessages, userMessage, assistantMessage];

    setShouldStickToLatest(true);
    setMessages(nextMessages);
    setInput("");
    setChatError("");
    setStatus("submitted");
    setActiveRequest({ requestId, assistantMessageId });

    let streamFinished = false;
    let cleanupStream: (() => void) | null = null;

    try {
      const unsubscribe = await listen<DeepSeekStreamPayload>(
        DEEPSEEK_STREAM_EVENT,
        (event) => {
          handleStreamPayload(event.payload, requestId, assistantMessageId);

          if (
            event.payload.requestId === requestId &&
            ["done", "cancelled", "error"].includes(event.payload.event)
          ) {
            streamFinished = true;
          }
        },
      );
      let isListenerActive = true;
      cleanupStream = () => {
        if (isListenerActive) {
          unsubscribe();
          isListenerActive = false;
        }
      };
      activeStreamCleanup = cleanupStream;

      if (activeRequest()?.requestId !== requestId) {
        cleanupStream();
        return;
      }

      await invoke("deepseek_chat_stream", {
        requestId,
        messages: buildApiMessages(nextMessages),
        endpoint: endpoint().trim() || DEFAULT_AI_ENDPOINT,
        model: model().trim() || DEFAULT_AI_MODEL,
        apiKey: apiKey().trim() || undefined,
        userId: DEEPSEEK_USER_ID,
      });
    } catch (error) {
      if (!streamFinished && activeRequest()?.requestId === requestId) {
        const errorMessage = normalizeError(error);
        setChatError(errorMessage);
        updateAssistantMessage(assistantMessageId, (message) => ({
          ...message,
          content: message.content.trim() || errorMessage,
          isStreaming: false,
          error: errorMessage,
        }));
        finishActiveRequest(requestId, "error");
      }
    } finally {
      if (cleanupStream) {
        if (activeStreamCleanup === cleanupStream) {
          activeStreamCleanup = null;
        }

        cleanupStream();
      }
    }
  };

  const submitCurrentInput = async () => {
    await sendPrompt(input());
  };

  const regenerateLastResponse = async () => {
    const currentMessages = messages();
    const lastUserIndex = findLastUserMessageIndex(currentMessages);

    if (lastUserIndex < 0) {
      return;
    }

    await sendPrompt(currentMessages[lastUserIndex].content, lastUserIndex);
  };

  const toggleReasoning = (messageId: string) => {
    updateAssistantMessage(messageId, (message) => ({
      ...message,
      reasoningExpanded: !message.reasoningExpanded,
    }));
  };

  const getThinkingElapsed = (message: ChatMessage) => {
    if (message.isStreaming && message.startedAt) {
      if (!message.content.trim()) {
        return Math.max(message.thinkingElapsedMs ?? 0, clockTick() - message.startedAt);
      }

      return message.thinkingElapsedMs ?? message.responseElapsedMs ?? 0;
    }

    return message.thinkingElapsedMs ?? message.responseElapsedMs ?? 0;
  };

  const shouldShowThinking = (message: ChatMessage) =>
    message.role === "assistant" &&
    !message.isWelcome &&
    (message.isStreaming || !!message.reasoning || !!message.thinkingElapsedMs);

  const assistantDisplayContent = (message: ChatMessage) => {
    if (message.content.trim()) {
      return message.content;
    }

    if (message.error) {
      return message.error;
    }

    if (message.isCancelled) {
      return "已中断本次聊天。";
    }

    return message.isStreaming ? "正在思考..." : "模型返回了空内容。";
  };

  const messageListSignature = createMemo(() =>
    messages()
      .map(
        (message) =>
          `${message.id}:${message.content.length}:${message.reasoning.length}:${
            message.isStreaming ? "1" : "0"
          }`,
      )
      .join("|"),
  );

  createEffect(() => {
    const nextSignature = messageListSignature();

    if (nextSignature === latestMessageListSignature) {
      return;
    }

    latestMessageListSignature = nextSignature;

    if (!shouldStickToLatest()) {
      return;
    }

    queueMicrotask(() => {
      scrollMessageListToBottom();
    });
  });

  createEffect(() => {
    promptMention();
    promptSuggestions();
    setSelectedPromptIndex(0);
  });

  createEffect(() => {
    const request = pendingAsk();

    if (!request || request.id === handledRequestId()) {
      return;
    }

    setHandledRequestId(request.id);
    void sendPrompt(request.prompt);
  });

  onMount(() => {
    const syncAiSettings = () => {
      setApiKey(readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.apiKey, ""));
      setEndpoint(
        readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.endpoint, DEFAULT_AI_ENDPOINT),
      );
      setModel(readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.model, DEFAULT_AI_MODEL));
      setAiPrompts(readPersistedAIPrompts());
    };
    const timerId = window.setInterval(() => setClockTick(Date.now()), 250);
    const unsubscribe = subscribeToDictionarySettings(syncAiSettings);

    onCleanup(() => {
      window.clearInterval(timerId);
      unsubscribe();
      stopActiveStream(false);
    });
  });

  return (
    <div class="flex h-full flex-col overflow-hidden rounded-xl border border-white/60 bg-white/70 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
      <div class="border-b border-slate-200/50 bg-white/40 p-3">
        <div class="flex items-center justify-between gap-3">
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

          <span class="rounded-full bg-slate-100/80 p-4 text-[13px] font-semibold text-slate-500">
            由软件设置中心配置
          </span>
        </div>

        <Show when={chatError()}>
          <div class="mt-4 flex items-center gap-2 rounded-xl border border-rose-200/60 bg-rose-50/80 p-4 text-[13px] font-medium text-rose-700">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            {chatError()}
          </div>
        </Show>
      </div>

      <div
        ref={messageListRef}
        class="min-h-0 flex-1 overflow-y-auto p-3"
        onScroll={handleMessageListScroll}
        onWheel={handleMessageListWheel}
      >
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
                    <span class="px-1 text-[12px] font-bold text-slate-400">
                      {message.role === "user" ? "YOU" : "ASSISTANT"}
                    </span>
                    <Show when={message.role === "user" && message.promptKeyword}>
                      <span
                        class="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500"
                        title={message.promptDescription || undefined}
                      >
                        @{message.promptKeyword}
                      </span>
                    </Show>
                    <Show when={message.isCancelled}>
                      <span class="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        STOPPED
                      </span>
                    </Show>
                  </div>

                  <Show when={shouldShowThinking(message)}>
                    <div class="rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-sky-900">
                      <button
                        type="button"
                        class="flex w-full items-center justify-between gap-3 text-left text-[12px] font-bold"
                        onClick={() => toggleReasoning(message.id)}
                      >
                        <span>{message.isStreaming && !message.content.trim() ? "正在思考" : "思考过程"}</span>
                        <span class="inline-flex items-center gap-2 text-sky-600">
                          {formatElapsed(getThinkingElapsed(message))}
                          <svg
                            class="transition-transform"
                            classList={{ "rotate-180": message.reasoningExpanded }}
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </span>
                      </button>

                      <Show when={message.reasoningExpanded}>
                        <div class="chat-thinking-markdown mt-2 max-h-52 overflow-y-auto border-t border-sky-100 pt-2 text-[13px] leading-relaxed text-sky-800">
                          <SolidMarkdown
                            class="chat-markdown"
                            children={message.reasoning || "等待推理内容..."}
                          />
                        </div>
                      </Show>
                    </div>
                  </Show>

                  <div
                    class="rounded-[20px] p-2"
                    classList={{
                      "rounded-tr-sm bg-indigo-600 text-white shadow-md shadow-indigo-600/20": message.role === "user",
                      "rounded-tl-sm border border-slate-200/60 bg-white text-slate-700 shadow-sm": message.role !== "user" && !message.error,
                      "rounded-tl-sm border border-rose-200/70 bg-rose-50 text-rose-700 shadow-sm": !!message.error,
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
                        children={assistantDisplayContent(message)}
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
          <Show when={promptMention() && promptSuggestions().length > 0}>
            <div class="absolute bottom-full left-3 right-3 z-20 mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
              <div class="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <span class="text-[11px] font-bold uppercase text-slate-400">Prompt</span>
                <span class="text-[11px] font-semibold text-slate-400">{promptSuggestions().length} 个</span>
              </div>
              <div class="max-h-64 overflow-y-auto p-1.5">
                <For each={promptSuggestions()}>
                  {(prompt, index) => (
                    <button
                      type="button"
                      class="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                      classList={{ "bg-indigo-50 text-indigo-900": index() === selectedPromptIndex() }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choosePromptSuggestion(prompt);
                      }}
                    >
                      <span class="min-w-0">
                        <span class="block truncate text-[13px] font-bold">@{prompt.keyword}</span>
                        <span class="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-slate-500">
                          {prompt.description || "无说明"}
                        </span>
                      </span>
                      <Show when={prompt.keyword === "chat"}>
                        <span class="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-400">
                          默认
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <textarea
            ref={inputRef}
            rows={3}
            value={input()}
            onInput={(event) => {
              setInput(event.currentTarget.value);
              updateInputSelection(event.currentTarget);
            }}
            onClick={(event) => updateInputSelection(event.currentTarget)}
            onKeyUp={(event) => updateInputSelection(event.currentTarget)}
            onKeyDown={(event) => {
              const suggestions = promptSuggestions();

              if (promptMention() && suggestions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelectedPromptIndex((current) => (current + 1) % suggestions.length);
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedPromptIndex(
                    (current) => (current - 1 + suggestions.length) % suggestions.length,
                  );
                  return;
                }

                if (event.key === "Tab" || event.key === "Enter") {
                  event.preventDefault();
                  choosePromptSuggestion(suggestions[selectedPromptIndex()] ?? suggestions[0]);
                  return;
                }
              }

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
              <span
                class="flex h-6 items-center rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500"
                title={activeInputPrompt().description || undefined}
              >
                @{activeInputPrompt().keyword}
              </span>
              <Show when={!apiKey().trim()}>
                <span class="flex h-6 items-center rounded-md bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700">
                  ENV
                </span>
              </Show>
            </div>

            <div class="flex items-center gap-2">
              <Show when={hasUserMessages() && !isLoading()}>
                <button
                  type="button"
                  class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  title="重新生成"
                  onClick={() => void regenerateLastResponse()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
              </Show>

              <Show when={isLoading()}>
                <button
                  type="button"
                  class="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-400 transition hover:bg-rose-100 hover:text-rose-600"
                  title="中断本次聊天"
                  onClick={() => stopActiveStream()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
                </button>
              </Show>

              <button
                type="submit"
                class="flex h-10 items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 text-[14px] font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                disabled={!input().trim() || isLoading()}
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
