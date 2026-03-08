# 自定义标题栏实现说明

## 概述

已成功实现自定义窗口标题栏,替代了 Windows 原生的标题栏,提供了完整的窗口控制功能。

## 实现的功能

### 1. 窗口控制
- ✅ **最小化** - 点击减号按钮最小化窗口
- ✅ **最大化/还原** - 点击方框按钮在最大化和还原之间切换
- ✅ **关闭** - 点击叉号按钮关闭窗口
- ✅ **拖动** - 可以通过标题栏拖动窗口位置

### 2. 视觉反馈
- ✅ **按钮悬停效果** - 鼠标悬停时按钮高亮
- ✅ **按钮点击效果** - 点击时按钮有视觉反馈
- ✅ **最大化状态指示** - 图标根据窗口状态切换
- ✅ **窗口焦点状态** - 失焦时标题栏变灰
- ✅ **关闭按钮特殊样式** - 悬停时显示红色背景

### 3. 主题支持
- ✅ **亮色主题** - 默认白色渐变背景
- ✅ **深色主题** - 自动适配系统深色模式
- ✅ **平滑过渡** - 状态切换有动画效果

## 技术实现

### 文件结构
```
src/
├── components/
│   ├── TitleBar.tsx           # 标题栏组件
│   └── TitleBar.module.css    # 标题栏样式
├── App.tsx                     # 集成标题栏
└── App.module.css             # 更新布局样式
```

### 关键配置

**tauri.conf.json**
```json
{
  "app": {
    "windows": [{
      "decorations": false,  // 隐藏原生标题栏
      "transparent": false
    }]
  }
}
```

**index.html**
```html
<style>
  html, body {
    margin: 0;
    padding: 0;
    overflow: hidden;  /* 防止滚动条 */
  }
</style>
```

### 拖动区域实现

使用 `data-tauri-drag-region` 属性标记可拖动区域:
```tsx
<div data-tauri-drag-region>
  {/* 这个区域可以拖动窗口 */}
</div>
```

### 窗口 API 使用

```typescript
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

// 最小化
await appWindow.minimize();

// 切换最大化
await appWindow.toggleMaximize();

// 关闭
await appWindow.close();

// 监听窗口状态
await appWindow.onResized(() => {
  // 窗口大小改变
});

await appWindow.onFocusChanged(({ payload: focused }) => {
  // 窗口焦点改变
});
```

## 样式细节

### 标题栏尺寸
- **高度**: 32px (标准 Windows 标题栏高度)
- **按钮宽度**: 46px (符合 Windows 11 设计)

### 颜色方案

**亮色模式**
- 背景: `#ffffff` → `#f5f5f5` (渐变)
- 边框: `#e0e0e0`
- 文字: `#333`
- 失焦: `#999`

**深色模式**
- 背景: `#2d2d2d` → `#252525` (渐变)
- 边框: `#1a1a1a`
- 文字: `#e0e0e0`

### 关闭按钮特殊效果
- 悬停: `#e81123` (Windows 红色)
- 点击: `#c50d1c` (深红色)

## 使用方法

1. **启动应用**
   ```bash
   pnpm tauri dev
   ```

2. **测试功能**
   - 拖动标题栏移动窗口
   - 点击最小化按钮
   - 点击最大化按钮(多次点击切换状态)
   - 点击关闭按钮

3. **切换焦点**
   - 点击其他窗口,观察标题栏变灰
   - 再次点击应用,标题栏恢复颜色

## 扩展建议

### 可以添加的功能

1. **菜单栏** - 在标题栏左侧添加菜单按钮
2. **搜索框** - 在标题栏中集成搜索功能
3. **快捷按钮** - 添加常用功能的快速访问按钮
4. **自定义主题** - 允许用户自定义标题栏颜色
5. **双击最大化** - 双击标题栏切换最大化状态

### 实现双击最大化示例

```typescript
let lastClickTime = 0;

const handleTitleBarClick = async () => {
  const now = Date.now();
  if (now - lastClickTime < 300) {
    // 双击
    await appWindow.toggleMaximize();
  }
  lastClickTime = now;
};
```

## 注意事项

1. **拖动区域冲突** - 确保按钮不在拖动区域内(已处理)
2. **Z-Index 管理** - 标题栏需要在最上层(已设置 z-index: 1000)
3. **滚动条处理** - body 设置 overflow: hidden 防止滚动条
4. **缩放影响** - 注意 CSS zoom 属性对标题栏尺寸的影响

## 效果预览

当前实现的标题栏完全模仿 Windows 11 的设计风格:
- 简洁的扁平化设计
- 流畅的交互动画
- 符合 Windows 设计规范的按钮布局和颜色
- 支持深色/亮色主题自动切换

所有窗口控制功能已完全可用! 🎉
