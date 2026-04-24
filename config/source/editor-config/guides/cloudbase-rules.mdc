---
description: CloudBase AI Development Rules Guide - Provides scenario-based best practices to ensure development quality
globs: *
alwaysApply: true
inclusion: always
---

# CloudBase AI Development Rules Guide

## Activation Contract

This file is a compatibility projection of the CloudBase routing contract. Keep its semantics aligned with the CloudBase source guideline, and express routing with stable skill identifiers rather than repo-specific file paths.

## Existing Implementation First

When the workspace already contains an existing application with explicit TODO markers, fixed routes, or pre-created pages and services:

- Do **not** start with `ui-design`, design specs, or visual exploration unless the user explicitly asks for UI redesign.
- Do **not** broad-read unrelated skills first.
- First inspect the existing implementation surfaces that already own the flow, such as `src/lib/backend.*`, `src/lib/auth.*`, `src/lib/*service.*`, route guards, and the actual page or form handlers wired to submit buttons.
- Prefer implementing TODOs and fixing the real broken flow in-place over creating parallel helpers, extra demo pages, or detached example code.
- For login + CRUD applications, use the shortest path: inspect existing code -> verify provider readiness if required -> patch the active handlers -> validate the changed flow.

### Global must-read rules

- Identify the scenario first. Do not start implementation before reading the matching rule file.
- Login or registration request -> read `{auth-tool}` first, then the platform auth rule.
- Keep auth domains separate: management-side login uses `auth`; app-side auth configuration uses `queryAppAuth` / `manageAppAuth`.
- When writing MCP or tool results to a local file with a generic file-writing tool, pass text rather than raw objects. For JSON files, serialize first with `JSON.stringify(result, null, 2)` and write that string.
- If the file-writing tool says a parameter such as `content` expected a string but received an object, do not retry with the same raw object. Serialize the object first, then retry once with the serialized text, and make sure the retried call actually passes the serialized string rather than the original object.
- UI request -> read `rules/ui-design/rule.md` first and output the design specification before code.
- Native App / Flutter / React Native request -> route to `{http-api}`, not Web SDK rules.
- Cloud Function request -> route to `{cloud-functions}`, not `cloudrun-development`, unless the task explicitly needs container service behavior.
- Generated, mirrored, or IDE-specific artifacts are compatibility outputs, not the primary semantic source.

### High-priority routing table

| Scenario | Read first | Then read | Do NOT route to first | Must check before action |
|----------|------------|-----------|------------------------|--------------------------|
| Web login / registration | `{auth-tool}` | `{auth-web}`, `{web-development}` | `{cloud-functions}`, `{http-api}` | Provider status and publishable key |
| Mini program + CloudBase | `{miniprogram-development}` | `{auth-wechat}`, `{no-sql-wx-mp-sdk}` | `{auth-web}`, `{web-development}` | Whether the project uses `wx.cloud` |
| Native App / raw HTTP | `{http-api}` | `{auth-tool}`, `{relational-database-tool}` | `{auth-web}`, `{no-sql-web-sdk}` | SDK boundary, OpenAPI, auth method |
| Cloud Functions | `{cloud-functions}` | domain rule | `{cloudrun-development}` | Event vs HTTP function, runtime |
| CloudRun backend | `{cloudrun-development}` | domain rule | `{cloud-functions}` | Container boundary, Dockerfile, CORS |
| UI generation | `rules/ui-design/rule.md` | platform rule | backend-only rules | Design specification first |

## 🗂️ Rule File Path Resolution Strategy

**CRITICAL: All rule file paths in this document follow a smart resolution strategy to support multiple AI editors.**

### Path Resolution Rules

When this document references a rule file, try locations in this order:

1. **CodeBuddy Path**: `.codebuddy/rules/tcb/rules/{rule-name}/rule.md`
2. **Universal Path**: `rules/{rule-name}/rule.md`
3. **Fallback Search**: Use `search_file` with pattern `*{rule-name}*rule.md`

### Rule Name Mapping

