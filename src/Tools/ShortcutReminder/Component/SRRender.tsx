import { Component, Accessor, For, Show } from "solid-js";
import layoutStyles from "./styles/layout.module.css";
import toolbarStyles from "./styles/toolbar.module.css";
import sidebarStyles from "./styles/sidebar.module.css";
import shortcutsStyles from "./styles/shortcuts.module.css";
import formStyles from "./styles/form.module.css";
import type { ModifierKey, ShortcutDefinition } from "../types";

type SRRenderProps = {
  activeProfile: Accessor<string>;
  globalScope: string;
  appOptions: Accessor<string[]>;
  onScopeChange: (scope: string) => void;
  onAddProfile: () => void;
  onRemoveProfile: () => void;
  modifierTabs: ModifierKey[];
  activeTab: Accessor<ModifierKey>;
  onTabChange: (modifier: ModifierKey) => void;
  modifierLabelFormatter: (modifier: ModifierKey) => string;
  showAddForm: Accessor<boolean>;
  onOpenAddForm: () => void;
  onCancelShortcut: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  isHintEnabled: Accessor<boolean>;
  onToggleHint: (enabled: boolean) => void;
  activeProfileLabel: Accessor<string>;
  profileLabelFormatter: (profile: string) => string;
  formKey: Accessor<string>;
  onFormKeyInput: (value: string) => void;
  formDescription: Accessor<string>;
  onFormDescriptionInput: (value: string) => void;
  onSubmitShortcut: () => void;
  editingShortcut: Accessor<ShortcutDefinition | null>;
  currentShortcuts: Accessor<ShortcutDefinition[]>;
  formatShortcutKey: (shortcut: ShortcutDefinition) => string;
  onEditShortcut: (shortcut: ShortcutDefinition) => void;
  onDeleteShortcut: (shortcut: ShortcutDefinition) => void;
};

