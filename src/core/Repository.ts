// src/core/Repository.ts
import { invoke } from "@tauri-apps/api/core";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import type { TimelineActivity } from "../Timetrack/TimelineRenderer";

/**
 * 统一的数据访问接口
 * 封装所有 Tauri 命令调用，提供类型安全和错误处理
 */

export interface ActiveWindowInfo {
  app_name: string;
  window_title: string;
}

export interface ActivityLog {
  id: number;
  app_name: string;
  window_title: string;
  start_time: string;
  duration_seconds: number;
}

export interface DatabaseStats {
  size: number;
  recordCount: number;
  oldestRecord: string | null;
  newestRecord: string | null;
}

/**
 * 错误处理辅助函数
 */
const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    console.error(`Repository.${operationName} 失败:`, error);
    throw new Error(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
};

/**
 * 数据仓库类 - 统一管理所有数据访问
 */
export class Repository {
  
  // ========== 活动窗口相关 ==========
  
  async getCurrentActiveWindow(): Promise<ActiveWindowInfo> {
    return withErrorHandling(
      () => invoke<ActiveWindowInfo>("get_active_window_info"),
      "getCurrentActiveWindow"
    );
  }

  // ========== 活动记录相关 ==========
  
  async getLatestActivities(): Promise<ActivityLog[]> {
    return withErrorHandling(
      () => invoke<ActivityLog[]>("get_latest_activities"),
      "getLatestActivities"
    );
  }

  async getActivitiesForDay(date: string): Promise<TimelineActivity[]> {
    return withErrorHandling(
      () => invoke<TimelineActivity[]>("get_activities_for_day", { date }),
      "getActivitiesForDay"
    );
  }

  async getActivitiesForDateRange(startDate: string, endDate: string): Promise<TimelineActivity[]> {
    return withErrorHandling(async () => {
      // 如果后端还没有这个命令，可以先调用单日的多次
      const activities: TimelineActivity[] = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayActivities = await this.getActivitiesForDay(dateStr);
        activities.push(...dayActivities);
      }
      
      return activities;
    }, "getActivitiesForDateRange");
  }

  // ========== 数据库相关 ==========
  
  async getDatabaseSize(): Promise<number> {
    return withErrorHandling(
      () => invoke<number>("get_database_size"),
      "getDatabaseSize"
    );
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    return withErrorHandling(async () => {
      // 组合多个调用获取完整统计信息
      const size = await this.getDatabaseSize();
      const latest = await this.getLatestActivities();
      
      return {
        size,
        recordCount: latest.length, // 这里可能需要专门的计数接口
        oldestRecord: latest.length > 0 ? latest[latest.length - 1]?.start_time : null,
        newestRecord: latest.length > 0 ? latest[0]?.start_time : null,
      };
    }, "getDatabaseStats");
  }

  // ========== 频谱相关 ==========
  
  async openSpectrumWindow(): Promise<void> {
    return withErrorHandling(
      () => invoke("open_spectrum_window"),
      "openSpectrumWindow"
    );
  }

  async openSpectrumFloatingWindow(): Promise<void> {
    return withErrorHandling(
      () => invoke("open_spectrum_floating_window"),
      "openSpectrumFloatingWindow"
    );
  }

  async openTestWindow(): Promise<void> {
    return withErrorHandling(
      () => invoke("open_test_window"),
      "openTestWindow"
    );
  }

  async startSpectrum(): Promise<void> {
    return withErrorHandling(
      () => invoke("start_spectrum"),
      "startSpectrum"
    );
  }

  async stopSpectrum(): Promise<void> {
    return withErrorHandling(
      () => invoke("stop_spectrum"),
      "stopSpectrum"
    );
  }

  async setSpectrumFFTSize(size: number): Promise<void> {
    return withErrorHandling(
      () => invoke("set_spectrum_fft_size", { size }),
      "setSpectrumFFTSize"
    );
  }

  async setSpectrumColumns(cols: number): Promise<void> {
    return withErrorHandling(
      () => invoke("set_spectrum_columns", { cols }),
      "setSpectrumColumns"
    );
  }

  // ========== 系统控制相关 ==========
  
  async startTracking(): Promise<void> {
    return withErrorHandling(
      () => invoke("start_tracking"),
      "startTracking"
    );
  }

  async stopTracking(): Promise<void> {
    return withErrorHandling(
      () => invoke("stop_tracking"),
      "stopTracking"
    );
  }

  async getTrackingStatus(): Promise<boolean> {
    return withErrorHandling(
      () => invoke<boolean>("get_tracking_status"),
      "getTrackingStatus"
    );
  }

  async setLaunchOnStartup(enabled: boolean): Promise<void> {
    return withErrorHandling(async () => {
      if (enabled) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
    }, "setLaunchOnStartup");
  }

  async isLaunchOnStartupEnabled(): Promise<boolean> {
    return withErrorHandling(() => isAutostartEnabled(), "isLaunchOnStartupEnabled");
  }

  // ========== 数据导出相关 ==========
  
  async exportActivities(startDate: string, endDate: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    return withErrorHandling(
      () => invoke<string>("export_activities", { startDate, endDate, format }),
      "exportActivities"
    );
  }

  async importActivities(filePath: string): Promise<number> {
    return withErrorHandling(
      () => invoke<number>("import_activities", { filePath }),
      "importActivities"
    );
  }

  // ========== 配置相关 ==========
  
  async saveUserConfig(config: any): Promise<void> {
    return withErrorHandling(
      () => invoke("save_user_config", { config }),
      "saveUserConfig"
    );
  }

  async loadUserConfig(): Promise<any> {
    return withErrorHandling(
      () => invoke<any>("load_user_config"),
      "loadUserConfig"
    );
  }

  // ========== 缓存管理 ==========
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  /**
   * 带缓存的数据获取
   * @param key 缓存键
   * @param fetcher 数据获取函数
   * @param ttl 缓存时间（毫秒）
   */
  async getCached<T>(key: string, fetcher: () => Promise<T>, ttl: number = 30000): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }

    const data = await fetcher();
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });

    return data;
  }

  /**
   * 清除缓存
   */
  clearCache(key?: string) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 批量操作支持
   */
  async batchOperation<T>(operations: (() => Promise<T>)[]): Promise<T[]> {
    return Promise.all(operations.map(op => op()));
  }
}

// 导出单例实例
export const repository = new Repository();