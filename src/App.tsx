import { onMount, Show } from "solid-js";
import { Toaster } from "solid-toast";
import styles from "./App.module.css";
import "./styles/themes.css";
import TitleBar from "./components/Layout/TitleBar/TitleBar";
import TimeTrackPage from "./Timetrack/TimeTrackPage";
import ToolsPage from "./Plugins/ToolsPage";
import SettingsPage from "./Settings/SettingsPage";
import AIContainer from "./AI/AIContainer";
import NotificationContainer from "./components/Layout/NotificationContainer/NotificationContainer";
import { initializeApp } from "./core/AppFramework";
import { router } from "./core/Router/Router";
import { registerTimeTrackRoutes } from "./Timetrack";
import { registerToolsRoutes } from "./Plugins";
import { registerAIRoutes } from "./AI";
import { registerSettingsRoute } from "./Settings";
import { themeManager } from "./core/ThemeManager";

function App() {
  onMount(async () => {
    void themeManager.currentTheme;

    registerToolsRoutes();
    registerAIRoutes();
    registerTimeTrackRoutes();
    registerSettingsRoute();

    await initializeApp();
  });

  return (
    <div class={styles.container}>
      <TitleBar />

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--vscode-editorWidget-background)",
            color: "var(--vscode-editorWidget-foreground)",
            border: "1px solid var(--vscode-editorWidget-border)",
          },
        }}
      />

      <div class={styles.mainContent}>
        <NotificationContainer />

        <Show
          when={
            router.current === "tools" || router.current === "tools-spectrum"
          }
        >
          <div class={styles.card}>
            <ToolsPage />
          </div>
        </Show>

        <Show
          when={
            router.current === "timetrack" ||
            router.current === "timetrack-dashboard" ||
            router.current === "timetrack-category"
          }
        >
          <div class={styles.card}>
            <TimeTrackPage />
          </div>
        </Show>

        <Show when={router.current === "ai"}>
          <div class={styles.card}>
            <AIContainer />
          </div>
        </Show>

        <Show when={router.current === "settings"}>
          <SettingsPage />
        </Show>
      </div>
    </div>
  );
}

export default App;
