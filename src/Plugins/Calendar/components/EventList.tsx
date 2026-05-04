import { Component, For, Show, type Accessor } from "solid-js";
import type { CalendarEvent } from "../../../services/GoogleCalendarService";
import EventCard from "./EventCard";
import styles from "./EventList.module.css";

interface EventListProps {
  todayEvents: Accessor<[string, CalendarEvent[]][]>;
  futureEvents: Accessor<[string, CalendarEvent[]][]>;
  loading: Accessor<boolean>;
  onDelete: (eventId: string) => Promise<void>;
  formatDateTime: (event: CalendarEvent) => string;
  getRelativeDateLabel: (dateString: string) => string;
}

const EventList: Component<EventListProps> = (props) => {
  // 判断是否有任何事件
  const hasAnyEvents = () =>
    props.todayEvents().length > 0 || props.futureEvents().length > 0;

  return (
    <div class={styles.eventsList}>
      <Show
        when={hasAnyEvents()}
        fallback={
          <Show when={!props.loading()}>
            <div class={styles.emptyState}>
              <p>📅 暂无事件</p>
              <p class={styles.hint}>点击"新建事件"创建你的第一个事件</p>
            </div>
          </Show>
        }
      >
        <div class={styles.twoColumnLayout}>
          {/* 左列：今天的事件，如果没有则显示未来事件 */}
          <div class={styles.column}>
            <Show
              when={props.todayEvents().length > 0}
              fallback={
                <>
                  <h2 class={styles.columnTitle}>📆 未来事件</h2>
                  <For each={props.futureEvents()}>
                    {([date, eventsOnDate]) => (
                      <div class={styles.dateGroup}>
                        <h3 class={styles.dateHeader}>
                          {props.getRelativeDateLabel(date)}
                        </h3>
                        <For each={eventsOnDate}>
                          {(event) => (
                            <EventCard
                              event={event}
                              loading={props.loading}
                              onDelete={props.onDelete}
                              formatDateTime={props.formatDateTime}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </>
              }
            >
              <h2 class={styles.columnTitle}>📍 今天</h2>
              <For each={props.todayEvents()}>
                {([_date, eventsOnDate]) => (
                  <div class={styles.dateGroup}>
                    <For each={eventsOnDate}>
                      {(event) => (
                        <EventCard
                          event={event}
                          loading={props.loading}
                          onDelete={props.onDelete}
                          formatDateTime={props.formatDateTime}
                        />
                      )}
                    </For>
                  </div>
                )}
              </For>
            </Show>
          </div>

          {/* 右列：未来事件（仅当今天有事件时显示） */}
          <Show when={props.todayEvents().length > 0}>
            <div class={styles.column}>
              <h2 class={styles.columnTitle}>📆 未来事件</h2>
              <Show
                when={props.futureEvents().length > 0}
                fallback={
                  <div class={styles.emptyColumnState}>
                    <p>暂无未来事件</p>
                  </div>
                }
              >
                <For each={props.futureEvents()}>
                  {([date, eventsOnDate]) => (
                    <div class={styles.dateGroup}>
                      <h3 class={styles.dateHeader}>
                        {props.getRelativeDateLabel(date)}
                      </h3>
                      <For each={eventsOnDate}>
                        {(event) => (
                          <EventCard
                            event={event}
                            loading={props.loading}
                            onDelete={props.onDelete}
                            formatDateTime={props.formatDateTime}
                          />
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default EventList;
