# Google OAuth 凭据配置修复指南

## ⚠️ 问题诊断

你当前获得的凭据类型是 **"installed"**（桌面应用），格式如下：
```json
{
  "installed": {
    "client_id": "....",
    "redirect_uris": ["http://localhost"]
  }
}
```

**这个凭据类型不适用于 Tauri 应用！** 原因：
1. ❌ Tauri 应用使用浏览器环境，需要 Web 应用凭据
2. ❌ `redirect_uris: ["http://localhost"]` 缺少端口号，且不符合 Web OAuth 规范
3. ❌ 桌面应用凭据不支持 `google.accounts.oauth2.initTokenClient()`

## ✅ 正确的解决方案

### 方案一：重新创建 Web 应用凭据（推荐）

#### 步骤 1: 删除错误的凭据
1. 访问 [Google Cloud Console - 凭据](https://console.cloud.google.com/apis/credentials)
2. 找到你刚创建的桌面应用凭据
3. 点击右侧的"删除"图标

#### 步骤 2: 创建 Web 应用 OAuth 客户端 ID
1. 点击 **"创建凭据"** → **"OAuth 客户端 ID"**
2. **应用类型**：选择 **"Web 应用"**（这是关键！）
3. **名称**：输入 `Workstation Web Client`
4. **已获授权的 JavaScript 来源**：
   ```
   http://localhost:1420
   https://tauri.localhost
   ```
5. **已获授权的重定向 URI**：
   ```
   http://localhost:1420
   https://tauri.localhost
   http://localhost:1420/oauth2callback
   ```
6. 点击 **"创建"**
7. **记录下客户端 ID**（格式应该是 `xxxxx.apps.googleusercontent.com`）

#### 步骤 3: 创建 API 密钥
1. 点击 **"创建凭据"** → **"API 密钥"**
2. 复制生成的 API 密钥
3. 点击 **"限制密钥"**
4. 在"API 限制"中选择 **"限制密钥"**
5. 勾选 **"Google Calendar API"**
6. 点击 **"保存"**

#### 步骤 4: 配置应用
在项目根目录创建 `.env` 文件：
```env
VITE_GOOGLE_CLIENT_ID=你的客户端ID.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=你的API密钥
```

### 方案二：使用现有的桌面凭据（不推荐，需修改代码）

如果你坚持使用桌面应用凭据，需要大幅修改代码以支持 OAuth 授权码流程，这会增加复杂性。

**不推荐原因**：
- 需要实现本地 HTTP 服务器接收回调
- 需要手动处理授权码交换
- redirect_uri 必须精确匹配端口号
- 违背了 Tauri 应用的设计理念

## 📋 完整配置检查清单

- [ ] 已删除桌面应用类型的凭据
- [ ] 已创建 **Web 应用** 类型的 OAuth 客户端 ID
- [ ] 已添加正确的 JavaScript 来源：`http://localhost:1420`
- [ ] 已添加正确的重定向 URI：`http://localhost:1420`
- [ ] 已创建 API 密钥
- [ ] 已限制 API 密钥只能访问 Calendar API
- [ ] 已创建 `.env` 文件并填入凭据
- [ ] `.env` 文件已添加到 `.gitignore`

## 🔍 验证凭据格式

### ✅ 正确的 Web 应用凭据
```json
{
  "web": {
    "client_id": "123456789-abcdefgh.apps.googleusercontent.com",
    "project_id": "your-project",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "GOCSPX-...",
    "redirect_uris": ["http://localhost:1420"],
    "javascript_origins": ["http://localhost:1420", "https://tauri.localhost"]
  }
}
```

**注意**：对于前端 OAuth2 隐式流程，你只需要：
- `client_id`（客户端 ID）
- `api_key`（API 密钥）

**不需要** `client_secret`，因为前端无法安全存储密钥。

### ❌ 错误的桌面应用凭据
```json
{
  "installed": {  // ← 错误：应该是 "web"
    "client_id": "...",
    "redirect_uris": ["http://localhost"]  // ← 错误：缺少端口号
  }
}
```

## 🚀 测试配置

完成配置后，测试步骤：

1. **启动应用**：
   ```bash
   pnpm tauri dev
   ```

2. **打开开发者工具**（F12）查看控制台

3. **导航到日历工具**

4. **点击"连接 Google 账号"按钮**

5. **预期结果**：
   - ✅ 弹出 Google 登录窗口
   - ✅ 显示授权请求（Calendar 访问权限）
   - ✅ 授权成功后返回应用
   - ✅ 控制台显示"✅ 授权成功"

6. **如果出错，检查控制台错误信息**：
   - `origin_mismatch` → JavaScript 来源配置错误
   - `redirect_uri_mismatch` → 重定向 URI 配置错误
   - `invalid_client` → 客户端 ID 错误

## 🔐 安全提示

1. **永远不要泄露**：
   - ❌ 客户端密钥（client_secret）- 不过前端用不到
   - ❌ API 密钥（api_key）
   
2. **使用环境变量**：
   ```bash
   # .env 文件
   VITE_GOOGLE_CLIENT_ID=your-id
   VITE_GOOGLE_API_KEY=your-key
   ```

3. **添加到 .gitignore**：
   ```
   .env
   .env.local
   ```

4. **限制 API 密钥**：
   - 只允许 Calendar API
   - 限制 HTTP 引用来源
   - 定期轮换

## 📚 参考资源

- [OAuth 2.0 客户端类型](https://developers.google.com/identity/protocols/oauth2#clienttypes)
- [Web 应用的 OAuth 2.0](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)
- [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview)

## ❓ 常见问题

### Q: 为什么我的凭据是 "installed" 而不是 "web"？
A: 因为你在创建 OAuth 客户端 ID 时选择了错误的应用类型。必须选择 **"Web 应用"**。

### Q: redirect_uris 应该配置什么？
A: 对于开发环境：`http://localhost:1420`（必须包含端口号）

### Q: 我需要 client_secret 吗？
A: 不需要！前端 OAuth2 使用隐式流程或 PKCE 流程，不需要客户端密钥。

### Q: 如何知道配置成功？
A: 当你点击"连接 Google 账号"时，应该弹出标准的 Google 登录/授权界面，而不是报错。

---

**下一步**：完成上述配置后，参考 `CalendarQuickStart.md` 开始使用日历功能。
