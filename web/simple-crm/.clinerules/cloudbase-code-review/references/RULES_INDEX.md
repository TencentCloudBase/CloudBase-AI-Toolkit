# Rule Index Matrix

Rules are extracted from CloudBase skill documentation. Each rule has a unique ID, module, severity, and applicable frontends.

## Rule inclusion boundary

Only add rules that are backed by stable SDK/API documentation, repeated evaluation failures, or deterministic runtime behavior. Do not add a hard rule from one trace's workaround alone; record those as attribution observations until independently verified.

## Cartesian Product: Module × Frontend → Applicable Rules

| Module | Web | MiniProgram | Node.js | CloudRun |
|--------|-----|-------------|---------|----------|
| auth | AUTH-WEB-001~019, AUTH-TOOL-001~014 | AUTH-WX-001~011, AUTH-TOOL-001~014 | AUTH-NODE-001~014, AUTH-TOOL-001~014 | AUTH-NODE-001~014, AUTH-TOOL-001~014 |
| nosql | NOSQL-001~016 | NOSQL-MP-001~005, NOSQL-004~016 inter | — | — |
| relational-database | RDB-WEB-001~005, RDB-TOOL-001~008 | — | RDB-TOOL-001~008 | RDB-TOOL-001~008 |
| storage | STO-001~007 | — | — | — |
| data-model | — | — | DM-001~007 | DM-001~007 |

---

## Module: auth

### Web (AUTH-WEB-)

| Rule ID | Severity | Check | Description |
|---------|----------|-------|-------------|
| AUTH-WEB-001 | error | LLM | 禁止用云函数登录逻辑替代内置 Web Auth |
| AUTH-WEB-002 | error | LLM | 禁止在 Flutter/React Native/原生中复用 Web Auth |
| AUTH-WEB-003 | warning | LLM | 创建 auth 辅助函数后必须接入现有表单处理器 |
| AUTH-WEB-004 | error | lint | 用户名账号禁止使用 signInWithEmailAndPassword/SignUpWithEmailAndPassword |
| AUTH-WEB-005 | error | lint | 用户名输入框不得保留 type="email" |
| AUTH-WEB-006 | error | LLM | 必须先 queryAppAuth 确认 provider 已启用，再写登录代码 |
| AUTH-WEB-007 | error | lint | 禁止用 auth.getUser() / getLoginState() 做路由守卫判断 |
| AUTH-WEB-008 | error | lint | 必须用 auth.getSession() 做路由守卫（data.session === undefined 判断） |
| AUTH-WEB-009 | warning | LLM | 匿名登录默认禁用；accessKey 自动创建匿名 session |
| AUTH-WEB-010 | error | lint | 禁止把 accessKey 设为 envId 或占位符字符串 |
| AUTH-WEB-011 | error | lint | auth 方法返回 { data, error }，必须先检查 error |
| AUTH-WEB-012 | error | lint | 禁止使用已废弃的 auth.getLoginState() |
| AUTH-WEB-013 | error | lint | 禁止使用旧 Web Auth API（hasLoginState/getCurrentUser/toDefaultLoginPage） |
| AUTH-WEB-013 | warning | LLM | 用户名注册必须 5-24 字符（字母/数字/下划线） |
| AUTH-WEB-014 | error | LLM | 用户名字符串禁止使用邮箱 OTP 或手机 OTP |
| AUTH-WEB-015 | warning | lint | OTP 验证是 signInWithOtp 返回的 data 上的回调，非独立调用 |
| AUTH-WEB-016 | warning | lint | signInWithOtp({ phone }) 使用 phone 字段非 phone_number |
| AUTH-WEB-017 | warning | lint | 现代 Web 项目必须用 npm install @cloudbase/js-sdk，非 CDN |
| AUTH-WEB-018 | error | lint | 匿名用户 session 也需拒绝（检查 is_anonymous） |
| AUTH-WEB-019 | warning | LLM | SDK 调用必须接入已有 UI 处理器 |

