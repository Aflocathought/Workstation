// src/timeline/timelineRenderer.tsx
import { For, Show } from "solid-js";
import styles from "./Timeline.module.css";

// 定义Timeline组件需要的接口 - 这些将在整个应用中使用
export interface TimelineActivity {
  app_name: string;
  start_time: string;
  duration_seconds: number;
}

// 每小时分桶片段
export interface HourSegment {
  app_name: string;
  start_time: string; // 片段的实际开始时间（在该小时内）
  duration_seconds: number; // 片段在该小时内的持续时长
  offset_seconds: number; // 相对该小时起点的偏移秒数
}

export interface HourBucket {
  hour: number; // 0-23
  segments: HourSegment[];
}

// 导出渲染器组件的属性接口
export interface TimelineRendererProps {
  // 工具函数
  calculateTimeBlockWidth: (durationSeconds: number) => number;
  getColorForApp: (appName: string) => string;
  handleTimeBlockClick: (appName: string) => void;
  formatDateTime: (isoString: string) => string;
  formatDuration: (seconds: number) => string;
  generateTimeMarkers: () => string[];
  getUniqueApps: () => string[];
  getTotalDurationForApp: (appName: string) => number;
  getAppPercentage: (appName: string) => string;
  // 可选：显示名称（别称）
  resolveDisplayName?: (appName: string) => string;
  // 可选：图例颜色解析（用于分类配色时，让图例颜色与块一致）
  getColorForLegend?: (appName: string) => string;
  // 可选：将活动解析为图例键（例如分类名），用于选择/高亮与点击匹配
  resolveLegendKeyForActivity?: (activity: TimelineActivity) => string;

  // 数据
  activities: TimelineActivity[];
  // 原始是否有数据（用于当 activities 经过过滤后为空时仍显示容器与刻度）
  hasAnyData?: boolean;
  hoveredActivity: TimelineActivity | null;
  setHoveredActivity: (activity: TimelineActivity | null) => void;
  selectedApp: string | null;
  className?: string;
  // 新增：分类与布局
  colorForActivity?: (activity: TimelineActivity) => string; // 若提供，覆盖 getColorForApp
  layout?: "bar" | "hourlyGrid";
  hourlyBuckets?: HourBucket[]; // layout=hourlyGrid 时需要
  version?: number; // 用于触发颜色/样式的即时重算
}

