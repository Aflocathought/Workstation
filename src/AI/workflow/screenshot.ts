/**
 * 工作流缩略图截取
 *
 * 使用 html2canvas 对 .solid-flow 视口进行截图，
 * 生成 base64 PNG 用于门户卡片缩略图。
 */

import html2canvas from "html2canvas";

const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;

/**
 * 截取当前画布视口的缩略图。
 * @param container solid-flow 所在的父容器（默认查 document 中的 .solid-flow）
 * @returns base64 data URL 或 null
 */
export async function captureWorkflowThumbnail(
  container?: HTMLElement | null,
): Promise<string | null> {
  const el = container ?? document.querySelector<HTMLElement>(".solid-flow");
  if (!el) return null;

  try {
    const canvas = await html2canvas(el, {
      backgroundColor: null, // 透明背景
      scale: 1,              // 1x 够用于缩略图
      logging: false,
      useCORS: true,
      // 忽略某些元素避免截到浮层
      ignoreElements: (element) =>
        element.classList.contains("solid-flow__controls") ||
        element.classList.contains("solid-flow__minimap") ||
        element.classList.contains("solid-flow__panel"),
    });

    // 缩放到固定尺寸
    const thumb = document.createElement("canvas");
    thumb.width = THUMB_WIDTH;
    thumb.height = THUMB_HEIGHT;
    const ctx = thumb.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(canvas, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    return thumb.toDataURL("image/png", 0.8);
  } catch {
    console.warn("[screenshot] 截图失败");
    return null;
  }
}
