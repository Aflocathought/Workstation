# Router 使用指南

## 📚 概述

Router 是一个轻量级的前端路由管理系统，提供了路由导航、历史管理、路由守卫等功能。

## 🏗️ 架构说明

### 核心文件

```
src/core/Router/
├── Router.ts        # 路由管理器核心实现
├── Routes.ts        # 默认路由配置
├── index.ts         # 统一导出入口
└── Router.usage.md  # 使用文档（本文件）
```

### 核心概念

1. **Route（路由）**：定义一个页面/视图的配置
2. **RouterManager（路由管理器）**：管理所有路由和导航逻辑的单例
3. **useRouter（路由 Hook）**：在组件中使用路由的便捷方法

## 📦 导入方式

### 推荐的导入方式（使用统一入口）

```typescript
// ✅ 推荐：从统一入口导入
import { router, useRouter, type Route } from '@/core/Router';
```

### 其他导入方式

```typescript
// ⚠️ 可以但不推荐：直接从具体文件导入
import { router } from '@/core/Router/Router';
import { defaultRoutes } from '@/core/Router/Routes';
```

## 🎯 创建新路由

### 方式 1：在 Routes.ts 中定义（推荐用于固定路由）

```typescript
// src/core/Router/Routes.ts
export const defaultRoutes: Route[] = [
  {
    id: 'dashboard',
    name: '仪表盘',
    path: '/dashboard',
    icon: '📊',
    description: '查看时间追踪数据和统计'
  },
  // ✅ 添加新路由
  {
    id: 'analytics',
    name: '数据分析',
    path: '/analytics',
    icon: '📈',
    description: '深度数据分析和报表'
  },
  {
    id: 'reports',
    name: '报告',
    path: '/reports',
    icon: '📄',
    description: '生成和查看报告',
    hidden: false  // 是否在导航中隐藏
  }
];
```

### 方式 2：动态添加路由（推荐用于插件/模块化功能）

```typescript
// src/features/MyFeature/registerRoute.ts
import { router, type Route } from '@/core/Router';

export function registerMyFeatureRoutes() {
  // 添加单个路由
  router.addRoute({
    id: 'my-feature',
    name: '我的功能',
    path: '/my-feature',
    icon: '🎨',
    description: '自定义功能模块',
    component: () => import('./MyFeatureComponent')  // 懒加载组件
  });

  // 添加多个路由
  const routes: Route[] = [
    {
      id: 'feature-a',
      name: '功能 A',
      path: '/feature-a',
      icon: '🔧'
    },
    {
      id: 'feature-b',
      name: '功能 B',
      path: '/feature-b',
      icon: '🔨',
      hidden: true  // 隐藏路由，不在导航中显示
    }
  ];

  routes.forEach(route => router.addRoute(route));
}

// 在应用启动时调用
// src/App.tsx
import { registerMyFeatureRoutes } from './features/MyFeature/registerRoute';

registerMyFeatureRoutes();
```

## 🧭 在组件中使用路由

### 方式 1：直接使用 router 实例（简单场景）

```typescript
// src/components/MyComponent.tsx
import { Component } from 'solid-js';
import { router } from '@/core/Router';

const MyComponent: Component = () => {
  const handleNavigate = () => {
    // 导航到指定路由
    router.navigate('analytics');
  };

  const handleBack = () => {
    // 返回上一个路由
    router.goBack();
  };

  return (
    <div>
      <p>当前路由: {router.current}</p>
      <button onClick={handleNavigate}>前往分析页</button>
      <button onClick={handleBack} disabled={!router.canGoBack()}>
        返回
      </button>
    </div>
  );
};
```

### 方式 2：使用 useRouter Hook（推荐，更语义化）

```typescript
// src/components/MyComponent.tsx
import { Component } from 'solid-js';
import { useRouter } from '@/core/Router';

const MyComponent: Component = () => {
  const { 
    currentRoute, 
    navigate, 
    goBack, 
    canGoBack,
    getCurrentRoute,
    visibleRoutes
  } = useRouter();

  return (
    <div>
      <p>当前路由: {currentRoute()}</p>
      <p>路由信息: {getCurrentRoute()?.name}</p>
      
      <button onClick={() => navigate('analytics')}>前往分析页</button>
      <button onClick={goBack} disabled={!canGoBack()}>返回</button>
      
      {/* 显示所有可见路由 */}
      <ul>
        {visibleRoutes().map(route => (
          <li onClick={() => navigate(route.id)}>
            {route.icon} {route.name}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

### 方式 3：集成 NavBar 组件（最佳实践）

```typescript
// src/components/MyNavigation.tsx
import { Component } from 'solid-js';
import { router } from '@/core/Router';
import { NavBar, type NavItem } from '@/components/Layout/Navigation';

