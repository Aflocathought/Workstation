# AI Workflow Orchestrator — MVP 架构设计

## 0. 现有开源对比与定位

| 项目 | 优点 | 缺点（对你的场景） |
|---|---|---|
| **ComfyUI** | 成熟的节点编辑器, 社区生态 | 仅限 Stable Diffusion 生态, 不通用 |
| **Apache Airflow / Prefect** | 企业级 DAG 调度, 任务队列 | 太重, 需要部署数据库/消息中间件; 不面向"参数配置" |
| **MLflow** | 实验追踪, 模型注册 | 不是 DAG 编辑器, 更偏 tracking |
| **Kubeflow Pipelines** | K8s 原生, 分布式 | 依赖 K8s, 对你几台 Windows 电脑杀鸡用牛刀 |
| **n8n / Node-RED** | 低代码流程, 可视化 | 面向 webhook/自动化, 不面向长时 AI 训练任务 |
| **ClearML** | 实验管理 + Agent 分发 | 最接近你的需求！但仍然偏重, 有学习曲线 |
| **Flyte** | DAG + 类型系统 | 依赖 K8s |

**结论**: ClearML 的 Agent 模式最接近你的需求（远程分发 + 队列 + 监控），但它不提供"可视化拖拽编辑 DAG"的体验。你的独特价值在于：**ComfyUI 式的可视化编辑 + 跨机器分发 + 极简部署**。这是值得做的。

## 1. 系统全局架构

```
┌─────────────────────────────────────────────────────────┐
│                    Dashboard (你的电脑)                    │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Workstation App (Tauri + SolidJS)                  │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐│ │
│  │  │ 节点编辑器 │ │ 任务队列  │ │ 实时监控面板         ││ │
│  │  │(solid-flow)│ │  面板    │ │ (日志/进度/指标)     ││ │
│  │  └──────────┘ └──────────┘ └──────────────────────┘│ │
│  │  ┌──────────────────────────────────────────────────┐│ │
│  │  │ Graph Compiler (图 → Python 脚本)                ││ │
│  │  └──────────────────────────────────────────────────┘│ │
│  │  ┌──────────────────────────────────────────────────┐│ │
│  │  │ Connection Manager (SSH / HTTP)                  ││ │
│  │  └──────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────┬─────────────────────────────┬───────────┘
                │  Tailscale / ZeroTier VLAN  │
                ▼                             ▼
┌───────────────────────┐   ┌───────────────────────┐
│  Worker A (GPU 主机)   │   │  Worker B (GPU 主机)   │
│  ┌─────────────────┐  │   │  ┌─────────────────┐  │
│  │ FastAPI Server   │  │   │  │ FastAPI Server   │  │
│  │  + SSH Daemon    │  │   │  │  + SSH Daemon    │  │
│  ├─────────────────┤  │   │  ├─────────────────┤  │
│  │ Task Queue      │  │   │  │ Task Queue      │  │
│  │ (asyncio Queue) │  │   │  │ (asyncio Queue) │  │
│  ├─────────────────┤  │   │  ├─────────────────┤  │
│  │ Task Runner     │  │   │  │ Task Runner     │  │
│  │ (subprocess)    │  │   │  │ (subprocess)    │  │
│  ├─────────────────┤  │   │  ├─────────────────┤  │
│  │ WebSocket 回传   │  │   │  │ WebSocket 回传   │  │
│  └─────────────────┘  │   │  └─────────────────┘  │
└───────────────────────┘   └───────────────────────┘
```

## 2. 核心设计：Port 类型系统（保证节点通用且鲁棒）

这是回答"怎么保证节点不因为换模型架构就全完蛋"的**核心答案**。

### 2.1 端口类型（PortType）

```typescript
// 所有端口的数据类型枚举 — 连线时做类型检查
enum PortDataType {
  // 基础类型
  ANY        = "any",
  STRING     = "string",
  NUMBER     = "number",
  BOOLEAN    = "boolean",
  JSON       = "json",
  FILE_PATH  = "file_path",

  // AI 专用类型
  DATASET        = "dataset",         // { path, format, columns, shape }
  MODEL_CONFIG   = "model_config",    // { architecture, hyperparams }
  MODEL_ARTIFACT = "model_artifact",  // { path, framework, format }
  CHECKPOINT     = "checkpoint",      // { path, epoch, metrics }
  METRICS        = "metrics",         // { loss, accuracy, mae, ... }
  TRAIN_LOG      = "train_log",       // { csv_path, tensorboard_dir }
  TFLITE_MODEL   = "tflite_model",
  ONNX_MODEL     = "onnx_model",
}
```