| Rule Shorthand | Full Rule Name |
|----------------|----------------|
| `auth-tool` | Authentication Tool Configuration |
| `auth-web` | Web Authentication |
| `auth-wechat` | WeChat Mini Program Authentication |
| `auth-nodejs` | Node.js Authentication |
| `web-development` | Web Platform Development |
| `miniprogram-development` | Mini Program Platform Development |
| `cloudrun-development` | CloudRun Backend Development |
| `cloud-functions` | Cloud Functions Development |
| `http-api` | HTTP API Usage |
| `relational-database-tool` | MySQL Database Tool Operations |
| `relational-database-web` | MySQL Web SDK |
| `no-sql-web-sdk` | NoSQL Web SDK |
| `no-sql-wx-mp-sdk` | NoSQL WeChat Mini Program SDK |
| `cloudbase-platform` | CloudBase Platform Knowledge |
| `cloud-storage-web` | Cloud Storage Web SDK |
| `ui-design` | UI Design Guidelines |
| `spec-workflow` | Software Engineering Workflow |
| `data-model-creation` | Data Model Creation |
| `ai-model-web` | AI Model Calling (Web SDK) |
| `ai-model-nodejs` | AI Model Calling (Node SDK) |
| `ai-model-wechat` | AI Model Calling (WeChat Mini Program) |

### Usage Example

When you see "Read `{auth-web}` rule file" in this document:
- Try: `.codebuddy/rules/tcb/rules/auth-web/rule.md` first
- Then: `rules/auth-web/rule.md`
- Finally: Search with pattern `*auth-web*rule.md`

**Note**: Files already using `rules/` prefix (like `rules/ui-design/rule.md`) work universally across all editors and don't need path resolution.

---

## Quick Reference for AI

**⚠️ CRITICAL: Read this section first based on your project type**

### When Developing a Web Project:
1. **Environment Check**: Call `envQuery` tool first (applies to all interactions)
2. **⚠️ Existing Implementation Priority**: If the workspace already contains the target pages or services, inspect and patch the active handlers first instead of recreating parallel structure.
3. **⚠️ UI Design (CRITICAL, but only for visual work)**: **Read `rules/ui-design/rule.md` first only when the task actually asks for visual design generation or redesign.** If the workspace already has fixed structure and the task is functional completion, prioritize wiring the current pages and handlers instead of producing a design specification.
4. **Core Capabilities**: Read Core Capabilities section below (especially UI Design and Database + Authentication for Web)
5. **⚠️ Authentication Configuration Check (MANDATORY)**: **When user mentions ANY login/authentication requirement, MUST FIRST read `{auth-tool}` rule file (using path resolution strategy) and check/configure authentication providers BEFORE implementing frontend code**
6. **Platform Rules**: Read `{web-development}` rule file (using path resolution strategy) for platform-specific rules (SDK integration, static hosting, build configuration)
7. **Authentication**: Read `{auth-web}` rule file (using path resolution strategy) and `{auth-tool}` - **MUST use Web SDK built-in authentication**
8. **Database**:
   - NoSQL: `rules/no-sql-web-sdk/rule.md`
   - MySQL: `rules/relational-database-web/rule.md` + `rules/relational-database-tool/rule.md`

### When Developing a Mini Program Project:
1. **Environment Check**: Call `envQuery` tool first (applies to all interactions)
2. **⚠️ UI Design (CRITICAL)**: **MUST read `rules/ui-design/rule.md` FIRST before generating any page, interface, component, or style** - This is NOT optional. You MUST explicitly read this file and output the design specification before writing any UI code.
3. **Core Capabilities**: Read Core Capabilities section below (especially UI Design and Database + Authentication for Mini Program)
4. **Platform Rules**: Read `rules/miniprogram-development/rule.md` for platform-specific rules (project structure, WeChat Developer Tools, wx.cloud usage)
5. **Authentication**: Read `rules/auth-wechat/rule.md` - **Naturally login-free, get OPENID in cloud functions**
6. **Database**:
   - NoSQL: `rules/no-sql-wx-mp-sdk/rule.md`
   - MySQL: `rules/relational-database-tool/rule.md` (via tools)

### When Developing a Native App Project (iOS/Android/Flutter/React Native/etc.):
1. **Environment Check**: Call `envQuery` tool first (applies to all interactions)
2. **⚠️ Platform Limitation**: **Native apps (iOS, Android, Flutter, React Native, and other native mobile frameworks) do NOT support CloudBase SDK** - Must use HTTP API to call CloudBase capabilities
3. **⚠️ UI Design (CRITICAL)**: **MUST read `rules/ui-design/rule.md` FIRST before generating any page, interface, component, or style** - This is NOT optional. You MUST explicitly read this file and output the design specification before writing any UI code.
4. **Required Rules**:
   - **MUST read** `{http-api}` rule file (using path resolution strategy) - HTTP API usage for all CloudBase operations
   - **MUST read** `{relational-database-tool}` rule file (using path resolution strategy) - MySQL database operations (via tools)
   - **MUST read** `{auth-tool}` rule file (using path resolution strategy) - Authentication configuration
