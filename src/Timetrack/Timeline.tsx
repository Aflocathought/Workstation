// src/timeline/timeline.tsx
import { createSignal, createEffect, Component } from "solid-js";
import TimelineRenderer, {
  TimelineActivity,
  HourBucket,
} from "./TimelineRenderer";
import { formatDateTime, formatDuration } from "../components/Utils/FormatUtils";
import { ColorMode, TimelineLayout } from "./Category/CategoryUtils";
import { resolveAppDisplayName as utilResolveAppDisplayName } from "./Category/CategoryUtils";
import {
  categoryConfig as globalCategoryConfig,
  categoryVersion,
} from "./Category/CategoryStore";
import {
  addEmptyTimeBlocks as svcAddEmptyTimeBlocks,
  splitIntoHourlyBuckets as svcSplitIntoHourlyBuckets,
  generateTimeMarkers as svcGenerateTimeMarkers,
  getTotalSeconds as svcGetTotalSeconds,
  getUniqueApps as svcGetUniqueApps,
  getTotalDurationForApp as svcGetTotalDurationForApp,
  resolveColorForApp as svcResolveColorForApp,
  MERGE_GAP_MS_DEFAULT,
} from "./TimelineService";
import { useAppFramework } from "../core/AppFramework";

export interface TimelineProps {
  date: string;
  onAppSelect?: (appName: string | null) => void;
  selectedApp?: string | null;
  className?: string;
  colorMode?: ColorMode; // "app" | "category"
  layout?: TimelineLayout; // "bar" | "hourlyGrid"
}

