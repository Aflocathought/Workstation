// src/components/Category/CategoryManager.tsx (container)
import { Component, onMount } from "solid-js";
import CategoryManagerView from "./CategoryManagerRenderer";
import { CategoryManager } from "./CategoryManagerModel";

// 组件部分，默认导出
const CategoryManagerComponent: Component = () => {
  const manager = CategoryManager.getInstance();
  onMount(() => manager.loadApps());
  return <CategoryManagerView />;
};

export default CategoryManagerComponent;
