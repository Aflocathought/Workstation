# NavBar 组件使用说明

## 概述

`NavBar` 是一个高度可复用的导航栏组件，支持多种样式变体和布局方向。它提供了清晰的数据结构，可以轻松集成到任何需要导航功能的地方。

## 数据结构

### NavItem 接口

```typescript
interface NavItem {
  id: string;              // 唯一标识符
  label: string;           // 显示文本
  icon?: any;              // 可选图标（SolidJS 组件或元素）
  description?: string;    // 可选描述（用于 title 提示）
  disabled?: boolean;      // 是否禁用
  badge?: number;          // 可选徽章数字
}
```

### NavBarProps 接口

```typescript
interface NavBarProps {
  items: NavItem[];                              // 导航项数组
  activeId: string;                              // 当前激活的项 ID
  onNavigate: (id: string) => void;             // 导航回调函数
  direction?: "horizontal" | "vertical";         // 布局方向（默认 horizontal）
  variant?: "tabs" | "pills" | "minimal";       // 样式变体（默认 tabs）
  showIcon?: boolean;                            // 是否显示图标（默认 true）
  showLabel?: boolean;                           // 是否显示文本（默认 true）
  class?: string;                                // 自定义 CSS 类名
}
```

## 样式变体

### 1. tabs（标签页样式）

VSCode 风格的标签页，激活项有底部边框指示器（水平）或左侧边框指示器（垂直）。

```tsx
<NavBar
  items={navItems}
  activeId={currentId}
  onNavigate={handleNavigate}
  variant="tabs"
/>
```

**适用场景**：
- 主导航栏
- 页面切换
- 需要明确的视觉分隔

### 2. pills（药丸样式）

圆角按钮样式，激活项有填充背景色。

```tsx
<NavBar
  items={navItems}
  activeId={currentId}
  onNavigate={handleNavigate}
  variant="pills"
/>
```

**适用场景**：
- 次级导航
- 工具栏
- 选项卡

### 3. minimal（极简样式）

最简洁的样式，激活项有细下划线（水平）或细左边框（垂直）。

```tsx
<NavBar
  items={navItems}
  activeId={currentId}
  onNavigate={handleNavigate}
  variant="minimal"
/>
```

**适用场景**：
- 标题栏按钮
- 紧凑空间
- 不希望导航过于突出的场景

## 布局方向

### 水平布局（默认）

```tsx
<NavBar
  items={navItems}
  activeId={currentId}
  onNavigate={handleNavigate}
  direction="horizontal"
/>
```

### 垂直布局

```tsx
<NavBar
  items={navItems}
  activeId={currentId}
  onNavigate={handleNavigate}
  direction="vertical"
/>
```

## 使用示例

### 示例 1：基础导航栏（当前 Navigation 组件使用方式）

```tsx
import { NavBar, type NavItem } from "./NavBar";
import { router } from "../../../core/Router";

const Navigation = () => {
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
```

### 示例 2：标题栏导航按钮（当前 TitleBar 组件使用方式）

```tsx
import { NavBar, type NavItem } from "../Navigation/NavBar";
import { router } from "../../../core/Router";

const TitleBar = () => {
  // 过滤主要导航项
  const mainNavItems = (): NavItem[] =>
    router.visibleRoutes
      .filter((r) => r.id !== "settings")
      .map((route) => ({
        id: route.id,
        label: route.name,
        icon: route.icon,
        description: route.description,
      }));

  return (
    <div class={styles.titlebar}>
      {/* 应用图标 */}
      <div class={styles.appIcon}>
        <AppIcon />
      </div>

      {/* 分隔线 */}
      <div class={styles.divider} />

      {/* 主要功能按钮 */}
      <NavBar
        items={mainNavItems()}
        activeId={router.current}
        onNavigate={(id) => router.navigate(id)}
        direction="horizontal"
        variant="minimal"
        showIcon={true}
        showLabel={true}
        class={styles.mainActions}
      />

      {/* 窗口控制按钮 */}
      {/* ... */}
    </div>
  );
};
```

### 示例 3：带徽章的导航项

```tsx
const navItems: NavItem[] = [
  {
    id: "dashboard",
    label: "仪表盘",
    icon: "📊",
  },
  {
    id: "notifications",
    label: "通知",
    icon: "🔔",
    badge: 5,  // 显示数字徽章
  },
  {
    id: "messages",
    label: "消息",
    icon: "💬",
    badge: 150,  // 显示 "99+" 徽章（超过 99）
  },
];

<NavBar
  items={navItems}
  activeId="dashboard"
  onNavigate={handleNavigate}
  variant="pills"
/>
```

### 示例 4：垂直侧边栏

```tsx
const sidebarItems: NavItem[] = [
  { id: "home", label: "主页", icon: "🏠" },
  { id: "projects", label: "项目", icon: "📁" },
  { id: "tasks", label: "任务", icon: "✓" },
  { id: "settings", label: "设置", icon: "⚙️", disabled: true },
];

<NavBar
  items={sidebarItems}
  activeId="home"
  onNavigate={handleNavigate}
  direction="vertical"
  variant="tabs"
/>
```

### 示例 5：仅图标导航

```tsx
<NavBar
  items={navItems}
  activeId={currentId}
  onNavigate={handleNavigate}
  showIcon={true}
  showLabel={false}  // 只显示图标
  variant="pills"
/>
```

### 示例 6：仅文字导航

```tsx
<NavBar
  items={navItems}
  activeId={currentId}
  onNavigate={handleNavigate}
  showIcon={false}  // 只显示文字
  showLabel={true}
  variant="tabs"
/>
```

## 特性

✅ **类型安全**：完整的 TypeScript 类型定义  
✅ **响应式**：基于 SolidJS 的高性能响应式系统  
✅ **灵活布局**：支持水平和垂直布局  
✅ **多种样式**：三种预设样式变体  
✅ **徽章支持**：内置数字徽章显示  
✅ **禁用状态**：支持禁用特定导航项  
✅ **暗色模式**：完整的暗色主题支持  
✅ **无障碍**：包含 ARIA 标签和键盘导航支持  
✅ **自定义样式**：可通过 `class` 属性添加自定义样式  

## 样式自定义

如果需要自定义样式，可以通过 `class` 属性传入自定义类名：

```tsx
<NavBar
  items={navItems}
  activeId={currentId}
  onNavigate={handleNavigate}
  class="my-custom-navbar"
/>
```

然后在你的 CSS 模块中覆盖样式：

```css
.myCustomNavbar :global(.navButton) {
  padding: 12px 20px;
  font-size: 16px;
}
```

## 注意事项

1. **图标类型**：`icon` 可以是任何可渲染的内容（字符串、JSX 元素、SolidJS 组件等）
2. **徽章显示**：徽章只在 `badge > 0` 时显示，超过 99 会显示 "99+"
3. **禁用状态**：禁用的项不会触发 `onNavigate` 回调
4. **响应式更新**：传入响应式函数（如 `navItems()`）以自动更新导航项

## 项目中的实际应用

### Navigation.tsx
- 使用 `tabs` 变体
- 水平布局
- 显示所有可见路由

### TitleBar.tsx
- 使用 `minimal` 变体
- 水平布局
- 只显示主要功能路由（排除设置）
- 集成在标题栏的拖拽区域内

两个组件共享同一个 `NavBar` 组件，但通过不同的配置呈现不同的视觉效果，展示了组件的高度可复用性。
