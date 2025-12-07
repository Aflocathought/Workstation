# 日历工具更新说明

## 🎉 更新内容

日历工具已从 **Python 后端实现** 迁移到 **前端 Google Calendar API 实现**。

## ✨ 新特性

### 🔄 无需 Python
- ✅ 不再需要安装 Python 和相关依赖包
- ✅ 纯前端实现，更轻量、更快速

### 🔐 标准 OAuth2 授权
- ✅ 使用 Google 标准登录流程
- ✅ 安全的授权机制
- ✅ 一键连接 Google 账号

### 🚀 实时同步
- ✅ 直接与 Google Calendar 交互
- ✅ 实时创建、查看、删除事件
- ✅ 自动加载未来 3 个月的事件

### 💻 更好的用户体验
- ✅ 现代化的 UI 界面
- ✅ 支持全天事件和时间事件
- ✅ 友好的错误提示

## 🔧 配置步骤

### 1. 获取 Google API 凭据

按照 `docs/GoogleCalendarSetup.md` 中的详细说明：

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建项目并启用 Google Calendar API
3. 创建 OAuth 2.0 客户端 ID 和 API 密钥

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的凭据：

```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-api-key
```

### 3. 启动应用

```bash
pnpm tauri dev
```

### 4. 使用日历工具

1. 打开应用中的"工具" → "日历管理"
2. 点击"🔐 连接 Google 账号"按钮
3. 登录你的 Google 账号并授权
4. 开始管理你的日历事件！

## 📝 旧文件备份

为了安全起见，以下文件已被备份：

- `src/Tools/Calendar/CalendarTool_Old.tsx` - 旧的组件实现
- `src/Tools/Calendar/CalendarTool_Old.module.css` - 旧的样式文件
- `src/services/CalendarService.ts` - 旧的后端服务（仍然存在，但不再使用）

你可以在确认新实现工作正常后删除这些文件。

## ⚠️ 注意事项

### API 配额
- Google Calendar API 每天有 1,000,000 次请求限制
- 每用户每秒 10 次请求
- 对于个人使用完全足够

### 安全建议
- ❌ 不要将 `.env` 文件提交到 Git
- ✅ API 密钥和客户端 ID 已添加到 `.gitignore`
- ✅ 使用环境变量管理敏感信息

### 浏览器兼容性
- 需要支持 ES6+ 的现代浏览器
- 推荐使用 Chrome、Firefox、Edge 最新版本

## 🆘 故障排除

### 问题 1：提示"Google API 初始化失败"
**解决方案**：
- 检查网络连接
- 确认 API 密钥和客户端 ID 配置正确
- 查看浏览器控制台的详细错误信息

### 问题 2：授权失败
**解决方案**：
- 确认在 Google Cloud Console 中添加了正确的重定向 URI
- 检查 OAuth 同意屏幕配置
- 确认应用处于"测试"状态并添加了测试用户

### 问题 3：无法加载事件
**解决方案**：
- 确认已成功授权
- 检查 Google Calendar API 是否已启用
- 查看控制台错误信息

## 📚 相关文档

- [Google Calendar API 文档](https://developers.google.com/calendar/api/guides/overview)
- [配置指南](docs/GoogleCalendarSetup.md)
- [OAuth 2.0 文档](https://developers.google.com/identity/protocols/oauth2)

## 🎯 未来计划

- [ ] 添加本地存储支持（IndexedDB）以支持离线查看
- [ ] 支持多日历切换
- [ ] 添加事件提醒功能
- [ ] 支持定期事件
- [ ] 导出为 .ics 文件
- [ ] 日历视图（月视图、周视图）

## 💬 反馈

如有问题或建议，请创建 Issue 或联系开发团队。
