# Tools 模块自动注册机制

## 📋 概述

本模块采用**基于约定的自动注册系统**,每个工具只需在其目录下的 `index.ts` 导出配置,即可自动完成路由注册和页面渲染,无需重复定义。

## 🎯 核心优势

- ✅ **单一数据源**: 每个工具只需定义一次配置
- ✅ **自动化**: 路由注册和页面渲染完全自动化
- ✅ **类型安全**: TypeScript 类型约束确保配置正确
- ✅ **易扩展**: 新增工具只需 2 步操作

---

## 📁 文件结构

```
src/Tools/
├── types.ts                    # 工具配置类型定义
├── registerRoute.ts            # 自动注册路由逻辑
├── ToolsPage.tsx              # 工具容器页面(自动渲染)
├── Spectrum/                   # 频谱工具
│   ├── index.ts               # 导出 spectrumToolConfig
│   └── SpectrumTool.tsx
├── Python/                     # Python 工具
│   ├── index.ts               # 导出 pythonToolConfig
│   └── PythonTool.tsx
└── NewTool/                    # 未来新增工具
    ├── index.ts               # 导出 newToolConfig
    └── NewTool.tsx
```

---

## 🔧 新增工具步骤

### 第 1 步: 创建工具目录和配置

在 `src/Tools/` 下创建新工具目录,例如 `Calculator/`:

```typescript
// src/Tools/Calculator/index.ts
import type { ToolConfig } from '../types';

export const calculatorToolConfig: ToolConfig = {
  id: 'tools-calculator',           // 唯一标识(必须以 tools- 开头)
  name: '计算器',                    // 显示名称
  icon: '🔢',                        // 图标(emoji 或图标类)
  description: '简单的科学计算器',    // 描述信息
  component: () => import('./Calculator'), // 懒加载组件
};
```

```tsx
// src/Tools/Calculator/Calculator.tsx
import { Component } from 'solid-js';

const Calculator: Component = () => {
  return <div>计算器工具内容</div>;
};

export default Calculator;
```

### 第 2 步: 在 `registerRoute.ts` 中导入配置

```typescript
// src/Tools/registerRoute.ts
import { calculatorToolConfig } from './Calculator';  // ⬅️ 导入新工具配置

const allToolConfigs: ToolConfig[] = [
  spectrumToolConfig,
  pythonToolConfig,
  calculatorToolConfig,  // ⬅️ 添加到数组
];
```

**就这样!** 🎉 新工具会自动:
- ✅ 注册路由 `/tools/calculator`
- ✅ 在工具页面导航栏显示
- ✅ 点击后懒加载并渲染组件

---

## 📝 ToolConfig 接口说明

```typescript
export interface ToolConfig {
  /** 工具唯一标识 (建议格式: tools-xxx) */
  id: string;

  /** 工具显示名称 */
  name: string;

  /** 工具图标 (emoji 或图标类名) */
  icon: string;

  /** 工具描述 */
  description: string;

  /** 组件懒加载函数 */
  component: () => Promise<{ default: any }>;
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 路由 ID,建议格式 `tools-xxx` |
| `name` | string | ✅ | 在导航栏显示的名称 |
| `icon` | string | ✅ | Emoji 或图标类名 |
| `description` | string | ✅ | 工具功能描述 |
| `component` | Function | ✅ | 懒加载函数,返回组件模块 |

---

## 🔄 工作原理

### 1. 路由自动注册

`registerRoute.ts` 遍历 `allToolConfigs` 数组,为每个工具自动生成路由:

```typescript
allToolConfigs.forEach((config) => {
  const routePath = `/tools/${config.id.replace('tools-', '')}`;
  router.addRoute({
    id: config.id,
    name: config.name,
    path: routePath,
    icon: config.icon,
    description: config.description,
    hidden: true,  // 隐藏主导航,只在工具页面内显示
    component: config.component,
  });
});
```

### 2. 导航栏自动生成

`ToolsPage.tsx` 从 `allToolConfigs` 生成导航项:

```typescript
const subRoutes: NavItem[] = allToolConfigs.map((config) => ({
  id: config.id,
  label: config.name,
  icon: config.icon,
  description: config.description,
}));
```

### 3. 组件自动渲染

根据当前路由动态加载对应组件:

```tsx
<For each={allToolConfigs}>
  {(config) => (
    <Show when={activeSubRoute() === config.id}>
      {(() => {
        const LazyComponent = config.component as any;
        return <LazyComponent />;
      })()}
    </Show>
  )}
</For>
```

---

## 🎨 使用示例

### 示例 1: 添加 Markdown 编辑器工具

```typescript
// src/Tools/Markdown/index.ts
import type { ToolConfig } from '../types';

export const markdownToolConfig: ToolConfig = {
  id: 'tools-markdown',
  name: 'Markdown 编辑器',
  icon: '📝',
  description: '在线 Markdown 编辑和预览',
  component: () => import('./MarkdownEditor'),
};
```

然后在 `registerRoute.ts` 中添加:

```typescript
import { markdownToolConfig } from './Markdown';

const allToolConfigs: ToolConfig[] = [
  spectrumToolConfig,
  pythonToolConfig,
  markdownToolConfig,  // ⬅️ 新增
];
```

### 示例 2: 添加图片压缩工具

```typescript
// src/Tools/ImageCompressor/index.ts
import type { ToolConfig } from '../types';

export const imageCompressorConfig: ToolConfig = {
  id: 'tools-image-compressor',
  name: '图片压缩',
  icon: '🖼️',
  description: '在线压缩图片,减小文件大小',
  component: () => import('./ImageCompressor'),
};
```

---

## 📊 对比:旧方式 vs 新方式

### 旧方式(手动维护多处)

```typescript
// ❌ 需要在 3 个地方重复定义

// 1️⃣ registerRoute.ts
router.addRoute({
  id: 'tools-calculator',
  name: '计算器',
  path: '/tools/calculator',
  icon: '🔢',
  description: '计算器工具',
  hidden: true,
});

// 2️⃣ ToolsPage.tsx
const subRoutes = [
  {
    id: 'tools-calculator',
    label: '计算器',
    icon: '🔢',
    description: '计算器工具',
  },
];

// 3️⃣ ToolsPage.tsx
<Show when={current === 'tools-calculator'}>
  <Calculator />
</Show>
```

### 新方式(只定义一次)

```typescript
// ✅ 只需在 1 个地方定义

// Calculator/index.ts
export const calculatorToolConfig: ToolConfig = {
  id: 'tools-calculator',
  name: '计算器',
  icon: '🔢',
  description: '计算器工具',
  component: () => import('./Calculator'),
};

// registerRoute.ts (只需导入)
import { calculatorToolConfig } from './Calculator';
const allToolConfigs = [calculatorToolConfig];
```

---

## 🚀 扩展性

如果未来需要更复杂的配置,只需扩展 `ToolConfig` 接口:

```typescript
export interface ToolConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  component: () => Promise<{ default: any }>;
  
  // 未来扩展字段
  category?: string;          // 工具分类
  tags?: string[];            // 标签
  requiredPermissions?: [];   // 权限要求
  experimental?: boolean;     // 实验性功能标记
}
```

---

## ✅ 总结

这套自动注册机制让你:
1. **减少重复代码**: 每个工具只需定义一次配置
2. **降低出错概率**: 避免多处维护导致的不一致
3. **提升开发效率**: 新增工具只需 2 步操作
4. **保持类型安全**: TypeScript 确保配置正确

只需记住:**一个工具 = 一个配置导出 + 在数组中注册** 🎯
