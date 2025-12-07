// src/Tools/ShortcutReminder/SR.tsx
import { Component, createMemo, createSignal, onMount } from "solid-js";
import type {
  ModifierKey,
  ShortcutConfig,
  ShortcutConfigData,
  ShortcutConfigMap,
  ShortcutDefinition,
} from "./types";
import { ModifierKey as MK } from "./types";
import { errorManager } from "../../core/ErrorHandlerSimple";
import SRRender from "./Component/SRRender";

const STORAGE_KEY = "shortcut-reminder-config";
const HINT_ENABLED_KEY = "shortcut-reminder-hint-enabled";
const CONFIG_VERSION = "1.3.0";
const GLOBAL_SCOPE = "__global__";
const MODIFIER_TABS: ModifierKey[] = [
  MK.CTRL,
  MK.ALT,
  MK.SHIFT,
  MK.WIN,
  MK.CTRL_ALT,
  MK.CTRL_SHIFT,
  MK.ALT_SHIFT,
  MK.CTRL_ALT_SHIFT,
  MK.NONE,
];
const ALLOW_EMPTY_KEY = new Set<ModifierKey>([
  MK.CTRL,
  MK.ALT,
  MK.SHIFT,
  MK.WIN,
  MK.CTRL_ALT,
  MK.CTRL_SHIFT,
  MK.ALT_SHIFT,
  MK.CTRL_ALT_SHIFT,
]);

function createEmptyConfig(): ShortcutConfig {
  return {
    [MK.CTRL]: [],
    [MK.ALT]: [],
    [MK.SHIFT]: [],
    [MK.WIN]: [],
    [MK.CTRL_ALT]: [],
    [MK.CTRL_SHIFT]: [],
    [MK.ALT_SHIFT]: [],
    [MK.CTRL_ALT_SHIFT]: [],
    [MK.NONE]: [],
  };
}

function normalizeConfig(
  raw?: ShortcutConfig | Partial<Record<ModifierKey, ShortcutDefinition[]>>
): ShortcutConfig {
  const normalized = createEmptyConfig();
  if (!raw) {
    return normalized;
  }

  (Object.keys(normalized) as ModifierKey[]).forEach((modifier) => {
    normalized[modifier] = (raw[modifier] ?? []).map((shortcut) => ({
      ...shortcut,
    }));
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

function getDefaultConfig(): ShortcutConfig {
  const defaults = createEmptyConfig();
  defaults[MK.CTRL] = [
    { key: "S", description: "保存文件", modifier: MK.CTRL },
    { key: "C", description: "复制", modifier: MK.CTRL },
    { key: "V", description: "粘贴", modifier: MK.CTRL },
    { key: "X", description: "剪切", modifier: MK.CTRL },
    { key: "Z", description: "撤销", modifier: MK.CTRL },
    { key: "Y", description: "重做", modifier: MK.CTRL },
  ];
  defaults[MK.ALT] = [
    { key: "F4", description: "关闭窗口", modifier: MK.ALT },
    { key: "Tab", description: "切换窗口", modifier: MK.ALT },
  ];
  defaults[MK.SHIFT] = [
    { key: "Delete", description: "永久删除", modifier: MK.SHIFT },
  ];
  defaults[MK.CTRL_ALT] = [
    { key: "Delete", description: "任务管理器", modifier: MK.CTRL_ALT },
  ];
  defaults[MK.CTRL_SHIFT] = [
    { key: "Esc", description: "任务管理器", modifier: MK.CTRL_SHIFT },
    { key: "N", description: "新建无痕窗口", modifier: MK.CTRL_SHIFT },
  ];
  defaults[MK.WIN] = [
    { key: "D", description: "显示桌面", modifier: MK.WIN },
    { key: "E", description: "打开文件资源管理器", modifier: MK.WIN },
  ];
  defaults[MK.NONE] = [
    { key: "F5", description: "刷新当前页面/窗口", modifier: MK.NONE },
    { key: "PrintScreen", description: "截取屏幕", modifier: MK.NONE },
  ];
  return defaults;
}

function loadConfig(): { global: ShortcutConfig; apps: ShortcutConfigMap } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data: ShortcutConfigData = JSON.parse(saved);
      return {
        global: normalizeConfig(data.config),
        apps: normalizeAppConfigs(data.appConfigs),
      };
    }
  } catch (error) {
    console.error("加载快捷键配置失败:", error);
  }

  return { global: getDefaultConfig(), apps: {} };
}

