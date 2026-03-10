/**
 * AI Workflow — 节点注册表
 */

import {
  type NodeDefinition,
  type WorkflowNodeInstanceData,
  NodeCategory,
  PortDataType,
  NODE_CATEGORY_META,
} from "./types";

// ─── 节点定义 ────────────────────────────────────────────

const DataSourceNode: NodeDefinition = {
  type: "data_source",
  category: NodeCategory.DATA,
  label: "Data Source",
  description: "加载数据集，支持 CSV / Parquet / HDF5 等格式",
  icon: "📊",
  inputs: [],
  outputs: [
    { id: "dataset", label: "Dataset", dataType: PortDataType.DATASET, required: false },
  ],
  params: [
    { key: "data_path", label: "数据路径", widget: "file", defaultValue: "./data/train.csv", validation: { required: true } },
    { key: "format", label: "格式", widget: "select", defaultValue: "csv", options: [
      { label: "CSV", value: "csv" },
      { label: "Parquet", value: "parquet" },
      { label: "HDF5", value: "hdf5" },
      { label: "NumPy", value: "npy" },
    ]},
    { key: "target_column", label: "目标列", widget: "string", defaultValue: "" },
    { key: "test_size", label: "测试集比例", widget: "slider", defaultValue: 0.2, validation: { min: 0.05, max: 0.5, step: 0.05 } },
    { key: "sequence_length", label: "序列长度 (时序)", widget: "number", defaultValue: 60, advanced: true },
    { key: "shuffle", label: "打乱数据", widget: "boolean", defaultValue: true, advanced: true },
  ],
  pythonModule: "nodes.data_source",
  pythonClass: "DataSourceNode",
};

const ConfigNode: NodeDefinition = {
  type: "config",
  category: NodeCategory.CONFIG,
  label: "Training Config",
  description: "训练超参数配置中心，输出标准化的配置对象",
  icon: "⚙️",
  inputs: [],
  outputs: [
    { id: "config", label: "Config", dataType: PortDataType.MODEL_CONFIG, required: false },
  ],
  params: [
    { key: "model_name", label: "模型名称", widget: "string", defaultValue: "my_model" },
    { key: "seed", label: "随机种子", widget: "number", defaultValue: 42 },
    { key: "batch_size", label: "Batch Size", widget: "number", defaultValue: 32, group: "训练" },
    { key: "epochs", label: "Epochs", widget: "number", defaultValue: 100, group: "训练" },
    { key: "learning_rate", label: "学习率", widget: "number", defaultValue: 0.001, group: "训练", validation: { min: 0, step: 0.0001 } },
    { key: "early_stopping_patience", label: "早停耐心", widget: "number", defaultValue: 15, group: "训练", advanced: true },
    { key: "reduce_lr_patience", label: "LR 衰减耐心", widget: "number", defaultValue: 7, group: "训练", advanced: true },
    { key: "reduce_lr_factor", label: "LR 衰减因子", widget: "number", defaultValue: 0.5, group: "训练", advanced: true },
    { key: "loss", label: "损失函数", widget: "select", defaultValue: "mse", group: "训练", options: [
      { label: "MSE", value: "mse" },
      { label: "MAE", value: "mae" },
      { label: "Huber", value: "huber" },
      { label: "Cross Entropy", value: "categorical_crossentropy" },
    ]},
    { key: "output_dir", label: "输出目录", widget: "string", defaultValue: "./output", group: "输出" },
    { key: "gradient_clipnorm", label: "梯度裁剪", widget: "number", defaultValue: 1.0, advanced: true },
  ],
  pythonModule: "nodes.config_node",
  pythonClass: "ConfigNode",
};

