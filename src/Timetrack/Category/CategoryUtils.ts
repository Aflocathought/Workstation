// src/components/Category/CategoryUtils.ts
export type ColorHex = string; // e.g. #RRGGBB

export interface Category {
  name: string;
  color: ColorHex;
}

export interface CategoryConfig {
  version: 1;
  categories: Category[];
  appCategoryMap: Record<string, string>; // app name -> category name
  appAliasMap?: Record<string, string>; // app name -> alias (display name)
  specialColors?: {
    unrecorded: ColorHex; // 未记录
    unassigned: ColorHex; // 未分配
  };
}

export type ColorMode = "app" | "category";
export type TimelineLayout = "bar" | "hourlyGrid";

const STORAGE_KEY = "tt.categoryConfig.v1";

export function defaultCategoryConfig(): CategoryConfig {
  return {
    version: 1,
    categories: [
      { name: "办公", color: "#4CAF50" },
      { name: "娱乐", color: "#FF9800" },
      { name: "社交", color: "#2196F3" },
      { name: "默认", color: "#9E9E9E" },
    ],
    appCategoryMap: {},
    appAliasMap: {},
    specialColors: {
      unrecorded: "#9E9E9E",
      unassigned: "#9E9E9E",
    },
  };
}

export function loadCategoryConfig(): CategoryConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCategoryConfig();
    const parsed = JSON.parse(raw) as CategoryConfig;
    if (parsed.version !== 1) return defaultCategoryConfig();
    // 兼容旧数据：补齐可选字段
    if (!parsed.appAliasMap) parsed.appAliasMap = {};
    if (!parsed.appCategoryMap) parsed.appCategoryMap = {} as Record<string, string>;
    if (!parsed.specialColors) parsed.specialColors = { unrecorded: "#9E9E9E", unassigned: "#9E9E9E" };
    return parsed;
  } catch {
    return defaultCategoryConfig();
  }
}

export function saveCategoryConfig(cfg: CategoryConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function getCategoryForApp(cfg: CategoryConfig, appName: string): string | null {
  return cfg.appCategoryMap[appName] || null;
}

export function getCategoryColor(cfg: CategoryConfig, categoryName: string): string | null {
  const cat = cfg.categories.find(c => c.name === categoryName);
  return cat?.color || null;
}

export function getUnrecordedColor(cfg: CategoryConfig): ColorHex {
  return cfg.specialColors?.unrecorded || "#9E9E9E";
}

export function getUnassignedColor(cfg: CategoryConfig): ColorHex {
  return cfg.specialColors?.unassigned || "#9E9E9E";
}

export function setUnrecordedColor(cfg: CategoryConfig, color: ColorHex): CategoryConfig {
  const special = { ...(cfg.specialColors || {}) } as NonNullable<CategoryConfig["specialColors"]>;
  special.unrecorded = color;
  return { ...cfg, specialColors: special };
}

export function setUnassignedColor(cfg: CategoryConfig, color: ColorHex): CategoryConfig {
  const special = { ...(cfg.specialColors || {}) } as NonNullable<CategoryConfig["specialColors"]>;
  special.unassigned = color;
  return { ...cfg, specialColors: special };
}

export function upsertCategory(cfg: CategoryConfig, name: string, color: string): CategoryConfig {
  const exists = cfg.categories.findIndex(c => c.name === name);
  const categories = [...cfg.categories];
  if (exists >= 0) categories[exists] = { name, color };
  else categories.push({ name, color });
  return { ...cfg, categories };
}

export function removeCategory(cfg: CategoryConfig, name: string): CategoryConfig {
  const categories = cfg.categories.filter(c => c.name !== name);
  const appCategoryMap = { ...cfg.appCategoryMap };
  for (const app in appCategoryMap) {
    if (appCategoryMap[app] === name) delete appCategoryMap[app];
  }
  return { ...cfg, categories, appCategoryMap };
}

// 重命名分类，并同步更新 appCategoryMap 中的引用
export function renameCategory(cfg: CategoryConfig, oldName: string, newName: string): CategoryConfig {
  if (!newName.trim() || oldName === newName) return cfg;
  const categories = cfg.categories.filter(c => c.name !== oldName);
  // 取旧分类颜色，若不存在则默认灰
  const old = cfg.categories.find(c => c.name === oldName);
  const color = old?.color || "#888888";
  // 如果已存在同名分类，则覆盖其颜色，否则新增
  const existsIdx = categories.findIndex(c => c.name === newName);
  if (existsIdx >= 0) categories[existsIdx] = { name: newName, color };
  else categories.push({ name: newName, color });
  const appCategoryMap = { ...cfg.appCategoryMap };
  for (const app in appCategoryMap) {
    if (appCategoryMap[app] === oldName) appCategoryMap[app] = newName;
  }
  return { ...cfg, categories, appCategoryMap };
}

// 设置分类颜色
export function setCategoryColor(cfg: CategoryConfig, name: string, color: string): CategoryConfig {
  const categories = cfg.categories.map(c => c.name === name ? { ...c, color } : c);
  return { ...cfg, categories };
}

// 应用-项目分配
export function setAppCategory(cfg: CategoryConfig, appName: string, categoryName: string | null): CategoryConfig {
  const appCategoryMap = { ...cfg.appCategoryMap };
  if (!categoryName) delete appCategoryMap[appName];
  else appCategoryMap[appName] = categoryName;
  return { ...cfg, appCategoryMap };
}

// 应用别称
export function setAppAlias(cfg: CategoryConfig, appName: string, alias: string | null): CategoryConfig {
  const appAliasMap = { ...(cfg.appAliasMap || {}) };
  if (!alias || !alias.trim()) delete appAliasMap[appName];
  else appAliasMap[appName] = alias.trim();
  return { ...cfg, appAliasMap };
}

export function getAppAlias(cfg: CategoryConfig, appName: string): string | null {
  return (cfg.appAliasMap && cfg.appAliasMap[appName]) || null;
}

export function resolveAppDisplayName(cfg: CategoryConfig, appName: string): string {
  const alias = getAppAlias(cfg, appName);
  if (alias && alias.trim()) return alias.trim();
  // 无别称时使用原名，但去掉 .exe 后缀（不区分大小写）
  return appName.replace(/\.exe$/i, "");
}
