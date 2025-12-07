import './shortcut-hint.css';
import type {
  ShortcutConfig,
  ShortcutConfigData,
  ShortcutConfigMap,
} from '../types';
import { ModifierKey } from '../types';

type ModifierState = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
};

type ForegroundWindowInfo = {
  title: string;
  className: string;
  processName: string;
  processId: number;
  monitor?: MonitorInfo | null;
};

type MonitorInfo = {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  workLeft: number;
  workTop: number;
  workWidth: number;
  workHeight: number;
};

type InvokeFunction = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

type ProfileKeyInfo = {
  type: 'process' | 'title' | 'class' | 'regex';
  raw: string;
  display: string;
};

type ConfigSelection = {
  profile: string;
  config: ShortcutConfig;
};

const STORAGE_KEY = 'shortcut-reminder-config';
const HINT_ENABLED_KEY = 'shortcut-reminder-hint-enabled';
const GLOBAL_PROFILE = '__global__';
const POLL_INTERVAL = 100;

let invoke: InvokeFunction | null = null;
let globalConfig: ShortcutConfig = getDefaultConfig();
let appConfigs: ShortcutConfigMap = {};
let isEnabled = true;
let lastState: ModifierState = { ctrl: false, alt: false, shift: false, win: false };
let lastPlacementSignature: string | null = null;
const hintContainer = document.getElementById('hint-container') as HTMLElement | null;
const modifierText = document.getElementById('modifier-text') as HTMLElement | null;
const hintItems = document.getElementById('hint-items') as HTMLElement | null;
const windowInfoBox = document.getElementById('window-info') as HTMLElement | null;
const processNameEl = document.getElementById('process-name') as HTMLElement | null;
const windowTitleEl = document.getElementById('window-title') as HTMLElement | null;
const profileIndicator = document.getElementById('profile-indicator') as HTMLElement | null;
const profileBadge = document.getElementById('profile-badge') as HTMLElement | null;

if (!hintContainer || !modifierText || !hintItems) {
  throw new Error('Shortcut hint container is missing required elements.');
}

const hintContainerEl = hintContainer as HTMLElement;
const modifierTextEl = modifierText as HTMLElement;
const hintItemsEl = hintItems as HTMLElement;

const applyGlobalLayerStyles = () => {
  document.documentElement.style.background = 'transparent';
  document.documentElement.style.pointerEvents = 'none';
  document.documentElement.style.height = '100%';
  document.documentElement.style.margin = '0';
  document.documentElement.style.padding = '0';

  document.body.style.background = 'transparent';
  document.body.style.pointerEvents = 'none';
  document.body.style.height = '100%';
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.12s ease-out';
};

applyGlobalLayerStyles();

loadConfigFromStorage();
loadHintEnabled();
setupStorageListener();
bootstrap();

function getPlacementSignature(monitor?: MonitorInfo | null): string {
  if (!monitor) {
    return 'monitor:none';
  }
  return `${monitor.left}:${monitor.top}:${monitor.width}:${monitor.height}:${monitor.workLeft}:${monitor.workTop}:${monitor.workWidth}:${monitor.workHeight}`;
}

async function ensureHintWindowPosition(info: ForegroundWindowInfo | null): Promise<void> {
  const monitor = info?.monitor ?? null;
  const signature = getPlacementSignature(monitor);
  if (signature === lastPlacementSignature) {
    return;
  }

  if (!monitor) {
    lastPlacementSignature = signature;
    return;
  }

  const currentInvoke = invoke;
  if (!currentInvoke) {
    return;
  }

  try {
    await currentInvoke('move_shortcut_hint_window', {
      bounds: {
        left: monitor.left,
        top: monitor.top,
        width: monitor.width,
        height: monitor.height,
        workLeft: monitor.workLeft,
        workTop: monitor.workTop,
        workWidth: monitor.workWidth,
        workHeight: monitor.workHeight,
      },
    });
    lastPlacementSignature = signature;
  } catch (error) {
    console.debug('更新快捷键提示窗口位置失败:', error);
  }
}

