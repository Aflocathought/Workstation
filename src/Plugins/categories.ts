// src/Tools/categories.ts
import type { CategoryInfo } from './types';
import { ToolCategory } from './types';
import { Component } from 'solid-js';

import Image from '@suid/icons-material/Image';
import Code from '@suid/icons-material/Code';
import BarChart from '@suid/icons-material/BarChart';
import Build from '@suid/icons-material/Build';

export const CATEGORY_ICONS: Record<ToolCategory, Component> = {
  [ToolCategory.MEDIA]: Image,
  [ToolCategory.DEVELOPMENT]: Code,
  [ToolCategory.PRODUCTIVITY]: BarChart,
  [ToolCategory.UTILITY]: Build,
};

/**
 * 工具分类配置
 * 定义所有可用的工具分类
 */
export const TOOL_CATEGORIES: CategoryInfo[] = [
  {
    id: ToolCategory.MEDIA,
    name: '媒体工具',
    icon: CATEGORY_ICONS[ToolCategory.MEDIA],
    description: '音视频处理和可视化工具',
  },
  {
    id: ToolCategory.DEVELOPMENT,
    name: '开发工具',
    icon: CATEGORY_ICONS[ToolCategory.DEVELOPMENT],
    description: '编程和开发相关工具',
  },
  {
    id: ToolCategory.PRODUCTIVITY,
    name: '生产力工具',
    icon: CATEGORY_ICONS[ToolCategory.PRODUCTIVITY],
    description: '提升工作效率的工具',
  },
  {
    id: ToolCategory.UTILITY,
    name: '实用工具',
    icon: CATEGORY_ICONS[ToolCategory.UTILITY],
    description: '日常实用小工具',
  },
];

/**
 * 根据分类 ID 获取分类信息
 */
export function getCategoryInfo(categoryId: ToolCategory): CategoryInfo | undefined {
  return TOOL_CATEGORIES.find((cat) => cat.id === categoryId);
}
