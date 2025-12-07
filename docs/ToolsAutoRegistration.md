# 🚀 Tools 自动注册系统 - 快速入门

## 问题背景

**原来的问题**: 添加一个新工具需要在多个地方重复定义配置:
- ❌ `registerRoute.ts` 中注册路由
- ❌ `ToolsPage.tsx` 中添加导航项
- ❌ `ToolsPage.tsx` 中添加渲染逻辑

容易遗漏或不一致!

## 解决方案

**约定优于配置** - 每个工具只需在自己的 `index.ts` 中导出一个配置对象,系统自动完成一切!

---

## 📦 新增工具只需 2 步

### Step 1: 创建工具配置

在工具目录下创建 `index.ts`:

```typescript
// src/Tools/YourTool/index.ts
import type { ToolConfig } from '../types';

export const yourToolConfig: ToolConfig = {
  id: 'tools-yourtool',
  name: '你的工具名',
  icon: '🎨',
  description: '工具描述',
  component: () => import('./YourTool'),
};
```

### Step 2: 注册到配置数组

在 `registerRoute.ts` 中导入并添加:

```typescript
// src/Tools/registerRoute.ts
import { yourToolConfig } from './YourTool';  // 导入

const allToolConfigs: ToolConfig[] = [
  spectrumToolConfig,
  pythonToolConfig,
  yourToolConfig,  // 添加到这里
];
```

**完成!** 🎉 系统会自动:
- ✅ 注册路由
- ✅ 显示在导航栏
- ✅ 点击时懒加载组件

---

## 🌟 实际案例

### 案例 1: 添加计算器工具

```typescript
// src/Tools/Calculator/index.ts
import type { ToolConfig } from '../types';

export const calculatorConfig: ToolConfig = {
  id: 'tools-calculator',
  name: '计算器',
  icon: '🔢',
  description: '简单的科学计算器',
  component: () => import('./Calculator'),
};
```

```tsx
// src/Tools/Calculator/Calculator.tsx
import { Component } from 'solid-js';

const Calculator: Component = () => {
  return (
    <div>
      <h1>计算器</h1>
      {/* 你的计算器实现 */}
    </div>
  );
};

export default Calculator;
```

然后在 `registerRoute.ts` 添加:

```typescript
import { calculatorConfig } from './Calculator';

const allToolConfigs = [
  spectrumToolConfig,
  pythonToolConfig,
  calculatorConfig,  // ⬅️ 添加这一行
];
```

---

## 📝 配置字段说明

```typescript
interface ToolConfig {
  id: string;          // 路由 ID (格式: tools-xxx)
  name: string;        // 显示名称
  icon: string;        // 图标 (emoji 或类名)
  description: string; // 描述
  component: () => Promise<{ default: any }>; // 懒加载函数
}
```

### 字段规则

| 字段 | 规则 | 示例 |
|------|------|------|
| `id` | 必须以 `tools-` 开头 | `tools-calculator` |
| `name` | 简短清晰 | `计算器` |
| `icon` | 使用 emoji | `🔢` |
| `description` | 一句话描述 | `简单的科学计算器` |
| `component` | 返回懒加载的模块 | `() => import('./Tool')` |

---

## 🔄 工作原理图

```
┌──────────────────────────────────────────────────────┐
│  1. 每个工具目录导出配置                              │
│     Calculator/index.ts → calculatorConfig           │
│     Markdown/index.ts   → markdownConfig             │
└──────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────┐
│  2. registerRoute.ts 收集所有配置                     │
│     allToolConfigs = [calculatorConfig, ...]         │
└──────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────┐
│  3. 自动注册路由                                      │
│     router.addRoute({ id, name, path, ... })         │
└──────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────┐
│  4. ToolsPage 自动生成导航 + 渲染组件                 │
│     NavBar items = [...configs]                      │
│     <Show when={active}><LazyComponent /></Show>     │
└──────────────────────────────────────────────────────┘
```

---

## ✅ 优势对比

| 维度 | 旧方式 | 新方式 |
|------|--------|--------|
| 配置位置 | 3 处 (路由/导航/渲染) | 1 处 (工具目录) |
| 代码重复 | 高 | 低 |
| 易出错 | 容易遗漏或不一致 | 类型安全,自动化 |
| 新增工具 | 修改 3 个文件 | 修改 1 个文件 |
| 维护成本 | 高 | 低 |

---

## 💡 完整示例:添加 JSON 格式化工具

### 1. 创建工具文件

```typescript
// src/Tools/JsonFormatter/index.ts
import type { ToolConfig } from '../types';

export const jsonFormatterConfig: ToolConfig = {
  id: 'tools-json-formatter',
  name: 'JSON 格式化',
  icon: '📋',
  description: '格式化和验证 JSON 数据',
  component: () => import('./JsonFormatter'),
};
```

```tsx
// src/Tools/JsonFormatter/JsonFormatter.tsx
import { Component, createSignal } from 'solid-js';
import styles from './JsonFormatter.module.css';

const JsonFormatter: Component = () => {
  const [input, setInput] = createSignal('');
  const [output, setOutput] = createSignal('');

  const formatJson = () => {
    try {
      const parsed = JSON.parse(input());
      setOutput(JSON.stringify(parsed, null, 2));
    } catch (e) {
      setOutput('❌ JSON 格式错误');
    }
  };

  return (
    <div class={styles.container}>
      <h2>JSON 格式化工具</h2>
      <textarea
        value={input()}
        onInput={(e) => setInput(e.currentTarget.value)}
        placeholder="输入 JSON..."
      />
      <button onClick={formatJson}>格式化</button>
      <pre>{output()}</pre>
    </div>
  );
};

export default JsonFormatter;
```

### 2. 注册到系统

```typescript
// src/Tools/registerRoute.ts
import { jsonFormatterConfig } from './JsonFormatter';  // 导入

const allToolConfigs: ToolConfig[] = [
  spectrumToolConfig,
  pythonToolConfig,
  jsonFormatterConfig,  // 添加
];
```

**完成!** 刷新页面即可看到新工具! 🚀

---

## 🎯 核心理念

> **一个工具 = 一个配置导出**
> 
> 系统会自动处理剩下的一切!

---

## 📚 相关文档

- 详细文档: `src/Tools/README.md`
- 类型定义: `src/Tools/types.ts`
- 注册逻辑: `src/Tools/registerRoute.ts`
- 页面渲染: `src/Tools/ToolsPage.tsx`
