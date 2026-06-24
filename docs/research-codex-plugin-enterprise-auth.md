# 调研报告：CloudBase 企业自有品牌授权 + Codex 插件示例

## 一、概述

本文档调研了以下内容：

> **后续产出**：
> - 示例代码：`examples/cloudbase-auth-endpoint-with-feishu/`（基于参考实现改造）
> - 集成文档：`docs/enterprise-auth-with-feishu.md`（含完整 Mermaid 架构图/时序图）

1. [云开发自有品牌-企业AI平台文档](https://docs.cloudbase.net/quick-start/enterprise-ai-platform-no-cam)
2. [企业自建设备码授权服务对接指南](https://docs.cloudbase.net/cli-v1/device-flow-protocol/integration)
3. 参考实现 [cloudbase-cli-auth-endpoint](https://cnb.cool/tencent/cloud/cloudbase/cloudbase-cli-auth-endpoint) 源码
4. `auth-web-cloudbase` 技能文档（CloudBase Web SDK Auth API）
5. Codex 插件生态系统

目标：设计一个 **以 Codex 为例的插件示例**，实现企业自有域名下的自定义 OAuth 授权流程，采用 **1+N 架构**（1 个管理中心环境 + N 个用户隔离环境）。

---

## 二、文档要点

### 2.1 自有品牌模式（enterprise-ai-platform-no-cam）

**核心价值**：

- 用户无需腾讯云账号，只接触企业自有域名（如 `ai.your-company.com`）
- **可打通企业现有 SSO/LDAP/飞书/企业微信等账号体系**
- **环境隔离**：每个用户拥有独立云开发环境，API Key 绑定到指定环境 ID

**三种凭证方式**：

| 方式 | 适用场景 | 用户感知 | 对接复杂度 |
|------|----------|----------|-----------|
| **API Key** | 平台统一下发，零感知 | 最低 | 低 |
| **自定义授权码** | 用户需主动一次性授权登录 | 中 | 中 |
| **临时密钥 STS** | 服务端控制凭证生命周期 | 较低 | 高 |

> 结论：API Key 方式最适合企业平台直接对接 Coding Agent（如 Codex），但自定义授权码适合需要用户主动确认授权的场景。

### 2.2 设备码授权对接指南

**协议**：遵循 RFC 8628（OAuth 2.0 Device Authorization Grant）

**CLI 对接方式**：

| 方式 | 命令 | 适用场景 |
|------|------|----------|
| 同步登录 | `tcb login` | 用户直接在终端操作 |
| 分步登录 | `tcb login start` + `tcb login complete --session-id <id>` | 聊天工具、OpenClaw、机器人 |

**核心接口**：

| 端点 | 方法 | 用途 |
|------|------|------|
| `/auth/device/code` | POST | 申请设备码，返回 `device_code` + `user_code` |
| `/auth/device/verify` | POST | 用户浏览器确认授权 |
| `/auth/token` | POST | 三种 `grant_type`：`device_code` / `refresh_token` / `revoke_token` |

**CLI 配置**：

```bash
tcb config set customOAuthEndpoint https://auth.your-company.com/auth
tcb login
```

**MCP 环境变量对应**：

```bash
TCB_AUTH_OAUTH_ENDPOINT=https://auth.your-company.com/auth
```

---

## 三、参考实现源码分析：cloudbase-cli-auth-endpoint

### 3.1 项目结构

```
cloudbase-cli-auth-endpoint/
├── docs/protocol.md                    # 协议说明
├── public/cli-auth.html                # 企业自建授权页（浏览器端）
├── src/
│   ├── server.ts                       # HTTP 入口，3 个核心端点
│   ├── config.ts                       # 端口、有效期、STS 时长等
│   ├── types.ts                        # 类型定义
│   └── utils/
│       ├── oauth.ts                    # 设备码/用户码生成 + OAuth 错误
│       ├── sts.ts                      # 调用腾讯云 STS GetFederationToken
│       ├── tcb.ts                      # 查询 envIds / envList / billingInfo
│       ├── device-store.ts             # 过期清理
│       └── public-dir.ts               # 静态目录
├── .env.example
├── package.json
└── tsconfig.json
```

### 3.2 核心流程

**首次登录**：

```
CLI/MCP          企业授权服务        浏览器/用户
  │                   │                  │
  ├── POST /device/code ──►              │
  │◄── device_code, user_code            │
  │                   │                  │
  │                   │   打开授权页 ─────►
  │                   │◄── 输入 user_code │
  │                   │   确认授权        │
  │                   │                  │
  ├─ 轮询 POST /token ──►               │
  │  (grant_type=device_code)            │
  │◄── refreshToken + STS 凭证           │
  │    + 环境列表                        │
```

**续期**：

```
CLI/MCP          企业授权服务
  │                   │
  ├── POST /token ────►
  │  (grant_type=refresh_token)
  │◄── 新 refreshToken + 新 STS 凭证
```

**退出**：

```
CLI/MCP          企业授权服务
  │                   │
  ├── POST /token ────►
  │  (grant_type=revoke_token)
  │◄── 确认
```

### 3.3 关键源码片段

**env 配置（.env.example）**：

```
PORT=3000
BASE_URL=http://localhost:3000
EXPIRES_IN=600
INTERVAL=3
TENCENTCLOUD_SECRET_ID=
TENCENTCLOUD_SECRET_KEY=
STS_TOKEN_DURATION=1800
```

**device-store.ts**（过期清理逻辑）：

```typescript
export function cleanupExpired(deviceStore, userCodeIndex) {
  for (const [key, auth] of deviceStore.entries()) {
    if (now > auth.expiresAt) {
      deviceStore.delete(key);
      userCodeIndex.delete(auth.userCode);
    }
  }
}

export function scheduleExpiry(deviceStore, userCodeIndex, deviceCode, userCode, ttlMs) {
  setTimeout(() => {
    const auth = deviceStore.get(deviceCode);
    if (auth && (auth.status === 'pending' || auth.status === 'authorized')) {
      auth.status = 'expired';
      // 过期后再保留 CONSUMED_TTL_MS 后删除
    }
  }, ttlMs);
}
```

---

## 四、CloudBase Web SDK Auth API（auth-web-cloudbase）

### 4.1 SDK 初始化

```js
import cloudbase from '@cloudbase/js-sdk'

const app = cloudbase.init({
  env: 'your-full-env-id',
  region: 'ap-shanghai',        // 默认
  accessKey: 'publishable key', // SDK 公钥
  auth: { detectSessionInUrl: true },
})

const auth = app.auth({ persistence: 'local' })
```

### 4.2 关键接口

| 方法 | 用途 |
|------|------|
| `signInWithOAuth({ provider })` | OAuth 登录（Google/微信等） |
| `signInWithIdToken({ provider, token })` | 直接使用第三方 JWT/OAuth Token 登录 |
| `signInWithCustomTicket(callback)` | 自定义票据登录 |
| `signInWithPassword({ email/phone/username, password })` | 密码登录 |
| `signInWithOtp({ phone/email })` | 验证码登录 |
| `getSession()` | 获取当前会话（可靠的登录状态检查） |
| `refreshSession()` | 续期会话 |
| `signOut()` | 退出 |
| `onAuthStateChange(callback)` | 监听认证状态变化 |
| `setSession({ refresh_token })` | 手动设置会话（SSR/外部流） |

### 4.3 OAuth 流程

```js
const { data, error } = await auth.signInWithOAuth({ provider: 'google' })
window.location.href = data.url // 跳转到 OAuth 授权页，回调后自动完成
```

### 4.4 本架构中的关键角色

- **管理中心环境** 使用 Web SDK 的 `signInWithCustomTicket` / `signInWithIdToken` 对接飞书
- 用户完成飞书 OAuth → 获取飞书 `id_token` → 通过 `signInWithIdToken` 登录云开发
- 或使用自定义票据流程：飞书 OAuth → 后端颁发自定义 ticket → `signInWithCustomTicket`

---

## 五、Codex 插件生态系统

### 5.1 插件结构

```
my-plugin/
├── .codex-plugin/
│   └── plugin.json          # 插件清单（必需）
├── skills/                   # 可选：技能指令
│   └── my-skill/SKILL.md
├── hooks/                    # 可选：生命周期钩子（hooks.json）
├── .mcp.json                 # 可选：MCP 服务器配置
├── .app.json                 # 可选：应用/连接器映射
└── assets/                   # 可选：图标、截图
```

### 5.2 plugin.json 关键字段

```json
{
  "name": "cloudbase-auth",
  "version": "1.0.0",
  "description": "企业自有品牌授权接入 - 支持飞书/LDAP/SSO",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "CloudBase Auth",
    "shortDescription": "连接你的企业账号到云开发",
    "category": "Authentication",
    "capabilities": ["Read", "Write"],
    "defaultPrompt": [
      "使用企业账号登录云开发环境",
      "通过设备码授权获取云开发访问权限"
    ]
  }
}
```

### 5.3 MCP 配置

```json
{
  "mcp_servers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Codex",
        "TCB_AUTH_OAUTH_ENDPOINT": "<授权服务地址>"
      }
    }
  }
}
```

---

## 六、1+N 架构设计（核心）

### 6.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        企业自有平台                                │
│                                                                  │
│  ┌─────────────────────────┐     ┌──────────────────────────┐   │
│  │   管理中心环境（1）        │     │   用户环境（N）            │   │
│  │                         │     │                          │   │
│  │  CloudBase 环境 A       │     │  CloudBase 环境 1..N     │   │
│  │  ┌───────────────────┐  │     │  ┌────────────────────┐  │   │
│  │  │ 授权服务（云函数）   │  │     │  │ 数据库              │  │   │
│  │  │  - device/code    │  │     │  │ 云函数              │  │   │
│  │  │  - device/verify  │  │     │  │ 文件存储            │  │   │
│  │  │  - token          │  │     │  │ API Key (绑定环境)   │  │   │
│  │  └───────────────────┘  │     │  └────────────────────┘  │   │
│  │                         │     │                          │   │
│  │  ┌───────────────────┐  │     │  资源完全隔离              │   │
│  │  │ 授权页面（静态）    │  │     │                          │   │
│  │  │  - 飞书 SSO        │  │     │  每用户/租户独立环境       │   │
│  │  │  - 企业微信 SSO    │  │     │                          │   │
│  │  │  - LDAP 登录       │  │     └──────────────────────────┘   │
│  │  │  - 用户码确认      │  │                                    │
│  │  └───────────────────┘  │                                    │
│  │                         │                                    │
│  │  ┌───────────────────┐  │                                    │
│  │  │ 环境管理逻辑       │  │                                    │
│  │  │  - CreateEnv      │  │                                    │
│  │  │  - 绑定 API Key   │  │                                    │
│  │  │  - 用户↔环境映射   │  │                                    │
│  │  └───────────────────┘  │                                    │
│  └───────────┬─────────────┘                                    │
│              │                                                   │
│              ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐        │
│  │               Coding Agent (Codex)                    │        │
│  │                                                     │        │
│  │  ┌─────────────────────────────────────────────────┐ │        │
│  │  │ codex-plugin: cloudbase-auth                     │ │        │
│  │  │                                                 │ │        │
│  │  │  .mcp.json → TCB_AUTH_OAUTH_ENDPOINT ───────────►│ │        │
│  │  │  SKILL.md → 分步登录指导                        │ │        │
│  │  └─────────────────────────────────────────────────┘ │        │
│  │                                                     │        │
│  │  1. 安装插件 → 插件自动配置 MCP 环境变量              │        │
│  │  2. 用户执行"链接企业账号" → 设备码流程启动            │        │
│  │  3. 浏览器打开授权页 → 飞书/企业微信 SSO              │        │
│  │  4. 授权完成 → MCP 自动获取 STS/API Key              │        │
│  │  5. 用户开始开发                                     │        │
│  └─────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 完整流程（用户首次使用）

```
阶段 1：管理端部署
┌─────────────────────────────────────────────────────────────┐
│ 企业管理员：                                                │
│ 1. 创建 CloudBase 管理中心环境 A                             │
│ 2. 部署授权服务到环境 A（云函数 + 静态页面）                    │
│ 3. 配置飞书开放平台（获取 App ID / App Secret）               │
│ 4. 配置企业 SSO / LDAP 对接                                  │
│ 5. 配置 API Key（用于创建子环境的权限）                        │
│ 6. 发布 Codex 插件到企业内源 / 私有市场                       │
│ 7. 企业域名绑定：auth.your-company.com → 授权服务            │
└─────────────────────────────────────────────────────────────┘

阶段 2：用户在 Codex 安装
┌─────────────────────────────────────────────────────────────┐
│ Codex 用户：                                                │
│ 1. 编辑 .codex-plugin/marketplace.json                      │
│ 2. 添加企业私有插件源                                       │
│ 3. 安装 cloudbase-auth 插件                                 │
│ 4. 插件自动配置 MCP 环境变量：                               │
│    TCB_AUTH_OAUTH_ENDPOINT = https://auth.your-company.com  │
└─────────────────────────────────────────────────────────────┘

阶段 3：用户首次授权（设备码流程）
┌─────────────────────────────────────────────────────────────┐
│ 用户                        授权服务                       │
│  │                            │                            │
│  │ 1️⃣ 执行"登录企业账号"        │                            │
│  │ ─── POST /auth/device/code ──►                          │
│  │ ◄── { device_code, user_code,                          │
│  │       verification_uri }                                │
│  │                            │                            │
│  │ 2️⃣ 打开授权页              │                            │
│  │    输入 user_code           │                            │
│  │                              │                            │
│  │ 3️⃣ 选择登录方式：           │                            │
│  │    ┌─────────────────┐      │                            │
│  │    │ [飞书登录]       │      │                            │
│  │    │ [企业微信登录]   │      │                            │
│  │    │ [LDAP 登录]     │      │                            │
│  │    │ [企业邮箱验证码]  │      │                            │
│  │    └─────────────────┘      │                            │
│  │                              │                            │
│  │ 4️⃣ 飞书扫码 → 飞书回调      │                            │
│  │    → 授权服务验证身份        │                            │
│  │    → POST /auth/device/verify                            │
│  │      { user_code }                                      │
│  │    → 状态: pending → authorized                          │
│  │                              │                            │
│  │ 5️⃣（首次登录自动创建环境）    │                            │
│  │    → 查询用户是否已有环境      │                            │
│  │    → 无 → CreateEnv(用户A)   │                            │
│  │    → 创建 API Key for 环境   │                            │
│  │    → 保存用户↔环境映射        │                            │
│  │                              │                            │
│  │ 6️⃣ MCP 轮询 POST /auth/token─►                           │
│  │    (grant_type=device_code)  │                            │
│  │ ◄── { refreshToken,         │                            │
│  │       stsCredentials,       │                            │
│  │       envList | apiKey }     │                            │
│  │                              │                            │
│  │ 7️⃣ ✅ 授权完成，开始开发      │                            │
└─────────────────────────────────────────────────────────────┘

阶段 4：后续使用（续期）
┌─────────────────────────────────────────────────────────────┐
│ MCP 定期刷新：                                              │
│ 1. POST /auth/token (grant_type=refresh_token)              │
│ 2. 服务端验证 refreshToken 有效性                            │
│ 3. Token Rotation：发新 refreshToken + 新临时凭证           │
│ 4. MCP 保存新凭证                                           │
└─────────────────────────────────────────────────────────────┘

阶段 5：退出
┌─────────────────────────────────────────────────────────────┐
│ 1. 用户执行"断开企业账号"                                    │
│ 2. MCP → POST /auth/token (grant_type=revoke_token)         │
│ 3. 服务端使 refreshToken 失效                                │
│ 4. MCP 清除本地凭证                                          │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 管理中心环境 vs 用户环境

| 维度 | 管理中心环境 (1) | 用户环境 (N) |
|------|-----------------|-------------|
| 用途 | 授权服务、用户管理、环境创建 | 用户的开发/生产资源 |
| 部署的服务 | 授权 API + 授权页面 + 管理后台 | 用户业务代码 + 数据 |
| 凭证 | 主账号 API Key（可创建子环境） | API Key（仅限该环境） |
| 权限范围 | `tcb:*`（管理面） | 按环境隔离，最小权限 |
| 用户感知 | 不可见 | 可见（用户认为这是"我的环境"） |
| 生命周期 | 企业创建，长期稳定 | 用户启用时创建，销毁时回收 |
| 可见域名 | `auth.your-company.com` | `<env-id>.your-company.com` |

### 6.4 飞书集成方案

**方案 A：飞书作为 OAuth 身份源（推荐）**

在授权页面中嵌入飞书登录：

```
授权页 (auth.your-company.com)
┌─────────────────────────────┐
│                             │
│   企业 AI 开发平台           │
│                             │
│   请输入设备码：             │
│   [___________]             │
│                             │
│   或选择登录方式：           │
│                             │
│   ┌─────────────────────┐   │
│   │  [飞书扫码登录]      │   │
│   └─────────────────────┘   │
│                             │
│   ┌─────────────────────┐   │
│   │  [企业微信登录]      │   │
│   └─────────────────────┘   │
│                             │
│   ┌─────────────────────┐   │
│   │  [LDAP 账号登录]     │   │
│   └─────────────────────┘   │
└─────────────────────────────┘
```

**授权服务内部流程（飞书）**：

```
用户点击"飞书登录"
  → 跳转飞书 OAuth 授权页
    → 用户扫码确认
      → 飞书回调到授权服务
        → 授权服务获取 access_token + 用户信息
          → 验证用户身份
            → 映射到 CloudBase 用户
              → 标记 device_code 为 authorized
```

**方案 B：飞书机器人 + 分步登录**

适用于飞书群聊中直接使用 Codex 的场景（通过 `cc-connect` 桥接）：

```
飞书群聊
  ↓ 用户发消息："帮我写一个云函数"
  ↓
cc-connect（桥接层）
  ↓
Codex CLI
  ↓ 检测未登录 → 执行 tcb login start
  ↓
获取 sessionId + 授权页 URL
  ↓ 返回给飞书用户
  ↓
用户点击链接完成授权
  ↓
Codex CLI 执行 tcb login complete --session-id <id>
  ↓ 登录成功 → 执行用户请求
```

---

## 七、Codex 插件示例设计（cloudbase-auth）

### 7.1 插件目录结构

```
cloudbase-auth-plugin/
├── .codex-plugin/
│   └── plugin.json              # 插件清单
├── skills/
│   └── cloudbase-auth/
│       └── SKILL.md             # 技能：引导用户完成配置和登录
├── .mcp.json                    # MCP 服务器预配置（含授权端点模板）
├── assets/
│   ├── icon.png                 # 插件图标
│   └── screenshot.png           # 截图
├── README.md                    # 插件使用说明
└── package.json                 # 插件元信息
```

### 7.2 插件配置设计

**plugin.json**：

```json
{
  "name": "cloudbase-auth",
  "version": "1.0.0",
  "description": "CloudBase 企业自有品牌授权接入 - 支持飞书/LDAP/SSO 等企业身份源对接",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "CloudBase Auth",
    "shortDescription": "连接你的企业账号到云开发环境",
    "longDescription": "通过企业自建授权服务，用户可使用飞书/企业微信/LDAP/SSO 等企业账号登录云开发，无需腾讯云账号即可使用全部云开发能力",
    "developerName": "CloudBase Team",
    "category": "Authentication",
    "capabilities": ["Read", "Write"],
    "defaultPrompt": [
      "使用企业账号登录云开发环境",
      "通过设备码授权获取云开发访问权限"
    ]
  },
  "activation": {
    "onActivate": ["cloudbase-auth:login-greeting"]
  }
}
```

**.mcp.json**：

```json
{
  "mcp_servers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Codex",
        "TCB_AUTH_OAUTH_ENDPOINT": "{{AUTH_ENDPOINT}}"
      }
    }
  }
}
```

### 7.3 技能设计（SKILL.md）

SKILL.md 应覆盖两个层面：

**层面 1：平台管理员**（一次性配置）

1. 部署授权服务到 CloudBase 环境
   - 在 CloudBase 控制台创建管理中心环境
   - 从模板部署授权服务（云函数 + 静态页面）
   - 配置 `TENCENTCLOUD_SECRET_ID` / `SECRET_KEY`
   - 配置 STS 策略、Token 有效期等

2. 配置飞书/企业微信 OAuth
   - 在飞书开放平台创建应用
   - 获取 App ID / App Secret
   - 配置回调 URL
   - 测试飞书登录

3. 发布插件
   - 配置 `TCB_AUTH_OAUTH_ENDPOINT`
   - 发布到企业内源

**层面 2：Codex 最终用户**（重复操作）

1. 安装插件（自动配置 MCP）
2. 执行设备码授权
3. 浏览器完成认证（选择飞书/SSO 等方式）
4. 开始使用开发能力

### 7.4 授权服务部署模板（基于 cloudbase-cli-auth-endpoint 扩展）

需要新增/改造的点：

| 模块 | 扩展内容 |
|------|----------|
| `server.ts` | 新增 `/auth/feishu/oauth`、`/auth/feishu/callback` 端点 |
| `server.ts` | 新增 `POST /auth/environments` 管理环境创建 |
| `cli-auth.html` | 增设飞书/企业微信/LDAP 登录按钮 |
| `tcb.ts` | 新增 `createEnv()`、`createApiKey()`、`bindApiKey()` |
| `oauth.ts` | 新增飞书 Token 验证、用户信息提取 |
| 新增 `env-manager.ts` | 新用户首次登录自动创建环境 |

### 7.5 飞书 OAuth 集成关键代码

```typescript
// 飞书 OAuth 回调处理
app.get('/auth/feishu/callback', async (req, res) => {
  const { code } = req.query;
  
  // 1. 用授权码换取飞书 access_token
  const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    body: JSON.stringify({ app_id, app_secret }),
  });
  const { tenant_access_token } = await tokenRes.json();
  
  // 2. 通过 code 获取用户信息
  const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tenant_access_token}` },
    body: JSON.stringify({ code, grant_type: 'authorization_code' }),
  });
  const userInfo = await userRes.json();
  const feishuUserId = userInfo.data.user_id;
  
  // 3. 通过飞书 user_id 查找/创建 CloudBase 用户
  const envId = await getOrCreateUserEnv(feishuUserId);
  
  // 4. 标记设备码为 authorized
  const deviceRecord = findDeviceByUser(feishuUserId);
  deviceRecord.status = 'authorized';
  deviceRecord.envId = envId;
  
  res.redirect(`${deviceRecord.verificationUri}?status=success`);
});
```

