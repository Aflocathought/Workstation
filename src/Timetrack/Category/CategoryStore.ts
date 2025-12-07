// src/components/Category/CategoryStore.ts
import { createSignal } from "solid-js";
import { CategoryConfig, loadCategoryConfig, saveCategoryConfig } from "./CategoryUtils";

const [cfg, setCfg] = createSignal<CategoryConfig>(loadCategoryConfig());
const [version, setVersion] = createSignal<number>(0);

export function categoryConfig() {
  return cfg();
}

export function setCategoryConfig(next: CategoryConfig) {
  setCfg(next);
  saveCategoryConfig(next);
  setVersion(v => v + 1);
}

export function categoryVersion() {
  return version();
}
