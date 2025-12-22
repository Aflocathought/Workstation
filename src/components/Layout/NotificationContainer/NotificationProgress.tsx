import type { Component } from "solid-js";
import type { AppError } from "../../../core/ErrorHandlerSimple";
import styles from "./NotificationContainer.module.css";

type ProgressData = {
  title?: string;
  message?: string;
  current?: number;
  total?: number;
};

export const NotificationProgress: Component<{
  error: AppError;
  close: () => void;
  update: (u: Partial<AppError>) => void;
}> = (props) => {
  const data = () => (props.error.data || {}) as ProgressData;
  const title = () => data().title ?? props.error.title ?? "";
  const message = () => data().message ?? props.error.message ?? "";
  const current = () => data().current ?? 0;
  const total = () => data().total ?? 0;

  const percentage = () => {
    const t = total();
    if (!t || t <= 0) return 0;
    return Math.min(100, Math.round((current() / t) * 100));
  };

  return (
    <div>
      <div class={styles.title}>{title()}</div>
      {message() && <div class={styles.message}>{message()}</div>}

      <div class={styles.progressRow}>
        <div class={styles.progressTrack}>
          <div
            class={styles.progressBar}
            style={{ width: `${percentage()}%` }}
          />
        </div>
        <div class={styles.progressLabel}>{percentage()}%</div>
      </div>

      <div class={styles.progressDetail}>
        {current().toLocaleString()} / {total().toLocaleString()}
      </div>
    </div>
  );
};
