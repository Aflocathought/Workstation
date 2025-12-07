// src/core/AppFramework.ts
/**
 * 应用框架整合 - 统一管理所有核心功能
 */

import { appStore } from './AppStore';
import { repository } from './Repository';
import { errorManager } from './ErrorHandlerSimple';
import { router } from './Router/Router';

export interface AppFramework {
  store: typeof appStore;
  repository: typeof repository;
  errorManager: typeof errorManager;
  router: typeof router;
}

// 应用框架初始化
class FrameworkInitializer {
  private initialized = false;
  
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      console.log('🚀 初始化应用框架...');
      
      // 1. 初始化应用状态管理
      await appStore.initialize();
      console.log('✅ 状态管理初始化完成');

      // 2. 设置错误处理
      this.setupErrorHandling();
      console.log('✅ 错误处理设置完成');

      // 3. 设置路由
      this.setupRouter();
      console.log('✅ 路由设置完成');

      // 4. 设置全局事件监听
      this.setupGlobalEventListeners();
      console.log('✅ 全局事件监听设置完成');

      this.initialized = true;
      console.log('🎉 应用框架初始化完成');
      
      return true;
    } catch (error) {
      console.error('❌ 应用框架初始化失败:', error);
      return false;
    }
  }

  private setupErrorHandling() {
    // 设置全局未处理错误捕获
    window.addEventListener('error', (event) => {
      errorManager.error(
        '脚本错误',
        `${event.filename}:${event.lineno} - ${event.message}`
      );
    });

    // 设置未处理的 Promise 拒绝
    window.addEventListener('unhandledrejection', (event) => {
      errorManager.error(
        'Promise 错误',
        event.reason?.message || event.reason?.toString() || '未知 Promise 错误'
      );
    });
  }

  private setupRouter() {
    // 设置路由变化监听
    router.setRouteChangeListener((routeId, route) => {
      console.log(`路由变化: ${routeId}`, route);
      
      // 保存路由状态
      router.saveRouteState();
      
      // 更新应用状态
      appStore.setPage(this.routeIdToPageNumber(routeId));
    });
  }

  private setupGlobalEventListeners() {
    // 窗口关闭前的清理工作
    window.addEventListener('beforeunload', () => {
      router.saveRouteState();
      // 这里可以添加其他清理逻辑
    });

    // 键盘快捷键
    window.addEventListener('keydown', (event) => {
      // Ctrl/Cmd + 数字键切换页面
      if ((event.ctrlKey || event.metaKey) && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        const pageNumber = parseInt(event.key);
        const routeId = this.pageNumberToRouteId(pageNumber);
        if (routeId) {
          router.navigate(routeId);
        }
      }
      
      // Alt + 左箭头 返回
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        router.goBack();
      }
    });
  }

  // 辅助方法：路由 ID 转页面号
  private routeIdToPageNumber(routeId: string): number {
    const mapping: Record<string, number> = {
      'dashboard': 1,
      'category': 2,
      'spectrum': 3,
      'settings': 4
    };
    return mapping[routeId] || 1;
  }

  // 辅助方法：页面号转路由 ID
  private pageNumberToRouteId(pageNumber: number): string | null {
    const mapping: Record<number, string> = {
      1: 'dashboard',
      2: 'category',
      3: 'spectrum',
      4: 'settings'
    };
    return mapping[pageNumber] || null;
  }
}

// 创建框架实例
const frameworkInitializer = new FrameworkInitializer();

// 导出应用框架
export const appFramework: AppFramework = {
  store: appStore,
  repository,
  errorManager,
  router
};

// 导出初始化函数
export const initializeApp = () => frameworkInitializer.initialize();

// 导出便捷的 hooks
export const useAppFramework = () => appFramework;

// 应用启动检查列表
export interface StartupChecklist {
  frameworkInitialized: boolean;
  databaseConnected: boolean;
  settingsLoaded: boolean;
  trackingReady: boolean;
}

export const getStartupStatus = async (): Promise<StartupChecklist> => {
  try {
    // 检查数据库连接
    const dbSize = await repository.getDatabaseSize();
    const databaseConnected = dbSize >= 0;

    return {
      frameworkInitialized: true, // 如果这个函数被调用，说明框架已初始化
      databaseConnected,
      settingsLoaded: true, // appStore 初始化时会加载设置
      trackingReady: appStore.state.isTracking || false,
    };
  } catch (error) {
    console.error('启动状态检查失败:', error);
    return {
      frameworkInitialized: false,
      databaseConnected: false,
      settingsLoaded: false,
      trackingReady: false,
    };
  }
};