5. **Optional Rules**:
   - `rules/cloudbase-platform/rule.md` - Universal CloudBase platform knowledge
   - `rules/ui-design/rule.md` - UI design guidelines (if UI is involved)
6. **⚠️ Database Limitation**: **Only MySQL database is supported** for native apps. If users need to use MySQL database, **MUST prompt them to enable it in the console first**:
   - Enable MySQL database at: [CloudBase Console - MySQL Database](https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/mysql/table/default/)
   - Replace `${envId}` with the actual environment ID

---

## Core Capabilities (Must Be Done Well)

### 0. ⚠️ Configuration-First Principle (NEW - HIGHEST PRIORITY)

**🚨 MANDATORY: Always check and configure CloudBase services BEFORE implementing code**

**Authentication Trigger Words Detection:**

When user mentions ANY of these words, immediately read the auth-tool rule file:

- Phone login / SMS login / Mobile login
- Email login
- WeChat login / Wechat auth
- Username password login / User/pass login
- Anonymous login / Guest login
- Login / Register / Auth / Authentication / Sign in / Sign up

**Rule File Location Strategy:**

When you see `{rule-name}` notation in this document, apply the path resolution strategy from the top of this file:
1. Try `.codebuddy/rules/tcb/rules/{rule-name}/rule.md` first (CodeBuddy)
2. Then try `rules/{rule-name}/rule.md` (Other editors)
3. Use `search_file` with pattern `*{rule-name}*rule.md` if both fail

**Specific example for auth-tool:**
1. `.codebuddy/rules/tcb/rules/auth-tool/rule.md` (CodeBuddy)
2. `rules/auth-tool/rule.md` (Other editors: Cursor, WindSurf, etc.)
3. Use `search_file` with pattern `*auth-tool*rule.md` if both fail

**Execution Sequence:**

1. **FIRST**: Read `{auth-tool}` rule file using the path resolution strategy
2. **SECOND**: Use `callCloudApi` to check current authentication configuration
3. **THIRD**: Prefer `queryAppAuth` / `manageAppAuth` to inspect or enable required authentication methods
4. **FOURTH**: Verify configuration is effective
5. **FIFTH**: Implement frontend authentication code

As the most important part of application development, the following four core capabilities must be done well, without needing to read different rules for different platforms:

### 1. ⚠️ UI Design (CRITICAL - Highest Priority)
**⚠️ MANDATORY: Must strictly follow `rules/ui-design/rule.md` rules for ALL design work**

**🚨 CRITICAL ENFORCEMENT: You MUST explicitly read the file `rules/ui-design/rule.md` before generating ANY UI code. This is NOT a suggestion - it is a MANDATORY requirement.**

**Before generating ANY page, interface, component, or style:**
1. **MUST FIRST explicitly read `rules/ui-design/rule.md` file** - Use file reading tools to read this file, do NOT skip this step
2. **MUST complete design specification output** before writing any code:
   - Purpose Statement
   - Aesthetic Direction (choose from specific options, NOT generic terms)
   - Color Palette (with hex codes, avoid forbidden colors)
   - Typography (specific font names, avoid forbidden fonts)
   - Layout Strategy (asymmetric/creative approach, avoid centered templates)
3. **MUST ensure** generated interfaces have distinctive aesthetic styles and high-quality visual design
4. **MUST avoid** generic AI aesthetics (common fonts, clichéd color schemes, templated designs)

**This applies to ALL tasks involving:**
- Page generation
- Interface creation
- Component design
- Style/visual effects
- Any frontend visual elements

**Exception**: If the task is an existing application with prebuilt pages and TODOs, and the user is asking to complete functionality rather than redesign visuals, do not detour into design-spec generation. Patch the existing implementation directly.

**⚠️ VIOLATION DETECTION: If you find yourself writing UI code without first reading `rules/ui-design/rule.md`, STOP immediately and read the file first.**

### 2. Database + Authentication
**Strengthen database and authentication capabilities**

**Authentication**:
- **Web Projects**:
  - Must use CloudBase Web SDK built-in authentication, refer to `rules/auth-web/rule.md`
  - Platform development rules: Refer to `rules/web-development/rule.md` for Web SDK integration, static hosting deployment, and build configuration
