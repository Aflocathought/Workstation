// src/Timeline/Dashboard.tsx
import { createSignal, onMount, onCleanup, Component } from "solid-js";
import { useAppFramework } from "../../core/AppFramework";
import Timeline from "../Timeline";
import DatabaseSize from "../DatabaseSize";
import type { ColorMode, TimelineLayout } from "../Category/CategoryUtils";
import styles from "./Dashboard.module.css";

// 定义TypeScript接口
interface ActiveWindowInfo {
  app_name: string;
  window_title: string;
}

const Dashboard: Component = () => {
  const framework = useAppFramework();
  const [windowInfo, setWindowInfo] = createSignal<ActiveWindowInfo | null>(null);

  // 使用框架的状态管理
  const selectedDate = () => framework.store.state.selectedDate;
  const selectedApp = () => framework.store.state.selectedApp;
  const colorMode = () => framework.store.state.colorMode;
  const layout = () => framework.store.state.layout;
  const error = () => framework.store.state.error;

  let intervalId: number;

  // 组件挂载时获取当前窗口信息
  onMount(() => {
    intervalId = setInterval(async () => {
      try {
        const info = await framework.repository.getCurrentActiveWindow();
        setWindowInfo(info);
        framework.store.clearError();
      } catch (err) {
        console.error(err);
        framework.store.setError(
          err instanceof Error ? err.message : String(err)
        );
      }
    }, 1000);
  });

  // 清理定时器
  onCleanup(() => {
    clearInterval(intervalId);
  });

  // 当日期改变时更新选择的日期
  const handleDateChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    framework.store.setSelectedDate(target.value);
    framework.store.setSelectedApp(null); // 重置应用筛选
  };

  return (
    <div class={styles.timelinePage}>
      {/* 当前活动窗口信息 */}
      <div class={styles.statusBar}>
        {windowInfo() ? (
          <p>
            活动中：
            <strong>应用:</strong> {windowInfo()!.app_name}
            {" | "}
            <strong>窗口标题:</strong> {windowInfo()!.window_title}
          </p>
        ) : (
          <p>{error() ? `错误: ${error()}` : "加载中..."}</p>
        )}
      </div>

      {/* 控制栏 */}
      <div class={styles.controlBar}>
        <label class={styles.controlItem}>
          配色
          <select
            value={colorMode()}
            onChange={(e) =>
              framework.store.setColorMode(
                e.currentTarget.value as ColorMode
              )
            }
            class={styles.select}
          >
            <option value="app">按应用</option>
            <option value="category">按分类</option>
          </select>
        </label>

        <label class={styles.controlItem}>
          布局
          <select
            value={layout()}
            onChange={(e) =>
              framework.store.setLayout(
                e.currentTarget.value as TimelineLayout
              )
            }
            class={styles.select}
          >
            <option value="bar">连续条</option>
            <option value="hourlyGrid">每小时柱状</option>
          </select>
        </label>

        <label class={styles.controlItem}>
          <input
            type="date"
            class={styles.datePicker}
            value={selectedDate()}
            onChange={handleDateChange}
          />
        </label>

        <DatabaseSize />
      </div>

      {/* 时间轴主体 */}
      <Timeline
        date={selectedDate()}
        onAppSelect={(app) => framework.store.setSelectedApp(app)}
        selectedApp={selectedApp()}
        colorMode={colorMode()}
        layout={layout()}
      />
    </div>
  );
};

export default Dashboard;
