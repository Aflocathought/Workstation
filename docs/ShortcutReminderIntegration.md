# 快捷键提醒 - 集成方案实现

## 更新日期
2025年11月10日

## 变更说明

快捷键提醒工具已从**独立悬浮窗口**方案改为**应用内集成**方案。

### 🔄 主要变更

#### ✅ 保留的功能
- ✅ **Rust 后端键盘检测** - Windows API 修饰键实时检测
- ✅ **实时响应** - 100ms 轮询，按下修饰键立即显示
- ✅ **配置管理** - CRUD、导入/导出、重置功能
- ✅ **窗口信息** - 显示当前前台窗口进程和标题
- ✅ **开关控制** - 工具栏一键启用/禁用
- ✅ **多修饰键支持** - 7 种组合方式

#### ❌ 移除的内容
- ❌ 独立 HTML 窗口 (`shortcut-hint.html`)
- ❌ Rust 窗口创建函数 (`create_shortcut_hint_window`)
- ❌ Tauri 窗口控制命令 (`show/hide/toggle_shortcut_hint_window`)

#### 🆕 新增改进

- 🆕 **统一状态管理** - 配置使用 Solid.js 响应式状态，无需 localStorage 同步
- 🆕 **更好的性能** - 减少进程间通信开销
- 🆕 **更易维护** - 单一代码库，无需维护两套渲染逻辑
- 🆕 **自动初始化** - 首次启动自动保存默认配置

## 技术实现

### 架构设计

```text
┌─────────────────────────────────────────┐
│         Workstation 主窗口               │
│  ┌───────────────────────────────────┐  │
│  │   SR 工具页面 (SR.tsx)           │  │
│  │  ┌──────────────┬──────────────┐  │  │
│  │  │ 配置管理界面  │  悬浮提示框   │  │  │
│  │  │              │  (右下角)     │  │  │
│  │  │  - CRUD      │  - 修饰键标题  │  │  │
│  │  │  - 导入/导出 │  - 快捷键列表  │  │  │
│  │  │  - 开关控制  │  - 窗口信息   │  │  │
│  │  └──────────────┴──────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                    ↕
        ┌────────────────────────┐
        │   ShortcutService      │
        │  (TypeScript 服务层)    │
        └────────────────────────┘
                    ↕
        ┌────────────────────────┐
        │  Rust Backend Module   │
        │   (shortcut.rs)        │
        │  - Windows API         │
        │  - 键盘状态检测         │
        │  - 窗口信息获取         │
        └────────────────────────┘
```

### 文件结构

```text
src/Tools/ShortcutReminder/
├── SR.tsx                  # 主组件（配置UI + 悬浮提示）
├── SR.module.css           # 样式（包含悬浮提示样式）
├── types.ts                # TypeScript 类型定义
├── index.ts                # 工具注册
├── README.md               # 用户文档
└── QuickStart.md           # 快速开始

src/services/
└── ShortcutService.ts      # 后端服务封装

src-tauri/src/
├── shortcut.rs             # Rust 键盘检测模块
└── lib.rs                  # Tauri 命令注册
```

### 核心组件

#### 1. 悬浮提示框 (SR.tsx)

悬浮提示现在作为 SR 组件的一部分渲染：

```tsx
<Show when={showHint() && hintShortcuts().length > 0}>
  <div class={styles.floatingHint}>
    <div class={styles.hintBox}>
      {/* 修饰键标题 */}
      <div class={styles.hintTitle}>
        <span class={styles.hintModifier}>
          {getModifierName(currentModifier()!)}
        </span>
        <span>快捷键</span>
      </div>
      
      {/* 快捷键列表 */}
      <div class={styles.hintItems}>
        <For each={hintShortcuts()}>
          {(shortcut) => (
            <div class={styles.hintItem}>
              <div class={styles.hintItemKey}>{shortcut.key}</div>
              <div class={styles.hintItemDesc}>{shortcut.description}</div>
            </div>
          )}
        </For>
      </div>
      
      {/* 窗口信息 */}
      <Show when={foregroundWindow()}>
        <div class={styles.windowInfo}>
          {/* ... */}
        </div>
      </Show>
    </div>
  </div>
</Show>
```

#### 2. 状态管理

使用 Solid.js 的响应式信号：

```tsx
// 修饰键状态
const [modifierState, setModifierState] = createSignal<ModifierState>({
  ctrl: false,
  alt: false,
  shift: false,
});

// 是否显示提示
const [showHint, setShowHint] = createSignal(false);

// 前台窗口信息
const [foregroundWindow, setForegroundWindow] = createSignal<ForegroundWindowInfo | null>(null);

// 配置
const [config, setConfig] = createSignal<ShortcutConfig>(loadConfig());
```

#### 3. 后端轮询

使用 Rust 后端 100ms 轮询修饰键状态：

```tsx
onMount(() => {
  // 确保有默认配置
  if (!config() || Object.keys(config()).length === 0) {
    saveConfig(getDefaultConfig());
  }

  // 启动 Rust 后端轮询
  const stopPolling = ShortcutService.pollModifierState((state) => {
    if (!isHintEnabled()) {
      setShowHint(false);
      return;
    }

    setModifierState(state);
    
    // 有修饰键按下时显示提示
    if (state.ctrl || state.alt || state.shift) {
      setShowHint(true);
      ShortcutService.getForegroundWindow().then(setForegroundWindow);
    } else {
      setShowHint(false);
    }
  }, 100);

  onCleanup(stopPolling);
});
```

