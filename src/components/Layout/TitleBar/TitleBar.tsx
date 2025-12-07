// src/components/Layout/TitleBar/TitleBar.tsx
import { Component, createSignal, onMount, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { router } from "../../../core/Router/Router";
import { NavBar, type NavItem } from "../Navigation/NavBar";
import styles from "./TitleBar.module.css";
import {
  AppIcon,
  MinimizeIcon,
  MaximizeIcon,
  RestoreIcon,
  CloseIcon,
} from "./TitleBarIcons";

const TitleBar: Component = () => {
  const [isMaximized, setIsMaximized] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(true);
  const appWindow = getCurrentWindow();

  // 将路由转换为导航项,设置路由放在最后
  const mainNavItems = (): NavItem[] => {
    const routes = router.visibleRoutes;
    const settingsRoute = routes.find((r) => r.id === "settings");
    const otherRoutes = routes.filter((r) => r.id !== "settings");
    
    // 将设置路由放在最后
    const orderedRoutes = settingsRoute 
      ? [...otherRoutes, settingsRoute] 
      : otherRoutes;
    
    return orderedRoutes.map((route) => ({
      id: route.id,
      label: route.name,
      icon: route.icon,
      description: route.description,
    }));
  };

  onMount(async () => {
    // 监听窗口最大化状态变化
    const unlistenResize = await appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    });

    // 监听窗口焦点变化
    const unlistenFocus = await appWindow.onFocusChanged(
      ({ payload: focused }) => {
        setIsFocused(focused);
      }
    );

    // 初始化状态
    const maximized = await appWindow.isMaximized();
    setIsMaximized(maximized);

    const focused = await appWindow.isFocused();
    setIsFocused(focused);

    onCleanup(() => {
      unlistenResize();
      unlistenFocus();
    });
  });

  const handleMinimize = async () => {
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    await appWindow.close();
  };

  return (
    <div
      class={styles.titleBar}
      classList={{ [styles.unfocused]: !isFocused() }}
      data-tauri-drag-region
    >
      {/* 应用图标 */}
      <div class={styles.titleSection} data-tauri-drag-region>
        <div class={styles.appIcon} data-tauri-drag-region>
          <AppIcon />
        </div>
      </div>

      {/* 分隔线 */}
      <div class={styles.divider} />

      {/* 主要功能按钮 */}
      <NavBar
        items={mainNavItems()}
        activeId={router.current}
        onNavigate={(id) => router.navigate(id)}
        direction="horizontal"
        variant="minimal"
        showIcon={true}
        showLabel={true}
        class={styles.mainActions}
      />

      {/* 可拖动的空白区域 */}
      <div class={styles.dragSpacer} data-tauri-drag-region />

      {/* 窗口控制按钮 */}
      <div class={styles.windowControls}>
        <button
          class={styles.controlButton}
          onClick={handleMinimize}
          title="最小化"
          aria-label="最小化"
        >
          <MinimizeIcon />
        </button>

        <button
          class={styles.controlButton}
          onClick={handleMaximize}
          title={isMaximized() ? "还原" : "最大化"}
          aria-label={isMaximized() ? "还原" : "最大化"}
        >
          {isMaximized() ? <RestoreIcon /> : <MaximizeIcon />}
        </button>

        <button
          class={`${styles.controlButton} ${styles.closeButton}`}
          onClick={handleClose}
          title="关闭"
          aria-label="关闭"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
