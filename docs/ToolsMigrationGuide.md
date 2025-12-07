# 🔄 工具系统迁移指南 (v1 → v2)

## 变化总览

| 特性 | v1 (旧版) | v2 (新版) |
|------|----------|----------|
| 导航方式 | 水平标签栏 | 可折叠侧边栏 |
| 切换方式 | 路由切换 | 页面内切换 |
| 分类 | ❌ 无 | ✅ 4个预定义分类 |
| 状态保存 | ❌ 无 | ✅ 自动保存 |
| 工具显示 | 全部并列 | 按分类折叠 |

## 🚀 迁移步骤

### Step 1: 更新工具配置

在每个工具的 `index.ts` 中添加 `category` 字段:

#### Before (v1)

```typescript
// Python/index.ts
export const pythonToolConfig: ToolConfig = {
  id: 'tools-python',
  name: 'Python 工具',
  icon: '🐍',
  description: 'Python 脚本执行工具',
  component: () => import('./PythonTool'),
};
```

#### After (v2)

```typescript
// Python/index.ts
import { ToolCategory } from '../types';  // ⬅️ 导入

export const pythonToolConfig: ToolConfig = {
  id: 'tools-python',
  name: 'Python 工具',
  icon: '🐍',
  description: 'Python 脚本执行工具',
  category: ToolCategory.DEVELOPMENT,  // ⬅️ 新增分类
  component: () => import('./PythonTool'),
  saveState: true,  // ⬅️ 新增状态保存选项
};
```

### Step 2: (可选) 添加状态保存支持

如果工具需要保存状态,在组件中实现状态接口:

#### Before (v1) - 无状态保存

```tsx
// Python/PythonTool.tsx
const PythonTool: Component = () => {
  const [code, setCode] = createSignal('');
  
  return <div>...</div>;
};
```

#### After (v2) - 支持状态保存

```tsx
// Python/PythonTool.tsx
interface PythonToolProps {
  ref?: (instance: any) => void;  // ⬅️ 新增 ref prop
}

const PythonTool: Component<PythonToolProps> = (props) => {
  const [code, setCode] = createSignal('');

  // ⬅️ 新增状态接口
  const instance = {
    getState: () => ({ code: code() }),
    setState: (state: any) => {
      if (state?.code) setCode(state.code);
    },
  };

  if (props.ref) {
    props.ref(instance);
  }

  return <div>...</div>;
};
```

### Step 3: 更新 registerRoute.ts

v2 不再注册子路由,简化注册逻辑:

#### Before (v1)

```typescript
export function registerToolsRoutes() {
  // 主路由
  router.addRoute({ ... });
  
  // 子路由 (需要手动为每个工具注册)
  allToolConfigs.forEach((config) => {
    router.addRoute({
      id: config.id,
      path: `/tools/${config.id}`,
      hidden: true,
      component: config.component,
    });
  });
}
```

#### After (v2)

```typescript
export function registerToolsRoutes() {
  // 只注册主路由,工具在页面内切换
  router.addRoute({
    id: 'tools',
    name: '工具',
    path: '/tools',
    icon: '🔧',
    component: () => import('./ToolsPage'),
  });
}
```

## 📝 迁移检查清单

### 必须修改

- [ ] 为每个工具配置添加 `category` 字段
- [ ] 导入 `ToolCategory` 枚举
- [ ] 更新 `registerRoute.ts` (移除子路由注册)

### 可选修改

- [ ] 添加 `saveState` 字段 (默认 false)
- [ ] 实现 `getState()` 和 `setState()` 方法
- [ ] 添加 `ref` prop 到工具组件

## 🎯 选择合适的分类

| 工具类型 | 推荐分类 | 示例 |
|---------|---------|------|
| 音视频处理 | `MEDIA` | 频谱分析、视频编辑 |
| 编程开发 | `DEVELOPMENT` | Python、代码格式化 |
| 文档处理 | `PRODUCTIVITY` | Markdown、表格 |
| 通用工具 | `UTILITY` | 计算器、时钟 |

