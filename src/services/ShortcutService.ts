// src/services/ShortcutService.ts
import { invoke } from '@tauri-apps/api/core';

/**
 * 修饰键状态
 */
export interface ModifierState {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
}

/**
 * 前台窗口信息
 */
export interface MonitorInfo {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  workLeft: number;
  workTop: number;
  workWidth: number;
  workHeight: number;
}

export interface ForegroundWindowInfo {
  title: string;
  className: string;
  processName: string;
  processId: number;
  monitor?: MonitorInfo | null;
}

/**
 * 快捷键服务
 * 提供与 Rust 后端通信的接口
 */
export class ShortcutService {
  /**
   * 获取当前修饰键状态
   */
  static async getModifierState(): Promise<ModifierState> {
    try {
      return await invoke<ModifierState>('get_modifier_state');
    } catch (error) {
      console.error('获取修饰键状态失败:', error);
      return {
        ctrl: false,
        alt: false,
        shift: false,
        win: false,
      };
    }
  }

  /**
   * 获取前台窗口信息
   */
  static async getForegroundWindow(): Promise<ForegroundWindowInfo | null> {
    try {
      return await invoke<ForegroundWindowInfo>('get_foreground_window');
    } catch (error) {
      console.error('获取前台窗口信息失败:', error);
      return null;
    }
  }

  /**
   * 检查指定按键是否被按下
   * @param keyCode 虚拟键码
   */
  static async isKeyPressed(keyCode: number): Promise<boolean> {
    try {
      return await invoke<boolean>('is_key_pressed', { keyCode });
    } catch (error) {
      console.error('检查按键状态失败:', error);
      return false;
    }
  }

  /**
   * 轮询修饰键状态
   * @param callback 状态变化回调
   * @param interval 轮询间隔（毫秒）
   * @returns 停止轮询的函数
   */
  static pollModifierState(
    callback: (state: ModifierState) => void,
    interval: number = 100
  ): () => void {
    let lastState: ModifierState = {
      ctrl: false,
      alt: false,
      shift: false,
      win: false,
    };

    const timerId = setInterval(async () => {
      const newState = await this.getModifierState();
      
      // 检查状态是否变化
      if (
        newState.ctrl !== lastState.ctrl ||
        newState.alt !== lastState.alt ||
        newState.shift !== lastState.shift ||
        newState.win !== lastState.win
      ) {
        lastState = newState;
        callback(newState);
      }
    }, interval);

    // 返回停止函数
    return () => clearInterval(timerId);
  }
}

/**
 * 虚拟键码常量（Windows）
 */
export const VirtualKeyCodes = {
  // 修饰键
  CTRL: 0x11,
  ALT: 0x12,
  SHIFT: 0x10,
  LWIN: 0x5B,
  RWIN: 0x5C,

  // 字母键
  A: 0x41,
  B: 0x42,
  C: 0x43,
  D: 0x44,
  E: 0x45,
  F: 0x46,
  G: 0x47,
  H: 0x48,
  I: 0x49,
  J: 0x4A,
  K: 0x4B,
  L: 0x4C,
  M: 0x4D,
  N: 0x4E,
  O: 0x4F,
  P: 0x50,
  Q: 0x51,
  R: 0x52,
  S: 0x53,
  T: 0x54,
  U: 0x55,
  V: 0x56,
  W: 0x57,
  X: 0x58,
  Y: 0x59,
  Z: 0x5A,

  // 数字键
  NUM_0: 0x30,
  NUM_1: 0x31,
  NUM_2: 0x32,
  NUM_3: 0x33,
  NUM_4: 0x34,
  NUM_5: 0x35,
  NUM_6: 0x36,
  NUM_7: 0x37,
  NUM_8: 0x38,
  NUM_9: 0x39,

  // 功能键
  F1: 0x70,
  F2: 0x71,
  F3: 0x72,
  F4: 0x73,
  F5: 0x74,
  F6: 0x75,
  F7: 0x76,
  F8: 0x77,
  F9: 0x78,
  F10: 0x79,
  F11: 0x7A,
  F12: 0x7B,

  // 特殊键
  ENTER: 0x0D,
  SPACE: 0x20,
  ESCAPE: 0x1B,
  TAB: 0x09,
  BACKSPACE: 0x08,
  DELETE: 0x2E,
  INSERT: 0x2D,
  HOME: 0x24,
  END: 0x23,
  PAGE_UP: 0x21,
  PAGE_DOWN: 0x22,

  // 方向键
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
} as const;
