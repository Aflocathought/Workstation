// src/Timeline/registerRoute.ts
import { router } from '../core/Router';

/**
 * 注册时间追踪功能路由
 * 在应用启动时调用此函数以注册时间追踪模块的所有路由
 */
export function registerTimeTrackRoutes() {
  // 主路由 - TimeTrack 容器页面
  router.addRoute({
    id: 'timetrack',
    name: '时间追踪',
    path: '/timetrack',
    icon: '⏱️',
    description: '时间追踪和分类管理',
    component: () => import('./TimeTrackPage'),
  });

  // 子路由 - 时间轴仪表盘（隐藏，不在主导航显示）
  router.addRoute({
    id: 'timetrack-dashboard',
    name: '时间轴',
    path: '/timetrack/dashboard',
    icon: '📊',
    description: '查看时间追踪时间轴',
    hidden: true,  // 隐藏，只在 TimeTrack 内部导航显示
  });

  // 子路由 - 分类管理（隐藏，不在主导航显示）
  router.addRoute({
    id: 'timetrack-category',
    name: '分类管理',
    path: '/timetrack/category',
    icon: '🏷️',
    description: '管理应用分类和配置',
    hidden: true,  // 隐藏，只在 TimeTrack 内部导航显示
  });

  console.log('✅ 时间追踪路由已注册 (主路由 + 2个子路由)');
}

/**
 * 移除时间追踪功能路由
 * 如果需要动态卸载此功能模块，可以调用此函数
 */
export function unregisterTimeTrackRoutes() {
  router.removeRoute('timetrack');
  router.removeRoute('timetrack-dashboard');
  router.removeRoute('timetrack-category');
  console.log('🗑️ 时间追踪路由已移除');
}

