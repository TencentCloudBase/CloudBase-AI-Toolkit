# MCP 工具

当前包含 32 个工具。

源数据: [tools.json](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/blob/main/scripts/tools.json)

---

## 工具总览

<table>
<thead><tr><th>名称</th><th>描述</th></tr></thead>
<tbody>
<tr><td><code>auth</code></td><td>CloudBase（腾讯云开发）开发阶段登录与环境绑定。登录后即可访问云资源；环境(env)是云函数、数据库、静态托管等资源的隔离单元，绑定环境后其他 MCP 工具才能操作该环境。支持：查询状态、发起登录、绑定环境(set_env)、退出登录。</td></tr>
<tr><td><code>envQuery</code></td><td>查询云开发环境相关信息，支持查询环境列表、当前环境信息、安全域名和静态网站托管配置。（原工具名：listEnvs/getEnvInfo/getEnvAuthDomains/getWebsiteConfig，为兼容旧AI规则可继续使用这些名称）</td></tr>
<tr><td><code>envDomainManagement</code></td><td>管理云开发环境的安全域名，支持添加和删除操作。（原工具名：createEnvDomain/deleteEnvDomain，为兼容旧AI规则可继续使用这些名称）</td></tr>
<tr><td><code>readNoSqlDatabaseStructure</code></td><td>读取 NoSQL 数据库结构</td></tr>
<tr><td><code>writeNoSqlDatabaseStructure</code></td><td>修改 NoSQL 数据库结构</td></tr>
<tr><td><code>readNoSqlDatabaseContent</code></td><td>查询并获取 NoSQL 数据库数据记录</td></tr>
<tr><td><code>writeNoSqlDatabaseContent</code></td><td>修改 NoSQL 数据库数据记录</td></tr>
<tr><td><code>executeReadOnlySQL</code></td><td>Execute a read-only SQL query on the SQL database. Note: For per-user ACL, each table should contain a fixed `_openid` column defined as `_openid VARCHAR(64) DEFAULT '' NOT NULL` that represents the user and is used for access control.</td></tr>
<tr><td><code>executeWriteSQL</code></td><td>Execute a write SQL statement on the SQL database (INSERT, UPDATE, DELETE, etc.). Whenever you create a new table, you **must** include a fixed `_openid` column defined as `_openid VARCHAR(64) DEFAULT '' NOT NULL` that represents the user and is used for access control.</td></tr>
<tr><td><code>manageDataModel</code></td><td>数据模型查询工具，支持查询和列表数据模型（只读操作）。通过 action 参数区分操作类型：list=获取模型列表（不含Schema，可选 names 参数过滤），get=查询单个模型详情（含Schema字段列表、格式、关联关系等，需要提供 name 参数），docs=生成SDK使用文档（需要提供 name 参数）</td></tr>
<tr><td><code>modifyDataModel</code></td><td>基于Mermaid classDiagram创建或更新数据模型。支持创建新模型和更新现有模型结构。内置异步任务监控，自动轮询直至完成或超时。</td></tr>
<tr><td><code>queryFunctions</code></td><td>函数域统一只读入口。通过更自解释的 action 查询函数列表、函数详情、日志、层、触发器和代码下载地址。</td></tr>
<tr><td><code>manageFunctions</code></td><td>函数域统一写入口。通过 action 管理函数创建、代码更新、配置更新、触发器和层绑定。危险操作需要显式 confirm=true。</td></tr>
<tr><td><code>uploadFiles</code></td><td>上传文件到静态网站托管。部署前请先完成构建；如果站点会部署到子路径，请检查构建配置中的 publicPath、base、assetPrefix 等是否使用相对路径，避免静态资源加载失败。</td></tr>
<tr><td><code>deleteFiles</code></td><td>删除静态网站托管的文件或文件夹</td></tr>
<tr><td><code>findFiles</code></td><td>搜索静态网站托管的文件</td></tr>
<tr><td><code>domainManagement</code></td><td>统一的域名管理工具，支持绑定、解绑、查询和修改域名配置</td></tr>
<tr><td><code>queryStorage</code></td><td>查询云存储信息，支持列出目录文件、获取文件信息、获取临时下载链接等只读操作。返回的文件信息包括文件名、大小、修改时间、下载链接等。</td></tr>
<tr><td><code>manageStorage</code></td><td>管理云存储文件，支持上传文件/目录、下载文件/目录、删除文件/目录等操作。删除操作需要设置force=true进行确认，防止误删除重要文件。</td></tr>
<tr><td><code>downloadTemplate</code></td><td>自动下载并部署CloudBase项目模板。⚠️ **MANDATORY FOR NEW PROJECTS** ⚠️&lt;br/&gt;**CRITICAL**: This tool MUST be called FIRST when starting a new project.&lt;br/&gt;支持的模板:&lt;br/&gt;- react: React + CloudBase 全栈应用模板&lt;br/&gt;- vue: Vue + CloudBase 全栈应用模板&lt;br/&gt;- miniprogram: 微信小程序 + 云开发模板  &lt;br/&gt;- uniapp: UniApp + CloudBase 跨端应用模板&lt;br/&gt;- rules: 只包含AI编辑器配置文件（包含Cursor、WindSurf、CodeBuddy等所有主流编辑器配置），适合在已有项目中补充AI编辑器配置&lt;br/&gt;支持的IDE类型:&lt;br/&gt;- all: 下载所有IDE配置&lt;br/&gt;- cursor: Cursor AI编辑器&lt;br/&gt;- 其他IDE类型见下方列表&lt;br/&gt;注意：如果未传入 ide 参数且无法从环境变量检测到 IDE，将提示错误并要求传入 ide 参数&lt;br/&gt;- windsurf: WindSurf AI编辑器&lt;br/&gt;- codebuddy: CodeBuddy AI编辑器&lt;br/&gt;- claude-code: Claude Code AI编辑器&lt;br/&gt;- cline: Cline AI编辑器&lt;br/&gt;- gemini-cli: Gemini CLI&lt;br/&gt;- opencode: OpenCode AI编辑器&lt;br/&gt;- qwen-code: 通义灵码&lt;br/&gt;- baidu-comate: 百度Comate&lt;br/&gt;- openai-codex-cli: OpenAI Codex CLI&lt;br/&gt;- augment-code: Augment Code&lt;br/&gt;- github-copilot: GitHub Copilot&lt;br/&gt;- roocode: RooCode AI编辑器&lt;br/&gt;- tongyi-lingma: 通义灵码&lt;br/&gt;- trae: Trae AI编辑器&lt;br/&gt;- qoder: Qoder AI编辑器&lt;br/&gt;- antigravity: Google Antigravity AI编辑器&lt;br/&gt;- vscode: Visual Studio Code&lt;br/&gt;- kiro: Kiro AI编辑器&lt;br/&gt;- aider: Aider AI编辑器&lt;br/&gt;特别说明：&lt;br/&gt;- rules 模板会自动包含当前 mcp 版本号信息（版本号：2.14.2），便于后续维护和版本追踪&lt;br/&gt;- 下载 rules 模板时，如果项目中已存在 README.md 文件，系统会自动保护该文件不被覆盖（除非设置 overwrite=true）</td></tr>
<tr><td><code>interactiveDialog</code></td><td>统一的交互式对话工具，支持需求澄清和任务确认，当需要和用户确认下一步的操作的时候，可以调用这个工具的clarify，如果有敏感的操作，需要用户确认，可以调用这个工具的confirm</td></tr>
<tr><td><code>searchWeb</code></td><td>使用联网来进行信息检索，如查询最新的新闻、文章、股价、天气等。支持自然语言查询，也可以直接输入网址获取网页内容</td></tr>
<tr><td><code>searchKnowledgeBase</code></td><td>云开发知识库智能检索工具，支持向量查询 (vector)、固定文档 (doc) 和 OpenAPI 文档 (openapi) 查询。&lt;br/&gt;      强烈推荐始终优先使用固定文档 (doc) 或 OpenAPI 文档 (openapi) 模式进行检索，仅当固定文档无法覆盖你的问题时，再使用向量查询 (vector) 模式。&lt;br/&gt;      固定文档 (doc) 查询当前支持 22 个固定文档，分别是：&lt;br/&gt;      文档名：ai-model-nodejs 文档介绍：Use this skill when developing Node.js backend services or CloudBase cloud functions (Express/Koa/NestJS, serverless, backend APIs) that need AI capabilities. Features text generation (generateText), streaming (streamText), AND image generation (generateImage) via @cloudbase/node-sdk ≥3.16.0. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended), DeepSeek (deepseek-v3.2 recommended), and hunyuan-image for images. This is the ONLY SDK that supports image generation. NOT for browser/Web apps (use ai-model-web) or WeChat Mini Program (use ai-model-wechat).&lt;br/&gt;文档名：ai-model-web 文档介绍：Use this skill when developing browser/Web applications (React/Vue/Angular, static websites, SPAs) that need AI capabilities. Features text generation (generateText) and streaming (streamText) via @cloudbase/js-sdk. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended) and DeepSeek (deepseek-v3.2 recommended). NOT for Node.js backend (use ai-model-nodejs), WeChat Mini Program (use ai-model-wechat), or image generation (Node SDK only).&lt;br/&gt;文档名：ai-model-wechat 文档介绍：Use this skill when developing WeChat Mini Programs (小程序, 企业微信小程序, wx.cloud-based apps) that need AI capabilities. Features text generation (generateText) and streaming (streamText) with callback support (onText, onEvent, onFinish) via wx.cloud.extend.AI. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended) and DeepSeek (deepseek-v3.2 recommended). API differs from JS/Node SDK - streamText requires data wrapper, generateText returns raw response. NOT for browser/Web apps (use ai-model-web), Node.js backend (use ai-model-nodejs), or image generation (not supported).&lt;br/&gt;文档名：auth-http-api 文档介绍：Use when you need to implement CloudBase Auth v2 over raw HTTP endpoints (login/signup, tokens, user operations) from backends or scripts that are not using the Web or Node SDKs.&lt;br/&gt;文档名：auth-nodejs 文档介绍：Complete guide for CloudBase Auth using the CloudBase Node SDK – caller identity, user lookup, custom login tickets, and server-side best practices.&lt;br/&gt;文档名：auth-tool 文档介绍：Use CloudBase Auth tool to configure and manage authentication providers for web applications - enable/disable login methods (SMS, Email, WeChat Open Platform, Google, Anonymous, Username/password, OAuth, SAML, CAS, Dingding, etc.) and configure provider settings via MCP tools `callCloudApi`.&lt;br/&gt;文档名：auth-web 文档介绍：CloudBase Web Authentication Quick Guide - Provides concise and practical Web frontend authentication solutions with multiple login methods and complete user management.&lt;br/&gt;文档名：auth-wechat 文档介绍：Complete guide for WeChat Mini Program authentication with CloudBase - native login, user identity, and cloud function integration.&lt;br/&gt;文档名：cloud-functions 文档介绍：Complete guide for CloudBase cloud functions development - runtime selection, deployment, logging, invocation, and HTTP access configuration.&lt;br/&gt;文档名：cloud-storage-web 文档介绍：Complete guide for CloudBase cloud storage using Web SDK (@cloudbase/js-sdk) - upload, download, temporary URLs, file management, and best practices.&lt;br/&gt;文档名：cloudbase-platform 文档介绍：CloudBase platform knowledge and best practices. Use this skill for general CloudBase platform understanding, including storage, hosting, authentication, cloud functions, database permissions, and data models.&lt;br/&gt;文档名：cloudrun-development 文档介绍：CloudBase Run backend development rules (Function mode/Container mode). Use this skill when deploying backend services that require long connections, multi-language support, custom environments, or AI agent development.&lt;br/&gt;文档名：data-model-creation 文档介绍：Optional advanced tool for complex data modeling. For simple table creation, use relational-database-tool directly with SQL statements.&lt;br/&gt;文档名：http-api 文档介绍：Use CloudBase HTTP API to access CloudBase platform features (database, authentication, cloud functions, cloud hosting, cloud storage, AI) via HTTP protocol from backends or scripts that are not using SDKs.&lt;br/&gt;文档名：miniprogram-development 文档介绍：WeChat Mini Program development rules. Use this skill when developing WeChat mini programs, integrating CloudBase capabilities, and deploying mini program projects.&lt;br/&gt;文档名：no-sql-web-sdk 文档介绍：Use CloudBase document database Web SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, and geolocation queries.&lt;br/&gt;文档名：no-sql-wx-mp-sdk 文档介绍：Use CloudBase document database WeChat MiniProgram SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, and geolocation queries.&lt;br/&gt;文档名：relational-database-tool 文档介绍：This is the required documentation for agents operating on the CloudBase Relational Database. It lists the only four supported tools for running SQL and managing security rules. Read the full content to understand why you must NOT use standard Application SDKs and how to safely execute INSERT, UPDATE, or DELETE operations without corrupting production data.&lt;br/&gt;文档名：relational-database-web 文档介绍：Use when building frontend Web apps that talk to CloudBase Relational Database via @cloudbase/js-sdk – provides the canonical init pattern so you can then use Supabase-style queries from the browser.&lt;br/&gt;文档名：spec-workflow 文档介绍：Standard software engineering workflow for requirement analysis, technical design, and task planning. Use this skill when developing new features, complex architecture designs, multi-module integrations, or projects involving database/UI design.&lt;br/&gt;文档名：ui-design 文档介绍：Professional UI design and frontend interface guidelines. Use this skill when creating web pages, mini-program interfaces, prototypes, or any frontend UI components that require distinctive, production-grade design with exceptional aesthetic quality.&lt;br/&gt;文档名：web-development 文档介绍：Web frontend project development rules. Use this skill when developing web frontend pages, deploying static hosting, and integrating CloudBase Web SDK.&lt;br/&gt;      OpenAPI 文档 (openapi) 查询当前支持 5 个 API 文档，分别是：&lt;br/&gt;      API名：mysqldb API介绍：MySQL RESTful API - 云开发 MySQL 数据库 HTTP API&lt;br/&gt;API名：functions API介绍：Cloud Functions API - 云函数 HTTP API&lt;br/&gt;API名：auth API介绍：Authentication API - 身份认证 HTTP API&lt;br/&gt;API名：cloudrun API介绍：CloudRun API - 云托管服务 HTTP API&lt;br/&gt;API名：storage API介绍：Storage API - 云存储 HTTP API</td></tr>
<tr><td><code>queryCloudRun</code></td><td>查询云托管服务信息，支持获取服务列表、查询服务详情和获取可用模板列表。返回的服务信息包括服务名称、状态、访问类型、配置详情等。</td></tr>
<tr><td><code>manageCloudRun</code></td><td>管理云托管服务，按开发顺序支持：初始化项目（可从模板开始，模板列表可通过 queryCloudRun 查询）、下载服务代码、本地运行（仅函数型服务）、部署代码、删除服务。部署可配置CPU、内存、实例数、访问类型等参数。删除操作需要确认，建议设置force=true。</td></tr>
<tr><td><code>queryGateway</code></td><td>网关域统一只读入口。通过 action 查询网关域名、访问入口和目标暴露情况。</td></tr>
<tr><td><code>manageGateway</code></td><td>网关域统一写入口。通过 action 创建目标访问入口，后续承接更通用的网关配置能力。</td></tr>
<tr><td><code>downloadRemoteFile</code></td><td>下载远程文件到项目根目录下的指定相对路径。例如：小程序的 Tabbar 等素材图片，必须使用 **png** 格式，可以从 Unsplash、wikimedia【一般选用 500 大小即可、Pexels、Apple 官方 UI 等资源中选择来下载。</td></tr>
<tr><td><code>readSecurityRule</code></td><td>读取指定资源（noSQL 数据库、SQL 数据库、云函数、存储桶）的安全规则和权限类别。</td></tr>
<tr><td><code>writeSecurityRule</code></td><td>设置指定资源（数据库集合、云函数、存储桶）的安全规则。</td></tr>
<tr><td><code>activateInviteCode</code></td><td>云开发 AI编程激励计划，通过邀请码激活用户激励。</td></tr>
<tr><td><code>callCloudApi</code></td><td>通用的云 API 调用工具，使用前请务必先阅读相关rules或skills，确认所需服务、Action 与 Param 的正确性和安全性</td></tr>
</tbody>
</table>