function createEmptyConfig(): ShortcutConfig {
  return {
    [ModifierKey.CTRL]: [],
    [ModifierKey.ALT]: [],
    [ModifierKey.SHIFT]: [],
    [ModifierKey.WIN]: [],
    [ModifierKey.CTRL_ALT]: [],
    [ModifierKey.CTRL_SHIFT]: [],
    [ModifierKey.ALT_SHIFT]: [],
    [ModifierKey.CTRL_ALT_SHIFT]: [],
    [ModifierKey.NONE]: [],
  };
}

function getDefaultConfig(): ShortcutConfig {
  const defaults = createEmptyConfig();
  defaults[ModifierKey.CTRL] = [
    { key: 'S', description: '保存文件', modifier: ModifierKey.CTRL },
    { key: 'C', description: '复制', modifier: ModifierKey.CTRL },
    { key: 'V', description: '粘贴', modifier: ModifierKey.CTRL },
    { key: 'X', description: '剪切', modifier: ModifierKey.CTRL },
    { key: 'Z', description: '撤销', modifier: ModifierKey.CTRL },
    { key: 'Y', description: '重做', modifier: ModifierKey.CTRL },
  ];
  defaults[ModifierKey.ALT] = [
    { key: 'F4', description: '关闭窗口', modifier: ModifierKey.ALT },
    { key: 'Tab', description: '切换窗口', modifier: ModifierKey.ALT },
  ];
  defaults[ModifierKey.SHIFT] = [
    { key: 'Delete', description: '永久删除', modifier: ModifierKey.SHIFT },
  ];
  defaults[ModifierKey.CTRL_ALT] = [
    { key: 'Delete', description: '任务管理器', modifier: ModifierKey.CTRL_ALT },
  ];
  defaults[ModifierKey.CTRL_SHIFT] = [
    { key: 'Esc', description: '任务管理器', modifier: ModifierKey.CTRL_SHIFT },
    { key: 'N', description: '新建无痕窗口', modifier: ModifierKey.CTRL_SHIFT },
  ];
  defaults[ModifierKey.WIN] = [
    { key: 'D', description: '显示桌面', modifier: ModifierKey.WIN },
    { key: 'E', description: '打开文件资源管理器', modifier: ModifierKey.WIN },
  ];
  defaults[ModifierKey.NONE] = [
    { key: 'F5', description: '刷新当前页面/窗口', modifier: ModifierKey.NONE },
    { key: 'PrintScreen', description: '截取屏幕', modifier: ModifierKey.NONE },
  ];
  return defaults;
}

function normalizeConfig(
  raw?: ShortcutConfig | Partial<Record<ModifierKey, ShortcutConfig[ModifierKey]>>
): ShortcutConfig {
  const normalized = createEmptyConfig();
  if (!raw) {
    return normalized;
  }

  (Object.keys(normalized) as ModifierKey[]).forEach((modifier) => {
  const candidate = (raw as ShortcutConfig)[modifier] ?? raw?.[modifier] ?? [];
  const shortcuts = Array.isArray(candidate) ? candidate : [];
    normalized[modifier] = shortcuts.map((shortcut) => ({ ...shortcut }));
  });

  return normalized;
}

function normalizeAppConfigs(map?: ShortcutConfigMap): ShortcutConfigMap {
  if (!map) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(map).map(([key, config]) => [key, normalizeConfig(config)])
  );
}

function loadConfigFromStorage(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      globalConfig = getDefaultConfig();
      appConfigs = {};
      return;
    }

    const data: ShortcutConfigData = JSON.parse(saved);
    globalConfig = normalizeConfig(data.config);
    appConfigs = normalizeAppConfigs(data.appConfigs);
  } catch (error) {
    console.error('加载快捷键信息失败:', error);
    globalConfig = getDefaultConfig();
    appConfigs = {};
  }
}

function loadHintEnabled(): void {
  try {
    const saved = localStorage.getItem(HINT_ENABLED_KEY);
    isEnabled = saved ? JSON.parse(saved) : true;
  } catch (error) {
    console.error('加载悬浮窗口开关失败:', error);
    isEnabled = true;
  }
}

function setupStorageListener(): void {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      loadConfigFromStorage();
    }
    if (event.key === HINT_ENABLED_KEY) {
      loadHintEnabled();
      if (!isEnabled) {
        hideHint();
      }
    }
  });
}

