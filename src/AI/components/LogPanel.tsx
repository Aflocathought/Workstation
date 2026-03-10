import { For } from "solid-js";
import type { Accessor } from "solid-js";

interface LogPanelProps {
  logs: Accessor<string[]>;
}

const LogPanel = (props: LogPanelProps) => {
  return (
    <div class="wf-panel wf-panel--logs">
      <strong>执行回传日志</strong>
      <For each={props.logs()}>{(line) => <div class="wf-log-line">{line}</div>}</For>
    </div>
  );
};

export default LogPanel;