---

## 云端 MCP 配置说明


### 环境变量配置

使用云端 MCP 需要配置以下环境变量：

| 环境变量 | 说明 | 获取方式 |
|---------|------|---------|
| `TENCENTCLOUD_SECRETID` | 腾讯云 SecretId | [获取腾讯云 API 密钥](https://console.cloud.tencent.com/cam/capi) |
| `TENCENTCLOUD_SECRETKEY` | 腾讯云 SecretKey | [获取腾讯云 API 密钥](https://console.cloud.tencent.com/cam/capi) |
| `TENCENTCLOUD_SESSIONTOKEN` | 非必填，腾讯云临时密钥 Token（可选） | 仅在使用临时密钥时需要，可通过 [STS 服务](https://console.cloud.tencent.com/cam/capi) 获取 |
| `CLOUDBASE_ENV_ID` | 云开发环境 ID | [获取云开发环境 ID](https://tcb.cloud.tencent.com/dev) |

## 详细规格

### `auth`
CloudBase（腾讯云开发）开发阶段登录与环境绑定。登录后即可访问云资源；环境(env)是云函数、数据库、静态托管等资源的隔离单元，绑定环境后其他 MCP 工具才能操作该环境。支持：查询状态、发起登录、绑定环境(set_env)、退出登录。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td></td><td>动作：status=查询状态，start_auth=发起登录，set_env=绑定环境(传envId)，logout=退出登录 可填写的值: "status", "start_auth", "set_env", "logout"</td></tr>
<tr><td><code>authMode</code></td><td>string</td><td></td><td>认证模式：device=设备码授权，web=浏览器回调授权 可填写的值: "device", "web"</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>环境ID(CloudBase 环境唯一标识)，绑定后工具将操作该环境。action=set_env 时必填</td></tr>
<tr><td><code>confirm</code></td><td>string</td><td></td><td>action=logout 时确认操作，传 yes 可填写的值: const "yes"</td></tr>
</tbody>
</table>

---

### `envQuery`
查询云开发环境相关信息，支持查询环境列表、当前环境信息、安全域名和静态网站托管配置。（原工具名：listEnvs/getEnvInfo/getEnvAuthDomains/getWebsiteConfig，为兼容旧AI规则可继续使用这些名称）

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>查询类型：list=环境列表，info=当前环境信息，domains=安全域名列表，hosting=静态网站托管配置 可填写的值: "list", "info", "domains", "hosting"</td></tr>
</tbody>
</table>

---

### `envDomainManagement`
管理云开发环境的安全域名，支持添加和删除操作。（原工具名：createEnvDomain/deleteEnvDomain，为兼容旧AI规则可继续使用这些名称）

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>操作类型：create=添加域名，delete=删除域名 可填写的值: "create", "delete"</td></tr>
<tr><td><code>domains</code></td><td>array of string</td><td>是</td><td>安全域名数组</td></tr>
</tbody>
</table>

---

### `readNoSqlDatabaseStructure`
读取 NoSQL 数据库结构

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>listCollections: 列出集合列表&lt;br/&gt;describeCollection: 描述集合&lt;br/&gt;checkCollection: 检查集合是否存在&lt;br/&gt;listIndexes: 列出索引列表&lt;br/&gt;checkIndex: 检查索引是否存在 可填写的值: "listCollections", "describeCollection", "checkCollection", "listIndexes", "checkIndex"</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>返回数量限制(listCollections 操作时可选)</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>偏移量(listCollections 操作时可选)</td></tr>
<tr><td><code>collectionName</code></td><td>string</td><td></td><td>集合名称(describeCollection、listIndexes、checkIndex 操作时必填)</td></tr>
<tr><td><code>indexName</code></td><td>string</td><td></td><td>索引名称(checkIndex 操作时必填)</td></tr>
</tbody>
</table>

---

### `writeNoSqlDatabaseStructure`
修改 NoSQL 数据库结构

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>createCollection: 创建集合&lt;br/&gt;updateCollection: 更新集合&lt;br/&gt;deleteCollection: 删除集合 可填写的值: "createCollection", "updateCollection", "deleteCollection"</td></tr>
<tr><td><code>collectionName</code></td><td>string</td><td>是</td><td>集合名称</td></tr>
<tr><td><code>updateOptions</code></td><td>object</td><td></td><td>更新选项(updateCollection 时使用)</td></tr>
<tr><td><code>updateOptions.CreateIndexes</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>updateOptions.CreateIndexes[].IndexName</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema</code></td><td>object</td><td>是</td><td></td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIsUnique</code></td><td>boolean</td><td>是</td><td></td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIndexKeys</code></td><td>array of object</td><td>是</td><td></td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIndexKeys[].Name</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIndexKeys[].Direction</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>updateOptions.DropIndexes</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>updateOptions.DropIndexes[].IndexName</code></td><td>string</td><td>是</td><td></td></tr>
</tbody>
</table>

---

### `readNoSqlDatabaseContent`
查询并获取 NoSQL 数据库数据记录

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>collectionName</code></td><td>string</td><td>是</td><td>集合名称</td></tr>
<tr><td><code>query</code></td><td>object \| string</td><td></td><td>查询条件(对象或字符串,推荐对象)</td></tr>
<tr><td><code>projection</code></td><td>object \| string</td><td></td><td>返回字段投影(对象或字符串,推荐对象)</td></tr>
<tr><td><code>sort</code></td><td>array of object \| string</td><td></td><td>排序条件，使用对象或字符串。</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>返回数量限制</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>跳过的记录数</td></tr>
</tbody>
</table>

---

### `writeNoSqlDatabaseContent`
修改 NoSQL 数据库数据记录

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>insert: 插入数据（新增文档）&lt;br/&gt;update: 更新数据&lt;br/&gt;delete: 删除数据 可填写的值: "insert", "update", "delete"</td></tr>
<tr><td><code>collectionName</code></td><td>string</td><td>是</td><td>集合名称</td></tr>
<tr><td><code>documents</code></td><td>array of object</td><td></td><td>要插入的文档对象数组,每个文档都是对象(insert 操作必填)</td></tr>
<tr><td><code>query</code></td><td>object \| string</td><td></td><td>查询条件(对象或字符串,推荐对象)(update/delete 操作必填)</td></tr>
<tr><td><code>update</code></td><td>object \| string</td><td></td><td>更新内容(对象或字符串,推荐对象)(update 操作必填)</td></tr>
<tr><td><code>isMulti</code></td><td>boolean</td><td></td><td>是否更新多条记录(update/delete 操作可选)</td></tr>
<tr><td><code>upsert</code></td><td>boolean</td><td></td><td>是否在不存在时插入(update 操作可选)</td></tr>
</tbody>
</table>

---

### `executeReadOnlySQL`
Execute a read-only SQL query on the SQL database. Note: For per-user ACL, each table should contain a fixed `_openid` column defined as `_openid VARCHAR(64) DEFAULT '' NOT NULL` that represents the user and is used for access control.

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>sql</code></td><td>string</td><td>是</td><td>SQL query statement (SELECT queries only)</td></tr>
</tbody>
</table>

---

### `executeWriteSQL`
Execute a write SQL statement on the SQL database (INSERT, UPDATE, DELETE, etc.). Whenever you create a new table, you **must** include a fixed `_openid` column defined as `_openid VARCHAR(64) DEFAULT '' NOT NULL` that represents the user and is used for access control.

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>sql</code></td><td>string</td><td>是</td><td>SQL statement (INSERT, UPDATE, DELETE, CREATE, ALTER, etc.)</td></tr>
</tbody>
</table>

---

### `manageDataModel`
数据模型查询工具，支持查询和列表数据模型（只读操作）。通过 action 参数区分操作类型：list=获取模型列表（不含Schema，可选 names 参数过滤），get=查询单个模型详情（含Schema字段列表、格式、关联关系等，需要提供 name 参数），docs=生成SDK使用文档（需要提供 name 参数）

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>操作类型：get=查询单个模型（含Schema字段列表、格式、关联关系，需要提供 name 参数），list=获取模型列表（不含Schema，可选 names 参数过滤），docs=生成SDK使用文档（需要提供 name 参数） 可填写的值: "get", "list", "docs"</td></tr>
<tr><td><code>name</code></td><td>string</td><td></td><td>要查询的数据模型名称。当 action='get' 或 action='docs' 时，此参数为必填项，必须提供已存在的数据模型名称。可通过 action='list' 操作获取可用的模型名称列表</td></tr>
<tr><td><code>names</code></td><td>array of string</td><td></td><td>模型名称数组（list操作时可选，用于过滤）</td></tr>
</tbody>
</table>

---

### `modifyDataModel`
基于Mermaid classDiagram创建或更新数据模型。支持创建新模型和更新现有模型结构。内置异步任务监控，自动轮询直至完成或超时。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>mermaidDiagram</code></td><td>string</td><td>是</td><td>Mermaid classDiagram代码，描述数据模型结构。</td></tr>
<tr><td><code>action</code></td><td>string</td><td></td><td>操作类型：create=创建新模型 可填写的值: "create"；默认值: "create"</td></tr>
<tr><td><code>publish</code></td><td>boolean</td><td></td><td>是否立即发布模型 默认值: false</td></tr>
<tr><td><code>dbInstanceType</code></td><td>string</td><td></td><td>数据库实例类型 默认值: "MYSQL"</td></tr>
</tbody>
</table>

<details><summary>示例</summary>

```text
classDiagram
    class Student {
        name: string <<姓名>>
        age: number = 18 <<年龄>>
        gender: x-enum = "男" <<性别>>
        classId: string <<班级ID>>
        identityId: string <<身份ID>>
        course: Course[] <<课程>>
        required() ["name"]
        unique() ["name"]
        enum_gender() ["男", "女"]
        display_field() "name"
    }
    class Class {
        className: string <<班级名称>>
        display_field() "className"
    }
    class Course {
        name: string <<课程名称>>
        students: Student[] <<学生>>
        display_field() "name"
    }
    class Identity {
        number: string <<证件号码>>
        display_field() "number"
    }

    %% 关联关系
    Student "1" --> "1" Identity : studentId
    Student "n" --> "1" Class : student2class
    Student "n" --> "m" Course : course
    Student "n" <-- "m" Course : students
    %% 类的命名
    note for Student "学生模型"
    note for Class "班级模型"
    note for Course "课程模型"
    note for Identity "身份模型"
```
</details>

---

### `queryFunctions`
函数域统一只读入口。通过更自解释的 action 查询函数列表、函数详情、日志、层、触发器和代码下载地址。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>只读操作类型，例如 listFunctions、getFunctionDetail、listFunctionLogs 可填写的值: "listFunctions", "getFunctionDetail", "listFunctionLogs", "getFunctionLogDetail", "listFunctionLayers", "listLayers", "listLayerVersions", "getLayerVersionDetail", "listFunctionTriggers", "getFunctionDownloadUrl"</td></tr>
<tr><td><code>functionName</code></td><td>string</td><td></td><td>函数名称。函数相关 action 必填</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>分页数量。列表类 action 可选</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>分页偏移。列表类 action 可选</td></tr>
<tr><td><code>codeSecret</code></td><td>string</td><td></td><td>代码保护密钥</td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td>日志查询开始时间</td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td>日志查询结束时间</td></tr>
<tr><td><code>requestId</code></td><td>string</td><td></td><td>日志 requestId。获取日志详情时必填</td></tr>
<tr><td><code>qualifier</code></td><td>string</td><td></td><td>函数版本，日志查询时可选</td></tr>
<tr><td><code>runtime</code></td><td>string</td><td></td><td>层查询的运行时筛选</td></tr>
<tr><td><code>searchKey</code></td><td>string</td><td></td><td>层名称搜索关键字</td></tr>
<tr><td><code>layerName</code></td><td>string</td><td></td><td>层名称。层相关 action 必填</td></tr>
<tr><td><code>layerVersion</code></td><td>number</td><td></td><td>层版本号。获取层版本详情时必填</td></tr>
</tbody>
</table>

---

### `manageFunctions`
函数域统一写入口。通过 action 管理函数创建、代码更新、配置更新、触发器和层绑定。危险操作需要显式 confirm=true。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>写操作类型，例如 createFunction、updateFunctionCode、attachLayer 可填写的值: "createFunction", "updateFunctionCode", "updateFunctionConfig", "invokeFunction", "createFunctionTrigger", "deleteFunctionTrigger", "createLayerVersion", "deleteLayerVersion", "attachLayer", "detachLayer", "updateFunctionLayers"</td></tr>
<tr><td><code>func</code></td><td>object</td><td></td><td>createFunction 操作的函数配置</td></tr>
<tr><td><code>func.name</code></td><td>string</td><td>是</td><td>函数名称</td></tr>
<tr><td><code>func.type</code></td><td>string</td><td></td><td>函数类型 可填写的值: "Event", "HTTP"</td></tr>
<tr><td><code>func.protocolType</code></td><td>string</td><td></td><td>HTTP 云函数协议类型 可填写的值: "HTTP", "WS"</td></tr>
<tr><td><code>func.protocolParams</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>func.protocolParams.wsParams</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>func.protocolParams.wsParams.idleTimeOut</code></td><td>number</td><td></td><td>WebSocket 空闲超时时间（秒）</td></tr>
<tr><td><code>func.instanceConcurrencyConfig</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>func.instanceConcurrencyConfig.dynamicEnabled</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>func.instanceConcurrencyConfig.maxConcurrency</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>func.timeout</code></td><td>number</td><td></td><td>函数超时时间</td></tr>
<tr><td><code>func.envVariables</code></td><td>object</td><td></td><td>环境变量</td></tr>
<tr><td><code>func.vpc</code></td><td>object</td><td></td><td>私有网络配置</td></tr>
<tr><td><code>func.vpc.vpcId</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>func.vpc.subnetId</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>func.runtime</code></td><td>string</td><td></td><td>运行时环境。Event 函数支持多种运行时:&lt;br/&gt;  Nodejs: Nodejs20.19, Nodejs18.15, Nodejs16.13, Nodejs14.18, Nodejs12.16, Nodejs10.15, Nodejs8.9&lt;br/&gt;  Python: Python3.10, Python3.9, Python3.7, Python3.6, Python2.7&lt;br/&gt;  Php: Php8.0, Php7.4, Php7.2&lt;br/&gt;  Java: Java8, Java11&lt;br/&gt;  Golang: Golang1&lt;br/&gt;推荐运行时:&lt;br/&gt;  Node.js: Nodejs18.15&lt;br/&gt;  Python: Python3.9&lt;br/&gt;  PHP: Php7.4&lt;br/&gt;  Java: Java11&lt;br/&gt;  Go: Golang1</td></tr>
<tr><td><code>func.triggers</code></td><td>array of object</td><td></td><td>触发器配置数组</td></tr>
<tr><td><code>func.triggers[].name</code></td><td>string</td><td>是</td><td>触发器名称</td></tr>
<tr><td><code>func.triggers[].type</code></td><td>string</td><td>是</td><td>触发器类型 可填写的值: "timer"</td></tr>
<tr><td><code>func.triggers[].config</code></td><td>string</td><td>是</td><td>触发器配置，timer 使用 7 段 cron：second minute hour day month week year</td></tr>
<tr><td><code>func.handler</code></td><td>string</td><td></td><td>函数入口</td></tr>
<tr><td><code>func.ignore</code></td><td>string \| array of string</td><td></td><td>忽略文件</td></tr>
<tr><td><code>func.isWaitInstall</code></td><td>boolean</td><td></td><td>是否等待依赖安装</td></tr>
<tr><td><code>func.layers</code></td><td>array of object</td><td></td><td>Layer 配置</td></tr>
<tr><td><code>func.layers[].name</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>func.layers[].version</code></td><td>number</td><td>是</td><td></td></tr>
<tr><td><code>functionRootPath</code></td><td>string</td><td></td><td>函数根目录（父目录绝对路径）</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>createFunction 时是否覆盖</td></tr>
<tr><td><code>functionName</code></td><td>string</td><td></td><td>函数名称。大多数 action 使用该字段作为统一目标</td></tr>
<tr><td><code>zipFile</code></td><td>string</td><td></td><td>代码包的 base64 编码</td></tr>
<tr><td><code>handler</code></td><td>string</td><td></td><td>函数入口</td></tr>
<tr><td><code>timeout</code></td><td>number</td><td></td><td>配置更新时的超时时间</td></tr>
<tr><td><code>envVariables</code></td><td>object</td><td></td><td>配置更新时要合并的环境变量</td></tr>
<tr><td><code>vpc</code></td><td>unknown</td><td></td><td>配置更新时的 VPC 信息</td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td>invokeFunction 的调用参数</td></tr>
<tr><td><code>triggers</code></td><td>array of unknown</td><td></td><td>createFunctionTrigger 的触发器列表</td></tr>
<tr><td><code>triggerName</code></td><td>string</td><td></td><td>deleteFunctionTrigger 的目标触发器名称</td></tr>
<tr><td><code>layerName</code></td><td>string</td><td></td><td>层名称</td></tr>
<tr><td><code>layerVersion</code></td><td>number</td><td></td><td>层版本号</td></tr>
<tr><td><code>contentPath</code></td><td>string</td><td></td><td>层内容路径，可为目录或 ZIP 文件</td></tr>
<tr><td><code>base64Content</code></td><td>string</td><td></td><td>层内容的 base64 编码</td></tr>
<tr><td><code>runtimes</code></td><td>array of string</td><td></td><td>层适用的运行时列表</td></tr>
<tr><td><code>description</code></td><td>string</td><td></td><td>层版本描述</td></tr>
<tr><td><code>licenseInfo</code></td><td>string</td><td></td><td>层许可证信息</td></tr>
<tr><td><code>layers</code></td><td>array of object</td><td></td><td>updateFunctionLayers 的目标层列表，顺序即最终顺序</td></tr>
<tr><td><code>layers[].layerName</code></td><td>string</td><td>是</td><td>层名称</td></tr>
<tr><td><code>layers[].layerVersion</code></td><td>number</td><td>是</td><td>层版本号</td></tr>
<tr><td><code>codeSecret</code></td><td>string</td><td></td><td>层绑定时的代码保护密钥</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>危险操作确认开关</td></tr>
</tbody>
</table>

---

### `uploadFiles`
上传文件到静态网站托管。部署前请先完成构建；如果站点会部署到子路径，请检查构建配置中的 publicPath、base、assetPrefix 等是否使用相对路径，避免静态资源加载失败。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>localPath</code></td><td>string</td><td></td><td>本地文件或文件夹路径，需要是绝对路径，例如 /tmp/files/data.txt。</td></tr>
<tr><td><code>cloudPath</code></td><td>string</td><td></td><td>云端文件或文件夹路径，例如 files/data.txt。若部署到子路径，请同时检查构建配置中的 publicPath、base、assetPrefix 等是否为相对路径。</td></tr>
<tr><td><code>files</code></td><td>array of object</td><td></td><td>多文件上传配置 默认值: []</td></tr>
<tr><td><code>files[].localPath</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>files[].cloudPath</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>ignore</code></td><td>string \| array of string</td><td></td><td>忽略文件模式</td></tr>
</tbody>
</table>

---

### `deleteFiles`
删除静态网站托管的文件或文件夹

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>cloudPath</code></td><td>string</td><td>是</td><td>云端文件或文件夹路径</td></tr>
<tr><td><code>isDir</code></td><td>boolean</td><td></td><td>是否为文件夹 默认值: false</td></tr>
</tbody>
</table>

---

### `findFiles`
搜索静态网站托管的文件

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>prefix</code></td><td>string</td><td>是</td><td>匹配前缀</td></tr>
<tr><td><code>marker</code></td><td>string</td><td></td><td>起始对象键标记</td></tr>
<tr><td><code>maxKeys</code></td><td>number</td><td></td><td>单次返回最大条目数</td></tr>
</tbody>
</table>

---

### `domainManagement`
统一的域名管理工具，支持绑定、解绑、查询和修改域名配置

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>操作类型: create=绑定域名, delete=解绑域名, check=查询域名配置, modify=修改域名配置 可填写的值: "create", "delete", "check", "modify"</td></tr>
<tr><td><code>domain</code></td><td>string</td><td></td><td>域名</td></tr>
<tr><td><code>certId</code></td><td>string</td><td></td><td>证书ID（绑定域名时必需）</td></tr>
<tr><td><code>domains</code></td><td>array of string</td><td></td><td>域名列表（查询配置时使用）</td></tr>
<tr><td><code>domainId</code></td><td>number</td><td></td><td>域名ID（修改配置时必需）</td></tr>
<tr><td><code>domainConfig</code></td><td>object</td><td></td><td>域名配置（修改配置时使用）</td></tr>
<tr><td><code>domainConfig.Refer</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>domainConfig.Refer.Switch</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>domainConfig.Refer.RefererRules</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>domainConfig.Refer.RefererRules[].RefererType</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>domainConfig.Refer.RefererRules[].Referers</code></td><td>array of string</td><td>是</td><td></td></tr>
<tr><td><code>domainConfig.Refer.RefererRules[].AllowEmpty</code></td><td>boolean</td><td>是</td><td></td></tr>
<tr><td><code>domainConfig.Cache</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>domainConfig.Cache[].RuleType</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>domainConfig.Cache[].RuleValue</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>domainConfig.Cache[].CacheTtl</code></td><td>number</td><td>是</td><td></td></tr>
<tr><td><code>domainConfig.IpFilter</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>domainConfig.IpFilter.Switch</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>domainConfig.IpFilter.FilterType</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>domainConfig.IpFilter.Filters</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>domainConfig.IpFreqLimit</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>domainConfig.IpFreqLimit.Switch</code></td><td>string</td><td>是</td><td></td></tr>
<tr><td><code>domainConfig.IpFreqLimit.Qps</code></td><td>number</td><td></td><td></td></tr>
</tbody>
</table>

---

### `queryStorage`
查询云存储信息，支持列出目录文件、获取文件信息、获取临时下载链接等只读操作。返回的文件信息包括文件名、大小、修改时间、下载链接等。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>查询操作类型：list=列出目录下的所有文件，info=获取指定文件的详细信息，url=获取文件的临时下载链接 可填写的值: "list", "info", "url"</td></tr>
<tr><td><code>cloudPath</code></td><td>string</td><td>是</td><td>云端文件路径，例如 files/data.txt 或 files/（目录）</td></tr>
<tr><td><code>maxAge</code></td><td>number</td><td></td><td>临时链接有效期，单位为秒，取值范围：1-86400，默认值：3600（1小时） 默认值: 3600</td></tr>
</tbody>
</table>

---

### `manageStorage`
管理云存储文件，支持上传文件/目录、下载文件/目录、删除文件/目录等操作。删除操作需要设置force=true进行确认，防止误删除重要文件。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>管理操作类型：upload=上传文件或目录，download=下载文件或目录，delete=删除文件或目录 可填写的值: "upload", "download", "delete"</td></tr>
<tr><td><code>localPath</code></td><td>string</td><td>是</td><td>本地文件路径，建议传入绝对路径，例如 /tmp/files/data.txt</td></tr>
<tr><td><code>cloudPath</code></td><td>string</td><td>是</td><td>云端文件路径，例如 files/data.txt</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>强制操作开关，删除操作时建议设置为true以确认删除，默认false 默认值: false</td></tr>
<tr><td><code>isDirectory</code></td><td>boolean</td><td></td><td>是否为目录操作，true=目录操作，false=文件操作，默认false 默认值: false</td></tr>
</tbody>
</table>

---

### `downloadTemplate`
自动下载并部署CloudBase项目模板。⚠️ **MANDATORY FOR NEW PROJECTS** ⚠️

**CRITICAL**: This tool MUST be called FIRST when starting a new project.

支持的模板:
- react: React + CloudBase 全栈应用模板
- vue: Vue + CloudBase 全栈应用模板
- miniprogram: 微信小程序 + 云开发模板  
- uniapp: UniApp + CloudBase 跨端应用模板
- rules: 只包含AI编辑器配置文件（包含Cursor、WindSurf、CodeBuddy等所有主流编辑器配置），适合在已有项目中补充AI编辑器配置

支持的IDE类型:
- all: 下载所有IDE配置
- cursor: Cursor AI编辑器
- 其他IDE类型见下方列表

注意：如果未传入 ide 参数且无法从环境变量检测到 IDE，将提示错误并要求传入 ide 参数
- windsurf: WindSurf AI编辑器
- codebuddy: CodeBuddy AI编辑器
- claude-code: Claude Code AI编辑器
- cline: Cline AI编辑器
- gemini-cli: Gemini CLI
- opencode: OpenCode AI编辑器
- qwen-code: 通义灵码
- baidu-comate: 百度Comate
- openai-codex-cli: OpenAI Codex CLI
- augment-code: Augment Code
- github-copilot: GitHub Copilot
- roocode: RooCode AI编辑器
- tongyi-lingma: 通义灵码
- trae: Trae AI编辑器
- qoder: Qoder AI编辑器
- antigravity: Google Antigravity AI编辑器
- vscode: Visual Studio Code
- kiro: Kiro AI编辑器
- aider: Aider AI编辑器

特别说明：
- rules 模板会自动包含当前 mcp 版本号信息（版本号：2.14.2），便于后续维护和版本追踪
- 下载 rules 模板时，如果项目中已存在 README.md 文件，系统会自动保护该文件不被覆盖（除非设置 overwrite=true）

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>template</code></td><td>string</td><td>是</td><td>要下载的模板类型 可填写的值: "react", "vue", "miniprogram", "uniapp", "rules"</td></tr>
<tr><td><code>ide</code></td><td>string</td><td>是</td><td>指定要下载的IDE类型。 可填写的值: "all", "cursor", "windsurf", "codebuddy", "claude-code", "cline", "gemini-cli", "opencode", "qwen-code", "baidu-comate", "openai-codex-cli", "augment-code", "github-copilot", "roocode", "tongyi-lingma", "trae", "qoder", "antigravity", "vscode", "kiro", "aider", "iflow-cli"</td></tr>
<tr><td><code>overwrite</code></td><td>boolean</td><td></td><td>是否覆盖已存在的文件，默认为false（不覆盖）</td></tr>
</tbody>
</table>

---

### `interactiveDialog`
统一的交互式对话工具，支持需求澄清和任务确认，当需要和用户确认下一步的操作的时候，可以调用这个工具的clarify，如果有敏感的操作，需要用户确认，可以调用这个工具的confirm

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>type</code></td><td>string</td><td>是</td><td>交互类型: clarify=需求澄清, confirm=任务确认 可填写的值: "clarify", "confirm"</td></tr>
<tr><td><code>message</code></td><td>string</td><td></td><td>对话消息内容</td></tr>
<tr><td><code>options</code></td><td>array of string</td><td></td><td>可选的预设选项</td></tr>
<tr><td><code>forceUpdate</code></td><td>boolean</td><td></td><td>是否强制更新环境ID配置</td></tr>
<tr><td><code>risks</code></td><td>array of string</td><td></td><td>操作风险提示</td></tr>
</tbody>
</table>

---

### `searchWeb`
使用联网来进行信息检索，如查询最新的新闻、文章、股价、天气等。支持自然语言查询，也可以直接输入网址获取网页内容

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>query</code></td><td>string</td><td>是</td><td>搜索关键词、问题或网址，支持自然语言</td></tr>
</tbody>
</table>

---

### `searchKnowledgeBase`
云开发知识库智能检索工具，支持向量查询 (vector)、固定文档 (doc) 和 OpenAPI 文档 (openapi) 查询。

      强烈推荐始终优先使用固定文档 (doc) 或 OpenAPI 文档 (openapi) 模式进行检索，仅当固定文档无法覆盖你的问题时，再使用向量查询 (vector) 模式。

      固定文档 (doc) 查询当前支持 22 个固定文档，分别是：
      文档名：ai-model-nodejs 文档介绍：Use this skill when developing Node.js backend services or CloudBase cloud functions (Express/Koa/NestJS, serverless, backend APIs) that need AI capabilities. Features text generation (generateText), streaming (streamText), AND image generation (generateImage) via @cloudbase/node-sdk ≥3.16.0. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended), DeepSeek (deepseek-v3.2 recommended), and hunyuan-image for images. This is the ONLY SDK that supports image generation. NOT for browser/Web apps (use ai-model-web) or WeChat Mini Program (use ai-model-wechat).
文档名：ai-model-web 文档介绍：Use this skill when developing browser/Web applications (React/Vue/Angular, static websites, SPAs) that need AI capabilities. Features text generation (generateText) and streaming (streamText) via @cloudbase/js-sdk. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended) and DeepSeek (deepseek-v3.2 recommended). NOT for Node.js backend (use ai-model-nodejs), WeChat Mini Program (use ai-model-wechat), or image generation (Node SDK only).
文档名：ai-model-wechat 文档介绍：Use this skill when developing WeChat Mini Programs (小程序, 企业微信小程序, wx.cloud-based apps) that need AI capabilities. Features text generation (generateText) and streaming (streamText) with callback support (onText, onEvent, onFinish) via wx.cloud.extend.AI. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended) and DeepSeek (deepseek-v3.2 recommended). API differs from JS/Node SDK - streamText requires data wrapper, generateText returns raw response. NOT for browser/Web apps (use ai-model-web), Node.js backend (use ai-model-nodejs), or image generation (not supported).
文档名：auth-http-api 文档介绍：Use when you need to implement CloudBase Auth v2 over raw HTTP endpoints (login/signup, tokens, user operations) from backends or scripts that are not using the Web or Node SDKs.
文档名：auth-nodejs 文档介绍：Complete guide for CloudBase Auth using the CloudBase Node SDK – caller identity, user lookup, custom login tickets, and server-side best practices.
文档名：auth-tool 文档介绍：Use CloudBase Auth tool to configure and manage authentication providers for web applications - enable/disable login methods (SMS, Email, WeChat Open Platform, Google, Anonymous, Username/password, OAuth, SAML, CAS, Dingding, etc.) and configure provider settings via MCP tools `callCloudApi`.
文档名：auth-web 文档介绍：CloudBase Web Authentication Quick Guide - Provides concise and practical Web frontend authentication solutions with multiple login methods and complete user management.
文档名：auth-wechat 文档介绍：Complete guide for WeChat Mini Program authentication with CloudBase - native login, user identity, and cloud function integration.
文档名：cloud-functions 文档介绍：Complete guide for CloudBase cloud functions development - runtime selection, deployment, logging, invocation, and HTTP access configuration.
文档名：cloud-storage-web 文档介绍：Complete guide for CloudBase cloud storage using Web SDK (@cloudbase/js-sdk) - upload, download, temporary URLs, file management, and best practices.
文档名：cloudbase-platform 文档介绍：CloudBase platform knowledge and best practices. Use this skill for general CloudBase platform understanding, including storage, hosting, authentication, cloud functions, database permissions, and data models.
文档名：cloudrun-development 文档介绍：CloudBase Run backend development rules (Function mode/Container mode). Use this skill when deploying backend services that require long connections, multi-language support, custom environments, or AI agent development.
文档名：data-model-creation 文档介绍：Optional advanced tool for complex data modeling. For simple table creation, use relational-database-tool directly with SQL statements.
文档名：http-api 文档介绍：Use CloudBase HTTP API to access CloudBase platform features (database, authentication, cloud functions, cloud hosting, cloud storage, AI) via HTTP protocol from backends or scripts that are not using SDKs.
文档名：miniprogram-development 文档介绍：WeChat Mini Program development rules. Use this skill when developing WeChat mini programs, integrating CloudBase capabilities, and deploying mini program projects.
文档名：no-sql-web-sdk 文档介绍：Use CloudBase document database Web SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, and geolocation queries.
文档名：no-sql-wx-mp-sdk 文档介绍：Use CloudBase document database WeChat MiniProgram SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, and geolocation queries.
文档名：relational-database-tool 文档介绍：This is the required documentation for agents operating on the CloudBase Relational Database. It lists the only four supported tools for running SQL and managing security rules. Read the full content to understand why you must NOT use standard Application SDKs and how to safely execute INSERT, UPDATE, or DELETE operations without corrupting production data.
文档名：relational-database-web 文档介绍：Use when building frontend Web apps that talk to CloudBase Relational Database via @cloudbase/js-sdk – provides the canonical init pattern so you can then use Supabase-style queries from the browser.
文档名：spec-workflow 文档介绍：Standard software engineering workflow for requirement analysis, technical design, and task planning. Use this skill when developing new features, complex architecture designs, multi-module integrations, or projects involving database/UI design.
文档名：ui-design 文档介绍：Professional UI design and frontend interface guidelines. Use this skill when creating web pages, mini-program interfaces, prototypes, or any frontend UI components that require distinctive, production-grade design with exceptional aesthetic quality.
文档名：web-development 文档介绍：Web frontend project development rules. Use this skill when developing web frontend pages, deploying static hosting, and integrating CloudBase Web SDK.

      OpenAPI 文档 (openapi) 查询当前支持 5 个 API 文档，分别是：
      API名：mysqldb API介绍：MySQL RESTful API - 云开发 MySQL 数据库 HTTP API
API名：functions API介绍：Cloud Functions API - 云函数 HTTP API
API名：auth API介绍：Authentication API - 身份认证 HTTP API
API名：cloudrun API介绍：CloudRun API - 云托管服务 HTTP API
API名：storage API介绍：Storage API - 云存储 HTTP API

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>mode</code></td><td>string</td><td>是</td><td>可填写的值: "vector", "doc", "openapi"</td></tr>
<tr><td><code>docName</code></td><td>string</td><td></td><td>mode=doc 时指定。文档名称。 可填写的值: "ai-model-nodejs", "ai-model-web", "ai-model-wechat", "auth-http-api", "auth-nodejs", "auth-tool", "auth-web", "auth-wechat", "cloud-functions", "cloud-storage-web", "cloudbase-platform", "cloudrun-development", "data-model-creation", "http-api", "miniprogram-development", "no-sql-web-sdk", "no-sql-wx-mp-sdk", "relational-database-tool", "relational-database-web", "spec-workflow", "ui-design", "web-development"</td></tr>
<tr><td><code>apiName</code></td><td>string</td><td></td><td>mode=openapi 时指定。API 名称。 可填写的值: "mysqldb", "functions", "auth", "cloudrun", "storage"</td></tr>
<tr><td><code>threshold</code></td><td>number</td><td></td><td>mode=vector 时指定。相似性检索阈值 默认值: 0.5</td></tr>
<tr><td><code>id</code></td><td>string</td><td></td><td>mode=vector 时指定。知识库范围，cloudbase=云开发全量知识，scf=云开发的云函数知识, miniprogram=小程序知识（不包含云开发与云函数知识） 可填写的值: "cloudbase", "scf", "miniprogram"</td></tr>
<tr><td><code>content</code></td><td>string</td><td></td><td>mode=vector 时指定。检索内容</td></tr>
<tr><td><code>options</code></td><td>object</td><td></td><td>mode=vector 时指定。其他选项</td></tr>
<tr><td><code>options.chunkExpand</code></td><td>array of number</td><td></td><td>指定返回的文档内容的展开长度,例如 [3,3]代表前后展开长度 默认值: [3,3]</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>mode=vector 时指定。指定返回最相似的 Top K 的 K 的值 默认值: 5</td></tr>
</tbody>
</table>

---

### `queryCloudRun`
查询云托管服务信息，支持获取服务列表、查询服务详情和获取可用模板列表。返回的服务信息包括服务名称、状态、访问类型、配置详情等。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>查询操作类型：list=获取云托管服务列表（支持分页和筛选），detail=查询指定服务的详细信息（包括配置、版本、访问地址等），templates=获取可用的项目模板列表（用于初始化新项目） 可填写的值: "list", "detail", "templates"</td></tr>
<tr><td><code>pageSize</code></td><td>number</td><td></td><td>分页大小，控制每页返回的服务数量。取值范围：1-100，默认值：10。建议根据网络性能和显示需求调整 默认值: 10</td></tr>
<tr><td><code>pageNum</code></td><td>number</td><td></td><td>页码，用于分页查询。从1开始，默认值：1。配合pageSize使用可实现分页浏览 默认值: 1</td></tr>
<tr><td><code>serverName</code></td><td>string</td><td></td><td>服务名称筛选条件，支持模糊匹配。例如：输入"test"可匹配"test-service"、"my-test-app"等服务名称。留空则查询所有服务</td></tr>
<tr><td><code>serverType</code></td><td>string</td><td></td><td>服务类型筛选条件：function=函数型云托管（仅支持Node.js，有特殊的开发要求和限制，适合简单的API服务），container=容器型服务（推荐使用，支持任意语言和框架如Java/Go/Python/PHP/.NET等，适合大多数应用场景） 可填写的值: "function", "container"</td></tr>
<tr><td><code>detailServerName</code></td><td>string</td><td></td><td>要查询详细信息的服务名称。当action为detail时必需提供，必须是已存在的服务名称。可通过list操作获取可用的服务名称列表</td></tr>
</tbody>
</table>

---

### `manageCloudRun`
管理云托管服务，按开发顺序支持：初始化项目（可从模板开始，模板列表可通过 queryCloudRun 查询）、下载服务代码、本地运行（仅函数型服务）、部署代码、删除服务。部署可配置CPU、内存、实例数、访问类型等参数。删除操作需要确认，建议设置force=true。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>云托管服务管理操作类型：init=从模板初始化新的云托管项目代码（在targetPath目录下创建以serverName命名的子目录，支持多种语言和框架模板），download=从云端下载现有服务的代码到本地进行开发，run=在本地运行函数型云托管服务（用于开发和调试，仅支持函数型服务），deploy=将本地代码部署到云端云托管服务（支持函数型和容器型），delete=删除指定的云托管服务（不可恢复，需要确认），createAgent=创建函数型Agent（基于函数型云托管开发AI智能体） 可填写的值: "init", "download", "run", "deploy", "delete", "createAgent"</td></tr>
<tr><td><code>serverName</code></td><td>string</td><td>是</td><td>云托管服务名称，用于标识和管理服务。命名规则：支持大小写字母、数字、连字符和下划线，必须以字母开头，长度3-45个字符。在init操作中会作为在targetPath下创建的子目录名，在其他操作中作为目标服务名</td></tr>
<tr><td><code>targetPath</code></td><td>string</td><td></td><td>本地代码路径，必须是绝对路径。在deploy操作中指定要部署的代码目录，在download操作中指定下载目标目录，在init操作中指定云托管服务的上级目录（会在该目录下创建以serverName命名的子目录）。建议约定：项目根目录下的cloudrun/目录，例如：/Users/username/projects/my-project/cloudrun</td></tr>
<tr><td><code>serverConfig</code></td><td>object</td><td></td><td>服务配置项，用于部署时设置服务的运行参数。包括资源规格、访问权限、环境变量等配置。不提供时使用默认配置</td></tr>
<tr><td><code>serverConfig.OpenAccessTypes</code></td><td>array of string</td><td></td><td>公网访问类型配置，控制服务的访问权限：OA=办公网访问，PUBLIC=公网访问（默认，可通过HTTPS域名访问），MINIAPP=小程序访问，VPC=VPC访问（仅同VPC内可访问）。可配置多个类型</td></tr>
<tr><td><code>serverConfig.Cpu</code></td><td>number</td><td></td><td>CPU规格配置，单位为核。可选值：0.25、0.5、1、2、4、8等。注意：内存规格必须是CPU规格的2倍（如CPU=0.25时内存=0.5，CPU=1时内存=2）。影响服务性能和计费</td></tr>
<tr><td><code>serverConfig.Mem</code></td><td>number</td><td></td><td>内存规格配置，单位为GB。可选值：0.5、1、2、4、8、16等。注意：必须是CPU规格的2倍。影响服务性能和计费</td></tr>
<tr><td><code>serverConfig.MinNum</code></td><td>number</td><td></td><td>最小实例数配置，控制服务的最小运行实例数量。设置为0时支持缩容到0（无请求时不产生费用），设置为大于0时始终保持指定数量的实例运行（确保快速响应但会增加成本）。建议设置为1以降低冷启动延迟，提升用户体验</td></tr>
<tr><td><code>serverConfig.MaxNum</code></td><td>number</td><td></td><td>最大实例数配置，控制服务的最大运行实例数量。当请求量增加时，服务最多可以扩展到指定数量的实例，超过此数量后将拒绝新的请求。建议根据业务峰值设置</td></tr>
<tr><td><code>serverConfig.PolicyDetails</code></td><td>array of object</td><td></td><td>扩缩容配置数组，用于配置服务的自动扩缩容策略。可配置多个扩缩容策略</td></tr>
<tr><td><code>serverConfig.PolicyDetails[].PolicyType</code></td><td>string</td><td>是</td><td>扩缩容类型：cpu=基于CPU使用率扩缩容，mem=基于内存使用率扩缩容，cpu/mem=基于CPU和内存使用率扩缩容 可填写的值: "cpu", "mem", "cpu/mem"</td></tr>
<tr><td><code>serverConfig.PolicyDetails[].PolicyThreshold</code></td><td>number</td><td>是</td><td>扩缩容阈值，单位为百分比。如60表示当资源使用率达到60%时触发扩缩容</td></tr>
<tr><td><code>serverConfig.CustomLogs</code></td><td>string</td><td></td><td>自定义日志配置，用于配置服务的日志收集和存储策略</td></tr>
<tr><td><code>serverConfig.Port</code></td><td>number</td><td></td><td>服务监听端口配置。函数型服务固定为3000，容器型服务可自定义。服务代码必须监听此端口才能正常接收请求</td></tr>
<tr><td><code>serverConfig.EnvParams</code></td><td>string</td><td></td><td>环境变量配置，JSON字符串格式。用于传递配置信息给服务代码，如'&#123;"DATABASE_URL":"mysql://...","NODE_ENV":"production"&#125;'。敏感信息建议使用环境变量而非硬编码</td></tr>
<tr><td><code>serverConfig.Dockerfile</code></td><td>string</td><td></td><td>Dockerfile文件名配置，仅容器型服务需要。指定用于构建容器镜像的Dockerfile文件路径，默认为项目根目录下的Dockerfile</td></tr>
<tr><td><code>serverConfig.BuildDir</code></td><td>string</td><td></td><td>构建目录配置，指定代码构建的目录路径。当代码结构与标准不同时使用，默认为项目根目录</td></tr>
<tr><td><code>serverConfig.InternalAccess</code></td><td>string</td><td></td><td>内网访问开关配置，控制是否启用内网访问。true=启用内网访问（可通过云开发SDK直接调用），false=关闭内网访问（仅公网访问）</td></tr>
<tr><td><code>serverConfig.InternalDomain</code></td><td>string</td><td></td><td>内网域名配置，用于配置服务的内网访问域名。仅在启用内网访问时有效</td></tr>
<tr><td><code>serverConfig.EntryPoint</code></td><td>array of string</td><td></td><td>Dockerfile EntryPoint参数配置，仅容器型服务需要。指定容器启动时的入口程序数组，如["node","app.js"]</td></tr>
<tr><td><code>serverConfig.Cmd</code></td><td>array of string</td><td></td><td>Dockerfile Cmd参数配置，仅容器型服务需要。指定容器启动时的默认命令数组，如["npm","start"]</td></tr>
<tr><td><code>template</code></td><td>string</td><td></td><td>项目模板标识符，用于指定初始化项目时使用的模板。可通过queryCloudRun的templates操作获取可用模板列表。常用模板：helloworld=Hello World示例，nodejs=Node.js项目模板，python=Python项目模板等 默认值: "helloworld"</td></tr>
<tr><td><code>runOptions</code></td><td>object</td><td></td><td>本地运行参数配置，仅函数型云托管服务支持。用于配置本地开发环境的运行参数，不影响云端部署</td></tr>
<tr><td><code>runOptions.port</code></td><td>number</td><td></td><td>本地运行端口配置，仅函数型服务有效。指定服务在本地运行时监听的端口号，默认3000。确保端口未被其他程序占用 默认值: 3000</td></tr>
<tr><td><code>runOptions.envParams</code></td><td>object</td><td></td><td>本地运行时的附加环境变量配置，用于本地开发和调试。格式为键值对，如&#123;"DEBUG":"true","LOG_LEVEL":"debug"&#125;。这些变量仅在本地运行时生效</td></tr>
<tr><td><code>runOptions.runMode</code></td><td>string</td><td></td><td>运行模式：normal=普通函数模式，agent=Agent模式（用于AI智能体开发） 可填写的值: "normal", "agent"；默认值: "normal"</td></tr>
<tr><td><code>runOptions.agentId</code></td><td>string</td><td></td><td>Agent ID，在agent模式下使用，用于标识特定的Agent实例</td></tr>
<tr><td><code>agentConfig</code></td><td>object</td><td></td><td>Agent配置项，仅在createAgent操作时使用</td></tr>
<tr><td><code>agentConfig.agentName</code></td><td>string</td><td>是</td><td>Agent名称，用于生成BotId</td></tr>
<tr><td><code>agentConfig.botTag</code></td><td>string</td><td></td><td>Bot标签，用于生成BotId，不提供时自动生成</td></tr>
<tr><td><code>agentConfig.description</code></td><td>string</td><td></td><td>Agent描述信息</td></tr>
<tr><td><code>agentConfig.template</code></td><td>string</td><td></td><td>Agent模板类型，默认为blank（空白模板） 默认值: "blank"</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>强制操作开关，用于跳过确认提示。默认false（需要确认），设置为true时跳过所有确认步骤。删除操作时强烈建议设置为true以避免误操作 默认值: false</td></tr>
<tr><td><code>serverType</code></td><td>string</td><td></td><td>服务类型配置：function=函数型云托管（仅支持Node.js，有特殊的开发要求和限制，适合简单的API服务），container=容器型服务（推荐使用，支持任意语言和框架如Java/Go/Python/PHP/.NET等，适合大多数应用场景）。不提供时自动检测：1)现有服务类型 2)有Dockerfile→container 3)有@cloudbase/aiagent-framework依赖→function 4)其他情况→container 可填写的值: "function", "container"</td></tr>
</tbody>
</table>