- **Mini Program Projects**:
  - Naturally login-free, get `wxContext.OPENID` in cloud functions, refer to `rules/auth-wechat/rule.md`
  - Platform development rules: Refer to `rules/miniprogram-development/rule.md` for mini program project structure, WeChat Developer Tools integration, and CloudBase capabilities
- **Node.js Backend**: Refer to `rules/auth-nodejs/rule.md`

**Database Operations**:
- **Web Projects**:
  - NoSQL Database: Refer to `rules/no-sql-web-sdk/rule.md`
  - MySQL Relational Database: Refer to `rules/relational-database-web/rule.md` (Web application development) and `rules/relational-database-tool/rule.md` (Management via tools)
  - Platform development rules: Refer to `rules/web-development/rule.md` for Web SDK database integration patterns
- **Mini Program Projects**:
  - NoSQL Database: Refer to `rules/no-sql-wx-mp-sdk/rule.md`
  - MySQL Relational Database: Refer to `rules/relational-database-tool/rule.md` (via tools)
  - Platform development rules: Refer to `rules/miniprogram-development/rule.md` for mini program database integration and wx.cloud usage

### 3. Static Hosting Deployment (Web)
**Refer to deployment process in `rules/web-development/rule.md`**
- Use CloudBase static hosting after build completion
- Deploy using `uploadFiles` tool
- `uploadFiles` is for static hosting only; use `manageStorage` / `queryStorage` when the task needs a COS object that must be queried by the storage SDK
- Remind users that CDN has a few minutes of cache after deployment
- Generate markdown format access links with random queryString

### 4. Backend Deployment (Cloud Functions or CloudRun)
- **Cloud Function Deployment**: Refer to `rules/cloud-functions/rule.md` - Prefer `queryFunctions` to inspect existing functions, then call `manageFunctions(action="createFunction")` or `manageFunctions(action="updateFunctionCode")` to deploy. **Important**: Runtime cannot be changed after creation, must select correct runtime initially.
  - Legacy compatibility: if older prompts mention `getFunctionList`, `createFunction`, or `updateFunctionCode`, map them to `queryFunctions` / `manageFunctions(...)` before execution.
- **CloudRun Deployment**: Refer to `rules/cloudrun-development/rule.md` - Use `manageCloudRun` tool for containerized deployment
- Ensure backend code supports CORS, prepare Dockerfile (for container type)

## Development Process Standards

**Important: To ensure development quality, AI must complete the following steps before starting work:**

### 0. Environment Check (First Step)
After user inputs any content, first check CloudBase environment status:
- Ensure current CloudBase environment ID is known
- If not present in conversation history, must call `envQuery` tool with parameter `action=info` to query current environment information and environment ID
- **Important**: When environment ID configuration is involved in code later, automatically use the queried environment ID, no need for manual user input

### 1. Scenario Identification
Identify current development scenario type, mainly for understanding project type, but core capabilities apply to all projects:
- **Web Projects**: React/Vue/native JS frontend projects
- **WeChat Mini Programs**: Mini program CloudBase projects
- **Native Apps**: Native mobile applications (iOS, Android, Flutter, React Native, etc.) that use HTTP API (no SDK support)
- **CloudRun Projects**: CloudBase Run backend service projects (supports any language: Java/Go/Python/Node.js/PHP/.NET, etc.)
- **Database Related**: Projects involving data operations
- **UI Design/Interface Generation**: Projects requiring interface design, page generation, prototype creation, component design, etc.
- **AI Model Integration**: Projects requiring AI capabilities (text generation, streaming responses, image generation)

### 2. Platform-Specific Quick Guide

**Web Projects - Required Rule Files:**
- `rules/web-development/rule.md` - Platform development rules (SDK integration, static hosting, build configuration)
- `rules/auth-web/rule.md` - Authentication (MUST use Web SDK built-in authentication)
- `rules/no-sql-web-sdk/rule.md` - NoSQL database operations
- `rules/relational-database-web/rule.md` - MySQL database operations (Web)
- `rules/relational-database-tool/rule.md` - MySQL database management (tools)
- `rules/cloud-storage-web/rule.md` - Cloud storage operations (upload, download, file management)
- `rules/cloudbase-platform/rule.md` - Universal CloudBase platform knowledge
- `rules/ai-model-web/rule.md` - AI model calling for Web apps (text generation, streaming)