### 2.2 类型兼容矩阵

```
ANY 兼容所有类型
MODEL_ARTIFACT ← CHECKPOINT (checkpoint 是特殊的 model artifact)
MODEL_ARTIFACT ← TFLITE_MODEL | ONNX_MODEL
```

关键规则：**连线时检查 source.outputType 和 target.inputType 是否兼容，不兼容则拒绝连接并提示用户。**

### 2.3 节点定义 Schema（Node Registry）

每个节点类型由一个 **NodeDefinition** 描述：

```typescript
interface PortDefinition {
  id: string;
  label: string;
  dataType: PortDataType;
  required: boolean;
  default?: any;
}

interface ParamDefinition {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "json";
  default?: any;
  options?: { label: string; value: any }[];  // for select
  validation?: { min?: number; max?: number; pattern?: string };
}

interface NodeDefinition {
  type: string;                    // "model_builder", "trainer", "pruner", ...
  category: string;                // "config", "train", "optimize", "evaluate", "output"
  label: string;
  description: string;
  color: string;
  icon: string;

  inputs: PortDefinition[];
  outputs: PortDefinition[];
  params: ParamDefinition[];       // 卡片上可配置的参数

  // Python 端的执行入口
  pythonModule: string;            // e.g. "nodes.model_builder"
  pythonClass: string;             // e.g. "ModelBuilderNode"
}
```

### 2.4 为什么这能保证鲁棒性？

1. **换模型架构 → 只改 ModelBuilder 节点的 params 和 Python 实现**，后续节点只关心 `MODEL_ARTIFACT` 类型，不关心你用的是 LSTM 还是 Transformer。
2. **类型检查在连线时就拦截错误**，而不是跑到一半才崩。
3. **每个节点的 Python 实现是独立的**，通过标准化的 I/O 合约通信。

## 3. 图转脚本引擎 (Graph Compiler)

```
Graph JSON → Topological Sort → Code Generation → Python Script
```

### 3.1 流程

1. **拓扑排序**: 根据 edges 建立 DAG，确保执行顺序
2. **变量映射**: 每条 edge 生成一个中间变量名 `node_id__port_id`
3. **代码生成**: 对每个节点按排序顺序生成 Python 调用

### 3.2 生成的脚本示例

```python
# === Auto-generated by AI Workflow Orchestrator ===
# Graph: my_lstm_pipeline
# Generated: 2026-03-04T10:30:00

from nodes.config_node import ConfigNode
from nodes.model_builder import ModelBuilderNode
from nodes.trainer import TrainerNode
from nodes.evaluator import EvaluatorNode
from nodes.pruner import PrunerNode
from nodes.quantizer import QuantizerNode
from nodes.converter import ConverterNode
from nodes.output_manager import OutputManagerNode

import json, sys

# 进度回调 (Worker 会注入)
def report_progress(node_id: str, progress: float, message: str):
    print(json.dumps({"type": "progress", "node_id": node_id, "progress": progress, "message": message}))
    sys.stdout.flush()

# --- Node: config-1 (ConfigNode) ---
_config_1 = ConfigNode(params={
    "data_path": "./data/DataTrainPreprocessed.csv",
    "sequence_length": 60,
    "test_size": 0.2,
    ...
})
config_1__config = _config_1.execute(progress_callback=lambda p, m: report_progress("config-1", p, m))

# --- Node: model_builder-1 (ModelBuilderNode) ---
_model_builder_1 = ModelBuilderNode(params={
    "architecture": "lstm",
    "lstm_units": [128, 64],
    "dropout_rate": 0.2,
    ...
})
model_builder_1__model_artifact = _model_builder_1.execute(
    model_config=config_1__config,
    progress_callback=lambda p, m: report_progress("model_builder-1", p, m)
)

# --- Node: trainer-1 (TrainerNode) ---
...
```

### 3.3 这样保证一致性

- **图是 source of truth** → 脚本完全由图生成，不手动改脚本
- **每次执行前重新生成** → 不存在图和脚本不一致的问题
- **脚本是可读的 Python** → 出问题可以直接 debug

