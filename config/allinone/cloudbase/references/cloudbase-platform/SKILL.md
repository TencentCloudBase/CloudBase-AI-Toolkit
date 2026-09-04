---
name: cloudbase-platform
description: CloudBase platform overview and routing guide. This skill should be used when users need high-level capability selection, platform concepts, console navigation, or cross-platform best practices before choosing a more specific implementation skill.
version: 2.33.0
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

**Cross-cutting protocols** (required before code changes or deployments):
- Change Safety Protocol: `references/protocols/change-safety-protocol.md`
- Deployment Gate: `references/protocols/deployment-gate.md`
- Sensitive Runtime Data Protection: `references/protocols/sensitive-runtime-data-protection.md`

## Activation Contract

### Use this first when

- The user asks which CloudBase capability, service, or tool to use, or needs a high-level understanding of hosting, storage, authentication, cloud functions, or database options.
- The task is about console navigation, cross-platform differences, permission models, or platform-level best practices before implementation.

### Read before writing code if

- It is still unclear whether the task belongs to Web, mini program, cloud functions, storage, MySQL / NoSQL, or auth.
- The response needs platform selection, conceptual explanation, or control-plane navigation more than direct implementation steps.

### Then also read

- Minimal Web + database demo (BaaS-first, no cloud functions by default) -> `../minimal-web-baas-demo/SKILL.md`
  - **Stack order for 最小前后端 / Lovable-like demos:** Web SDK CRUD > MCP schema > template warmup during credential wait > cloud functions (default count = 0). Capability sniff: connector ready → `envQuery` → lock one DB plane → MCP schema → `@cloudbase/js-sdk` CRUD → preview.
- Web app implementation -> `../web-development/SKILL.md`
- Web auth and provider setup -> `../auth-tool-cloudbase/SKILL.md`, `../auth-web-cloudbase/SKILL.md`
- Mini program development -> `../miniprogram-development/SKILL.md`
- WeChat Pay, Official Account OAuth, JSAPI Pay, or Native QR-code Pay through CloudBase Integration Center -> `../cloudbase-wechat-integration/SKILL.md` (official docs: `https://docs.cloudbase.net/integration/introduce/index.md`)
- Cloud functions -> `../cloud-functions/SKILL.md`
- Official HTTP API clients -> `../http-api-cloudbase/SKILL.md`
- Document database -> `../cloudbase-document-database-web-sdk/SKILL.md` or `../cloudbase-document-database-in-wechat-miniprogram/SKILL.md`
- CloudBase PostgreSQL / PG -> `../postgresql-development-cloudbase/SKILL.md`
- MySQL relational database / data modeling -> `../relational-database-mcp-cloudbase/SKILL.md` or `../data-model-creation/SKILL.md`
- Cloud storage -> `../cloud-storage-web/SKILL.md`

### Do NOT use for

- Direct implementation of web pages, auth flows, functions, or database operations when a more specific skill already fits.
- Low-level API parameter references or SDK recipes that belong in specialized skills.

### Common mistakes / gotchas

- Treating this general skill as the default entry point for all CloudBase development.
- Staying here after the correct implementation skill is already clear.
- Mixing platform overview with platform-specific API shapes or SDK details.
- Using this overview skill as a detour in an existing application where the active auth, storage, and data files are already obvious.
- Making code or configuration changes without first following the Change Safety Protocol (`cloudbase-platform/references/protocols/change-safety-protocol.md`).
- Starting any deployment, publish, custom domain, or CloudRun work without first completing the checks in `cloudbase-platform/references/protocols/deployment-gate.md`.
- Echoing `x-cloudbase-context`, full `req.headers`, or `process.env` from Cloud Functions / CloudRun (including httpbin-style debug images) — follow `references/protocols/sensitive-runtime-data-protection.md`.
- **Confusing security domains with custom domains**: these are two different tools for different purposes. See the "Domain Management Tools" table below for the authoritative split.

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
   - Prefer `@cloudbase/js-sdk` direct DB access for browser CRUD; use cloud functions only for secrets, scheduled/background jobs, or elevated cross-collection logic that security rules / RLS cannot express (see `../minimal-web-baas-demo/SKILL.md` for the demo default)

3. **Use correct SDKs and APIs**
   - Different platforms require different SDKs for data models
   - MySQL data models must use models SDK, not collection API
   - PostgreSQL / CloudBase PG work must route to `postgresql-development-cloudbase`; do not reuse NoSQL `app.database()` / `db.collection(...)` snippets or MySQL `queryMysqlDatabase` / `manageMysqlDatabase` for PG data paths
   - Use `envQuery` tool to get environment ID
   - In an existing Web application with fixed structure, inspect the existing `src/lib/backend.*`, `src/lib/auth.*`, `src/lib/*service.*`, and bound page handlers before broad concept reading.