**Mini Program Projects - Required Rule Files:**
- `rules/miniprogram-development/rule.md` - Platform development rules (project structure, WeChat Developer Tools, wx.cloud)
- `rules/auth-wechat/rule.md` - Authentication (naturally login-free, get OPENID in cloud functions)
- `rules/no-sql-wx-mp-sdk/rule.md` - NoSQL database operations
- `rules/relational-database-tool/rule.md` - MySQL database operations (via tools)
- `rules/cloudbase-platform/rule.md` - Universal CloudBase platform knowledge
- `rules/ai-model-wechat/rule.md` - AI model calling for Mini Program (text generation, streaming with callbacks)

**Native App Projects (iOS/Android/Flutter/React Native/etc.) - Required Rule Files:**
- **⚠️ `rules/http-api/rule.md`** - **MANDATORY** - HTTP API usage for all CloudBase operations (SDK not supported)
- **⚠️ `rules/relational-database-tool/rule.md`** - **MANDATORY** - MySQL database operations (via tools)
- **⚠️ Database Limitation**: Only MySQL database is supported. If users need MySQL, **MUST prompt them to enable it in console**: [Enable MySQL Database](https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/mysql/table/default/)

**Native App Projects (iOS/Android/Flutter/React Native/etc.) - Optional Rule Files:**
- `rules/cloudbase-platform/rule.md` - Universal CloudBase platform knowledge
- `rules/ai-model-nodejs/rule.md` - AI model calling via HTTP API (text generation, streaming, image generation)
- `rules/ui-design/rule.md` - UI design guidelines (if UI is involved)

**Universal Rule Files (All Projects):**
- **⚠️ `rules/ui-design/rule.md`** - **MANDATORY - HIGHEST PRIORITY** - Must read FIRST before any UI/page/component/style generation
- `rules/spec-workflow/rule.md` - Standard software engineering process (if needed)

### 3. Development Confirmation
Before starting work, suggest confirming with user:
1. "I identify this as a [scenario type] project"
2. "I will strictly follow core capability requirements and refer to relevant rule files"
3. "Please confirm if my understanding is correct"

## Core Behavior Rules
1. **Tool Priority**: For Tencent CloudBase operations, must prioritize using CloudBase tools
2. **Project Understanding**: First read current project's README.md, follow project instructions for development
4. **Directory Standards**: Before outputting project code in current directory, first check current directory files
5. **Development Order**: When developing, prioritize frontend first, then backend, ensuring frontend interface and interaction logic are completed first, then implement backend business logic
6. **⚠️ UI Design Rules Mandatory Application**: When tasks involve generating pages, interfaces, components, styles, or any frontend visual elements, **MUST FIRST explicitly read the file `rules/ui-design/rule.md` using file reading tools**, then strictly follow the rule file, ensuring generated interfaces have distinctive aesthetic styles and high-quality visual design, avoiding generic AI aesthetics. **You MUST output the design specification before writing any UI code.**
7. **Backend Development Priority Strategy**: When developing backend, prioritize using SDK to directly call CloudBase database, rather than through cloud functions, unless specifically needed (such as complex business logic, server-side computation, calling third-party APIs, etc.)
8. **Deployment Order**: When there are backend dependencies, prioritize deploying backend before previewing frontend
9. **Interactive Confirmation**: Use interactiveDialog to clarify when requirements are unclear, must confirm before executing high-risk operations
10. **Real-time Communication**: Use CloudBase real-time database watch capability
11. **⚠️ Authentication Rules**: When users develop projects, if user login authentication is needed, must use built-in authentication functions, must strictly distinguish authentication methods by platform
   - **Web Projects**: **MUST use CloudBase Web SDK built-in authentication** (e.g., `auth.toDefaultLoginPage()`), refer to `rules/auth-web/rule.md`
   - **Mini Program Projects**: **Naturally login-free**, get `wxContext.OPENID` in cloud functions, refer to `rules/auth-wechat/rule.md`
   - **Native Apps (iOS/Android)**: **MUST use HTTP API** for authentication, refer to `rules/http-api/rule.md` and Authentication API swagger
12. **⚠️ Authentication Configuration Mandatory Check**: When user mentions any authentication-related requirements:
   - **MUST FIRST read** `{auth-tool}` rule file using the path resolution strategy at the top of this document
   - **MUST FIRST check** current authentication configuration status
   - **MUST FIRST enable** required authentication methods
   - **MUST verify** configuration is effective
   - **ONLY THEN implement** frontend authentication code
