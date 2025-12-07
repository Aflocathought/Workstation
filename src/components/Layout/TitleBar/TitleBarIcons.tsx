// src/components/Layout/TitleBar/TitleBarIcons.tsx
import { Component } from "solid-js";

// 应用图标 (3D 立方体)
export const AppIcon: Component = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="currentColor"
    data-tauri-drag-region
  >
    <path d="M8 0L0 4v8l8 4 8-4V4L8 0zm0 2.5L13.5 5 8 7.5 2.5 5 8 2.5zM1 5.9l6.5 3.25v6.35L1 12.25V5.9zm7.5 9.6v-6.35L15 5.9v6.35l-6.5 3.25z" />
  </svg>
);

// 最小化图标 (横线)
export const MinimizeIcon: Component = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <path d="M0 6h12" stroke="currentColor" stroke-width="1" />
  </svg>
);

// 最大化图标 (方框)
export const MaximizeIcon: Component = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <rect
      x="1.5"
      y="1.5"
      width="9"
      height="9"
      stroke="currentColor"
      stroke-width="1"
      fill="none"
    />
  </svg>
);

// 还原图标 (双层方框)
export const RestoreIcon: Component = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <path
      d="M3 3v6h6V3H3zm1 1h4v4H4V4z"
      fill="currentColor"
    />
    <path
      d="M2 2h7v1H3v6H2V2z"
      fill="currentColor"
    />
  </svg>
);

// 关闭图标 (叉号)
export const CloseIcon: Component = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <path
      d="M1 1l10 10M11 1L1 11"
      stroke="currentColor"
      stroke-width="1"
    />
  </svg>
);
