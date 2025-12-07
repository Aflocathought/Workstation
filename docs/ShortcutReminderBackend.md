# 快捷键提醒工具 - Rust 后端集成说明

## 更新日期
2025年11月10日

## 更新内容

### 1. Rust 后端实现

#### 新增文件
- `src-tauri/src/shortcut.rs` - 快捷键服务模块

#### 核心功能

**修饰键检测**
```rust
pub fn get_modifier_state(&self) -> windows::core::Result<ModifierState>
```
- 实时获取 Ctrl、Alt、Shift、Win 键的按下状态
- 使用 Windows API `GetAsyncKeyState`
- 支持多修饰键组合检测

**前台窗口信息**
```rust
pub fn get_foreground_window_info(&self) -> windows::core::Result<ForegroundWindowInfo>
```
- 获取当前前台窗口标题
- 获取窗口类名
- 获取进程名称和进程ID
- 使用 Windows API `GetForegroundWindow` 等

**按键状态检测**
```rust
pub fn is_key_pressed(&self, key_code: i32) -> windows::core::Result<bool>
```
- 检查指定虚拟键码的按键是否被按下
- 支持所有 Windows 虚拟键码

#### Tauri命令接口

在 `lib.rs` 中注册了三个命令：

1. `get_modifier_state` - 获取修饰键状态
2. `get_foreground_window` - 获取前台窗口信息
3. `is_key_pressed` - 检查按键状态

### 2. 前端服务封装

#### 新增文件
- `src/services/ShortcutService.ts` - TypeScript 服务层

#### 接口说明

**ModifierState 接口**
```typescript
interface ModifierState {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
}
```

**ForegroundWindowInfo 接口**
```typescript
interface ForegroundWindowInfo {
  title: string;
  className: string;
  processName: string;
  processId: number;
}
```

**主要方法**

1. `getModifierState()` - 获取修饰键状态
2. `getForegroundWindow()` - 获取前台窗口信息
3. `isKeyPressed(keyCode)` - 检查按键状态
4. `pollModifierState(callback, interval)` - 轮询修饰键状态

#### 虚拟键码常量

提供了完整的虚拟键码常量 `VirtualKeyCodes`:
- 修饰键：CTRL, ALT, SHIFT, LWIN, RWIN
- 字母键：A-Z
- 数字键：0-9
- 功能键：F1-F12
- 特殊键：Enter, Space, Escape, Tab 等
- 方向键：LEFT, UP, RIGHT, DOWN

### 3. UI 更新

#### 新增功能

**悬浮提示开关**
- 工具栏右侧添加开关按钮
- 🟢 悬浮提示已启用 / 🔴 悬浮提示已禁用
- 状态持久化保存到 localStorage

**前台窗口信息显示**
- 在悬浮提示框中显示当前窗口信息
- 包含进程名称和窗口标题
- 仅在使用 Rust 后端时可用

#### 工作模式

**自动检测模式**
- 优先使用 Rust 后端（Tauri 环境）
- 降级到浏览器键盘事件（Web 环境）

**Rust 后端模式**
- 100ms 轮询修饰键状态
- 自动获取前台窗口信息
- 支持全局快捷键检测

**浏览器模式**
- 监听 keydown/keyup 事件
- 仅在应用窗口内有效
- 无前台窗口信息

## 使用方法

### 基本使用

1. **启动应用**
   - 在 Tauri 环境下自动使用 Rust 后端
   - 悬浮提示默认开启

2. **按下修饰键**
   - 按下 Ctrl、Alt、Shift 或组合键
   - 右下角显示对应的快捷键列表
   - 同时显示当前前台窗口信息

3. **控制开关**
   - 点击工具栏右侧的开关按钮
   - 🟢 表示启用，🔴 表示禁用
   - 禁用后不再显示悬浮提示

### 开发者使用

#### 调用后端 API

```typescript
import { ShortcutService } from '../services/ShortcutService';

// 获取修饰键状态
const state = await ShortcutService.getModifierState();
console.log('Ctrl:', state.ctrl);
console.log('Alt:', state.alt);

// 获取前台窗口信息
const window = await ShortcutService.getForegroundWindow();
console.log('进程:', window.processName);
console.log('标题:', window.title);

// 检查按键状态
import { VirtualKeyCodes } from '../services/ShortcutService';
const isAPressed = await ShortcutService.isKeyPressed(VirtualKeyCodes.A);
```

#### 轮询修饰键状态

```typescript
// 开始轮询
const stop = ShortcutService.pollModifierState((state) => {
  console.log('修饰键状态变化:', state);
}, 100);

// 停止轮询
stop();
```

## 技术细节

### Windows API 使用

**GetAsyncKeyState**
- 获取键盘按键状态
- 返回 i16 类型
- 最高位表示按键是否被按下

