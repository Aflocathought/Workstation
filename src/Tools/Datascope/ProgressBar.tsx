import { Component, Show } from "solid-js";
import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  current: number;
  total: number;
  message?: string;
  visible: boolean;
}

const ProgressBar: Component<ProgressBarProps> = (props) => {
  const percentage = () => {
    if (props.total === 0) return 0;
    return Math.min(100, Math.round((props.current / props.total) * 100));
  };

  return (
    <Show when={props.visible}>
      <div class={styles.overlay}>
        <div class={styles.container}>
          <div class={styles.message}>
            {props.message || "正在加载..."}
          </div>
          <div class={styles.barWrapper}>
            <div class={styles.bar}>
              <div
                class={styles.fill}
                style={{ width: `${percentage()}%` }}
              />
            </div>
            <div class={styles.percentage}>{percentage()}%</div>
          </div>
          <div class={styles.detail}>
            {props.current.toLocaleString()} / {props.total.toLocaleString()}
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ProgressBar;
