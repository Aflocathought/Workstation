// src/Tools/ShortcutReminder/types.ts

/**
 * 修饰键类型
 */
export enum ModifierKey {
  CTRL = 'ctrl',
  ALT = 'alt',
  SHIFT = 'shift',
  WIN = 'win',
  CTRL_ALT = 'ctrl+alt',
  CTRL_SHIFT = 'ctrl+shift',
  ALT_SHIFT = 'alt+shift',
  CTRL_ALT_SHIFT = 'ctrl+alt+shift',
  NONE = 'none',
}

/**
 * 快捷键定义
 */
export interface ShortcutDefinition {
  key: string;           // 按键 (如 'A', 'F1', 'Enter' 等)
  description: string;   // 功能描述
  modifier: ModifierKey; // 修饰键组合
}

/**
 * 快捷键配置 (按修饰键分组)
 */
export interface ShortcutConfig {
  [ModifierKey.CTRL]: ShortcutDefinition[];
  [ModifierKey.ALT]: ShortcutDefinition[];
  [ModifierKey.SHIFT]: ShortcutDefinition[];
  [ModifierKey.WIN]: ShortcutDefinition[];
  [ModifierKey.CTRL_ALT]: ShortcutDefinition[];
  [ModifierKey.CTRL_SHIFT]: ShortcutDefinition[];
  [ModifierKey.ALT_SHIFT]: ShortcutDefinition[];
  [ModifierKey.CTRL_ALT_SHIFT]: ShortcutDefinition[];
  [ModifierKey.NONE]: ShortcutDefinition[];
}

/**
 * 当前按下的修饰键状态
 */
export interface ModifierState {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
}

/**
 * 导出/导入的配置数据格式
 */
export interface ShortcutConfigData {
  version: string;
  timestamp: number;
  config: ShortcutConfig;
  appConfigs?: Record<string, ShortcutConfig>;
}

/**
 * 快捷键配置映射（按应用划分）
 */
export type ShortcutConfigMap = Record<string, ShortcutConfig>;