const SRRender: Component<SRRenderProps> = (props) => {
  const handleToggleAddForm = () => {
    if (props.showAddForm()) {
      props.onCancelShortcut();
      return;
    }
    props.onOpenAddForm();
  };
  return (
    <div class={layoutStyles.container}>
      <div class={layoutStyles.content}>
        <div class={toolbarStyles.toolbar}>
          <div class={toolbarStyles.scopeControls}>
            <span class={toolbarStyles.scopeLabel}>作用范围</span>
            <select
              class={toolbarStyles.scopeSelect}
              value={props.activeProfile()}
              onChange={(event) => props.onScopeChange(event.currentTarget.value)}
            >
              <option value={props.globalScope}>全局配置</option>
              <For each={props.appOptions()}>
                {(profile) => (
                  <option value={profile}>{props.profileLabelFormatter(profile)}</option>
                )}
              </For>
            </select>
            <button
              class={`${toolbarStyles.button} ${toolbarStyles.buttonSecondary}`}
              onClick={props.onAddProfile}
            >
              ➕ 添加应用
            </button>
            <Show when={props.activeProfile() !== props.globalScope}>
              <button
                class={`${toolbarStyles.button} ${toolbarStyles.buttonDanger}`}
                onClick={props.onRemoveProfile}
              >
                ❌ 删除应用
              </button>
            </Show>
          </div>
        </div>

        <div class={layoutStyles.workspace}>
          <aside class={sidebarStyles.sidebar}>
            <div class={sidebarStyles.sidebarHeader}>修饰键分组</div>
            <div class={sidebarStyles.tabList}>
              <For each={props.modifierTabs}>
                {(modifier) => (
                  <button
                    class={sidebarStyles.tab}
                    classList={{
                      [sidebarStyles.tabActive]: props.activeTab() === modifier,
                    }}
                    onClick={() => props.onTabChange(modifier)}
                  >
                    <span class={sidebarStyles.tabIcon}>⌨️</span>
                    <span>{props.modifierLabelFormatter(modifier)}</span>
                  </button>
                )}
              </For>
            </div>
          </aside>

          <div class={layoutStyles.mainArea}>
            <div class={toolbarStyles.actionsBar}>
              <div class={toolbarStyles.addButtonWrapper}>
                <button class={toolbarStyles.button} onClick={handleToggleAddForm}>
                  {props.showAddForm() ? "取消" : "➕ 添加快捷键"}
                </button>
                <Show when={props.showAddForm()}>
                  <div class={formStyles.popover}>
                    <div class={formStyles.form}>
                      <div class={formStyles.formRow}>
                        <label class={formStyles.formLabel}>按键</label>
                        <input
                          type="text"
                          class={formStyles.formInput}
                          value={props.formKey()}
                          onInput={(event) => props.onFormKeyInput(event.currentTarget.value)}
                          placeholder="如: A, F1, Enter, Space 等"
                        />
                      </div>
                      <div class={formStyles.formRow}>
                        <label class={formStyles.formLabel}>功能描述</label>
                        <input
                          type="text"
                          class={formStyles.formInput}
                          value={props.formDescription()}
                          onInput={(event) =>
                            props.onFormDescriptionInput(event.currentTarget.value)
                          }
                          placeholder="描述该快捷键的功能"
                        />
                      </div>
                      <div class={formStyles.formActions}>
                        <button class={toolbarStyles.button} onClick={props.onSubmitShortcut}>
                          {props.editingShortcut() ? "保存" : "添加"}
                        </button>
                        <button
                          class={`${toolbarStyles.button} ${toolbarStyles.buttonSecondary}`}
                          onClick={props.onCancelShortcut}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                </Show>
              </div>
              <button
                class={`${toolbarStyles.button} ${toolbarStyles.buttonSecondary}`}
                onClick={props.onExport}
              >
                💾 导出配置
              </button>
              <button
                class={`${toolbarStyles.button} ${toolbarStyles.buttonSecondary}`}
                onClick={props.onImport}
              >
                📁 导入配置
              </button>
              <button
                class={`${toolbarStyles.button} ${toolbarStyles.buttonSecondary}`}
                onClick={props.onReset}
              >
                🔄 重置默认
              </button>
              <label class={toolbarStyles.switchLabel}>
                <input
                  type="checkbox"
                  checked={props.isHintEnabled()}
                  onChange={(event) => props.onToggleHint(event.currentTarget.checked)}
                  class={toolbarStyles.switchInput}
                />
                <span class={toolbarStyles.switchText}>
                  {props.isHintEnabled() ? "🟢 悬浮窗口已启用" : "🔴 悬浮窗口已禁用"}
                </span>
              </label>
            </div>

            <div class={layoutStyles.profileBanner}>
              当前作用范围：{props.activeProfileLabel()}
            </div>

            <div class={layoutStyles.mainScroll}>
              <div class={shortcutsStyles.shortcutsList}>
                <Show
                  when={props.currentShortcuts().length > 0}
                  fallback={
                    <div class={shortcutsStyles.emptyState}>
                      <p>📝 {props.activeProfileLabel()} 下还没有快捷键</p>
                      <p>点击上方“添加快捷键”按钮开始配置</p>
                    </div>
                  }
                >
                  <For each={props.currentShortcuts()}>
                    {(shortcut) => (
                      <div class={shortcutsStyles.shortcutItem}>
                        <div class={shortcutsStyles.shortcutKey}>
                          {props.formatShortcutKey(shortcut)}
                        </div>
                        <div class={shortcutsStyles.shortcutDescription}>
                          {shortcut.description}
                        </div>
                        <div class={shortcutsStyles.shortcutActions}>
                          <button
                            class={shortcutsStyles.iconButton}
                            onClick={() => props.onEditShortcut(shortcut)}
                            title="编辑"
                          >
                            ✏️
                          </button>
                          <button
                            class={shortcutsStyles.iconButton}
                            onClick={() => props.onDeleteShortcut(shortcut)}
                            title="删除"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SRRender;