const Timeline: Component<TimelineProps> = (props) => {
  const framework = useAppFramework();
  const [activities, setActivities] = createSignal<TimelineActivity[]>([]);
  // 连续条渲染时使用的已过滤列表（小于10s的片段丢弃）
  const filteredActivities = () =>
    activities().filter((a) => a.duration_seconds >= 10);
  const [hoveredActivity, setHoveredActivity] =
    createSignal<TimelineActivity | null>(null);
  const [appColorMap] = createSignal(new Map<string, string>());
  const [hourlyBuckets, setHourlyBuckets] = createSignal<HourBucket[]>([]);

  const categoryConfig = () => globalCategoryConfig();
  const MERGE_GAP_MS = MERGE_GAP_MS_DEFAULT;
  const version = () =>
    `${categoryVersion()}|${props.colorMode}|${props.layout}`.length;
  const UNASSIGNED = "未分配";

  // 监听日期变化，拉取数据
  createEffect(() => {
    fetchTimelineData(props.date);
  });

  // 监听活动或布局变化，重算每小时分桶
  createEffect(() => {
    const acts = activities();
    props.layout; // 触发依赖
    setHourlyBuckets(svcSplitIntoHourlyBuckets(acts));
  });

  // 监听分类配置版本，触发使用分类色的重渲染（依赖读取即可）
  createEffect(() => {
    categoryVersion();
  });

  async function fetchTimelineData(date: string): Promise<void> {
    const result = await framework.errorManager.withErrorHandling(
      async () => {
        const activitiesData = await framework.repository.getActivitiesForDay(date);
        return svcAddEmptyTimeBlocks(activitiesData, date, MERGE_GAP_MS);
      },
      {
        errorTitle: '获取时间轴数据失败',
        showLoading: false
      }
    );
    
    if (result) {
      setActivities(result);
    } else {
      setActivities([]);
    }
  }

  function getColorForApp(appName: string): string {
    const cfg = categoryConfig();
    if (appName === "未记录") return cfg.specialColors?.unrecorded || "#9E9E9E";
    return svcResolveColorForApp(appName, appColorMap(), cfg);
  }

  function getColorForActivityByCategory(activity: TimelineActivity): string {
    const cfg = categoryConfig();
    // 优先处理特殊值
    if (activity.app_name === "未记录")
      return cfg.specialColors?.unrecorded || "#9E9E9E";
    const catName = cfg.appCategoryMap[activity.app_name] || null;
    if (!catName) {
      // 未分配应用按“未分配”专属颜色
      return cfg.specialColors?.unassigned || "#9E9E9E";
    }
    const cat = cfg.categories.find((c) => c.name === catName);
    return cat?.color || getColorForApp(activity.app_name);
  }
  // 解析某个应用的分类名
  function getCategoryNameForApp(appName: string): string | null {
    const cfg = categoryConfig();
    return cfg.appCategoryMap[appName] || null;
  }

  // 解析活动的“图例键”在分类模式下为分类名；在非分类模式为应用名
  function getLegendKeyForActivity(a: TimelineActivity): string {
    if (props.colorMode === "category") {
      if (a.app_name === "未记录") return "未记录"; // 特殊占位
      const cat = getCategoryNameForApp(a.app_name);
      return cat || UNASSIGNED;
    }
    return a.app_name;
  }

  // 图例条目（使用未过滤的原始数据，保证统计完整）
  function getLegendKeys(): string[] {
    if (props.colorMode !== "category") return svcGetUniqueApps(activities());
    const set = new Set<string>();
    for (const a of activities()) set.add(getLegendKeyForActivity(a));
    return Array.from(set);
  }

  function getTotalDurationForKey(key: string): number {
    if (props.colorMode !== "category")
      return svcGetTotalDurationForApp(activities(), key);
    let sum = 0;
    for (const a of activities())
      if (getLegendKeyForActivity(a) === key) sum += a.duration_seconds;
    return sum;
  }

  function getPercentageForKey(key: string): string {
    const total = svcGetTotalSeconds(activities());
    if (total === 0) return "0%";
    const part = getTotalDurationForKey(key);
    return `${Math.round((part / total) * 100)}%`;
  }

  function getLegendColorForKey(key: string): string {
    const cfg = categoryConfig();
    if (props.colorMode !== "category") {
      if (key === "未记录") return cfg.specialColors?.unrecorded || "#9E9E9E";
      return getColorForApp(key);
    }
    if (key === "未记录") return cfg.specialColors?.unrecorded || "#9E9E9E";
    if (key === UNASSIGNED) return cfg.specialColors?.unassigned || "#9E9E9E";
    const cat = cfg.categories.find((c) => c.name === key);
    if (cat) return cat.color;
    return svcResolveColorForApp(key, appColorMap());
  }

  function resolveLegendLabel(key: string): string {
    if (props.colorMode !== "category")
      return utilResolveAppDisplayName(categoryConfig(), key);
    return key; // 分类直接显示分类名
  }

  // 供连续条使用的图例聚合段（让条与图例分布一致）
  // 保留分类汇总用于图例与统计（通过 getLegendKeys/getTotalDurationForKey/getPercentageForKey 实现）

  // legend 使用 resolveLegendLabel 代替普通显示名（分类模式显示分类名）

  function generateTimeMarkers(): string[] {
    return svcGenerateTimeMarkers(filteredActivities());
  }

  function calculateTimeBlockWidth(durationSeconds: number): number {
    const totalSeconds = svcGetTotalSeconds(filteredActivities());
    if (totalSeconds === 0) return 0;
    return parseFloat(((durationSeconds / totalSeconds) * 100).toFixed(4));
  }

  function getUniqueApps(): string[] {
    return getLegendKeys();
  }
  function getTotalDurationForApp(key: string): number {
    return getTotalDurationForKey(key);
  }
  function getAppPercentage(key: string): string {
    return getPercentageForKey(key);
  }

  function handleTimeBlockClick(appName: string): void {
    if (!props.onAppSelect) return;
    if (props.selectedApp === appName) props.onAppSelect(null);
    else props.onAppSelect(appName);
  }

  return (
    <>
      <TimelineRenderer
        calculateTimeBlockWidth={calculateTimeBlockWidth}
        getColorForApp={getColorForApp}
        handleTimeBlockClick={handleTimeBlockClick}
        formatDateTime={formatDateTime}
        formatDuration={formatDuration}
        generateTimeMarkers={generateTimeMarkers}
        getUniqueApps={getUniqueApps}
        getTotalDurationForApp={getTotalDurationForApp}
        getAppPercentage={getAppPercentage}
        resolveDisplayName={resolveLegendLabel}
        getColorForLegend={getLegendColorForKey}
        activities={filteredActivities()}
        hasAnyData={activities().length > 0}
        hoveredActivity={hoveredActivity()}
        setHoveredActivity={setHoveredActivity}
        selectedApp={props.selectedApp || null}
        className={props.className}
        colorForActivity={
          props.colorMode === "category"
            ? getColorForActivityByCategory
            : undefined
        }
        layout={props.layout}
        hourlyBuckets={hourlyBuckets()}
        version={version()}
        resolveLegendKeyForActivity={(a) => getLegendKeyForActivity(a)}
      />
    </>
  );
};

export default Timeline;