**GetForegroundWindow**
- 获取前台窗口句柄
- 返回 HWND 类型

**GetWindowTextW**
- 获取窗口标题（Unicode）
- 需要提供缓冲区

**GetClassNameW**
- 获取窗口类名（Unicode）

**OpenProcess + GetModuleBaseNameW**
- 获取进程模块名称
- 需要 PROCESS_QUERY_INFORMATION 权限

### 错误处理

**Rust 端**
- 使用 `windows::core::Result<T>` 类型
- 错误自动转换为 `windows::core::Error`

**Tauri 命令**
- 将 Windows Error 转换为 String
- 前端接收友好的错误信息

**前端**
- try-catch 包装所有 invoke 调用
- 返回默认值或 null
- 控制台输出错误日志

### 性能优化

**轮询间隔**
- 默认 100ms
- 可根据需要调整
- 足够响应快捷键操作

**状态缓存**
- 轮询时比较状态变化
- 仅在变化时触发回调
- 减少不必要的处理

**懒加载**
- 前台窗口信息仅在需要时获取
- 避免频繁调用系统 API

## 平台兼容性

### Windows
- ✅ 完全支持
- ✅ 修饰键检测
- ✅ 前台窗口信息
- ✅ 虚拟键码检测

### macOS
- ⚠️ 部分支持
- ❌ 暂无 Rust 后端实现
- ✅ 可降级到浏览器模式

### Linux
- ⚠️ 部分支持
- ❌ 暂无 Rust 后端实现
- ✅ 可降级到浏览器模式

## 已知限制

1. **后端实现**
   - 目前仅支持 Windows 平台
   - macOS 和 Linux 需要额外实现

2. **权限要求**
   - 需要查询进程信息的权限
   - 某些系统窗口可能无法获取信息

3. **浏览器模式**
   - 无法获取前台窗口信息
   - 仅在应用窗口内有效
   - 无法检测全局快捷键

## 后续开发计划

### 短期（v1.1）
- [ ] 添加 macOS 支持
- [ ] 添加 Linux 支持
- [ ] 优化轮询性能
- [ ] 添加快捷键录制功能

### 中期（v1.2）
- [ ] 根据应用程序切换快捷键集
- [ ] 添加快捷键冲突检测
- [ ] 支持自定义轮询间隔
- [ ] 添加快捷键统计功能

### 长期（v2.0）
- [ ] 全局快捷键注册
- [ ] 快捷键宏录制
- [ ] AI 推荐常用快捷键
- [ ] 跨平台统一 API

## 调试信息

### 查看 Rust 日志

在开发环境下，Rust 端的 println! 会输出到控制台。

### 查看前端日志

在浏览器控制台查看：
- 修饰键状态变化
- 前台窗口信息
- API 调用错误

### 常见问题

**Q: 悬浮提示不显示？**
A: 
1. 检查开关是否启用
2. 检查是否按下了修饰键
3. 检查是否有配置的快捷键

**Q: 前台窗口信息不显示？**
A:
1. 确认运行在 Tauri 环境
2. 确认使用 Windows 平台
3. 检查是否有权限访问进程信息

**Q: 无法检测修饰键？**
A:
1. 确认运行在 Tauri 环境
2. 检查 Rust 后端是否正常工作
3. 尝试重启应用

## 示例代码

### 完整的轮询示例

```typescript
import { ShortcutService, type ModifierState } from '@/services/ShortcutService';
import { onMount, onCleanup } from 'solid-js';

function MyComponent() {
  onMount(() => {
    // 开始轮询
    const stop = ShortcutService.pollModifierState(
      async (state: ModifierState) => {
        console.log('修饰键状态:', state);
        
        // 当按下 Ctrl 时获取窗口信息
        if (state.ctrl) {
          const window = await ShortcutService.getForegroundWindow();
          console.log('当前窗口:', window);
        }
      },
      100 // 100ms 轮询间隔
    );

    // 清理
    onCleanup(() => {
      stop();
    });
  });

  return <div>My Component</div>;
}
```

### 自定义快捷键检测

```typescript
import { ShortcutService, VirtualKeyCodes } from '@/services/ShortcutService';

async function checkCustomShortcut() {
  const state = await ShortcutService.getModifierState();
  const isSpacePressed = await ShortcutService.isKeyPressed(VirtualKeyCodes.SPACE);
  
  if (state.ctrl && state.shift && isSpacePressed) {
    console.log('检测到 Ctrl + Shift + Space');
    // 执行自定义操作
  }
}
```

## 总结

Rust 后端的集成为快捷键提醒工具带来了：
- ✅ 更强大的键盘检测能力
- ✅ 全局快捷键支持
- ✅ 前台窗口信息获取
- ✅ 更好的用户体验

工具现在可以在 Windows 平台上提供完整的功能，同时在其他平台上优雅降级到浏览器模式。
