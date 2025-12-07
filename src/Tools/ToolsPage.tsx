// src/Tools/ToolsPage.tsx
import { Component, Show, Suspense, createSignal, onCleanup, onMount, lazy } from 'solid-js';
import { allToolConfigs } from './registerRoute';
import { toolStateManager } from './ToolStateManager';
import ToolsSidebar from './ToolsSidebar';
import styles from './ToolsPage.module.css';

/**
 * Tools 主容器组件
 * 包含可折叠的分类侧边栏和工具内容区域
 */
const ToolsPage: Component = () => {
  // 当前激活的工具 ID
  const [activeTool, setActiveTool] = createSignal<string | null>(toolStateManager.getActiveTool());
  
  // 当前工具的状态引用 (用于保存)
  let currentToolStateRef: any = null;

  // 选择工具
  const handleSelectTool = (toolId: string) => {
    // 如果点击当前已激活的工具,则不做处理
    if (activeTool() === toolId) {
      return;
    }

    // 保存当前工具状态 (如果需要)
    saveCurrentToolState();

    // 切换到新工具
    setActiveTool(toolId);
    toolStateManager.setActiveTool(toolId);

    // 恢复新工具的状态 (如果有)
    restoreToolState(toolId);
  };

  // 保存当前工具状态
  const saveCurrentToolState = () => {
    const currentId = activeTool();
    if (!currentId) return;

    const config = allToolConfigs.find((t) => t.id === currentId);
    if (config?.saveState && currentToolStateRef) {
      // 如果工具暴露了 getState 方法,调用它获取状态
      if (typeof currentToolStateRef.getState === 'function') {
        const state = currentToolStateRef.getState();
        toolStateManager.saveState(currentId, state);
        console.log(`✅ 已保存工具状态: ${config.name}`);
      }
    }
  };

  // 恢复工具状态
  const restoreToolState = (toolId: string) => {
    const config = allToolConfigs.find((t) => t.id === toolId);
    if (config?.saveState) {
      const savedState = toolStateManager.getState(toolId);
      if (savedState) {
        console.log(`🔄 恢复工具状态: ${config.name}`, savedState);
        // 状态会在工具组件挂载后恢复
      }
    }
  };

  // 关闭当前工具
  const handleCloseTool = () => {
    saveCurrentToolState();
    setActiveTool(null);
    currentToolStateRef = null;
    toolStateManager.setActiveTool(null);
  };

  // 组件卸载时保存状态
  onCleanup(() => {
    saveCurrentToolState();
  });

  onMount(() => {
    const initialTool = toolStateManager.getActiveTool();
    if (initialTool) {
      const exists = allToolConfigs.some((config) => config.id === initialTool);
      if (exists) {
        setActiveTool(initialTool);
        restoreToolState(initialTool);
      } else {
        toolStateManager.setActiveTool(null);
      }
    }
  });

  return (
    <div class={styles.toolsPage}>
      {/* 左侧:可折叠的分类侧边栏 */}
      <ToolsSidebar
        tools={allToolConfigs}
        activeTool={activeTool()}
        onSelectTool={handleSelectTool}
        onCloseTool={handleCloseTool}
      />

      {/* 右侧:工具内容容器 */}
      <div class={styles.contentContainer}>
        {/* 使用 activeTool 作为 key 来强制重新挂载 */}
        <Show
          when={activeTool()}
          keyed
          fallback={
            <div class={styles.emptyState}>
              <div class={styles.emptyIcon}>🔧</div>
              <h3>选择一个工具开始使用</h3>
              <p>从左侧侧边栏选择一个工具来开始</p>
            </div>
          }
        >
          {(toolId) => {
            const config = allToolConfigs.find((t) => t.id === toolId);
            if (!config) return null;
            
            return (
              <div class={styles.toolContent}>
                <Suspense
                  fallback={
                    <div class={styles.loading}>
                      <div class={styles.spinner}></div>
                      <p>加载中...</p>
                    </div>
                  }
                >
                  <ToolRenderer
                    config={config}
                    onRefReady={(ref) => {
                      currentToolStateRef = ref;
                      // 如果有保存的状态,恢复它
                      if (config.saveState) {
                        const savedState = toolStateManager.getState(config.id);
                        if (savedState && ref && typeof ref.setState === 'function') {
                          ref.setState(savedState);
                        }
                      }
                    }}
                  />
                </Suspense>
              </div>
            );
          }}
        </Show>
      </div>
    </div>
  );
};

/**
 * 工具渲染器组件
 * 负责动态加载和渲染工具组件
 */
const ToolRenderer: Component<{
  config: any;
  onRefReady: (ref: any) => void;
}> = (props) => {
  const LazyComponent = lazy(props.config.component);
  console.log('[ToolRenderer] rendering lazy component for', props.config.id || props.config.name);

  return (
    <LazyComponent
      ref={(ref: any) => {
        if (ref) {
          console.log('[ToolRenderer] ref ready for', props.config.id || props.config.name, ref);
          props.onRefReady(ref);
        }
      }}
    />
  );
};

export default ToolsPage;
