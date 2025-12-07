# Python 集成方案设计文档

## 🎯 设计目标

为 Workstation 应用添加 Python 脚本执行能力，支持：
1. 执行 Python 脚本并获取结果
2. 传递参数给 Python 脚本
3. 获取 Python 脚本的输出和错误信息
4. 管理 Python 脚本文件

---

## 📋 方案选择

### 方案 1: 使用 Rust 调用系统 Python（推荐）

**优点**：
- ✅ 实现简单，无需额外依赖
- ✅ 支持所有 Python 库
- ✅ 灵活性高，可执行任意脚本

**缺点**：
- ⚠️ 需要用户系统安装 Python
- ⚠️ Python 版本管理复杂

### 方案 2: 使用 PyO3 嵌入 Python

**优点**：
- ✅ Python 完全嵌入到应用中
- ✅ 性能更好

**缺点**：
- ❌ 编译复杂，需要 Python 开发环境
- ❌ 增加应用体积
- ❌ 依赖管理困难

### 方案 3: 使用 WebAssembly Python (Pyodide)

**优点**：
- ✅ 完全在前端运行
- ✅ 跨平台

**缺点**：
- ❌ 功能受限
- ❌ 性能较差

---

## 🎨 推荐架构：方案 1（系统 Python）

```
┌─────────────────────────────────────────────┐
│          Frontend (SolidJS)                 │
│  ┌───────────────────────────────────┐     │
│  │  Python 管理界面                   │     │
│  │  - 脚本列表                        │     │
│  │  - 脚本编辑器                      │     │
│  │  - 执行控制                        │     │
│  └───────────────┬───────────────────┘     │
│                  │ IPC Calls                │
└──────────────────┼─────────────────────────┘
                   │
┌──────────────────┼─────────────────────────┐
│                  │ Backend (Rust)           │
│  ┌───────────────▼───────────────────┐     │
│  │  Python 服务层                     │     │
│  │  - execute_python_script()        │     │
│  │  - list_python_scripts()          │     │
│  │  - save_python_script()           │     │
│  │  - get_python_info()              │     │
│  └───────────────┬───────────────────┘     │
│                  │                          │
│  ┌───────────────▼───────────────────┐     │
│  │  脚本管理器                        │     │
│  │  - 脚本存储路径                    │     │
│  │  - 权限控制                        │     │
│  │  - 输出捕获                        │     │
│  └───────────────┬───────────────────┘     │
│                  │                          │
└──────────────────┼─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│      System Python                          │
│  ~/Workstation/python_scripts/              │
│  ├── data_processor.py                      │
│  ├── file_converter.py                      │
│  └── custom_analysis.py                     │
└─────────────────────────────────────────────┘
```

---

## 📁 文件结构

```
d:/Programming/Workstation/
├── src-tauri/src/
│   ├── lib.rs                    # 主入口
│   ├── python.rs                 # 🆕 Python 服务模块
│   └── app_paths.rs              # 路径管理（已存在）
│
├── src/Tools/
│   ├── Python/                   # 🆕 Python 工具模块
│   │   ├── PythonTool.tsx       # Python 管理界面
│   │   ├── PythonTool.module.css
│   │   ├── ScriptEditor.tsx     # 脚本编辑器
│   │   ├── ScriptRunner.tsx     # 脚本执行器
│   │   └── index.ts
│   └── ...
│
└── python_scripts/               # 🆕 Python 脚本目录
    ├── examples/                 # 示例脚本
    │   ├── hello.py
    │   ├── data_processor.py
    │   └── file_handler.py
    └── user/                     # 用户脚本
```

---

## 🔧 实现步骤

### 阶段 1: Rust 后端实现（核心功能）

1. **添加依赖到 Cargo.toml**
2. **创建 python.rs 模块**
3. **实现 Tauri 命令**
4. **注册命令到 lib.rs**

### 阶段 2: 前端界面实现

1. **创建 Python 工具组件**
2. **实现脚本编辑器**
3. **实现脚本执行器**
4. **集成到 Tools 模块**

### 阶段 3: 示例脚本和文档

1. **创建示例脚本**
2. **编写使用文档**
3. **添加安全检查**

---

## 🔐 安全考虑