const ModelBuilderNode: NodeDefinition = {
  type: "model_builder",
  category: NodeCategory.BUILD,
  label: "Model Builder",
  description: "根据架构配置构建模型 — 支持 LSTM / CNN / Transformer 等",
  icon: "🏗️",
  inputs: [
    { id: "config", label: "Config", dataType: PortDataType.MODEL_CONFIG, required: true },
    { id: "dataset", label: "Dataset", dataType: PortDataType.DATASET, required: false, description: "可选：用于推断 input_shape" },
  ],
  outputs: [
    { id: "model", label: "Model", dataType: PortDataType.MODEL_ARTIFACT, required: false },
  ],
  params: [
    { key: "architecture", label: "模型架构", widget: "select", defaultValue: "lstm", options: [
      { label: "LSTM", value: "lstm" },
      { label: "GRU", value: "gru" },
      { label: "BiLSTM", value: "bilstm" },
      { label: "Transformer", value: "transformer" },
      { label: "CNN-1D", value: "cnn1d" },
      { label: "MLP", value: "mlp" },
      { label: "Custom (code)", value: "custom" },
    ]},
    { key: "lstm_units", label: "LSTM 单元数", widget: "number-list", defaultValue: [128, 64], group: "架构", description: "每层的 units，逗号分隔" },
    { key: "dense_units", label: "Dense 层单元", widget: "number-list", defaultValue: [32], group: "架构" },
    { key: "dropout_rate", label: "Dropout", widget: "slider", defaultValue: 0.2, group: "正则化", validation: { min: 0, max: 0.8, step: 0.05 } },
    { key: "recurrent_dropout", label: "Recurrent Dropout", widget: "slider", defaultValue: 0.2, group: "正则化", validation: { min: 0, max: 0.8, step: 0.05 }, advanced: true },
    { key: "activation", label: "激活函数", widget: "select", defaultValue: "relu", group: "架构", options: [
      { label: "ReLU", value: "relu" },
      { label: "GELU", value: "gelu" },
      { label: "Tanh", value: "tanh" },
      { label: "Swish", value: "swish" },
    ]},
    { key: "input_shape", label: "输入形状 (手动)", widget: "string", defaultValue: "", advanced: true, description: "留空则从 Dataset 推断，格式: 60,5" },
    { key: "custom_code", label: "自定义模型代码", widget: "code", defaultValue: "", advanced: true, description: "architecture=custom 时使用" },
  ],
  pythonModule: "nodes.model_builder",
  pythonClass: "ModelBuilderNode",
};

const TrainerNode: NodeDefinition = {
  type: "trainer",
  category: NodeCategory.TRAIN,
  label: "Trainer",
  description: "执行模型训练，产出 checkpoint 与训练日志",
  icon: "🎯",
  inputs: [
    { id: "model", label: "Model", dataType: PortDataType.MODEL_ARTIFACT, required: true },
    { id: "dataset", label: "Dataset", dataType: PortDataType.DATASET, required: true },
    { id: "config", label: "Config", dataType: PortDataType.MODEL_CONFIG, required: false, description: "可选：覆盖训练参数" },
  ],
  outputs: [
    { id: "checkpoint", label: "Checkpoint", dataType: PortDataType.CHECKPOINT, required: false },
    { id: "train_log", label: "Train Log", dataType: PortDataType.TRAIN_LOG, required: false },
    { id: "metrics", label: "Metrics", dataType: PortDataType.METRICS, required: false },
  ],
  params: [
    { key: "epochs_override", label: "Epochs (覆盖)", widget: "number", defaultValue: 0, description: "0=使用 Config 的值" },
    { key: "validation_split", label: "验证集比例", widget: "slider", defaultValue: 0.2, validation: { min: 0, max: 0.5, step: 0.05 } },
    { key: "save_best_only", label: "仅保存最佳", widget: "boolean", defaultValue: true },
    { key: "tensorboard", label: "启用 TensorBoard", widget: "boolean", defaultValue: true, advanced: true },
    { key: "csv_logging", label: "CSV 日志", widget: "boolean", defaultValue: true, advanced: true },
  ],
  pythonModule: "nodes.trainer",
  pythonClass: "TrainerNode",
};