const MyNavigation: Component = () => {
  // 将路由转换为 NavBar 所需的数据格式
  const navItems = (): NavItem[] =>
    router.visibleRoutes.map((route) => ({
      id: route.id,
      label: route.name,
      icon: route.icon,
      description: route.description,
    }));

  return (
    <NavBar
      items={navItems()}
      activeId={router.current}
      onNavigate={(id) => router.navigate(id)}
      direction="horizontal"
      variant="tabs"
      showIcon={true}
      showLabel={true}
    />
  );
};
```

## 🎨 完整示例：创建一个新功能模块

### 步骤 1：创建功能模块文件夹

```
src/features/Analytics/
├── AnalyticsPage.tsx      # 页面组件
├── registerRoute.ts        # 路由注册
└── index.ts                # 导出入口
```

### 步骤 2：创建页面组件

```typescript
// src/features/Analytics/AnalyticsPage.tsx
import { Component } from 'solid-js';
import { useRouter } from '@/core/Router';

const AnalyticsPage: Component = () => {
  const { currentRoute, goBack, canGoBack } = useRouter();

  return (
    <div style={{ padding: '20px' }}>
      <h1>📈 数据分析</h1>
      <p>当前路由: {currentRoute()}</p>
      
      {canGoBack() && (
        <button onClick={goBack}>← 返回</button>
      )}
      
      {/* 你的分析内容 */}
      <div>
        <h2>用户统计</h2>
        <p>这里显示各种数据分析图表...</p>
      </div>
    </div>
  );
};

export default AnalyticsPage;
```

### 步骤 3：注册路由

```typescript
// src/features/Analytics/registerRoute.ts
import { router } from '@/core/Router';

export function registerAnalyticsRoute() {
  router.addRoute({
    id: 'analytics',
    name: '数据分析',
    path: '/analytics',
    icon: '📈',
    description: '深度数据分析和报表',
    component: () => import('./AnalyticsPage'),  // 懒加载
  });
}
```

### 步骤 4：在应用启动时注册

```typescript
// src/App.tsx 或 src/main.tsx
import { registerAnalyticsRoute } from './features/Analytics/registerRoute';

// 在应用初始化时注册路由
registerAnalyticsRoute();

// 或者批量注册
function registerAllFeatureRoutes() {
  registerAnalyticsRoute();
  // registerOtherFeatureRoutes();
}

registerAllFeatureRoutes();
```

### 步骤 5：在导航中使用

路由注册后会自动出现在 `router.visibleRoutes` 中，所有使用 NavBar 的地方都会自动显示新路由！

## 🔒 路由守卫（高级功能）

### 添加权限检查

```typescript
// src/guards/authGuard.ts
import { routeGuards, type RouteGuard } from '@/core/Router';

const authGuard: RouteGuard = {
  canActivate: async (routeId: string) => {
    // 检查用户是否有权限访问此路由
    if (routeId === 'admin') {
      const isAdmin = await checkUserIsAdmin();
      if (!isAdmin) {
        alert('您没有权限访问此页面');
        return false;
      }
    }
    return true;
  },
  
  canDeactivate: async (routeId: string) => {
    // 离开路由前的确认
    if (routeId === 'editor') {
      const hasUnsavedChanges = checkUnsavedChanges();
      if (hasUnsavedChanges) {
        return confirm('您有未保存的更改，确定要离开吗？');
      }
    }
    return true;
  }
};

// 注册守卫
routeGuards.addGuard(authGuard);
```

### 使用守卫的导航

```typescript
import { router, routeGuards } from '@/core/Router';

