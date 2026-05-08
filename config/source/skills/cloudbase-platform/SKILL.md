---
name: cloudbase-platform
description: CloudBase platform overview and routing guide. This skill should be used when users need high-level capability selection, platform concepts, console navigation, or cross-platform best practices before choosing a more specific implementation skill.
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudbase-platform/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

## Activation Contract

### Use this first when

- The user asks which CloudBase capability, service, or tool to use, or needs a high-level understanding of hosting, storage, authentication, cloud functions, or database options.
- The task is about console navigation, cross-platform differences, permission models, or platform-level best practices before implementation.

### Read before writing code if

- It is still unclear whether the task belongs to Web, mini program, cloud functions, storage, MySQL / NoSQL, or auth.
- The response needs platform selection, conceptual explanation, or control-plane navigation more than direct implementation steps.

### Then also read

- Web app implementation -> `../web-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`)
- Web auth and provider setup -> `../auth-tool/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-tool/SKILL.md`), `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`)
- Mini program development -> `../miniprogram-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/miniprogram-development/SKILL.md`)
- Cloud functions -> `../cloud-functions/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloud-functions/SKILL.md`)
- Official HTTP API clients -> `../http-api/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/http-api/SKILL.md`)
- Document database -> `../no-sql-web-sdk/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/no-sql-web-sdk/SKILL.md`) or `../no-sql-wx-mp-sdk/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/no-sql-wx-mp-sdk/SKILL.md`)
- Relational database / data modeling -> `../relational-database-tool/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/relational-database-tool/SKILL.md`) or `../data-model-creation/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/data-model-creation/SKILL.md`)
- Cloud storage -> `../cloud-storage-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloud-storage-web/SKILL.md`)

### Do NOT use for

- Direct implementation of web pages, auth flows, functions, or database operations when a more specific skill already fits.
- Low-level API parameter references or SDK recipes that belong in specialized skills.

### Common mistakes / gotchas

- Treating this general skill as the default entry point for all CloudBase development.
- Staying here after the correct implementation skill is already clear.
- Mixing platform overview with platform-specific API shapes or SDK details.
- Using this overview skill as a detour in an existing application where the active auth, storage, and data files are already obvious.
- **Confusing security domains with custom domains**: These are two completely different tools for different purposes:
  - `envDomainManagement` (action: create/delete) = Security domains (安全域名) for CORS/request source validation - used for browser upload whitelisting. Does NOT accept certificateId.
  - `manageGateway(action="bindCustomDomain")` = Custom domains (自定义域名) for public HTTPS access with SSL certificates - requires domain and certificateId parameters.

## When to use this skill

Use this skill for **CloudBase platform knowledge** when you need to:

- Understand CloudBase storage and hosting concepts
- Compare platform capabilities before implementation
- Understand cross-platform auth differences (Web vs Mini Program)
- Understand database permissions and access control
- Access CloudBase console management pages

**This skill provides foundational knowledge** that applies to all CloudBase projects, regardless of whether they are Web, Mini Program, or backend services.

---

## How to use this skill (for a coding agent)

1. **Understand platform differences**
   - Web and Mini Program have completely different authentication approaches
   - Must strictly distinguish between platforms
   - Never mix authentication methods across platforms
   - If the workspace is already an application with TODOs or prebuilt handlers, do not stay in platform overview mode. Move quickly to the concrete implementation skill and the existing files that own the flow.

2. **Follow best practices**
   - Use SDK built-in authentication features (Web)
   - Understand natural login-free feature (Mini Program)
   - Configure appropriate database permissions
   - Use cloud functions for cross-collection operations

3. **Use correct SDKs and APIs**
   - Different platforms require different SDKs for data models
   - MySQL data models must use models SDK, not collection API
   - Use `envQuery` tool to get environment ID
   - In an existing Web application with fixed structure, inspect the existing `src/lib/backend.*`, `src/lib/auth.*`, `src/lib/*service.*`, and bound page handlers before broad concept reading.