const EvaluatorNode: NodeDefinition = {
  type: "evaluator",
  category: NodeCategory.EVALUATE,
  label: "Evaluator",
  description: "评估模型表现 — 支持任何阶段的模型 (训练后/剪枝后/量化后)",
  icon: "📈",
  inputs: [
    { id: "model", label: "Model", dataType: PortDataType.MODEL_ARTIFACT, required: true, description: "接受任何 model_artifact 兼容类型" },
    { id: "dataset", label: "Dataset", dataType: PortDataType.DATASET, required: true },
    { id: "baseline_metrics", label: "Baseline", dataType: PortDataType.METRICS, required: false, description: "基线指标（用于对比）" },
  ],
  outputs: [
    { id: "metrics", label: "Metrics", dataType: PortDataType.METRICS, required: false },
  ],
  params: [
    { key: "metrics_list", label: "评估指标", widget: "multi-select", defaultValue: ["mae", "mse", "rmse", "r2"], options: [
      { label: "MAE", value: "mae" },
      { label: "MSE", value: "mse" },
      { label: "RMSE", value: "rmse" },
      { label: "R²", value: "r2" },
      { label: "MAPE", value: "mape" },
      { label: "Accuracy", value: "accuracy" },
      { label: "F1 Score", value: "f1" },
      { label: "AUC", value: "auc" },
    ]},
    { key: "compare_baseline", label: "与基线对比", widget: "boolean", defaultValue: true },
    { key: "generate_plots", label: "生成可视化", widget: "boolean", defaultValue: true },
    { key: "plot_types", label: "图表类型", widget: "multi-select", defaultValue: ["prediction_vs_actual", "residuals"], advanced: true, options: [
      { label: "预测 vs 实际", value: "prediction_vs_actual" },
      { label: "残差图", value: "residuals" },
      { label: "Loss 曲线", value: "loss_curve" },
      { label: "混淆矩阵", value: "confusion_matrix" },
    ]},
  ],
  pythonModule: "nodes.evaluator",
  pythonClass: "EvaluatorNode",
};

const PrunerNode: NodeDefinition = {
  type: "pruner",
  category: NodeCategory.OPTIMIZE,
  label: "Pruner (剪枝)",
  description: "模型稀疏剪枝 — 输出剪枝后的模型 + 对比指标",
  icon: "✂️",
  inputs: [
    { id: "model", label: "Model", dataType: PortDataType.MODEL_ARTIFACT, required: true },
    { id: "dataset", label: "Dataset", dataType: PortDataType.DATASET, required: false, description: "可选：用于 fine-tune 或评估" },
  ],
  outputs: [
    { id: "pruned_model", label: "Pruned Model", dataType: PortDataType.PRUNED_MODEL, required: false },
    { id: "metrics", label: "Metrics", dataType: PortDataType.METRICS, required: false, description: "剪枝后的评估指标" },
  ],
  params: [
    { key: "method", label: "剪枝方法", widget: "select", defaultValue: "magnitude", options: [
      { label: "幅度剪枝 (Magnitude)", value: "magnitude" },
      { label: "结构化剪枝 (Structured)", value: "structured" },
      { label: "多项式衰减 (Polynomial Decay)", value: "polynomial_decay" },
    ]},
    { key: "target_sparsity", label: "目标稀疏度", widget: "slider", defaultValue: 0.5, validation: { min: 0.1, max: 0.95, step: 0.05 } },
    { key: "begin_step", label: "开始步数", widget: "number", defaultValue: 0, advanced: true },
    { key: "end_step", label: "结束步数", widget: "number", defaultValue: -1, advanced: true, description: "-1 = 自动计算" },
    { key: "fine_tune_epochs", label: "微调轮数", widget: "number", defaultValue: 10 },
    { key: "builtin_evaluate", label: "内置评估", widget: "boolean", defaultValue: true, description: "剪枝完自动跑评估" },
  ],
  pythonModule: "nodes.pruner",
  pythonClass: "PrunerNode",
  builtinEvaluate: true,
};

