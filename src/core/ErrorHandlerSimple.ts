// src/core/ErrorHandler.ts
import { createSignal } from "solid-js";

export interface AppError {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  dismissed?: boolean;
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

    setErrors(prev => [newError, ...prev]);
    
    // 自动消失逻辑（除了错误类型）
    if (error.type !== 'error') {
      setTimeout(() => this.dismiss(id), 5000);
    }

    return id;
  }

  // 快速添加方法
  error(title: string, message: string, action?: AppError['action']): string {
    return this.add({ type: 'error', title, message, action });
  }

  warning(title: string, message: string, action?: AppError['action']): string {
    return this.add({ type: 'warning', title, message, action });
  }

  info(title: string, message: string, action?: AppError['action']): string {
    return this.add({ type: 'info', title, message, action });
  }

  success(title: string, message: string): string {
    return this.add({ type: 'success', title, message });
  }

  // 消除错误
  dismiss(id: string) {
    setErrors(prev => 
      prev.map(e => e.id === id ? { ...e, dismissed: true } : e)
    );
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