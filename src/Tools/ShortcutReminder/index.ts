// src/Tools/ShortcutReminder/index.ts
import type { ToolConfig } from '../types';
import { ToolCategory } from '../types';

/**
 * 快捷键提醒工具配置
 */
export const shortcutReminderConfig: ToolConfig = {
  id: 'tools-shortcut-reminder',
  name: '快捷键提醒',
  icon: '⌨️',
  description: '快捷键管理和悬浮提示工具',
  category: ToolCategory.PRODUCTIVITY,
  component: () => import('./SR'),
  saveState: false,
};