### 7.6 MCP 对接改造

`@cloudbase/cloudbase-mcp` 需要支持 `TCB_AUTH_OAUTH_ENDPOINT` 环境变量，使其运行逻辑：

1. 初始化时检查 `TCB_AUTH_OAUTH_ENDPOINT`
2. 若存在，执行设备码授权流程（分步登录模式适合 IDE 场景）
3. 轮询 `/auth/token` 获取凭证
4. 支持续期和退出
5. 本地保存 `refreshToken` 以实现会话持久化

---

## 八、扩展方向与注意事项

### 8.1 生产环境必须改造的点

| 序号 | 改造项 | 原因 |
|------|--------|------|
| 1 | 内存存储 → Redis/数据库 | 服务重启后设备码/refreshToken 丢失 |
| 2 | STS 策略 `tcb:*` → 最小权限 | 安全隔离，按用户/环境收敛 |
| 3 | 浏览器简化用户信息 → 企业 SSO/IdP/审批流 | 对接真实身份源 |
| 4 | 补齐审计、限流、告警、可观测性 | 生产安全要求 |
| 5 | 环境自动创建 → 首登 CreateEnv | 参考实现目前没有自动创建环境逻辑 |

### 8.2 权限策略模板（来自文档）

```json
{
  "version": "2.0",
  "statement": [
    { "effect": "allow", "action": "tcb:DescribeEnvs", "resource": "*" },
    { "effect": "allow", "action": "tcb:CheckWhetherEnvServiceAvailable", "resource": "*" },
    { "effect": "allow", "action": "tcb:DescribeEnvFreeLimit", "resource": "*" },
    { "effect": "allow", "action": "tcb:DescribeBillingInfo", "resource": "*" },
    { "effect": "allow", "action": "tcbr:DescribeServerlessIngress", "resource": "*" },
    { "effect": "allow", "action": "tcb:*", "resource": "qcs::tcb:ap-shanghai:uid/12345:env/${envId}/*" }
  ]
}
```