### Auth Provider 配置 (AUTH-TOOL-, 跨所有前端)

| Rule ID | Severity | Check | Applies to | Description |
|---------|----------|-------|-----------|-------------|
| AUTH-TOOL-001 | error | LLM | Web, MP, Node, CR | 禁止在启用 provider 之前编写登录 UI |
| AUTH-TOOL-002 | warning | LLM | Web, MP, Node, CR | 禁止把"auth"的任意提及都当作 provider-management 任务 |
| AUTH-TOOL-003 | error | lint | Web, Node | 禁止在云函数中实现 Web 登录逻辑 |
| AUTH-TOOL-004 | error | LLM | Web, Node | 禁止将原生 App 认证路由到 Web SDK |
| AUTH-TOOL-005 | error | LLM | Web, MP, Node, CR | 配置/代码改动前必须遵循 Change Safety Protocol |
| AUTH-TOOL-006 | warning | LLM | Web | 确认 provider 后必须回前端完成用户流，不要循环查询 |
| AUTH-TOOL-007 | error | LLM | Web, MP, Node, CR | MCP auth 与 queryAppAuth/manageAppAuth 是两个独立域 |
| AUTH-TOOL-008 | error | LLM | Web, MP, Node, CR | 禁止将应用侧 provider 配置路由到 MCP auth 工具 |
| AUTH-TOOL-009 | error | lint | Web, MP, Node, CR | 禁止使用 lowcode/DescribeLoginStrategy/ModifyLoginStrategy |
| AUTH-TOOL-010 | error | lint | Web | 用户名禁止路由到 email-only 辅助函数 |
| AUTH-TOOL-011 | error | LLM | Web, MP, Node, CR | EnvId 是环境 ID，不是 publishable key |
| AUTH-TOOL-012 | error | LLM | Web, MP, Node, CR | 环境别名必须通过 envQuery 解析为规范 EnvId |
| AUTH-TOOL-013 | warning | LLM | Web, MP, Node, CR | 匿名登录默认禁用 |
| AUTH-TOOL-014 | warning | LLM | Web, MP, Node, CR | 匿名用户调用 AI 模型需显式授权 |

### Node.js (AUTH-NODE-)

| Rule ID | Severity | Check | Applies to | Description |
|---------|----------|-------|-----------|-------------|
| AUTH-NODE-001 | warning | LLM | Node | 禁止爬取原始 HTTP 示例当 Node SDK 已覆盖时 |
| AUTH-NODE-002 | error | lint | Node, CR | SDK 初始化必须使用规范模式（tcb.init → app.auth()） |
| AUTH-NODE-003 | warning | LLM | Node, CR | 不在文档中的方法视为可疑 |
| AUTH-NODE-004 | error | lint | Node, CR, MP | 禁止仅凭 openId/appId 做授权决策 |
| AUTH-NODE-005 | error | lint | Node, Web | 禁止将 tcb_custom_login.json 打包到前端代码 |
| AUTH-NODE-006 | warning | LLM | Node, CR | customUserId 必须 4-32 字符 |
| AUTH-NODE-007 | error | LLM | Node, CR | 禁止对不同用户复用同一 customUserId |
| AUTH-NODE-008 | error | LLM | Node, CR | tcb_custom_login.json 必须像私钥一样保护 |
| AUTH-NODE-009 | error | LLM | Node, Web, CR | ticket 签发必须使用 HTTPS + 认证 |
| AUTH-NODE-010 | error | lint | Node, CR | auth.* 调用必须包裹在 try/catch |
| AUTH-NODE-011 | error | lint | Node, CR | 禁止将 getEndUserInfo 原始结果直接暴露给客户端 |
| AUTH-NODE-012 | warning | LLM | Node, CR | 优先用 uid 查用户，仅在必要时用 queryUserInfo |
| AUTH-NODE-013 | warning | LLM | Node, CR | platformId 必须使用注册时的精确格式 |
| AUTH-NODE-014 | error | LLM | Node, CR | ticket 只在用户自身认证成功后签发 |

