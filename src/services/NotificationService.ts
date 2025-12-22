import { errorManager } from "../core/ErrorHandlerSimple";
import type { AppError } from "../core/ErrorHandlerSimple";
import { NotificationProgress } from "../components/Layout/NotificationContainer/NotificationProgress";

type ProgressData = {
  title?: string;
  message?: string;
  current?: number;
  total?: number;
};

export type ProgressNotificationHandle = {
  id: string;
  updateProgress: (current: number, total: number, message?: string) => void;
  done: (message?: string) => void;
  fail: (title: string, message: string) => void;
  close: () => void;
};

export function showProgressNotification(opts: {
  title: string;
  message?: string;
  current?: number;
  total?: number;
}): ProgressNotificationHandle {
  const initialData: ProgressData = {
    title: opts.title,
    message: opts.message,
    current: opts.current ?? 0,
    total: opts.total ?? 0,
  };

  // custom 默认不自动消失（除非显式给 duration）
  const handle = errorManager.custom(NotificationProgress, initialData, 0);

  const scheduleDismiss = (ms: number) => {
    setTimeout(() => errorManager.dismiss(handle.id), ms);
  };

  return {
    id: handle.id,
    updateProgress: (current, total, message) => {
      const data: ProgressData = {
        ...initialData,
        ...((({ title, message, current, total }) => ({
          title,
          message,
          current,
          total,
        }))(initialData) as ProgressData),
        current,
        total,
        message: message ?? initialData.message,
      };

      handle.update({ data });
    },
    done: (message) => {
      handle.update({
        type: "success",
        title: opts.title,
        message: message ?? "完成",
        component: undefined,
        data: undefined,
      } as Partial<AppError>);
      scheduleDismiss(5000);
    },
    fail: (title, message) => {
      handle.update({
        type: "error",
        title,
        message,
        component: undefined,
        data: undefined,
      } as Partial<AppError>);
      scheduleDismiss(10000);
    },
    close: handle.close,
  };
}