## 4. Worker 端架构 (FastAPI)

### 4.1 长任务处理

```python
# 不阻塞 HTTP！用 BackgroundTask 或 asyncio.create_task
@app.post("/tasks")
async def submit_task(task: TaskSubmission):
    task_id = str(uuid4())
    await task_queue.put(TaskItem(id=task_id, graph=task.graph, params=task.params))
    return {"task_id": task_id, "status": "queued", "position": task_queue.qsize()}
```

### 4.2 任务队列

```python
# 简单的 asyncio.Queue — 单 worker 单 GPU 够用了
task_queue = asyncio.Queue()

async def task_consumer():
    while True:
        task = await task_queue.get()
        # 1. 生成脚本
        script = compile_graph(task.graph)
        # 2. subprocess 执行
        process = await asyncio.create_subprocess_exec(
            "python", "-u", script_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        # 3. 实时读取 stdout → WebSocket 广播
        async for line in process.stdout:
            parsed = json.loads(line)
            await broadcast_progress(task.id, parsed)
```

### 4.3 进度反馈

```
Dashboard ←── WebSocket ──→ Worker
                            │
                            ├─ stdout 逐行 JSON:
                            │  {"type":"progress","node_id":"train-1","progress":0.45,"message":"Epoch 9/20"}
                            │
                            └─ stderr → 日志面板
```

## 5. SSH vs HTTP 选择

| | SSH | HTTP (FastAPI) |
|---|---|---|
| 部署 | Windows 自带 OpenSSH | 需要在远程机安装 Python + FastAPI |
| 安全 | 密钥认证, 成熟 | 需要自己做认证 |
| 文件传输 | SCP/SFTP 内置 | 需要自己实现上传接口 |
| 实时输出 | SSH exec + stream | WebSocket |
| 推荐 | ✅ 用于文件传输 + 初始部署 | ✅ 用于任务管理 + 进度回传 |

**推荐方案: 双通道**
- **SSH**: 用于部署 Worker、传输模型文件、初始环境配置
- **HTTP + WebSocket**: 用于任务提交、队列管理、实时进度

## 6. 节点清单 (MVP)

| 节点类型 | 输入端口 | 输出端口 | 说明 |
|---|---|---|---|
| **DataSource** | - | dataset | 数据集路径/加载 |
| **Config** | - | model_config | 超参数配置 |
| **ModelBuilder** | model_config | model_artifact | 构建模型 (LSTM/Transformer/...) |
| **Trainer** | model_artifact, dataset | checkpoint, train_log, metrics | 训练 |
| **Evaluator** | model_artifact, dataset | metrics | 评估 (可接在任何有 model_artifact 的后面) |
| **Pruner** | model_artifact | model_artifact, metrics | 稀疏剪枝 |
| **Quantizer** | model_artifact | model_artifact, metrics | 量化 |
| **Converter** | model_artifact | tflite_model / onnx_model | 格式转换 |
| **OutputManager** | metrics, train_log, model_artifact | file_path | 整理输出目录 |
| **TextOutput** | any | - | 显示日志/命令行输出 |
| **MetricsViewer** | metrics | - | R², MAE, RMSE 等可视化 |

## 7. MVP 开发路线图

### Phase 1 — 前端节点系统 (1-2 周)
- [ ] 基于 solid-flow 的 NodeDefinition 注册表
- [ ] 类型安全的端口连接验证
- [ ] 图序列化/反序列化
- [ ] 图拓扑排序 + 代码生成预览

### Phase 2 — Worker 端 (1 周)
- [ ] FastAPI 服务 + asyncio 队列
- [ ] Python 节点基类 + 5 个核心节点实现
- [ ] stdout JSON 进度协议
- [ ] WebSocket 实时回传

### Phase 3 — 通信层 (1 周)
- [ ] Workstation Tauri 中的 SSH 服务 (部署/文件传输)
- [ ] HTTP 客户端 (任务提交/状态查询)
- [ ] WebSocket 客户端 (实时进度)
- [ ] 机器管理面板 (添加/删除/状态)

### Phase 4 — 集成 (1 周)
- [ ] 端到端流程打通
- [ ] 错误恢复与重试
- [ ] 移动端友好的监控页面
