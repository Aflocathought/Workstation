import { createMemo, createSignal, Show, onMount, createEffect, onCleanup } from "solid-js";
import {
  addEdge,
  Background,
  Controls,
  createEdgeStore,
  createNodeStore,
  MiniMap,
  type Node,
  type NodeTypes,
  Panel,
  SolidFlow,
  useSolidFlow,
} from "@dschz/solid-flow";

import type { FlowSnapshot } from "./workflow/workflow-store";
import { getTimeline } from "./workflow/workflow-store";
import { createHistory, bindUndoRedoKeys } from "./workflow/history";
import { captureWorkflowThumbnail } from "./workflow/screenshot";

import {
  type WorkflowNodeInstanceData,
  type NodeStatus,
  areTypesCompatible,
} from "./workflow/types";
import {
  getNodeDefinition,
  createDefaultInstanceData,
} from "./workflow/node-registry";
import {
  compileGraph,
  validateGraph,
  solidFlowToSerializedGraph,
  type CompileResult,
} from "./workflow/graph-compiler";

import { WorkflowCardNode, NODE_TYPE } from "./components/WorkflowCardNode";
import NodeCatalog from "./components/NodeCatalog";
import NodeInspector from "./components/NodeInspector";
import LogPanel from "./components/LogPanel";
import ScriptPreview from "./components/ScriptPreview";
import Timeline, { type TimelineEntry } from "./components/Timeline";

// ─── Node Types ──────────────────────────────────────────

const nodeTypes = {
  [NODE_TYPE]: WorkflowCardNode,
} satisfies NodeTypes;

// ─── Initial Nodes & Edges ──────────────────────────────

function makeInitialNode(
  id: string,
  defType: string,
  position: { x: number; y: number },
  paramOverrides?: Record<string, unknown>,
): Node<WorkflowNodeInstanceData, typeof NODE_TYPE> {
  const data = createDefaultInstanceData(defType)!;
  if (paramOverrides) {
    Object.assign(data.paramValues, paramOverrides);
  }
  return { id, type: NODE_TYPE, position, data };
}

const initialNodes: Node<WorkflowNodeInstanceData, typeof NODE_TYPE>[] = [
  makeInitialNode("data-1", "data_source", { x: 40, y: 90 }, {
    data_path: "./data/train.csv",
    target_column: "close",
  }),
  makeInitialNode("config-1", "config", { x: 40, y: 400 }, {
    model_name: "my_lstm",
    epochs: 100,
    batch_size: 32,
  }),
  makeInitialNode("model-1", "model_builder", { x: 390, y: 60 }, {
    architecture: "lstm",
    units: 64,
  }),
  makeInitialNode("train-1", "trainer", { x: 750, y: 60 }),
  makeInitialNode("eval-1", "evaluator", { x: 1100, y: 60 }),
  makeInitialNode("output-1", "output_manager", { x: 1450, y: 60 }),
];

const initialEdges = [
  { id: "e-data-model", source: "data-1", sourceHandle: "out-dataset", target: "model-1", targetHandle: "in-dataset", animated: true },
  { id: "e-config-model", source: "config-1", sourceHandle: "out-config", target: "model-1", targetHandle: "in-config", animated: true },
  { id: "e-model-train", source: "model-1", sourceHandle: "out-model", target: "train-1", targetHandle: "in-model", animated: true },
  { id: "e-data-train", source: "data-1", sourceHandle: "out-dataset", target: "train-1", targetHandle: "in-dataset", animated: true },
  { id: "e-config-train", source: "config-1", sourceHandle: "out-config", target: "train-1", targetHandle: "in-config", animated: true },
  { id: "e-train-eval", source: "train-1", sourceHandle: "out-checkpoint", target: "eval-1", targetHandle: "in-model", animated: true },
  { id: "e-data-eval", source: "data-1", sourceHandle: "out-dataset", target: "eval-1", targetHandle: "in-dataset", animated: true },
  { id: "e-eval-output", source: "eval-1", sourceHandle: "out-metrics", target: "output-1", targetHandle: "in-metrics", animated: true },
];

// ─── Utilities ───────────────────────────────────────────

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── Props ───────────────────────────────────────────────

interface AIPageProps {
  initialFlowData: FlowSnapshot | null;
  workflowName: string;
  workflowId: string | null;
  isDirty: boolean;
  onFlowChange: (snapshot: FlowSnapshot) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onBackToPortal: () => void;
  /** 用于截图后保存缩略图 */
  onThumbnailCaptured?: (dataUrl: string) => void;
}

