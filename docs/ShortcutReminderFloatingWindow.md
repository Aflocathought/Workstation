# 快捷键提醒 - 独立悬浮窗口实现

## 更新日期
2025年11月10日

## 功能说明

现在快捷键提醒工具拥有一个**独立的悬浮窗口**，它会在 Workstation 启动时自动打开，并始终显示在屏幕右下角。

### 主要特点

1. **独立窗口**
   - 与主窗口分离
   - 始终置顶显示
   - 不占用任务栏空间
   - 点击穿透（不影响其他操作）

2. **自动启动**
   - Workstation 启动时自动创建
   - 无需手动打开
   - 默认可见状态

3. **实时响应**
   - 100ms 轮询修饰键状态
   - 按下修饰键立即显示提示
   - 释放修饰键自动隐藏

4. **窗口信息**
   - 显示当前前台窗口的进程名称
   - 显示窗口标题
   - 仅在 Windows 平台可用

5. **统一配置**
   - 与主窗口工具页面共享配置
   - 使用 localStorage 同步数据
   - 支持实时配置更新

## 文件结构

```
Workstation/
├── shortcut-hint.html          # 独立悬浮窗口页面
├── src/
│   ├── services/
│   │   └── ShortcutService.ts  # 快捷键服务
│   └── Tools/
│       └── ShortcutReminder/
│           ├── SR.tsx           # 配置管理页面
│           ├── SR.module.css
│           ├── types.ts
│           └── index.ts
└── src-tauri/src/
    ├── main.rs                  # 窗口创建和管理
    ├── shortcut.rs              # 快捷键后端服务
    └── lib.rs                   # Tauri 命令注册
```

## 技术实现

### 1. 独立窗口 (shortcut-hint.html)

**窗口特性：**
```typescript
- 无边框 (decorations: false)
- 透明背景 (transparent: true)
- 始终置顶 (always_on_top: true)
- 点击穿透 (WS_EX_TRANSPARENT)
- 不在任务栏显示 (skip_taskbar: true)
```

**内容结构：**
```html
<div id="hint-container">
  ├── 修饰键标题 (Ctrl / Alt / Shift...)
  ├── 快捷键列表
  │   └── 按键 + 描述
  └── 窗口信息（可选）
      ├── 进程名称
      └── 窗口标题
</div>
```

**数据同步：**
- 从 localStorage 加载配置
- 监听 storage 事件实时更新
- 与主窗口配置保持同步

### 2. 窗口管理 (main.rs)

**创建窗口：**
```rust
fn create_shortcut_hint_window(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>>
```

在应用启动的 `setup` 阶段自动调用：
```rust
.setup(|app| {
    // ... 其他初始化代码 ...
    
    // 创建快捷键提示悬浮窗口
    create_shortcut_hint_window(&app)?;
    
    Ok(())
})
```

**Windows API 设置：**
```rust
// 设置窗口点击穿透
WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW
```

**控制命令：**
```rust
- toggle_shortcut_hint_window()  // 切换显示/隐藏
- show_shortcut_hint_window()    // 显示窗口
- hide_shortcut_hint_window()    // 隐藏窗口
```

### 3. 前端集成 (SR.tsx)

**开关控制：**
```typescript
async function handleToggleHint(enabled: boolean) {
  // 保存配置到 localStorage
  saveHintEnabled(enabled);
  
  // 控制独立窗口
  const { invoke } = await import('@tauri-apps/api/core');
  if (enabled) {
    await invoke('show_shortcut_hint_window');
  } else {
    await invoke('hide_shortcut_hint_window');
  }
}
```

**配置同步：**
- 配置更改时自动保存到 localStorage
- 独立窗口通过 storage 事件监听变化
- 实时更新显示内容

## 使用方法

### 基本使用

1. **启动应用**
   ```
   启动 Workstation → 自动创建悬浮窗口 → 窗口隐藏在右下角待命
   ```

2. **查看快捷键**
   ```
   按下 Ctrl / Alt / Shift → 悬浮窗口显示 → 查看可用快捷键
   ```

3. **释放按键**
   ```
   释放所有修饰键 → 悬浮窗口自动隐藏
   ```

4. **配置管理**
   ```
   导航到 工具 → 快捷键提醒 → 管理配置 → 自动同步到悬浮窗口
   ```

### 开关控制

在工具页面的工具栏右侧：

- **🟢 悬浮窗口已启用**：悬浮窗口正常工作
- **🔴 悬浮窗口已禁用**：悬浮窗口隐藏，不响应按键

点击开关可以切换状态。

### 配置快捷键

1. 在工具页面添加/编辑快捷键
2. 配置自动保存到 localStorage
3. 悬浮窗口实时读取最新配置
4. 无需重启应用

