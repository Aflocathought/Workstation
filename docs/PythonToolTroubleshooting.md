# 🐛 Python 工具命令未找到 - 解决方案

## 问题描述

错误信息: `Command list_python_scripts not found`

这表示 Tauri 后端命令没有正确注册或应用需要重新启动。

## ✅ 解决步骤

### 方法 1: 重启应用 (推荐)

1. **停止当前运行的应用**
   - 关闭 Workstation 应用窗口
   - 或者在终端按 `Ctrl+C` 停止开发服务器

2. **重新编译后端** (已完成 ✓)
   ```bash
   cargo build --manifest-path=src-tauri/Cargo.toml
   ```

3. **启动应用**
   ```bash
   pnpm tauri dev
   ```

### 方法 2: 手动终止进程

如果应用无法正常关闭:

```powershell
# 查找 Tauri 进程
Get-Process | Where-Object { $_.ProcessName -like "*Workstation*" }

# 终止进程
Stop-Process -Name "Workstation" -Force

# 或者终止占用 1420 端口的进程
$port = Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue
if ($port) {
    Stop-Process -Id $port.OwningProcess -Force
}
```

## 🔍 验证命令是否注册

### 检查后端代码

所有命令已在 `src-tauri/src/lib.rs` 中正确注册:

```rust
.invoke_handler(tauri::generate_handler![
    greet,
    execute_python_script,    // ✓
    list_python_scripts,      // ✓
    save_python_script,       // ✓
    read_python_script,       // ✓
    delete_python_script,     // ✓
    get_python_info,          // ✓
])
```

### 检查前端调用

前端服务 `src/services/PythonService.ts` 正确调用:

```typescript
async listScripts(): Promise<ScriptInfo[]> {
  const scripts = await invoke<ScriptInfo[]>('list_python_scripts');
  return scripts;
}
```

## 📊 调试信息

### 后端编译状态

- ✅ 编译成功 (无错误)
- ⚠️ 有警告 (不影响功能):
  - `std::time::Duration` 未使用
  - 变量 `e` 未使用

### 命令列表

| 命令名称 | 功能 | 状态 |
|---------|------|------|
| `list_python_scripts` | 列出脚本 | ✅ 已注册 |
| `execute_python_script` | 执行脚本 | ✅ 已注册 |
| `save_python_script` | 保存脚本 | ✅ 已注册 |
| `read_python_script` | 读取脚本 | ✅ 已注册 |
| `delete_python_script` | 删除脚本 | ✅ 已注册 |
| `get_python_info` | 获取环境信息 | ✅ 已注册 |

## 🎯 测试步骤

重启应用后,在浏览器控制台应该看到:

```
🔍 开始加载脚本列表...
✅ 脚本列表加载成功: [...]
```

如果看到错误:
```
❌ 加载脚本列表失败: ...
```

查看具体错误信息以进一步诊断。

## 🔧 常见问题

### Q: 重启后仍然报错?

**检查**:
1. 确认后端已重新编译 (`cargo build`)
2. 确认前端已重新加载 (刷新浏览器或重启 `pnpm dev`)
3. 查看浏览器控制台的详细错误信息

### Q: Python 命令找不到?

**检查**:
1. Python 是否已安装?
   ```bash
   python --version
   # 或
   python3 --version
   ```

2. Python 是否在系统 PATH 中?

### Q: 脚本目录不存在?

后端会自动创建以下目录:
- `%AppData%/Workstation/Python/examples/`
- `%AppData%/Workstation/Python/user/`

## 📝 开发建议

### 修复未使用的导入

在 `src-tauri/src/python.rs` 中:

```rust
// 移除未使用的导入
// use std::time::Duration;  // ❌ 删除这行
```

或者如果将来需要超时功能,可以保留并添加 `#[allow(unused_imports)]`

### 添加调试日志

在 Rust 代码中添加日志:

```rust
#[tauri::command]
async fn list_python_scripts(app_handle: tauri::AppHandle) -> Result<Vec<ScriptInfo>, String> {
    println!("🔍 开始列出 Python 脚本...");
    let service = get_python_service(&app_handle)?;
    let scripts = service.list_scripts()?;
    println!("✅ 找到 {} 个脚本", scripts.len());
    Ok(scripts)
}
```

## 🎉 预期结果

重启后,Python 工具应该能够:

1. ✅ 显示 Python 环境信息
2. ✅ 列出 examples 和 user 目录下的脚本
3. ✅ 执行选中的脚本
4. ✅ 显示执行结果和错误信息

## 📞 需要帮助?

如果问题仍然存在,请提供:

1. 浏览器控制台的完整错误信息
2. Tauri 开发服务器的终端输出
3. 应用数据目录路径 (`%AppData%/Workstation/`)