// ─── Main Component ──────────────────────────────────────

const AIPage = (props: AIPageProps) => {
  // 如果有外部传入的 flowData 就用它，否则用默认示例
  const initNodes = (props.initialFlowData?.nodes as Node<WorkflowNodeInstanceData, typeof NODE_TYPE>[] | undefined) ?? initialNodes;
  const initEdges = (props.initialFlowData?.edges as typeof initialEdges | undefined) ?? initialEdges;

  const [nodes, setNodes] = createNodeStore<typeof nodeTypes>(initNodes);
  const [edges, setEdges] = createEdgeStore(initEdges);

  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>("config-1");
  const [taskPayload, setTaskPayload] = createSignal("");
  const [logs, setLogs] = createSignal<string[]>(["系统启动完成，等待任务..."]);
  const [isRunning, setIsRunning] = createSignal(false);
  const [showCatalog, setShowCatalog] = createSignal(false);
  const [compiledScript, setCompiledScript] = createSignal<CompileResult | null>(null);
  const [showScript, setShowScript] = createSignal(false);
  const [showTimeline, setShowTimeline] = createSignal(false);
  const [timelineEntries, setTimelineEntries] = createSignal<TimelineEntry[]>([]);

  const { addNodes, fitView, toObject, updateNodeData } = useSolidFlow();

  // ── Undo / Redo 历史 ──────────────────────────────

  const history = createHistory(props.initialFlowData);

  const restoreSnapshot = (snap: FlowSnapshot) => {
    const n = snap.nodes as Node<WorkflowNodeInstanceData, typeof NODE_TYPE>[];
    const e = snap.edges as typeof initialEdges;
    setNodes(n);
    setEdges(e);
    reportChange();
    appendLog("已恢复到历史快照");
  };

  const handleUndo = () => {
    const snap = history.undo();
    if (snap) restoreSnapshot(snap);
  };

  const handleRedo = () => {
    const snap = history.redo();
    if (snap) restoreSnapshot(snap);
  };

  bindUndoRedoKeys(handleUndo, handleRedo);

  // ── 时间线 ────────────────────────────────────────

  const refreshTimeline = () => {
    if (!props.workflowId) {
      setTimelineEntries([]);
      return;
    }
    const snapshots = getTimeline(props.workflowId);
    setTimelineEntries(
      snapshots.map((s) => ({
        id: s.id,
        label: s.label,
        timestamp: s.timestamp,
        thumbnail: s.thumbnail,
        nodeCount: s.nodeCount,
        edgeCount: s.edgeCount,
      })),
    );
  };

  const handleTimelineRestore = (entry: TimelineEntry) => {
    if (!props.workflowId) return;
    const snapshots = getTimeline(props.workflowId);
    const snap = snapshots.find((s) => s.id === entry.id);
    if (!snap) return;
    restoreSnapshot(snap.flowData);
    appendLog(`已恢复到时间线快照: ${entry.label}`);
  };

  // ── 截图 ──────────────────────────────────────────

  const takeScreenshot = async () => {
    const dataUrl = await captureWorkflowThumbnail();
    if (dataUrl) {
      props.onThumbnailCaptured?.(dataUrl);
    }
    return dataUrl;
  };

  // ── 变更上报（节点/边变化时通知容器） ──────────

  const reportChange = () => {
    const obj = toObject();
    const snap: FlowSnapshot = {
      nodes: obj.nodes as unknown[],
      edges: obj.edges as unknown[],
      viewport: obj.viewport,
    };
    props.onFlowChange(snap);
    history.push(snap);
  };

  // 统一监听图变化（含参数编辑），做一次防抖上报，保证持久化完整。
  let reportTimer: number | undefined;
  const scheduleReportChange = () => {
    if (reportTimer !== undefined) {
      window.clearTimeout(reportTimer);
    }
    reportTimer = window.setTimeout(() => {
      reportChange();
      reportTimer = undefined;
    }, 120);
  };

  createEffect(() => {
    // 读取依赖：节点位置/参数/连线变化都纳入追踪。
    const nodeDigest = nodes.map((n) => ({
      id: n.id,
      position: n.position,
      data: n.data,
    }));
    const edgeDigest = edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
    }));
    void nodeDigest;
    void edgeDigest;
    scheduleReportChange();
  });

  onCleanup(() => {
    if (reportTimer !== undefined) {
      window.clearTimeout(reportTimer);
    }
  });

  // 初始加载后如果有 viewport 信息则恢复
  onMount(() => {
    if (props.initialFlowData?.viewport) {
      // fitView 会覆盖 viewport，如果有保存的 viewport 就不 fitView
    } else {
      void fitView({ padding: 0.25 });
    }

    // 首次进入画布就上报一次快照，确保“新建后立即保存”也有数据可存。
    queueMicrotask(reportChange);
    // 打开时如果没有缩略图，延迟截一张
    setTimeout(() => void takeScreenshot(), 800);

    // 加载时间线
    refreshTimeline();  });

  const selectedNode = createMemo(
    () =>
      nodes.find((node) => node.id === selectedNodeId()) as
        | Node<WorkflowNodeInstanceData, typeof NODE_TYPE>
        | undefined,
  );

  const appendLog = (text: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${stamp}] ${text}`, ...prev].slice(0, 14));
  };

  const setNodeStatus = (id: string, status: NodeStatus) => {
    updateNodeData(id, () => ({ status }));
  };

  // ── 连接类型检查 ──────────────────────────────────

  const checkConnectionCompatibility = (
    sourceNodeId: string,
    sourceHandleId: string,
    targetNodeId: string,
    targetHandleId: string,
  ): { compatible: boolean; message: string } => {
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!sourceNode || !targetNode) return { compatible: false, message: "节点不存在" };

    const sourceDef = getNodeDefinition((sourceNode.data as WorkflowNodeInstanceData).definitionType);
    const targetDef = getNodeDefinition((targetNode.data as WorkflowNodeInstanceData).definitionType);
    if (!sourceDef || !targetDef) return { compatible: false, message: "节点定义不存在" };

    const sourcePortId = sourceHandleId.replace(/^out-/, "");
    const targetPortId = targetHandleId.replace(/^in-/, "");

    const sourcePort = sourceDef.outputs.find((p) => p.id === sourcePortId);
    const targetPort = targetDef.inputs.find((p) => p.id === targetPortId);

    if (!sourcePort || !targetPort) {
      return { compatible: true, message: "动态端口，允许连接" };
    }

    if (areTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
      return { compatible: true, message: `✅ ${sourcePort.dataType} → ${targetPort.dataType}` };
    }

    return {
      compatible: false,
      message: `类型不兼容: ${sourcePort.label}(${sourcePort.dataType}) → ${targetPort.label}(${targetPort.dataType})`,
    };
  };

  const validateConnection = (connection: {
    source?: string | null;
    sourceHandle?: string | null;
    target?: string | null;
    targetHandle?: string | null;
  }) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return { ok: false, message: "不能自连接或空连接" };
    }
    const compat = checkConnectionCompatibility(
      connection.source,
      connection.sourceHandle ?? "",
      connection.target,
      connection.targetHandle ?? "",
    );
    if (!compat.compatible) {
      return { ok: false, message: compat.message };
    }
    return { ok: true, message: compat.message };
  };

  const handleReconnect = (oldEdge: any, newConnection: any) => {
    const check = validateConnection(newConnection);
    if (!check.ok) {
      appendLog(`重连被拒绝: ${check.message}`);
      return;
    }

    setEdges((allEdges) =>
      allEdges.map((edge) =>
        edge.id === oldEdge.id
          ? {
              ...edge,
              source: newConnection.source,
              sourceHandle: newConnection.sourceHandle,
              target: newConnection.target,
              targetHandle: newConnection.targetHandle,
              animated: true,
            }
          : edge,
      ),
    );

    appendLog(
      `重连成功：${newConnection.source}:${newConnection.sourceHandle ?? "source"} -> ${newConnection.target}:${newConnection.targetHandle ?? "target"} (${check.message})`,
    );
    reportChange();
  };

  // ── 模拟流水线执行 ────────────────────────────────

  const runPipeline = async () => {
    if (isRunning()) return;
    setIsRunning(true);
    appendLog("开始执行工作流任务 (模拟)");

    const flowObj = toObject();
    const serialized = solidFlowToSerializedGraph(flowObj, "pipeline");
    const validation = validateGraph(serialized);

    if (!validation.valid) {
      for (const err of validation.errors) {
        appendLog(`❌ ${err}`);
      }
      setIsRunning(false);
      return;
    }

    for (const n of nodes) {
      setNodeStatus(n.id, "queued");
    }

    const result = compileGraph(serialized);

    if (!result.success) {
      appendLog(`❌ 编译失败: ${result.errors.join(", ")}`);
      setIsRunning(false);
      return;
    }

    for (const nodeId of result.executionOrder) {
      setNodeStatus(nodeId, "running");
      updateNodeData(nodeId, () => ({ progress: 0, statusMessage: "执行中..." }));
      appendLog(`节点 ${nodeId} 执行中`);

      for (let p = 0; p <= 1; p += 0.25) {
        await wait(300);
        updateNodeData(nodeId, () => ({ progress: p }));
      }

      setNodeStatus(nodeId, "success");
      updateNodeData(nodeId, () => ({ progress: 1, statusMessage: "完成" }));
      appendLog(`节点 ${nodeId} 执行完成`);
    }

    appendLog("✅ 工作流执行完成");
    setIsRunning(false);
  };

  // ── 编译脚本预览 ──────────────────────────────────

  const previewScript = () => {
    const flowObj = toObject();
    const serialized = solidFlowToSerializedGraph(flowObj, "workflow");
    const result = compileGraph(serialized);
    setCompiledScript(result);
    setShowScript(true);
    appendLog(result.success ? "脚本编译成功" : `编译错误: ${result.errors.join(", ")}`);
  };

  // ── 导出/导入 ─────────────────────────────────────

  const exportTask = () => {
    const serialized = JSON.stringify(toObject(), null, 2);
    setTaskPayload(serialized);
    appendLog("已打包任务，可发送到远程机器执行");
  };

  const parseAndLoadTask = () => {
    try {
      const parsed = JSON.parse(taskPayload());
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        appendLog("任务解析失败：格式错误");
        return;
      }
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setSelectedNodeId(parsed.nodes[0]?.id ?? null);
      appendLog("远程任务已解析并注入画布");
      void fitView({ padding: 0.25 });
      reportChange();
    } catch {
      appendLog("任务解析失败：JSON 无法解析");
    }
  };

  const sendToRemote = () => {
    exportTask();
    appendLog("任务已发送到 workstation-02");
    setTimeout(() => appendLog("workstation-02: 已接收任务并开始执行"), 800);
  };

  // ── 从目录添加节点 ────────────────────────────────

  const addWorkflowNode = (defType: string) => {
    const def = getNodeDefinition(defType);
    if (!def) return;

    const data = createDefaultInstanceData(defType);
    if (!data) return;

    const count = nodes.filter((n) => (n.data as WorkflowNodeInstanceData).definitionType === defType).length + 1;
    const id = `${defType}-${count}-${Math.random().toString(36).slice(2, 6)}`;

    addNodes({
      id,
      type: NODE_TYPE,
      position: { x: 200 + count * 60, y: 200 + count * 40 },
      data: { ...data, title: `${def.label} ${count}` },
    });

    setSelectedNodeId(id);
    setShowCatalog(false);
    appendLog(`新增节点 ${def.icon} ${def.label} (${id})`);
    reportChange();
  };

  // ── 节点详情面板回调 ──────────────────────────────

  const updateSelectedNodeMeta = (field: "title" | "statusMessage", value: string) => {
    const id = selectedNodeId();
    if (!id) return;
    updateNodeData(id, () => ({ [field]: value }));
    reportChange();
  };

  return (
    <div class="wf-page">
      <SolidFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        maxZoom={2}
        minZoom={0.2}
        connectionMode="strict"
        defaultEdgeOptions={{ animated: true }}
        onNodeDragStop={() => reportChange()}
        onNodeClick={({ node }) => setSelectedNodeId(node.id)}
        onBeforeConnect={(connection) => {
          const result = validateConnection(connection);
          if (!result.ok) {
            appendLog(`连接被拒绝: ${result.message}`);
            return undefined;
          }
          return connection;
        }}
        onBeforeReconnect={(newEdge) => {
          const result = validateConnection(newEdge);
          if (!result.ok) {
            appendLog(`重连被拒绝: ${result.message}`);
            return undefined;
          }
          return newEdge;
        }}
        onReconnect={handleReconnect}
        onConnect={(connection) => {
          const check = validateConnection(connection);
          if (!check.ok) {
            appendLog(`连接被拒绝: ${check.message}`);
            return;
          }

          setEdges((allEdges) =>
            addEdge(
              {
                ...connection,
                id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
                animated: true,
              },
              allEdges,
            ),
          );

          appendLog(
            `连接成功：${connection.source}:${connection.sourceHandle ?? "source"} -> ${connection.target}:${connection.targetHandle ?? "target"} (${check.message})`,
          );
          reportChange();
        }}
      >
        <Background variant="dots" gap={18} size={1} />
        <MiniMap zoomable pannable />
        <Controls />

        {/* ── 左上: 操作面板 ── */}
        <Panel position="top-left">
          <div class="wf-panel wf-panel--ops">
            <div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "2px" }}>
              <button class="wf-back-btn" onClick={props.onBackToPortal} title="返回门户">
                ← 门户
              </button>
              <strong style={{ flex: 1 }}>AI Workflow Orchestrator</strong>
              <span class={`wf-save-indicator ${props.isDirty ? "wf-save-indicator--dirty" : "wf-save-indicator--saved"}`}>
                {props.isDirty ? "● 未保存" : "✓ 已保存"}
              </span>
            </div>
            <div style={{ "font-size": "11px", color: "#6b7280", "margin-bottom": "4px" }}>
              {props.workflowName}{props.workflowId ? "" : " (新建)"}
            </div>
            <div class="wf-panel__btn-row">
              <button class="wf-btn" disabled={isRunning()} onClick={() => void runPipeline()}>
                {isRunning() ? "执行中..." : "▶ 执行流程"}
              </button>
              <button class="wf-btn" onClick={previewScript}>
                📜 编译脚本
              </button>
              <button class="wf-btn" onClick={sendToRemote}>
                🚀 发送到远程
              </button>
            </div>
            <div class="wf-panel__btn-row">
              <button class="wf-btn wf-btn--ghost" onClick={() => setShowCatalog(!showCatalog())}>
                {showCatalog() ? "✕ 关闭目录" : "＋ 添加节点"}
              </button>
              <button class="wf-btn" onClick={props.onSave}>
                💾 保存
              </button>
              <button class="wf-btn wf-btn--ghost" onClick={props.onSaveAs}>
                另存为
              </button>
              <button class="wf-btn wf-btn--icon" onClick={handleUndo} disabled={!history.canUndo()} title="撤销 (Ctrl+Z)">
                ↩
              </button>
              <button class="wf-btn wf-btn--icon" onClick={handleRedo} disabled={!history.canRedo()} title="重做 (Ctrl+Shift+Z)">
                ↪
              </button>
              <button class="wf-btn wf-btn--ghost" onClick={() => { refreshTimeline(); setShowTimeline(!showTimeline()); }}>
                {showTimeline() ? "✕ 关闭时间线" : "📜 时间线"}
              </button>
            </div>
            <div class="wf-panel__btn-row">
              <button class="wf-btn wf-btn--ghost" onClick={exportTask}>
                导出
              </button>
              <button class="wf-btn wf-btn--ghost" onClick={parseAndLoadTask}>
                导入
              </button>
            </div>
          </div>
          <Show when={showCatalog()}>
            <NodeCatalog onAddNode={addWorkflowNode} />
          </Show>
        </Panel>

        {/* ── 右上: 节点详情 ── */}
        <Panel position="top-right">
          <NodeInspector
            selectedNode={selectedNode}
            onUpdateMeta={updateSelectedNodeMeta}
          />
        </Panel>

        {/* ── 左下: 任务载荷 / 脚本预览 ── */}
        <Panel position="bottom-left">
          <Show when={showScript() && compiledScript()}>
            <ScriptPreview
              compiledScript={compiledScript}
              onClose={() => setShowScript(false)}
            />
          </Show>
          <Show when={!showScript()}>
            <div class="wf-panel wf-panel--payload">
              <strong>任务交换载荷（跨电脑同步）</strong>
              <textarea
                class="nodrag"
                rows={8}
                value={taskPayload()}
                placeholder='点击"导出"生成 JSON，然后在另一台机器粘贴并点击"导入"'
                onInput={(event) => setTaskPayload(event.currentTarget.value)}
              />
            </div>
          </Show>
        </Panel>

        {/* ── 右下: 执行日志 ── */}
        <Panel position="bottom-right">
          <LogPanel logs={logs} />
          <Show when={showTimeline()}>
            <Timeline
              entries={timelineEntries}
              onRestore={handleTimelineRestore}
              onClose={() => setShowTimeline(false)}
            />
          </Show>
        </Panel>
      </SolidFlow>
    </div>
  );
};

export default AIPage;