const QuantizerNode: NodeDefinition = {
  type: "quantizer",
  category: NodeCategory.OPTIMIZE,
  label: "Quantizer (量化)",
  description: "模型量化 — INT8/Float16，输出量化模型 + 精度对比",
  icon: "📐",
  inputs: [
    { id: "model", label: "Model", dataType: PortDataType.MODEL_ARTIFACT, required: true },
    { id: "dataset", label: "Dataset", dataType: PortDataType.DATASET, required: false, description: "用于校准量化或评估" },
  ],
  outputs: [
    { id: "quantized_model", label: "Quantized Model", dataType: PortDataType.MODEL_ARTIFACT, required: false },
    { id: "metrics", label: "Metrics", dataType: PortDataType.METRICS, required: false },
  ],
  params: [
    { key: "method", label: "量化方法", widget: "select", defaultValue: "dynamic", options: [
      { label: "动态量化 (Dynamic)", value: "dynamic" },
      { label: "全量化 (Full Integer)", value: "full_integer" },
      { label: "Float16", value: "float16" },
      { label: "QAT (训练感知)", value: "qat" },
    ]},
    { key: "representative_dataset_size", label: "校准数据量", widget: "number", defaultValue: 100, advanced: true },
    { key: "builtin_evaluate", label: "内置评估", widget: "boolean", defaultValue: true },
  ],
  pythonModule: "nodes.quantizer",
  pythonClass: "QuantizerNode",
  builtinEvaluate: true,
};

const ConverterNode: NodeDefinition = {
  type: "converter",
  category: NodeCategory.CONVERT,
  label: "Model Converter",
  description: "模型格式转换 — TFLite / ONNX / SavedModel / TorchScript",
  icon: "🔄",
  inputs: [
    { id: "model", label: "Model", dataType: PortDataType.MODEL_ARTIFACT, required: true },
  ],
  outputs: [
    { id: "converted_model", label: "Converted", dataType: PortDataType.MODEL_ARTIFACT, required: false },
    { id: "metrics", label: "Metrics", dataType: PortDataType.METRICS, required: false, description: "转换后模型的评估" },
  ],
  params: [
    { key: "target_format", label: "目标格式", widget: "select", defaultValue: "tflite", options: [
      { label: "TFLite", value: "tflite" },
      { label: "ONNX", value: "onnx" },
      { label: "TorchScript", value: "torchscript" },
      { label: "SavedModel", value: "savedmodel" },
      { label: "CoreML", value: "coreml" },
    ]},
    { key: "optimize", label: "优化选项", widget: "multi-select", defaultValue: ["DEFAULT"], options: [
      { label: "默认优化", value: "DEFAULT" },
      { label: "大小优化", value: "OPTIMIZE_FOR_SIZE" },
      { label: "延迟优化", value: "OPTIMIZE_FOR_LATENCY" },
    ], advanced: true },
    { key: "builtin_evaluate", label: "内置评估", widget: "boolean", defaultValue: true },
  ],
  pythonModule: "nodes.converter",
  pythonClass: "ConverterNode",
  builtinEvaluate: true,
};

const OutputManagerNode: NodeDefinition = {
  type: "output_manager",
  category: NodeCategory.OUTPUT,
  label: "Output Manager",
  description: "整理输出目录，组织模型、日志、指标等产物",
  icon: "📦",
  inputs: [
    { id: "model", label: "Model", dataType: PortDataType.MODEL_ARTIFACT, required: false },
    { id: "metrics", label: "Metrics", dataType: PortDataType.METRICS, required: false },
    { id: "train_log", label: "Train Log", dataType: PortDataType.TRAIN_LOG, required: false },
  ],
  outputs: [
    { id: "output_dir", label: "Output Dir", dataType: PortDataType.FILE_PATH, required: false },
  ],
  params: [
    { key: "output_root", label: "输出根目录", widget: "string", defaultValue: "./output" },
    { key: "auto_timestamp", label: "自动时间戳目录", widget: "boolean", defaultValue: true },
    { key: "save_config_json", label: "保存配置 JSON", widget: "boolean", defaultValue: true },
    { key: "save_summary", label: "生成摘要报告", widget: "boolean", defaultValue: true },
  ],
  pythonModule: "nodes.output_manager",
  pythonClass: "OutputManagerNode",
};

