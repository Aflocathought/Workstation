// src/Tools/registerRoute.ts
import { router } from '../core/Router';
import type { ToolConfig } from './types';

// 自动导入所有工具配置
import { spectrumToolConfig } from './Spectrum';
import { pythonToolConfig } from './Python';
import { calendarToolConfig } from './Calendar';
import { shortcutReminderConfig } from './ShortcutReminder';
import { csvViewerToolConfig } from './CSVViewer';
import pdfLibraryToolConfig from './PDFLibrary';

/**
 * 所有工具配置集合
 * 新增工具时,只需导入并添加到此数组即可
 */
export const allToolConfigs: ToolConfig[] = [
  spectrumToolConfig,
  pythonToolConfig,
  calendarToolConfig,
  shortcutReminderConfig,
  csvViewerToolConfig,
  pdfLibraryToolConfig,
  // 未来新增工具配置添加在这里...
];

/**
 * 注册工具集合路由
 * 在应用启动时调用此函数以注册 Tools 模块的主路由
 * 注意:不再注册子路由,工具在页面内部切换
 */
export function registerToolsRoutes() {
  // 主路由 - Tools 容器页面
  router.addRoute({
    id: 'tools',
    name: '工具',
    path: '/tools',
    icon: '🔧',
    description: '实用工具集合',
    component: () => import('./ToolsPage'),
  });

  console.log(`✅ 工具路由已注册 (主路由, ${allToolConfigs.length}个工具)`);
}

/**
 * 移除工具集合路由
 */
export function unregisterToolsRoutes() {
  router.removeRoute('tools');
  console.log('🗑️ 工具路由已移除');
}