13. **⚠️ Native App Development Rules**: When developing native mobile applications (iOS, Android, Flutter, React Native, and other native mobile frameworks):
   - **SDK Not Supported**: CloudBase SDK is NOT available for native apps, MUST use HTTP API
   - **Database Limitation**: Only MySQL database is supported via HTTP API
   - **MySQL Database Setup**: If users need MySQL database, MUST prompt them to enable it in console first at: [CloudBase Console - MySQL Database](https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/mysql/table/default/) (replace `${envId}` with actual environment ID)
   - **Required Rules**: MUST read `rules/http-api/rule.md` and `rules/relational-database-tool/rule.md`

## Development Workflow

### Development

1. **⚠️ UI Design Document Reading (MANDATORY)**: 
   - **Before generating ANY page, interface, component, or style, MUST FIRST explicitly read the file `rules/ui-design/rule.md` using file reading tools**
   - **MUST output the design specification** (Purpose Statement, Aesthetic Direction, Color Palette, Typography, Layout Strategy) before writing any UI code
   - This is NOT optional - you MUST read the file and follow the design thinking framework and frontend aesthetics guidelines
   - Avoid generating generic AI aesthetic style interfaces

3. **Mini Program TabBar Material Download - Download Remote Material Links**: Mini program Tabbar and other material images must use **png** format, must use downloadRemoteFile tool to download files locally. Can select from Unsplash, wikimedia (generally choose 500 size), Pexels, Apple official UI and other resources

If remote links are needed in the application, can continue to call uploadFile to upload and obtain temporary access links and cloud storage cloudId

3. **Query Professional Knowledge from Knowledge Base**: If uncertain about any CloudBase knowledge, can use searchKnowledgeBase tool to intelligently search CloudBase knowledge base (supports CloudBase and cloud functions, mini program frontend knowledge, etc.), quickly obtain professional documents and answers through vector search

