// src/components/Layout/Navigation/NavBar.tsx
import { Component, For } from "solid-js";
import { Dynamic } from "solid-js/web";
import styles from "./NavBar.module.css";

/**
 * 导航项数据结构
 */
export interface NavItem {
  /** 唯一标识符 */
  id: string;
  /** 显示名称 */
  label: string;
  /** 图标（可以是 emoji、SVG 组件或图标字符串） */
  icon?: any;
  /** 描述/提示文本 */
  description?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 徽章数字（用于显示未读消息等） */
  badge?: number;
}

/**
 * 导航栏配置
 */
export interface NavBarProps {
  /** 导航项列表 */
  items: NavItem[];
  /** 当前激活的项 ID */
  activeId?: string;
  /** 点击导航项的回调 */
  onNavigate: (id: string) => void;
  /** 导航栏方向 */
  direction?: "horizontal" | "vertical";
  /** 导航栏样式变体 */
  variant?: "tabs" | "pills" | "minimal";
  /** 是否显示图标 */
  showIcon?: boolean;
  /** 是否显示标签文字 */
  showLabel?: boolean;
  /** 自定义类名 */
  class?: string;
}

/**
 * 通用导航栏组件
 * 
 * @example
 * ```tsx
 * <NavBar
 *   items={[
 *     { id: 'home', label: '首页', icon: '🏠' },
 *     { id: 'settings', label: '设置', icon: '⚙️' }
 *   ]}
 *   activeId="home"
 *   onNavigate={(id) => console.log(id)}
 * />
 * ```
 */
export const NavBar: Component<NavBarProps> = (props) => {
  const direction = () => props.direction || "horizontal";
  const variant = () => props.variant || "tabs";
  const showIcon = () => props.showIcon !== false;
  const showLabel = () => props.showLabel !== false;

  const handleClick = (item: NavItem) => {
    if (!item.disabled) {
      props.onNavigate(item.id);
    }
  };

  return (
    <nav
      class={`${styles.navBar} ${styles[direction()]} ${styles[variant()]} ${
        props.class || ""
      }`}
    >
      <div class={styles.navItems}>
        <For each={props.items}>
          {(item) => (
            <button
              class={styles.navButton}
              classList={{
                [styles.active]: props.activeId === item.id,
                [styles.disabled]: item.disabled || false,
              }}
              onClick={() => handleClick(item)}
              title={item.description}
              aria-label={item.label}
              disabled={item.disabled}
            >
              {showIcon() && item.icon && (
                <span class={styles.icon}>
                  {typeof item.icon === "string" ? item.icon : <Dynamic component={item.icon} />}
                </span>
              )}
              {showLabel() && <span class={styles.label}>{item.label}</span>}
              {item.badge !== undefined && item.badge > 0 && (
                <span class={styles.badge}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </button>
          )}
        </For>
      </div>
    </nav>
  );
};

export default NavBar;