4. **Use the canonical CloudBase MCP setup from the main `cloudbase` guideline**
   - This platform overview intentionally does **not** duplicate the full MCP / mcporter config block
   - For the canonical config snippet, CLI commands, and auth examples, read the main `cloudbase` guideline first
   - Keep the same core rules here: prefer MCP when tools are available in this session; if not, configure MCP for next session and use `tcb` CLI now (`../cloudbase-cli/SKILL.md`, `../cloudbase/references/tooling-fallback.md`). Inspect tool schemas before MCP execution. Do not hard-code Secret ID / Secret Key / Env ID in config
   - Keep the auth split explicit: management-side login uses `auth`, while application-side auth configuration uses `queryAppAuth` / `manageAppAuth`

---

# CloudBase Platform Knowledge

### Domain Management Tools: Clear Distinction

When working with domain-related tasks, use the correct tool based on the requirement:

| Requirement | Tool | Parameters | Purpose |
|-------------|------|------------|---------|
| **Security Domain (安全域名)** | `manageEnv(action="addSecurityDomain" \| "removeSecurityDomain")` | `domains` (array of host:port strings) | CORS/request source validation for browser uploads. No certificate involved. (Deprecated alias: `envDomainManagement`.) |
| **Reuse existing Custom Domain** | `queryGateway(listCustomDomains)` → `manageGateway(createRoute)` | `domain` = existing custom domain; route fields | Expose a service/path on an already-bound custom domain. **No certificateId.** Prefer this when a custom domain already exists. |
| **Bind new Custom Domain (自定义域名)** | `manageGateway(action="bindCustomDomain")` | `domain` (string), `certificateId` (string) | First-time bind of a new public HTTPS domain. Requires certId from SSL console. |
| **Delete Custom Domain** | `manageGateway(action="deleteCustomDomain")` | `domain` (string) | Remove custom domain binding (only after routes on that domain are deleted). |
| **Disable / enable gateway route** | `manageGateway(action="disableRoute" \| "enableRoute")` | `path` (required), prefer explicit `domain` | Toggle `Routes[].Enable` via `ModifyHTTPServiceRoute` (not `ModifyGatewayRoute`). |
| **Disable static hosting default domain** | `queryGateway(listRoutes)` → `manageGateway(disableRoute)` | `domain` = `*.tcloudbaseapp.com` (`DomainType=STATIC_STORE`, `IsDefault=true`), usually `path="/"` | Turns off public access on the shared hosting CDN default host. **Do not use `manageHosting`.** |

**Key indicators for choosing the right tool:**
- Task mentions "自定义域名访问" but env already has a custom domain → `listCustomDomains` then `createRoute(domain=...)` (no certificateId)
- Task mentions "certificate ID" or "SSL" **and** needs to bind a **new** domain → `manageGateway(action="bindCustomDomain")`
- Task mentions "浏览器上传" or "CORS" or "安全域名" → Use `manageEnv(action="addSecurityDomain" / "removeSecurityDomain")`
- Task mentions "public access" or "HTTPS" with domain → Prefer reuse via `createRoute` when possible; only `bindCustomDomain` for first-time domain bind
- Task mentions "关闭/禁用静态托管默认域名" / `*.tcloudbaseapp.com` → `queryGateway(listRoutes)` then `manageGateway(disableRoute)` with that STATIC_STORE domain; never invent `ModifyGatewayRoute`

### Error Code Troubleshooting: Route Through Official Docs

When a CloudBase tool call fails and the error message contains a specific error code (pattern `Category.Code`, e.g. `OperationDenied.FreePackageDenied`, `ResourceNotFound.*`), **always route through the official docs before acting — do not guess the meaning, do not hardcode fix recipes here**:

1. Extract the error code from the error message.
2. Look it up: `searchKnowledgeBase(mode="docs", action="searchDocs", query="<错误码>")` — official docs search covers error-code pages. Act on the documented meaning and the fix steps the doc prescribes (plan limits → upgrade guidance, misconfiguration → config fix, etc.).
3. If docs search returns nothing, fall back to the canonical error-code pages:
   - Error code basics & self-service troubleshooting: `https://docs.cloudbase.net/error-code/basic`
   - Control-plane cloud API error codes: `https://cloud.tencent.com/document/product/876/34823`
4. Never assert capability-per-plan or error-code semantics from memory — official docs and the console plan comparison are the only authoritative sources. Example: for Web 安全域名 plan requirements, cite `https://cloud.tencent.com/document/product/876/127357` rather than assuming which tier unlocks it.

