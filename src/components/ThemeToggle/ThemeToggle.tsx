// src/components/ThemeToggle/ThemeToggle.tsx
import { Component } from 'solid-js';
import { themeManager, type Theme } from '../../core/ThemeManager';
import styles from './ThemeToggle.module.css';

const ThemeToggle: Component = () => {
  const currentTheme = (): Theme => themeManager.currentTheme;

  const handleToggle = () => {
    themeManager.toggleTheme();
  };

  const getIcon = () => {
    const theme = currentTheme();
    switch (theme) {
      case 'light':
        return '☀️';
      case 'dark':
        return '🌙';
      case 'auto':
        return '🔄';
      default:
        return '🔄';
    }
  };

  const getLabel = () => {
    const theme = currentTheme();
    switch (theme) {
      case 'light':
        return '浅色';
      case 'dark':
        return '深色';
      case 'auto':
        return '自动';
      default:
        return '自动';
    }
  };

  return (
    <button
      class={styles.themeToggle}
      onClick={handleToggle}
      title={`当前主题: ${getLabel()}`}
      aria-label="切换主题"
    >
      <span class={styles.icon}>{getIcon()}</span>
      <span class={styles.label}>{getLabel()}</span>
    </button>
  );
};

export default ThemeToggle;