async function navigateWithGuard(routeId: string) {
  // 检查是否可以离开当前路由
  const canLeave = await routeGuards.canDeactivate(router.current);
  if (!canLeave) {
    return;
  }

  // 检查是否可以进入目标路由
  const canEnter = await routeGuards.canActivate(routeId);
  if (!canEnter) {
    return;
  }

  // 执行导航
  router.navigate(routeId);
}
```

## 📋 常用 API 参考

### Router 实例方法

| 方法 | 说明 | 示例 |
|------|------|------|
| `router.current` | 获取当前路由 ID | `router.current // 'dashboard'` |
| `router.navigate(id)` | 导航到指定路由 | `router.navigate('analytics')` |
| `router.goBack()` | 返回上一个路由 | `router.goBack()` |
| `router.canGoBack()` | 是否可以返回 | `router.canGoBack() // true/false` |
| `router.visibleRoutes` | 获取所有可见路由 | `router.visibleRoutes` |
| `router.allRoutes` | 获取所有路由（包括隐藏） | `router.allRoutes` |
| `router.getCurrentRoute()` | 获取当前路由对象 | `router.getCurrentRoute()` |
| `router.addRoute(route)` | 添加新路由 | `router.addRoute({...})` |
| `router.removeRoute(id)` | 移除路由 | `router.removeRoute('old-feature')` |
| `router.updateRoute(id, updates)` | 更新路由 | `router.updateRoute('dashboard', { icon: '🏠' })` |

### Route 接口

```typescript
interface Route {
  id: string;              // 唯一标识符（必需）
  name: string;            // 显示名称（必需）
  path: string;            // 路由路径（必需）
  component?: () => any;   // 懒加载组件
  icon?: string;           // 图标
  description?: string;    // 描述（tooltip）
  hidden?: boolean;        // 是否隐藏
}
```

## 💡 最佳实践

### ✅ 推荐做法

1. **使用统一导入入口**
   ```typescript
   import { router, useRouter, type Route } from '@/core/Router';
   ```

2. **固定路由写在 Routes.ts，动态路由用 addRoute**
   ```typescript
   // 核心路由 → Routes.ts
   // 功能模块路由 → registerRoute.ts
   ```

3. **使用 NavBar 组件来渲染导航**
   ```typescript
   // 不要手动遍历路由创建按钮，使用 NavBar
   <NavBar items={navItems()} ... />
   ```

4. **路由 ID 使用 kebab-case**
   ```typescript
   id: 'data-analysis'  // ✅
   id: 'dataAnalysis'   // ⚠️
   id: 'DataAnalysis'   // ❌
   ```

5. **提供有意义的 description**
   ```typescript
   description: '深度数据分析和报表生成'  // ✅
   description: '分析'                    // ❌
   ```

### ❌ 避免的做法

1. **不要直接修改 router.routes**
   ```typescript
   // ❌ 错误
   router.routes.push(newRoute);
   
   // ✅ 正确
   router.addRoute(newRoute);
   ```

2. **不要创建多个 RouterManager 实例**
   ```typescript
   // ❌ 错误
   const myRouter = new RouterManager();
   
   // ✅ 正确
   import { router } from '@/core/Router';
   ```

3. **不要在组件中硬编码路由 ID**
   ```typescript
   // ❌ 不灵活
   <button onClick={() => router.navigate('dashboard')}>首页</button>
   
   // ✅ 更灵活
   const routes = router.visibleRoutes;
   const homeRoute = routes.find(r => r.id === 'dashboard');
   <button onClick={() => router.navigate(homeRoute.id)}>{homeRoute.name}</button>
   ```

## 🔧 调试技巧

### 查看当前路由状态

```typescript
// 在浏览器控制台
console.log('当前路由:', router.current);
console.log('所有路由:', router.allRoutes);
console.log('可见路由:', router.visibleRoutes);
console.log('导航历史:', router.getHistory());
console.log('面包屑:', router.getBreadcrumb());
```

### 监听路由变化

```typescript
// 在应用初始化时
router.setRouteChangeListener((routeId, route) => {
  console.log('路由变化:', routeId, route);
  
  // 可以在这里做：
  // - 页面标题更新
  // - 分析埋点
  // - 权限检查
  // - 加载数据
});
```

## 📦 项目中的实际应用

### 当前使用 Router 的组件

1. **Navigation.tsx** - 主导航栏
2. **TitleBar.tsx** - 标题栏导航按钮
3. **App.tsx** - 根据路由渲染对应组件

### 添加新功能的典型流程

1. 创建功能文件夹：`src/features/MyFeature/`
2. 创建页面组件：`MyFeaturePage.tsx`
3. 注册路由：`registerRoute.ts`
4. 在 App.tsx 中调用注册函数
5. 自动出现在所有导航中 ✨

就这么简单！🎉
