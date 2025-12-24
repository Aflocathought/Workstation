// src/Tools/ToolsSidebar.tsx
import { Component, For, createSignal, Show } from "solid-js";
import type { ToolConfig } from "./types";
import { ToolCategory } from "./types";
import { TOOL_CATEGORIES } from "./categories";
import styles from "./ToolsSidebar.module.css";

interface ToolsSidebarProps {
  tools: ToolConfig[];
  activeTool: string | null;
  onSelectTool: (toolId: string) => void;
  onCloseTool: () => void;
  onRequestHide?: () => void;
}

/**
 * 工具侧边栏组件
 * 支持分类折叠和工具选择
 */
const ToolsSidebar: Component<ToolsSidebarProps> = (props) => {
  // 管理每个分类的折叠状态
  const [collapsedCategories, setCollapsedCategories] = createSignal<
    Set<ToolCategory>
  >(new Set());

  // 组件保持轻量：收起/展开由父级控制（overlay 方式）

  // 切换分类折叠状态
  const toggleCategory = (categoryId: ToolCategory) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // 检查分类是否折叠
  const isCategoryCollapsed = (categoryId: ToolCategory) => {
    return collapsedCategories().has(categoryId);
  };

  // 根据分类分组工具
  const toolsByCategory = () => {
    const grouped = new Map<ToolCategory, ToolConfig[]>();

    // 初始化所有分类
    TOOL_CATEGORIES.forEach((cat) => {
      grouped.set(cat.id, []);
    });

    // 分组工具
    props.tools.forEach((tool) => {
      const list = grouped.get(tool.category);
      if (list) {
        list.push(tool);
      }
    });

    return grouped;
  };

  // 获取当前激活工具的配置
  const activeToolConfig = () => {
    if (!props.activeTool) return null;
    return props.tools.find((t) => t.id === props.activeTool);
  };

  return (
    <div class={styles.sidebar}>
      <div class={styles.header}>
        <h3>工具箱</h3>
        <button
          class={styles.collapseButton}
          onClick={() => props.onRequestHide?.()}
          title="收起"
        >
          «
        </button>
      </div>

      {/* 当有激活工具时显示工具头部栏 */}
      <Show when={activeToolConfig()}>
        {(config) => (
          <div class={styles.toolHeader}>
            <div class={styles.toolInfo}>
              <span class={styles.toolHeaderIcon}>{config().icon}</span>
              <div class={styles.toolHeaderContent}>
                <h2 class={styles.toolHeaderTitle}>{config().name}</h2>
                <p class={styles.toolHeaderDescription}>
                  {config().description}
                </p>
              </div>
            </div>
            <button
              class={styles.closeButton}
              onClick={props.onCloseTool}
              title="关闭工具"
            >
              ✕
            </button>
          </div>
        )}
      </Show>

      <div class={styles.categories}>
        <For each={TOOL_CATEGORIES}>
          {(category) => {
            const categoryTools = () =>
              toolsByCategory().get(category.id) || [];
            const hasTools = () => categoryTools().length > 0;
            const isCollapsed = () => isCategoryCollapsed(category.id);

            return (
              <Show when={hasTools()}>
                <div class={styles.category}>
                  {/* 分类头部 */}
                  <div
                    class={styles.categoryHeader}
                    onClick={() => toggleCategory(category.id)}
                  >
                    <span class={styles.categoryIcon}>
                      {isCollapsed() ? "▶" : "▼"}
                    </span>
                    <span class={styles.categoryEmoji}>{category.icon}</span>
                    <span class={styles.categoryName}>{category.name}</span>
                    <span class={styles.categoryCount}>
                      ({categoryTools().length})
                    </span>
                  </div>

                  {/* 工具列表 */}
                  <Show when={!isCollapsed()}>
                    <div class={styles.toolsList}>
                      <For each={categoryTools()}>
                        {(tool) => (
                          <div
                            class={styles.toolItem}
                            classList={{
                              [styles.active]: props.activeTool === tool.id,
                            }}
                            onClick={() => {
                              console.log(
                                "[ToolsSidebar] clicked tool ->",
                                tool.id
                              );
                              props.onSelectTool(tool.id);
                            }}
                            title={tool.description}
                          >
                            <span class={styles.toolIcon}>{tool.icon}</span>
                            <span class={styles.toolName}>{tool.name}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default ToolsSidebar;
