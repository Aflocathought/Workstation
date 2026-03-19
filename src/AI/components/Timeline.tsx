/**
 * 工作流时间线面板
 *
 * 显示当前工作流的保存历史快照：
 * - 时间戳
 * - 缩略图预览
 * - 点击可恢复到该快照
 */

import { createSignal, For, Show } from "solid-js";

interface TimelineEntry {
  id: string;
  label: string;
  timestamp: number;
  thumbnail?: string;
  nodeCount: number;
  edgeCount: number;
}

interface TimelineProps {
  entries: () => TimelineEntry[];
  onRestore: (entry: TimelineEntry) => void;
  onClose: () => void;
}

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

const fmtDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const Timeline = (props: TimelineProps) => {
  const [confirmId, setConfirmId] = createSignal<string | null>(null);

  const handleRestore = (entry: TimelineEntry) => {
    if (confirmId() === entry.id) {
      props.onRestore(entry);
      setConfirmId(null);
    } else {
      setConfirmId(entry.id);
      // 3 秒后自动取消确认
      setTimeout(() => setConfirmId((v) => (v === entry.id ? null : v)), 3000);
    }
  };

  return (
    <div class="wf-timeline">
      <div class="wf-timeline__header">
        <strong>📜 时间线</strong>
        <button class="wf-timeline__close" onClick={props.onClose}>✕</button>
      </div>
      <div class="wf-timeline__list">
        <Show
          when={props.entries().length > 0}
          fallback={<div class="wf-timeline__empty">暂无历史记录</div>}
        >
          <For each={props.entries()}>
            {(entry) => (
              <div
                class="wf-timeline__entry"
                classList={{ "wf-timeline__entry--confirm": confirmId() === entry.id }}
              >
                <Show when={entry.thumbnail}>
                  <img class="wf-timeline__thumb" src={entry.thumbnail} alt="" />
                </Show>
                <div class="wf-timeline__info">
                  <span class="wf-timeline__label">{entry.label}</span>
                  <span class="wf-timeline__time" title={fmtDate(entry.timestamp)}>
                    {fmtTime(entry.timestamp)}
                  </span>
                  <span class="wf-timeline__meta">
                    {entry.nodeCount} 节点 · {entry.edgeCount} 连线
                  </span>
                </div>
                <button
                  class="wf-timeline__restore-btn"
                  onClick={() => handleRestore(entry)}
                >
                  {confirmId() === entry.id ? "确认恢复?" : "恢复"}
                </button>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default Timeline;
export type { TimelineEntry };
