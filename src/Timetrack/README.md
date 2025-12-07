# Timeline (TimeTrack) 模块重构说明

## 📁 新的文件结构

```
src/Timeline/
├── TimeTrackPage.tsx              # 主容器组件（带子页面导航）
├── Dashboard.tsx                  # 时间轴仪表盘（原 TimeTrackPage）
├── TimeTrackCategory.tsx          # 分类管理页面（包装 CategoryManager）
├── Timeline.tsx                   # 时间轴核心组件
├── TimelineRenderer.tsx           # 时间轴渲染器
├── TimelineService.ts             # 时间轴服务
├── DatabaseSize.tsx               # 数据库大小显示
├── registerRoute.ts               # 路由注册
├── index.ts                       # 统一导出
├── TimeTrackPage.module.css       # 容器页面样式
├── TimeTrackCategory.module.css   # 分类页面样式
├── Dashboard.module.css           # Dashboard 样式 ✅ 已重命名
└── Timeline.module.css            # Timeline 组件样式 ✅ 已重命名
```

## 🎯 重构目标

将时间追踪模块改造为**包含多个子页面的功能模块**：

1. **timetrack** - 主容器页面（显示在主导航）
   - 包含子页面导航栏
   - 管理子页面的切换和渲染

2. **timetrack-dashboard** - 时间轴子页面（隐藏路由）
   - 原来的 TimeTrackPage 内容
   - 显示时间追踪时间轴
   - 当前活动窗口信息
   - 配色和布局控制

3. **timetrack-category** - 分类管理子页面（隐藏路由）
   - 包装 CategoryManager 组件
   - 应用分类配置
   - 颜色和项目分配

## 🔄 路由结构

### 主导航显示
```
⏱️ 时间追踪 (timetrack)  ← 显示在顶部主导航
```

### 子页面导航（在 TimeTrack 内部）
```
📊 时间轴 (timetrack-dashboard)
🏷️ 分类管理 (timetrack-category)
```

### 路由注册代码

```typescript
// src/Timeline/registerRoute.ts
export function registerTimeTrackRoutes() {
  // 主路由
  router.addRoute({
    id: 'timetrack',
    name: '时间追踪',
    path: '/timetrack',
    icon: '⏱️',
    description: '时间追踪和分类管理',
    component: () => import('./TimeTrackPage'),
  });

  // 子路由 1 - Dashboard（隐藏）
  router.addRoute({
    id: 'timetrack-dashboard',
    name: '时间轴',
    path: '/timetrack/dashboard',
    icon: '📊',
    description: '查看时间追踪时间轴',
    hidden: true,  // 不在主导航显示
  });

  // 子路由 2 - Category（隐藏）
  router.addRoute({
    id: 'timetrack-category',
    name: '分类管理',
    path: '/timetrack/category',
    icon: '🏷️',
    description: '管理应用分类和配置',
    hidden: true,  // 不在主导航显示
  });
}
```

## 🎨 组件结构

### 1. TimeTrackPage（容器）

```tsx
TimeTrackPage
├── SubNavigation (NavBar 组件)
│   ├── [📊 时间轴]
│   └── [🏷️ 分类管理]
└── Content Area
    ├── <Dashboard /> (when active)
    └── <TimeTrackCategory /> (when active)
```

**关键代码：**

```typescript
const TimeTrackPage: Component = () => {
  const subRoutes: NavItem[] = [
    { id: 'timetrack-dashboard', label: '时间轴', icon: '📊' },
    { id: 'timetrack-category', label: '分类管理', icon: '🏷️' },
  ];

  return (
    <div class={styles.timeTrackPage}>
      {/* 子页面导航 */}
      <NavBar
        items={subRoutes}
        activeId={activeSubRoute()}
        onNavigate={(id) => router.navigate(id)}
        variant="tabs"
      />

      {/* 子页面内容 */}
      <Suspense fallback={<LoadingSpinner />}>
        <Show when={activeSubRoute() === 'timetrack-dashboard'}>
          <Dashboard />
        </Show>
        <Show when={activeSubRoute() === 'timetrack-category'}>
          <TimeTrackCategory />
        </Show>
      </Suspense>
    </div>
  );
};
```

### 2. Dashboard（时间轴）

原 `TimeTrackPage.tsx` 的内容，包含：
- 当前活动窗口信息
- 配色模式选择（按应用/按分类）
- 布局模式选择（连续条/每小时柱状）
- 日期选择器
- 数据库大小显示
- Timeline 时间轴组件

### 3. TimeTrackCategory（分类管理）

