// src/Tools/index.ts
/**
 * 工具模块统一导出
 * 集中管理所有工具相关的组件和路由注册
 */

// 组件导出
export { default as ToolsPage } from './ToolsPage';
export { default as SpectrumTool } from './Spectrum/SpectrumTool';

// 路由注册
export { registerToolsRoutes, unregisterToolsRoutes } from './registerRoute';
