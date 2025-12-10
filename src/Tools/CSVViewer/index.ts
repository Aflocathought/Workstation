// src/Tools/CSVViewer/index.ts
import type { ToolConfig } from "../types";
import { ToolCategory } from "../types";

export const csvViewerToolConfig: ToolConfig = {
  id: "tools-csv-viewer",
  name: "CSV 可视化",
  icon: "📈",
  description: "面向大数据量的 CSV 可视化与下采样（后端加速）",
  category: ToolCategory.PRODUCTIVITY,
  component: () => import("./CSVVBackend"),
  saveState: false,
};