4. **WeChat Developer Tools Open Project Workflow**:
- When detecting current project is a mini program project, suggest user to use WeChat Developer Tools for preview, debugging, and publishing
- Before opening, confirm project.config.json has appid field configured. If not configured, must ask user to provide it
- Use WeChat Developer built-in CLI command to open project (pointing to directory containing project.config.json):
  - Windows: `"C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" open --project "项目根目录路径"`
  - macOS: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project "/path/to/project/root"`
- Project root directory path is the directory containing project.config.json file

### Deployment Process

1. **Cloud Function Deployment Process**: Prefer `queryFunctions(action="listFunctions")` to inspect existing functions, then call `manageFunctions(action="createFunction")` or `manageFunctions(action="updateFunctionCode")` to deploy cloud function code. Only need to point `functionRootPath` to the parent directory of the cloud function directory (for example, the absolute path of the `cloudfunctions` directory). No need for code compression and other operations. The tools will automatically read files from same-name subdirectories under the parent directory and deploy them.

2. **Cloud Function Deployment Process**: For Node.js cloud functions, use `queryFunctions` to query, then call `manageFunctions(action="createFunction")` or `manageFunctions(action="updateFunctionCode")` to deploy. **Important**: Runtime cannot be changed after creation. For details, refer to `rules/cloud-functions/rule.md`
   - Legacy compatibility: if older materials still say `getFunctionList`, `createFunction`, or `updateFunctionCode`, treat them as aliases for the converged flow above.

3. **CloudRun Deployment Process**: For non-cloud function backend services (Java, Go, PHP, Python, Node.js, etc.), use manageCloudRun tool for deployment. Ensure backend code supports CORS, prepare Dockerfile, then call manageCloudRun for containerized deployment. For details, refer to `rules/cloudrun-development/rule.md`

4. **Static Hosting Deployment Process**: Deploy using uploadFiles tool. After deployment, remind users that CDN has a few minutes of cache. Can generate markdown format access links with random queryString. For details, refer to `rules/web-development/rule.md`

### Documentation Generation Rules

1. You will generate a README.md file after generating the project, containing basic project information, such as project name, project description. Most importantly, clearly explain the project architecture and involved CloudBase resources, so maintainers can refer to it for modification and maintenance
2. After deployment, if it's a web project, can write the official deployment access address in the documentation

### Configuration File Rules

1. To help others who don't use AI understand what resources are available, can generate a cloudbaserc.json file after generation

### Tool Interface Call Rules
When calling tool services, you need to fully understand the data types of all interfaces to be called, as well as return value types. If you're not sure which interface to call, first check the documentation and tool descriptions, then determine which interface and parameters to call based on the documentation and tool descriptions. Do not have incorrect method parameters or parameter type errors.

For example, many interfaces require a confirm parameter, which is a boolean type. If you don't provide this parameter, or provide incorrect data type, the interface will return an error.

### Environment ID Auto-Configuration Rules
- When generating project configuration files (such as `cloudbaserc.json`, `project.config.json`, etc.), automatically use the environment ID queried by `envQuery`
- If the conversation only provides an environment alias, nickname, or shorthand, first resolve it with `envQuery(action=list, alias=..., aliasExact=true)` and use the returned full `EnvId`
- Do not pass alias-like short forms directly into `auth.set_env`, SDK init, console links, or generated config files; if the alias is ambiguous or missing, stop and ask the user to confirm
- In code examples involving environment ID, automatically fill in current environment ID, no need for manual user replacement
- In deployment and preview related operations, prioritize using already queried environment information

## Professional Rule File Reference

**Note**: For detailed information, refer to the specific skill files. This section provides quick reference only.

### Platform Development Skills
- **Web**: `rules/web-development/rule.md` - SDK integration, static hosting, build configuration
- **Mini Program**: `rules/miniprogram-development/rule.md` - Project structure, WeChat Developer Tools, wx.cloud
- **Cloud Functions**: `rules/cloud-functions/rule.md` - Cloud function development, deployment, logging, HTTP access
- **CloudRun**: `rules/cloudrun-development/rule.md` - Backend deployment (functions/containers)
- **Platform (Universal)**: `rules/cloudbase-platform/rule.md` - Environment, authentication, services

### Authentication Skills
- **Web**: `rules/auth-web/rule.md` - **MUST use Web SDK built-in authentication**
- **Mini Program**: `rules/auth-wechat/rule.md` - **Naturally login-free, get OPENID in cloud functions**
- **Node.js**: `rules/auth-nodejs/rule.md`
- **Auth Tool (MCP)**: `rules/auth-tool/rule.md` - Configure and manage authentication providers (enable/disable login methods, setup provider settings) via MCP tools

### Database Skills
- **NoSQL (Web)**: `rules/no-sql-web-sdk/rule.md`
- **NoSQL (Mini Program)**: `rules/no-sql-wx-mp-sdk/rule.md`
- **MySQL (Web)**: `rules/relational-database-web/rule.md`
- **MySQL (Tool)**: `rules/relational-database-tool/rule.md`

### Storage Skills
- **Cloud Storage (Web)**: `rules/cloud-storage-web/rule.md` - Upload, download, temporary URLs, file management using Web SDK

### AI Skills
- **AI Model Calling (Web)**: `rules/ai-model-web/rule.md` - Call AI models in browser apps via @cloudbase/js-sdk. Supports text generation and streaming.
- **AI Model Calling (Node.js)**: `rules/ai-model-nodejs/rule.md` - Call AI models in backend/cloud functions via @cloudbase/node-sdk ≥3.16.0. Supports text generation, streaming, and image generation.
- **AI Model Calling (WeChat)**: `rules/ai-model-wechat/rule.md` - Call AI models in Mini Program via wx.cloud.extend.AI. Supports text generation and streaming with callbacks.

### 🎨 ⚠️ UI Design Skill (CRITICAL - Read FIRST)
- **`rules/ui-design/rule.md`** - **MANDATORY - HIGHEST PRIORITY**
  - **MUST read FIRST before generating ANY interface/page/component/style**
  - Design thinking framework, complete design process, frontend aesthetics guidelines
  - **NO EXCEPTIONS**: All UI work requires reading this file first

### Workflow Skills
- **Spec Workflow**: `rules/spec-workflow/rule.md` - Standard software engineering process (requirements, design, tasks)

## Development Quality Checklist

To ensure development quality, recommend completing the following checks before starting tasks:

### Recommended Steps
0. **[ ] Environment Check**: Call `envQuery` tool to check CloudBase environment status (applies to all interactions)
1. **[ ] Scenario Identification**: Clearly identify what type of project this is (Web/Mini Program/Database/UI/AI)
3. **[ ] Core Capability Confirmation**: Confirm all four core capabilities have been considered
   - UI Design: Have you explicitly read the file `rules/ui-design/rule.md` using file reading tools?
   - Database + Authentication: Have you referred to corresponding authentication and database skills?
   - Static Hosting Deployment: Have you understood the deployment process?
   - Backend Deployment: Have you understood cloud function or CloudRun deployment process?
4. **[ ] UI Design Rules Check (MANDATORY)**: If task involves generating pages, interfaces, components, or styles:
   - Have you explicitly read the file `rules/ui-design/rule.md` using file reading tools? (Required: YES)
   - Have you output the design specification before writing code? (Required: YES)
   - Have you understood and will follow the design thinking framework? (Required: YES)
5. **[ ] User Confirmation**: Confirm with user whether scenario identification and core capability understanding are correct
6. **[ ] Rule Execution**: Strictly follow core capability requirements and relevant rule files for development

### ⚠️ Common Issues to Avoid
- **❌ DO NOT skip reading UI design document** - Must explicitly read `rules/ui-design/rule.md` file before generating any UI code
- Avoid skipping core capabilities and starting development directly
- Avoid mixing APIs and authentication methods from different platforms
- Avoid ignoring UI design rules: All tasks involving interfaces, pages, components, styles must explicitly read and strictly follow `rules/ui-design/rule.md`
- Avoid ignoring database and authentication standards: Must use correct authentication methods and database operation methods
- Important technical solutions should be confirmed with users

### Quality Assurance
If development is found to not comply with standards, can:
- Point out specific issues
- Require re-execution of rule check process
- Clearly specify rule files that need to be followed

## CloudBase Console Entry Points

After creating/deploying resources, provide corresponding console management page links. All console URLs follow the pattern: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/{path}`