### MiniProgram (AUTH-WX-)

| Rule ID | Severity | Check | Description |
|---------|----------|-------|-------------|
| AUTH-WX-001 | error | lint | 禁止为 wx.cloud 小程序生成 Web 风格登录页 |
| AUTH-WX-002 | error | LLM | 禁止将小程序 auth 当作 provider-configuration 问题 |
| AUTH-WX-003 | error | lint | 云函数中直接使用 cloud.getWXContext() 获取调用者身份 |
| AUTH-WX-004 | error | lint | 云函数必须使用 cloud.DYNAMIC_CURRENT_ENV |
| AUTH-WX-005 | error | LLM | 禁止将 OPENID 暴露给其他用户 |
| AUTH-WX-006 | error | lint | 小程序 auth 不需要显式登录 API 调用 |
| AUTH-WX-007 | error | lint | 云函数必须用 wx-server-sdk，客户端用 wx.cloud |
| AUTH-WX-008 | warning | lint | UNIONID 仅绑定微信开放平台后才可用，需处理 undefined |
| AUTH-WX-009 | info | LLM | OPENID/APPID/UNIONID 已微信验证，不需要额外验证 |
| AUTH-WX-010 | error | lint | app.js 的 onLaunch 中必须 wx.cloud.init |
| AUTH-WX-011 | error | lint | 禁止为小程序用户生成 Web 风格 OAuth 流 |

---

## Module: nosql

### Web (NOSQL-)

| Rule ID | Severity | Check | Description |
|---------|----------|-------|-------------|
| NOSQL-001 | error | lint | 禁止在浏览器中使用 wx.cloud.database() 或 Node SDK |
| NOSQL-002 | error | lint | 禁止动态 import 懒加载初始化 CloudBase |
| NOSQL-003 | error | LLM | 安全规则是验证器，不是过滤器 |
| NOSQL-004 | error | lint | 禁止手动传入 _openid 到 data 参数 |
| NOSQL-005 | warning | LLM | CUSTOM 规则变更需要 2-5 分钟传播 |
| NOSQL-006 | error | lint | .add() 返回值中文档 ID 在 result._id |
| NOSQL-007 | error | lint | 写入必须检查 result.updated/result.deleted |
| NOSQL-008 | error | LLM | CMS 角色区分必须用 CUSTOM 规则 |
| NOSQL-009 | error | lint | get() 语法：点号在括号外（get('...').role） |
| NOSQL-010 | warning | lint | CUSTOM 规则表达式 ≤1024 字符，get() ≤3 次 |
| NOSQL-011 | error | LLM | ADMINWRITE 前端只能读 |
| NOSQL-012 | warning | LLM | 全局数据权限必须通过云函数实现 |
| NOSQL-013 | warning | LLM | READONLY 允许匿名读，但新环境默认禁用匿名登录 |
| NOSQL-014 | warning | lint | 嵌套字段更新必须用点号表示法 |
| NOSQL-015 | error | LLM | .doc(authorId).update() 对非 _id 字段不可用 |
| NOSQL-016 | warning | LLM | get('database.user_roles.'+auth.uid) 仅 _id=uid 时有效 |

### MiniProgram (NOSQL-MP-)

| Rule ID | Severity | Check | Description |
|---------|----------|-------|-------------|
| NOSQL-MP-001 | error | lint | 禁止复制 Web SDK 代码到小程序；必须用 wx.cloud.database() |
| NOSQL-MP-002 | error | lint | 禁止手动设置 _openid |
| NOSQL-MP-003 | warning | LLM | 小程序内置身份不意味着可忽略安全规则 |
| NOSQL-MP-004 | warning | LLM | 全局权限必须走云函数 |
| NOSQL-MP-005 | error | lint | 小程序安全规则用 auth.openid/doc._openid，非 auth.uid |

---

## Module: relational-database

### Web (RDB-WEB-)

