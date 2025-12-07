# 快速开始：使用 Google Calendar 功能

## 🚀 5 分钟快速配置

### 第 1 步：获取 Google API 凭据

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目（或选择现有项目）
3. 启用 **Google Calendar API**
4. 创建 **OAuth 2.0 客户端 ID**（Web 应用）
   - 添加授权的 JavaScript 来源：`http://localhost:1420`
   - 添加授权的重定向 URI：`http://localhost:1420`
5. 创建 **API 密钥**

📖 详细步骤请参考：[docs/GoogleCalendarSetup.md](./GoogleCalendarSetup.md)

### 第 2 步：配置环境变量

编辑项目根目录的 `.env` 文件：

```env
VITE_GOOGLE_CLIENT_ID=你的客户端ID.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=你的API密钥
```

💡 提示：如果 `.env` 文件不存在，从 `.env.example` 复制一份。

### 第 3 步：重启应用

```bash
# 如果应用正在运行，先停止（Ctrl+C）
pnpm tauri dev
```

### 第 4 步：开始使用

1. 打开应用
2. 进入 **工具** → **日历管理**
3. 点击 **🔐 连接 Google 账号**
4. 在弹出的窗口中登录你的 Google 账号
5. 授予日历访问权限
6. 完成！开始管理你的日历

## ✨ 功能特性

### ✅ 查看事件
- 自动加载未来 3 个月的日历事件
- 显示事件标题、时间、地点、描述
- 实时同步 Google Calendar

### ➕ 创建事件
1. 点击 **➕ 新建事件** 按钮
2. 填写事件信息：
   - **标题**（必填）
   - **开始日期**（必填）
   - 开始/结束时间（可选，不填则为全天事件）
   - 地点、描述等
3. 点击 **✅ 创建事件**

### 🗑️ 删除事件
- 点击事件卡片右上角的 **🗑️** 按钮
- 确认删除

### 🔄 刷新
- 点击 **🔄 刷新** 按钮重新加载事件

### 🚪 登出
- 点击 **🚪 登出** 按钮撤销授权

## 🛡️ 安全说明

### ✅ 安全措施
- OAuth 2.0 标准授权流程
- API 密钥和客户端 ID 通过环境变量管理
- 不存储用户密码
- 访问令牌由浏览器安全存储

### ⚠️ 注意事项
- **不要**将 `.env` 文件提交到 Git
- **不要**在公开场合分享你的 API 密钥
- 定期检查 Google Cloud Console 的 API 使用情况

## ❓ 常见问题

### Q: 提示"初始化 Google API 失败"
**A:** 检查以下几点：
1. 网络连接是否正常
2. `.env` 文件中的配置是否正确
3. API 密钥和客户端 ID 是否有效
4. 打开浏览器开发者工具（F12）查看详细错误

### Q: 授权后无法加载事件
**A:** 可能原因：
1. Google Calendar API 未启用
2. 测试用户未添加到 OAuth 同意屏幕
3. API 配额已用完（罕见）

### Q: 授权窗口被浏览器拦截
**A:** 允许弹窗：
1. 点击地址栏右侧的"弹窗已拦截"图标
2. 选择"始终允许来自 localhost:1420 的弹窗"
3. 重新点击"连接 Google 账号"

### Q: 事件创建后在 Google Calendar 中看不到
**A:** 稍等几秒钟，可能是同步延迟。尝试：
1. 刷新页面
2. 在 Google Calendar 网页版检查
3. 检查时区设置是否正确

## 📊 API 配额

Google Calendar API 免费配额：
- 每天 **1,000,000** 次请求
- 每用户每秒 **10** 次请求

对于个人使用完全足够。可在 [Google Cloud Console](https://console.cloud.google.com/apis/api/calendar-json.googleapis.com/quotas) 查看实时使用情况。

## 🔧 开发者选项

### 查看日志
打开浏览器开发者工具（F12）查看详细日志：
- ✅ API 初始化状态
- 🔐 授权流程
- 📋 事件加载详情
- ❌ 错误信息

### 清除授权
```javascript
// 在浏览器控制台执行
googleCalendarService.revokeAuthorization()
```

### 测试 API 调用
```javascript
// 列出事件
googleCalendarService.listEvents('primary')

// 创建事件
googleCalendarService.createEvent({
  summary: '测试事件',
  start: { dateTime: '2025-10-21T10:00:00', timeZone: 'Asia/Shanghai' },
  end: { dateTime: '2025-10-21T11:00:00', timeZone: 'Asia/Shanghai' }
})
```

## 📚 更多资源

- [配置详细指南](./GoogleCalendarSetup.md)
- [更新说明](./CalendarToolUpdate.md)
- [Google Calendar API 文档](https://developers.google.com/calendar/api)
- [OAuth 2.0 文档](https://developers.google.com/identity/protocols/oauth2)

## 💡 小贴士

1. **首次使用**：OAuth 同意屏幕会显示"此应用未经验证"警告，这是正常的。点击"高级" → "转至xxx（不安全）"继续。

2. **多账号切换**：如果需要切换 Google 账号，先点击"登出"，再重新连接。

3. **离线使用**：当前版本需要网络连接。未来版本将支持本地缓存。

4. **事件限制**：目前加载未来 3 个月的事件（最多 250 个）。

## 🎉 享受使用！

如有任何问题或建议，欢迎反馈！