4. **Use the canonical CloudBase MCP setup from the main `cloudbase` guideline**
   - This platform overview intentionally does **not** duplicate the full MCP / mcporter config block
   - For the canonical config snippet, CLI commands, and auth examples, read the main `cloudbase` guideline first
   - Keep the same core rules here: use MCP first, inspect tool schemas before execution, and do not hard-code Secret ID / Secret Key / Env ID in config
   - Keep the auth split explicit: management-side login uses `auth`, while application-side auth configuration uses `queryAppAuth` / `manageAppAuth`

---

# CloudBase Platform Knowledge

### Domain Management Tools: Clear Distinction

When working with domain-related tasks, use the correct tool based on the requirement:

| Requirement | Tool | Parameters | Purpose |
|-------------|------|------------|---------|
| **Security Domain (安全域名)** | `envDomainManagement` | `action`, `domains` (array of host:port strings) | CORS/request source validation for browser uploads. No certificate involved. |
| **Custom Domain (自定义域名)** | `manageGateway(action="bindCustomDomain")` | `domain` (string), `certificateId` (string) | Public HTTPS access with SSL certificate. Requires certId from SSL console. |
| **Delete Custom Domain** | `manageGateway(action="deleteCustomDomain")` | `domain` (string) | Remove custom domain binding. |

**Key indicators for choosing the right tool:**
- Task mentions "certificate ID" or "SSL" → Use `manageGateway(action="bindCustomDomain")`
- Task mentions "浏览器上传" or "CORS" or "安全域名" → Use `envDomainManagement`
- Task mentions "public access" or "HTTPS" with domain → Use `manageGateway`

### Recording Operation Results

When a task explicitly requires recording operation steps or results to a file (e.g., `RESULT.json`):

1. Perform the tool calls first to get actual results
2. Collect all operation steps with their success/failure status
3. Write the complete record to the specified file in the required format
4. Include both successful operations and failed attempts with error messages

Example structure for operation recording:
```json
{
  "steps": [
    {"action": "listDomains", "success": true, "message": "Found 3 domains"},
    {"action": "bindDomain", "success": false, "message": "Certificate not found"}
  ],
  "summary": {
    "totalAttempted": 2,
    "succeeded": 1,
    "failed": 1
  }
}
```

## Storage and Hosting

1. **Static Hosting vs Cloud Storage**:
   - CloudBase static hosting and cloud storage are two different buckets
   - Generally, publicly accessible files can be stored in static hosting, which provides a public web address
   - Static hosting supports custom domain configuration (requires console operation)
   - Cloud storage is suitable for files with privacy requirements, can get temporary access addresses via temporary file URLs
   - If the task needs COS SDK polling, file metadata lookup, or temporary URLs for an uploaded object, use cloud storage tools (`manageStorage` / `queryStorage`), not `uploadFiles`

2. **Static Hosting Domain**:
   - CloudBase static hosting domain can be obtained via `getWebsiteConfig` tool
   - Combine with static hosting file paths to construct final access addresses
   - **Important**: If access address is a directory, it must end with `/`

3. **Cloud Storage Public URL**:
   - **CRITICAL**: `manageStorage(action=upload)` and `queryStorage(action=url)` return `temporaryUrl` which is a temporary signed URL that expires (default 1 hour). Do NOT use this as a permanent public URL.
   - To get the permanent public access URL for a cloud storage object:
     1. Call `envQuery(action=info)` to get environment details
     2. Extract the storage CDN domain from `EnvInfo.Storages[0].CdnDomain` (e.g., `your-env-id.tcb.qcloud.la`)
     3. Construct the public URL: `https://{CdnDomain}/{cloudPath}`
   - Example: If `CdnDomain` is `env-xxx.tcb.qcloud.la` and `cloudPath` is `uploads/avatar.jpg`, the public URL is `https://env-xxx.tcb.qcloud.la/uploads/avatar.jpg`
   - Note: The public URL is accessible only if the storage bucket ACL allows public read (default is `PRIVATE` which requires signed URLs)

## Environment and Authentication

