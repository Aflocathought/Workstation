/**
 * 工作流撤销/重做 (Undo / Redo) 历史管理
 *
 * 维护一个 FlowSnapshot 栈，支持：
 * - push：记录新快照（来自图变化）
 * - undo / redo：前进后退
 * - Ctrl+Z / Ctrl+Shift+Z 快捷键
 */

import { createSignal, onCleanup, onMount } from "solid-js";
import type { FlowSnapshot } from "./workflow-store";

const MAX_HISTORY = 80;
// 防抖间隔（ms）：只有间隔超过此值的变更才入栈
const DEBOUNCE_MS = 400;

export interface HistoryAPI {
  /** 当前快照 */
  current: () => FlowSnapshot | null;
  /** 推入新快照 */
  push: (snap: FlowSnapshot) => void;
  /** 撤销 */
  undo: () => FlowSnapshot | null;
  /** 重做 */
  redo: () => FlowSnapshot | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export function createHistory(initialSnapshot?: FlowSnapshot | null): HistoryAPI {
  // 历史栈 & 指针
  const stack: FlowSnapshot[] = initialSnapshot ? [initialSnapshot] : [];
  let pointer = stack.length - 1;

  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);

  // 是否正在通过 undo/redo 恢复（跳过 push）
  let restoring = false;
  let debounceTimer: number | undefined;

  const sync = () => {
    setCanUndo(pointer > 0);
    setCanRedo(pointer < stack.length - 1);
  };

  const current = () => (pointer >= 0 ? stack[pointer] : null);

  const push = (snap: FlowSnapshot) => {
    if (restoring) return;

    // 防抖：清除等待中的 timer
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      // 截断 redo 分支
      stack.splice(pointer + 1);
      stack.push(snap);
      if (stack.length > MAX_HISTORY) stack.shift();
      pointer = stack.length - 1;
      sync();
      debounceTimer = undefined;
    }, DEBOUNCE_MS);
  };

  const undo = (): FlowSnapshot | null => {
    if (pointer <= 0) return null;
    restoring = true;
    pointer--;
    sync();
    const snap = stack[pointer];
    // 下一个微任务解除 restoring 标记（避免同步 push 被拦截）
    queueMicrotask(() => { restoring = false; });
    return snap;
  };

  const redo = (): FlowSnapshot | null => {
    if (pointer >= stack.length - 1) return null;
    restoring = true;
    pointer++;
    sync();
    const snap = stack[pointer];
    queueMicrotask(() => { restoring = false; });
    return snap;
  };

  // 初始同步
  sync();

  return { current, push, undo, redo, canUndo, canRedo };
}

/**
 * 绑定 Ctrl+Z / Ctrl+Shift+Z 到 undo/redo 回调。
 * 请在 SolidJS 组件内调用（依赖 onMount / onCleanup）。
 */
export function bindUndoRedoKeys(
  onUndo: () => void,
  onRedo: () => void,
) {
  const handler = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    // 避免与浏览器/Tauri 内建 undo 冲突
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

    e.preventDefault();
    if (e.shiftKey) {
      onRedo();
    } else {
      onUndo();
    }
  };

  onMount(() => window.addEventListener("keydown", handler));
  onCleanup(() => window.removeEventListener("keydown", handler));
}