---

### `queryGateway`
网关域统一只读入口。通过 action 查询网关域名、访问入口和目标暴露情况。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>只读操作类型，例如 getAccess、listDomains 可填写的值: "getAccess", "listDomains"</td></tr>
<tr><td><code>targetType</code></td><td>string</td><td></td><td>目标资源类型。当前支持 function，后续可扩展 可填写的值: "function"</td></tr>
<tr><td><code>targetName</code></td><td>string</td><td></td><td>目标资源名称。getAccess 时必填</td></tr>
</tbody>
</table>

---

### `manageGateway`
网关域统一写入口。通过 action 创建目标访问入口，后续承接更通用的网关配置能力。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>写操作类型，例如 createAccess 可填写的值: "createAccess"</td></tr>
<tr><td><code>targetType</code></td><td>string</td><td>是</td><td>目标资源类型。当前支持 function，后续可扩展 可填写的值: "function"</td></tr>
<tr><td><code>targetName</code></td><td>string</td><td>是</td><td>目标资源名称</td></tr>
<tr><td><code>path</code></td><td>string</td><td></td><td>访问路径，默认 /&#123;targetName&#125;</td></tr>
<tr><td><code>type</code></td><td>string</td><td></td><td>函数接入类型 可填写的值: "Event", "HTTP"</td></tr>
<tr><td><code>auth</code></td><td>boolean</td><td></td><td>是否开启鉴权</td></tr>
</tbody>
</table>