1. **SDK Initialization**:
   - CloudBase SDK initialization requires environment ID
   - Can query environment ID via `envQuery` tool
   - If the user only provides an environment alias, nickname, or other short form, resolve it with `envQuery(action="list", alias=..., aliasExact=true)` first and use the returned full `EnvId`
   - Do not pass alias-like short forms directly into SDK init, `auth.set_env`, console URLs, or generated config files
   - For Web, always initialize synchronously:
     - `import cloudbase from "@cloudbase/js-sdk"; const app = cloudbase.init({ env: "your-full-env-id" });`
     - Do **not** use dynamic imports like `import("@cloudbase/js-sdk")` or async wrappers such as `initCloudBase()` with internal `initPromise`
   - Then proceed with login using a verified method (username/password, phone, email, or WeChat)

## Authentication Best Practices

**Important: Authentication methods for different platforms are completely different, must strictly distinguish!**

### Web Authentication
- **Must use SDK built-in authentication**: CloudBase Web SDK provides complete authentication features
- **Recommended method**: SMS login with `auth.getVerification()`, for detailed, refer to web auth related docs
- **Forbidden behavior**: Do not use cloud functions to implement login authentication logic
- **User management**: After login, get user information via `auth.getCurrentUser()`
- **Provider and login-method setup**: Use `queryAppAuth` / `manageAppAuth`, not the MCP `auth` tool

### Mini Program Authentication
- **Login-free feature**: Mini program CloudBase is naturally login-free, no login flow needed
- **User identifier**: In cloud functions, get `wxContext.OPENID` via wx-server-sdk
- **User management**: Manage user data in cloud functions based on openid
- **Forbidden behavior**: Do not generate login pages or login flow code

## Cloud Functions

1. **Node.js Cloud Functions**:
   - Node.js cloud functions need to include `package.json`, declaring required dependencies
   - Can use `manageFunctions(action="createFunction")` to create functions
   - Use `manageFunctions(action="updateFunctionCode")` to deploy cloud functions
   - Prioritize cloud dependency installation, do not upload node_modules
   - `functionRootPath` refers to the parent directory of function directories, e.g., `cloudfunctions` directory

## Database Permissions

**⚠️ CRITICAL: Always configure permissions BEFORE writing database operation code!**

1. **Permission Model**:
   - CloudBase database access has permissions
   - Default basic permissions include:
     - **READONLY**: Everyone can read, only creator/admin can write
     - **PRIVATE**: Only creator/admin can read/write
     - **ADMINWRITE**: Everyone can read, **only admin can write** (⚠️ NOT for Web SDK write!)
     - **ADMINONLY**: Only admin can read/write
     - **CUSTOM**: Fine-grained control with custom rules

2. **Platform Compatibility** (CRITICAL):
   - ⚠️ **Web SDK cannot use `ADMINWRITE` or `ADMINONLY` for write operations**
   - ✅ For user-generated content in Web apps, use **CUSTOM** rules
   - ✅ For admin-managed data (products, settings), use **READONLY**
   - ✅ Cloud functions have full access regardless of permission type

3. **Configuration Workflow**:
   ```
   Create collection → Configure security rules → Write code → Test
   ```
   - Use `managePermissions(action="updateResourcePermission")` to configure resource permissions
   - If permissions were just changed, allow a short propagation window (typically 2-5 minutes) before retesting, but do not assume every failure is cache. Re-check the actual rule shape and active client write pattern first.
   - See `no-sql-web-sdk/security-rules.md` for detailed `resourceType="noSqlDatabase"` examples only; do not treat `doc._openid`, `auth.openid`, query-subset validation, or `create` / `update` / `delete` JSON templates as generic rules for functions, storage, or SQL tables
   - Official references:
     - General security rules overview: `https://cloud.tencent.com/document/product/876/41802`
     - NoSQL database security rules: `https://docs.cloudbase.net/database/security-rules`
     - Cloud function security rules: `https://docs.cloudbase.net/cloud-function/security-rules`
     - Storage security rules: `https://docs.cloudbase.net/storage/security-rules`

Compatibility note:
- Canonical plugin name: `permissions`
- Legacy plugin aliases `security-rule`, `security-rules`, `secret-rule`, `secret-rules`, and `access-control` still resolve to the `permissions` plugin
- Legacy tools `readSecurityRule` / `writeSecurityRule` are removed; prefer `queryPermissions` / `managePermissions`

