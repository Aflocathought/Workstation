/**
 * AI Workflow Orchestrator — Port 类型系统
 * 
 * 核心设计原则:
 * 1. 每个端口有明确的数据类型 (PortDataType)
 * 2. 连线时进行类型兼容性检查
 * 3. 节点通过 NodeDefinition 声明 I/O 合约
 * 4. Python 端实现对应的节点类，遵守相同的 I/O 合约
 */

// ─── Port Data Types ─────────────────────────────────────

/** 端口携带的数据类型 — 核心类型枚举 */
export enum PortDataType {
  // 基础类型
  ANY        = "any",
  STRING     = "string",
  NUMBER     = "number",
  BOOLEAN    = "boolean",
  JSON       = "json",
  FILE_PATH  = "file_path",

  // AI Pipeline 类型
  DATASET        = "dataset",
  MODEL_CONFIG   = "model_config",
  MODEL_ARTIFACT = "model_artifact",
  CHECKPOINT     = "checkpoint",
  METRICS        = "metrics",
  TRAIN_LOG      = "train_log",
  TFLITE_MODEL   = "tflite_model",
  ONNX_MODEL     = "onnx_model",
  PRUNED_MODEL   = "pruned_model",

  // 控制流类型
  TRIGGER        = "trigger",
}

// ─── Type Compatibility ──────────────────────────────────

const TYPE_COMPAT: Record<PortDataType, Set<PortDataType>> = (() => {
  const all = new Set(Object.values(PortDataType));
  
  const compat: Record<string, Set<PortDataType>> = {};
  for (const t of Object.values(PortDataType)) {
    compat[t] = new Set([t]);
  }
  
  compat[PortDataType.ANY] = all;
  
  compat[PortDataType.MODEL_ARTIFACT] = new Set([
    PortDataType.MODEL_ARTIFACT,
    PortDataType.CHECKPOINT,
    PortDataType.PRUNED_MODEL,
    PortDataType.TFLITE_MODEL,
    PortDataType.ONNX_MODEL,
  ]);
  
  compat[PortDataType.JSON] = new Set([
    PortDataType.JSON,
    PortDataType.MODEL_CONFIG,
    PortDataType.METRICS,
    PortDataType.DATASET,
  ]);

  return compat as Record<PortDataType, Set<PortDataType>>;
})();

export function areTypesCompatible(sourceType: PortDataType, targetType: PortDataType): boolean {
  if (sourceType === PortDataType.ANY) return true;
  return TYPE_COMPAT[targetType]?.has(sourceType) ?? false;
}

export function getPortColor(dataType: PortDataType): string {
  const colorMap: Record<PortDataType, string> = {
    [PortDataType.ANY]:            "#9ca3af",
    [PortDataType.STRING]:         "#f59e0b",
    [PortDataType.NUMBER]:         "#3b82f6",
    [PortDataType.BOOLEAN]:        "#8b5cf6",
    [PortDataType.JSON]:           "#6366f1",
    [PortDataType.FILE_PATH]:      "#78716c",
    [PortDataType.DATASET]:        "#06b6d4",
    [PortDataType.MODEL_CONFIG]:   "#2563eb",
    [PortDataType.MODEL_ARTIFACT]: "#9333ea",
    [PortDataType.CHECKPOINT]:     "#a855f7",
    [PortDataType.METRICS]:        "#10b981",
    [PortDataType.TRAIN_LOG]:      "#14b8a6",
    [PortDataType.TFLITE_MODEL]:   "#ec4899",
    [PortDataType.ONNX_MODEL]:     "#f43f5e",
    [PortDataType.PRUNED_MODEL]:   "#d946ef",
    [PortDataType.TRIGGER]:        "#64748b",
  };
  return colorMap[dataType] ?? "#9ca3af";
}

// ─── Port & Param Definitions ────────────────────────────

export interface PortDefinition {
  id: string;
  label: string;
  dataType: PortDataType;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

export type ParamWidgetType = 
  | "string" 
  | "number" 
  | "boolean" 
  | "select" 
  | "multi-select"
  | "json" 
  | "file" 
  | "code"
  | "slider"
  | "number-list";

export interface ParamDefinition {
  key: string;
  label: string;
  widget: ParamWidgetType;
  defaultValue?: unknown;
  options?: { label: string; value: unknown }[];
  validation?: {
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
    required?: boolean;
  };
  group?: string;
  description?: string;
  advanced?: boolean;
}

// ─── Node Definition ─────────────────────────────────────

export enum NodeCategory {
  DATA       = "data",
  CONFIG     = "config",       
  BUILD      = "build",
  TRAIN      = "train",
  EVALUATE   = "evaluate",
  OPTIMIZE   = "optimize",
  CONVERT    = "convert",
  OUTPUT     = "output",
  UTILITY    = "utility",
}

export const NODE_CATEGORY_META: Record<NodeCategory, { label: string; color: string; icon: string }> = {
  [NodeCategory.DATA]:     { label: "数据",   color: "#06b6d4", icon: "📊" },
  [NodeCategory.CONFIG]:   { label: "配置",   color: "#2563eb", icon: "⚙️" },
  [NodeCategory.BUILD]:    { label: "构建",   color: "#7c3aed", icon: "🏗️" },
  [NodeCategory.TRAIN]:    { label: "训练",   color: "#9333ea", icon: "🎯" },
  [NodeCategory.EVALUATE]: { label: "评估",   color: "#10b981", icon: "📈" },
  [NodeCategory.OPTIMIZE]: { label: "优化",   color: "#f59e0b", icon: "⚡" },
  [NodeCategory.CONVERT]:  { label: "转换",   color: "#ec4899", icon: "🔄" },
  [NodeCategory.OUTPUT]:   { label: "输出",   color: "#059669", icon: "📦" },
  [NodeCategory.UTILITY]:  { label: "工具",   color: "#64748b", icon: "🔧" },
};

export interface NodeDefinition {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  params: ParamDefinition[];
  pythonModule: string;
  pythonClass: string;
  dynamicPorts?: boolean;
  builtinEvaluate?: boolean;
}

// ─── Node Instance Data ──────────────────────────────────

export type NodeStatus = "idle" | "queued" | "running" | "success" | "error" | "skipped";

export interface WorkflowNodeInstanceData {
  [key: string]: unknown;
  definitionType: string;
  title: string;
  status: NodeStatus;
  progress: number;
  statusMessage: string;
  paramValues: Record<string, unknown>;
  inputPortIds: string[];
  outputPortIds: string[];
  lastMetrics?: Record<string, number | string>;
  lastLogs?: string[];
  executionTime?: number;
}

// ─── Serialization ───────────────────────────────────────

export interface SerializedGraph {
  version: string;
  name: string;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  metadata?: Record<string, unknown>;
}

export interface SerializedNode {
  id: string;
  definitionType: string;
  paramValues: Record<string, unknown>;
  inputPortIds: string[];
  outputPortIds: string[];
  position: { x: number; y: number };
}

export interface SerializedEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}
