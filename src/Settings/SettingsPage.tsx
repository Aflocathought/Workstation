// src/Settings/SettingsPage.tsx
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Component, createSignal, createEffect, onMount, Switch as SolidSwitch, Match, For, Show } from 'solid-js';
import { useAppFramework } from '../core/AppFramework';
import { themeManager, type Theme } from '../core/ThemeManager';
import { Switch, Select } from '../components/core-ui';
import {
  ALL_DICTIONARIES_VALUE,
  DEFAULT_AI_ENDPOINT,
  DEFAULT_AI_MODEL,
  DICTIONARY_AI_STORAGE_KEYS,
  DICTIONARY_STORAGE_KEYS,
  type DictionarySource,
  getDictionaryLabel,
  persistDictionarySetting,
  persistDictionarySources,
  readPersistedDictionarySources,
  readPersistedValue,
} from '../Plugins/Dict/dictionarySettings';
import {
  DATASCOPE_MAX_POINTS_MAX,
  DATASCOPE_MAX_POINTS_MIN,
  DATASCOPE_MAX_POINTS_STEP,
} from './Setting';
import styles from './SettingsPage.module.css';

type Tab = 'appearance' | 'features' | 'data' | 'plugins' | 'notifications' | 'about';

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
  const [activeTab, setActiveTab] = createSignal<Tab>('appearance');
  const [dictionaryDirectory, setDictionaryDirectory] = createSignal(
    readPersistedValue(DICTIONARY_STORAGE_KEYS.directory, ''),
  );
  const [activeDictionaryFile, setActiveDictionaryFile] = createSignal(
    readPersistedValue(DICTIONARY_STORAGE_KEYS.activeFile, ''),
  );
  const [dictionarySources, setDictionarySources] = createSignal<DictionarySource[]>(
    readPersistedDictionarySources(),
  );
  const [isScanningDictionaries, setIsScanningDictionaries] = createSignal(false);
  const [dictionaryScanMessage, setDictionaryScanMessage] = createSignal('');
  const [aiEndpoint, setAiEndpoint] = createSignal(
    readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.endpoint, DEFAULT_AI_ENDPOINT),
  );
  const [aiModel, setAiModel] = createSignal(
    readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.model, DEFAULT_AI_MODEL),
  );
  const [aiApiKey, setAiApiKey] = createSignal(
    readPersistedValue(DICTIONARY_AI_STORAGE_KEYS.apiKey, ''),
  );

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

  createEffect(() => {
    persistDictionarySetting(
      DICTIONARY_STORAGE_KEYS.directory,
      dictionaryDirectory().trim(),
    );
    persistDictionarySetting(
      DICTIONARY_STORAGE_KEYS.activeFile,
      activeDictionaryFile().trim(),
    );
  });

  createEffect(() => {
    persistDictionarySetting(DICTIONARY_AI_STORAGE_KEYS.endpoint, aiEndpoint().trim());
    persistDictionarySetting(DICTIONARY_AI_STORAGE_KEYS.model, aiModel().trim());
    persistDictionarySetting(DICTIONARY_AI_STORAGE_KEYS.apiKey, aiApiKey().trim());
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

  const handleDatascopeMaxPointsChange = (event: Event) => {
    framework.store.updateSettings({
      datascopeMaxPoints: Number(
        (event.currentTarget as HTMLInputElement).value
      ),
    });
  };

  const isAllDictionariesActive = () =>
    activeDictionaryFile().trim() === ALL_DICTIONARIES_VALUE ||
    (!activeDictionaryFile().trim() && dictionarySources().length > 0);

  const activeDictionaryLabel = () => {
    const activeFile = activeDictionaryFile().trim();

    if (isAllDictionariesActive()) {
      return `全部导入词典（${dictionarySources().length} 本）`;
    }

    if (!activeFile) {
      return '未选择词典';
    }

    return getDictionaryLabel(activeFile);
  };

  const scanDictionaryDirectory = async (preferredPath?: string) => {
    const nextDirectory = (preferredPath ?? dictionaryDirectory()).trim();

    if (!nextDirectory) {
      setDictionarySources([]);
      persistDictionarySources([]);
      setDictionaryScanMessage('请先输入词典目录或点击“浏览”。');
      return;
    }

    setIsScanningDictionaries(true);
    setDictionaryScanMessage('');

    try {
      const sources = await invoke<DictionarySource[]>('scan_dictionary_directory', {
        directory: nextDirectory,
      });

      setDictionarySources(sources);
      persistDictionarySources(sources);

      if (sources.length === 0) {
        setActiveDictionaryFile('');
        setDictionaryScanMessage('没有扫描到 .mdx 词典文件。');
        return;
      }

      const currentActiveFile = activeDictionaryFile().trim();
      const hasActiveFile =
        currentActiveFile === ALL_DICTIONARIES_VALUE ||
        sources.some((source) => source.filePath === currentActiveFile);

      if (!hasActiveFile) {
        setActiveDictionaryFile(ALL_DICTIONARIES_VALUE);
      }

      setDictionaryScanMessage(`已导入 ${sources.length} 本 MDX 词典。`);
    } catch (error) {
      setDictionarySources([]);
      persistDictionarySources([]);
      setActiveDictionaryFile('');
      setDictionaryScanMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsScanningDictionaries(false);
    }
  };

  const chooseDictionaryDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: dictionaryDirectory().trim() || undefined,
        title: '选择词典目录',
      });

      if (typeof selected !== 'string') {
        return;
      }

      setDictionaryDirectory(selected);
      await scanDictionaryDirectory(selected);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDictionaryScanMessage(
        message.includes('window.__TAURI_INTERNALS__')
          ? '当前浏览器预览环境不支持系统目录选择，请手动输入路径。'
          : message,
      );
    }
  };

  // 获取主题显示名称
  const getThemeLabel = (theme: Theme): string => {
    switch (theme) {
      case 'light': return '浅色';
      case 'dark': return '深色';
      case 'auto': return '自动';
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

  const languageOptions = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en-US', label: 'English' }
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'appearance', label: '外观' },
    { id: 'features', label: '功能' },
    { id: 'data', label: '数据' },
    { id: 'plugins', label: '插件' },
    { id: 'notifications', label: '通知' },
    { id: 'about', label: '关于' }
  ];

  return (
    <div class={styles.settingsPage}>
      <div class={styles.sidebar}>
        <div class={styles.sidebarHeader}>设置</div>
        <ul class={styles.navList}>
          <For each={tabs}>
            {(tab) => (
              <li
                class={styles.navItem}
                classList={{ [styles.navItemActive]: activeTab() === tab.id }}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </li>
            )}
          </For>
        </ul>
      </div>

      <div class={styles.content}>
        <SolidSwitch>
          <Match when={activeTab() === 'appearance'}>
            <section class={styles.section}>
              <h2 class={styles.sectionTitle}>外观</h2>
              <div class={styles.settingItem}>
                <div class={styles.settingLabel}>
                  <label>主题模式</label>
                  <p class={styles.settingDescription}>选择浅色、深色或跟随系统主题</p>
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
                  <Select
                    options={languageOptions}
                    value={framework.store.settings.language}
                    onChange={(val) => framework.store.updateSettings({ language: val as 'zh-CN' | 'en-US' })}
                  />
                </div>
              </div>
            </section>
          </Match>

          <Match when={activeTab() === 'features'}>
            <section class={styles.section}>
              <h2 class={styles.sectionTitle}>功能</h2>
              <div class={styles.settingItem}>
                <div class={styles.settingLabel}>
                  <label>跟踪间隔</label>
                  <p class={styles.settingDescription}>记录活动的时间间隔(秒)</p>
                </div>
                <div class={styles.settingControl}>
                  <Select
                    options={trackingIntervals}
                    value={framework.store.settings.trackingInterval}
                    onChange={(val) => framework.store.updateSettings({ trackingInterval: Number(val) })}
                  />
                </div>
              </div>
              <div class={styles.settingItem}>
                <div class={styles.settingLabel}>
                  <label>自动启动跟踪</label>
                  <p class={styles.settingDescription}>应用启动时自动开始记录活动</p>
                </div>
                <div class={styles.settingControl}>
                  <Switch
                    checked={framework.store.settings.autoStart}
                    onChange={(checked) => framework.store.updateSettings({ autoStart: checked })}
                  />
                </div>
              </div>
              <div class={styles.settingItem}>
                <div class={styles.settingLabel}>
                  <label>开机启动应用</label>
                  <p class={styles.settingDescription}>登录系统时自动启动 Workstation</p>
                </div>
                <div class={styles.settingControl}>
                  <Switch
                    checked={framework.store.settings.launchOnStartup}
                    onChange={async (enabled) => {
                      const previous = framework.store.settings.launchOnStartup;
                      if (enabled === previous) return;
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
                </div>
              </div>
              <div class={styles.settingItem}>
                <div class={styles.settingLabel}>
                  <label>最小化到托盘</label>
                  <p class={styles.settingDescription}>关闭窗口时最小化到系统托盘而不是退出</p>
                </div>
                <div class={styles.settingControl}>
                  <Switch
                    checked={framework.store.settings.minimizeToTray}
                    onChange={(checked) => framework.store.updateSettings({ minimizeToTray: checked })}
                  />
                </div>
              </div>
            </section>
          </Match>

          <Match when={activeTab() === 'data'}>
            <section class={styles.section}>
              <h2 class={styles.sectionTitle}>数据</h2>
              <div class={styles.settingItem}>
                <div class={styles.settingLabel}>
                  <label>数据库大小</label>
                  <p class={styles.settingDescription}>当前数据库占用的磁盘空间</p>
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
                  <p class={styles.settingDescription}>旧数据将在指定天数后自动清理</p>
                </div>
                <div class={styles.settingControl}>
                  <Select
                    options={retentionOptions}
                    value={framework.store.settings.dataRetentionDays}
                    onChange={(val) => framework.store.updateSettings({ dataRetentionDays: Number(val) })}
                  />
                </div>
              </div>
              <div class={styles.settingItem}>
                <div class={styles.settingLabel}>
                  <label>自动备份</label>
                  <p class={styles.settingDescription}>定期自动备份数据库</p>
                </div>
                <div class={styles.settingControl}>
                  <Switch
                    checked={framework.store.settings.backupEnabled}
                    onChange={(checked) => framework.store.updateSettings({ backupEnabled: checked })}
                  />
                </div>
              </div>
            </section>
          </Match>

          <Match when={activeTab() === 'plugins'}>
            <section class={styles.section}>
              <h2 class={styles.sectionTitle}>插件</h2>

              <div class={styles.pluginCard}>
                <div class={styles.pluginCardHeader}>
                  <h3 class={styles.pluginCardTitle}>本地词典</h3>
                  <p class={styles.pluginCardDescription}>
                    配置 MDX 词典目录、默认查词范围以及 AI 助教的 DeepSeek 连接参数。
                  </p>
                </div>

                <div class={styles.settingItem}>
                  <div class={styles.settingLabel}>
                    <label>词典目录</label>
                    <p class={styles.settingDescription}>选择包含 .mdx / .mdd 文件的文件夹</p>
                  </div>
                  <div class={styles.settingControl}>
                    <div class={styles.stackedControl}>
                      <div class={styles.inlineControl}>
                        <input
                          class={styles.textInput}
                          type="text"
                          value={dictionaryDirectory()}
                          onInput={(event) => setDictionaryDirectory(event.currentTarget.value)}
                          placeholder="词典目录路径"
                          spellcheck={false}
                        />
                        <button
                          type="button"
                          class={styles.secondaryButton}
                          onClick={() => void chooseDictionaryDirectory()}
                        >
                          浏览
                        </button>
                        <button
                          type="button"
                          class={styles.primaryButton}
                          disabled={isScanningDictionaries()}
                          onClick={() => void scanDictionaryDirectory()}
                        >
                          {isScanningDictionaries() ? '扫描中' : '扫描'}
                        </button>
                      </div>

                      <Show when={dictionaryScanMessage()}>
                        <p class={styles.statusText}>{dictionaryScanMessage()}</p>
                      </Show>
                    </div>
                  </div>
                </div>

                <div class={styles.settingItem}>
                  <div class={styles.settingLabel}>
                    <label>默认查词范围</label>
                    <p class={styles.settingDescription}>当前：{activeDictionaryLabel()}</p>
                  </div>
                  <div class={styles.settingControl}>
                    <div class={styles.dictionaryList}>
                      <Show
                        when={dictionarySources().length > 0}
                        fallback={<span class={styles.emptyText}>尚未导入词典</span>}
                      >
                        <button
                          type="button"
                          class={styles.dictionaryOption}
                          classList={{ [styles.dictionaryOptionActive]: isAllDictionariesActive() }}
                          onClick={() => setActiveDictionaryFile(ALL_DICTIONARIES_VALUE)}
                        >
                          <span>全部导入词典</span>
                          <span class={styles.optionMeta}>{dictionarySources().length} 本</span>
                        </button>

                        <For each={dictionarySources()}>
                          {(source) => {
                            const isActive = () => source.filePath === activeDictionaryFile();

                            return (
                              <button
                                type="button"
                                class={styles.dictionaryOption}
                                classList={{ [styles.dictionaryOptionActive]: isActive() }}
                                onClick={() => setActiveDictionaryFile(source.filePath)}
                              >
                                <span>{source.displayName}</span>
                                <span class={styles.optionMeta}>{source.hasMdd ? 'MDD' : 'MDX'}</span>
                              </button>
                            );
                          }}
                        </For>
                      </Show>
                    </div>
                  </div>
                </div>

                <div class={styles.settingItem}>
                  <div class={styles.settingLabel}>
                    <label>DeepSeek Endpoint</label>
                    <p class={styles.settingDescription}>AI 助教请求地址</p>
                  </div>
                  <div class={styles.settingControl}>
                    <input
                      class={styles.textInput}
                      type="text"
                      value={aiEndpoint()}
                      onInput={(event) => setAiEndpoint(event.currentTarget.value)}
                      spellcheck={false}
                    />
                  </div>
                </div>

                <div class={styles.settingItem}>
                  <div class={styles.settingLabel}>
                    <label>DeepSeek Model</label>
                    <p class={styles.settingDescription}>用于词典 AI 助教的模型名称</p>
                  </div>
                  <div class={styles.settingControl}>
                    <input
                      class={styles.textInput}
                      type="text"
                      value={aiModel()}
                      onInput={(event) => setAiModel(event.currentTarget.value)}
                      spellcheck={false}
                    />
                  </div>
                </div>

                <div class={styles.settingItem}>
                  <div class={styles.settingLabel}>
                    <label>DeepSeek API Key</label>
                    <p class={styles.settingDescription}>留空时词典 AI 面板使用本地 mock 回复</p>
                  </div>
                  <div class={styles.settingControl}>
                    <input
                      class={styles.textInput}
                      type="password"
                      value={aiApiKey()}
                      onInput={(event) => setAiApiKey(event.currentTarget.value)}
                      placeholder="未配置"
                      spellcheck={false}
                    />
                  </div>
                </div>
              </div>

              <div class={styles.pluginCard}>
                <div class={styles.pluginCardHeader}>
                  <h3 class={styles.pluginCardTitle}>Datascope</h3>
                  <p class={styles.pluginCardDescription}>
                    配置大数据量图表的默认渲染策略，控制缩放和切换视图时的性能表现。
                  </p>
                </div>

                <div class={styles.settingItem}>
                  <div class={styles.settingLabel}>
                    <label>自动下采样</label>
                    <p class={styles.settingDescription}>在大数据量图表中自动压缩点数，降低缩放和渲染卡顿</p>
                  </div>
                  <div class={styles.settingControl}>
                    <Switch
                      checked={framework.store.settings.datascopeAutoDownsample}
                      onChange={(checked) => framework.store.updateSettings({ datascopeAutoDownsample: checked })}
                    />
                  </div>
                </div>

                <div class={styles.settingItem}>
                  <div class={styles.settingLabel}>
                    <label>最大显示点数</label>
                    <p class={styles.settingDescription}>
                      控制 Datascope 自动下采样后的点数上限，范围 {DATASCOPE_MAX_POINTS_MIN} - {DATASCOPE_MAX_POINTS_MAX}
                    </p>
                  </div>
                  <div class={styles.settingControl}>
                    <div class={styles.rangeControl}>
                      <input
                        type="range"
                        min={DATASCOPE_MAX_POINTS_MIN}
                        max={DATASCOPE_MAX_POINTS_MAX}
                        step={DATASCOPE_MAX_POINTS_STEP}
                        value={framework.store.settings.datascopeMaxPoints}
                        onInput={handleDatascopeMaxPointsChange}
                      />
                      <input
                        class={styles.numberInput}
                        type="number"
                        min={DATASCOPE_MAX_POINTS_MIN}
                        max={DATASCOPE_MAX_POINTS_MAX}
                        step={DATASCOPE_MAX_POINTS_STEP}
                        value={framework.store.settings.datascopeMaxPoints}
                        onChange={handleDatascopeMaxPointsChange}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </Match>

          <Match when={activeTab() === 'notifications'}>
            <section class={styles.section}>
              <h2 class={styles.sectionTitle}>通知</h2>
              <div class={styles.settingItem}>
                <div class={styles.settingLabel}>
                  <label>启用通知</label>
                  <p class={styles.settingDescription}>允许应用发送桌面通知</p>
                </div>
                <div class={styles.settingControl}>
                  <Switch
                    checked={framework.store.settings.notificationsEnabled}
                    onChange={(checked) => framework.store.updateSettings({ notificationsEnabled: checked })}
                  />
                </div>
              </div>
              <div class={styles.settingItem}>
                <div class={styles.settingLabel}>
                  <label>声音提示</label>
                  <p class={styles.settingDescription}>通知时播放提示音</p>
                </div>
                <div class={styles.settingControl}>
                  <Switch
                    checked={framework.store.settings.soundEnabled}
                    onChange={(checked) => framework.store.updateSettings({ soundEnabled: checked })}
                  />
                </div>
              </div>
            </section>
          </Match>

          <Match when={activeTab() === 'about'}>
            <section class={styles.section}>
              <h2 class={styles.sectionTitle}>关于</h2>
              <div class={styles.about}>
                <p class={styles.appName}>Workstation</p>
                <p class={styles.version}>版本 1.0.0</p>
                <p class={styles.copyright}>© 2025 All rights reserved</p>
              </div>
            </section>
          </Match>
        </SolidSwitch>
      </div>
    </div>
  );
};

export default SettingsPage;