4. **Common Scenarios**:
   - **E-commerce products**: `READONLY` (admin manages via cloud functions)
   - **Shopping carts**: `CUSTOM` with `auth.uid` check (users manage their own)
   - **Orders**: `CUSTOM` with ownership validation
   - **System logs**: `PRIVATE` or `ADMINONLY`

5. **Cross-Collection Operations**:
   - If user has no special requirements, operations involving cross-database collections must be implemented via cloud functions

## Role Management (MCP)

CloudBase MCP provides role management capabilities through the `queryPermissions` and `managePermissions` tools. These are equivalent to the CLI `tcb role` commands.

**⚠️ CRITICAL: Role policies and resource permissions are two independent systems with NO automatic synchronization.**

- Resource permissions (security rules) control access to specific resources (tables, collections, functions, storage)
- Roles (identity dimension) control policy bundles and member assignments

### Available Actions

**Query Operations** (via `queryPermissions`):
| Action | Description |
|--------|-------------|
| `listRoles` | List all roles (system and custom) |
| `getRole` | Get detailed role information by roleId/roleIdentity/roleName |

**Management Operations** (via `managePermissions`):
| Action | Description |
|--------|-------------|
| `createRole` | Create a new custom role |
| `updateRole` | Update an existing role (add/remove policies or members) |
| `deleteRoles` | Delete one or more custom roles |
| `addRoleMembers` | Add members to a role |
| `removeRoleMembers` | Remove members from a role |
| `addRolePolicies` | Add policies to a role |
| `removeRolePolicies` | Remove policies from a role |

### Usage Examples

**List all roles:**
```
queryPermissions(action="listRoles")
```

**Get specific role details:**
```
queryPermissions(action="getRole", roleId="role-xxx")
# or by identity
queryPermissions(action="getRole", roleIdentity="dev_role")
# or by name
queryPermissions(action="getRole", roleName="Developer")
```

**Delete a custom role:**
```
managePermissions(action="deleteRoles", roleIds=["role-xxx"])
```

**Create a custom role:**
```
managePermissions(action="createRole", roleName="Developer", roleIdentity="developer", policies=["FunctionsAccess"], memberUids=["user-uid-1"])
```

**Update a role (add policies):**
```
managePermissions(action="updateRole", roleId="role-xxx", addPolicies=["StoragesAccess"])
```

> ⚠️ Note: Only custom roles can be deleted. System roles are read-only.

See also: CLI equivalent commands in `cloudbase-cli/references/permission.md`

3. **Cloud Function Optimization**:
   - If involving cloud functions, while ensuring security, can minimize the number of cloud functions as much as possible
   - For example: implement one cloud function for client-side requests, implement one cloud function for data initialization

## Data Models

1. **Get Data Model Operation Object**:
   - **Mini Program**: Need `@cloudbase/wx-cloud-client-sdk`, initialize `const client = initHTTPOverCallFunction(wx.cloud)`, use `client.models`
   - **Cloud Function**: Need `@cloudbase/node-sdk@3.10+`, initialize `const app = cloudbase.init({env})`, use `app.models`
   - **Web**: Need `@cloudbase/js-sdk`, initialize `const app = cloudbase.init({env})`, after login use `app.models`

2. **Data Model Query**:
   - Can call MCP `manageDataModel` tool to:
     - Query model list
     - Get model detailed information (including Schema fields)
     - Get specific models SDK usage documentation

3. **MySQL Data Model Invocation Rules**:
   - MySQL data models cannot use collection method invocation, must use data model SDK
   - **Wrong**: `db.collection('model_name').get()`
   - **Correct**: `app.models.model_name.list({ filter: { where: {} } })`
   - Use `manageDataModel` tool's `docs` method to get specific SDK usage

## Console Management

