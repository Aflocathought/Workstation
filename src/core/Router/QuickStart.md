# 🚀 添加新路由快速指南

这是一个快速参考文档，帮助你在 5 分钟内为 Workstation 添加新路由和页面。

## ⚡ 快速开始（3 步）

### 1️⃣ 导入 router

在你的组件中：

```typescript
import { router, useRouter } from '../core/Router';
```

### 2️⃣ 添加新路由

**选项 A: 在 Routes.ts 中添加（适合固定路由）**

```typescript
// src/core/Router/Routes.ts
export const defaultRoutes: Route[] = [
  // ...现有路由
  {
    id: 'my-page',
    name: '我的页面',
    path: '/my-page',
    icon: '🎨',
    description: '这是我的新页面'
  }
];
```

**选项 B: 动态添加（适合功能模块）**

```typescript
// 在应用启动时
import { router } from './core/Router';

router.addRoute({
  id: 'my-page',
  name: '我的页面',
  path: '/my-page',
  icon: '🎨',
  description: '这是我的新页面'
});
```

### 3️⃣ 在组件中使用

```typescript
import { router } from '../core/Router';

// 导航到新页面
<button onClick={() => router.navigate('my-page')}>
  前往我的页面
</button>

// 显示当前路由
<p>当前: {router.current}</p>
```

**完成！** 新路由会自动出现在所有导航栏中 ✨

---

## 📚 常用代码片段

### 导航按钮

```typescript
import { router } from '../core/Router';

<button onClick={() => router.navigate('dashboard')}>
  前往仪表盘
</button>
```

### 返回按钮

```typescript
import { router } from '../core/Router';

<button 
  onClick={() => router.goBack()}
  disabled={!router.canGoBack()}
>
  返回
</button>
```

### 显示当前路由信息

```typescript
import { router } from '../core/Router';

const currentRoute = router.getCurrentRoute();
console.log(currentRoute?.name);  // "仪表盘"
console.log(currentRoute?.icon);  // "📊"
```

### 使用 useRouter Hook

```typescript
import { useRouter } from '../core/Router';

const MyComponent = () => {
  const { currentRoute, navigate, goBack, canGoBack } = useRouter();
  
  return (
    <div>
      <p>当前: {currentRoute()}</p>
      <button onClick={() => navigate('dashboard')}>首页</button>
      <button onClick={goBack} disabled={!canGoBack()}>返回</button>
    </div>
  );
};
```

### 渲染所有路由

```typescript
import { For } from 'solid-js';
import { router } from '../core/Router';

<For each={router.visibleRoutes}>
  {(route) => (
    <button onClick={() => router.navigate(route.id)}>
      {route.icon} {route.name}
    </button>
  )}
</For>
```

### 集成 NavBar 组件

```typescript
import { router } from '../core/Router';
import { NavBar, type NavItem } from './components/Layout/Navigation';

const navItems = (): NavItem[] =>
  router.visibleRoutes.map((route) => ({
    id: route.id,
    label: route.name,
    icon: route.icon,
    description: route.description,
  }));

<NavBar
  items={navItems()}
  activeId={router.current}
  onNavigate={(id) => router.navigate(id)}
  variant="tabs"
/>
```

---

## 🎯 完整示例：创建新功能页面

### 步骤 1: 创建功能文件夹

```bash
src/features/MyFeature/
├── MyFeaturePage.tsx
├── registerRoute.ts
└── index.ts
```

### 步骤 2: 创建页面组件

```typescript
// src/features/MyFeature/MyFeaturePage.tsx
import { Component } from 'solid-js';
import { useRouter } from '../../core/Router';

const MyFeaturePage: Component = () => {
  const { goBack, canGoBack } = useRouter();

  return (
    <div style={{ padding: '20px' }}>
      <h1>🎨 我的功能</h1>
      
      {canGoBack() && (
        <button onClick={goBack}>← 返回</button>
      )}
      
      <p>这是我的新功能页面！</p>
    </div>
  );
};

export default MyFeaturePage;
```

### 步骤 3: 注册路由

```typescript
// src/features/MyFeature/registerRoute.ts
import { router } from '../../core/Router';

export function registerMyFeatureRoute() {
  router.addRoute({
    id: 'my-feature',
    name: '我的功能',
    path: '/my-feature',
    icon: '🎨',
    description: '这是我的新功能',
    component: () => import('./MyFeaturePage'),
  });
}
```

### 步骤 4: 导出

```typescript
// src/features/MyFeature/index.ts
export { default as MyFeaturePage } from './MyFeaturePage';
export { registerMyFeatureRoute } from './registerRoute';
```

### 步骤 5: 在 App.tsx 中注册

```typescript
// src/App.tsx
import { onMount } from 'solid-js';
import { registerMyFeatureRoute } from './features/MyFeature';

const App = () => {
  onMount(() => {
    registerMyFeatureRoute();
  });

  return <div>{/* 你的应用 */}</div>;
};
```

**完成！** 🎉 新功能会自动出现在导航栏中。

---

## 🔗 相关文档

- 📖 **完整文档**: `src/core/Router/Router.usage.md`
- 💡 **NavBar 使用**: `src/components/Layout/Navigation/NavBar.usage.md`
- 📝 **示例模块**: `src/features/Reports/`

---

## ❓ 常见问题

### Q: 路由添加后没有出现在导航中？

A: 检查是否设置了 `hidden: true`，移除它或改为 `hidden: false`

### Q: 如何隐藏某个路由？

A: 设置 `hidden: true`：

```typescript
router.addRoute({
  id: 'admin',
  name: '管理',
  path: '/admin',
  hidden: true,  // 不在导航中显示
});
```

### Q: 如何更新路由信息？

A: 使用 `updateRoute` 方法：

```typescript
router.updateRoute('dashboard', {
  name: '新名称',
  icon: '🏠'
});
```

### Q: 如何移除路由？

A: 使用 `removeRoute` 方法：

```typescript
router.removeRoute('old-feature');
```

### Q: 如何获取所有路由（包括隐藏的）？

A: 使用 `allRoutes`：

```typescript
console.log(router.allRoutes);  // 包括 hidden: true 的路由
console.log(router.visibleRoutes);  // 只有可见的路由
```

---

## 💡 小技巧

1. **路由 ID 使用 kebab-case**: `my-feature` 而不是 `myFeature`
2. **提供有意义的 description**: 会显示在 tooltip 中
3. **使用 emoji 作为图标**: 简单且跨平台
4. **懒加载组件**: 使用 `component: () => import('./MyComponent')`
5. **批量注册路由**: 创建一个 `registerAllRoutes()` 函数

---

需要更多帮助？查看完整文档或参考 `src/features/Reports/` 示例！