| Rule ID | Severity | Check | Description |
|---------|----------|-------|-------------|
| RDB-WEB-001 | error | lint | 必须使用 app.rdb()，不能把 app 当关系型数据库客户端 |
| RDB-WEB-002 | error | lint | 禁止在每个组件中重新初始化 CloudBase |
| RDB-WEB-003 | error | lint | 禁止懒加载或发明不支持的 init 参数 |
| RDB-WEB-004 | error | LLM | schema 变更/管理员操作必须走 MCP 工具 |
| RDB-WEB-005 | info | lint | rdb() 查询模式：.from().select()/.insert()/.update()/.delete() |

### PG CMS application review (PG-CR-)

| Rule ID | Severity | Check | Description |
|---------|----------|-------|-------------|
| PG-CR001 | error | lint | PG 表必须显式创建（CREATE TABLE）|
| PG-CR002 | error | LLM | RLS 策略不能只开启不配置 |
| PG-CR003 | warning | lint | PG Web 文件/图片上传需要 CloudBase 存储配置 |
| PG-CR004 | mixed | lint/LLM | PG Web 文件/图片上传推荐 app.storage.from("bucket").upload("key", file)；app.storage() 为错误 |
| PG-CR005 | error | lint/LLM | PG 模式下存储上传必须配置 storage.objects RLS |

### All (RDB-TOOL-, 管理端)

| Rule ID | Severity | Check | Applies to | Description |
|---------|----------|-------|-----------|-------------|
| RDB-TOOL-001 | error | lint | Node, CR | MCP 上下文不要初始化 SDK，必须用 MCP 工具 |
| RDB-TOOL-002 | error | lint | Node, CR | 写操作前先检查 MySQL 是否就绪 |
| RDB-TOOL-003 | error | lint | Node, CR | 新表必须包含 _openid 列 |
| RDB-TOOL-004 | error | lint | Node, CR | 建表后必须审查权限 |
| RDB-TOOL-005 | error | lint | Node, CR | 销毁 MySQL 需确认 |
| RDB-TOOL-006 | warning | LLM | Node, CR | 破坏性操作前先总结 |
| RDB-TOOL-007 | info | lint | Node, CR | 预配/销毁用不同查询接口 |
| RDB-TOOL-008 | error | lint | Node, CR | 旧 security rule 工具已移除 |

---

## Module: storage (Web)

| Rule ID | Severity | Check | Description |
|---------|----------|-------|-------------|
| STO-001 | error | lint | 上传前必须配置安全域名（精确 host:port）|
| STO-002 | error | lint | 禁止拼接 URL 伪造公开链接；必须用 getTempFileURL() |
| STO-003 | warning | LLM | 临时 URL 有有效期，非永久 |
| STO-004 | warning | lint | 删除后逐项检查 fileList 结果 |
| STO-005 | warning | LLM | 特权管理操作走后端/MCP |
| STO-006 | info | LLM | 安全域名传播需数分钟 |
| STO-007 | info | LLM | 预览用 getTempFileURL，下载用 downloadFile |

---

## Module: data-model (Node.js, CloudRun)

| Rule ID | Severity | Check | Description |
|---------|----------|-------|-------------|
| DM-001 | warning | LLM | 简单 SQL 操作不应使用建模技能 |
| DM-002 | error | LLM | 禁止混合 SQL 和 NoSQL 设计 |
| DM-003 | error | lint | modifyDataModel 不支持更新已有模型 |
| DM-004 | warning | lint | Mermaid 命名规范（PascalCase/camelCase） |
| DM-005 | info | LLM | required()/unique() 仅在用户明确指定时用 |
| DM-006 | warning | LLM | 优先以草稿创建，发布前验证 |
| DM-007 | warning | LLM | 关系标签必须与实际字段名关联 |

---

## Cross-cutting

| Rule ID | Severity | Check | Applies to | Description |
|---------|----------|-------|-----------|-------------|
| SKILL001 | warning | LLM | All | searchKnowledgeBase 后必须 Read 完整文件 |