## Deployment Workflow

When users request deployment to CloudBase:

0. **Check Existing Deployment**:
   - Read README.md to check for existing deployment information
   - Identify previously deployed services and their URLs
   - Determine if this is a new deployment or update to existing services

1. **Backend Deployment (if applicable)**:
  - Only for Node.js cloud functions: deploy directly using `manageFunctions(action="createFunction")` / `manageFunctions(action="updateFunctionCode")`
    - Legacy compatibility: if older materials mention `createFunction`, `updateFunctionCode`, or `getFunctionList`, map them to the converged tools first
    - Before deploying, decide whether the function is Event or HTTP. Event Functions use `exports.main = async (event, context) => {}`.
     - HTTP Functions are standard web services: they must listen on port `9000`, include `scf_bootstrap`, and for Node.js should default to native `http.createServer((req, res) => { ... })`. Parse `req.url` and the streamed request body manually, set response headers explicitly, and do not write the function as `exports.main` unless you intentionally choose Functions Framework.
   - For other languages backend server (Java, Go, PHP, Python, Node.js): deploy to Cloud Run
   - Ensure backend code supports CORS by default
   - Prepare Dockerfile for containerized deployment
   - Use `manageCloudRun` tool for deployment
   - Set MinNum instances to at least 1 to reduce cold start latency

2. **Frontend Deployment (if applicable)**:
   - After backend deployment completes, update frontend API endpoints using the returned API addresses
   - Build the frontend application
   - Deploy to CloudBase static hosting using hosting tools

3. **Display Deployment URLs**:
   - Show backend deployment URL (if applicable)
   - Show frontend deployment URL with trailing slash (/) in path
   - Add random query string to frontend URL to ensure CDN cache refresh

4. **Update Documentation**:
   - Write deployment information and service details to README.md
   - Include backend API endpoints and frontend access URLs
   - Document CloudBase resources used (functions, cloud run, hosting, database, etc.)
   - This helps with future updates and maintenance


### Core Function Entry Points

1. **Overview (概览)**: `#/overview` - Main dashboard
2. **Template Center (模板中心)**: `#/cloud-template/market` - Project templates
3. **Document Database (文档型数据库)**: `#/db/doc` - NoSQL collections: `#/db/doc/collection/${collectionName}`, Models: `#/db/doc/model/${modelName}`
4. **MySQL Database (MySQL 数据库)**: `#/db/mysql` - Tables: `#/db/mysql/table/default/`
5. **Cloud Functions (云函数)**: `#/scf` - Function detail: `#/scf/detail?id=${functionName}&NameSpace=${envId}`
6. **CloudRun (云托管)**: `#/platform-run` - Container services
7. **Cloud Storage (云存储)**: `#/storage` - File storage
8. **AI+**: `#/ai` - AI capabilities
9. **Static Website Hosting (静态网站托管)**: `#/static-hosting`
10. **Identity Authentication (身份认证)**: `#/identity` - Login: `#/identity/login-manage`, Tokens: `#/identity/token-management`
11. **Weida Low-Code (微搭低代码)**: `#/lowcode/apps`
12. **Logs & Monitoring (日志监控)**: `#/devops/log`
13. **Extensions (扩展功能)**: `#/apis`
14. **Environment Settings (环境配置)**: `#/env`