const MetricsViewerNode: NodeDefinition = {
  type: "metrics_viewer",
  category: NodeCategory.UTILITY,
  label: "Metrics Viewer",
  description: "可视化展示指标 — R², MAE, RMSE, MSE 等。支持多组对比",
  icon: "📊",
  inputs: [
    { id: "metrics_1", label: "Metrics A", dataType: PortDataType.METRICS, required: true, description: "第一组指标（如训练后）" },
    { id: "metrics_2", label: "Metrics B", dataType: PortDataType.METRICS, required: false, description: "第二组指标（如剪枝后）" },
    { id: "metrics_3", label: "Metrics C", dataType: PortDataType.METRICS, required: false, description: "第三组指标（如量化后）" },
  ],
  outputs: [],
  params: [
    { key: "display_mode", label: "展示模式", widget: "select", defaultValue: "table", options: [
      { label: "表格", value: "table" },
      { label: "雷达图", value: "radar" },
      { label: "柱状图", value: "bar" },
    ]},
  ],
  pythonModule: "nodes.metrics_viewer",
  pythonClass: "MetricsViewerNode",
};

const TextOutputNode: NodeDefinition = {
  type: "text_output",
  category: NodeCategory.UTILITY,
  label: "Text Output",
  description: "显示命令行输出、日志等文本内容",
  icon: "📝",
  inputs: [
    { id: "input", label: "Input", dataType: PortDataType.ANY, required: true },
  ],
  outputs: [],
  params: [
    { key: "max_lines", label: "最大行数", widget: "number", defaultValue: 500 },
    { key: "auto_scroll", label: "自动滚动", widget: "boolean", defaultValue: true },
    { key: "format", label: "格式化", widget: "select", defaultValue: "auto", options: [
      { label: "自动", value: "auto" },
      { label: "JSON", value: "json" },
      { label: "纯文本", value: "plain" },
      { label: "Markdown", value: "markdown" },
    ]},
  ],
  pythonModule: "nodes.text_output",
  pythonClass: "TextOutputNode",
};

// ─── Registry ────────────────────────────────────────────

export const NODE_REGISTRY: Map<string, NodeDefinition> = new Map();

function register(def: NodeDefinition) {
  if (NODE_REGISTRY.has(def.type)) {
    console.warn(`[NodeRegistry] 重复注册节点类型: ${def.type}`);
  }
  NODE_REGISTRY.set(def.type, def);
}

register(DataSourceNode);
register(ConfigNode);
register(ModelBuilderNode);
register(TrainerNode);
register(EvaluatorNode);
register(PrunerNode);
register(QuantizerNode);
register(ConverterNode);
register(OutputManagerNode);
register(MetricsViewerNode);
register(TextOutputNode);

export function getNodesByCategory(category: NodeCategory): NodeDefinition[] {
  return [...NODE_REGISTRY.values()].filter(n => n.category === category);
}

export function getNodeCatalog(): { category: NodeCategory; label: string; icon: string; nodes: NodeDefinition[] }[] {
  const categories = Object.values(NodeCategory);
  return categories
    .map(cat => ({
      category: cat,
      label: (NODE_CATEGORY_META as Record<string, { label: string; icon: string }>)[cat]?.label ?? cat,
      icon: (NODE_CATEGORY_META as Record<string, { label: string; icon: string }>)[cat]?.icon ?? "📎",
      nodes: getNodesByCategory(cat),
    }))
    .filter(c => c.nodes.length > 0);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_REGISTRY.get(type);
}

export function createDefaultInstanceData(definitionType: string): WorkflowNodeInstanceData | null {
  const def = NODE_REGISTRY.get(definitionType);
  if (!def) return null;

  const paramValues: Record<string, unknown> = {};
  for (const p of def.params) {
    if (p.defaultValue !== undefined) {
      paramValues[p.key] = p.defaultValue;
    }
  }

  return {
    definitionType,
    title: def.label,
    status: "idle",
    progress: 0,
    statusMessage: "",
    paramValues,
    inputPortIds: def.inputs.map(i => i.id),
    outputPortIds: def.outputs.map(o => o.id),
  };
}

export type { NodeDefinition, WorkflowNodeInstanceData } from "./types";
