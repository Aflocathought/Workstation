# Google Calendar API 配置指南

## 📋 前置要求

1. 拥有 Google 账号
2. 访问 [Google Cloud Console](https://console.cloud.google.com/)

## 🔧 配置步骤

### 1. 创建项目

1. 访问 https://console.cloud.google.com/
2. 点击项目下拉菜单
3. 点击"新建项目"
4. 输入项目名称（例如：Workstation Calendar）
5. 点击"创建"

### 2. 启用 Calendar API

1. 在左侧菜单中选择"API 和服务" → "库"
2. 搜索"Google Calendar API"
3. 点击进入详情页
4. 点击"启用"按钮

### 3. 创建 OAuth 2.0 客户端 ID

1. 在左侧菜单中选择"API 和服务" → "凭据"
2. 点击"创建凭据" → "OAuth 客户端 ID"
3. 如果提示配置 OAuth 同意屏幕：
   - 选择"外部"（个人使用）
   - 填写应用名称（例如：Workstation）
   - 填写用户支持电子邮件
   - 填写开发者联系信息
   - 点击"保存并继续"
   - 在"范围"页面，点击"保存并继续"
   - 在"测试用户"页面，添加你的 Google 账号邮箱
   - 点击"保存并继续"
4. 回到"创建 OAuth 客户端 ID"页面
5. 选择应用类型："Web 应用"
6. 输入名称（例如：Workstation Web Client）
7. 在"已获授权的 JavaScript 来源"中添加：
   - `http://localhost:1420`（开发环境）
   - `https://tauri.localhost`（Tauri 应用）
8. 在"已获授权的重定向 URI"中添加：
   - `http://localhost:1420`
   - `https://tauri.localhost`
9. 点击"创建"
10. 复制生成的**客户端 ID**

### 4. 创建 API 密钥

1. 在"凭据"页面，点击"创建凭据" → "API 密钥"
2. 复制生成的 **API 密钥**
3. （可选）点击"限制密钥"，选择"限制密钥"并只允许 Calendar API

## 🔑 配置应用

### 方法 1：使用环境变量（推荐用于开发）

在项目根目录创建 `.env` 文件：

```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-api-key
```

### 方法 2：直接在代码中配置（仅用于测试）

编辑 `src/services/GoogleCalendarService.ts`：

```typescript
const API_KEY = 'your-api-key';
const CLIENT_ID = 'your-client-id.apps.googleusercontent.com';
```

**⚠️ 注意：不要将 API 密钥提交到公开仓库！**

## ✅ 验证配置

1. 启动应用：`pnpm tauri dev`
2. 打开日历工具
3. 点击"连接 Google 账号"
4. 登录你的 Google 账号
5. 授予日历访问权限
6. 应该能看到"✅ 授权成功"提示

## 🔒 安全最佳实践

1. **不要公开 API 密钥**：使用环境变量，不要提交到 git
2. **限制 API 密钥使用范围**：在 Google Cloud Console 中限制为仅 Calendar API
3. **添加 HTTP 引用来源限制**：限制密钥只能从特定域名使用
4. **定期轮换密钥**：每隔几个月更新一次 API 密钥
5. **监控 API 使用情况**：在 Google Cloud Console 查看 API 调用统计

## 📊 配额限制

Google Calendar API 免费配额：
- 每天 1,000,000 次请求
- 每用户每秒 10 次请求

对于个人使用完全足够。

## ❓ 常见问题

### Q: 提示"客户端 ID 无效"
A: 检查 CLIENT_ID 是否正确复制，包括完整的 `.apps.googleusercontent.com` 后缀

### Q: 提示"重定向 URI 不匹配"
A: 确保在 Google Cloud Console 中添加了正确的重定向 URI

### Q: 无法加载日历
A: 检查是否已启用 Calendar API，并且 API 密钥配置正确

### Q: 授权后立即失效
A: 可能是时区问题或浏览器 cookie 设置问题，尝试清除浏览器缓存

## 📚 更多资源

- [Google Calendar API 文档](https://developers.google.com/calendar/api/guides/overview)
- [OAuth 2.0 文档](https://developers.google.com/identity/protocols/oauth2)
- [API 配额和限制](https://developers.google.com/calendar/api/guides/quota)
