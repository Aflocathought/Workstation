# 🎨 主题系统使用指南

## 📋 概述

项目现在支持完整的主题系统,包括**浅色**、**深色**和**自动**三种主题模式。主题会自动保存到 localStorage,并在应用重启后恢复。

## 🚀 快速开始

### 1. 在任何组件中使用主题切换按钮

```tsx
import ThemeToggle from './components/ThemeToggle/ThemeToggle';

function MyComponent() {
  return (
    <div>
      <ThemeToggle />
    </div>
  );
}
```

### 2. 在代码中控制主题

```tsx
import { themeManager } from './core/ThemeManager';

// 获取当前主题
const current = themeManager.currentTheme; // 'light' | 'dark' | 'auto'

// 设置主题
themeManager.setCurrentTheme('dark'); // 切换到深色
themeManager.setCurrentTheme('light'); // 切换到浅色
themeManager.setCurrentTheme('auto'); // 自动跟随系统

// 切换到下一个主题 (light → dark → auto → light)
themeManager.toggleTheme();

// 检查当前是否为深色模式
if (themeManager.isDark) {
  console.log('当前是深色模式');
}

// 检查当前是否为浅色模式
if (themeManager.isLight) {
  console.log('当前是浅色模式');
}
```

## 🎨 使用 CSS 变量

所有样式文件都应该使用 CSS 变量而不是硬编码的颜色值。

### 可用的 CSS 变量

#### 背景色
- `--bg-primary`: 主背景色
- `--bg-secondary`: 次级背景色
- `--bg-tertiary`: 第三级背景色
- `--bg-elevated`: 浮起元素背景色(如卡片)

#### 文本色
- `--text-primary`: 主文本色
- `--text-secondary`: 次级文本色
- `--text-tertiary`: 第三级文本色
- `--text-inverse`: 反色文本(通常用于深色背景上)

#### 边框色
- `--border-primary`: 主边框色
- `--border-secondary`: 次级边框色
- `--border-focus`: 聚焦状态边框色

#### 交互色
- `--interactive-hover`: 悬停状态背景色
- `--interactive-active`: 激活状态背景色
- `--interactive-disabled`: 禁用状态背景色

#### 品牌色
- `--primary`: 主品牌色
- `--primary-hover`: 悬停态品牌色
- `--primary-active`: 激活态品牌色

#### 语义色
- `--success`: 成功色
- `--success-bg`: 成功背景色
- `--warning`: 警告色
- `--warning-bg`: 警告背景色
- `--error`: 错误色
- `--error-bg`: 错误背景色
- `--info`: 信息色
- `--info-bg`: 信息背景色

#### 阴影
- `--shadow-sm`: 小阴影
- `--shadow-md`: 中等阴影
- `--shadow-lg`: 大阴影

#### 其他
- `--overlay`: 遮罩层颜色
- `--backdrop-blur`: 背景模糊值

### 使用示例

#### ✅ 正确做法

```css
.myComponent {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-md);
}

.myButton {
  background: var(--primary);
  color: var(--text-inverse);
  padding: 8px 16px;
  border-radius: 4px;
}

.myButton:hover {
  background: var(--primary-hover);
}
```

#### ❌ 错误做法

```css
/* 不要使用硬编码的颜色 */
.myComponent {
  background-color: #ffffff;  /* ❌ */
  color: #1a1a1a;            /* ❌ */
  border: 1px solid #e0e0e0; /* ❌ */
}
```

## 📱 在 TitleBar 中添加主题切换按钮

建议将主题切换按钮添加到标题栏:

```tsx
// src/components/Layout/TitleBar/TitleBar.tsx
import ThemeToggle from '../../ThemeToggle/ThemeToggle';

function TitleBar() {
  return (
    <div class={styles.titleBar}>
      <div class={styles.left}>
        {/* ... */}
      </div>
      <div class={styles.right}>
        <ThemeToggle />
        {/* 其他按钮 */}
      </div>
    </div>
  );
}
```

## 🔧 自定义主题色

如果你想自定义主题颜色,编辑 `src/styles/themes.css`:

```css
[data-theme='dark'] {
  /* 修改深色主题的主品牌色 */
  --primary: #ff6b6b; /* 改成红色 */
  --primary-hover: #ff8787;
  --primary-active: #ffa3a3;
}
```

## 💡 最佳实践

1. **始终使用 CSS 变量**: 不要硬编码颜色值
2. **测试两种主题**: 确保组件在浅色和深色主题下都好看
3. **避免纯黑纯白**: 使用 `--bg-primary` 和 `--text-primary` 而不是 `#000` 或 `#fff`
4. **考虑对比度**: 确保文本在背景上有足够的对比度
5. **使用语义化变量**: 错误用 `--error`,成功用 `--success`,而不是直接用红色绿色

## 🌐 系统主题检测

当主题设置为 `auto` 时,应用会自动跟随系统主题:

```tsx
// 自动模式会监听系统主题变化
themeManager.setCurrentTheme('auto');

// 当用户在系统设置中切换浅色/深色模式时,
// 应用会自动更新,无需手动刷新
```

## 🎯 迁移现有代码

### 步骤1: 识别硬编码的颜色

```bash
# 搜索硬编码的颜色值
grep -r "#[0-9a-fA-F]\{3,6\}" src/ --include="*.css"
grep -r "rgb(" src/ --include="*.css"
grep -r "rgba(" src/ --include="*.css"
```

### 步骤2: 替换为 CSS 变量

| 原值 | 替换为 |
|------|--------|
| `#ffffff`, `white` | `var(--bg-primary)` |
| `#000000`, `black` | `var(--text-primary)` |
| `#f5f5f5` | `var(--bg-secondary)` |
| `#e0e0e0` | `var(--border-primary)` |
| `#0066cc` | `var(--primary)` |
| `#dc3545` | `var(--error)` |
| `#28a745` | `var(--success)` |

### 步骤3: 测试

1. 切换到浅色主题,检查UI
2. 切换到深色主题,检查UI
3. 确保所有元素可读且美观

## 📦 文件结构

```
src/
├── styles/
│   └── themes.css              # 主题定义
├── core/
│   └── ThemeManager.ts         # 主题管理器
├── components/
│   └── ThemeToggle/
│       ├── ThemeToggle.tsx     # 主题切换按钮
│       └── ThemeToggle.module.css
└── App.tsx                     # 导入主题系统
```

## ❓ 常见问题

### Q: 主题切换后页面闪烁怎么办?

A: 在 `themes.css` 中已经添加了过渡动画:

```css
* {
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
```

如果闪烁仍然存在,可以调整过渡时间或移除某些元素的过渡。

### Q: 如何添加新的颜色变量?

A: 在 `themes.css` 中的每个主题块 (`[data-theme='light']`, `[data-theme='dark']`) 都添加相同的变量名,但使用不同的颜色值。

### Q: 主题不持久化怎么办?

A: 主题会自动保存到 `localStorage`。如果不持久化,检查:
1. 浏览器是否允许 localStorage
2. 控制台是否有错误信息
3. ThemeManager 是否正确初始化

## 🎉 完成!

现在你的应用拥有了完整的主题系统! 🎨
