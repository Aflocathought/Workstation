import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { type Node, useSolidFlow, useUpdateNodeInternals } from "@dschz/solid-flow";
import { type WorkflowNodeInstanceData, type NodeStatus } from "../workflow/types";
import { getNodeDefinition } from "../workflow/node-registry";
import { statusText } from "./WorkflowCardNode";

interface NodeInspectorProps {
  selectedNode: () => Node<WorkflowNodeInstanceData, string> | undefined;
  onUpdateMeta: (field: "title" | "statusMessage", value: string) => void;
}

type NodeDebugSnapshot = {
  viewportTransform: string;
  viewportZoom: string;
  devicePixelRatio: string;
  visualViewportScale: string;
  wrapperOffset: string;
  wrapperRect: string;
  cardOffset: string;
  cardRect: string;
  handleOffset: string;
  handleRect: string;
  handleRelative: string;
};

const emptyDebugSnapshot = (): NodeDebugSnapshot => ({
  viewportTransform: "-",
  viewportZoom: "-",
  devicePixelRatio: String(window.devicePixelRatio || 1),
  visualViewportScale: String(window.visualViewport?.scale ?? 1),
  wrapperOffset: "-",
  wrapperRect: "-",
  cardOffset: "-",
  cardRect: "-",
  handleOffset: "-",
  handleRect: "-",
  handleRelative: "-",
});

const formatSize = (width?: number, height?: number) =>
  width !== undefined && height !== undefined ? `${Math.round(width)} x ${Math.round(height)}` : "-";

const formatPoint = (x?: number, y?: number) =>
  x !== undefined && y !== undefined ? `${Math.round(x)}, ${Math.round(y)}` : "-";