function loadHintEnabledState(): boolean {
  try {
    const saved = localStorage.getItem(HINT_ENABLED_KEY);
    return saved ? JSON.parse(saved) : true;
  } catch (error) {
    console.error("加载悬浮提示开关状态失败:", error);
    return true;
  }
}

type ProfileKeyInfo = {
  type: "process" | "title" | "class" | "regex";
  raw: string;
  display: string;
};

function parseProfileKey(key: string): ProfileKeyInfo {
  const trimmed = key.trim();
  const index = trimmed.indexOf(":");
  if (index === -1) {
    return { type: "process", raw: trimmed, display: trimmed };
  }

  const prefix = trimmed.slice(0, index).toLowerCase();
  const value = trimmed.slice(index + 1).trim();
  const typeMap: Record<string, ProfileKeyInfo["type"]> = {
    process: "process",
    title: "title",
    class: "class",
    regex: "regex",
  };
  const type = typeMap[prefix] ?? "process";
  return { type, raw: value, display: value || trimmed };
}

function getProfileLabel(profile: string): string {
  if (profile === GLOBAL_SCOPE) {
    return "全局配置";
  }

  const parsed = parseProfileKey(profile);
  const prefixMap: Record<ProfileKeyInfo["type"], string> = {
    process: "进程",
    title: "窗口标题",
    class: "窗口类名",
    regex: "正则匹配",
  };

  return `${prefixMap[parsed.type]}：${parsed.display || "(未填写)"}`;
}