### Recording Operation Results

When a task explicitly requires recording operation steps or results to a file (e.g., `RESULT.json`): perform the tool calls first, then write a complete record containing every attempt (action, success/failure, message) plus a `summary` with total / succeeded / failed counts. Do not write the file from memory before the calls finish.

## Storage and Hosting

1. **Static Hosting vs Cloud Storage**:
   - CloudBase static hosting and cloud storage are two different buckets
   - Generally, publicly accessible files can be stored in static hosting, which provides a public web address
   - Static hosting supports custom domain configuration (requires console operation)
   - Cloud storage is suitable for files with privacy requirements, can get temporary access addresses via temporary file URLs
   - If the task needs COS SDK polling, file metadata lookup, or temporary URLs for an uploaded object, use cloud storage tools (`manageStorage` / `queryStorage`), not `manageHosting(action="upload")`

2. **Static Hosting Domain**:
   - CloudBase static hosting domain and website document config can be obtained via `queryHosting(action="websiteConfig")`
   - Combine with static hosting file paths to construct final access addresses
   - Default shared host looks like `<envId>-<appId>.tcloudbaseapp.com` (`DomainType=STATIC_STORE`, often `IsDefault=true` in `queryGateway(listRoutes)`)
   - To **disable** that default public host: `manageGateway(action="disableRoute", domain="<that-host>", path="/")` (or `updateRoute` with `enable=false`). Re-enable with `enableRoute`. Do **not** look for a `manageHosting` disable-default-domain action; do **not** call non-existent `ModifyGatewayRoute` — the API is `ModifyHTTPServiceRoute`
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

2. **Environment Management (via manageEnv)**:
   The `manageEnv` tool provides full lifecycle management for CloudBase environments.

   | Action | Description | Key Parameters |
   |--------|-------------|----------------|
   | `listPackages` | Query available plans | (none) |
   | `create` | Create new environment (needs confirm) | `alias`, `packageId`, `resources`, `duration` |
   | `modifyPlan` | Change plan (upgrade/downgrade, needs confirm) | `envId`, `packageId` |
   | `renew` | Renew environment (needs confirm) | `envId`, `duration` |

   **Creating an environment with specific resources:**
   ```
   manageEnv(action="create", alias="my-env", packageId="baas_personal",
             resources=["flexdb","storage","function","postgresql"], confirm="yes")
   ```

   - **`resources`** (optional, create only): controls which CloudBase capabilities to enable:
     - `flexdb` — Document database (NoSQL)
     - `storage` — Cloud Storage
     - `function` — Cloud Functions
     - `postgresql` — PostgreSQL relational database (PG mode)
   - Defaults to all four when omitted. MCP always sends non-empty `Resources` to CreateEnv.
   - Do **not** pass `region`: CreateEnv does not accept Region; environment region is determined by account/package.
   - ⚠️ **All paid operations** (create / modifyPlan / renew) require `confirm="yes"`.

   **Querying available packages before creating:**
   ```
   manageEnv(action="listPackages")
   ```

   **Changing plan (e.g. personal → standard):**
   ```
   manageEnv(action="modifyPlan", envId="your-env-id", packageId="baas_pf_standard", confirm="yes")
   ```

   **Renewing an environment:**
   ```
   manageEnv(action="renew", envId="your-env-id", duration=1, confirm="yes")
   ```

## Authentication Best Practices

**Important: Authentication methods for different platforms are completely different, must strictly distinguish!**