function parseProfileKey(key: string): ProfileKeyInfo {
  const trimmed = key.trim();
  const index = trimmed.indexOf(':');
  if (index === -1) {
    return { type: 'process', raw: trimmed, display: trimmed };
  }

  const prefix = trimmed.slice(0, index).toLowerCase();
  const value = trimmed.slice(index + 1).trim();
  const typeMap: Record<string, ProfileKeyInfo['type']> = {
    process: 'process',
    title: 'title',
    class: 'class',
    regex: 'regex',
  };
  const type = typeMap[prefix] ?? 'process';
  return { type, raw: value, display: value || trimmed };
}

function getProfileLabel(profile: string): string {
  if (profile === GLOBAL_PROFILE) {
    return '全局配置';
  }

  const parsed = parseProfileKey(profile);
  const prefixMap: Record<ProfileKeyInfo['type'], string> = {
    process: '进程',
    title: '窗口标题',
    class: '窗口类名',
    regex: '正则匹配',
  };

  return `${prefixMap[parsed.type]}：${parsed.display || '(未填写)'}`;
}

function updateProfileIndicator(profile: string): void {
  if (!profileIndicator || !profileBadge) {
    return;
  }

  if (profile === GLOBAL_PROFILE) {
    profileIndicator.style.display = 'none';
    profileBadge.textContent = '';
    return;
  }

  profileIndicator.style.display = 'block';
  profileBadge.textContent = getProfileLabel(profile);
}

function resolveConfig(info: ForegroundWindowInfo | null): ConfigSelection {
  if (!info) {
    return { profile: GLOBAL_PROFILE, config: globalConfig };
  }

  const entries = Object.entries(appConfigs);
  const processName = (info.processName || '').toLowerCase();
  const className = (info.className || '').toLowerCase();
  const title = (info.title || '').toLowerCase();

  for (const [key, config] of entries) {
    const parsed = parseProfileKey(key);
    const target = parsed.raw.toLowerCase();

    if (!target) {
      continue;
    }

    switch (parsed.type) {
      case 'process':
        if (processName === target) {
          return { profile: key, config };
        }
        break;
      case 'class':
        if (className === target) {
          return { profile: key, config };
        }
        break;
      case 'title':
        if (title.includes(target)) {
          return { profile: key, config };
        }
        break;
      case 'regex':
        try {
          const regex = new RegExp(parsed.raw, 'i');
          if (regex.test(`${info.processName} ${info.title} ${info.className}`)) {
            return { profile: key, config };
          }
        } catch (error) {
          console.debug('无效的正则表达式:', parsed.raw, error);
        }
        break;
      default:
        break;
    }
  }

  return { profile: GLOBAL_PROFILE, config: globalConfig };
}

function getModifierLabel(modifier: ModifierKey): string {
  switch (modifier) {
    case ModifierKey.CTRL:
      return 'Ctrl';
    case ModifierKey.ALT:
      return 'Alt';
    case ModifierKey.SHIFT:
      return 'Shift';
    case ModifierKey.WIN:
      return 'Win';
    case ModifierKey.CTRL_ALT:
      return 'Ctrl + Alt';
    case ModifierKey.CTRL_SHIFT:
      return 'Ctrl + Shift';
    case ModifierKey.ALT_SHIFT:
      return 'Alt + Shift';
    case ModifierKey.CTRL_ALT_SHIFT:
      return 'Ctrl + Alt + Shift';
    case ModifierKey.NONE:
      return '无修饰';
    default:
      return '无修饰';
  }
}

function getCurrentModifier(state: ModifierState): ModifierKey | null {
  const hasWin = state.win === true;

  if (hasWin) {
    if (!state.ctrl && !state.alt && !state.shift) {
      return ModifierKey.WIN;
    }
    return null;
  }

  if (state.ctrl && state.alt && state.shift) {
    return ModifierKey.CTRL_ALT_SHIFT;
  }
  if (state.ctrl && state.alt) {
    return ModifierKey.CTRL_ALT;
  }
  if (state.ctrl && state.shift) {
    return ModifierKey.CTRL_SHIFT;
  }
  if (state.alt && state.shift) {
    return ModifierKey.ALT_SHIFT;
  }
  if (state.ctrl) {
    return ModifierKey.CTRL;
  }
  if (state.alt) {
    return ModifierKey.ALT;
  }
  if (state.shift) {
    return ModifierKey.SHIFT;
  }
  return null;
}

