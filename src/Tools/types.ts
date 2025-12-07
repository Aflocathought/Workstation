// src/Tools/types.ts

/**
 * 工具分类枚举
 */
export enum ToolCategory {
  MEDIA = 'media',           // 媒体工具
  DEVELOPMENT = 'development', // 开发工具
  PRODUCTIVITY = 'productivity', // 生产力工具
  UTILITY = 'utility',       // 实用工具
}

/**
 * 工具分类信息
 */
export interface CategoryInfo {
  id: ToolCategory;
  name: string;
  icon: string;
  description: string;
}

/**
 * 工具配置接口
 * 每个工具需要导出符合此接口的配置对象
 */
export interface ToolConfig {
  /** 工具唯一标识 (建议格式: tools-xxx) */
  id: string;
  /** 工具显示名称 */
  name: string;
  /** 工具图标 (emoji 或图标类名) */
  icon: string;
  /** 工具描述 */
  description: string;
  /** 所属分类 */
  category: ToolCategory;
  /** 组件懒加载函数 */
  component: () => Promise<{ default: any }>;
  /** 是否需要保存状态 (默认 false) */
  saveState?: boolean;
}

/**
 * 工具实例状态
 */
export interface ToolState {
  toolId: string;
  data: any;
  timestamp: number;
}