## 🔧 常见问题

### Q1: 工具不显示在侧边栏?

**原因**: 没有指定 `category` 字段

**解决**:
```typescript
export const yourToolConfig: ToolConfig = {
  // ...
  category: ToolCategory.UTILITY,  // ⬅️ 添加这一行
};
```

### Q2: 状态没有保存?

**检查**:
1. 配置中 `saveState: true` 了吗?
2. 组件实现了 `getState()` 和 `setState()` 吗?
3. 通过 `props.ref` 暴露了实例吗?

### Q3: 切换工具时组件重新加载?

这是正常的! v2 在切换工具时会:
1. 卸载旧工具组件 (调用 `getState()` 保存状态)
2. 加载新工具组件 (调用 `setState()` 恢复状态)

### Q4: 如何禁用某个工具的状态保存?

```typescript
export const yourToolConfig: ToolConfig = {
  // ...
  saveState: false,  // ⬅️ 或者省略此字段 (默认 false)
};
```

## 📋 迁移示例

### 示例 1: 频谱分析工具

```typescript
// Spectrum/index.ts (v2)
import type { ToolConfig } from '../types';
import { ToolCategory } from '../types';

export const spectrumToolConfig: ToolConfig = {
  id: 'tools-spectrum',
  name: '频谱分析',
  icon: '🎵',
  description: '音频频谱可视化工具',
  category: ToolCategory.MEDIA,        // ⬅️ 新增
  component: () => import('./SpectrumTool'),
  saveState: false,                     // ⬅️ 新增 (不需要保存)
};
```

### 示例 2: Python 工具 (带状态保存)

```typescript
// Python/index.ts (v2)
import type { ToolConfig } from '../types';
import { ToolCategory } from '../types';

export const pythonToolConfig: ToolConfig = {
  id: 'tools-python',
  name: 'Python 工具',
  icon: '🐍',
  description: 'Python 脚本执行工具',
  category: ToolCategory.DEVELOPMENT,   // ⬅️ 新增
  component: () => import('./PythonTool'),
  saveState: true,                      // ⬅️ 新增 (需要保存代码)
};
```

```tsx
// Python/PythonTool.tsx (v2)
import { Component, createSignal } from 'solid-js';

interface PythonToolProps {
  ref?: (instance: any) => void;
}

const PythonTool: Component<PythonToolProps> = (props) => {
  const [code, setCode] = createSignal('print("Hello")');
  const [output, setOutput] = createSignal('');

  // ⬅️ 新增状态接口
  const instance = {
    getState: () => ({
      code: code(),
      output: output(),
    }),
    setState: (state: any) => {
      if (state?.code) setCode(state.code);
      if (state?.output) setOutput(state.output);
    },
  };

  if (props.ref) {
    props.ref(instance);
  }

  return (
    <div>
      <textarea value={code()} onInput={(e) => setCode(e.target.value)} />
      <button onClick={runCode}>运行</button>
      <pre>{output()}</pre>
    </div>
  );
};

export default PythonTool;
```

## ✅ 验证迁移

迁移完成后,检查以下内容:

1. **侧边栏显示** - 工具是否出现在正确的分类下?
2. **点击切换** - 点击工具是否能正常加载?
3. **状态保存** - 切换工具后再切换回来,状态是否恢复?
4. **关闭功能** - 点击 ✕ 按钮是否能关闭工具?

## 🎉 迁移完成!

现在你的工具系统已经升级到 v2,享受以下新特性:

- 🗂️ 分类管理
- 🔽 折叠面板
- 💾 状态保存
- 🚀 更好的用户体验

有问题? 查看 [`README_v2.md`](./README_v2.md) 或 [`ToolStateAPI.md`](../../docs/ToolStateAPI.md)