function renderHint(
  modifier: ModifierKey,
  shortcuts: ShortcutConfig[ModifierKey],
  windowInfo: ForegroundWindowInfo | null,
  profile: string
): void {
  modifierTextEl.textContent = getModifierLabel(modifier);
  hintItemsEl.innerHTML = shortcuts
    .map(
      (shortcut) => {
        const displayKey = (() => {
          const keyText = shortcut.key?.trim();
          if (shortcut.modifier === ModifierKey.NONE) {
            return keyText || '按键';
          }
          if (keyText && keyText.length > 0) {
            return `+ ${keyText}`;
          }
          return getModifierLabel(shortcut.modifier);
        })();
        return `
        <div class="hint-item">
          <div class="hint-key">${displayKey}</div>
          <div class="hint-desc">${shortcut.description}</div>
        </div>
      `;
      }
    )
    .join('');

  if (windowInfo && windowInfoBox && processNameEl && windowTitleEl) {
    processNameEl.textContent = windowInfo.processName || '-';
    windowTitleEl.textContent = windowInfo.title || '-';
    windowInfoBox.style.display = 'block';
  } else if (windowInfoBox) {
    windowInfoBox.style.display = 'none';
  }

  updateProfileIndicator(profile);
  document.body.classList.add('hint-visible');
  document.body.style.opacity = '1';
  hintContainerEl.style.pointerEvents = 'none';
}

function hideHint(): void {
  document.body.classList.remove('hint-visible');
  if (profileIndicator) {
    profileIndicator.style.display = 'none';
  }
  document.body.style.opacity = '0';
  hintContainerEl.style.pointerEvents = 'none';
}

function coreFromInternals(): InvokeFunction | null {
  const internal = (window as typeof window & { __TAURI_INTERNALS__?: { invoke?: InvokeFunction } }).__TAURI_INTERNALS__;
  if (internal?.invoke) {
    return (command: string, args?: Record<string, unknown>) => internal.invoke!(command, args ?? {});
  }
  return null;
}

async function acquireInvoke(): Promise<InvokeFunction | null> {
  const globalWindow = window as typeof window & { __TAURI__?: { core?: InvokeFunction } };

  if (globalWindow.__TAURI__?.core) {
    return globalWindow.__TAURI__.core;
  }

  const fallback = coreFromInternals();
  if (fallback) {
    return fallback;
  }

  for (let attempt = 0; attempt < 300; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (globalWindow.__TAURI__?.core) {
      return globalWindow.__TAURI__.core;
    }
    const viaInternal = coreFromInternals();
    if (viaInternal) {
      return viaInternal;
    }
  }

  return coreFromInternals();
}

async function pollModifierState(): Promise<void> {
  if (!invoke || !isEnabled) {
    hideHint();
    return;
  }

  try {
    const rawState = (await invoke('get_modifier_state')) as Partial<ModifierState>;
    const state: ModifierState = {
      ctrl: Boolean(rawState.ctrl),
      alt: Boolean(rawState.alt),
      shift: Boolean(rawState.shift),
      win: Boolean(rawState.win),
    };
    const changed =
      state.ctrl !== lastState.ctrl ||
      state.alt !== lastState.alt ||
      state.shift !== lastState.shift ||
      state.win !== lastState.win;

    if (!changed) {
      return;
    }

    lastState = state;
    const modifier = getCurrentModifier(state);
    if (!modifier) {
      hideHint();
      return;
    }

  const windowInfo = (await invoke('get_foreground_window')) as ForegroundWindowInfo | null;
  void ensureHintWindowPosition(windowInfo);
    const selection = resolveConfig(windowInfo);
    const shortcuts = selection.config[modifier] ?? [];

    if (shortcuts.length === 0) {
      hideHint();
      return;
    }

    renderHint(modifier, shortcuts, windowInfo, selection.profile);
  } catch (error) {
    // 在开发环境下可能没有后端支持，忽略错误
    console.debug('轮询修饰键状态失败:', error);
  }
}

async function bootstrap(): Promise<void> {
  applyGlobalLayerStyles();

  invoke = await acquireInvoke();

  if (!invoke) {
    console.warn('无法获取 Tauri invoke 接口，快捷键提示将不可用');
    return;
  }

  window.setInterval(pollModifierState, POLL_INTERVAL);
}
