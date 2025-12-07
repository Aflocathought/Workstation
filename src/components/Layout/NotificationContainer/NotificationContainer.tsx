// src/components/Layout/NotificationContainer/NotificationContainer.tsx
import { Component, For, Show } from "solid-js";
import { useErrors, errorManager } from "../../../core/ErrorHandlerSimple";
import type { AppError } from "../../../core/ErrorHandlerSimple";
import styles from "./NotificationContainer.module.css";

export const NotificationContainer: Component = () => {
  const { visibleErrors } = useErrors();

  return (
    <div class={styles.container}>
      <For each={visibleErrors()}>
        {(error) => (
          <NotificationItem
            error={error}
            onDismiss={() => errorManager.dismiss(error.id)}
          />
        )}
      </For>
    </div>
  );
};

const NotificationItem: Component<{
  error: AppError;
  onDismiss: () => void;
}> = (props) => {
  const getTypeClass = () => {
    switch (props.error.type) {
      case "error":
        return styles.error;
      case "warning":
        return styles.warning;
      case "info":
        return styles.info;
      case "success":
        return styles.success;
      default:
        return "";
    }
  };

  return (
    <div class={`${styles.notification} ${getTypeClass()}`}>
      <div class={styles.content}>
        <div class={styles.title}>{props.error.title}</div>
        <div class={styles.message}>{props.error.message}</div>
        <Show when={props.error.action}>
          <button
            onClick={props.error.action!.handler}
            class={styles.actionButton}
          >
            {props.error.action!.label}
          </button>
        </Show>
      </div>
      <button onClick={props.onDismiss} class={styles.closeButton}>
        ×
      </button>
    </div>
  );
};

export default NotificationContainer;