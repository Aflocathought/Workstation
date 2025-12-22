// src/core/ErrorHandler.ts
import { createSignal, JSX } from "solid-js";

export interface AppError {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success' | 'custom';
  title?: string;
  message?: string;
  timestamp: Date;
  dismissed?: boolean;
  exiting?: boolean;
  duration?: number;
  component?: (props: { error: AppError, close: () => void, update: (u: Partial<AppError>) => void }) => JSX.Element;
  data?: any;
  action?: {
    label: string;
    handler: () => void;
  };
}

// 创建全局错误信号
const [errors, setErrors] = createSignal<AppError[]>([]);

// 全局错误和通知管理
export class ErrorManager {
  get allErrors() { return errors(); }
  get visibleErrors() { return errors().filter(e => !e.dismissed); }

  // 添加错误/通知
  add(error: Omit<AppError, 'id' | 'timestamp'>): string {
    const id = `error_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const newError: AppError = {
      ...error,
      id,
      timestamp: new Date(),
    };

    // 保留最近50条记录
    setErrors(prev => {
      const newErrors = [newError, ...prev];
      if (newErrors.length > 50) {
        return newErrors.slice(0, 50);
      }
      return newErrors;
    });
    
    // 自动消失逻辑
    let duration = error.duration;
    if (duration === undefined) {
      if (error.type === 'error') {
        duration = 10000;
      } else if (error.type !== 'custom') {
        duration = 5000;
      }
      // custom type defaults to no auto-dismiss unless duration is specified
    }

    if (duration && duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  // 更新通知
  update(id: string, updates: Partial<AppError>) {
    setErrors(prev => 
      prev.map(e => e.id === id ? { ...e, ...updates } : e)
    );
  }

  // 快速添加方法
  error(title: string, message: string, action?: AppError['action'], duration?: number): string {
    return this.add({ type: 'error', title, message, action, duration });
  }

  warning(title: string, message: string, action?: AppError['action'], duration?: number): string {
    return this.add({ type: 'warning', title, message, action, duration });
  }

  info(title: string, message: string, action?: AppError['action'], duration?: number): string {
    return this.add({ type: 'info', title, message, action, duration });
  }

  success(title: string, message: string, duration?: number): string {
    return this.add({ type: 'success', title, message, duration });
  }

  custom(component: AppError['component'], data?: any, duration?: number): { id: string, close: () => void, update: (u: Partial<AppError>) => void } {
    const id = this.add({ type: 'custom', component, data, duration });
    return {
      id,
      close: () => this.dismiss(id),
      update: (u: Partial<AppError>) => this.update(id, u)
    };
  }

  // 消除错误 (带动画)
  dismiss(id: string) {
    // 先标记为退出状态，触发动画
    setErrors(prev => 
      prev.map(e => e.id === id ? { ...e, exiting: true } : e)
    );

    // 动画结束后真正移除 (假设动画500ms)
    setTimeout(() => {
      setErrors(prev => 
        prev.map(e => e.id === id ? { ...e, dismissed: true } : e)
      );
    }, 500);
  }

  // 清除所有已消除的错误
  cleanup() {
    setErrors(prev => prev.filter(e => !e.dismissed));
  }

  // 清除所有错误
  clear() {
    setErrors([]);
  }

  // 处理异步操作的包装器
  async withErrorHandling<T>(
    operation: () => Promise<T>,
    options?: {
      successMessage?: string;
      errorTitle?: string;
      showLoading?: boolean;
    }
  ): Promise<T | null> {
    const opts = {
      errorTitle: '操作失败',
      showLoading: false,
      ...options
    };

    let loadingId: string | undefined;

    try {
      if (opts.showLoading) {
        loadingId = this.info('处理中...', '请稍候');
      }

      const result = await operation();

      if (loadingId) {
        this.dismiss(loadingId);
      }

      if (opts.successMessage) {
        this.success('操作成功', opts.successMessage);
      }

      return result;
    } catch (error) {
      if (loadingId) {
        this.dismiss(loadingId);
      }

      const message = error instanceof Error ? error.message : '未知错误';
      this.error(opts.errorTitle, message);
      
      return null;
    }
  }
}

// 导出单例
export const errorManager = new ErrorManager();

// 导出错误信号供组件使用
export const useErrors = () => ({
  errors: errors,
  visibleErrors: () => errors().filter(e => !e.dismissed)
});