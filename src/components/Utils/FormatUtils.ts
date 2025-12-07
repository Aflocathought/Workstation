// src/components/Utils/FormatUtils.ts

// 格式化日期时间（本地化）
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

// 格式化持续时间为中文可读格式
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}分${remainingSeconds}秒`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}小时${remainingMinutes}分${remainingSeconds}秒`;
}

// 只格式化时间部分 (HH:MM)
export function formatTimeOnly(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