---

### `downloadRemoteFile`
下载远程文件到项目根目录下的指定相对路径。例如：小程序的 Tabbar 等素材图片，必须使用 **png** 格式，可以从 Unsplash、wikimedia【一般选用 500 大小即可、Pexels、Apple 官方 UI 等资源中选择来下载。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>url</code></td><td>string</td><td>是</td><td>远程文件的 URL 地址</td></tr>
<tr><td><code>relativePath</code></td><td>string</td><td>是</td><td>相对于项目根目录的路径，例如：'assets/images/logo.png' 或 'docs/api.md'。不允许使用 ../ 等路径遍历操作。</td></tr>
</tbody>
</table>

---

### `readSecurityRule`
读取指定资源（noSQL 数据库、SQL 数据库、云函数、存储桶）的安全规则和权限类别。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>resourceType</code></td><td>string</td><td>是</td><td>资源类型：noSqlDatabase=noSQL 数据库，sqlDatabase=SQL 数据库，function=云函数，storage=存储桶 可填写的值: "noSqlDatabase", "sqlDatabase", "function", "storage"</td></tr>
<tr><td><code>resourceId</code></td><td>string</td><td>是</td><td>资源唯一标识。noSQL 数据库为集合名，SQL 数据库为表名，云函数为函数名，存储为桶名（完整格式如 '6169-xxx-1257473911'，可通过 envQuery action=info 获取 EnvInfo.Storages[].Bucket）。</td></tr>
</tbody>
</table>

