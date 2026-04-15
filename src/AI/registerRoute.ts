// src/AI/registerRoute.ts
import { router } from '../core/Router';
import SmartToy from "@suid/icons-material/SmartToy";

/**
 * 注册 AI 工作流路由
 */
export function registerAIRoutes() {
  router.addRoute({
    id: 'ai',
    name: 'AI',
    path: '/ai',
    icon: SmartToy,
    description: 'AI 工作流编排器',
    component: () => import('./AIPage'),
  });

  console.log('✅ AI 路由已注册');
}

export function unregisterAIRoutes() {
  router.removeRoute('ai');
}
