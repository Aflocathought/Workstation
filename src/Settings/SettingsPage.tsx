// src/Settings/SettingsPage.tsx
import { Component, createSignal, createEffect, onMount } from 'solid-js';
import { useAppFramework } from '../core/AppFramework';
import { themeManager, type Theme } from '../core/ThemeManager';
import styles from './SettingsPage.module.css';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  for (const u of units) {
    if (v < 1024) return `${v.toFixed(2)} ${u}`;
    v /= 1024;
  }
  return `${v.toFixed(2)} PB`;
}

const SettingsPage: Component = () => {
  const framework = useAppFramework();
  const [dbSize, setDbSize] = createSignal<number | null>(null);
  const [currentTheme, setCurrentTheme] = createSignal<Theme>(themeManager.currentTheme);

  // 获取数据库大小
  async function fetchDatabaseSize() {
    const result = await framework.errorManager.withErrorHandling(
      async () => await framework.repository.getDatabaseSize(),
      {
        errorTitle: '获取数据库大小失败',
        showLoading: false
      }
    );
    
    if (result !== null && result !== undefined) {
      setDbSize(result);
    }
  }

  // 初始化时加载数据库大小
  createEffect(() => {
    fetchDatabaseSize();
  });

  // 监听主题变化
  createEffect(() => {
    setCurrentTheme(themeManager.currentTheme);
  });

  // 同步开机自启状态
  onMount(async () => {
    const enabled = await framework.errorManager.withErrorHandling(
      () => framework.repository.isLaunchOnStartupEnabled(),
      {
        errorTitle: '获取开机自启状态失败',
        showLoading: false,
      }
    );

    if (typeof enabled === 'boolean') {
      framework.store.updateSettings({ launchOnStartup: enabled });
    }
  });

  // 主题切换处理
  const handleThemeChange = (theme: Theme) => {
    themeManager.setCurrentTheme(theme);
    setCurrentTheme(theme);
    framework.store.updateSettings({ theme });
  };

  // 获取主题显示名称
  const getThemeLabel = (theme: Theme): string => {
    switch (theme) {
      case 'light': return '☀️ 浅色';
      case 'dark': return '🌙 深色';
      case 'auto': return '🔄 自动';
    }
  };

  // 跟踪间隔选项
  const trackingIntervals = [
    { value: 1, label: '1 秒 (高精度)' },
    { value: 2, label: '2 秒 (推荐)' },
    { value: 5, label: '5 秒' },
    { value: 10, label: '10 秒' },
  ];

  // 数据保留天数选项
  const retentionOptions = [
    { value: 30, label: '30 天' },
    { value: 90, label: '90 天' },
    { value: 180, label: '180 天' },
    { value: 365, label: '1 年' },
    { value: 730, label: '2 年' },
    { value: -1, label: '永久' },
  ];

  return (
    <div class={styles.settingsPage}>
      <div class={styles.container}>
        <h1 class={styles.title}>⚙️ 设置</h1>
        <p class={styles.subtitle}>配置你的工作站应用</p>

        {/* 外观设置 */}
        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>🎨 外观</h2>
          
          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>主题模式</label>
              <p class={styles.settingDescription}>
                选择浅色、深色或跟随系统主题
              </p>
            </div>
            <div class={styles.settingControl}>
              <div class={styles.themeButtons}>
                {(['light', 'dark', 'auto'] as Theme[]).map((theme) => (
                  <button
                    class={styles.themeButton}
                    classList={{ [styles.active]: currentTheme() === theme }}
                    onClick={() => handleThemeChange(theme)}
                  >
                    {getThemeLabel(theme)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>语言</label>
              <p class={styles.settingDescription}>界面显示语言</p>
            </div>
            <div class={styles.settingControl}>
              <select
                class={styles.select}
                value={framework.store.settings.language}
                onChange={(e) =>
                  framework.store.updateSettings({
                    language: e.currentTarget.value as 'zh-CN' | 'en-US',
                  })
                }
              >
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
            </div>
          </div>
        </section>

        {/* 功能设置 */}
        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>⚡ 功能</h2>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>跟踪间隔</label>
              <p class={styles.settingDescription}>
                记录活动的时间间隔(秒)
              </p>
            </div>
            <div class={styles.settingControl}>
              <select
                class={styles.select}
                value={framework.store.settings.trackingInterval}
                onChange={(e) =>
                  framework.store.updateSettings({
                    trackingInterval: Number(e.currentTarget.value),
                  })
                }
              >
                {trackingIntervals.map((option) => (
                  <option value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>自动启动跟踪</label>
              <p class={styles.settingDescription}>
                应用启动时自动开始记录活动
              </p>
            </div>
            <div class={styles.settingControl}>
              <label class={styles.switch}>
                <input
                  type="checkbox"
                  checked={framework.store.settings.autoStart}
                  onChange={(e) =>
                    framework.store.updateSettings({
                      autoStart: e.currentTarget.checked,
                    })
                  }
                />
                <span class={styles.slider}></span>
              </label>
            </div>
          </div>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>开机启动应用</label>
              <p class={styles.settingDescription}>
                登录系统时自动启动 Workstation
              </p>
            </div>
            <div class={styles.settingControl}>
              <label class={styles.switch}>
                <input
                  type="checkbox"
                  checked={framework.store.settings.launchOnStartup}
                  onChange={async (e) => {
                    const previous = framework.store.settings.launchOnStartup;
                    const enabled = e.currentTarget.checked;

                    if (enabled === previous) {
                      return;
                    }

                    framework.store.updateSettings({ launchOnStartup: enabled });
                    const result = await framework.errorManager.withErrorHandling(
                      async () => {
                        await framework.repository.setLaunchOnStartup(enabled);
                      },
                      {
                        successMessage: enabled ? '已开启开机自启' : '已关闭开机自启',
                        errorTitle: '更新开机自启失败',
                        showLoading: false,
                      }
                    );

                    if (result === null) {
                      framework.store.updateSettings({ launchOnStartup: previous });
                    }
                  }}
                />
                <span class={styles.slider}></span>
              </label>
            </div>
          </div>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>最小化到托盘</label>
              <p class={styles.settingDescription}>
                关闭窗口时最小化到系统托盘而不是退出
              </p>
            </div>
            <div class={styles.settingControl}>
              <label class={styles.switch}>
                <input
                  type="checkbox"
                  checked={framework.store.settings.minimizeToTray}
                  onChange={(e) =>
                    framework.store.updateSettings({
                      minimizeToTray: e.currentTarget.checked,
                    })
                  }
                />
                <span class={styles.slider}></span>
              </label>
            </div>
          </div>
        </section>

        {/* 数据设置 */}
        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>💾 数据</h2>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>数据库大小</label>
              <p class={styles.settingDescription}>
                当前数据库占用的磁盘空间
              </p>
            </div>
            <div class={styles.settingControl}>
              <div class={styles.dbSize}>
                {dbSize() !== null ? (
                  <strong>{formatBytes(dbSize() as number)}</strong>
                ) : (
                  <span class={styles.loading}>读取中...</span>
                )}
              </div>
            </div>
          </div>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>数据保留时间</label>
              <p class={styles.settingDescription}>
                旧数据将在指定天数后自动清理
              </p>
            </div>
            <div class={styles.settingControl}>
              <select
                class={styles.select}
                value={framework.store.settings.dataRetentionDays}
                onChange={(e) =>
                  framework.store.updateSettings({
                    dataRetentionDays: Number(e.currentTarget.value),
                  })
                }
              >
                {retentionOptions.map((option) => (
                  <option value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>自动备份</label>
              <p class={styles.settingDescription}>
                定期自动备份数据库
              </p>
            </div>
            <div class={styles.settingControl}>
              <label class={styles.switch}>
                <input
                  type="checkbox"
                  checked={framework.store.settings.backupEnabled}
                  onChange={(e) =>
                    framework.store.updateSettings({
                      backupEnabled: e.currentTarget.checked,
                    })
                  }
                />
                <span class={styles.slider}></span>
              </label>
            </div>
          </div>
        </section>

        {/* 通知设置 */}
        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>🔔 通知</h2>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>启用通知</label>
              <p class={styles.settingDescription}>
                允许应用发送桌面通知
              </p>
            </div>
            <div class={styles.settingControl}>
              <label class={styles.switch}>
                <input
                  type="checkbox"
                  checked={framework.store.settings.notificationsEnabled}
                  onChange={(e) =>
                    framework.store.updateSettings({
                      notificationsEnabled: e.currentTarget.checked,
                    })
                  }
                />
                <span class={styles.slider}></span>
              </label>
            </div>
          </div>

          <div class={styles.settingItem}>
            <div class={styles.settingLabel}>
              <label>声音提示</label>
              <p class={styles.settingDescription}>
                通知时播放提示音
              </p>
            </div>
            <div class={styles.settingControl}>
              <label class={styles.switch}>
                <input
                  type="checkbox"
                  checked={framework.store.settings.soundEnabled}
                  onChange={(e) =>
                    framework.store.updateSettings({
                      soundEnabled: e.currentTarget.checked,
                    })
                  }
                />
                <span class={styles.slider}></span>
              </label>
            </div>
          </div>
        </section>

        {/* 关于 */}
        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>ℹ️ 关于</h2>
          <div class={styles.about}>
            <p class={styles.appName}>Workstation</p>
            <p class={styles.version}>版本 1.0.0</p>
            <p class={styles.copyright}>© 2025 All rights reserved</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