const ShortcutReminder: Component = () => {
  const initial = loadConfig();

  const [activeTab, setActiveTab] = createSignal<ModifierKey>(MK.CTRL);
  const [activeProfile, setActiveProfile] = createSignal<string>(GLOBAL_SCOPE);
  const [isHintEnabled, setIsHintEnabled] = createSignal(
    loadHintEnabledState()
  );
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [editingShortcut, setEditingShortcut] =
    createSignal<ShortcutDefinition | null>(null);
  const [formKey, setFormKey] = createSignal("");
  const [formDescription, setFormDescription] = createSignal("");
  const [config, setConfig] = createSignal<ShortcutConfig>(initial.global);
  const [appConfigs, setAppConfigs] = createSignal<ShortcutConfigMap>(
    initial.apps
  );

  const appOptions = createMemo(() => Object.keys(appConfigs()));

  const currentProfileConfig = createMemo<ShortcutConfig>(() => {
    const profile = activeProfile();
    if (profile === GLOBAL_SCOPE) {
      return config();
    }
    const apps = appConfigs();
    return apps[profile] ?? createEmptyConfig();
  });

  const currentShortcuts = createMemo(
    () => currentProfileConfig()[activeTab()] ?? []
  );
  const activeProfileLabel = createMemo(() => getProfileLabel(activeProfile()));

  const notify = (type: "success" | "error" | "info", text: string) => {
    const title = "快捷键提醒";
    switch (type) {
      case "success":
        errorManager.success(title, text);
        break;
      case "error":
        errorManager.error(title, text);
        break;
      case "info":
      default:
        errorManager.info(title, text);
        break;
    }
  };

  function persistState(
    globalConfig: ShortcutConfig,
    scopedConfigs: ShortcutConfigMap,
    options: {
      silent?: boolean;
      message?: { type: "success" | "error" | "info"; text: string };
    } = {}
  ) {
    try {
      const normalizedGlobal = normalizeConfig(globalConfig);
      const normalizedApps = normalizeAppConfigs(scopedConfigs);
      const data: ShortcutConfigData = {
        version: CONFIG_VERSION,
        timestamp: Date.now(),
        config: normalizedGlobal,
        appConfigs: normalizedApps,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setConfig(normalizedGlobal);
      setAppConfigs(normalizedApps);
      if (!options.silent) {
        if (options.message) {
          notify(options.message.type, options.message.text);
        } else {
          notify("success", "配置已保存");
        }
      }
    } catch (error) {
      console.error("保存快捷键配置失败:", error);
      if (!options.silent) {
        notify("error", "保存配置失败");
      }
    }
  }

  function saveHintEnabled(enabled: boolean) {
    try {
      localStorage.setItem(HINT_ENABLED_KEY, JSON.stringify(enabled));
      setIsHintEnabled(enabled);
    } catch (error) {
      console.error("保存悬浮提示开关状态失败:", error);
    }
  }

  function handleToggleHint(enabled: boolean) {
    saveHintEnabled(enabled);
  }

  function resetForm() {
    setFormKey("");
    setFormDescription("");
    setEditingShortcut(null);
    setShowAddForm(false);
  }

  function handleScopeChange(scope: string) {
    if (scope === activeProfile()) {
      return;
    }

    setActiveProfile(scope);
    setShowAddForm(false);
    setEditingShortcut(null);
    setFormKey("");
    setFormDescription("");
  }

  function handleAddProfile() {
    const input = window.prompt(
      "请输入应用匹配规则（如 process:code.exe 或 title:Visual Studio Code）",
      "process:"
    );
    if (!input) {
      return;
    }

    const identifier = input.trim();
    if (!identifier) {
      notify("error", "应用标识不能为空");
      return;
    }

    if (identifier === GLOBAL_SCOPE) {
      notify("error", "该标识被系统保留");
      return;
    }

    const apps = appConfigs();
    if (apps[identifier]) {
      notify("error", "该应用配置已存在");
      return;
    }

    const nextApps = { ...apps, [identifier]: createEmptyConfig() };
    persistState(config(), nextApps, {
      message: {
        type: "success",
        text: `已添加应用配置：${getProfileLabel(identifier)}`,
      },
    });
    setActiveProfile(identifier);
    setActiveTab(MK.CTRL);
    resetForm();
  }

  function handleRemoveProfile() {
    const profile = activeProfile();
    if (profile === GLOBAL_SCOPE) {
      return;
    }

    if (
      !window.confirm(`确定要删除应用配置「${getProfileLabel(profile)}」吗？`)
    ) {
      return;
    }

    const nextApps = { ...appConfigs() };
    delete nextApps[profile];
    persistState(config(), nextApps, {
      message: { type: "info", text: "已删除应用配置" },
    });
    setActiveProfile(GLOBAL_SCOPE);
    setActiveTab(MK.CTRL);
    resetForm();
  }

  function handleAddShortcut() {
    const rawKey = formKey().trim();
    const description = formDescription().trim();
    const modifier = activeTab();

    if (!description) {
      notify("error", "请填写功能描述");
      return;
    }

    if (modifier === MK.NONE && !rawKey) {
      notify("error", "无修饰键快捷键需要设置按键");
      return;
    }

    if (!rawKey && !ALLOW_EMPTY_KEY.has(modifier)) {
      notify("error", "请填写快捷键键位");
      return;
    }

    const shortcut: ShortcutDefinition = {
      key: rawKey,
      description,
      modifier,
    };

    const profile = activeProfile();
    if (profile === GLOBAL_SCOPE) {
      const updated = normalizeConfig(config());
      const index = editingShortcut()
        ? updated[activeTab()].findIndex(
            (item) =>
              item.key === editingShortcut()!.key &&
              item.description === editingShortcut()!.description
          )
        : -1;

      if (index >= 0) {
        updated[activeTab()][index] = shortcut;
      } else {
        updated[activeTab()].push(shortcut);
      }

      persistState(updated, appConfigs());
    } else {
      const apps = normalizeAppConfigs(appConfigs());
      const scoped = apps[profile] ?? createEmptyConfig();
      const index = editingShortcut()
        ? scoped[activeTab()].findIndex(
            (item) =>
              item.key === editingShortcut()!.key &&
              item.description === editingShortcut()!.description
          )
        : -1;

      if (index >= 0) {
        scoped[activeTab()][index] = shortcut;
      } else {
        scoped[activeTab()].push(shortcut);
      }

      apps[profile] = scoped;
      persistState(config(), apps);
    }

    resetForm();
  }

  function handleDeleteShortcut(shortcut: ShortcutDefinition) {
    const profile = activeProfile();
    if (profile === GLOBAL_SCOPE) {
      const updated = normalizeConfig(config());
      updated[activeTab()] = updated[activeTab()].filter(
        (item) =>
          item.key !== shortcut.key || item.description !== shortcut.description
      );
      persistState(updated, appConfigs());
    } else {
      const apps = normalizeAppConfigs(appConfigs());
      const scoped = apps[profile] ?? createEmptyConfig();
      scoped[activeTab()] = scoped[activeTab()].filter(
        (item) =>
          item.key !== shortcut.key || item.description !== shortcut.description
      );
      apps[profile] = scoped;
      persistState(config(), apps);
    }
  }

  function handleEditShortcut(shortcut: ShortcutDefinition) {
    setEditingShortcut(shortcut);
    setFormKey(shortcut.key);
    setFormDescription(shortcut.description);
    setShowAddForm(true);
  }

  function handleExport() {
    try {
      const data: ShortcutConfigData = {
        version: CONFIG_VERSION,
        timestamp: Date.now(),
        config: normalizeConfig(config()),
        appConfigs: normalizeAppConfigs(appConfigs()),
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `shortcut-config-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify("success", "配置已导出");
    } catch (error) {
      console.error("导出配置失败:", error);
      notify("error", "导出配置失败");
    }
  }

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const data: ShortcutConfigData = JSON.parse(text);
        if (!data.config) {
          throw new Error("config missing");
        }

        persistState(
          normalizeConfig(data.config),
          normalizeAppConfigs(data.appConfigs),
          {
            message: { type: "success", text: "配置已导入" },
          }
        );
        setActiveProfile(GLOBAL_SCOPE);
        setActiveTab(MK.CTRL);
        resetForm();
      } catch (error) {
        console.error("导入配置失败:", error);
        notify("error", "导入配置失败，请检查文件格式");
      }
    };

    input.click();
  }

  function handleReset() {
    if (
      !window.confirm(
        "确定要重置为默认配置吗？这将移除所有自定义快捷键和应用配置。"
      )
    ) {
      return;
    }

    persistState(
      getDefaultConfig(),
      {},
      { message: { type: "info", text: "已重置为默认配置" } }
    );
    setActiveProfile(GLOBAL_SCOPE);
    setActiveTab(MK.CTRL);
    resetForm();
  }

  function getModifierName(modifier: ModifierKey): string {
    const names: Record<ModifierKey, string> = {
      [MK.CTRL]: "Ctrl",
      [MK.ALT]: "Alt",
      [MK.SHIFT]: "Shift",
      [MK.WIN]: "Win",
      [MK.CTRL_ALT]: "Ctrl + Alt",
      [MK.CTRL_SHIFT]: "Ctrl + Shift",
      [MK.ALT_SHIFT]: "Alt + Shift",
      [MK.CTRL_ALT_SHIFT]: "Ctrl + Alt + Shift",
      [MK.NONE]: "无修饰",
    };
    return names[modifier];
  }

  function formatShortcutKey(shortcut: ShortcutDefinition): string {
    if (shortcut.modifier === MK.NONE) {
      return shortcut.key;
    }
    if (!shortcut.key) {
      return getModifierName(shortcut.modifier);
    }
    return `${getModifierName(shortcut.modifier)} + ${shortcut.key}`;
  }

  onMount(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      persistState(getDefaultConfig(), {}, { silent: true });
    } else {
      persistState(config(), appConfigs(), { silent: true });
    }

    if (!localStorage.getItem(HINT_ENABLED_KEY)) {
      localStorage.setItem(HINT_ENABLED_KEY, JSON.stringify(true));
    }
  });

  return (
    <SRRender
      activeProfile={activeProfile}
      globalScope={GLOBAL_SCOPE}
      appOptions={appOptions}
      onScopeChange={handleScopeChange}
      onAddProfile={handleAddProfile}
      onRemoveProfile={handleRemoveProfile}
      modifierTabs={MODIFIER_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      modifierLabelFormatter={getModifierName}
      showAddForm={showAddForm}
      onOpenAddForm={() => {
        setShowAddForm(true);
      }}
      onCancelShortcut={resetForm}
      onExport={handleExport}
      onImport={handleImport}
      onReset={handleReset}
      isHintEnabled={isHintEnabled}
      onToggleHint={handleToggleHint}
      activeProfileLabel={activeProfileLabel}
      profileLabelFormatter={getProfileLabel}
      formKey={formKey}
      onFormKeyInput={setFormKey}
      formDescription={formDescription}
      onFormDescriptionInput={setFormDescription}
      onSubmitShortcut={handleAddShortcut}
      editingShortcut={editingShortcut}
      currentShortcuts={currentShortcuts}
      formatShortcutKey={formatShortcutKey}
      onEditShortcut={handleEditShortcut}
      onDeleteShortcut={handleDeleteShortcut}
    />
  );
};

export default ShortcutReminder;
