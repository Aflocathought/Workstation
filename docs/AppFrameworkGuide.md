# Workstation 应用框架使用指南

## 📋 框架概述

这个应用框架为您的 Workstation 时间追踪应用提供了完整的架构基础，包含以下核心模块：

### 🏗️ 核心架构组件

#### 1. **全局状态管理** (`AppStore.ts`)
- **功能**: 统一管理应用状态和用户设置
- **特性**:
  - 应用基本状态（加载、错误、初始化）
  - 用户界面状态（当前页面、选中项目等）
  - 用户设置（主题、语言、功能配置）
  - 设置持久化存储

```typescript
// 使用示例
import { appStore } from './core/AppStore';

// 更新状态
appStore.updateState({ isLoading: true });
appStore.setSelectedDate('2025-01-01');
appStore.updateSettings({ theme: 'dark' });
```

#### 2. **数据访问层** (`Repository.ts`)
- **功能**: 统一封装所有 Tauri 命令调用
- **特性**:
  - 类型安全的数据访问接口
  - 统一错误处理
  - 缓存机制
  - 批量操作支持

```typescript
// 使用示例
import { repository } from './core/Repository';

// 获取数据
const activities = await repository.getActivitiesForDay('2025-01-01');
const dbStats = await repository.getDatabaseStats();

// 使用缓存
const cached = await repository.getCached(
  'activities-today',
  () => repository.getActivitiesForDay(today),
  30000 // 30秒缓存
);
```

#### 3. **错误处理系统** (`ErrorHandlerSimple.ts`)
- **功能**: 全局错误管理和用户通知
- **特性**:
  - 多种通知类型（错误、警告、信息、成功）
  - 自动消失和手动消除
  - 异步操作包装器
  - 全局错误信号

```typescript
// 使用示例
import { errorManager } from './core/ErrorHandlerSimple';

// 显示通知
errorManager.error('操作失败', '无法连接到服务器');
errorManager.success('保存成功', '数据已保存');

// 包装异步操作
const result = await errorManager.withErrorHandling(
  () => repository.saveData(data),
  {
    successMessage: '数据保存成功',
    errorTitle: '保存失败',
    showLoading: true
  }
);
```

#### 4. **路由导航系统** (`Router.ts`)
- **功能**: 应用内导航和路由管理
- **特性**:
  - 基于 ID 的路由系统
  - 导航历史记录
  - 路由守卫支持
  - 面包屑导航

```typescript
// 使用示例
import { router } from './core/Router';

// 导航
router.navigate('dashboard');
router.navigate('settings');
router.goBack();

// 获取当前路由信息
const currentRoute = router.getCurrentRoute();
const canGoBack = router.canGoBack();
```

#### 5. **应用框架整合** (`AppFramework.ts`)
- **功能**: 统一初始化和管理所有框架组件
- **特性**:
  - 统一初始化流程
  - 全局事件监听
  - 启动状态检查
  - 键盘快捷键支持

```typescript
// 使用示例
import { initializeApp, useAppFramework } from './core/AppFramework';

// 应用启动时初始化
await initializeApp();

// 在组件中使用框架
const framework = useAppFramework();
const { store, repository, errorManager, router } = framework;
```

## 🚀 集成指南

### 1. 在主应用中集成框架

修改您的 `App.tsx`：

```typescript
// App.tsx
import { onMount } from 'solid-js';
import { initializeApp, useAppFramework } from './core/AppFramework';
import { useErrors } from './core/ErrorHandlerSimple';

function App() {
  const framework = useAppFramework();
  const { errors } = useErrors();
  
  onMount(async () => {
    await initializeApp();
  });

  // 使用框架状态
  const isLoading = () => framework.store.state.isLoading;
  const currentPage = () => framework.store.state.currentPage;
  
  return (
    <div>
      {/* 错误通知 */}
      <NotificationContainer errors={errors()} />
      
      {/* 导航栏 */}
      <Navigation router={framework.router} />
      
      {/* 主要内容 */}
      <Show when={!isLoading()} fallback={<LoadingSpinner />}>
        <MainContent page={currentPage()} />
      </Show>
    </div>
  );
}
```

### 2. 在组件中使用框架

```typescript
// components/Timeline.tsx
import { useAppFramework } from '../core/AppFramework';

export function Timeline() {
  const { store, repository, errorManager } = useAppFramework();
  
  const loadData = async () => {
    const result = await errorManager.withErrorHandling(
      () => repository.getActivitiesForDay(store.state.selectedDate),
      { 
        successMessage: '数据加载完成',
        showLoading: true 
      }
    );
    
    if (result) {
      // 处理数据
    }
  };
  
  return (
    <div>
      {/* 组件内容 */}
    </div>
  );
}
```

### 3. 添加新功能模块

```typescript
// 1. 在 AppStore 中添加新状态
// 2. 在 Repository 中添加新的数据访问方法
// 3. 在 Router 中添加新路由
// 4. 创建对应的组件

// 示例：添加统计功能
const statisticsRoute = {
  id: 'statistics',
  name: '统计报告',
  path: '/statistics',
  icon: '📈',
  description: '查看详细统计报告'
};

router.addRoute(statisticsRoute);
```

## 🛠️ 扩展建议

### 1. 主题系统
- 基于 AppStore 中的主题设置
- CSS 变量动态切换
- 深色/浅色模式支持

### 2. 插件系统
- 基于路由系统扩展新页面
- 通过 Repository 扩展新的数据源
- 事件总线支持插件通信

### 3. 数据同步
- 基于 Repository 的缓存机制
- 定时数据刷新
- 离线数据支持

### 4. 用户体验优化
- 基于 ErrorManager 的操作反馈
- 加载状态统一管理
- 键盘快捷键扩展

## 🎯 最佳实践

### 1. 状态管理
- 使用 AppStore 管理全局状态
- 组件级状态使用 SolidJS signals
- 避免深层 props 传递

### 2. 错误处理
- 所有异步操作使用 errorManager.withErrorHandling
- 用户友好的错误消息
- 提供操作重试机制

### 3. 数据访问
- 统一通过 Repository 访问数据
- 合理使用缓存避免重复请求
- 批量操作优化性能

### 4. 导航体验
- 使用路由系统统一导航
- 保持导航历史记录
- 提供面包屑导航

## 📚 下一步

1. **完善现有功能**: 将现有的 Timeline、CategoryManager 等组件迁移到新框架
2. **添加设置页面**: 基于 AppStore 的用户设置界面
3. **优化用户体验**: 添加加载动画、操作反馈等
4. **扩展新功能**: 统计报告、数据导出、自动化等

这个框架为您的应用提供了坚实的基础，可以支持未来的功能扩展和维护。