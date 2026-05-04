// src/Tools/ToolStateManager.ts
import type { ToolState } from './types';

/**
 * 工具状态管理器
 * 负责保存和恢复工具的状态
 */
class ToolStateManager {
  private readonly STORAGE_KEY = 'tools-state';
  private readonly ACTIVE_TOOL_KEY = 'tools-active-tool';
  private states: Map<string, ToolState> = new Map();
  private activeToolId: string | null = null;

  constructor() {
    this.loadStates();
    this.loadActiveTool();
  }

  /**
   * 从 localStorage 加载所有状态
   */
  private loadStates() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.states = new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.error('加载工具状态失败:', error);
    }
  }

  private loadActiveTool() {
    try {
      const stored = localStorage.getItem(this.ACTIVE_TOOL_KEY);
      this.activeToolId = stored ?? null;
    } catch (error) {
      console.error('加载当前工具失败:', error);
      this.activeToolId = null;
    }
  }

  /**
   * 保存所有状态到 localStorage
   */
  private saveStates() {
    try {
      const obj = Object.fromEntries(this.states);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(obj));
    } catch (error) {
      console.error('保存工具状态失败:', error);
    }
  }

  /**
   * 保存工具状态
   */
  saveState(toolId: string, data: any) {
    this.states.set(toolId, {
      toolId,
      data,
      timestamp: Date.now(),
    });
    this.saveStates();
  }

  /**
   * 获取工具状态
   */
  getState(toolId: string): any | null {
    const state = this.states.get(toolId);
    return state ? state.data : null;
  }

  /**
   * 清除工具状态
   */
  clearState(toolId: string) {
    this.states.delete(toolId);
    this.saveStates();
  }

  /**
   * 清除所有状态
   */
  clearAllStates() {
    this.states.clear();
    localStorage.removeItem(this.STORAGE_KEY);
    this.setActiveTool(null);
  }

  setActiveTool(toolId: string | null) {
    this.activeToolId = toolId ?? null;
    try {
      if (toolId) {
        localStorage.setItem(this.ACTIVE_TOOL_KEY, toolId);
      } else {
        localStorage.removeItem(this.ACTIVE_TOOL_KEY);
      }
    } catch (error) {
      console.error('保存当前工具失败:', error);
    }
  }

  getActiveTool(): string | null {
    return this.activeToolId;
  }
}

// 导出单例
export const toolStateManager = new ToolStateManager();