包装 `CategoryManager` 组件，提供：
- 页面标题和描述
- CategoryManager 的所有功能
  - 应用别称管理
  - 项目分配
  - 分类颜色配置
  - 导入/导出功能

## 🚀 使用方式

### 在 App.tsx 中注册路由

```typescript
import { onMount } from 'solid-js';
import { registerTimeTrackRoutes } from './Timeline';

const App = () => {
  onMount(() => {
    registerTimeTrackRoutes();
  });

  return <div>{/* 应用内容 */}</div>;
};
```

### 导航流程

1. **用户点击主导航的"时间追踪"**
   - 导航到 `timetrack` 路由
   - 渲染 `TimeTrackPage` 容器
   - 默认显示 `timetrack-dashboard`

2. **用户点击子导航的"分类管理"**
   - 导航到 `timetrack-category` 路由
   - 在同一容器内切换到 `TimeTrackCategory` 组件

3. **用户点击其他主导航项**
   - 离开整个 TimeTrack 模块
   - 渲染其他页面

## 💡 设计亮点

### 1. 懒加载优化

```typescript
// 子页面组件按需加载
const Dashboard = lazy(() => import('./Dashboard'));
const TimeTrackCategory = lazy(() => import('./TimeTrackCategory'));
```

- ✅ 初始加载更快
- ✅ 用户切换时才下载对应页面
- ✅ 减少主包体积

### 2. 路由隐藏机制

```typescript
hidden: true  // 子路由不在主导航显示
```

- ✅ 主导航只显示 "时间追踪"
- ✅ 子导航显示 "时间轴" 和 "分类管理"
- ✅ 清晰的层级结构

### 3. 自动路由切换

```typescript
const activeSubRoute = () => {
  const current = router.current;
  // 访问主路由时，默认显示 dashboard
  if (current === 'timetrack') {
    return 'timetrack-dashboard';
  }
  return current;
};
```

- ✅ 访问 `/timetrack` 自动显示 Dashboard
- ✅ 访问 `/timetrack/category` 显示分类管理
- ✅ 无需额外配置

### 4. 复用 NavBar 组件

```typescript
// 使用统一的 NavBar 组件
<NavBar
  items={subRoutes}
  activeId={activeSubRoute()}
  onNavigate={(id) => router.navigate(id)}
  variant="tabs"
/>
```

- ✅ 样式统一
- ✅ 代码复用
- ✅ 易于维护

## 📊 对比优势

### 重构前
```
❌ TimeTrackPage - 所有功能混在一起
❌ CategoryManager - 独立页面，导航混乱
❌ 用户需要在主导航中切换
❌ 功能分散，不成体系
```

### 重构后
```
✅ TimeTrackPage - 清晰的容器组件
✅ Dashboard - 专注时间轴显示
✅ TimeTrackCategory - 专注分类管理
✅ 子导航在同一页面切换
✅ 功能模块化，层次清晰
```

## 🎯 扩展建议

### 添加新的子页面

1. 创建新组件（如 `TimeTrackStatistics.tsx`）
2. 在 `registerRoute.ts` 中注册路由
3. 在 `TimeTrackPage.tsx` 的 `subRoutes` 中添加导航项
4. 添加对应的 `<Show>` 渲染逻辑

示例：

```typescript
// 1. 注册路由
router.addRoute({
  id: 'timetrack-statistics',
  name: '统计分析',
  path: '/timetrack/statistics',
  icon: '📈',
  hidden: true,
});

// 2. 添加到子导航
const subRoutes: NavItem[] = [
  { id: 'timetrack-dashboard', label: '时间轴', icon: '📊' },
  { id: 'timetrack-category', label: '分类管理', icon: '🏷️' },
  { id: 'timetrack-statistics', label: '统计分析', icon: '📈' },  // 新增
];

// 3. 添加渲染逻辑
<Show when={activeSubRoute() === 'timetrack-statistics'}>
  <Statistics />
</Show>
```

## ✅ 总结

这次重构实现了：

1. ✅ 将 TimeTrack 改造为多子页面结构
2. ✅ Category 页面集成到 TimeTrack 中
3. ✅ Dashboard 独立为时间轴专用页面
4. ✅ 使用懒加载优化性能
5. ✅ 复用 NavBar 组件统一导航体验
6. ✅ 清晰的模块化结构，易于扩展

用户体验提升：
- 🎯 功能归类更清晰
- 🚀 页面切换更流畅
- 📱 导航层级更合理
- ⚡ 加载速度更快

代码质量提升：
- 🏗️ 组件职责单一
- 🔧 易于维护和扩展
- 📦 模块化程度高
- 🎨 代码结构清晰
