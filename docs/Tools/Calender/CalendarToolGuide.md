# 日历管理工具使用指南

## 📅 功能特性

- ✅ 创建、查看、删除日历事件
- ✅ 生成标准 .ics 文件（兼容所有日历应用）
- ✅ 同步到 Gmail Calendar
- ✅ OAuth2 安全授权
- ✅ 简洁易用的界面

## 🚀 快速开始

### 1. 安装 Python 依赖

首次使用需要安装 Python 依赖库：

```bash
# 安装日历管理所需的依赖
pip install -r Python/requirements-calendar.txt
```

或手动安装：

```bash
pip install icalendar pytz google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
```

### 2. 打开日历工具

1. 启动 Workstation 应用
2. 点击左侧导航栏的 **工具** (🔧)
3. 在工具列表中选择 **日历管理** (📅)

### 3. 创建第一个事件

1. 点击 **➕ 添加事件** 按钮
2. 填写事件信息：
   - **标题**：必填，事件名称
   - **开始时间**：必填，事件开始时间
   - **结束时间**：可选，默认为开始时间 + 1小时
   - **地点**：可选
   - **描述**：可选，事件详细说明
3. 点击 **创建事件**

## 📤 导出 .ics 文件

点击工具栏的 **📥 导出 .ics** 按钮，日历文件将保存到：

```
%APPDATA%\Workstation\Calendar\events.ics
```

你可以：
- 用 Outlook、Apple Calendar、Google Calendar 等导入此文件
- 分享给他人
- 备份日程数据

## ☁️ 同步到 Gmail Calendar

### 步骤 1：获取 Gmail OAuth2 凭证

1. 访问 [Google Cloud Console](https://console.cloud.google.com)
2. 创建新项目或选择现有项目
3. 启用 **Google Calendar API**：
   - 左侧菜单 → API 和服务 → 库
   - 搜索 "Google Calendar API"
   - 点击启用
4. 创建 OAuth 2.0 客户端 ID：
   - 左侧菜单 → API 和服务 → 凭据
   - 点击 "创建凭据" → "OAuth 客户端 ID"
   - 应用类型选择 **桌面应用**
   - 填写名称（例如 "Workstation Calendar"）
   - 点击创建
5. 下载 JSON 凭证文件

### 步骤 2：在 Workstation 中配置

1. 在日历工具中，点击 **🔑 Gmail 授权** 按钮
2. 打开下载的 JSON 文件，复制全部内容
3. 粘贴到弹出的文本框中
4. 点击 **保存凭证**

### 步骤 3：同步事件

1. 点击 **☁️ 同步到 Gmail** 按钮
2. 首次同步会打开浏览器进行 OAuth 授权：
   - 选择你的 Google 账号
   - 点击"允许"授予日历访问权限
3. 授权成功后，所有事件将自动同步到 Gmail Calendar

## 🔧 高级用法

### 命令行方式（适用于自动化脚本）

```bash
cd Python/examples

# 创建事件
python calendar_manager.py create "团队会议" "2025-10-20T14:00:00" "2025-10-20T15:00:00" "讨论项目进度" "会议室A"

# 列出所有事件
python calendar_manager.py list

# 列出特定日期范围的事件
python calendar_manager.py list "2025-10-01T00:00:00" "2025-10-31T23:59:59"

# 删除事件
python calendar_manager.py delete <event_uid>

# 导出 .ics
python calendar_manager.py export /path/to/output.ics

# 同步到 Gmail
python calendar_manager.py sync

# 保存 Gmail 凭证
python calendar_manager.py auth '{"installed":{"client_id":"..."}}'
```

### 数据存储位置

所有日历数据存储在：

```
%APPDATA%\Workstation\Calendar\
  ├── events.ics              # 主日历文件
  ├── gmail_credentials.json  # Gmail OAuth2 凭证
  └── gmail_token.json        # OAuth2 令牌（自动生成）
```

## ❓ 常见问题

### Q: Python 依赖安装失败？

**A**: 确保已安装 Python 3.7 或更高版本，然后：

```bash
python -m pip install --upgrade pip
pip install -r Python/requirements-calendar.txt
```

### Q: Gmail 同步失败，提示"未找到凭证文件"？

**A**: 请先完成 "Gmail OAuth2 凭证" 配置步骤，保存凭证后再同步。

### Q: OAuth 授权浏览器无法打开？

**A**: 检查防火墙设置，确保 Python 可以打开本地 HTTP 服务器（默认端口 8080-8090）。

### Q: 如何在多台设备间同步？

**A**: 
1. 方案一：使用 Gmail Calendar 同步功能，所有设备同步到同一个 Google 账号
2. 方案二：手动复制 `%APPDATA%\Workstation\Calendar\events.ics` 文件到其他设备

### Q: 支持其他日历服务（如 Outlook、iCloud）吗？

**A**: 
- ✅ 导出的 .ics 文件可以导入任何日历应用
- ❌ 目前仅支持自动同步到 Gmail
- 未来版本将支持更多服务

## 🎯 使用技巧

1. **批量创建事件**：可以编写 Python 脚本调用 calendar_manager.py 批量导入
2. **定期备份**：使用"导出 .ics"功能定期备份日程
3. **团队协作**：分享 .ics 文件给团队成员导入
4. **自动化提醒**：结合 Gmail Calendar 的通知功能接收提醒

## 📝 示例场景

### 场景 1：工作日程管理

```python
# 创建每日站会
python calendar_manager.py create "每日站会" "2025-10-20T09:30:00" "2025-10-20T09:45:00" "同步进度" "视频会议"

# 创建项目截止日期
python calendar_manager.py create "项目截止" "2025-10-31T18:00:00" "2025-10-31T18:00:00" "提交最终版本"
```

### 场景 2：个人生活安排

```python
# 创建生日提醒
python calendar_manager.py create "妈妈生日" "2025-11-15T00:00:00" "2025-11-15T23:59:59" "准备礼物"

# 创建健身计划
python calendar_manager.py create "健身房" "2025-10-20T19:00:00" "2025-10-20T20:30:00" "力量训练"
```

## 🔄 更新日志

### v1.0.0 (2025-10-19)
- ✅ 初始版本发布
- ✅ 支持创建、查看、删除事件
- ✅ 支持导出 .ics 文件
- ✅ 支持同步到 Gmail Calendar
- ✅ OAuth2 安全授权

---

**需要帮助？** 查看 [Python 脚本源码](../../Python/examples/calendar_manager.py) 或提交 Issue。