---

### `writeSecurityRule`
设置指定资源（数据库集合、云函数、存储桶）的安全规则。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>resourceType</code></td><td>string</td><td>是</td><td>资源类型：sqlDatabase=SQL 数据库，noSqlDatabase=noSQL 数据库，function=云函数，storage=存储桶 可填写的值: "sqlDatabase", "noSqlDatabase", "function", "storage"</td></tr>
<tr><td><code>resourceId</code></td><td>string</td><td>是</td><td>资源唯一标识。sqlDatabase=表名，noSqlDatabase=集合名，云函数为函数名，存储为桶名（完整格式如 '6169-xxx-1257473911'，可通过 envQuery action=info 获取 EnvInfo.Storages[].Bucket）。</td></tr>
<tr><td><code>aclTag</code></td><td>string</td><td>是</td><td>权限类别 可填写的值: "READONLY", "PRIVATE", "ADMINWRITE", "ADMINONLY", "CUSTOM"</td></tr>
<tr><td><code>rule</code></td><td>string</td><td></td><td>自定义安全规则内容，仅当 aclTag 为 CUSTOM 时必填</td></tr>
</tbody>
</table>

---

### `activateInviteCode`
云开发 AI编程激励计划，通过邀请码激活用户激励。

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>InviteCode</code></td><td>string</td><td>是</td><td>待激活的邀请码</td></tr>
</tbody>
</table>

---

### `callCloudApi`
通用的云 API 调用工具，使用前请务必先阅读相关rules或skills，确认所需服务、Action 与 Param 的正确性和安全性

#### 参数

<table>
<thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
<tbody>
<tr><td><code>service</code></td><td>string</td><td>是</td><td>选择要访问的服务，必须先查看规则/技能确认是否可用。可选：tcb、scf、sts、cam、lowcode、cdn、vpc。 可填写的值: "tcb", "scf", "sts", "cam", "lowcode", "cdn", "vpc"</td></tr>
<tr><td><code>action</code></td><td>string</td><td>是</td><td>具体 Action 名称，需符合对应服务的 API 定义。</td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td>Action 对应的参数对象，键名需与官方 API 定义一致。某些 Action 需要携带 EnvId 等信息，如不清楚请在调用前查看rules/skill。</td></tr>
</tbody>
</table>

---