## 窗口位置

悬浮窗口固定在屏幕右下角：
```css
position: fixed;
right: 20px;
bottom: 20px;
```

如需调整位置，可以修改 `shortcut-hint.html` 中的 CSS。

## 样式定制

### 修改颜色主题

在 `shortcut-hint.html` 的 `<style>` 标签中：

```css
/* 背景颜色 */
background: rgba(30, 30, 30, 0.95);

/* 边框颜色 */
border: 1px solid rgba(255, 255, 255, 0.1);

/* 修饰键颜色 */
color: #4a9eff;

/* 文字颜色 */
color: #ffffff;
```

### 修改尺寸

```css
/* 最小宽度 */
min-width: 250px;

/* 最大宽度 */
max-width: 400px;

/* 内边距 */
padding: 16px;
```

### 修改字体

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...;
```

## 性能优化

### 轮询策略

```javascript
// 100ms 轮询间隔
setInterval(pollModifierState, 100);
```

- 足够响应用户操作
- 不会造成性能问题
- 可根据需要调整

### 状态缓存

```javascript
// 仅在状态变化时触发更新
if (state.ctrl !== lastState.ctrl || ...) {
  lastState = state;
  // 更新显示
}
```

### 延迟加载

```javascript
// 仅在需要时获取窗口信息
if (modifier) {
  const windowInfo = await invoke('get_foreground_window')
    .catch(() => null);
}
```

## 调试方法

### 查看窗口

在开发环境下，窗口会自动打开 DevTools（已注释）。

如需启用：
```rust
#[cfg(debug_assertions)]
{
    let _ = win.open_devtools();
}
```

### 查看日志

在浏览器控制台查看：
- 修饰键状态变化
- 配置加载情况
- API 调用错误

### 查看配置

在浏览器控制台执行：
```javascript
localStorage.getItem('shortcut-reminder-config')
localStorage.getItem('shortcut-reminder-hint-enabled')
```

## 常见问题

### Q: 为什么看不到悬浮窗口？

A: 
1. 检查开关是否启用（工具页面）
2. 按下修饰键（Ctrl / Alt / Shift）
3. 检查是否有配置的快捷键
4. 检查窗口是否被隐藏

### Q: 如何完全禁用悬浮窗口？

A:
1. 在工具页面关闭开关
2. 或者注释掉 main.rs 中的创建代码：
```rust
// create_shortcut_hint_window(&app)?;
```

### Q: 悬浮窗口能拖动吗？

A:
目前不支持拖动（点击穿透）。如需拖动功能，需要修改窗口样式。

### Q: 能否自定义窗口位置？

A:
可以。修改 `shortcut-hint.html` 中的 CSS：
```css
#hint-container {
  position: fixed;
  right: 20px;    /* 距离右边距离 */
  bottom: 20px;   /* 距离底边距离 */
  /* 或使用 top/left */
}
```

### Q: 配置不同步怎么办？

A:
1. 检查 localStorage 权限
2. 尝试刷新页面
3. 重新打开工具页面
4. 重启应用

## 平台兼容性

### Windows
- ✅ 完全支持
- ✅ 点击穿透
- ✅ 窗口信息
- ✅ 修饰键检测

### macOS
- ⚠️ 基本支持
- ❌ 点击穿透（需要实现）
- ❌ 窗口信息（需要实现）
- ⚠️ 修饰键检测（浏览器模式）

### Linux
- ⚠️ 基本支持
- ❌ 点击穿透（需要实现）
- ❌ 窗口信息（需要实现）
- ⚠️ 修饰键检测（浏览器模式）

## 后续优化

### 短期
- [ ] 添加窗口拖动功能
- [ ] 支持自定义窗口位置
- [ ] 添加动画效果选项
- [ ] 支持多显示器

### 中期
- [ ] macOS 平台适配
- [ ] Linux 平台适配
- [ ] 添加主题切换
- [ ] 支持窗口透明度调节

### 长期
- [ ] 自定义窗口样式
- [ ] 支持窗口吸附
- [ ] 添加小部件功能
- [ ] 多窗口管理

## 总结

现在快捷键提醒工具拥有了一个独立的悬浮窗口：

✅ **自动启动** - 随 Workstation 启动
✅ **独立显示** - 不依赖主窗口
✅ **实时响应** - 100ms 轮询
✅ **统一配置** - localStorage 同步
✅ **优雅降级** - 多平台兼容
✅ **易于控制** - 一键开关

这个悬浮窗口提供了更好的用户体验，让用户可以在任何时候快速查看可用的快捷键，而不需要切换到工具页面。
