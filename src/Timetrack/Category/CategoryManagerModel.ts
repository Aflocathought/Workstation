import { Accessor, createMemo, createSignal } from "solid-js";
import { appFramework } from "../../core/AppFramework";
import {
  CategoryConfig,
  defaultCategoryConfig,
  removeCategory,
  renameCategory,
  setAppAlias,
  setAppCategory,
  setCategoryColor,
  upsertCategory,
  getUnassignedColor,
  getUnrecordedColor,
  setUnassignedColor,
  setUnrecordedColor,
} from "./CategoryUtils";
import {
  categoryConfig as getCfg,
  setCategoryConfig,
} from "./CategoryStore";
import { debounce } from "../../components/Utils/debounce";

export class CategoryManager {
  private static instance: CategoryManager | null = null;

  cfg!: Accessor<CategoryConfig>;
  setCfg!: (v: CategoryConfig) => void;
  editingCategory!: Accessor<string | null>;
  setEditingCategory!: (v: string | null) => void;
  editName!: Accessor<string>;
  setEditName!: (v: string) => void;
  editColor!: Accessor<string>;
  setEditColor!: (v: string) => void;
  apps!: Accessor<string[]>;
  setApps!: (v: string[]) => void;
  aliasEdits!: Accessor<Record<string, string>>;
  setAliasEdits!: (v: Record<string, string>) => void;
  categoryEdits!: Accessor<Record<string, string | null>>;
  setCategoryEdits!: (v: Record<string, string | null>) => void;
  activeTab!: Accessor<string>;
  setActiveTab!: (v: string) => void;
  UNASSIGNED = "未分配" as const;
  fileInput!: Accessor<HTMLInputElement | null>;
  setFileInput!: (el: HTMLInputElement | null) => void;

  constructor() {
    [this.cfg, this.setCfg] = createSignal<CategoryConfig>(getCfg());
    [this.editingCategory, this.setEditingCategory] = createSignal<string | null>(null);
    [this.editName, this.setEditName] = createSignal<string>("");
    [this.editColor, this.setEditColor] = createSignal<string>("#888888");
    [this.apps, this.setApps] = createSignal<string[]>([]);
    [this.aliasEdits, this.setAliasEdits] = createSignal<Record<string, string>>({});
    [this.categoryEdits, this.setCategoryEdits] = createSignal<Record<string, string | null>>({});
    [this.activeTab, this.setActiveTab] = createSignal<string>("全部");
    [this.fileInput, this.setFileInput] = createSignal<HTMLInputElement | null>(null);
    this.specialColors = createMemo(() => ({
      unrecorded: getUnrecordedColor(this.cfg()),
      unassigned: getUnassignedColor(this.cfg()),
    }));
    this.tabs = createMemo<string[]>(() => [
      "全部",
      this.UNASSIGNED,
      ...this.cfg().categories.map((c: { name: string }) => c.name),
    ]);
    this.filteredApps = createMemo<string[]>(() => {
      const tab = this.activeTab();
      const allApps = this.apps();
      const catEdits = this.categoryEdits();
      
      console.log('🔍 筛选应用:', { tab, allApps, catEdits });
      
      if (tab === "全部") return allApps;
      
      const filtered = allApps.filter((app: string) => {
        // 使用 categoryEdits 作为主要数据源
        const cat = catEdits[app] ?? null;
        const match = tab === this.UNASSIGNED ? !cat : cat === tab;
        console.log(`  ${app}: cat="${cat}", match=${match}`);
        return match;
      });
      
      console.log('✅ 筛选结果:', filtered);
      return filtered;
    });
  }

  specialColors!: Accessor<{ unrecorded: string; unassigned: string }>;
  tabs!: Accessor<string[]>;
  filteredApps!: Accessor<string[]>;

  categoryColor = (name: string): string =>
    this.cfg().categories.find((c: { name: string; color: string }) => c.name === name)?.color || "#ccc";

  isConcreteCategory = (name: string): boolean => name !== "全部" && name !== this.UNASSIGNED;

  async loadApps(): Promise<void> {
    const result = await appFramework.errorManager.withErrorHandling(
      async () => {
        const setNames = new Set<string>();
        const latest = await appFramework.repository.getLatestActivities();
        latest?.forEach((l) => setNames.add(l.app_name));

        const today = new Date().toISOString().split("T")[0];
        const todayActs = await appFramework.repository.getActivitiesForDay(today);
        todayActs?.forEach((a) => setNames.add(a.app_name));

        const filtered = Array.from(setNames).filter((n) => n && n !== "未记录");
        filtered.sort((a, b) => a.localeCompare(b));
        
        return { filtered };
      },
      {
        errorTitle: '加载应用列表失败',
        showLoading: false
      }
    );

    if (!result) {
      return;
    }

    const { filtered } = result;
    this.setApps(filtered);

    const aliases: Record<string, string> = {};
    const cats: Record<string, string | null> = {};
    const c = this.cfg();
    filtered.forEach((app: string) => {
      aliases[app] = c.appAliasMap?.[app] || "";
      cats[app] = c.appCategoryMap?.[app] ?? null;
    });
    this.setAliasEdits(aliases);
    this.setCategoryEdits(cats);
  }

