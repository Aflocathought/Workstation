# 🐍 Python 集成 - 快速开始

## 🚀 三分钟上手

### 1. 确保 Python 已安装

```bash
python --version  # 或 python3 --version
# 需要 Python 3.7+
```

### 2. 将 Python 工具添加到 Tools 模块

编辑 `src/Tools/ToolsPage.tsx`:

```typescript
// 在文件顶部添加导入
const PythonTool = lazy(() => import('./Python/PythonTool'));

// 在 subRoutes 数组中添加
const subRoutes = [
  { id: 'tools-spectrum', label: '频谱分析' },
  { id: 'tools-python', label: 'Python 工具' },  // 👈 新增这行
];

// 在组件渲染部分添加
<Show when={activeSubRoute() === 'tools-python'}>
  <Suspense fallback={<div class={styles.loading}>加载中...</div>}>
    <PythonTool />
  </Suspense>
</Show>
```

编辑 `src/Tools/registerRoute.ts`:

```typescript
// 在 registerToolsRoutes 函数中添加
router.addRoute({
  id: 'tools-python',
  name: 'Python 工具',
  path: '/tools/python',
  icon: '🐍',
  description: 'Python 脚本执行工具',
  hidden: true,
});
```

### 3. 启动应用

```bash
pnpm tauri dev
```

### 4. 测试功能

1. 打开应用
2. 导航到 **Tools → Python 工具**
3. 点击 **"Hello World"** 快速测试按钮
4. 查看执行结果！ 🎉

---

## 📖 基本用法

### 在代码中调用 Python 脚本

```typescript
import { pythonService } from '../services/PythonService';

// 执行脚本
async function example() {
  const result = await pythonService.executeScript(
    'hello.py',
    ['World']
  );
  
  console.log(result.stdout);  // 输出结果
}
```

### 处理 JSON 数据

```typescript
const result = await pythonService.executeScriptWithJSON(
  'data_processor.py',
  [JSON.stringify({ items: ['test', 'data'] })]
);

console.log(result.processed);  // 处理后的数据
```

---

## 📝 编写自己的脚本

创建 `python_scripts/user/my_script.py`:

```python
#!/usr/bin/env python3
import sys
import json

# 获取输入
input_data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}

# 处理数据
result = {
    'message': f"处理了 {len(input_data)} 个项目",
    'data': input_data
}

# 输出结果
print(json.dumps(result, ensure_ascii=False))
```

---

## 📚 完整文档

- **使用指南**: `docs/PythonUsageGuide.md`
- **架构设计**: `docs/PythonIntegration.md`
- **实现总结**: `docs/PythonImplementationSummary.md`

---

## ✨ 功能特性

- ✅ 安全的脚本执行
- ✅ 参数传递
- ✅ JSON 数据交换
- ✅ 错误捕获
- ✅ 脚本管理
- ✅ 环境检测

---

## 🎯 示例脚本

应用包含 3 个示例脚本：

1. **hello.py** - Hello World
2. **data_processor.py** - 数据处理
3. **file_handler.py** - 文件分析

全部位于 `python_scripts/examples/` 目录。

---

**开始使用 Python 增强你的应用吧！** 🚀
