// src/core/AppStore.ts
import { createSignal } from "solid-js";
import type { ColorMode, TimelineLayout } from "../Timetrack/Category/CategoryUtils";

export interface AppState {
  // 应用基本状态
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  
  // 用户界面状态
  currentPage: number;
  selectedDate: string;
  selectedApp: string | null;
  colorMode: ColorMode;
  layout: TimelineLayout;
  
  // 系统状态
  isTracking: boolean;
  lastUpdate: string | null;
}

export interface UserSettings {
  // 外观设置
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-CN' | 'en-US';
  
  // 功能设置
  trackingInterval: number; // 秒
  autoStart: boolean;
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  
  // 数据设置
  dataRetentionDays: number;
  backupEnabled: boolean;
  
  // 通知设置
  notificationsEnabled: boolean;
  soundEnabled: boolean;
}

// 默认应用状态
const defaultAppState: AppState = {
  isInitialized: false,
  isLoading: false,
  error: null,
  currentPage: 1,
  selectedDate: new Date().toISOString().split('T')[0],
  selectedApp: null,
  colorMode: "app",
  layout: "bar",
  isTracking: false,
  lastUpdate: null,
};

// 默认用户设置
const defaultUserSettings: UserSettings = {
  theme: 'light',
  language: 'zh-CN',
  trackingInterval: 2,
  autoStart: true,
  launchOnStartup: false,
  minimizeToTray: true,
  dataRetentionDays: 365,
  backupEnabled: false,
  notificationsEnabled: true,
  soundEnabled: false,
};

// 全局状态管理
class AppStore {
  private appState;
  private setAppState;
  private userSettings;
  private setUserSettings;

  constructor() {
    [this.appState, this.setAppState] = createSignal<AppState>(defaultAppState);
    [this.userSettings, this.setUserSettings] = createSignal<UserSettings>(defaultUserSettings);
  }

  // 应用状态访问器
  get state() { return this.appState(); }
  get settings() { return this.userSettings(); }

  // 状态更新方法
  updateState(updates: Partial<AppState>) {
    this.setAppState(prev => ({ ...prev, ...updates }));
  }

  updateSettings(updates: Partial<UserSettings>) {
    this.setUserSettings(prev => ({ ...prev, ...updates }));
    this.saveSettingsToStorage();
  }

  // 初始化应用
  async initialize() {
    this.updateState({ isLoading: true });
    
    try {
      await this.loadSettingsFromStorage();
      await this.initializeTracking();
      this.updateState({ 
        isInitialized: true, 
        isLoading: false,
        lastUpdate: new Date().toISOString()
      });
    } catch (error) {
      this.updateState({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : '初始化失败' 
      });
    }
  }

  // 错误处理
  setError(error: string | null) {
    this.updateState({ error });
  }

  clearError() {
    this.updateState({ error: null });
  }

  // 页面导航
  setPage(page: number) {
    this.updateState({ currentPage: page });
  }

  // 时间轴相关
  setSelectedDate(date: string) {
    this.updateState({ selectedDate: date });
  }

  setSelectedApp(app: string | null) {
    this.updateState({ selectedApp: app });
  }

  setColorMode(mode: ColorMode) {
    this.updateState({ colorMode: mode });
  }

  setLayout(layout: TimelineLayout) {
    this.updateState({ layout });
  }

  // 跟踪控制
  async startTracking() {
    try {
      this.updateState({ isTracking: true });
      // 调用后端启动跟踪的逻辑
    } catch (error) {
      this.setError('启动跟踪失败');
      this.updateState({ isTracking: false });
    }
  }

  async stopTracking() {
    try {
      this.updateState({ isTracking: false });
      // 调用后端停止跟踪的逻辑
    } catch (error) {
      this.setError('停止跟踪失败');
    }
  }

  // 设置持久化
  private async saveSettingsToStorage() {
    try {
      // 这里可以调用 Tauri 命令保存到文件或使用 localStorage
      localStorage.setItem('userSettings', JSON.stringify(this.userSettings()));
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }

  private async loadSettingsFromStorage() {
    try {
      const saved = localStorage.getItem('userSettings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.setUserSettings({ ...defaultUserSettings, ...settings });
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  private async initializeTracking() {
    // 根据用户设置初始化跟踪
    if (this.userSettings().autoStart) {
      await this.startTracking();
    }
  }
}

// 导出单例实例
export const appStore = new AppStore();