const TimelineRenderer = (props: TimelineRendererProps) => {
  const isHourly = () => props.layout === "hourlyGrid";
  const colorFor = (a: TimelineActivity) => {
    const c = props.colorForActivity ? props.colorForActivity(a) : undefined;
    return c || props.getColorForApp(a.app_name);
  };
  const dn = (app: string) => (props.resolveDisplayName ? props.resolveDisplayName(app) : app);

  return (
    <div class={`${styles.timelineContainer} ${props.className || ""}`}>
      <Show when={(props.hasAnyData ?? props.activities.length > 0)} fallback={<p class={styles.noData}>所选日期没有活动记录</p>}>
        {/* 非每小时柱状图（bar）布局：贯穿全宽，图例在下方 */}
        <Show when={isHourly()} fallback={
          <>
            <div class={styles.timelineBar} data-v={props.version}>
              <For each={props.activities}>
                {(activity, idx) => {
                  const isLast = idx() === props.activities.length - 1;
                  const isMicroDuration = activity.duration_seconds < 5;
                  const key = props.resolveLegendKeyForActivity
                    ? props.resolveLegendKeyForActivity(activity)
                    : activity.app_name;
                  return (
                    <div
                      class={isMicroDuration ? `${styles.timeBlock} ${styles.microTimeBlock}` : styles.timeBlock}
                      style={{
                        "flex-basis": `${props.calculateTimeBlockWidth(activity.duration_seconds)}%`,
                        "flex-grow": isLast ? 1 : 0,
                        "flex-shrink": 1,
                        "background-color": (() => { props.version; return colorFor(activity); })(),
                        opacity: props.selectedApp && props.selectedApp !== key ? "0.3" : "1",
                        "border-right": isMicroDuration && !isLast ? "1px solid rgba(0,0,0,0.2)" : "none",
                      }}
                      onClick={() => props.handleTimeBlockClick(key)}
                      onMouseEnter={() => props.setHoveredActivity(activity)}
                      onMouseLeave={() => props.setHoveredActivity(null)}
                      title={`应用: ${dn(activity.app_name)}\n时间: ${props.formatDateTime(activity.start_time)}\n持续: ${props.formatDuration(activity.duration_seconds)}`}
                    />
                  );
                }}
              </For>
            </div>
            <div class={styles.timeMarkers}>
              <For each={props.generateTimeMarkers()}>{(marker) => <span>{marker}</span>}</For>
            </div>
            <div class={styles.timelineLegend}>
              <For each={props.getUniqueApps()}>
                {(appName) => (
                  <div
                    class={styles.legendItem}
                    onClick={() => props.handleTimeBlockClick(appName)}
                    style={{ "font-weight": props.selectedApp === appName ? "bold" : "normal" }}
                  >
                    <div
                      class={styles.colorBox}
                      style={{
                        "background-color": (() => {
                          props.version;
                          return props.getColorForLegend
                            ? props.getColorForLegend(appName)
                            : props.getColorForApp(appName);
                        })(),
                      }}
                    />
                    <span>
                      {dn(appName)}(
                      {props.formatDuration(props.getTotalDurationForApp(appName))},
                      {props.getAppPercentage(appName)})
                    </span>
                  </div>
                )}
              </For>
            </div>
          </>
        }>
          {/* 每小时柱状图布局：主区 + 右侧图例 */}
          <div class={styles.timelineWrapper}>
            <div class={styles.timelineMain}>
              <div class={styles.timelineGrid} data-v={props.version}>
                <For each={props.hourlyBuckets || []}>
                  {(bucket) => (
                    <div class={styles.hourColumn}>
                      <div class={styles.hourColumnInner}>
                        <For each={bucket.segments}>
                          {(seg) => {
                            const heightPct = (seg.duration_seconds / 3600) * 100;
                            const topPct = (seg.offset_seconds / 3600) * 100;
                            const activity: TimelineActivity = { app_name: seg.app_name, start_time: seg.start_time, duration_seconds: seg.duration_seconds };
                            const isMicro = seg.duration_seconds < 5;
                            return (
                              <div
                                class={styles.hourSegment}
                                style={{
                                  height: `${heightPct}%`,
                                  top: `${topPct}%`,
                                  "background-color": (() => { props.version; return colorFor(activity); })(),
                                  opacity: props.selectedApp && props.selectedApp !== seg.app_name ? "0.3" : "1",
                                  border: isMicro ? "1px solid rgba(0,0,0,0.2)" : "none",
                                }}
                                onClick={() => props.handleTimeBlockClick(seg.app_name)}
                                onMouseEnter={() => props.setHoveredActivity(activity)}
                                onMouseLeave={() => props.setHoveredActivity(null)}
                                title={`应用: ${dn(seg.app_name)}\n时间: ${props.formatDateTime(seg.start_time)}\n持续: ${props.formatDuration(seg.duration_seconds)}`}
                              />
                            );
                          }}
                        </For>
                      </div>
                      <div class={styles.hourLabel}>
                        <span class={styles.hourLabelFull}>{String(bucket.hour).padStart(2, "0")}:00</span>
                        <span class={styles.hourLabelShort}>{String(bucket.hour).padStart(2, "0")}</span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
            <aside class={styles.timelineSidebar}>
              <div class={styles.timelineLegend}>
                <For each={props.getUniqueApps()}>
                  {(appName) => (
                    <div
                      class={styles.legendItem}
                      onClick={() => props.handleTimeBlockClick(appName)}
                      style={{ "font-weight": props.selectedApp === appName ? "bold" : "normal" }}
                    >
                      <div
                        class={styles.colorBox}
                        style={{
                          "background-color": (() => {
                            props.version;
                            return props.getColorForLegend
                              ? props.getColorForLegend(appName)
                              : props.getColorForApp(appName);
                          })(),
                        }}
                      />
                      <span>
                        {dn(appName)}(
                        {props.formatDuration(props.getTotalDurationForApp(appName))},
                        {props.getAppPercentage(appName)})
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </aside>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default TimelineRenderer;
