# 🔧 Tools 工具系统 v2.0

## 🎯 新特性

### ✨ 可折叠的分类侧边栏

- 📁 工具按**分类**组织 (媒体、开发、生产力、实用工具)
- 🔽 支持折叠/展开每个分类
- 🎯 点击工具在右侧容器中加载
- 💾 **自动保存工具状态**,切换时不丢失数据

### 🏗️ 系统架构

```
┌─────────────────────────────────────────────────┐
│              ToolsPage (主容器)                  │
├──────────────┬──────────────────────────────────┤
│              │                                  │
│  ToolsSidebar│     Content Container           │
│              │                                  │
│  📁 媒体工具  │     ┌────────────────────┐      │
│    ▼        │     │  Tool Header       │      │
│    🎵 频谱   │     ├────────────────────┤      │
│             │     │                    │      │
│  📁 开发工具  │     │  Tool Content      │      │
│    ▼        │     │  (当前激活的工具)    │      │
│    🐍 Python│ ◄──►│                    │      │
│             │     │  (支持状态保存)     │      │
│  📁 其他...  │     └────────────────────┘      │
└──────────────┴──────────────────────────────────┘
```

## 📋 快速开始

### 1. 添加新工具

#### Step 1: 创建工具目录和配置

```typescript
// src/Tools/Calculator/index.ts
import type { ToolConfig } from '../types';
import { ToolCategory } from '../types';

export const calculatorConfig: ToolConfig = {
  id: 'tools-calculator',
  name: '计算器',
  icon: '🔢',
  description: '简单的科学计算器',
  category: ToolCategory.PRODUCTIVITY,  // ⬅️ 指定分类
  component: () => import('./Calculator'),
  saveState: true,  // ⬅️ 是否保存状态
};
```

#### Step 2: 创建工具组件

```tsx
// src/Tools/Calculator/Calculator.tsx
import { Component, createSignal } from 'solid-js';

interface CalculatorProps {
  ref?: (instance: any) => void;
}

const Calculator: Component<CalculatorProps> = (props) => {
  const [expression, setExpression] = createSignal('');
  const [result, setResult] = createSignal('');

  // 状态保存接口
  const instance = {
    getState: () => ({
      expression: expression(),
      result: result(),
    }),
    setState: (state: any) => {
      if (state?.expression) setExpression(state.expression);
      if (state?.result) setResult(state.result);
    },
  };

  if (props.ref) {
    props.ref(instance);
  }

  return (
    <div>
      <h2>计算器</h2>
      <input 
        value={expression()} 
        onInput={(e) => setExpression(e.currentTarget.value)}
      />
      <div>结果: {result()}</div>
    </div>
  );
};

export default Calculator;
```

#### Step 3: 注册到系统

```typescript
// src/Tools/registerRoute.ts
import { calculatorConfig } from './Calculator';

export const allToolConfigs: ToolConfig[] = [
  spectrumToolConfig,
  pythonToolConfig,
  calculatorConfig,  // ⬅️ 添加到这里
];
```

**完成!** 🎉 工具会自动出现在对应的分类下。

## 🗂️ 工具分类

系统预定义了 4 个分类:

| 分类 | ID | 图标 | 说明 |
|------|----|----- |------|
| 媒体工具 | `MEDIA` | 🎨 | 音视频处理、可视化 |
| 开发工具 | `DEVELOPMENT` | 💻 | 编程、调试相关 |
| 生产力工具 | `PRODUCTIVITY` | 📊 | 提升工作效率 |
| 实用工具 | `UTILITY` | 🔧 | 日常小工具 |

### 修改分类

在 `src/Tools/categories.ts` 中添加或修改:

```typescript
export const TOOL_CATEGORIES: CategoryInfo[] = [
  {
    id: ToolCategory.YOUR_CATEGORY,
    name: '你的分类',
    icon: '🎯',
    description: '分类描述',
  },
];
```

## 💾 状态保存机制

### 工作原理

1. **用户切换工具** → 自动调用 `getState()` 保存状态
2. **用户打开工具** → 自动调用 `setState()` 恢复状态
3. **数据存储在** `localStorage` → 刷新页面不丢失

### 启用状态保存

```typescript
export const yourToolConfig: ToolConfig = {
  // ... 其他配置
  saveState: true,  // ⬅️ 启用
};
```

### 实现状态接口

你的工具组件需要实现:

