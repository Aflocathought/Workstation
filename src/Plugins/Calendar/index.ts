// src/Tools/Calendar/index.ts
import type { ToolConfig } from '../types';
import { ToolCategory } from '../types';
import Event from '@suid/icons-material/Event';

/**
 * 日历工具配置
 */
export const calendarToolConfig: ToolConfig = {
  id: 'tools-calendar',
  name: '日历管理',
  icon: Event,
  description: '创建日程、生成 .ics 文件、同步到 Gmail Calendar',
  category: ToolCategory.PRODUCTIVITY,
  component: () => import('./CalendarTool'),
  saveState: false,
};
