// src/components/Layout/NotificationContainer/NotificationContainer.tsx
import { Component, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
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
        return styles.info;
    }
  };

  return (
    <div class={`${styles.notification} ${getTypeClass()} ${props.error.exiting ? styles.exiting : ''}`}>
      <div class={styles.content}>
        <Show when={props.error.type !== 'custom'} fallback={
          <Show when={props.error.component}>
            <Dynamic 
              component={props.error.component} 
              error={props.error}
              close={props.onDismiss}
              update={(u: Partial<AppError>) => errorManager.update(props.error.id, u)}
            />
          </Show>
        }>
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
        </Show>
      </div>
      <button onClick={props.onDismiss} class={styles.closeButton}>
        ×
      </button>
    </div>
  );
};

export default NotificationContainer;