// src/core/ThemeManager.ts
import { createSignal, createEffect, Accessor, Setter } from 'solid-js';
import { appStore } from './AppStore';

export type Theme = 'light' | 'dark' | 'auto';

class ThemeManager {
  private theme: Accessor<Theme>;
  private setTheme: Setter<Theme>;

  constructor() {
    // 创建主题信号
    const [themeSignal, setThemeSignal] = createSignal<Theme>('auto');
    this.theme = themeSignal;
    this.setTheme = setThemeSignal;
    
    // 从 localStorage 加载主题
    this.loadTheme();
    
    // 监听系统主题变化
    this.watchSystemTheme();
    
    // 应用主题
    createEffect(() => {
      this.applyTheme(this.theme());
    });
  }

  /**
   * 获取当前主题
   */
  get currentTheme(): Theme {
    return this.theme();
  }

  /**
   * 设置主题
   */
  setCurrentTheme(theme: Theme) {
    this.setTheme(theme);
    this.saveTheme(theme);
    appStore.updateSettings({ theme });
  }

  /**
   * 切换主题
   */
  toggleTheme() {
    const current = this.theme();
    const next: Theme = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
    this.setCurrentTheme(next);
  }

  /**
   * 应用主题到 DOM
   */
  private applyTheme(theme: Theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    
    // 同时更新 meta theme-color (移动端地址栏颜色)
    this.updateMetaThemeColor(theme);
  }

  /**
   * 更新 meta theme-color
   */
  private updateMetaThemeColor(theme: Theme) {
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }

    // 根据主题设置颜色
    const effectiveTheme = this.getEffectiveTheme(theme);
    const color = effectiveTheme === 'dark' ? '#1e1e1e' : '#ffffff';
    metaThemeColor.setAttribute('content', color);
  }

  /**
   * 获取实际生效的主题 (处理 auto 模式)
   */
  private getEffectiveTheme(theme: Theme): 'light' | 'dark' {
    if (theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }

  /**
   * 监听系统主题变化
   */
  private watchSystemTheme() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (this.theme() === 'auto') {
        // 强制重新应用主题以触发更新
        this.applyTheme('auto');
      }
    };

    // 现代浏览器
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // 旧版浏览器兼容
      mediaQuery.addListener(handleChange);
    }
  }

  /**
   * 从 localStorage 加载主题
   */
  private loadTheme() {
    try {
      const saved = localStorage.getItem('app-theme');
      if (saved && (saved === 'light' || saved === 'dark' || saved === 'auto')) {
        this.setTheme(saved as Theme);
      } else {
        // 默认使用 auto
        this.setTheme('auto');
      }
    } catch (error) {
      console.error('加载主题失败:', error);
      this.setTheme('auto');
    }
  }

  /**
   * 保存主题到 localStorage
   */
  private saveTheme(theme: Theme) {
    try {
      localStorage.setItem('app-theme', theme);
    } catch (error) {
      console.error('保存主题失败:', error);
    }
  }

  /**
   * 检查当前是否为深色模式
   */
  get isDark(): boolean {
    return this.getEffectiveTheme(this.theme()) === 'dark';
  }

  /**
   * 检查当前是否为浅色模式
   */
  get isLight(): boolean {
    return this.getEffectiveTheme(this.theme()) === 'light';
  }
}

// 导出单例
export const themeManager = new ThemeManager();
