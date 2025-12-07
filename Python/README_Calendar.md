# 日历工具 Python 依赖安装指南

## 📦 依赖说明

日历工具需要以下 Python 包才能正常工作：

### 基础依赖（必需）
- `icalendar>=5.0.0` - 用于创建和管理 .ics 日历文件
- `pytz>=2023.3` - 时区支持

### Gmail 同步依赖（可选）
- `google-auth>=2.23.0`
- `google-auth-oauthlib>=1.1.0`
- `google-auth-httplib2>=0.1.1`
- `google-api-python-client>=2.100.0`

## 🚀 快速安装

### 方法 1：安装基础依赖（仅本地日历功能）

```bash
pip install icalendar pytz
```

### 方法 2：安装完整依赖（包括 Gmail 同步）

```bash
pip install -r Python/requirements-calendar.txt
```

或者在项目根目录下：

```bash
cd Python
pip install -r requirements-calendar.txt
```

## ✅ 验证安装

安装完成后，重启应用并打开日历工具，应该能够：
- ✅ 创建和查看日历事件
- ✅ 删除事件
- ✅ 导出 .ics 文件
- ✅ 同步到 Gmail Calendar（如果安装了 Gmail 依赖）

## ❌ 常见问题

### 问题 1：提示 "缺少依赖" 或 "No module named 'icalendar'"

**解决方法**：
```bash
pip install icalendar pytz
```

### 问题 2：pip 命令不存在

**解决方法**：
- Windows: 使用 `python -m pip install ...`
- 或者重新安装 Python 并勾选 "Add Python to PATH"

### 问题 3：安装后仍然报错

**解决方法**：
1. 确认 Python 版本是否为 3.7+：
   ```bash
   python --version
   ```
2. 尝试升级 pip：
   ```bash
   python -m pip install --upgrade pip
   ```
3. 重启应用

## 📝 Gmail 同步设置

如果要使用 Gmail 同步功能，需要：

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建项目
2. 启用 Google Calendar API
3. 创建 OAuth 2.0 凭证（桌面应用）
4. 下载凭证 JSON 文件
5. 在应用中点击"Gmail 授权"，粘贴凭证内容

详细教程请参考 Google Calendar API 文档。

## 🔧 开发者信息

- 脚本位置：`%APPDATA%/com.tauri-app.Workstation/Python/examples/calendar_manager.py`
- 数据存储：`%APPDATA%/com.tauri-app.Workstation/Calendar/events.ics`
- 日志输出：查看开发者控制台（F12）

## 📖 更多帮助

如果遇到其他问题，请：
1. 查看应用的开发者控制台（F12）的错误信息
2. 检查 Python 脚本的输出
3. 提交 Issue 到项目仓库
