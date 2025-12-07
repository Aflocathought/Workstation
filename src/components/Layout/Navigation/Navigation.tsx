// src/components/Layout/Navigation/Navigation.tsx
import { Component } from "solid-js";
import { router } from "../../../core/Router/Router";
import { NavBar, type NavItem } from "./NavBar";
import styles from "./Navigation.module.css";

export const Navigation: Component = () => {
  // 将路由转换为导航项
  const navItems = (): NavItem[] =>
    router.visibleRoutes.map((route) => ({
      id: route.id,
      label: route.name,
      icon: route.icon,
      description: route.description,
    }));

  return (
    <nav class={styles.navigation}>
      <NavBar
        items={navItems()}
        activeId={router.current}
        onNavigate={(id) => router.navigate(id)}
        direction="horizontal"
        variant="tabs"
        showIcon={true}
        showLabel={true}
      />
    </nav>
  );
};

export default Navigation;