After creating/deploying resources, provide corresponding console management page links. All console URLs follow the pattern: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/{path}`.

The CloudBase console is updated frequently. If a live, logged-in console shows a different hash path from this document, prefer the live console path over stale documentation and then update this skill to match.

### Core Function Entry Points

1. **Overview (概览)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/overview`
   - Main dashboard showing environment status, resource usage, and quick access to key features
   - Displays overview of all CloudBase services and their status

2. **Template Center (模板中心)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/cloud-template/market`
   - Access project templates for React, Vue, Mini Program, UniApp, and backend frameworks
   - AI Builder templates for rapid application generation
   - Framework templates: React, Vue, Miniapp, UniApp, Gin, Django, Flask, SpringBoot, Express, NestJS, FastAPI

3. **Document Database (文档型数据库)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/doc`
   - Manage NoSQL document database collections
   - **Collection Management**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/doc/collection/${collectionName}`
     - View, edit, and manage collection data
     - Configure security rules and permissions
   - **Data Model Management**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/doc/model/${modelName}`
     - Create and manage data models with relationships
     - View model schema and field definitions

4. **MySQL Database (MySQL 数据库)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/mysql`
   - Manage MySQL relational database
   - **Table Management**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/mysql/table/default/`
     - Create, modify, and manage database tables
     - Execute SQL queries and manage table structure
   - **Important**: Must enable MySQL database in console before use

5. **Cloud Functions (云函数)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/scf`
   - Manage and deploy Node.js cloud functions
   - **Function List**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/scf`
   - **Function Detail**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/scf/detail?id=${functionName}&NameSpace=${envId}`
     - View function code, logs, and configuration
     - Manage function triggers and environment variables
     - Monitor function invocations and performance

6. **CloudRun (云托管)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/platform-run`
   - Manage containerized backend services
   - Deploy services using Function mode or Container mode
   - Configure service scaling, access types, and environment variables
   - View service logs and monitoring data

7. **Cloud Storage (云存储)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/storage`
   - Manage file storage buckets
   - Upload, download, and organize files
   - Configure storage permissions and access policies
   - Generate temporary access URLs for private files

8. **AI+**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/ai`
   - Access AI capabilities and services
   - AI Builder for generating templates and code
   - AI image recognition and other AI features

9. **Static Website Hosting (静态网站托管)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/static-hosting`
   - Deploy and manage static websites
   - Alternative URL: `https://console.cloud.tencent.com/tcb/hosting`
   - Configure custom domains and CDN settings
   - View deployment history and access logs

10. **Identity Authentication (身份认证)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/identity`
    - Configure authentication methods and user management
    - **Login Management**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/identity/login-manage`
      - Enable/disable login methods (SMS, Email, Username/Password, WeChat, Custom Login)
      - Configure SMS/Email templates
      - Manage security domain whitelist
    - **Token Management**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/identity/token-management`
      - Manage API Keys and Publishable Keys
      - View and manage access tokens

11. **Weida Low-Code (微搭低代码)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/lowcode/apps`
    - Access Weida low-code development platform
    - Build applications using visual drag-and-drop interface

12. **Logs & Monitoring (日志监控)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/devops/log`
    - View logs from cloud functions, CloudRun services, and other resources
    - Monitor resource usage, performance metrics, and error rates
    - Set up alerts and notifications

13. **Environment Settings (环境配置)**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/env/http-access`
    - Configure environment-level settings
    - Manage security domains and CORS settings
    - Configure environment variables and secrets
    - View environment information and resource quotas

### URL Construction Guidelines

- **Base URL Pattern**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/{path}`
- **Replace Variables**: Always replace `${envId}` with the actual environment ID queried via `envQuery` tool
- **Alias Handling**: If the conversation only contains an alias or shorthand, first resolve it with `envQuery(action="list", alias=..., aliasExact=true)` and use the returned `EnvId`; if the alias is ambiguous or missing, ask the user to confirm before generating links
- **Resource-Specific URLs**: For specific resources (collections, functions, models), replace resource name variables with actual values
- **Usage**: After creating/deploying resources, provide these console links to users for management operations

### Quick Reference

When directing users to console pages:
- Use the full URL with environment ID
- Explain what they can do on each page
- Provide context about why they need to access that specific page
- For configuration pages (like login management), guide users through the setup process
