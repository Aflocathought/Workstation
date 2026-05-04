import { Component, Show, type Accessor } from "solid-js";
import type { CalendarEvent } from "../../../services/GoogleCalendarService";
import styles from "./EventCard.module.css";

interface EventCardProps {
  event: CalendarEvent;
  loading: Accessor<boolean>;
  onDelete: (eventId: string) => Promise<void>;
  formatDateTime: (event: CalendarEvent) => string;
}

const EventCard: Component<EventCardProps> = (props) => {
  return (
    <div class={styles.eventCard}>
      <div class={styles.eventHeader}>
        <h4 class={styles.eventTitle}>{props.event.summary}</h4>
        <button
          class={styles.deleteButton}
          onClick={() => {
            if (props.event.id) {
              props.onDelete(props.event.id);
            }
          }}
          disabled={props.loading()}
          title="删除事件"
        >
          🗑️
        </button>
      </div>

      <div class={styles.eventTime}>🕒 {props.formatDateTime(props.event)}</div>

      <Show when={props.event.location}>
        <div class={styles.eventLocation}>📍 {props.event.location}</div>
      </Show>

      <Show when={props.event.description}>
        <div class={styles.eventDescription}>📝 {props.event.description}</div>
      </Show>
    </div>
  );
};

export default EventCard;