  setFileInputRef = (el: HTMLInputElement | null): void => {
    this.setFileInput(el);
  };
  triggerImport = (): void => {
    const el = this.fileInput();
    el?.click();
  };

  exportJson = (): void => {
    const blob = new Blob([JSON.stringify(this.cfg(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "categories.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  importJson = async (e: Event): Promise<void> => {
    const input = e.target as HTMLInputElement | null;
    if (!input?.files || input.files.length === 0) return;
    const file = input.files[0];
    const text = await file.text();
    try {
      const parsed = JSON.parse(text) as CategoryConfig;
      if (parsed.version !== 1) throw new Error("版本不兼容");
      this.setCfg(parsed);
      setCategoryConfig(parsed);
      await this.loadApps();
    } catch (err) {
      alert("导入失败: " + (err as Error).message);
    } finally {
      input.value = "";
    }
  };

  resetDefault = (): void => {
    const next = defaultCategoryConfig();
    this.setCfg(next);
    setCategoryConfig(next);
  };

  debouncedSaveAlias = debounce((app: string, value: string) => {
    const trimmed = value.trim();
    const next = setAppAlias(this.cfg(), app, trimmed ? trimmed : null);
    this.setCfg(next);
    setCategoryConfig(next);
  }, 300);

  onAliasInput = (app: string, value: string): void => {
    this.setAliasEdits({ ...this.aliasEdits(), [app]: value });
    this.debouncedSaveAlias(app, value);
  };

  onCategoryChange = (app: string, value: string): void => {
    const normalizedValue = value || null;
    this.setCategoryEdits({ ...this.categoryEdits(), [app]: normalizedValue });
    const next = setAppCategory(this.cfg(), app, normalizedValue);
    this.setCfg(next);
    setCategoryConfig(next);
  };

  saveCategoryEdit = async (originalName: string): Promise<void> => {
    const newNameRaw = this.editName().trim();
    const newColorRaw = this.editColor();

    if (originalName === "__new__") {
      const name = newNameRaw || "新分类";
      const next = upsertCategory(this.cfg(), name, newColorRaw || "#888888");
      this.setCfg(next);
      setCategoryConfig(next);
      this.setActiveTab(name);
      await this.loadApps();
    } else {
      let next = this.cfg();
      if (newNameRaw && newNameRaw !== originalName) {
        next = renameCategory(next, originalName, newNameRaw);
      }
      if (newColorRaw) {
        next = setCategoryColor(next, newNameRaw || originalName, newColorRaw);
      }
      this.setCfg(next);
      setCategoryConfig(next);
      await this.loadApps();
    }
    this.setEditingCategory(null);
  };

  removeCategoryAction = async (name: string): Promise<void> => {
    const next = removeCategory(this.cfg(), name);
    this.setCfg(next);
    setCategoryConfig(next);
    this.setEditingCategory(null);
    await this.loadApps();
  };

  actions = {
    setActiveTabSafe: (t: string): void => {
      this.setActiveTab(t);
    },
    resetDefault: this.resetDefault,
    exportJson: this.exportJson,
    importJson: this.importJson,
    setFileInputRef: this.setFileInputRef,
    triggerImport: this.triggerImport,
    onAliasInput: this.onAliasInput,
    onCategoryChange: this.onCategoryChange,
    openEditCategory: (name: string): void => {
      this.setEditingCategory(name);
      const cat = this.cfg().categories.find((c: { name: string; color: string }) => c.name === name);
      this.setEditName(cat?.name || name);
      this.setEditColor(cat?.color || "#888888");
    },
    openNewCategory: (): void => {
      this.setEditingCategory("__new__");
      this.setEditName("");
      this.setEditColor("#888888");
    },
    onEditNameChange: (v: string): void => { this.setEditName(v); },
    onEditColorChange: (v: string): void => { this.setEditColor(v); },
    onCancelDialog: (): void => { this.setEditingCategory(null); },
    onDeleteCategory: (name: string): void => { this.removeCategoryAction(name); },
    onSaveCategory: (originalName: string): void => { this.saveCategoryEdit(originalName); },
    setUnrecordedColor: (color: string): void => {
      const next = setUnrecordedColor(this.cfg(), color);
      this.setCfg(next);
      setCategoryConfig(next);
    },
    setUnassignedColor: (color: string): void => {
      const next = setUnassignedColor(this.cfg(), color);
      this.setCfg(next);
      setCategoryConfig(next);
    },
  };

  static getInstance(): CategoryManager {
    if (!this.instance) {
      this.instance = new CategoryManager();
    }
    return this.instance;
  }
}