### Web Authentication
- **Must use SDK built-in authentication**: CloudBase Web SDK provides complete authentication features
- **Recommended method**: SMS login with `auth.getVerification()`, for detailed, refer to web auth related docs
- **Forbidden behavior**: Do not use cloud functions to implement login authentication logic
- **Session management**: For route guards and login proof, use `auth.getSession()` and require `data.session`; do not use deprecated `getLoginState()` or `auth.getUser()` / `auth.getCurrentUser()` as proof of real login.
- **Provider and login-method setup**: Use `queryAppAuth` / `manageAppAuth`, not the MCP `auth` tool
- **Anonymous login is disabled by default.** Publishable `accessKey` alone does **not** create a gateway-authenticated anonymous session. With `@cloudbase/js-sdk` **3.x**, call `await auth.signInAnonymously()` (or an equivalent authenticated session) **before** NoSQL `app.database()` CRUD, or the gateway returns **401**. If the app uses AuthGuard or RLS for access control, ensure `is_anonymous` checks are in place when anonymous access is allowed.
- **⚠️ PG RLS: Use `auth.uid()`, NOT `current_user`.** When writing RLS policies for CloudBase PostgreSQL, the user identity must use `auth.uid()` (returns the JWT `sub` / actual user ID as **`text`**, not `uuid` — unlike Supabase). Prefer owner columns as `varchar(64)` / `text`; if the column is `uuid`, cast with `auth.uid()::uuid` or you get `operator does not exist: uuid = text`. Do NOT use `current_user` or `current_setting(...)` — these PostgreSQL built-in functions return the database role name (e.g. `authenticated`), not the CloudBase auth user ID. CloudBase PG provides four auth helper functions: `auth.uid()`, `auth.role()`, `auth.email()`, `auth.jwt()`. Verify availability with `SELECT proname FROM pg_proc WHERE pronamespace = 'auth'::regnamespace`.

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
   - If permissions were just changed, retry after a few seconds (typically within ~30s). Do not blind-wait 2-5 minutes. If it still fails, re-check the actual rule shape and active client write pattern first — most failures are misconfigured rules, not cache.
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
   - Prefer security rules / RLS and client SDK when the permission model allows it
   - Use cloud functions when the operation needs elevated privileges, server secrets, or multi-collection logic that rules cannot express
   - For minimal Web demos (Todo / Notes / Kanban / 最小前后端), do **not** introduce cloud functions for CRUD — follow `../minimal-web-baas-demo/SKILL.md`

## Role Management (MCP)

CloudBase MCP provides role management via `queryPermissions` and `managePermissions` (CLI equivalent: `tcb role`). See each tool's schema for the full action list.

**⚠️ CRITICAL: Role policies and resource permissions are two independent systems with NO automatic synchronization.**

- Resource permissions (security rules) control access to specific resources (tables, collections, functions, storage)
- Roles (identity dimension) control policy bundles and member assignments

**Query** (`queryPermissions`): `listRoles`, `getRole` (by `roleId` / `roleIdentity` / `roleName`).
**Manage** (`managePermissions`): `createRole`, `updateRole`, `deleteRoles`, `addRoleMembers`, `removeRoleMembers`, `addRolePolicies`, `removeRolePolicies`.

```
managePermissions(action="createRole", roleName="Developer", roleIdentity="developer",
                  policies=["FunctionsAccess"], memberUids=["user-uid-1"])
```

> ⚠️ Only custom roles can be deleted. System roles are read-only.

See also: CLI equivalent commands in `cloudbase-cli/references/permission.md`

3. **Cloud Function Optimization**:
   - Browser CRUD should not default to a cloud-function middleware layer; prefer `@cloudbase/js-sdk` → database (see `../minimal-web-baas-demo/SKILL.md`)
   - When cloud functions are truly required, keep the count minimal and scope each function to secrets, elevated privilege, or background work

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

After creating/deploying resources, provide corresponding console links. All console URLs follow the pattern: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/{path}` — replace `${envId}` with the real EnvId resolved via `envQuery` (resolve aliases first; see Environment and Authentication below), and resource names with actual values.

The CloudBase console is updated frequently. If a live, logged-in console shows a different hash path from this list, prefer the live console path over stale documentation and then update this skill to match.

### Entry points (one line each)

- Overview: `#/overview`
- Template Center: `#/cloud-template/market`
- Document Database: `#/db/doc` · Collections `#/db/doc/collection/${collectionName}` · Models `#/db/doc/model/${modelName}`
- MySQL Database: `#/db/mysql` · Tables `#/db/mysql/table/default/` (must be enabled in console first)
- Cloud Functions: `#/scf` · Detail `#/scf/detail?id=${functionName}&NameSpace=${envId}`
- CloudRun: `#/platform-run`
- Cloud Storage: `#/storage`
- AI+: `#/ai`
- Static Hosting: `#/static-hosting` (alt: `https://console.cloud.tencent.com/tcb/hosting`)
- Identity Authentication: `#/identity` · Login management `#/identity/login-manage` · Token management `#/identity/token-management`
- Weida Low-Code: `#/lowcode/apps`
- Logs & Monitoring: `#/devops/log`
- Environment Settings: `#/env/http-access` (security domains, CORS, env vars, quotas)

For configuration pages (like login management), guide users through the setup process rather than only dropping a link.

## Reference index

All packaged reference files (required for skill lint reachability):

- [protocols/change-safety-protocol.md](references/protocols/change-safety-protocol.md)
- [protocols/deployment-gate.md](references/protocols/deployment-gate.md)
- [protocols/sensitive-runtime-data-protection.md](references/protocols/sensitive-runtime-data-protection.md)