```typescript
interface ToolStateInterface {
  getState: () => any;      // 返回要保存的状态
  setState: (state: any) => void;  // 恢复状态
}
```

详细 API 文档: [`docs/ToolStateAPI.md`](../docs/ToolStateAPI.md)

## 🎨 UI/UX 特性

### 侧边栏

- ✅ 可折叠的分类头部
- ✅ 显示每个分类下的工具数量
- ✅ 高亮当前激活的工具
- ✅ 悬停提示工具描述

### 工具容器

- ✅ 工具头部显示图标、名称、描述
- ✅ 关闭按钮 (✕) 退出工具并保存状态
- ✅ 空状态提示用户选择工具
- ✅ 懒加载工具组件

## 📦 文件结构

```
src/Tools/
├── types.ts                    # 类型定义 (ToolConfig, ToolCategory)
├── categories.ts               # 分类配置
├── registerRoute.ts            # 路由注册
├── ToolStateManager.ts         # 状态管理器
├── ToolsSidebar.tsx           # 侧边栏组件
├── ToolsSidebar.module.css
├── ToolsPage.tsx              # 主容器
├── ToolsPage.module.css
│
├── Spectrum/                   # 频谱工具
│   ├── index.ts               # 配置: spectrumToolConfig
│   ├── SpectrumTool.tsx
│   └── SpectrumTool.module.css
│
├── Python/                     # Python 工具
│   ├── index.ts               # 配置: pythonToolConfig
│   ├── PythonTool.tsx
│   └── PythonTool.module.css
│
└── YourTool/                   # 你的工具
    ├── index.ts               # 配置导出
    └── YourTool.tsx           # 工具组件
```

## 🔄 从 v1 到 v2 的变化

### v1 (旧版本)

- ❌ 水平标签导航
- ❌ 使用路由切换工具
- ❌ 不支持分类
- ❌ 无状态保存

### v2 (新版本)

- ✅ 垂直侧边栏,分类折叠
- ✅ 页面内切换,无路由
- ✅ 支持工具分类
- ✅ 自动状态保存

## 🎯 最佳实践

### 1. 选择合适的分类

```typescript
// 音视频工具 → MEDIA
category: ToolCategory.MEDIA

// 代码相关 → DEVELOPMENT
category: ToolCategory.DEVELOPMENT

// 文档、表格 → PRODUCTIVITY
category: ToolCategory.PRODUCTIVITY

// 其他小工具 → UTILITY
category: ToolCategory.UTILITY
```

### 2. 合理使用状态保存

```typescript
// ✅ 应该保存
saveState: true  // 文本编辑器、代码编辑器、表单

// ❌ 不需要保存
saveState: false // 纯展示工具、不可交互的工具
```

### 3. 状态数据结构

```typescript
// ✅ 好的状态结构
getState: () => ({
  code: '...',
  settings: { theme: 'dark' },
  timestamp: Date.now(),
})

// ❌ 避免保存大数据
getState: () => ({
  largeFile: '100MB 数据',  // ❌ 太大
  sensitiveToken: 'xxx',    // ❌ 敏感信息
})
```

## 🚀 示例工具

### 简单工具 (无状态)

```typescript
// Clock/index.ts
export const clockConfig: ToolConfig = {
  id: 'tools-clock',
  name: '时钟',
  icon: '🕐',
  category: ToolCategory.UTILITY,
  component: () => import('./Clock'),
  saveState: false,  // 不需要保存
};
```

### 复杂工具 (有状态)

```typescript
// Editor/index.ts
export const editorConfig: ToolConfig = {
  id: 'tools-editor',
  name: '文本编辑器',
  icon: '📝',
  category: ToolCategory.PRODUCTIVITY,
  component: () => import('./Editor'),
  saveState: true,  // 保存文本内容
};
```

## 📚 相关文档

- [状态保存 API](../docs/ToolStateAPI.md)
- [架构设计](../docs/ToolsAutoRegistration_Architecture.md)
- [快速入门](../docs/ToolsAutoRegistration.md)

## 🎉 总结

新的工具系统提供:

- 🗂️ **分类管理** - 工具井然有序
- 🔽 **折叠面板** - 节省空间
- 💾 **状态保存** - 无缝切换
- 🚀 **易扩展** - 添加工具只需 3 步

**核心理念**: 一个配置,自动分类,智能保存! 🎯
