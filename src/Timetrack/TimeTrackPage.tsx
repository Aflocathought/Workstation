// src/Timeline/TimeTrackPage.tsx
import { Component, Show, lazy, Suspense } from 'solid-js';
import { router } from '../core/Router';
import { NavBar, type NavItem } from '../components/Layout/Navigation';
import styles from './TimeTrackPage.module.css';

// 懒加载子页面
const Dashboard = lazy(() => import('./Dashboard/Dashboard'));
const TimeTrackCategory = lazy(() => import('./TimeTrackCategory'));

/**
 * TimeTrack 主容器组件
 * 包含子页面导航和内容区域
 */
const TimeTrackPage: Component = () => {
  // 子页面路由配置
  const subRoutes: NavItem[] = [
    {
      id: 'timetrack-dashboard',
      label: '时间轴',
      icon: '📊',
      description: '查看时间追踪时间轴',
    },
    {
      id: 'timetrack-category',
      label: '分类管理',
      icon: '🏷️',
      description: '管理应用分类配置',
    },
  ];

  // 获取当前激活的子路由
  const activeSubRoute = () => {
    const current = router.current;
    // 如果在 timetrack 主路由，默认显示 dashboard
    if (current === 'timetrack') {
      return 'timetrack-dashboard';
    }
    return current;
  };

  return (
    <div class={styles.timeTrackPage}>
      {/* 子页面导航 */}
      <div class={styles.subNavigation}>
        <NavBar
          items={subRoutes}
          activeId={activeSubRoute()}
          onNavigate={(id) => router.navigate(id)}
          direction="horizontal"
          variant="tabs"
          showIcon={true}
          showLabel={true}
        />
      </div>

      {/* 子页面内容区域 */}
      <div class={styles.content}>
        <Suspense fallback={
          <div class={styles.loading}>
            <div class={styles.spinner}></div>
            <p>加载中...</p>
          </div>
        }>
          <Show when={activeSubRoute() === 'timetrack-dashboard'}>
            <Dashboard />
          </Show>
          <Show when={activeSubRoute() === 'timetrack-category'}>
            <TimeTrackCategory />
          </Show>
        </Suspense>
      </div>
    </div>
  );
};

export default TimeTrackPage;