### 1. 脚本执行限制
- ✅ 只允许执行特定目录下的脚本
- ✅ 白名单机制（可选）
- ✅ 超时控制
- ✅ 资源限制

### 2. 路径安全
- ✅ 禁止路径遍历
- ✅ 验证文件扩展名
- ✅ 沙盒目录

### 3. 输入验证
- ✅ 参数清理
- ✅ 类型检查
- ✅ 长度限制

---

## 📝 API 设计

### Rust Commands

```rust
// 执行 Python 脚本
#[tauri::command]
async fn execute_python_script(
    script_name: String,
    args: Vec<String>
) -> Result<PythonResult, String>

// 列出所有脚本
#[tauri::command]
async fn list_python_scripts() -> Result<Vec<ScriptInfo>, String>

// 保存脚本
#[tauri::command]
async fn save_python_script(
    name: String,
    content: String
) -> Result<(), String>

// 读取脚本内容
#[tauri::command]
async fn read_python_script(name: String) -> Result<String, String>

// 删除脚本
#[tauri::command]
async fn delete_python_script(name: String) -> Result<(), String>

// 获取 Python 环境信息
#[tauri::command]
async fn get_python_info() -> Result<PythonInfo, String>
```

### TypeScript API

```typescript
// Python 服务接口
interface PythonService {
  // 执行脚本
  executeScript(scriptName: string, args?: string[]): Promise<PythonResult>;
  
  // 列出脚本
  listScripts(): Promise<ScriptInfo[]>;
  
  // 保存脚本
  saveScript(name: string, content: string): Promise<void>;
  
  // 读取脚本
  readScript(name: string): Promise<string>;
  
  // 删除脚本
  deleteScript(name: string): Promise<void>;
  
  // 获取 Python 信息
  getPythonInfo(): Promise<PythonInfo>;
}
```

---

## 🚀 使用示例

### 示例 1: 数据处理脚本

```python
# python_scripts/examples/data_processor.py
import sys
import json

def process_data(input_data):
    # 处理数据
    result = {
        'count': len(input_data),
        'processed': [item.upper() for item in input_data]
    }
    return result

if __name__ == '__main__':
    input_str = sys.argv[1] if len(sys.argv) > 1 else '{}'
    data = json.loads(input_str)
    result = process_data(data.get('items', []))
    print(json.dumps(result))
```

### 示例 2: 前端调用

```typescript
import { pythonService } from '../services/PythonService';

async function processData() {
  const result = await pythonService.executeScript(
    'data_processor.py',
    [JSON.stringify({ items: ['hello', 'world'] })]
  );
  
  if (result.success) {
    const data = JSON.parse(result.stdout);
    console.log('处理结果:', data);
  } else {
    console.error('错误:', result.stderr);
  }
}
```

---

## 🎯 下一步行动

### 立即开始（推荐顺序）

1. ✅ **阅读此文档** - 了解整体架构
2. 🔧 **实现 Rust 后端** - 创建 python.rs
3. 🎨 **创建前端界面** - PythonTool 组件
4. 📝 **添加示例脚本** - hello.py
5. 🧪 **测试集成** - 端到端测试

### 可选增强

- 📊 **脚本性能监控** - 执行时间、资源使用
- 🔒 **高级安全** - 沙盒环境、权限控制
- 📦 **依赖管理** - requirements.txt 支持
- 🔄 **热重载** - 脚本修改自动重载

---

## ❓ FAQ

### Q: 用户必须安装 Python 吗？
A: 是的，方案 1 需要用户系统有 Python。我们会在应用启动时检测并提示。

### Q: 如何处理 Python 依赖？
A: 用户需要自己安装依赖，或者我们提供 requirements.txt 并自动安装。

### Q: 支持哪些 Python 版本？
A: Python 3.7+ 都支持，推荐 3.9+。

### Q: 脚本执行会阻塞 UI 吗？
A: 不会，我们使用异步执行，长时间脚本会在后台运行。

### Q: 如何调试 Python 脚本？
A: 可以在界面中查看 stdout 和 stderr，也可以在脚本中使用 print() 调试。

---

**准备好开始了吗？让我们从实现 Rust 后端开始！** 🚀