### 样式设计

悬浮提示框使用 `fixed` 定位在应用窗口右下角：

```css
.floatingHint {
  position: fixed;
  right: 20px;
  bottom: 20px;
  pointer-events: none;
  z-index: 9999;
  animation: fadeIn 0.2s ease-out;
}
 
.hintBox {
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  padding: 14px 18px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  min-width: 280px;
  max-width: 450px;
}
```

## 使用方法

### 基本使用

1. **导航到工具**

  ```text
  侧边栏 → Tools → 快捷键提醒
  ```

2. **配置快捷键**
   - 选择修饰键分组（Ctrl、Alt、Shift 等）
   - 点击"添加快捷键"
   - 输入按键和描述
   - 保存配置

3. **测试提示**
   - 按下配置的修饰键（如 Ctrl）
   - 悬浮提示框出现在窗口右下角
   - 显示该修饰键的所有快捷键
   - 释放修饰键后自动隐藏

### 开关控制

在工具栏右侧：

- ✅ **悬浮窗口已启用** - 正常工作
- ❌ **悬浮窗口已禁用** - 不显示提示

点击切换启用/禁用状态。

## 优势对比

### 独立窗口方案 vs 集成方案

| 特性 | 独立窗口 | 集成方案 ✅ |
|------|---------|------------|
| **状态同步** | 需要 localStorage | Solid.js 响应式 |
| **维护成本** | 高（两套代码） | 低（单一代码库） |
| **性能** | 需要进程间通信 | 直接内存访问 |
| **调试** | 困难（两个窗口） | 容易（一个窗口） |
| **兼容性** | Windows 限制 | 跨平台友好 |
| **窗口管理** | 复杂（透明、置顶） | 简单（CSS） |
| **代码复杂度** | 高 | 低 |

## 后续优化

### 短期

- [ ] 添加快捷键冲突检测
- [ ] 支持自定义提示框位置
- [ ] 添加更多动画效果
- [ ] 支持快捷键分组折叠

### 中期

- [ ] 支持全局快捷键触发
- [ ] 添加快捷键使用统计
- [ ] 支持多窗口应用配置
- [ ] 添加快捷键录制功能

### 长期

- [ ] AI 推荐常用快捷键
- [ ] 快捷键使用热力图
- [ ] 跨应用快捷键管理
- [ ] 快捷键训练模式

## 测试指南

### 启动应用

```powershell
# 开发模式
pnpm tauri dev

# 或构建生产版本
pnpm tauri build
```

### 测试步骤

1. **初始化测试**
   - 打开应用
   - 导航到 Tools → 快捷键提醒
   - 验证是否自动加载默认配置
   - 检查工具栏开关状态

2. **功能测试**
   - 按下 Ctrl 键
   - 验证悬浮提示出现在右下角
   - 检查显示的快捷键列表
   - 释放 Ctrl 键
   - 验证提示自动隐藏

3. **配置测试**
   - 添加新的快捷键
   - 编辑现有快捷键
   - 删除快捷键
   - 导出配置为 JSON
   - 导入配置文件
   - 重置为默认配置

4. **开关测试**
   - 点击开关禁用提示
   - 按下修饰键，验证无提示
   - 点击开关启用提示
   - 按下修饰键，验证提示恢复

5. **窗口信息测试**
   - 按下修饰键显示提示
   - 检查是否显示当前窗口信息
   - 切换到不同应用
   - 验证窗口信息更新

## 故障排查

### 提示框不显示

1. 检查开关是否启用
2. 检查是否有配置的快捷键
3. 打开开发者工具查看控制台错误
4. 验证 Rust 后端是否正常运行

### 配置丢失

1. 检查 localStorage 权限
2. 尝试重置为默认配置
3. 检查浏览器控制台错误

### 性能问题

1. 检查轮询间隔（默认 100ms）
2. 减少配置的快捷键数量
3. 检查系统资源占用

## 总结

集成方案相比独立窗口方案：

✅ **更简单** - 单一代码库，易于维护
✅ **更快速** - 无进程间通信开销
✅ **更可靠** - 统一状态管理，无同步问题
✅ **更易调试** - 单一窗口，便于开发
✅ **更友好** - 与主应用无缝集成

快捷键提醒现在完全集成在主应用中，提供了更好的用户体验和开发体验！🎉


Shortcut Hint Overlay Fix

朝向目标：窗口全屏透明、永远不抢焦点、CSS 控制显隐。
前端调整：shortcut-hint.ts 改为对 document.body 添删 hint-visible，CSS 以 body class 驱动显示；确保 pointer events 全部禁用。
窗口创建：create_shortcut_hint_window 的初始化脚本只做 DOM 清理，随后调用新的 configure_shortcut_hint_window_styles，集中设置 Win32 样式（无边框、无阴影、SW_SHOWNOACTIVATE）。
尺寸与定位：创建后读取主显示器尺寸/坐标，将窗口铺满并对齐屏幕左上角，避免位移。
交互穿透：启用 set_ignore_cursor_events(true)，配合 WS_EX_TRANSPARENT，透明层不再吞掉点击。
验证：cargo check --manifest-path src-tauri/Cargo.toml 通过；切换 hint toggle 后也保持无焦点、无阻挡。