const NodeInspector = (props: NodeInspectorProps) => {
  const { updateNodeData, fitView } = useSolidFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [debugInfo, setDebugInfo] = createSignal<NodeDebugSnapshot>(emptyDebugSnapshot());

  const refreshDebugInfo = () => {
    const selected = props.selectedNode();
    if (!selected) {
      setDebugInfo(emptyDebugSnapshot());
      return;
    }

    const wrapper = document.querySelector(
      `.solid-flow__node[data-id="${selected.id}"]`,
    ) as HTMLDivElement | null;

    if (!wrapper) {
      setDebugInfo(emptyDebugSnapshot());
      return;
    }

    const card = wrapper.querySelector(".wf-node") as HTMLDivElement | null;
    const handle = wrapper.querySelector(".solid-flow__handle") as HTMLDivElement | null;
    const viewport = wrapper.closest(".solid-flow__viewport") as HTMLDivElement | null;

    const viewportTransform = viewport ? getComputedStyle(viewport).transform : "none";
    const viewportMatrix =
      viewport && viewportTransform && viewportTransform !== "none"
        ? new DOMMatrixReadOnly(viewportTransform)
        : null;

    const wrapperRect = wrapper.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    const handleRect = handle?.getBoundingClientRect();

    setDebugInfo({
      viewportTransform,
      viewportZoom: viewportMatrix ? String(viewportMatrix.m22) : "1",
      devicePixelRatio: String(window.devicePixelRatio || 1),
      visualViewportScale: String(window.visualViewport?.scale ?? 1),
      wrapperOffset: formatSize(wrapper.offsetWidth, wrapper.offsetHeight),
      wrapperRect: formatSize(wrapperRect.width, wrapperRect.height),
      cardOffset: card ? formatSize(card.offsetWidth, card.offsetHeight) : "-",
      cardRect: cardRect ? formatSize(cardRect.width, cardRect.height) : "-",
      handleOffset: handle ? formatSize(handle.offsetWidth, handle.offsetHeight) : "-",
      handleRect: handleRect ? formatSize(handleRect.width, handleRect.height) : "-",
      handleRelative: handleRect
        ? formatPoint(handleRect.left - wrapperRect.left, handleRect.top - wrapperRect.top)
        : "-",
    });
  };

  createEffect(() => {
    props.selectedNode()?.id;
    refreshDebugInfo();

    const intervalId = window.setInterval(refreshDebugInfo, 500);
    onCleanup(() => window.clearInterval(intervalId));
  });

  return (
    <div class="wf-panel wf-panel--inspect">
      <strong>节点详情</strong>
      <Show when={props.selectedNode()} fallback={<span>未选中节点</span>}>
        {(node) => {
          const def = () => getNodeDefinition(node().data.definitionType);
          return (
            <>
              <div class="wf-kv">
                <span>ID</span>
                <span>{node().id}</span>
              </div>
              <div class="wf-kv">
                <span>类型</span>
                <span>
                  {def()?.icon} {def()?.label ?? node().data.definitionType}
                </span>
              </div>
              <div class="wf-kv">
                <span>状态</span>
                <span class={`wf-status wf-status--${node().data.status}`}>
                  {statusText[node().data.status]}
                </span>
              </div>
              <label>
                标题
                <input
                  class="nodrag"
                  value={node().data.title}
                  onInput={(e) => props.onUpdateMeta("title", e.currentTarget.value)}
                />
              </label>

              <Show when={def()}>
                <div style={{ "font-size": "11px", color: "#6b7280" }}>
                  <div>
                    输入:{" "}
                    {def()!
                      .inputs.map((p) => `${p.label}(${p.dataType})`)
                      .join(", ") || "无"}
                  </div>
                  <div>
                    输出:{" "}
                    {def()!
                      .outputs.map((p) => `${p.label}(${p.dataType})`)
                      .join(", ") || "无"}
                  </div>
                </div>
              </Show>

              <Show when={def()?.params.filter((p) => p.advanced).length}>
                <strong style={{ "font-size": "11px", "margin-top": "6px" }}>
                  高级参数
                </strong>
                <div class="wf-node__params">
                  <For each={def()!.params.filter((p) => p.advanced)}>
                    {(param) => {
                      const value = () =>
                        node().data.paramValues[param.key] ?? param.defaultValue;
                      return (
                        <label>
                          {param.label}
                          <input
                            class="nodrag"
                            type={
                              param.widget === "number" || param.widget === "slider"
                                ? "number"
                                : "text"
                            }
                            value={String(value() ?? "")}
                            onInput={(e) => {
                              const v =
                                param.widget === "number" || param.widget === "slider"
                                  ? Number(e.currentTarget.value)
                                  : param.widget === "boolean"
                                    ? e.currentTarget.value === "true"
                                    : e.currentTarget.value;
                              updateNodeData(node().id, {
                                paramValues: { ...node().data.paramValues, [param.key]: v },
                              });
                            }}
                          />
                        </label>
                      );
                    }}
                  </For>
                </div>
              </Show>

              <Show when={node().data.lastMetrics}>
                <strong style={{ "font-size": "11px", "margin-top": "6px" }}>
                  最近指标
                </strong>
                <For each={Object.entries(node().data.lastMetrics!)}>
                  {([k, v]) => (
                    <div class="wf-kv">
                      <span>{k}</span>
                      <span>{typeof v === "number" ? v.toFixed(6) : v}</span>
                    </div>
                  )}
                </For>
              </Show>

              <strong style={{ "font-size": "11px", "margin-top": "8px" }}>
                运行时诊断
              </strong>
              <div class="wf-panel__btn-row">
                <button
                  class="wf-btn wf-btn--ghost"
                  onClick={() => {
                    updateNodeInternals(node().id);
                    refreshDebugInfo();
                  }}
                >
                  重新测量节点
                </button>
                <button
                  class="wf-btn wf-btn--ghost"
                  onClick={() => {
                    void fitView({ padding: 0.25 });
                    window.setTimeout(refreshDebugInfo, 50);
                  }}
                >
                  重算视图
                </button>
              </div>
              <div class="wf-debug-grid">
                <div class="wf-kv">
                  <span>viewport zoom</span>
                  <span>{debugInfo().viewportZoom}</span>
                </div>
                <div class="wf-kv">
                  <span>dpr / vv scale</span>
                  <span>
                    {debugInfo().devicePixelRatio} / {debugInfo().visualViewportScale}
                  </span>
                </div>
                <div class="wf-kv">
                  <span>wrapper offset</span>
                  <span>{debugInfo().wrapperOffset}</span>
                </div>
                <div class="wf-kv">
                  <span>wrapper rect</span>
                  <span>{debugInfo().wrapperRect}</span>
                </div>
                <div class="wf-kv">
                  <span>card offset</span>
                  <span>{debugInfo().cardOffset}</span>
                </div>
                <div class="wf-kv">
                  <span>card rect</span>
                  <span>{debugInfo().cardRect}</span>
                </div>
                <div class="wf-kv">
                  <span>handle offset</span>
                  <span>{debugInfo().handleOffset}</span>
                </div>
                <div class="wf-kv">
                  <span>handle rect</span>
                  <span>{debugInfo().handleRect}</span>
                </div>
                <div class="wf-kv">
                  <span>handle relative</span>
                  <span>{debugInfo().handleRelative}</span>
                </div>
              </div>
              <div class="wf-debug-transform">{debugInfo().viewportTransform}</div>
            </>
          );
        }}
      </Show>
    </div>
  );
};

export default NodeInspector;
