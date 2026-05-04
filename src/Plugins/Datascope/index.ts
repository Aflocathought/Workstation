// src/Tools/Datascope/index.ts
import type { ToolConfig } from "../types";
import { ToolCategory } from "../types";
import ShowChart from '@suid/icons-material/ShowChart';

export const datascopeToolConfig: ToolConfig = {
  id: "tools-csv-viewer",
  name: "Datascope",
  icon: ShowChart,
  description: "面向大数据量的 CSV 可视化与下采样（后端加速）",
  category: ToolCategory.PRODUCTIVITY,
  component: () => import("./DatascopeBackend"),
  saveState: false,
};
