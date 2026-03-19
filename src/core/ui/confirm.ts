import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";

/**
 * 统一确认对话框。
 * 在 Tauri 中优先使用原生对话框，失败时再回退到 window.confirm。
 */
export async function confirmAction(
  message: string,
  options?: {
    title?: string;
    kind?: "info" | "warning" | "error";
    okLabel?: string;
    cancelLabel?: string;
  },
): Promise<boolean> {
  try {
    return await tauriConfirm(message, {
      title: options?.title ?? "请确认",
      kind: options?.kind ?? "warning",
      okLabel: options?.okLabel,
      cancelLabel: options?.cancelLabel,
    });
  } catch {
    return window.confirm(message);
  }
}
