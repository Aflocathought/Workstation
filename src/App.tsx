import { onMount, Show } from "solid-js";
import { Toaster } from 'solid-toast';
import styles from "./App.module.css";
import "./styles/themes.css"; // 导入主题系统
import TitleBar from "./components/Layout/TitleBar/TitleBar";
import TimeTrackPage from "./Timetrack/TimeTrackPage";
import ToolsPage from "./Tools/ToolsPage";
import SettingsPage from "./Settings/SettingsPage";
import NotificationContainer from "./components/Layout/NotificationContainer/NotificationContainer";
import { initializeApp } from "./core/AppFramework";
import { router } from "./core/Router/Router";
import { registerTimeTrackRoutes } from "./Timetrack";
import { registerToolsRoutes } from "./Tools";
import { registerSettingsRoute } from "./Settings";
import { themeManager } from "./core/ThemeManager"; // 导入主题管理器

function App() {
  // 组件挂载时执行
  onMount(async () => {
    // 初始化主题管理器 (确保在应用启动时加载)
    void themeManager.currentTheme; // 触发主题管理器初始化
    
    // 注册时间追踪路由
    registerTimeTrackRoutes();
    
    // 注册工具集合路由
    registerToolsRoutes();
    
    // 注册设置路由
    registerSettingsRoute();
    
    // 初始化应用框架
    await initializeApp();
  });

  return (
    <div class={styles.container}>
      {/* 自定义标题栏 */}
      <TitleBar />

      {/* 全局 Toast 通知 */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--vscode-editorWidget-background)',
            color: 'var(--vscode-editorWidget-foreground)',
            border: '1px solid var(--vscode-editorWidget-border)',
          },
        }}
      />

      {/* 主内容区域 */}
      <div class={styles.mainContent}>
        {/* 通知容器 */}
        <NotificationContainer />

        {/* 根据路由显示对应页面 */}
        
        {/* 时间追踪模块 */}
        <Show when={router.current === "timetrack" || router.current === "timetrack-dashboard" || router.current === "timetrack-category"}>
          <div class={styles.card}>
            <TimeTrackPage />
          </div>
        </Show>

        {/* 工具集合模块 */}
        <Show when={router.current === "tools" || router.current === "tools-spectrum"}>
          <div class={styles.card}>
            <ToolsPage />
          </div>
        </Show>

        {/* 设置模块 */}
        <Show when={router.current === "settings"}>
          <SettingsPage />
        </Show>
      </div>
    </div>
  );
}

export default App;