### 8.3 改造参考实现需要关注的代码点

```
cloudbase-cli-auth-endpoint/src/
├── server.ts
│   ├── POST /auth/device/code              # OK，保持
│   ├── POST /auth/device/verify            # OK，保持
│   ├── POST /auth/token                    # OK，保持
│   └── NEW: GET /auth/feishu/callback      # 新增飞书回调
│   └── NEW: POST /auth/environments        # 新增环境管理
│
├── utils/tcb.ts
│   ├── listEnvs(userUin)                   # OK，保持
│   └── NEW: createEnv(name)                # 新增
│   └── NEW: createApiKey(envId)            # 新增
│
├── utils/oauth.ts
│   └── NEW: verifyFeishuToken(code)        # 新增飞书 token 验证
│
└── public/cli-auth.html
    ├── 输入 user_code 确认                  # OK，保持
    └── NEW: 飞书/企业微信/LDAP 登录按钮      # 新增多身份源入口
```

---

## 九、总结

### 完整技术栈

| 层次 | 技术选择 | 说明 |
|------|----------|------|
| 前端 IDE | Codex | 腾讯 AI Coding Agent |
| 插件系统 | `.codex-plugin/plugin.json` + `.mcp.json` | 插件 + MCP 预配置 |
| MCP 服务器 | `@cloudbase/cloudbase-mcp` | 支持 `TCB_AUTH_OAUTH_ENDPOINT` |
| 授权协议 | RFC 8628 设备码授权 | 适配 CLI/MCP 的无头认证 |
| 授权服务 | 基于 `cloudbase-cli-auth-endpoint` 扩展 | CloudBase 云函数部署 |
| 身份源 | 飞书 / 企业微信 / LDAP / SSO | 企业自选 |
| 凭证类型 | API Key（推荐）/ STS 临时密钥 | 按场景选择 |
| 运行时 | CloudBase 云开发（CloudRun） | 全托管，无需运维 |

### 核心优势

1. **用户完全无感知**腾讯云存在，只用企业自有域名
2. **对接企业现有账号体系**，无需创建额外账号
3. **1+N 环境隔离**，安全合规
4. **Codex MCP 原生对接**，无需额外适配
5. **飞书/企业微信/SSO 三选一或全支持**，灵活扩展
