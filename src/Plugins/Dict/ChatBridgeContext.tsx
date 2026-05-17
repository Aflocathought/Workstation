import {
  type Accessor,
  type ParentComponent,
  createContext,
  createSignal,
  useContext,
} from "solid-js";

export type AskAiRequest = {
  id: number;
  selectedText: string;
  prompt: string;
};

type ChatBridgeContextValue = {
  pendingAsk: Accessor<AskAiRequest | null>;
  requestAskAi: (selectedText: string) => void;
};

const ChatBridgeContext = createContext<ChatBridgeContextValue>();

export const ChatBridgeProvider: ParentComponent = (props) => {
  const [pendingAsk, setPendingAsk] = createSignal<AskAiRequest | null>(null);

  const requestAskAi = (selectedText: string) => {
    const normalizedText = selectedText.trim();

    if (!normalizedText) {
      return;
    }

    // 左侧只负责发出一个“学习请求”，右侧侧边栏统一消费该请求并调用 useChat。
    setPendingAsk({
      id: Date.now(),
      selectedText: normalizedText,
      prompt: `请详细解释这段外语的用法，并给出例句：${normalizedText}`,
    });
  };

  return (
    <ChatBridgeContext.Provider value={{ pendingAsk, requestAskAi }}>
      {props.children}
    </ChatBridgeContext.Provider>
  );
};

export function useChatBridge() {
  const context = useContext(ChatBridgeContext);

  if (!context) {
    throw new Error("useChatBridge 必须在 ChatBridgeProvider 内使用");
  }

  return context;
}