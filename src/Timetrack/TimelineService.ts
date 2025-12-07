// src/timeline/timelineService.ts
// 纯逻辑服务：不依赖 Solid，不做 UI，仅做数据处理与颜色计算
import type { TimelineActivity, HourBucket } from "./TimelineRenderer";
import type { CategoryConfig } from "./Category/CategoryUtils";
import { formatTimeOnly } from "../components/Utils/FormatUtils";

export const MERGE_GAP_MS_DEFAULT = 2000;

// 补空洞并合并相邻同应用（允许短间隙）
export function addEmptyTimeBlocks(
  activities: TimelineActivity[],
  dateStr: string,
  mergeGapMs: number = MERGE_GAP_MS_DEFAULT
): TimelineActivity[] {
  if (activities.length === 0) return [];

  // 计算当日边界
  // 注意：new Date('YYYY-MM-DD') 会被当作 UTC 解析，导致与本地日期不一致
  // 这里改为通过显式的本地时间构造，确保是“本地这一天”的 00:00:00 到 23:59:59.999
  const dayStart = new Date(`${dateStr}T00:00:00`); // 本地时区
  const dayEnd = new Date(`${dateStr}T23:59:59.999`); // 本地时区
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();

  // 先把跨天的活动裁剪到当天范围内，并丢弃完全不相交的活动
  const trimmed: TimelineActivity[] = [];
  for (const a of activities) {
    const startMs = new Date(a.start_time).getTime();
    const endMs = startMs + a.duration_seconds * 1000;
    const overlapStart = Math.max(startMs, dayStartMs);
    const overlapEnd = Math.min(endMs, dayEndMs + 1); // +1ms 覆盖到日末
    const overlapMs = overlapEnd - overlapStart;
    const durSec = Math.floor(overlapMs / 1000);
    if (durSec > 0) {
      trimmed.push({
        app_name: a.app_name,
        start_time: new Date(overlapStart).toISOString(),
        duration_seconds: durSec,
      });
    }
  }
  if (trimmed.length === 0) return [];

  // 按开始时间排序
  const sorted = trimmed.sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const result: TimelineActivity[] = [];
  let currentTime = dayStartMs;

  for (const activity of sorted) {
    const activityStartTime = new Date(activity.start_time).getTime();

    // 在当前时间与下一活动之间填充空闲（最短1秒以上）
    if (activityStartTime > currentTime) {
      const emptyDuration = Math.floor((activityStartTime - currentTime) / 1000);
      if (emptyDuration > 1) {
        result.push({
          app_name: "未记录",
          start_time: new Date(currentTime).toISOString(),
          duration_seconds: emptyDuration,
        });
      }
    }

    // 与上一个同应用、且间隙不超过 mergeGapMs 则合并
    const last = result.length > 0 ? result[result.length - 1] : null;
    if (
      last &&
      last.app_name === activity.app_name &&
      new Date(last.start_time).getTime() + last.duration_seconds * 1000 >=
        activityStartTime - mergeGapMs
    ) {
      const newEndTime = activityStartTime + activity.duration_seconds * 1000;
      const startTime = new Date(last.start_time).getTime();
      last.duration_seconds = Math.floor((newEndTime - startTime) / 1000);
    } else {
      result.push(activity);
    }

    currentTime = activityStartTime + activity.duration_seconds * 1000;
  }

  // 收尾：若仍早于当日结束，则补空闲
  if (currentTime < dayEndMs) {
    const emptyDuration = Math.floor((dayEndMs - currentTime) / 1000);
    if (emptyDuration > 1) {
      result.push({
        app_name: "未记录",
        start_time: new Date(currentTime).toISOString(),
        duration_seconds: emptyDuration,
      });
    }
  }

  return result;
}

// 按小时分桶（用于柱状布局）
export function splitIntoHourlyBuckets(list: TimelineActivity[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    segments: [],
  }));
  for (const a of list) {
    let start = new Date(a.start_time);
    let remaining = a.duration_seconds;
    while (remaining > 0) {
      const hourStart = new Date(start);
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);
      const secondsUntilHourEnd = Math.max(0, Math.floor((hourEnd.getTime() - start.getTime()) / 1000));
      const segSeconds = Math.min(remaining, secondsUntilHourEnd);
      if (segSeconds <= 0) {
        start = new Date(hourEnd);
        continue;
      }
      const hour = hourStart.getHours();
      const offsetSeconds = Math.floor((start.getTime() - hourStart.getTime()) / 1000);
      buckets[hour].segments.push({
        app_name: a.app_name,
        start_time: start.toISOString(),
        duration_seconds: segSeconds,
        offset_seconds: offsetSeconds,
      });
      remaining -= segSeconds;
      start = new Date(start.getTime() + segSeconds * 1000);
    }
  }
  return buckets;
}

// 时间刻度
export function generateTimeMarkers(activities: TimelineActivity[]): string[] {
  if (activities.length === 0) return ["00:00", "06:00", "12:00", "18:00", "23:59"]; 
  let earliest = new Date(activities[0].start_time);
  let latest = new Date(activities[0].start_time);
  latest.setSeconds(latest.getSeconds() + activities[0].duration_seconds);
  for (const a of activities) {
    const st = new Date(a.start_time);
    const et = new Date(st.getTime() + a.duration_seconds * 1000);
    if (st < earliest) earliest = st;
    if (et > latest) latest = et;
  }
  const range = latest.getTime() - earliest.getTime();
  const markers: string[] = [];
  for (let i = 0; i < 5; i++) {
    const t = new Date(earliest.getTime() + (range * i) / 4);
    markers.push(formatTimeOnly(t));
  }
  return markers;
}

// 统计
export function getTotalSeconds(list: TimelineActivity[]): number {
  return list.reduce((acc, a) => acc + a.duration_seconds, 0);
}

export function getUniqueApps(list: TimelineActivity[]): string[] {
  return Array.from(new Set(list.map(a => a.app_name)));
}

export function getTotalDurationForApp(list: TimelineActivity[], appName: string): number {
  return list.filter(a => a.app_name === appName).reduce((acc, a) => acc + a.duration_seconds, 0);
}

export function getAppPercentage(list: TimelineActivity[], appName: string): string {
  const total = getTotalSeconds(list);
  if (total === 0) return "0%";
  const app = getTotalDurationForApp(list, appName);
  return `${Math.round((app / total) * 100)}%`;
}

// 颜色
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash = hash & hash;
  }
  return hash;
}

export function resolveColorForApp(appName: string, cache?: Map<string, string>, cfg?: CategoryConfig): string {
  if (appName === "未记录") return cfg?.specialColors?.unrecorded || "#9E9E9E";
  if (cache && cache.has(appName)) return cache.get(appName)!;
  const hue = Math.abs(hashString(appName) % 360);
  const color = `hsl(${hue}, 70%, 50%)`;
  if (cache) cache.set(appName, color);
  return color;
}

export function resolveColorForActivityByCategory(
  activity: TimelineActivity,
  cfg: CategoryConfig,
  fallback: (appName: string) => string
): string {
  const catName = cfg.appCategoryMap[activity.app_name] || null;
  if (!catName) return fallback(activity.app_name);
  const cat = cfg.categories.find(c => c.name === catName);
  return cat?.color || fallback(activity.app_name);
}
