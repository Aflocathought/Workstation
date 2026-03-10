import { For, Show } from "solid-js";
import {
  Handle,
  type NodeProps,
  useSolidFlow,
  useUpdateNodeInternals,
} from "@dschz/solid-flow";

import {
  type WorkflowNodeInstanceData,
  type NodeStatus,
  type PortDefinition,
  type ParamDefinition,
  NodeCategory,
  getPortColor,
} from "../workflow/types";

import { getNodeDefinition } from "../workflow/node-registry";

const NODE_TYPE = "workflow-card";

const statusText: Record<NodeStatus, string> = {
  idle: "空闲",
  queued: "排队中",
  running: "执行中",
  success: "完成",
  error: "失败",
  skipped: "跳过",
};

const WorkflowCardNode = (props: NodeProps<WorkflowNodeInstanceData, typeof NODE_TYPE>) => {
  const { updateNodeData } = useSolidFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const definition = () => getNodeDefinition(props.data.definitionType);

  const inputPorts = (): PortDefinition[] => {
    const def = definition();
    if (!def) return [];
    return def.inputs.filter((p) => props.data.inputPortIds.includes(p.id));
  };

  const outputPorts = (): PortDefinition[] => {
    const def = definition();
    if (!def) return [];
    return def.outputs.filter((p) => props.data.outputPortIds.includes(p.id));
  };

  const category = () => definition()?.category ?? NodeCategory.CONFIG;

  const updateParam = (key: string, value: unknown) => {
    updateNodeData(props.id, {
      paramValues: { ...props.data.paramValues, [key]: value },
    });
  };

  const addPort = (direction: "input" | "output") => {
    const def = definition();
    if (!def?.dynamicPorts) return;

    const current = direction === "input" ? props.data.inputPortIds : props.data.outputPortIds;
    const prefix = direction === "input" ? "dyn-in" : "dyn-out";
    const newId = `${prefix}-${current.length}`;
    const next = [...current, newId];
    updateNodeData(props.id, direction === "input" ? { inputPortIds: next } : { outputPortIds: next });
    updateNodeInternals(props.id);
  };

  const renderParam = (param: ParamDefinition) => {
    if (param.advanced) return null;

    const value = () => props.data.paramValues[param.key] ?? param.defaultValue;

    switch (param.widget) {
      case "select":
        return (
          <label>
            {param.label}
            <select
              class="nodrag"
              value={String(value())}
              onChange={(e) => updateParam(param.key, e.currentTarget.value)}
            >
              <For each={param.options ?? []}>
                {(opt) => <option value={String(opt.value)}>{opt.label}</option>}
              </For>
            </select>
          </label>
        );
      case "boolean":
        return (
          <label class="wf-param-checkbox">
            <input
              class="nodrag"
              type="checkbox"
              checked={Boolean(value())}
              onChange={(e) => updateParam(param.key, e.currentTarget.checked)}
            />
            {param.label}
          </label>
        );
      case "number":
      case "slider":
        return (
          <label>
            {param.label}
            <input
              class="nodrag"
              type="number"
              min={param.validation?.min}
              max={param.validation?.max}
              step={param.validation?.step ?? 1}
              value={Number(value())}
              onInput={(e) => updateParam(param.key, Number(e.currentTarget.value))}
            />
          </label>
        );
      case "file":
      case "string":
      default:
        return (
          <label>
            {param.label}
            <input
              class="nodrag"
              value={String(value() ?? "")}
              onInput={(e) => updateParam(param.key, e.currentTarget.value)}
            />
          </label>
        );
    }
  };

  const portTopOffset = (index: number) => `${104 + index * 22}px`;

  return (
    <div class={`wf-node wf-node--${category()}`}>
      <div class="wf-node__header">
        <span>
          <span class="wf-node__icon">{definition()?.icon ?? "🔲"}</span>
          {props.data.title}
        </span>
        <span class={`wf-status wf-status--${props.data.status}`}>
          {statusText[props.data.status]}
        </span>
      </div>

      <div class="wf-node__meta">
        <span>{definition()?.label ?? props.data.definitionType}</span>
        <span>{props.id}</span>
      </div>

      <div class="wf-node__description">{definition()?.description ?? ""}</div>

      <Show when={props.data.status === "running" && props.data.progress > 0}>
        <div class="wf-node__progress-bar">
          <div
            class="wf-node__progress-fill"
            style={{ width: `${Math.round(props.data.progress * 100)}%` }}
          />
        </div>
      </Show>

      <Show when={props.data.statusMessage}>
        <div class="wf-node__description" style={{ "font-style": "italic", color: "#6b7280" }}>
          {props.data.statusMessage}
        </div>
      </Show>

      <Show when={definition()?.params.length}>
        <div class="wf-node__params">
          <For each={definition()!.params.filter((p) => !p.advanced)}>
            {(param) => renderParam(param)}
          </For>
        </div>
      </Show>

      <Show when={props.data.lastMetrics && Object.keys(props.data.lastMetrics).length > 0}>
        <div class="wf-node__metrics">
          <For each={Object.entries(props.data.lastMetrics!)}>
            {([k, v]) => (
              <span>
                {k}: {typeof v === "number" ? v.toFixed(4) : v}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={definition()?.dynamicPorts}>
        <div class="wf-node__port-actions">
          <button class="nodrag" onClick={() => addPort("input")}>
            + 输入
          </button>
          <button class="nodrag" onClick={() => addPort("output")}>
            + 输出
          </button>
        </div>
      </Show>

      <For each={inputPorts()}>
        {(port, index) => (
          <>
            <Handle
              type="target"
              position="left"
              id={`in-${port.id}`}
              style={{
                top: portTopOffset(index()),
                background: getPortColor(port.dataType),
                width: "10px",
                height: "10px",
                border: "2px solid #fff",
                "box-shadow": `0 0 3px ${getPortColor(port.dataType)}`,
              }}
              aria-label={`${props.id}-in-${port.id}`}
            />
            <span
              class="wf-port-label wf-port-label--left"
              style={{ top: `${104 + index() * 22 - 6}px` }}
            >
              {port.label}
            </span>
          </>
        )}
      </For>

      <For each={outputPorts()}>
        {(port, index) => (
          <>
            <Handle
              type="source"
              position="right"
              id={`out-${port.id}`}
              style={{
                top: portTopOffset(index()),
                background: getPortColor(port.dataType),
                width: "10px",
                height: "10px",
                border: "2px solid #fff",
                "box-shadow": `0 0 3px ${getPortColor(port.dataType)}`,
              }}
              aria-label={`${props.id}-out-${port.id}`}
            />
            <span
              class="wf-port-label wf-port-label--right"
              style={{ top: `${104 + index() * 22 - 6}px` }}
            >
              {port.label}
            </span>
          </>
        )}
      </For>
    </div>
  );
};

export { WorkflowCardNode, NODE_TYPE, statusText };
