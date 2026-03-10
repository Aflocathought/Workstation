import { For, Show } from "solid-js";
import type { Accessor } from "solid-js";
import type { CompileResult } from "../workflow/graph-compiler";

interface ScriptPreviewProps {
  compiledScript: Accessor<CompileResult | null>;
  onClose: () => void;
}

const ScriptPreview = (props: ScriptPreviewProps) => {
  return (
    <div class="wf-panel wf-panel--script">
      <div
        style={{
          display: "flex",
          "justify-content": "space-between",
          "align-items": "center",
        }}
      >
        <strong>编译脚本预览</strong>
        <button
          class="wf-btn"
          style={{ padding: "2px 8px", "font-size": "11px" }}
          onClick={props.onClose}
        >
          ✕
        </button>
      </div>
      <Show when={props.compiledScript()?.success}>
        <div style={{ "font-size": "10px", color: "#6b7280" }}>
          执行顺序: {props.compiledScript()!.executionOrder.join(" → ")}
        </div>
        <pre>{props.compiledScript()!.script}</pre>
      </Show>
      <Show when={props.compiledScript() && !props.compiledScript()!.success}>
        <div class="wf-script-errors">
          <For each={props.compiledScript()!.errors}>
            {(err) => <div>❌ {err}</div>}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ScriptPreview;
