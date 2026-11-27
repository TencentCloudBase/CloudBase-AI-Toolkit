# MCP Tools

Currently includes 44 tools, grouped by function as follows.

Source data: [tools.json](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/blob/main/scripts/tools.json)

---

## Tool Overview

### Authentication & Login

- [`auth`](#auth)

### Environment Management

- [`queryEnv`](#queryenv)
- [`envDomainManagement`](#envdomainmanagement)

### Other

- [`manageEnv`](#manageenv)
- [`deployBuild`](#deploybuild)
- [`deployPlan`](#deployplan)
- [`deployApply`](#deployapply)
- [`queryApps`](#queryapps)
- [`manageApps`](#manageapps)
- [`prepareFeedback`](#preparefeedback)

### NoSQL Database

- [`readNoSqlDatabaseStructure`](#readnosqldatabasestructure)
- [`writeNoSqlDatabaseStructure`](#writenosqldatabasestructure)
- [`readNoSqlDatabaseContent`](#readnosqldatabasecontent)
- [`writeNoSqlDatabaseContent`](#writenosqldatabasecontent)

### Data Model

- [`manageDataModel`](#managedatamodel)
- [`modifyDataModel`](#modifydatamodel)

### PostgreSQL Database

- [`queryPgDatabase`](#querypgdatabase)
- [`managePgDatabase`](#managepgdatabase)

### PostgreSQL Storage

- [`queryPgStorage`](#querypgstorage)

### MySQL Database

- [`queryMysqlDatabase`](#querymysqldatabase)
- [`manageMysqlDatabase`](#managemysqldatabase)

### Cloud Functions

- [`queryFunctions`](#queryfunctions)
- [`manageFunctions`](#managefunctions)

### Static Hosting

- [`queryHosting`](#queryhosting)
- [`manageHosting`](#managehosting)

### Cloud Storage

- [`queryStorage`](#querystorage)
- [`manageStorage`](#managestorage)

### Templates & Files

- [`downloadTemplate`](#downloadtemplate)

### Search & Knowledge Base

- [`searchKnowledgeBase`](#searchknowledgebase)

### Cloud Run

- [`queryCloudRun`](#querycloudrun)
- [`manageCloudRun`](#managecloudrun)

### Gateway

- [`queryGateway`](#querygateway)
- [`manageGateway`](#managegateway)

### App Authentication

- [`queryAppAuth`](#queryappauth)
- [`manageAppAuth`](#manageappauth)

### Permissions

- [`queryPermissions`](#querypermissions)
- [`managePermissions`](#managepermissions)

### Logs

- [`queryLogs`](#querylogs)
- [`manageLogs`](#managelogs)

### AI Agent

- [`queryAgents`](#queryagents)
- [`manageAgents`](#manageagents)

### Cloud API

- [`callCloudApi`](#callcloudapi)

### Message Push

- [`queryMessagePush`](#querymessagepush)
- [`manageMessagePush`](#managemessagepush)

---

## Hosted MCP configuration

For hosted MCP, connect to the official endpoint with OAuth. No credential needs to be stored in a config file:

```json
{
  "mcpServers": {
    "cloudbase": {
      "type": "http",
      "url": "https://tcb-api.cloud.tencent.com/mcp/v1"
    }
  }
}
```

The client opens a browser on first connect for OAuth (Tencent Cloud login and environment selection), so the credential never lands in a config file. For the international site use `https://tcb-api.tencentcloud.com/mcp/v1`. See [Connection modes - Remote](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/connection-modes#remote-mode) for the full guide.

Clients without OAuth support (including CI/CD, where interactive authorization is impossible) pass a Tencent Cloud API key as a static credential in the request header; the environment variables below are not needed in that case either.

### Environment variables (self-hosted remote server only)

These variables inject credentials when you **self-host** the MCP server on your own machine (Cloud Mode deployment). They are not needed for the official hosted endpoint above:

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `TENCENTCLOUD_SECRETID` | Tencent Cloud SecretId | [Tencent Cloud API keys](https://console.cloud.tencent.com/cam/capi) |
| `TENCENTCLOUD_SECRETKEY` | Tencent Cloud SecretKey | [Tencent Cloud API keys](https://console.cloud.tencent.com/cam/capi) |
| `TENCENTCLOUD_SESSIONTOKEN` | Optional temporary STS token | Only for temporary credentials, via [STS](https://console.cloud.tencent.com/cam/capi) |
| `CLOUDBASE_ENV_ID` | CloudBase environment ID | [CloudBase console](https://tcb.cloud.tencent.com/dev) |

## Detailed Specification

### `auth`
CloudBase (Tencent CloudBase) dev-stage login and environment binding. Unsure where to start? Call auth(status) first (read-only, no arguments) to confirm the login state and the current environment. After login you can access cloud resources; an environment (env) is the isolation unit for cloud functions, databases, static hosting, etc. Other MCP tools operate on the bound environment. No environment yet? On the China site a new user can create a trial environment for free, then bind it with set_env. Supports: status, start_auth (login), login_by_api_key, set_env (bind env), logout. auth(status) returns credential_scope (account / single_env API Key) and current region; a single-env API Key can only see its bound envId — missing other-region envs is a permission boundary, not a missing environment. Optional site/region/lang params: site=domestic|intl, region=e.g. ap-shanghai|ap-singapore, lang=zh|en output language.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td></td><td>Action: status=query status, start_auth=start login, login_by_api_key=log in with an API Key, set_env=bind an environment (pass envId), logout=log out Allowed values: "status", "start_auth", "set_env", "logout", "get_temp_credentials", "login_by_api_key"</td></tr>
<tr><td><code>authMode</code></td><td>string</td><td></td><td>Authentication mode: device=device-code authorization, web=browser callback authorization Allowed values: "device", "web"</td></tr>
<tr><td><code>oauthEndpoint</code></td><td>string</td><td></td><td>Advanced optional setting: custom device-code login endpoint. When configured, oauthCustom defaults to true</td></tr>
<tr><td><code>clientId</code></td><td>string</td><td></td><td>Advanced optional setting: custom client_id for device-code login; the default is used when omitted</td></tr>
<tr><td><code>oauthCustom</code></td><td>boolean</td><td></td><td>Advanced optional setting: toggles the custom endpoint response format. Defaults to false without an endpoint and true when an endpoint is configured. Endpoints using the standard {code,result} wrapper format (such as the international-site tcb-api.tencentcloud.com) should explicitly pass false</td></tr>
<tr><td><code>site</code></td><td>string</td><td></td><td>Site: domestic=China site, intl=international site. For environments activated on Tencent Cloud International, login (start_auth/login_by_api_key) must explicitly pass intl; otherwise the China-site path is used and international-site environments are not visible. An explicit per-call value takes precedence over the TCB_SITE environment variable, region mapping, and project configuration, and affects the login endpoint, authorization page, and API Key exchange gateway Allowed values: "domestic", "intl"</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Environment ID (the unique CloudBase environment identifier). After binding, tools operate on this environment. Required when action=set_env</td></tr>
<tr><td><code>region</code></td><td>string</td><td></td><td>Region (such as ap-shanghai / ap-guangzhou / ap-singapore). Used for region-to-site inference and API Key exchange gateway selection; an explicit site takes precedence</td></tr>
<tr><td><code>lang</code></td><td>string</td><td></td><td>Output language: zh=Chinese (default), en=English. Overrides the instance language (createCloudBaseMcpServer lang option / TCB_LANG / project.json) Allowed values: "zh", "en"</td></tr>
<tr><td><code>apiKey</code></td><td>string</td><td></td><td>CloudBase API Key; required when action=login_by_api_key</td></tr>
<tr><td><code>apiKeyEnvId</code></td><td>string</td><td></td><td>CloudBase environment ID (EnvId); required when action=login_by_api_key to identify the environment the API Key belongs to</td></tr>
<tr><td><code>confirm</code></td><td>string</td><td></td><td>Confirmation for action=logout; pass yes Allowed values: const "yes"</td></tr>
<tr><td><code>reveal</code></td><td>boolean</td><td></td><td>Optional when action=get_temp_credentials. true returns plaintext temporary credentials; the default false returns only masked values</td></tr>
</tbody>
</table>

---

### `queryEnv`
Query CloudBase environment information: environment list, details of a specific environment, security domains, resource usage and monitoring metrics. For action=list, even when envId is passed, action=list still returns only a summary, never full resource details or expiry. An env-level credential (API Key / hosted authorization token) can only see its bound envId and returns credential_scope=single_env; in that case region plays no part in the query and is reported as such in ignored_params (AppliedFilters.region is null) — do not mistake that for a missing environment or a region filter that failed to apply. To query details of a known EnvId (including resource fields and billing info), you must use action=info and pass the target environment's envId. action=info appends BillingInfo when available (billing fields such as ExpireTime, PayMode, IsAutoRenew).

📊 action=usage returns the billing cycle and per-module resource-point usage, grouped by module.

📈 action=metrics queries time series for env/gateway QPS, cloud function invocations and errors, database CPU/memory/disk, CloudRun CPU/QPS, and more (CloudBase built-in monitoring, not Cloud Monitor GetMonitorData). startTime/endTime use the format YYYY-MM-DD HH:mm:ss and must be passed as a pair, defaulting to the last 24 hours when omitted; CloudRun Tke* metrics must pass the service name as resourceID. Do not use callCloudApi to guess monitoring Actions.

🔍 action=info also derives three fields used for backend selection (PG environments carry the instance form as well):
- `EnvInfo.RuntimeMode`: 'postgresql' or 'nosql', the backend recommended by default for new work (postgresql when PG is enabled, otherwise nosql).
- `EnvInfo.RuntimeBackends`: the three booleans `\{postgresql, nosql, mysql\}`, describing the backends that actually coexist in the current environment.
- `EnvInfo.RuntimeModeHints`: the API/tool/skill hints for each backend.
- `EnvInfo.PostgreSQL[].TenantType`: the PG instance form — `SHARED` (SDK / gateway access only) or `DEDICATED` (has the private host / TCP endpoint).

🌐 action=info also returns the route state of the default static domain, `StaticStorages[].staticDomainRouteEnabled` and `EnvInfo.staticDomainRouteEnabled` (same source as queryHosting websiteConfig); `StaticStorages[].StaticDomain` remains the nominal domain. `false` means the default static domain root route is disabled (requests return GATEWAY_ROUTE_DISABLED) — do not treat the nominal domain as a reachable URL.

Before writing business/permission/storage code, AI must check these three items first: in PG mode, new work should prefer `app.rdb()` + RLS (`managePgDatabase action=execute` running `CREATE POLICY`) + pgstore; existing NoSQL collections / legacy storage / `managePermissions(resourceType="noSqlDatabase")` remain valid in a classic PG environment. **Exception (pgdoc)**: when the document-database API is carried by PostgreSQL and client SDK calls stay unchanged, CUSTOM collection security rules do not take effect — use the four basic permissions or move validation into a cloud function. Do not rewrite existing document-database code into `app.rdb()`, and do not assume data was migrated automatically. `RuntimeBackends` lists provisioned resources only; it does not say who carries document requests, so confirm the enablement state with the user. What truly does not apply is MySQL and the data model tools: when `RuntimeBackends.mysql === false`, none of `manageMysqlDatabase` / `queryMysqlDatabase` / the `relational-database-mcp-cloudbase` skill should be used; `manageDataModel` / `modifyDataModel` only work in classic mode and have no PG counterpart.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Query type: list=environment list/summary filtering (filter by envId / region; no expiry), info=details of a specified environment (envId required; returns resource fields and billing information), domains=security domain list, usage=environment resource usage (envId required), metrics=environment monitoring time series (envId and metricName required) Allowed values: "list", "info", "domains", "usage", "metrics"</td></tr>
<tr><td><code>alias</code></td><td>string</td><td></td><td>Filter by environment alias. Optional when action=list</td></tr>
<tr><td><code>aliasExact</code></td><td>boolean</td><td></td><td>Filter by exact environment alias, so environments with similar prefixes are not mistaken for candidates. Optional when action=list; used together with alias</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Environment ID. Optional when action=list (filter only; still returns summaries); required when action=info / usage / metrics; optional when action=domains (omit it to query the currently bound environment).</td></tr>
<tr><td><code>region</code></td><td>string</td><td></td><td>Query region. Only effective when action=list; account-level credentials query that region. Environment-level credentials (API Key / hosted authorization token) ignore this parameter and always return the bound environment — do not infer that the region has no environment. ⚠️ ap-singapore belongs to both the China and international sites; without an explicit site it is queried as international (site=intl). To query the China site, run auth(site="domestic") or set TCB_SITE=domestic first. Allowed values: "ap-shanghai", "ap-guangzhou", "ap-singapore"</td></tr>
<tr><td><code>limit</code></td><td>integer</td><td></td><td>Maximum number of results. Optional when action=list</td></tr>
<tr><td><code>offset</code></td><td>integer</td><td></td><td>Pagination offset. Optional when action=list</td></tr>
<tr><td><code>fields</code></td><td>array of string</td><td></td><td>Returned-field allowlist. Optional when action=list</td></tr>
<tr><td><code>type</code></td><td>array of string</td><td></td><td>Usage module filter (same set as the console usage page). Only effective when action=usage; omitting it queries all modules. WARNING: passing it narrows the query to those modules, so `credits.total` is omitted and the panel stops judging sufficiency; the plan is still returned. Omit this parameter to compare against the full quota.</td></tr>
<tr><td><code>startDate</code></td><td>string</td><td></td><td>Usage start date (YYYY-MM-DD). Only effective when action=usage; must be paired with endDate. When omitted, the current billing cycle is used.</td></tr>
<tr><td><code>endDate</code></td><td>string</td><td></td><td>Usage end date (YYYY-MM-DD). Only effective when action=usage; must be paired with startDate. When omitted, the current billing cycle is used.</td></tr>
<tr><td><code>needUsageDetails</code></td><td>boolean</td><td></td><td>Whether to return four levels of usage detail. Only effective when action=usage; defaults to false, which returns the module level only (Module, CreditsValue as total spend, DeductValue as plan-included usage) plus DailyTotals for the last 7 days, a few hundred characters. true returns module -&gt; metric -&gt; resource type (ResourceType) -&gt; day (ValueDetailList[].CalcTime), about 50k characters for all modules; pass it only when reconciling day by day. Metric names are raw API codes (Capacity / Flux / CU / InputToken.&lt;model&gt;): when explaining them to a user, translate into plain words for the module (capacity, traffic, invocation count, model input tokens) instead of reading the code out; if unsure, say it is an API field name rather than guessing. The finest granularity is metric x day: there is no per-request trail, and no money or unit price.</td></tr>
<tr><td><code>metricName</code></td><td>string</td><td></td><td>Monitoring metric name. Required and only effective when action=metrics. GatewayTraceEnvQPS/EnvQPSAll=environment and gateway QPS; FunctionInvocation/FunctionError/FunctionTimeout/FunctionThrottle=function invocations, errors, timeouts, and throttling; DbRead/DbWrite/DbSizepkg=document database reads, writes, and capacity; MysqlCpuUsageRate/MysqlMemoryUse/MysqlStorageUsage=SQL database CPU, memory, and disk; TkeCpuUsedService/TkeQPSService/TkeHttpErrorService=CloudRun CPU, QPS, and errors. Allowed values: "GatewayTraceEnvQPS", "EnvQPSAll", "FunctionInvocation", "FunctionError", "FunctionTimeout", "FunctionThrottle", "FunctionDuration", "FunctionConcurrentExecutions", "DbRead", "DbWrite", "DbSizepkg", "MysqlCpuUsageRate", "MysqlMemoryUse", "MysqlStorageUsage", "MysqlQps", "MysqlSlowQueries", "MysqlDbConnections", "TkeCpuUsedService", "TkeMemUsedService", "TkeQPSService", "TkeHttpErrorService", "TkeInvokeNumService"</td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td>Monitoring start time (YYYY-MM-DD HH:mm:ss). Only effective when action=metrics; must be paired with endTime. Defaults to the last 24 hours when omitted. The end time must be at least five minutes later than the start time.</td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td>Monitoring end time (YYYY-MM-DD HH:mm:ss). Only effective when action=metrics; must be paired with startTime. Defaults to the last 24 hours when omitted.</td></tr>
<tr><td><code>period</code></td><td>number</td><td></td><td>Aggregation period in seconds. Only effective when action=metrics; when omitted, the backend selects it from the time range. 86400 cannot be used for ranges of 1 day or less; 300 cannot be used for ranges over 3 days. Allowed values: 300, 3600, 86400</td></tr>
<tr><td><code>resourceID</code></td><td>string</td><td></td><td>Resource ID. Only effective when action=metrics. Pass a function name for cloud functions, a collection name for the document database, and a service name for CloudRun. GatewayTraceEnvQPS uses the environment-level all\|:\|all\|:\|all\|:\|all when omitted.</td></tr>
<tr><td><code>subresourceID</code></td><td>string</td><td></td><td>Subresource ID. Only effective when action=metrics; pass the version name when querying monitoring data for a specific CloudRun version.</td></tr>
</tbody>
</table>

---

### `envDomainManagement`
⚠️ DEPRECATED: This tool is deprecated and has been folded into manageEnv. Use manageEnv(action="addSecurityDomain") / manageEnv(action="removeSecurityDomain") instead (the domains parameter is identical). This alias will be removed in the next version.

Manages [environment security domains] = the browser cross-origin (CORS) allowlist: it controls which web origins (host:port) may call this environment's CloudBase resources directly from the browser. It only performs CORS origin validation; it does not provide an access domain and does not involve HTTPS certificates. ⚠️ This is completely independent from [gateway custom domains] — the two are unrelated: to bind your own domain as an HTTPS access entry (CloudRun / gateway service), that is manageGateway's job — first queryGateway(listCustomDomains); if a domain already exists, use manageGateway(createRoute) with an explicit domain (no certificate needed); only use bindCustomDomain when binding a brand-new domain for the first time (certificateId required). Do not use this tool for that.

Usage guidance: (the original tool names createEnvDomain/deleteEnvDomain may still be used for compatibility with older AI rules) when a browser web app needs to access CloudBase resources directly from a local Vite / dev server, first use queryEnv(action=domains) to check whether the host:port of the actual current browser origin is already in the allowlist, then add that actual value. After adding or deleting, poll queryEnv(action=domains) about every 10 seconds to confirm the state has converged; do not sleep a full 10 minutes at once — most environments converge within a few minutes.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: create=add a security domain, delete=delete a security domain Allowed values: "create", "delete"</td></tr>
<tr><td><code>domains</code></td><td>array of string</td><td>yes</td><td>Security domain array (host:port format, such as localhost:5173 or 127.0.0.1:4173). These are not custom domains and do not require certificates.</td></tr>
</tbody>
</table>

---

### `manageEnv`
Manages CloudBase environments. Supports: listPackages=query available packages, create=create a new environment (confirmation required), modifyPlan=change the package (upgrade/downgrade, confirmation required), renew=renew the environment (confirmation required), addSecurityDomain=add an environment security domain (browser CORS allowlist, not billed, no confirmation needed), removeSecurityDomain=remove an environment security domain (not billed, no confirmation needed).

⚠️ For billed operations (create/modifyPlan/renew) you must show the configuration summary and wait for the user to confirm with confirm="yes" before executing; security domain operations (addSecurityDomain/removeSecurityDomain) are not billed and need no confirm.

ℹ️ A security domain = the browser cross-origin (CORS) allowlist; it controls which web origins (host:port) may call this environment's CloudBase resources directly from the browser, does not provide an access domain, and does not involve HTTPS certificates. Binding your own domain as an HTTPS access entry (CloudRun/gateway service) is manageGateway's job (listCustomDomains/bindCustomDomain) and is unrelated to this tool.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: listPackages=query available packages, create=create an environment, modifyPlan=change the package, renew=renew, addSecurityDomain=add a security domain (CORS allowlist entry), removeSecurityDomain=delete a security domain Allowed values: "listPackages", "create", "modifyPlan", "renew", "addSecurityDomain", "removeSecurityDomain"</td></tr>
<tr><td><code>domains</code></td><td>array of string</td><td></td><td>Security domain array (host:port format, such as localhost:5173 or 127.0.0.1:4173). Required and only effective when action=addSecurityDomain/removeSecurityDomain. These are CORS allowlist entries, not custom domains, and do not require certificates. Before adding one, use queryEnv(action=domains) to check whether the browser's actual origin is already in the allowlist.</td></tr>
<tr><td><code>alias</code></td><td>string</td><td></td><td>Environment alias (required when action=create). Must contain lowercase letters, digits, or hyphens; cannot start or end with a hyphen; maximum 20 characters</td></tr>
<tr><td><code>packageId</code></td><td>string</td><td></td><td>Package ID (required when action=create/modifyPlan). Take the PackageName returned by manageEnv(action="listPackages") — those are the packages selectable in the new-purchase / new-environment menus (baas_personal, baas_pf_standard, baas_pf_enterprise, baas_pf_enterprise_senior, baas_trial, baas_integration). The platform still accepts other valid packageIds (legacy package families, whitelisted ones), so take the actual creation result as authoritative. Available packages differ per site, so do not fill it in from memory.</td></tr>
<tr><td><code>resources</code></td><td>array of string</td><td></td><td>Resource types to enable (optional when action=create). Allowed values: storage, function, postgresql; defaults to all three when omitted. CreateEnv requires Resources to be non-empty, so MCP always sends this field. flexdb (document database) is no longer included: creating an environment does not create a NoSQL instance; its availability is reported by EnvInfo.RuntimeBackends from queryEnv(action="info").</td></tr>
<tr><td><code>duration</code></td><td>integer</td><td></td><td>Purchase or renewal duration in months. Optional when action=create/renew; defaults to 1</td></tr>
<tr><td><code>externalStorage</code></td><td>object</td><td></td><td>Shared COS bucket configuration for cloud storage (optional when action=create). Passing this object means the environment does not get its own dedicated COS bucket; it uses the given bucket as its cloud storage medium and is isolated from other environments in the same bucket by basePath. It applies to cloud storage only — the static hosting bucket is allocated by the platform when hosting is enabled. All three fields are required. ⚠️ Like region, the confirming call (confirm="yes") reads only its own arguments, so omitting it there silently creates the environment with a dedicated bucket.</td></tr>
<tr><td><code>externalStorage.bucketName</code></td><td>string</td><td>yes</td><td>Shared bucket name (COS bucket name)</td></tr>
<tr><td><code>externalStorage.region</code></td><td>string</td><td>yes</td><td>Region of the shared bucket, for example ap-shanghai</td></tr>
<tr><td><code>externalStorage.basePath</code></td><td>string</td><td>yes</td><td>Base path prefix. Must be unique within the shared bucket; isolates this environment from others in the same bucket</td></tr>
<tr><td><code>region</code></td><td>string</td><td></td><td>Creation region (only effective when action=create). Passed through with X-TC-Region semantics and determines where the new environment is created; CLI equivalent: tcb env create --region ap-shanghai. When omitted, the current session region is used (cloudBaseOptions.region → TCB_REGION → project configuration / rc binding → site default: ap-shanghai for the China site, ap-singapore for the international site). region is not written into the CreateEnv request body; it takes effect through the request-layer region context, matching the callCloudApi contract not to put Region in params. ⚠️ ap-singapore belongs to both the China and international sites; without an explicit site it is inferred as international (site=intl). To create there on the China site, first use auth(site="domestic") or set TCB_SITE=domestic. Allowed values: "ap-shanghai", "ap-guangzhou", "ap-singapore"</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Environment ID (required when action=modifyPlan/renew)</td></tr>
<tr><td><code>confirm</code></td><td>string</td><td></td><td>Confirm the operation. All billed operations (create/modifyPlan/renew) require passing "yes" Allowed values: const "yes"</td></tr>
</tbody>
</table>

---

### `readNoSqlDatabaseStructure`
Read CloudBase NoSQL database collection and index structures. Supports listing collections, describing a collection, listing indexes, and checking index existence. This is a server-side management tool for querying database structure from the admin side, not for writing client code.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>listCollections: List collections describeCollection: Describe collection details (including an index summary) checkCollection: Check whether a collection exists listIndexes: List indexes for a specified collection checkIndex: Check whether a specified index exists Allowed values: "listCollections", "describeCollection", "checkCollection", "listIndexes", "checkIndex"</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>Maximum number of results (optional for listCollections)</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>Result offset (optional for listCollections)</td></tr>
<tr><td><code>collectionName</code></td><td>string</td><td></td><td>Collection name (required for describeCollection, listIndexes, and checkIndex)</td></tr>
<tr><td><code>indexName</code></td><td>string</td><td></td><td>Index name (required for checkIndex)</td></tr>
</tbody>
</table>

---

### `writeNoSqlDatabaseStructure`
Create, delete, and manage CloudBase NoSQL database collections. Supports creating new collections, deleting existing collections, and adding/removing indexes via updateCollection's updateOptions.CreateIndexes / updateOptions.DropIndexes. Use action=createCollection to create a new collection. This is a server-side management tool for operating collection and index structures from the admin side, not for writing client code.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>createCollection: Create a collection updateCollection: Update collection configuration; pass updateOptions.CreateIndexes to add indexes and updateOptions.DropIndexes to remove indexes deleteCollection: Delete a collection Allowed values: "createCollection", "updateCollection", "deleteCollection"</td></tr>
<tr><td><code>collectionName</code></td><td>string</td><td>yes</td><td>Collection name</td></tr>
<tr><td><code>updateOptions</code></td><td>object</td><td></td><td>Update options for updateCollection. CreateIndexes adds indexes and DropIndexes removes indexes.</td></tr>
<tr><td><code>updateOptions.CreateIndexes</code></td><td>array of object</td><td></td><td>Indexes to add</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].IndexName</code></td><td>string</td><td>yes</td><td>Name of the index to create</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema</code></td><td>object</td><td>yes</td><td>Field and constraint configuration for the index to create</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIsUnique</code></td><td>boolean</td><td>yes</td><td>Whether the index is unique</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIndexKeys</code></td><td>array of object</td><td>yes</td><td>Index field list supporting single-field and compound indexes</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIndexKeys[].Name</code></td><td>string</td><td>yes</td><td>Indexed field name</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIndexKeys[].Direction</code></td><td>string</td><td>yes</td><td>Index direction; 1 usually means ascending and -1 means descending</td></tr>
<tr><td><code>updateOptions.DropIndexes</code></td><td>array of object</td><td></td><td>Indexes to remove</td></tr>
<tr><td><code>updateOptions.DropIndexes[].IndexName</code></td><td>string</td><td>yes</td><td>Name of the index to remove</td></tr>
</tbody>
</table>

---

### `readNoSqlDatabaseContent`
Query data records in the CloudBase NoSQL database. Supports filtering, pagination, and sorting for admin-side data queries and operations.limit defaults to 100 with a maximum of 1000; use offset pagination beyond that.projection only supports a \{ field: 1|0 \} object (example \{"_id":1,"name":1,"createdAt":1\}); do not pass field arrays.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>collectionName</code></td><td>string</td><td>yes</td><td>Collection name</td></tr>
<tr><td><code>instanceId</code></td><td>string</td><td></td><td>Optional explicit database instance ID; when omitted, it is resolved and cached automatically</td></tr>
<tr><td><code>query</code></td><td>object | string</td><td></td><td>Query condition as an object or string; an object is recommended</td></tr>
<tr><td><code>projection</code></td><td>object | string</td><td></td><td>Return-field projection. Only an object or equivalent JSON string is supported, and values must be 1/0/true/false. Valid examples: {"_id":1,"name":1,"createdAt":1} (include) or {"password":0} (exclude). Do not pass field arrays such as ["name","age"], and do not mix inclusion and exclusion except for _id.</td></tr>
<tr><td><code>sort</code></td><td>array of object | string</td><td></td><td>Sort condition. Only an array such as [{"key":"createdAt","direction":-1}] or the equivalent JSON string is supported.</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>Maximum number of results; an integer from 1 to 1000, defaulting to 100. Values above 1000 are rejected by the Cloud API MgoLimit lte validation; use offset pagination.</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>Number of records to skip</td></tr>
</tbody>
</table>

---

### `writeNoSqlDatabaseContent`
Modify data records in the CloudBase NoSQL database. Supports insert, update (with $set/$inc/$push and other operators), delete, upsert, and more for admin-side data writes and operations.⚠️ Server-side writes do not include _openid: if the collection relies on client-side SDK (@cloudbase/js-sdk or WeChat Mini Program wx.cloud.database()) row-level security rules (e.g. doc._openid == auth.openid), you must manually add the _openid field on server-side writes, or clients will not be able to read the data.⚠️ Partial updates of nested fields must use dot paths, e.g. `$set: \{"shipping.city": "guangzhou"\}`; passing a nested object directly overwrites the whole field.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>insert: Insert data (add documents) update: Update data delete: Delete data Allowed values: "insert", "update", "delete"</td></tr>
<tr><td><code>collectionName</code></td><td>string</td><td>yes</td><td>Collection name</td></tr>
<tr><td><code>instanceId</code></td><td>string</td><td></td><td>Optional explicit database instance ID; when omitted, it is resolved and cached automatically</td></tr>
<tr><td><code>documents</code></td><td>array of object</td><td></td><td>Array of document objects to insert; each document must be an object (required for insert)</td></tr>
<tr><td><code>query</code></td><td>object | string</td><td></td><td>Query condition as an object or string; an object is recommended (required for update/delete)</td></tr>
<tr><td><code>update</code></td><td>object | string</td><td></td><td>Update content as an object or string; an object is recommended (required for update). Pass MgoUpdate using MongoDB update semantics: for partial updates, use operators such as `$set`, `$inc`, `$unset`, and `$push`, for example `$set` to update `status`. Do not pass a plain field-to-value object directly, because it may replace the entire document. ⚠️ Nested fields must use dot notation (such as `shipping.city`); replacing the whole object is prohibited: - ❌ Incorrect: { "$set": { "shipping": { "city": "guangzhou" } } } — replaces all of shipping and loses existing fields such as address and province - ✅ Correct: { "$set": { "shipping.city": "guangzhou" } } — updates only city and preserves other fields under shipping</td></tr>
<tr><td><code>isMulti</code></td><td>boolean</td><td></td><td>Whether to update multiple records (optional for update/delete)</td></tr>
<tr><td><code>upsert</code></td><td>boolean</td><td></td><td>Whether to insert when no record exists (optional for update)</td></tr>
</tbody>
</table>

---

### `manageDataModel`
Data model query tool that supports querying and listing data models (read-only). Distinguish operations via the action parameter: list=get the model list (without Schema, optional names parameter for filtering), get=query a single model's details (including Schema field list, formats, relations, etc.; requires the name parameter), docs=generate SDK usage documentation (requires the name parameter)

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: get=query a single model (including its Schema field list, formats, and relations; requires the name parameter), list=get the model list (without Schema; optional names parameter for filtering), docs=generate SDK usage documentation (requires the name parameter) Allowed values: "get", "list", "docs"</td></tr>
<tr><td><code>name</code></td><td>string</td><td></td><td>Name of the data model to query. This parameter is required when action='get' or action='docs' and must identify an existing data model. Use action='list' to obtain available model names</td></tr>
<tr><td><code>names</code></td><td>array of string</td><td></td><td>Array of model names, optionally used to filter the list operation</td></tr>
</tbody>
</table>

---

### `modifyDataModel`
Create data models from a Mermaid classDiagram. For compatibility, the tool name remains modifyDataModel; currently only creating new models is supported, not updating existing model structures. Includes async task monitoring that polls automatically until completion or timeout.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>mermaidDiagram</code></td><td>string</td><td>yes</td><td>Mermaid classDiagram code describing the data model structure. Example: classDiagram     class Student {         name: string &lt;&lt;Name&gt;&gt;         age: number = 18 &lt;&lt;Age&gt;&gt;         gender: x-enum = "Male" &lt;&lt;Gender&gt;&gt;         classId: string &lt;&lt;Class ID&gt;&gt;         identityId: string &lt;&lt;Identity ID&gt;&gt;         course: Course[] &lt;&lt;Courses&gt;&gt;         required() ["name"]         unique() ["name"]         enum_gender() ["Male", "Female"]         display_field() "name"     }     class Class {         className: string &lt;&lt;Class name&gt;&gt;         display_field() "className"     }     class Course {         name: string &lt;&lt;Course name&gt;&gt;         students: Student[] &lt;&lt;Students&gt;&gt;         display_field() "name"     }     class Identity {         number: string &lt;&lt;Document number&gt;&gt;         display_field() "number"     }     %% Relationships     Student "1" --&gt; "1" Identity : studentId     Student "n" --&gt; "1" Class : student2class     Student "n" --&gt; "m" Course : course     Student "n" &lt;-- "m" Course : students     %% Class names     note for Student "Student model"     note for Class "Class model"     note for Course "Course model"     note for Identity "Identity model"</td></tr>
<tr><td><code>action</code></td><td>string</td><td></td><td>Operation type: create=create a new model Allowed values: "create"；Default: "create"</td></tr>
<tr><td><code>publish</code></td><td>boolean</td><td></td><td>Whether to publish the model immediately Default: false</td></tr>
<tr><td><code>dbInstanceType</code></td><td>string</td><td></td><td>Database instance type: MySQL database or document database (NoSQL) Allowed values: "MYSQL", "FLEXDB"；Default: "MYSQL"</td></tr>
</tbody>
</table>

---

### `queryPgDatabase`
⚠️ Read-only tool: only accepts read-only SQL such as SELECT. CREATE / ALTER / DROP / INSERT / UPDATE / DELETE are rejected outright (and a 42703/42P01 usually means a guessed table or column name — run action=objects to see the real structure instead of assuming names like schema_migrations). For writes and DDL use managePgDatabase: action=execute for DML/GRANT/RLS, action=applyMigration for schema changes.

Query the CloudBase PostgreSQL database: get the current PG context, list schema-qualified database objects, read lightweight metadata, inspect a single object schema, and run read-only SQL.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Action type: context=get the current PostgreSQL context; objects=list schema-qualified database objects; metadata=get lightweight table metadata; schema=inspect a single schema-qualified object structure; sql=run read-only SQL Allowed values: "context", "objects", "metadata", "schema", "sql"</td></tr>
<tr><td><code>sql</code></td><td>string</td><td></td><td>Read-only SQL used when action=sql</td></tr>
<tr><td><code>objectName</code></td><td>string</td><td></td><td>Schema-qualified PostgreSQL object name used when action=schema, e.g. public.users</td></tr>
<tr><td><code>schema</code></td><td>string</td><td></td><td>Optional schema filter, used with action=objects or action=metadata</td></tr>
<tr><td><code>limit</code></td><td>integer</td><td></td><td>Optional cap on summary size, applied to objects, metadata, or SQL result rows. Defaults to 20, maximum 200.</td></tr>
</tbody>
</table>

---

### `managePgDatabase`
Manage CloudBase PostgreSQL: run confirmed write SQL, pre-check SQL risk, manage migrations, and manage Realtime settings. Schema changes such as CREATE TABLE/ALTER/DROP must use applyMigration (explicit migrationVersion; the local cloudbase/migrations/&lt;version&gt;_&lt;name&gt;.sql file is written or verified automatically before success, matching the CLI tcb db pg migration). Do not use execute by default. execute is mainly for DML and ops SQL such as GRANT/RLS. Three Realtime actions: describeRealtime reads the settings (the response has no provisioning flag, so success does not mean Realtime is provisioned); enableRealtime provisions and resumes the service, equivalent to setting Suspend=false (the first call on an unprovisioned environment provisions it automatically, and it is a no-op when already provisioned and not suspended); modifyRealtime applies an incremental update from the fields you pass explicitly (requires confirm=true, and changing suspend immediately drops all live WebSocket connections of the environment, globally).

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Action type. For everyday writes use execute (DML/GRANT/RLS; schema DDL is rejected by default and needs allowDdlViaExecute=true) or dryRun (analyze only, no execution). CREATE TABLE / schema changes must use applyMigration — see the tool description for the full flow (polling, timeout, landed-in-history check). The other six support migrations: planMigration=preview, listMigrations=list applied, migrationDetail=one record, describeMigrationTask=inspect a Push task, fetchMigration=pull remote SQL locally, repairMigration=fix history. plan / apply / repair all need migrationName + migrationVersion; migrationDetail needs only migrationVersion. describeRealtime / enableRealtime / modifyRealtime manage Realtime (see the tool description). Allowed values: "execute", "dryRun", "planMigration", "applyMigration", "listMigrations", "migrationDetail", "describeMigrationTask", "fetchMigration", "repairMigration", "describeRealtime", "enableRealtime", "modifyRealtime"</td></tr>
<tr><td><code>sql</code></td><td>string</td><td></td><td>SQL statement used when action=execute, dryRun, planMigration, applyMigration, or repairMigration(applied)</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Must be explicitly set to true before running any write SQL (execute etc.) and for action=modifyRealtime; when modifyRealtime omits it nothing is sent and the tool returns the current values plus the pending changes so you can confirm with the user first.</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Optional CloudBase environment ID; the current MCP environment is used when omitted.</td></tr>
<tr><td><code>instanceId</code></td><td>string</td><td></td><td>Optional PostgreSQL logical instance identifier, defaults to cloudbase-pg.</td></tr>
<tr><td><code>defaultSchema</code></td><td>string</td><td></td><td>Optional default schema, defaults to public.</td></tr>
<tr><td><code>role</code></td><td>string</td><td></td><td>Optional PostgreSQL role, passed as Role to the Manager SDK executePGSql (the platform issues SET ROLE). Defaults to cloudbase_postgres. Recommended values: cloudbase_postgres / anon / authenticated / service_role. Do not pass postgres, postgres_pgdb_*, platform-reserved roles (the platform management account, not exposed to users), or roles invented from the environment name; when unsure omit this field, or first run SELECT rolname FROM pg_roles with cloudbase_postgres.</td></tr>
<tr><td><code>objectName</code></td><td>string</td><td></td><td>Optional object name, currently only used for non-migration scenarios. For migration actions use migrationName / migrationVersion instead.</td></tr>
<tr><td><code>migrationName</code></td><td>string</td><td></td><td>Required for plan/apply/repair: migration name starting with a lowercase letter, containing only lowercase letters and underscores (no digits — the server-side PushPGUserMigrations rejects names containing digits).</td></tr>
<tr><td><code>migrationVersion</code></td><td>string</td><td></td><td>14-digit timestamp YYYYMMDDHHMMSS. Required for plan/apply/detail/repair; optional for fetchMigration (passing it pulls only that record, omitting it pulls the full remote history). It must never be generated silently by the server, to avoid diverging from the local cloudbase/migrations/&lt;version&gt;_&lt;name&gt;.sql file. applyMigration is not incremental: send the complete SQL every time; when a task fails terminally and listMigrations shows the version did not land, that version is not consumed — just pick a new migrationVersion and re-send the full SQL (the same name with a different version does not conflict).</td></tr>
<tr><td><code>rollbackSql</code></td><td>string</td><td></td><td>Optional for plan/apply: rollback SQL statement.</td></tr>
<tr><td><code>limit</code></td><td>integer</td><td></td><td>Optional for list: maximum number of records returned, 1-500, defaults to 100.</td></tr>
<tr><td><code>offset</code></td><td>integer</td><td></td><td>Optional for list: paging offset, defaults to 0.</td></tr>
<tr><td><code>lockTimeoutMs</code></td><td>integer</td><td></td><td>Optional for apply: maximum time to acquire the database lock in milliseconds, defaults to 5000.</td></tr>
<tr><td><code>statementTimeoutMs</code></td><td>integer</td><td></td><td>Optional for apply: maximum execution time per SQL statement in milliseconds, defaults to 300000.</td></tr>
<tr><td><code>taskPollTimeoutMs</code></td><td>integer</td><td></td><td>Optional for apply: maximum wait while polling DescribeTaskResult, in milliseconds. Defaults to 600000 (10 minutes). Range 5000-600000. After a timeout always call describeMigrationTask(taskId) before listMigrations, and never re-push the same version immediately.</td></tr>
<tr><td><code>waitForTask</code></td><td>boolean</td><td></td><td>Optional for apply, defaults to true. When set to false, Push returns the TaskId immediately (errorCode=MIGRATION_TASK_PENDING) and the caller polls the task to a terminal state with describeMigrationTask, then confirms with listMigrations whether it landed; useful when the MCP host has a short tool-call timeout. The default true waits synchronously for the terminal state.</td></tr>
<tr><td><code>taskId</code></td><td>string</td><td></td><td>Required for describeMigrationTask: the TaskId returned by PushPGUserMigrations / applyMigration. Used for a one-shot DescribeTaskResult query (Status/Phase/Reason) without polling.</td></tr>
<tr><td><code>repairStatus</code></td><td>string</td><td></td><td>Required for repair: applied=mark as applied (Query can be backfilled), reverted=delete the history record. Allowed values: "applied", "reverted"</td></tr>
<tr><td><code>repairReason</code></td><td>string</td><td></td><td>Required for repair: the repair reason.</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>Optional for fetchMigration, defaults to false. true=overwrite the existing local SQL file with the same name; false=skip existing files. Use it to realign Git checksums from the remote history.</td></tr>
<tr><td><code>includeAll</code></td><td>boolean</td><td></td><td>Optional for planMigration / applyMigration, defaults to false. true=allow out-of-order versions (older than the remote LatestVersion) to still Preview/Push; use it only when intentionally backfilling or applying out-of-order migrations — normally pick a larger migrationVersion instead.</td></tr>
<tr><td><code>allowDdlViaExecute</code></td><td>boolean</td><td></td><td>Optional, defaults to false. Set it to true only when intentionally bypassing migration history, which is the only case where schema DDL is allowed through execute; normal CREATE TABLE / schema changes must use applyMigration.</td></tr>
<tr><td><code>suspend</code></td><td>boolean</td><td></td><td>Applies to action=modifyRealtime (enableRealtime is equivalent to Suspend=false). Global, affects every node of the environment: true immediately drops all live WebSocket connections, rejects new ones (HTTP 403) and disables the server-side broadcast API; false restores the service. Any change of the suspend value triggers one disconnect, so clients must reconnect.</td></tr>
<tr><td><code>privateOnly</code></td><td>boolean</td><td></td><td>Applies to action=modifyRealtime: when true only private channels are allowed; clients cannot join channels prefixed with public:.</td></tr>
<tr><td><code>presenceEnabled</code></td><td>boolean</td><td></td><td>Applies to action=modifyRealtime: global presence switch. When false, client presence joins on a channel are rejected.</td></tr>
<tr><td><code>maxConcurrentUsers</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum concurrent users (multiple connections of the same user count once); new connections are rejected above it. Server-side range 0-15000.</td></tr>
<tr><td><code>maxEventsPerSecond</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum broadcast events per second across all clients; exceeding it returns a rate-limit error.</td></tr>
<tr><td><code>maxJoinsPerSecond</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum joins per second; new joins are throttled above it.</td></tr>
<tr><td><code>maxBytesPerSecond</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum broadcast payload bytes per second across all clients; exceeding it rejects messages.</td></tr>
<tr><td><code>maxChannelsPerClient</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum channels per client; a client above it cannot join more channels.</td></tr>
<tr><td><code>maxPresenceEventsPerSecond</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum presence events per second across all clients (track/untrack).</td></tr>
<tr><td><code>maxPayloadSizeInKB</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum payload size per message in KB; larger messages are rejected.</td></tr>
<tr><td><code>connectionPool</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: Realtime database connection pool size used for RLS authorization queries. This is not the PG instance connection pool.</td></tr>
<tr><td><code>postgresChangesPool</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: Realtime dedicated connection pool for CDC (postgres_changes), isolated from the broadcast/auth pool.</td></tr>
</tbody>
</table>

---

### `queryPgStorage`
Query cloud storage capabilities of a CloudBase PostgreSQL environment. Returns a bucket/config capability summary, object metadata query plans, and upload implementation plans based on the HTTP API or SDK; it never reads local files and does not emit bulk signed URLs by default.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: buckets/config=query the storage capability summary; createBucket=generate a bucket creation plan (SQL/HTTP API/CLI); uploadPlan=generate an HTTP API/SDK upload plan; objectInfo=generate an object metadata query plan; signUpload/signDownload=explicit placeholders for one-time signed URL requests Allowed values: "buckets", "config", "uploadPlan", "objectInfo", "signUpload", "signDownload", "createBucket"</td></tr>
<tr><td><code>bucket</code></td><td>string</td><td></td><td>Cloud storage bucket name</td></tr>
<tr><td><code>objectKey</code></td><td>string</td><td></td><td>Single object key</td></tr>
<tr><td><code>objectKeys</code></td><td>array of string</td><td></td><td>Multiple object keys for planning object metadata queries</td></tr>
<tr><td><code>objects</code></td><td>array of object</td><td></td><td>Metadata for objects to upload. File bytes are not transferred through MCP.</td></tr>
<tr><td><code>objects[].objectKey</code></td><td>string</td><td>yes</td><td></td></tr>
<tr><td><code>objects[].contentType</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>objects[].sizeBytes</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>expiresIn</code></td><td>integer</td><td></td><td>Signed URL validity in seconds, from 60 to 86400.</td></tr>
</tbody>
</table>

---

### `queryMysqlDatabase`
Query CloudBase MySQL database information. Supports running read-only SQL, checking the result of an instance-creation task started in the console, querying MySQL task status, getting the current instance lifecycle context, and querying instance slow queries / error logs. Standard getInstanceInfo/describeInstance never returns connection credentials; only getConnectionInfo passes through the raw connection/cluster payload (possibly including credentials), and only for explicit TCP migration. Prefer the SDK or runQuery/runStatement for business CRUD.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>runQuery=execute read-only SQL; describeCreateResult=query the result of an instance-creation task started in the console; describeTaskStatus=query MySQL task status; getInstanceInfo=get lifecycle context without connection credentials; describeInstance=alias of getInstanceInfo; getConnectionInfo=passthrough raw connection/cluster payload including possible credentials (TCP migration exception only); describeInstanceSlowQueries=query instance slow query logs; describeInstanceErrorLogs=query instance error logs Allowed values: "runQuery", "describeCreateResult", "describeTaskStatus", "getInstanceInfo", "describeInstance", "getConnectionInfo", "describeInstanceSlowQueries", "describeInstanceErrorLogs"</td></tr>
<tr><td><code>sql</code></td><td>string</td><td></td><td>Read-only SQL used by action=runQuery</td></tr>
<tr><td><code>request</code></td><td>object</td><td></td><td>Official request payload used by describeCreateResult/describeTaskStatus/describeInstanceSlowQueries/describeInstanceErrorLogs (may include InstanceId, etc.)</td></tr>
<tr><td><code>dbInstance</code></td><td>object</td><td></td><td>Optional SQL database instance context for runQuery / slow-query / error-log actions</td></tr>
<tr><td><code>dbInstance.instanceId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>dbInstance.schema</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td>Slow-query / error-log query start time (YYYY-MM-DD HH:mm:ss)</td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td>Slow-query / error-log query end time (YYYY-MM-DD HH:mm:ss)</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>Max rows for slow-query / error-log results</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>Pagination offset for slow-query / error-log results</td></tr>
<tr><td><code>username</code></td><td>string</td><td></td><td>Slow-query filter: username</td></tr>
<tr><td><code>host</code></td><td>string</td><td></td><td>Slow-query filter: client host</td></tr>
<tr><td><code>database</code></td><td>string</td><td></td><td>Slow-query filter: database name</td></tr>
<tr><td><code>orderBy</code></td><td>string</td><td></td><td>Sort field. Slow queries: QueryTime/LockTime/RowsExamined/RowsSent; error logs: Timestamp Allowed values: "QueryTime", "LockTime", "RowsExamined", "RowsSent", "Timestamp"</td></tr>
<tr><td><code>orderByType</code></td><td>string</td><td></td><td>Sort direction: asc/desc (case-insensitive) Allowed values: "asc", "desc", "ASC", "DESC"</td></tr>
<tr><td><code>sqlText</code></td><td>string</td><td></td><td>Slow-query filter: SQL text fragment</td></tr>
<tr><td><code>logLevels</code></td><td>array of string</td><td></td><td>Error log level filter</td></tr>
<tr><td><code>keyWords</code></td><td>array of string</td><td></td><td>Error log keyword fuzzy-search list</td></tr>
</tbody>
</table>

---

### `manageMysqlDatabase`
Manage an existing CloudBase MySQL instance: destroy the instance, run write SQL/DDL, and initialize the database schema. Note: MySQL provisioning has been retired from this tool — it no longer creates instances, so use the CloudBase console to provision one. When the environment has no instance, the tool returns MYSQL_NOT_CREATED plus a console entry, and offers no provisioning hint. Prefer CloudBase PostgreSQL (managePgDatabase / queryPgDatabase) for new environments.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>destroyMySQL=destroy MySQL instance; runStatement=execute write SQL or DDL; initializeSchema=run ordered schema initialization statements Allowed values: "destroyMySQL", "runStatement", "initializeSchema"</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Explicit confirmation required for action=destroyMySQL</td></tr>
<tr><td><code>sql</code></td><td>string</td><td></td><td>SQL statement used by action=runStatement</td></tr>
<tr><td><code>request</code></td><td>object</td><td></td><td>Official request payload used by action=destroyMySQL</td></tr>
<tr><td><code>statements</code></td><td>array of string</td><td></td><td>Ordered schema initialization SQL statements used by action=initializeSchema</td></tr>
<tr><td><code>requireReady</code></td><td>boolean</td><td></td><td>Whether initializeSchema should block until MySQL is confirmed ready. Defaults to true.</td></tr>
<tr><td><code>statusContext</code></td><td>object</td><td></td><td>Optional instance status requests used to confirm readiness before initializeSchema (for tasks started in the console)</td></tr>
<tr><td><code>statusContext.createResultRequest</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>statusContext.taskStatusRequest</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>dbInstance</code></td><td>object</td><td></td><td>Optional SQL database instance context for runStatement/initializeSchema</td></tr>
<tr><td><code>dbInstance.instanceId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>dbInstance.schema</code></td><td>string</td><td></td><td></td></tr>
</tbody>
</table>

---

### `queryFunctions`
Unified read-only entry for CloudBase cloud functions: function lists and details, execution logs, layers, triggers, code download URLs, published versions and traffic aliases, async deployment status, and code-package upload URLs.

**Cloud function logs**: `listFunctionLogs` queries execution logs for one function and defaults to the last day without startTime/endTime; the span must not exceed 1 day and a single call returns at most 100 entries
- `hasMore=true` means older logs exist: pass the returned `context` back unchanged to fetch the next page (`offset` only works within the first 100 entries)
- Each `logs[]` item is parsed into requestId / log / statusCode / retCode / durationMs / memoryMb / timestamp
- For the full sequence of one invocation (START, business logs, REPORT) use `getFunctionLogDetail`
- This tool queries execution logs of a specific function; for cross-service CLS log search use `queryLogs`

**Scheduled tasks / cron / timers**: use `listFunctionTriggers` to query a function's timer trigger configuration.

**Async deployment status**: `getFunctionDeployStatus` returns data.build, data.deploy, and data.progress. While status=running, data.result and data.error are null and deployment must not be reported as complete. Keep polling until status=succeeded/failed. status=expired means the task exceeded the 2-hour retention limit; cloud deployment may still be running, so confirm with getFunctionDetail. Tasks exist only in MCP process memory and are isolated by environment; expired tasks or a restarted MCP Server return errorCode=DEPLOY_TASK_NOT_FOUND. This action is unavailable in cloud mode because real cloud/local builds cannot run there, while image deployment is synchronous and creates no taskId.

**Code package upload**: `getFunctionUploadUrl` returns a COS presigned upload URL (two-phase ZIP deployment phase A): PUT the code zip to uploadUrl (include the corresponding request headers when uploadHeaders is non-empty), then call manageFunctions createFunction/updateFunctionCode with the code triplet (phase B). The uploadUrl carries credential-bound signatures; never log or persist it; it is only usable in the environment it was minted for and is valid for 300 seconds by default.

**Layers** are account-level shared namespaces in SCF; `listLayers` / `listLayerVersions` / `getLayerVersionDetail` return the account-level view, which may include layers created by other environments.
- When creating a layer, use a unique name with the environment suffix, in the fixed format `\{layerName\}_\{current envId\}` (e.g. `common_cloud1-d9ghadgak3edf6b36`). Do not reuse the same bare layer name across environments; check with `listLayers` before creating

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Read-only action type. Note the layer version list is `listLayerVersions` (plural Versions); see the tool description for each action's usage and limits and the parameter descriptions for what each needs. Allowed values: "listFunctions", "getFunctionDetail", "listFunctionLogs", "getFunctionLogDetail", "listFunctionLayers", "listLayers", "listLayerVersions", "getLayerVersionDetail", "listFunctionTriggers", "getFunctionDownloadUrl", "getFunctionDeployStatus", "listVersionByFunction", "getFunctionAlias", "getFunctionUploadUrl"</td></tr>
<tr><td><code>functionName</code></td><td>string</td><td></td><td>CloudBase cloud function name. Required for `getFunctionDetail`, `listFunctionLogs`, `listFunctionLayers`, `listFunctionTriggers`, `getFunctionDownloadUrl`, `listVersionByFunction`, and `getFunctionAlias`. Optional for `getFunctionUploadUrl` (only used to generate the upload object key).</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>Page size (limit). Optional for list actions; the backend determines the default. Log actions return at most 100 entries and default to 20.</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>Pagination offset. Optional for list actions; defaults to 0. For log actions it only works within the first 100 entries — use the returned context to page further back.</td></tr>
<tr><td><code>codeSecret</code></td><td>string</td><td></td><td>Code protection secret used to decrypt function code.</td></tr>
<tr><td><code>revealEnvValues</code></td><td>boolean</td><td></td><td>Whether `getFunctionDetail` / `listFunctionTriggers` / `listFunctionLayers` returns plaintext environment variable values. Defaults to false: Value is masked as ***, while Key and ValueLength remain, which is sufficient to verify configured variables and changes. true returns plaintext and may expose secrets to the model context; use cautiously. Prefer the console or CLI for plaintext values.</td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td>Log query start time in YYYY-MM-DD HH:mm:ss format (for example, 2024-01-01 00:00:00, interpreted as Beijing time). The interval to endTime must not exceed one day. Defaults to the most recent day when omitted.</td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td>Log query end time in YYYY-MM-DD HH:mm:ss format (for example, 2024-01-01 23:59:59, interpreted as Beijing time). The interval from startTime must not exceed one day. Defaults to the current time when omitted.</td></tr>
<tr><td><code>requestId</code></td><td>string</td><td></td><td>Log request ID. Required for `getFunctionLogDetail`; take it from logs[].requestId returned by `listFunctionLogs`, or use the RequestId printed in a business log line.</td></tr>
<tr><td><code>qualifier</code></td><td>string</td><td></td><td>Function version alias, such as $LATEST or $DEFAULT. Optional for log queries; used as a CLS filter.</td></tr>
<tr><td><code>context</code></td><td>string</td><td></td><td>Log pagination cursor. Pass the `context` returned by the previous `listFunctionLogs` call back unchanged to fetch the next page; never construct it yourself. null means there are no more results.</td></tr>
<tr><td><code>runtime</code></td><td>string</td><td></td><td>Runtime filter for layer queries, such as Nodejs18.15.</td></tr>
<tr><td><code>searchKey</code></td><td>string</td><td></td><td>Layer name search keyword.</td></tr>
<tr><td><code>layerName</code></td><td>string</td><td></td><td>Layer name. Required for `listLayerVersions` and `getLayerVersionDetail`. Layers use an account-level shared namespace; use the fixed format `{layerName}_{current envId}` (for example, common_cloud1-d9ghadgak3edf6b36).</td></tr>
<tr><td><code>layerVersion</code></td><td>number</td><td></td><td>Layer version number. Required for `getLayerVersionDetail`.</td></tr>
<tr><td><code>taskId</code></td><td>string</td><td></td><td>Async deployment task ID for `getFunctionDeployStatus` (returned by manageFunctions with wait=false). Tasks exist only in current MCP process memory: terminal tasks are retained for about 30 minutes and running tasks for at most 2 hours.</td></tr>
<tr><td><code>order</code></td><td>string</td><td></td><td>Sort direction for `listVersionByFunction`; only ASC / DESC are supported. Allowed values: "ASC", "DESC"</td></tr>
<tr><td><code>orderBy</code></td><td>string</td><td></td><td>Sort field for `listVersionByFunction`; only AddTime / ModTime are supported. Allowed values: "AddTime", "ModTime"</td></tr>
<tr><td><code>aliasName</code></td><td>string</td><td></td><td>Alias name for `getFunctionAlias`. Defaults to `$DEFAULT`</td></tr>
</tbody>
</table>

---

### `manageFunctions`
Unified write entry for CloudBase cloud functions. Supports creating functions, updating code, updating configuration, invoking functions, publishing versions, configuring traffic aliases, and managing timer triggers (scheduled jobs / cron) and layer bindings. The deployment package has a hard size ceiling — do not bundle static content: media files (video, large images, fonts), user uploads, and frequently-updated static resources belong in cloud storage referenced by URL, otherwise every change forces a full function redeploy and the package can exceed the limit. To create a cron scheduled task, first create the function with createFunction, then create the timer trigger with createFunctionTrigger, and delete triggers with deleteFunctionTrigger. Publish versions with `publishVersion`; shift traffic (canary) with `updateFunctionAliasConfig`. HTTP function image deployment: createFunction / updateFunctionCode choose the path via func.buildStrategy (image = deploy an existing image, local / cloud = build then deploy, omitted or zip = traditional code package). local / cloud only produce a dry-run plan by default; pass dryRun=false with confirm=true to execute the real deployment. A real deployment may pass wait=false to return a taskId immediately; query progress and results via getFunctionDeployStatus of queryFunctions. wait=false only means this tool call does not wait for the full deployment; the caller must not finish while status=running and must keep polling until succeeded/failed before reporting to the user, unless the polling limit is reached. local always requires local MCP mode; the real execution of cloud also requires local MCP mode because it reads the local build context; cloud mode only supports cloud dry-run and the image strategy. Dangerous operations require explicit confirm=true.

**Personal-edition TCR credentials**: local/cloud builds with imageType=personal need push credentials. If TCB_TCR_USERNAME and TCB_TCR_PASSWORD are set in the env of the MCP configuration, leave registryCredential empty and it is read automatically. Do not ask users for plaintext passwords, and do not put passwords into tool parameters.
Note this env channel only works with **local stdio MCP and clients whose mcp.json supports a custom env block**: some GUI clients do not inherit shell exports, and IDE built-in MCPs usually inject credentials through a hardcoded whitelist (e.g. only TENCENTCLOUD_*), so those users have no channel to configure a custom env. For built-in MCP users, guide them instead to use the enterprise edition (imageType=enterprise, instance temporary tokens, no fixed password) or to use buildStrategy=image to deploy an already-pushed image.
**Enterprise-edition login requirements**: cloud/local builds for enterprise require minting a TCR temporary token via CAM. Environment-level API keys and temporary credentials from OAuth carry no CAM policy and will be blocked up front with a hint to switch to account-level keys or the image strategy; personal edition logs in directly with a static password via docker login without CAM, and is the only build path that works for API-key users.

**Layers** are account-level shared namespaces in SCF: same-named layers created in different environments share one version sequence, and deleting a version affects every environment bound to it. When creating a layer, use a unique name with the environment suffix, in the fixed format `\{layerName\}_\{current envId\}` (e.g. `common_cloud1-d9ghadgak3edf6b36`). Do not reuse the same bare layer name across environments; check with `listLayers` before creating. Read-only queries: listLayers / listLayerVersions / getLayerVersionDetail of queryFunctions.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Write action type. createFunctionTrigger / deleteFunctionTrigger manage scheduled tasks (cron / timer); publishVersion publishes a new version; updateFunctionAliasConfig updates alias / traffic routing; incrementalDeployFunction uploads a single changed file. Allowed values: "createFunction", "updateFunctionCode", "updateFunctionConfig", "invokeFunction", "deleteFunction", "createFunctionTrigger", "deleteFunctionTrigger", "createLayerVersion", "deleteLayerVersion", "attachLayer", "detachLayer", "updateFunctionLayers", "publishVersion", "updateFunctionAliasConfig", "incrementalDeployFunction"</td></tr>
<tr><td><code>func</code></td><td>object</td><td></td><td>Function configuration for createFunction / updateFunctionCode. Image/build deployment is selected by func.buildStrategy (zip/cloud/local/image), with image fields under func.imageConfig.</td></tr>
<tr><td><code>func.name</code></td><td>string</td><td>yes</td><td>Function name</td></tr>
<tr><td><code>func.type</code></td><td>string</td><td></td><td>Function type Allowed values: "Event", "HTTP"</td></tr>
<tr><td><code>func.protocolType</code></td><td>string</td><td></td><td>HTTP function access protocol. Currently only WebSockets is supported; use WS together with protocolParams.wsParams. Do not pass this field for ordinary HTTP functions. Other values such as HTTP cause InvalidParameterValue.ProtocolType. Allowed values: "WS"</td></tr>
<tr><td><code>func.protocolParams</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>func.protocolParams.wsParams</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>func.protocolParams.wsParams.idleTimeOut</code></td><td>number</td><td></td><td>WebSocket idle timeout in seconds</td></tr>
<tr><td><code>func.instanceConcurrencyConfig</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>func.instanceConcurrencyConfig.dynamicEnabled</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>func.instanceConcurrencyConfig.maxConcurrency</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>func.timeout</code></td><td>number</td><td></td><td>Function timeout</td></tr>
<tr><td><code>func.envVariables</code></td><td>object</td><td></td><td>Environment variables. If they include traditional TCP database variables such as DATABASE_URL, MYSQL_*, POSTGRES_*, or REDIS_*, also configure vpc (vpcId + subnetId), using IDs from the actual database/network configuration. Never guess them. Native app.rdb()/app.database() access does not require a VPC.</td></tr>
<tr><td><code>func.vpc</code></td><td>object</td><td></td><td>Private network configuration (egress). Required when using a non-native SDK to access MySQL, PostgreSQL, or Redis over TCP in a VPC. vpcId/subnetId must match the private database endpoint VPC. If unknown, check the console or ask the user; never use placeholders.</td></tr>
<tr><td><code>func.vpc.vpcId</code></td><td>string</td><td>yes</td><td>VPC ID from the real database/network console (e.g. vpc-xxxxxxxx). Required for non-native TCP DB access. Do NOT invent or use placeholders.</td></tr>
<tr><td><code>func.vpc.subnetId</code></td><td>string</td><td>yes</td><td>Subnet ID in the same VPC as the private DB endpoint (e.g. subnet-xxxxxxxx). Do NOT invent or use placeholders.</td></tr>
<tr><td><code>func.runtime</code></td><td>string</td><td></td><td>Runtime environment. Event functions support multiple runtimes:   Nodejs: Nodejs22.21, Nodejs20.19, Nodejs18.15, Nodejs16.13, Nodejs14.18, Nodejs12.16, Nodejs10.15, Nodejs8.9   Python: Python3.10, Python3.9, Python3.7, Python3.6, Python2.7   Php: Php8.0, Php7.4, Php7.2   Java: Java8, Java11   Golang: Golang1 Recommended runtimes:   Node.js: Nodejs18.15   Python: Python3.9   PHP: Php7.4   Java: Java11   Go: Golang1 For image deployment (creating a function from a TCR image), use "CustomImage" and provide imageConfig; functionRootPath/zipFile is not needed.</td></tr>
<tr><td><code>func.buildStrategy</code></td><td>string</td><td></td><td>HTTP function deployment strategy: zip=code package deployment (default); image=use an existing image (imageConfig.imageUri required); cloud=cloud image build; local=local Docker image build. cloud/local use image build deployment orchestration and require imageConfig. build itself is optional because repository coordinates (namespace defaults to envId and repository defaults to the function name) can be filled automatically. Provide build only for build details or fields such as build.registryCredential for a personal registry. Allowed values: "zip", "cloud", "local", "image"</td></tr>
<tr><td><code>func.imageConfig</code></td><td>object</td><td></td><td>Image configuration used with buildStrategy=image/cloud/local or runtime=CustomImage. All image fields are under this namespace. For image, set imageUri to use an existing image. For cloud/local, build may describe how to build; if omitted, default repository coordinates are filled automatically. Providing an existing image (imageUri) selects image deployment, so local code, scf_bootstrap, and Handler do not need to be packaged.</td></tr>
<tr><td><code>func.imageConfig.imageType</code></td><td>string</td><td></td><td>Image registry type: enterprise=Enterprise TCR, personal=Personal CCR. If omitted, the SDK infers enterprise when registryId is present and personal otherwise. Allowed values: "enterprise", "personal"</td></tr>
<tr><td><code>func.imageConfig.registryId</code></td><td>string</td><td></td><td>Enterprise TCR instance ID, such as tcr-xxxxxxxx. Required when imageType=enterprise; omit for personal images.</td></tr>
<tr><td><code>func.imageConfig.imagePort</code></td><td>number</td><td></td><td>HTTP image function listening port. The SDK only permits 9000; omit to use that value and do not specify another port. Allowed values: const 9000</td></tr>
<tr><td><code>func.imageConfig.entryPoint</code></td><td>string</td><td></td><td>Override the image entry point (ENTRYPOINT); normally unnecessary.</td></tr>
<tr><td><code>func.imageConfig.command</code></td><td>string</td><td></td><td>Override the image startup command, such as python. Omit to use the Dockerfile default.</td></tr>
<tr><td><code>func.imageConfig.args</code></td><td>string</td><td></td><td>Override image startup arguments, space-separated, such as -u app.py.</td></tr>
<tr><td><code>func.imageConfig.commandList</code></td><td>array of string</td><td></td><td>Array form of the image startup command, split into arguments; useful when the command itself contains spaces.</td></tr>
<tr><td><code>func.imageConfig.argsList</code></td><td>array of string</td><td></td><td>Array form of image startup arguments, already split; useful when an argument itself contains spaces.</td></tr>
<tr><td><code>func.imageConfig.containerImageAccelerate</code></td><td>boolean</td><td></td><td>Whether to enable image acceleration; recommended for large images to reduce cold-start time.</td></tr>
<tr><td><code>func.imageConfig.imageUri</code></td><td>string</td><td></td><td>Full image URL (tag required), in the format {domain}/{namespace}/{image}:{tag}, for example ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001. Do not use :latest. Required when buildStrategy=image (existing image); optional for buildStrategy=cloud/local because the build process produces and returns the image URL. The target repository is determined by build.repository/build.namespace; explicit values take precedence. If omitted, manager-node fills defaults and creates or reuses the repository (namespace defaults to envId and repository defaults to the function name).</td></tr>
<tr><td><code>func.imageConfig.build</code></td><td>object</td><td></td><td>Image build target. Used when buildStrategy=cloud (cloud build) or local (local Docker build); omit for buildStrategy=image (existing image). build is optional for cloud/local because missing repository coordinates can be filled automatically (namespace defaults to envId and repository defaults to the function name). Provide it only to specify build details or fields such as build.registryCredential for personal registries.</td></tr>
<tr><td><code>func.imageConfig.build.cwd</code></td><td>string</td><td>yes</td><td>Absolute directory for the image build context.</td></tr>
<tr><td><code>func.imageConfig.build.dockerfile</code></td><td>string</td><td></td><td>Dockerfile path relative to build.cwd; defaults to Dockerfile.</td></tr>
<tr><td><code>func.imageConfig.build.registryId</code></td><td>string</td><td></td><td>Enterprise TCR instance ID; omit for personal image builds.</td></tr>
<tr><td><code>func.imageConfig.build.namespace</code></td><td>string</td><td></td><td>Target image namespace; defaults to current environment ID (envId).</td></tr>
<tr><td><code>func.imageConfig.build.repository</code></td><td>string</td><td></td><td>Target repository path without tag/digest; defaults to the function name. local personal requires the full registry/namespace/repository.</td></tr>
<tr><td><code>func.imageConfig.build.tag</code></td><td>string</td><td></td><td>Target image tag for local strategy; cloud generates it, so omit for cloud.</td></tr>
<tr><td><code>func.imageConfig.build.platform</code></td><td>string</td><td></td><td>Target image platform; currently only linux/amd64 is supported. Allowed values: const "linux/amd64"</td></tr>
<tr><td><code>func.imageConfig.build.buildArgs</code></td><td>object</td><td></td><td>Docker build arguments. Do not pass secrets or credentials.</td></tr>
<tr><td><code>func.imageConfig.build.registryCredential</code></td><td>object</td><td></td><td>Personal TCR push credentials required by personal local/cloud builds. Prefer omitting the whole object and setting TCB_TCR_USERNAME and TCB_TCR_PASSWORD in the MCP configuration env, just like TENCENTCLOUD_SECRETID and other secrets. When environment variables are set, credentials do not need to be passed in request parameters. Explicit fields take precedence; missing fields fall back to environment variables.</td></tr>
<tr><td><code>func.imageConfig.build.registryCredential.username</code></td><td>string</td><td></td><td>Personal CCR login username, which must be the Tencent Cloud account UIN. If omitted, reads TCB_TCR_USERNAME from the MCP process environment.</td></tr>
<tr><td><code>func.imageConfig.build.registryCredential.password</code></td><td>string</td><td></td><td>Personal CCR fixed password. **Do not put a plaintext password in this field**. Set TCB_TCR_PASSWORD in the MCP configuration env and leave this field empty for automatic loading. This is sensitive and must not be logged or returned.</td></tr>
<tr><td><code>func.imageConfig.build.forceBuild</code></td><td>boolean</td><td></td><td>Whether to ignore same-digest reuse and force a rebuild.</td></tr>
<tr><td><code>func.imageConfig.build.retainedTags</code></td><td>integer</td><td></td><td>Number of most recent image tags retained after a Personal TCR build.</td></tr>
<tr><td><code>func.imageConfig.localFallback</code></td><td>string</td><td></td><td>How to handle an unavailable local build when buildStrategy=local. Defaults to error. Allowed values: "cloud", "error"</td></tr>
<tr><td><code>func.triggers</code></td><td>array of object</td><td></td><td>Trigger configuration array</td></tr>
<tr><td><code>func.triggers[].name</code></td><td>string</td><td>yes</td><td>Trigger name</td></tr>
<tr><td><code>func.triggers[].type</code></td><td>string</td><td>yes</td><td>Trigger type Allowed values: "timer"</td></tr>
<tr><td><code>func.triggers[].config</code></td><td>string</td><td>yes</td><td>Trigger configuration. timer must use the CloudBase 7-field cron format: second minute hour day month weekday year. The standard 5-field cron format is not supported (for example, */5 * * * * is invalid). Valid examples: 0 */5 * * * * * (every 5 minutes), 0 0 2 1 * * * (02:00 on the first day of every month), and 0 30 9 * * * * (09:30 every day).</td></tr>
<tr><td><code>func.handler</code></td><td>string</td><td></td><td>Function entry point</td></tr>
<tr><td><code>func.ignore</code></td><td>string | array of string</td><td></td><td>Files to ignore</td></tr>
<tr><td><code>func.isWaitInstall</code></td><td>boolean</td><td></td><td>Whether to wait for dependency installation</td></tr>
<tr><td><code>func.layers</code></td><td>array of object</td><td></td><td>Layer configuration</td></tr>
<tr><td><code>func.layers[].name</code></td><td>string</td><td>yes</td><td></td></tr>
<tr><td><code>func.layers[].version</code></td><td>number</td><td>yes</td><td></td></tr>
<tr><td><code>functionRootPath</code></td><td>string</td><td></td><td>Recommended local-directory input for creating or updating function code. Pass the absolute directory that directly contains function folders (e.g. /abs/path/cloudfunctions, containing &lt;functionName&gt;/index.js), not the project root or the function subdirectory. The SDK appends the function subdirectory; do not precompress ZIP or base64 content.</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>Whether createFunction overwrites an existing function.</td></tr>
<tr><td><code>functionName</code></td><td>string</td><td></td><td>Target function name at the top level. Used by updateFunctionCode, updateFunctionConfig, invokeFunction, publishVersion, updateFunctionAliasConfig, and similar actions. createFunction uses func.name; other actions use top-level functionName. A mistakenly supplied func.name is also recognized as functionName.</td></tr>
<tr><td><code>zipFile</code></td><td>string</td><td></td><td>Compatibility only: base64-encoded prebuilt code package. For ordinary createFunction/updateFunctionCode, do not create a ZIP first; prefer functionRootPath.</td></tr>
<tr><td><code>code</code></td><td>object</td><td></td><td>Two-phase ZIP deployment phase B: the code package has been uploaded to the environment COS bucket via queryFunctions action=getFunctionUploadUrl. Pass the triplet (cosBucketName/cosObjectName/cosBucketRegion) through unchanged from the getFunctionUploadUrl response. With code provided, createFunction/updateFunctionCode no longer reads local directories (functionRootPath/zipFile are unnecessary), and cloud dependency installation is skipped by default (override with func.installDependency). The triplet's bucket and region must be this environment's own bucket, and the object key must have the fnzip-upload/... form returned by getFunctionUploadUrl; hand-built triplets, a bucket from another environment, or cross-environment reuse are rejected and require fetching a new address.</td></tr>
<tr><td><code>code.cosBucketName</code></td><td>string</td><td>yes</td><td>Environment bucket short name (without the -appid suffix); pass through the cosBucketName returned by getFunctionUploadUrl, do not invent one</td></tr>
<tr><td><code>code.cosObjectName</code></td><td>string</td><td>yes</td><td>Uploaded object key; pass through the cosObjectName returned by getFunctionUploadUrl</td></tr>
<tr><td><code>code.cosBucketRegion</code></td><td>string</td><td></td><td>Bucket region; defaults to the current environment bucket region when omitted</td></tr>
<tr><td><code>handler</code></td><td>string</td><td></td><td>Function entry point</td></tr>
<tr><td><code>timeout</code></td><td>number</td><td></td><td>Timeout used for configuration updates.</td></tr>
<tr><td><code>envVariables</code></td><td>object</td><td></td><td>Environment variables to merge during a configuration update. If they contain TCP database variables such as DATABASE_URL, MYSQL_*, POSTGRES_*, or REDIS_*, also provide a real vpc (or ensure the function already has a complete VPC binding). Never guess vpcId/subnetId.</td></tr>
<tr><td><code>vpc</code></td><td>object</td><td></td><td>VPC information for configuration updates. Real vpcId + subnetId are required for non-native TCP database access; do not use placeholders.</td></tr>
<tr><td><code>vpc.vpcId</code></td><td>string</td><td>yes</td><td>VPC ID from the real database/network console (e.g. vpc-xxxxxxxx). Required for non-native TCP DB access. Do NOT invent or use placeholders.</td></tr>
<tr><td><code>vpc.subnetId</code></td><td>string</td><td>yes</td><td>Subnet ID in the same VPC as the private DB endpoint (e.g. subnet-xxxxxxxx). Do NOT invent or use placeholders.</td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td>Parameters passed to invokeFunction.</td></tr>
<tr><td><code>triggers</code></td><td>array of object</td><td></td><td>Trigger list for createFunctionTrigger, used for scheduled jobs. timer triggers use a 7-field cron expression (second minute hour day month weekday year), such as "0 */5 * * * * *" for every 5 minutes.</td></tr>
<tr><td><code>triggers[].name</code></td><td>string</td><td>yes</td><td>Trigger name</td></tr>
<tr><td><code>triggers[].type</code></td><td>string</td><td>yes</td><td>Trigger type Allowed values: "timer"</td></tr>
<tr><td><code>triggers[].config</code></td><td>string</td><td>yes</td><td>Trigger configuration. timer must use the CloudBase 7-field cron format: second minute hour day month weekday year. The standard 5-field cron format is not supported (for example, */5 * * * * is invalid). Valid examples: 0 */5 * * * * * (every 5 minutes), 0 0 2 1 * * * (02:00 on the first day of every month), and 0 30 9 * * * * (09:30 every day).</td></tr>
<tr><td><code>triggerName</code></td><td>string</td><td></td><td>Target trigger name for deleteFunctionTrigger.</td></tr>
<tr><td><code>replaceAll</code></td><td>boolean</td><td></td><td>Default false: if the function has timer triggers not listed in triggers, the tool refuses and lists their names. Set true to replace all timer triggers with this submission.</td></tr>
<tr><td><code>layerName</code></td><td>string</td><td></td><td>Layer name. When creating a layer, use `{layerName}_{current envId}` (for example, common_cloud1-d9ghadgak3edf6b36). Do not reuse a bare layer name across environments; layers use an account-level shared namespace.</td></tr>
<tr><td><code>layerVersion</code></td><td>number</td><td></td><td>Layer version number</td></tr>
<tr><td><code>contentPath</code></td><td>string</td><td></td><td>Only for createLayerVersion: path to layer content, either a directory or a ZIP file. To update function code, use functionRootPath / zipFile / code instead.</td></tr>
<tr><td><code>base64Content</code></td><td>string</td><td></td><td>Base64-encoded layer content.</td></tr>
<tr><td><code>runtimes</code></td><td>array of string</td><td></td><td>Runtimes supported by the layer.</td></tr>
<tr><td><code>description</code></td><td>string</td><td></td><td>Description. Layer version description for createLayerVersion; version or alias description for publishVersion / updateFunctionAliasConfig.</td></tr>
<tr><td><code>licenseInfo</code></td><td>string</td><td></td><td>Layer license information.</td></tr>
<tr><td><code>layers</code></td><td>array of object</td><td></td><td>Target layer list for updateFunctionLayers; array order becomes final order.</td></tr>
<tr><td><code>layers[].layerName</code></td><td>string</td><td>yes</td><td>Layer name</td></tr>
<tr><td><code>layers[].layerVersion</code></td><td>number</td><td>yes</td><td>Layer version number</td></tr>
<tr><td><code>codeSecret</code></td><td>string</td><td></td><td>Code protection secret used when binding a layer.</td></tr>
<tr><td><code>dryRun</code></td><td>boolean</td><td></td><td>Whether image build deployment (func.buildStrategy=cloud/local) only generates a deployment plan. Defaults to true; false also requires confirm=true.</td></tr>
<tr><td><code>wait</code></td><td>boolean</td><td></td><td>Whether a real image deployment waits for completion; false returns a taskId immediately and continues in the background. Defaults to true, but synchronous waiting can take about 15 minutes and hit the MCP Client timeout without a taskId to track, so pass wait=false explicitly for a real build deployment (buildStrategy=cloud/local, dryRun=false). Default: true</td></tr>
<tr><td><code>autoGrant</code></td><td>boolean</td><td></td><td>Whether manager-node may automatically add the fixed allowlist of CAM policies for image deployment. Defaults to false; set true only after explicitly confirming permission changes. Default: false</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Dangerous-operation confirmation. deleteFunction, deleteFunctionTrigger, deleteLayerVersion, detachLayer, other delete actions, and real image build deployment (func.buildStrategy=cloud/local) require confirm=true.</td></tr>
<tr><td><code>incrementalFile</code></td><td>string</td><td></td><td>Changed-file path for incrementalDeployFunction incremental deployment.</td></tr>
<tr><td><code>aliasName</code></td><td>string</td><td></td><td>Alias name for `updateFunctionAliasConfig`. Defaults to `$DEFAULT`</td></tr>
<tr><td><code>functionVersion</code></td><td>string</td><td></td><td>Primary version for `updateFunctionAliasConfig`. May be a concrete version number or `$LATEST`.</td></tr>
<tr><td><code>routingConfig</code></td><td>object</td><td></td><td>Traffic routing config for `updateFunctionAliasConfig`. AdditionalVersionWeights is used for canary weights; AddtionVersionMatchs keeps the SCF/SDK historical field name (including the typo).</td></tr>
<tr><td><code>routingConfig.AdditionalVersionWeights</code></td><td>array of object</td><td></td><td>Additional version weight list (canary release)</td></tr>
<tr><td><code>routingConfig.AdditionalVersionWeights[].Version</code></td><td>string</td><td>yes</td><td>Additional traffic version number</td></tr>
<tr><td><code>routingConfig.AdditionalVersionWeights[].Weight</code></td><td>number</td><td>yes</td><td>Additional traffic weight (0-1 or percentage per SCF convention)</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs</code></td><td>array of object</td><td></td><td>Additional version match rules (field name keeps SCF AddtionVersionMatchs)</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs[].Version</code></td><td>string</td><td>yes</td><td>Version targeted by a match rule</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs[].Key</code></td><td>string</td><td>yes</td><td>Header/Query key for a match rule</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs[].Method</code></td><td>string</td><td>yes</td><td>Match method, such as Exact / Regex</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs[].Expression</code></td><td>string</td><td>yes</td><td>Match expression</td></tr>
</tbody>
</table>

---

### `queryHosting`
Read-only information about CloudBase static hosting. Lets the AI discover state first and then decide the next step: action=websiteConfig queries the index/error document, routing rules, and site domain info; action=status queries the hosting service status; action=findFiles finds files by prefix; action=listFiles lists all hosted files; action=domainStatus queries the current status and configuration of custom domains. This tool has no side effects.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Query type: websiteConfig=query the static hosting website document config and site domain info, status=query the static hosting service status, findFiles=find hosted files by prefix, listFiles=list all files in static hosting, domainStatus=query custom domain config and effective status. This tool is strictly read-only and never modifies resources. Allowed values: "websiteConfig", "status", "findFiles", "listFiles", "domainStatus"</td></tr>
<tr><td><code>prefix</code></td><td>string</td><td></td><td>File prefix filter, e.g. app/ or assets/logo. Recommended for action=findFiles to narrow the result; omitting it does not fail — it returns the first N files of the whole site so you can pick a real prefix.</td></tr>
<tr><td><code>marker</code></td><td>string</td><td></td><td>Pagination start marker. Used only with action=findFiles to continue after the previous page.</td></tr>
<tr><td><code>maxKeys</code></td><td>integer</td><td></td><td>Maximum number of files returned per call. Used only with action=findFiles.</td></tr>
<tr><td><code>domains</code></td><td>array of string</td><td></td><td>Custom domains to query. Used only with action=domainStatus, e.g. ["www.example.com"].</td></tr>
</tbody>
</table>

---

### `manageHosting`
Mutation operations for CloudBase static hosting. action=upload uploads local build artifacts to the shared domain (domain format: &lt;envId&gt;-&lt;appId&gt;.tcloudbaseapp.com/&lt;cloudPath&gt;); action=delete deletes hosted files or directories (confirm=true required); action=setWebsiteDocument sets the index/error document and routing rules; action=enableService enables static hosting; action=bindDomain / unbindDomain / updateDomain manage custom domains; action=downloadFile / downloadDirectory download hosted content to local disk. ⚠️ Every hosting operation calls the DescribeStaticStore control-plane API underneath (20 req/s QPS limit): when deleting multiple files, call sequentially with intervals (no more than 10 calls per second recommended); for multiple files in the same directory, prefer isDir=true to delete the whole directory in one call. If the error contains "frequency limit", rate limiting was triggered — wait 1-2 seconds and retry; do not retry in rapid succession. ⚠️ This tool has no action to disable the default domain (*.tcloudbaseapp.com); to disable that default public domain, use manageGateway(action="disableRoute", domain=the STATIC_STORE IsDefault domain, path="/") (backed by ModifyHTTPServiceRoute, not ModifyGatewayRoute). ⚠️ For new projects prefer manageApps (deploys to a dedicated subdomain); this tool suits existing legacy projects or as a fallback for manageApps. manageApps and manageHosting use different domains, so switching invalidates old links. If the task is only inspecting config, files, or domain status, use queryHosting instead.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Management type: upload=upload local build artifacts to static hosting, delete=delete hosted files or directories, setWebsiteDocument=set the index/error document and routing rules, enableService=enable the static hosting service, bindDomain=bind a custom domain, unbindDomain=unbind a custom domain, updateDomain=update domain cache/hotlink protection/IP rules, downloadFile=download a single hosted file locally, downloadDirectory=download a hosted directory locally. Allowed values: "upload", "delete", "setWebsiteDocument", "enableService", "bindDomain", "unbindDomain", "updateDomain", "downloadFile", "downloadDirectory"</td></tr>
<tr><td><code>localPath</code></td><td>string</td><td></td><td>Local path. With action=upload it is the local file/directory to upload; with action=downloadFile or downloadDirectory it is the local download target. An absolute path is recommended.</td></tr>
<tr><td><code>cloudPath</code></td><td>string</td><td></td><td>Target path in static hosting. With action=upload it is the hosted path after upload; with action=delete/downloadFile/downloadDirectory it is the hosted file or directory path.</td></tr>
<tr><td><code>files</code></td><td>array of object</td><td></td><td>Multi-file upload config. Optional and only for action=upload; when provided, files are uploaded one by one and the single localPath/cloudPath is no longer used. Default: []</td></tr>
<tr><td><code>files[].localPath</code></td><td>string</td><td>yes</td><td>Absolute local path of a single file to upload.</td></tr>
<tr><td><code>files[].cloudPath</code></td><td>string</td><td>yes</td><td>Hosted path of this file after it is uploaded to static hosting.</td></tr>
<tr><td><code>ignore</code></td><td>string | array of string</td><td></td><td>File patterns to ignore during upload. Optional and only for action=upload, e.g. node_modules or ["**/*.map", "**/.DS_Store"].</td></tr>
<tr><td><code>isDir</code></td><td>boolean</td><td></td><td>Whether to treat cloudPath as a directory. Used only with action=delete; true=delete the directory, false=delete a single file. Default: false</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>High-risk operation confirmation switch. Must be explicitly true for action=delete and action=unbindDomain to avoid deleting files or unbinding domains by mistake. Default: false</td></tr>
<tr><td><code>indexDocument</code></td><td>string</td><td></td><td>Website index document name. Required only with action=setWebsiteDocument, e.g. index.html.</td></tr>
<tr><td><code>errorDocument</code></td><td>string</td><td></td><td>Error document name. Optional and only for action=setWebsiteDocument, e.g. 404.html.</td></tr>
<tr><td><code>routingRules</code></td><td>array of object</td><td></td><td>Website routing rule list. Optional and only for action=setWebsiteDocument. A common SPA setup rewrites 404 to index.html.</td></tr>
<tr><td><code>routingRules[].keyPrefixEquals</code></td><td>string</td><td></td><td>Prefix match rule, e.g. app/ or assets/. Use either this or httpErrorCodeReturnedEquals, or combine them per CloudBase rules.</td></tr>
<tr><td><code>routingRules[].httpErrorCodeReturnedEquals</code></td><td>string</td><td></td><td>HTTP error code to match, e.g. 404. SPA fallback commonly uses 404.</td></tr>
<tr><td><code>routingRules[].replaceKeyWith</code></td><td>string</td><td></td><td>Replace the match with a fixed file path, e.g. index.html.</td></tr>
<tr><td><code>routingRules[].replaceKeyPrefixWith</code></td><td>string</td><td></td><td>Replace the matched prefix with a new prefix path.</td></tr>
<tr><td><code>domain</code></td><td>string</td><td></td><td>Custom domain. Used with action=bindDomain / unbindDomain / updateDomain, e.g. www.example.com.</td></tr>
<tr><td><code>certId</code></td><td>string</td><td></td><td>Certificate ID. Required only with action=bindDomain.</td></tr>
<tr><td><code>domainId</code></td><td>number</td><td></td><td>Domain ID. Required only with action=updateDomain to update the specified domain config precisely.</td></tr>
<tr><td><code>domainConfig</code></td><td>object</td><td></td><td>Domain config. Required only with action=updateDomain; supports cache, Referer, hotlink protection, IP rules, and rate limiting.</td></tr>
<tr><td><code>domainConfig.Refer</code></td><td>object</td><td></td><td>Referer hotlink protection config.</td></tr>
<tr><td><code>domainConfig.Refer.Switch</code></td><td>string</td><td>yes</td><td>Referer hotlink protection switch: on=enabled, off=disabled. Allowed values: "on", "off"</td></tr>
<tr><td><code>domainConfig.Refer.RefererRules</code></td><td>array of object</td><td></td><td>Referer rule list.</td></tr>
<tr><td><code>domainConfig.Refer.RefererRules[].RefererType</code></td><td>string</td><td>yes</td><td>Referer rule type: blacklist=deny list, whitelist=allow list. Allowed values: "blacklist", "whitelist"</td></tr>
<tr><td><code>domainConfig.Refer.RefererRules[].Referers</code></td><td>array of string</td><td>yes</td><td>Referer rule values.</td></tr>
<tr><td><code>domainConfig.Refer.RefererRules[].AllowEmpty</code></td><td>boolean</td><td>yes</td><td>Whether an empty Referer is allowed.</td></tr>
<tr><td><code>domainConfig.Cache</code></td><td>array of object</td><td></td><td>CDN cache rule list.</td></tr>
<tr><td><code>domainConfig.Cache[].RuleType</code></td><td>string</td><td>yes</td><td>Cache rule type: fileType=file type, path=path. Allowed values: "fileType", "path"</td></tr>
<tr><td><code>domainConfig.Cache[].RuleValue</code></td><td>string</td><td>yes</td><td>Rule match value.</td></tr>
<tr><td><code>domainConfig.Cache[].CacheTtl</code></td><td>number</td><td>yes</td><td>Cache TTL in seconds.</td></tr>
<tr><td><code>domainConfig.IpFilter</code></td><td>object</td><td></td><td>IP access control config.</td></tr>
<tr><td><code>domainConfig.IpFilter.Switch</code></td><td>string</td><td>yes</td><td>IP access control switch: on=enabled, off=disabled. Allowed values: "on", "off"</td></tr>
<tr><td><code>domainConfig.IpFilter.FilterType</code></td><td>string</td><td></td><td>Filter type: blacklist=deny list, whitelist=allow list. Allowed values: "blacklist", "whitelist"</td></tr>
<tr><td><code>domainConfig.IpFilter.Filters</code></td><td>array of string</td><td></td><td>IP rule list.</td></tr>
<tr><td><code>domainConfig.IpFreqLimit</code></td><td>object</td><td></td><td>IP rate limit config.</td></tr>
<tr><td><code>domainConfig.IpFreqLimit.Switch</code></td><td>string</td><td>yes</td><td>IP rate limit switch: on=enabled, off=disabled. Allowed values: "on", "off"</td></tr>
<tr><td><code>domainConfig.IpFreqLimit.Qps</code></td><td>number</td><td></td><td>QPS cap per IP.</td></tr>
</tbody>
</table>

---

### `queryStorage`
⚠️ For PG-mode environments use queryPgStorage instead of this tool (pgstore and the legacy COS are two separate systems).

Query CloudBase cloud storage info: list directory files, get file details, get temporary download URLs, and other read-only operations. Returned file info includes name, size, modification time, download URL, etc. Note: the temporaryUrl returned by action=url is a temporary signed link whose validity is determined by the maxAge parameter (default 1 hour); do not treat it as a permanent public URL. The tool also derives publicUrl from the Storages[0].CdnDomain returned by DescribeEnvs. ⚠️ Warning: publicUrl is anonymously accessible only when the bucket ACL is public-read; with the default private-read-write bucket the returned publicUrl will 403 — keep using temporaryUrl, or first set the target path to public-read via the console/SDK.

💡 For bucket ACL permission management use the permissions tool: query with queryPermissions(action="getResourcePermission", resourceType="storage", resourceId="bucket-name"), set with managePermissions(action="updateResourcePermission", resourceType="storage", resourceId="bucket-name", permission="READONLY").

📦 CloudBase PG / pgstore environments: buckets listed in `DescribeEnvs.Storages[]` belong to the legacy NoSQL backend and are not pgstore buckets. Use this tool for regular storage; when preparing a bucket for PG browser uploads, confirm the target bucket is usable by the pgstore backend, otherwise the browser `app.storage.from().upload(...)` will fail with `STORAGE_BUCKET_NOT_FOUND` and a `PUT https://undefined/` request.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Query operation: list=list all files in a directory, info=get details for a specified file, url=get a temporary file download URL, read=read text file content Allowed values: "list", "info", "url", "read"</td></tr>
<tr><td><code>cloudPath</code></td><td>string</td><td>yes</td><td>Cloud file path, for example files/data.txt or files/ (directory)</td></tr>
<tr><td><code>maxAge</code></td><td>number</td><td></td><td>Temporary URL validity in seconds, range: 1-86400, default: 3600 (1 hour) Default: 3600</td></tr>
</tbody>
</table>

---

### `manageStorage`
⚠️ For PG-mode environments use queryPgStorage instead of this tool (pgstore and the legacy COS are two separate systems).

Manage CloudBase cloud storage files — for COS/Storage objects only, not for static website hosting. Supports uploading/downloading/deleting files and directories. Delete operations require force=true as confirmation to prevent accidental deletion. Note: the temporaryUrl returned after upload is a temporary signed link that expires in 1 hour; do not write it into configuration or persistent storage as a permanent public URL. The tool also derives publicUrl from the Storages[0].CdnDomain returned by DescribeEnvs. ⚠️ Warning: publicUrl is anonymously accessible only when the bucket ACL is public-read; with the default private-read-write bucket the returned publicUrl will 403 — keep using temporaryUrl, or first set the target path to public-read via the console/SDK.

💡 For bucket ACL permission management use the permissions tool: query with queryPermissions(action="getResourcePermission", resourceType="storage", resourceId="bucket-name"), set with managePermissions(action="updateResourcePermission", resourceType="storage", resourceId="bucket-name", permission="READONLY").

📦 CloudBase PG / pgstore buckets must be created before use (same as Supabase Storage: the bucket must exist before upload). The browser SDK `app.storage.from().upload(path, file)` does not create buckets automatically, and the first segment of `path` is the bucket name (e.g. `covers/foo.png` → bucket=`covers`); the argument of `from('covers')` is currently not prepended to the path. If the browser sees `STORAGE_BUCKET_NOT_FOUND` or `PUT https://undefined/` during upload (shown as `net::ERR_NAME_NOT_RESOLVED` in DevTools), first confirm / create the corresponding pgstore bucket with this tool or the console, then have the frontend retry the upload — do not let the frontend silently swallow the upload failure. Legacy NoSQL buckets returned by `DescribeEnvs.Storages[]` (shaped like `&lt;hash&gt;-&lt;envId&gt;-&lt;appId&gt;`) are not usable pgstore buckets; never use them as the default target.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Management operation: upload=upload a file or directory, download=download a file or directory, delete=delete a file or directory Allowed values: "upload", "download", "delete"</td></tr>
<tr><td><code>localPath</code></td><td>string</td><td></td><td>Local file path; an absolute path such as /tmp/files/data.txt is recommended. Required for upload/download and not needed for delete</td></tr>
<tr><td><code>cloudPath</code></td><td>string</td><td>yes</td><td>Cloud file path, for example files/data.txt</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>Force-operation switch. Set to true to confirm deletion; defaults to false Default: false</td></tr>
<tr><td><code>isDirectory</code></td><td>boolean</td><td></td><td>Whether the operation targets a directory: true=directory, false=file; defaults to false Default: false</td></tr>
</tbody>
</table>

---

### `downloadTemplate`
Automatically downloads and deploys CloudBase project templates.
**Note**: Call this tool when the user requests to create a new project using a CloudBase template.

Supported templates:
- react: React + CloudBase full-stack app template
- vue: Vue + CloudBase full-stack app template
- miniprogram: WeChat Mini Program + CloudBase template
- uniapp: UniApp + CloudBase cross-platform app template
- rules: AI editor configuration files only (Cursor, CodeBuddy, Claude Code and other mainstream editors), suitable for adding AI editor configuration to an existing project

Supported IDE types:
- all: download configurations for all IDEs
- cursor: Cursor AI editor
- codebuddy: CodeBuddy AI editor
- claude-code: Claude Code AI editor
- gemini-cli: Gemini CLI
- opencode: OpenCode AI editor
- qwen-code: Tongyi Lingma
- baidu-comate: Baidu Comate
- openai-codex-cli: OpenAI Codex CLI
- github-copilot: GitHub Copilot
- roocode: RooCode AI editor (MCP config only, no rule files)
- tongyi-lingma: Tongyi Lingma
- trae: Trae AI editor
- qoder: Qoder AI editor
- antigravity: Google Antigravity AI editor
- vscode: Visual Studio Code
- kiro: Kiro AI editor (MCP config only, no rule files)
- aider: Aider AI editor
- iflow-cli: iFlow CLI (MCP config only, no rule files)

Note: if the ide parameter is not provided and the IDE cannot be detected from environment variables, an error will be returned asking for the ide parameter

Notes:
- the rules template automatically embeds the current MCP version for future maintenance and version tracking
- when downloading the rules template, if a README.md file already exists in the project, the system protects it from being overwritten (unless overwrite=true is set)

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>template</code></td><td>string</td><td>yes</td><td>The type of template to download Allowed values: "react", "vue", "miniprogram", "uniapp", "rules"</td></tr>
<tr><td><code>ide</code></td><td>string</td><td>yes</td><td>The IDE type whose configuration should be downloaded. Allowed values: "all", "cursor", "codebuddy", "claude-code", "gemini-cli", "opencode", "qwen-code", "baidu-comate", "openai-codex-cli", "github-copilot", "roocode", "tongyi-lingma", "trae", "qoder", "antigravity", "vscode", "kiro", "aider", "iflow-cli"</td></tr>
<tr><td><code>overwrite</code></td><td>boolean</td><td></td><td>Whether to overwrite existing files. Defaults to false (do not overwrite).</td></tr>
</tbody>
</table>

---

### `searchKnowledgeBase`
CloudBase knowledge base search tool. Supports CloudBase official docs (docs), fixed skill docs (skill), and OpenAPI docs (openapi).

Choose mode by scenario:
- A tool call failed with an error code in the message (e.g. OperationDenied.FreePackageDenied): mode=docs + action=searchDocs (query=error code). Look up the official meaning and guidance of the error code before acting; do not retry on guesses.
- Unsure where the answer is and need a full-text search over official docs: mode=docs + action=searchDocs
- You know the doc title, hierarchical path, or URL: mode=docs + action=findByName or action=readDoc
- Need a hands-on guide / best practices for a scenario: mode=skill + skillName
- Need an HTTP API definition: mode=openapi + apiName

⚠️ Important: when CloudBase skills are disabled or the current IDE does not support reading skill files, use searchKnowledgeBase(mode=skill, skillName=...) to get CloudBase skill doc content instead of trying to read skill files directly. Direct reads may return 400 errors. Examples: searchKnowledgeBase(mode=skill, skillName=minimal-web-baas-demo) for a minimal Web+database demo; skillName=auth-tool-cloudbase for login provider setup; skillName=auth-web-cloudbase for Web frontend login; skillName=cloudbase-agent for agent development; skillName=cloudbase-mcp for MCP connection modes (local / remote), calling tools from the shell with mcporter, or the site / plugin switches.

A skill response contains the full SKILL.md plus the URLs of all its .md files in the remote aggregate repo (CNB raw), fetchable over HTTP; relative links are rewritten to absolute URLs, and when the skill is absent from the remote repo only the inline content is returned and that is stated explicitly.

When unsure which one to pick: call with mode=skill and no skillName, or mode=openapi and no apiName, to get the current catalog with each entry's scenario / summary (currently 32 skills, 8 APIs), then call again with the name.

Note: OpenAPI doc (openapi) queries only need mode="openapi" and apiName; do not pass action — action is only for mode="docs".

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>mode</code></td><td>string</td><td>yes</td><td>Allowed values: "skill", "openapi", "docs"</td></tr>
<tr><td><code>skillName</code></td><td>string</td><td></td><td>Required for mode=skill. The skill name. Allowed values: "cloudbase-all-in-one", "ai-model-nodejs", "ai-model-web", "ai-model-wechat", "auth-nodejs-cloudbase", "auth-tool-cloudbase", "auth-web-cloudbase", "auth-wechat-miniprogram", "cloud-api-operations", "cloud-functions", "cloud-storage-web", "cloudbase-agent", "cloudbase-cli", "cloudbase-code-review", "cloudbase-declarative-deploy", "cloudbase-document-database-in-wechat-miniprogram", "cloudbase-document-database-web-sdk", "cloudbase-mcp", "cloudbase-platform", "cloudbase-wechat-integration", "cloudrun-development", "http-api-cloudbase", "minimal-web-baas-demo", "miniprogram-development", "ops-inspector", "postgresql-best-practices-cloudbase", "postgresql-development-cloudbase", "relational-database-mcp-cloudbase", "relational-database-web-cloudbase", "spec-workflow", "ui-design", "web-development"</td></tr>
<tr><td><code>apiName</code></td><td>string</td><td></td><td>Required for mode=openapi. The API name. Allowed values: "mysqldb", "pgdb", "functions", "auth", "cloudrun", "storage", "nosql", "ai_model"</td></tr>
<tr><td><code>action</code></td><td>string</td><td></td><td>Only for mode=docs; do not pass action with mode=openapi. CloudBase documentation action: listModules lists all documentation modules; listModuleDocs gets the catalog for a module; findByName searches intelligently by name, path, or URL; readDoc reads document Markdown; searchDocs performs a full-text search of the official documentation. Allowed values: "listModules", "listModuleDocs", "findByName", "readDoc", "searchDocs"</td></tr>
<tr><td><code>moduleName</code></td><td>string</td><td></td><td>Required when mode=docs and action=listModuleDocs. The module name.</td></tr>
<tr><td><code>input</code></td><td>string</td><td></td><td>Required when mode=docs and action=findByName. Accepts a module name, document title, hierarchical path, or URL.</td></tr>
<tr><td><code>docPath</code></td><td>string</td><td></td><td>Required when mode=docs and action=readDoc. A site-relative path such as /quick-start, or a document address returned by action=findByName / action=searchDocs — only the path is used; any host is ignored.</td></tr>
<tr><td><code>query</code></td><td>string</td><td></td><td>Required when mode=docs and action=searchDocs. Full-text search keywords.</td></tr>
</tbody>
</table>

---

### `queryCloudRun`
Query CloudRun service info: list services, get service details, list available templates, get build logs (getDeployLog, cloud source builds only / depends on CODING), get runtime logs (getProcessLog, works for both image and source deploys / no CODING needed), get deploy records, and check the env's CloudRun provisioning status (envStatus). Returned info includes service name, status, access type, config details, and latest deploy context.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Query action: list=list CloudRun services (supports pagination and filtering), detail=query details of a service (including service config and latest deploy status), templates=list available project templates (for initializing new projects), getDeployLog=get build logs (only meaningful for cloud source builds, backed by CODING/DescribeCloudRunBuildLog; existing-image deploys have no build phase; accounts not logged into CODING get an error), getProcessLog=get runtime logs (deploy-phase steps plus container startup/runtime logs, backed by tcbr/DescribeCloudRunProcessLog; works for both image deploys and source builds and does not depend on CODING; RunId comes from latestDeploy.RunId of detail/getDeployRecords), getDeployRecords=list deploy records of a service (newest first, including BuildId/RunId/FlowRatio/Status, useful for release history and rollback context), envStatus=check whether CloudRun is provisioned for the current env and its status (Status=creating provisioning/normal provisioned), used to poll progress after initEnv or to confirm readiness before deploy, getManageTask=query the deploy task of a service (backed by tcbr/DescribeServerManageTask); returns the task Id/Status plus the latest deploy record status, used to tell whether a deploy is progressing or stuck (e.g. a version stuck in 'creating'). Use it to confirm the real task state when you hit "a deploy task is already running" instead of blindly retrying Allowed values: "list", "detail", "templates", "getDeployLog", "getProcessLog", "getDeployRecords", "envStatus", "getManageTask"</td></tr>
<tr><td><code>pageSize</code></td><td>number</td><td></td><td>Page size, controlling how many services are returned per page. Range: 1-100, default: 10. Adjust based on network performance and display needs Default: 10</td></tr>
<tr><td><code>pageNum</code></td><td>number</td><td></td><td>Page number for paginated queries. Starts at 1, default: 1. Use with pageSize to browse page by page Default: 1</td></tr>
<tr><td><code>serverName</code></td><td>string</td><td></td><td>Service name filter with fuzzy matching. For example, "test" matches service names like "test-service" and "my-test-app". Leave empty to query all services</td></tr>
<tr><td><code>serverType</code></td><td>string</td><td></td><td>Service type filter: function=function-type CloudRun (Node.js only, with special development requirements and limits, suitable for simple API services), container=container service (recommended; supports any language and framework such as Java/Go/Python/PHP/.NET, suitable for most scenarios) Allowed values: "function", "container"</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Environment ID (used with action=envStatus; the currently configured env is used when omitted). Format: env-xxxxxx</td></tr>
<tr><td><code>detailServerName</code></td><td>string</td><td></td><td>Name of the service whose details, deploy records, build logs, or runtime logs you want. Recommended when action is detail, getDeployLog, getProcessLog, or getDeployRecords; it must be an existing service name. Use the list action to get available service names</td></tr>
<tr><td><code>buildId</code></td><td>number</td><td></td><td>Build ID, used only with action=getDeployLog (build logs, cloud source builds only). When omitted, the build log of the most recent deploy is returned</td></tr>
<tr><td><code>runId</code></td><td>string</td><td></td><td>Run ID (RunId), used only with action=getProcessLog. When omitted, the RunId of the service's most recent deploy record is used (the same source as latestDeploy.RunId in detail/getDeployRecords). Runtime logs are available for both image deploys and source builds</td></tr>
<tr><td><code>revealEnvParams</code></td><td>boolean</td><td></td><td>Whether to return plaintext service environment variables (ServerConfig.EnvParams) (effective only with action=detail). Default false, values are masked as "***" (keys are kept, which is enough to check which variables are configured and whether a change took effect); when true, plaintext is returned and sensitive variables (such as a DATABASE_URL containing a password) may be exposed to the model context — use with care Default: false</td></tr>
</tbody>
</table>

---

### `manageCloudRun`
Manage CloudRun services, in development order: provision the CloudRun env (initEnv), initialize a project (optionally from a template; list templates via queryCloudRun), download service code, run locally (function services only), deploy code, update config only (updateConfig, no code upload needed), and delete the service. deploy supports two modes: 1) source build (pass targetPath; local code is packaged and uploaded, the default); 2) existing image deploy (pass imageUrl, e.g. ccr.ccs.tencentyun.com/ns/img:v1; DeployType=image container deploy, targetPath optional). deploy means "trigger deploy + lightweight wait for task registration" (up to ~45s; pass waitRegistration=false to skip the wait when you don't need the buildId). Source builds return buildId — poll getDeployLog for build progress, then getProcessLog; image deploys (imageUrl) usually have BuildId=0 — getDeployLog is skipped, and runId/next_step guide you to getProcessLog (or getDeployRecords first for RunId). If the user explicitly specifies an image or no rebuild is needed, you must pass imageUrl instead of falling back to a source build just because a local source directory exists. For existing services, deploy reads the remote config first and merges (preserving VpcConf/EnvParams/OpenAccessTypes). Deletion requires confirmation; set force=true. If a new env reports CloudRun not provisioned before the first deploy, call initEnv first (async, idempotent). Before deploying, make sure the image carries no static content: media files (video, large images, fonts), user uploads, and frequently-updated static resources belong in cloud storage referenced by URL, not in the image. Otherwise every deploy re-pushes the whole image and every scale-up instance re-pulls it — one demo video can turn a 30-second deploy into minutes.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>CloudRun service management action: init=initialize new CloudRun project code from a template (creates a subdirectory named after serverName under targetPath), download=download an existing service's code locally, run=run a function-type CloudRun service locally (function services only), deploy=trigger the deploy and wait lightly for task registration (does not hang for the full build; poll getDeployLog for source builds, skip getDeployLog and use getProcessLog for image deploys), updateConfig=update the service config only without re-uploading code, delete=delete a CloudRun service (irreversible, requires confirmation), createAgent=create a function-type Agent, initEnv=provision CloudRun for the current env (asynchronous and idempotent; use before the first deploy in a new env), traffic=traffic management and canary release (sub-actions in trafficOp) Allowed values: "init", "download", "run", "deploy", "delete", "createAgent", "updateConfig", "initEnv", "traffic"</td></tr>
<tr><td><code>serverName</code></td><td>string</td><td></td><td>CloudRun service name, used to identify and manage the service. Naming rules: upper/lowercase letters, digits, hyphens, and underscores; must start with a letter; 3-45 characters. For init it is the subdirectory name created under targetPath; for other actions it is the target service name. The initEnv action does not need this parameter</td></tr>
<tr><td><code>trafficOp</code></td><td>string</td><td></td><td>Traffic management sub-action (used with action=traffic): set=adjust the canary traffic split (deploy the new version to canary first, then set stablePercent/canaryPercent); promote=release the canary version to full traffic and turn off canary release; rollback=stop the current canary/releasing version and return to the previous stable version Allowed values: "set", "promote", "rollback"</td></tr>
<tr><td><code>stablePercent</code></td><td>number</td><td></td><td>Stable version traffic percentage (used with trafficOp=set), range 0-100. It must sum to 100 with canaryPercent. For example, to send 90% of traffic to stable and 10% to canary, use stablePercent=90, canaryPercent=10</td></tr>
<tr><td><code>canaryPercent</code></td><td>number</td><td></td><td>Canary version traffic percentage (used with trafficOp=set), range 0-100. It must sum to 100 with stablePercent. For example, to send 90% of traffic to stable and 10% to canary, use stablePercent=90, canaryPercent=10</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Environment ID (used with action=initEnv; the currently configured env is used when omitted). Format: env-xxxxxx</td></tr>
<tr><td><code>packageType</code></td><td>string</td><td></td><td>CloudRun env package type (used with action=initEnv): Trial, Standard, Professional, Enterprise. Default Trial Allowed values: "Trial", "Standard", "Professional", "Enterprise"；Default: "Trial"</td></tr>
<tr><td><code>vpcId</code></td><td>string</td><td></td><td>VPC network ID (optional with action=initEnv). Required when the platform refuses to create the network for you; format: vpc-xxxxxxxx. Passed through to VpcId/SubNetIds of CreateCloudRunEnv together with subnetIds. It can be omitted in most cases (the system creates the network)</td></tr>
<tr><td><code>subnetIds</code></td><td>array of string</td><td></td><td>Subnet ID list (optional with action=initEnv). Required when you need to specify your own VPC, e.g. ["subnet-xxxxxxxx"]. Passed through to SubNetIds of CreateCloudRunEnv together with vpcId</td></tr>
<tr><td><code>targetPath</code></td><td>string</td><td></td><td>Local code path; must be absolute. For deploy it is the code directory to deploy, for download the download target directory, and for init the parent directory of the CloudRun service. Recommended convention: the cloudrun/ directory under the project root. It must name a specific project directory: the filesystem root, the home directory itself, /Users itself, system directories (including /bin and /etc), and host-data directories such as .ssh, Library, or .config/.cloudbase are rejected. May be omitted for updateConfig and when deploying an existing image via imageUrl. Having a local source directory does not mean a source build is required; when the user specifies an image, prefer imageUrl.</td></tr>
<tr><td><code>imageUrl</code></td><td>string</td><td></td><td>Existing-image deploy (used with action=deploy): the container image address, e.g. ccr.ccs.tencentyun.com/ns/img:v1 or a public registry address; no local source directory is needed when provided. Publicly pullable anonymous images can be used directly; private/login-required images (such as ghcr.io) must first be docker pull'ed locally, then docker tag/push'ed to Tencent Cloud CCR, and the CCR address used here. When omitted, a source build is used. If the user explicitly mentions a specific image, or no code rebuild is needed, you must pass imageUrl for an image deploy instead of falling back to a source build.</td></tr>
<tr><td><code>envParamsReplaceAll</code></td><td>boolean</td><td></td><td>EnvParams merge strategy (deploy / updateConfig): false (default)=merge with the remote config by key (input overrides same-named keys, other remote keys are preserved); true=replace the remote EnvParams entirely with the input. Effective only when EnvParams is passed explicitly Default: false</td></tr>
<tr><td><code>serverConfig</code></td><td>object</td><td></td><td>Service config for deploy / updateConfig. Includes resource specs, access permissions, environment variables, logs, network, and more. When deploy omits it, existing services still merge and preserve the remote VpcConf/EnvParams/OpenAccessTypes; updateConfig needs at least one config field</td></tr>
<tr><td><code>serverConfig.OpenAccessTypes</code></td><td>array of string</td><td></td><td>Public access type config, controlling access permissions of the service: OA=office network access, PUBLIC=public access (default, reachable via an HTTPS domain), MINIAPP=mini program access, VPC=VPC access (reachable only within the same VPC). Multiple types can be configured</td></tr>
<tr><td><code>serverConfig.Cpu</code></td><td>number</td><td></td><td>CPU spec in cores. Allowed values: 0.25, 0.5, 1, 2, 4, 8, and so on. Note: the memory spec must be twice the CPU spec (e.g. CPU=0.25 means memory=0.5, CPU=1 means memory=2). Affects service performance and billing</td></tr>
<tr><td><code>serverConfig.Mem</code></td><td>number</td><td></td><td>Memory spec in GB. Allowed values: 0.5, 1, 2, 4, 8, 16, and so on. Note: it must be twice the CPU spec. Affects service performance and billing</td></tr>
<tr><td><code>serverConfig.MinNum</code></td><td>number</td><td></td><td>Minimum instance count, controlling the minimum number of running instances. 0 allows scaling to zero (no cost when there are no requests); a value greater than 0 keeps that many instances running at all times (fast responses but higher cost). Setting 1 is recommended to reduce cold-start latency and improve user experience</td></tr>
<tr><td><code>serverConfig.MaxNum</code></td><td>number</td><td></td><td>Maximum instance count, controlling the maximum number of running instances. As traffic grows, the service scales out up to this count and rejects new requests beyond it. Set it based on your peak traffic</td></tr>
<tr><td><code>serverConfig.PolicyDetails</code></td><td>array of object</td><td></td><td>Autoscaling policy array, used to configure automatic scaling of the service. Multiple policies can be configured</td></tr>
<tr><td><code>serverConfig.PolicyDetails[].PolicyType</code></td><td>string</td><td>yes</td><td>Scaling type: cpu=scale on CPU utilization, mem=scale on memory utilization, cpu/mem=scale on CPU and memory utilization Allowed values: "cpu", "mem", "cpu/mem"</td></tr>
<tr><td><code>serverConfig.PolicyDetails[].PolicyThreshold</code></td><td>number</td><td>yes</td><td>Scaling threshold as a percentage. For example, 60 means scaling is triggered when resource utilization reaches 60%</td></tr>
<tr><td><code>serverConfig.CustomLogs</code></td><td>string</td><td></td><td>Custom log config, used to configure log collection and storage policies of the service</td></tr>
<tr><td><code>serverConfig.Port</code></td><td>number</td><td></td><td>Service listening port. Function services are fixed at 3000 (the function framework listens on that port itself, so business code must not call app.listen); container services can customize it, and business code must listen on this port</td></tr>
<tr><td><code>serverConfig.EnvParams</code></td><td>string</td><td></td><td>Environment variable config as a JSON string. Used to pass configuration to the service code, e.g. '{"DATABASE_URL":"postgres://user:pass@10.x.x.x:5432/db","NODE_ENV":"production"}'. SDK v5.6.1+ automatically encrypts the passed environment variables with AES-256-CBC in transit. ⚠️ If EnvParams contains traditional TCP database variables such as DATABASE_URL / MYSQL_* / POSTGRES_* / REDIS_*, VpcConf must be configured as well, otherwise instances usually cannot reach databases inside the VPC</td></tr>
<tr><td><code>serverConfig.Dockerfile</code></td><td>string</td><td></td><td>Dockerfile name config, needed for container services only. Specifies the Dockerfile path used to build the container image; defaults to the Dockerfile in the project root</td></tr>
<tr><td><code>serverConfig.BuildDir</code></td><td>string</td><td></td><td>Build directory config, specifying the directory used to build the code. Use it when the code layout differs from the standard; defaults to the project root</td></tr>
<tr><td><code>serverConfig.InternalAccess</code></td><td>string</td><td></td><td>Internal access switch: open=enable internal access (callable directly through the CloudBase SDK), close=disable internal access Allowed values: "open", "close"</td></tr>
<tr><td><code>serverConfig.InternalDomain</code></td><td>string</td><td></td><td>Internal domain config, used to configure the internal access domain of the service. Effective only when internal access is enabled</td></tr>
<tr><td><code>serverConfig.EntryPoint</code></td><td>array of string</td><td></td><td>Dockerfile EntryPoint config, needed for container services only. Specifies the container entry program array, e.g. ["node","app.js"]</td></tr>
<tr><td><code>serverConfig.Cmd</code></td><td>array of string</td><td></td><td>Dockerfile Cmd config, needed for container services only. Specifies the container default command array, e.g. ["npm","start"]</td></tr>
<tr><td><code>serverConfig.InitialDelaySeconds</code></td><td>number</td><td></td><td>Initial delay of the port health check, in seconds. After deployment, the platform waits N seconds before probing the port, then probes roughly every 5s for about 30 consecutive attempts; the deploy is only marked failed after all 30 fail (a ~150s probe window) — it does not fail immediately after N seconds. Raise it to 60–120 for slow-starting applications</td></tr>
<tr><td><code>serverConfig.LogType</code></td><td>string</td><td></td><td>Log type config, specifying the log collection type of the service. Affects how logs are collected and stored</td></tr>
<tr><td><code>serverConfig.LogSetId</code></td><td>string</td><td></td><td>CLS log set ID config, specifying the CLS (Cloud Log Service) log set ID. CLS must be enabled first</td></tr>
<tr><td><code>serverConfig.LogTopicId</code></td><td>string</td><td></td><td>CLS log topic ID config, specifying the CLS (Cloud Log Service) log topic ID. CLS must be enabled first</td></tr>
<tr><td><code>serverConfig.LogParseType</code></td><td>string</td><td></td><td>Log parse type config, specifying how logs are parsed. Used to turn raw logs into structured data</td></tr>
<tr><td><code>serverConfig.Tag</code></td><td>string</td><td></td><td>Service tag config, used to mark the service type. For example, "function:" indicates a function-type service. The SDK generates it automatically from the config</td></tr>
<tr><td><code>serverConfig.OperationMode</code></td><td>string</td><td></td><td>Operation mode config, specifying the running mode of the service. Affects scheduling and resource allocation</td></tr>
<tr><td><code>serverConfig.SessionAffinity</code></td><td>string</td><td></td><td>Session affinity config, controlling whether session affinity is enabled. Once enabled, requests from the same client are routed to the same instance</td></tr>
<tr><td><code>serverConfig.TimerScale</code></td><td>array of object</td><td></td><td>Scheduled scaling config array, used to configure scheduled automatic scaling of the service. Multiple time windows can be configured, with daily/weekly/monthly recurrence</td></tr>
<tr><td><code>serverConfig.TimerScale[].CycleType</code></td><td>string</td><td>yes</td><td>Recurrence type: none=no recurrence, daily=daily, weekly=weekly, monthly=monthly Allowed values: "none", "daily", "weekly", "monthly"</td></tr>
<tr><td><code>serverConfig.TimerScale[].StartDate</code></td><td>string</td><td></td><td>Recurrence start date, format: YYYY-MM-DD</td></tr>
<tr><td><code>serverConfig.TimerScale[].EndDate</code></td><td>string</td><td></td><td>Recurrence end date, format: YYYY-MM-DD</td></tr>
<tr><td><code>serverConfig.TimerScale[].StartTime</code></td><td>string</td><td>yes</td><td>Start time, format: HH:mm:ss</td></tr>
<tr><td><code>serverConfig.TimerScale[].EndTime</code></td><td>string</td><td>yes</td><td>End time, format: HH:mm:ss</td></tr>
<tr><td><code>serverConfig.TimerScale[].ReplicaNum</code></td><td>number</td><td>yes</td><td>Target replica count for scheduled scaling, minimum 0 (scale to zero)</td></tr>
<tr><td><code>serverConfig.VpcConf</code></td><td>object</td><td></td><td>VPC network config (instance egress / private network). Used to attach CloudRun instances to a specified VPC so they can reach MySQL/PostgreSQL/Redis/CVM and other resources over the internal network. This is a different concept from OpenAccessTypes (how external callers reach this service). It is mandatory for TCP database connections. Do not guess VpcId/SubnetId; they must come from the database console, existing resource details, callCloudApi, or user confirmation. On creation it maps to the SDK vpcInfo(CreateType=2); existing services can use updateConfig or deploy (RMW preserves the remote VpcConf when it is not passed). After deploying/updating, verify ServerConfig.VpcConf with queryCloudRun detail</td></tr>
<tr><td><code>serverConfig.VpcConf.VpcId</code></td><td>string</td><td>yes</td><td>VPC network ID, format: vpc-xxxxxxxx. It must be in the same region as the target database/Redis, and preferably the same VPC. Do not guess it or use placeholders; it must come from the database console, existing resource details, callCloudApi, or user confirmation. Configuring it at creation time is recommended; existing services can also pass it during deploy, and after deployment you must verify it took effect with queryCloudRun detail</td></tr>
<tr><td><code>serverConfig.VpcConf.SubnetId</code></td><td>string</td><td>yes</td><td>Subnet ID, format: subnet-xxxxxxxx. CloudRun instances consume IPs from this subnet, so make sure enough IPs are available</td></tr>
<tr><td><code>serverConfig.VolumesConf</code></td><td>array of union</td><td></td><td>Volume mount config, selected by Type: COS (object storage bucket) or CFS (cloud file storage instance). The required fields differ</td></tr>
<tr><td><code>serverConfig.PublicNetConf</code></td><td>object</td><td></td><td>Public access config</td></tr>
<tr><td><code>serverConfig.PublicNetConf.PublicNetStatus</code></td><td>string</td><td></td><td>Public access switch: ENABLE to turn public access on, DISABLE to turn it off Allowed values: "ENABLE", "DISABLE"</td></tr>
<tr><td><code>template</code></td><td>string</td><td></td><td>Project template identifier, specifying the template used when initializing a project. Use the templates action of queryCloudRun to list available templates. Common templates: helloworld=Hello World example, nodejs=Node.js project template, python=Python project template, and so on Default: "helloworld"</td></tr>
<tr><td><code>runOptions</code></td><td>object</td><td></td><td>Local run parameters, supported by function-type CloudRun services only. Used to configure the local development runtime; it does not affect cloud deployments</td></tr>
<tr><td><code>runOptions.port</code></td><td>number</td><td></td><td>Local run port, effective for function services only. Specifies the port the service listens on locally, default 3000. Make sure the port is not already in use Default: 3000</td></tr>
<tr><td><code>runOptions.envParams</code></td><td>object</td><td></td><td>Extra environment variables for local runs, used for local development and debugging. Key-value pairs, e.g. {"DEBUG":"true","LOG_LEVEL":"debug"}. These variables apply to local runs only</td></tr>
<tr><td><code>runOptions.runMode</code></td><td>string</td><td></td><td>Run mode: normal=plain function mode, agent=Agent mode (for AI agent development) Allowed values: "normal", "agent"；Default: "normal"</td></tr>
<tr><td><code>runOptions.agentId</code></td><td>string</td><td></td><td>Agent ID, used in agent mode to identify a specific Agent instance</td></tr>
<tr><td><code>agentConfig</code></td><td>object</td><td></td><td>Agent config, used only with the createAgent action</td></tr>
<tr><td><code>agentConfig.agentName</code></td><td>string</td><td>yes</td><td>Agent name, used to generate the BotId</td></tr>
<tr><td><code>agentConfig.botTag</code></td><td>string</td><td></td><td>Bot tag, used to generate the BotId; generated automatically when omitted</td></tr>
<tr><td><code>agentConfig.description</code></td><td>string</td><td></td><td>Agent description</td></tr>
<tr><td><code>agentConfig.template</code></td><td>string</td><td></td><td>Agent template type, defaults to blank (empty template) Default: "blank"</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>Force switch, used to skip confirmation prompts. Default false (confirmation required); true skips all confirmation steps. Setting true is strongly recommended for delete operations to avoid accidental interruptions Default: false</td></tr>
<tr><td><code>serverType</code></td><td>string</td><td></td><td>Service type: function=function-type CloudRun (Node.js only, with special development requirements and limits, suitable for simple API services), container=container service (recommended; supports any language and framework such as Java/Go/Python/PHP/.NET, suitable for most scenarios). When omitted it is detected automatically: 1) the existing service type 2) a Dockerfile exists→container 3) a @cloudbase/aiagent-framework dependency exists→function 4) otherwise→container Allowed values: "function", "container"</td></tr>
<tr><td><code>waitRegistration</code></td><td>boolean</td><td></td><td>Whether deploy waits for the platform to register this release (default true, up to ~45s). Waiting yields the identifier needed for follow-up queries (BuildId for source builds, RunId for image deploys). Set false to probe once and return immediately - faster, and suitable when you don't need the buildId and will query the deploy-task state on demand instead Default: true</td></tr>
</tbody>
</table>

---

### `deployBuild`
Parses cloudbaserc and runs a local build for every hosting[] item that declares a buildCommand (only buildCommand runs — no dependency install, no upload). It only handles hosting[] and does NOT handle the cloudbaserc app resource — app artifacts must be built by you in the project directory (read the build command and output directory from deployPlan's buildHint), or use the CLI `tcb app deploy` for a cloud build instead. Declarative hosting deployment is split into three steps — build → plan → apply — and this tool is the first one: build the artifacts locally, preview with deployPlan, then upload them with deployApply. deployApply builds neither app nor hosting — missing artifacts fail with BUILD_OUTPUT_NOT_FOUND; for hosting run this tool, for app build it yourself. Pure static hosting (no buildCommand and no detectable framework) is skipped automatically. The build is a purely local operation: it resolves no environment, requires no login and needs no confirm.
- cwd: project root, defaults to the current working directory
- mode: environment name; when it matches envOverrides.&lt;mode&gt; the corresponding multi-environment overrides are merged

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>cwd</code></td><td>string</td><td></td><td>Project root directory; cloudbaserc is searched below it. Defaults to the current working directory.</td></tr>
<tr><td><code>mode</code></td><td>string</td><td></td><td>Environment name, such as production/staging. Matching envOverrides.&lt;mode&gt; values are merged.</td></tr>
</tbody>
</table>

---

### `deployPlan`
Parse cloudbaserc and compute the declarative deployment plan (dry-run, makes no changes). This is the preview counterpart of deployApply: plan computes and deployApply executes the same cloudbaserc. Returns an action classification per resource: create=create new, update=overwrite update, skip=no change/will not run, conflict=conflict detected, abort, deploy=direct overwrite. The plan is recomputed by yes into the actions that will actually happen: without yes=true, functions already in the cloud are marked skip (with update kept in declaredStatus), consistent with deployApply's actual execution, avoiding a plan/execution mismatch.
⚠️ app / hosting plan items are always a direct upload of existing artifacts: declarative deploy deploys but never builds; buildCommand / framework in cloudbaserc are only used to infer the output directory and are never executed.
app / hosting plan items carry buildHint = \{ buildCommand, outputDir, artifactReady \} (machine-readable — do not parse the localized text in details): artifactReady=false means the output directory is missing or empty, and deployApply is guaranteed to fail (BUILD_OUTPUT_NOT_FOUND). Build first, then apply — for hosting call deployBuild; for app run buildHint.buildCommand in the project directory (null means no build is needed). Re-run deployPlan afterwards to confirm artifactReady=true; do not edit the config to work around it.
Scope: this tool is for project-level declarative orchestration (one cloudbaserc for unified plan/apply); for ad-hoc single-resource direct upload use manageFunctions/manageHosting/manageApps.
- cwd: project root, defaults to the current working directory
- mode: environment name; when it matches envOverrides.&lt;mode&gt;, the corresponding multi-environment overrides are merged
- envId: target environment ID, takes priority over envId in cloudbaserc; if omitted, the config value or the currently bound environment is used
- only: compute the plan for the specified resource types only
- skip: skip the specified resource types
- yes: aligned with deployApply's yes, used to recompute the effective action for existing functions. true=previewed as overwrite update (update); false (default)=previewed as conservative skip (skip)

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>cwd</code></td><td>string</td><td></td><td>Project root directory; cloudbaserc is searched below it. Defaults to the current working directory.</td></tr>
<tr><td><code>mode</code></td><td>string</td><td></td><td>Environment name, such as production/staging. Matching envOverrides.&lt;mode&gt; values are merged.</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Target environment ID. Takes precedence over envId in cloudbaserc; when omitted, uses the config value or currently bound environment.</td></tr>
<tr><td><code>only</code></td><td>array of string</td><td></td><td>Compute the plan only for the specified resource types.</td></tr>
<tr><td><code>skip</code></td><td>array of string</td><td></td><td>Skip the specified resource types.</td></tr>
<tr><td><code>yes</code></td><td>boolean</td><td></td><td>Aligned with deployApply yes and used to recompute the effective action for existing functions. true previews overwrite update; false (default) previews conservative skip.</td></tr>
</tbody>
</table>

---

### `deployApply`
Parse cloudbaserc and execute the declarative deployment in the order database→functions→app→hosting→gateway. This is the execution counterpart of deployPlan (plan previews / deployApply executes the same cloudbaserc), a local form of apply (reads the local cloudbaserc and uploads local artifacts to the cloud). It is a write operation that changes cloud resources and requires an explicit confirm=true to execute. It is recommended to preview with deployPlan first and execute after confirming the plan.
⚠️ Deploys but never builds: this tool runs no build command at all (neither app nor hosting). buildCommand / installCommand / framework in cloudbaserc are only used to infer the output directory and are never executed. A missing or empty output directory fails with BUILD_OUTPUT_NOT_FOUND — for hosting call deployBuild first, for app ask the user to run its build command in the project directory, then retry; do not edit the config to work around it. Before building, read buildHint.buildCommand / outputDir / artifactReady from deployPlan to see what needs to run. When app needs a cloud build, use the CLI `tcb app deploy` (this tool provides no cloud build).
Scope: this tool is for project-level declarative orchestration (one cloudbaserc for unified plan/apply); for ad-hoc single-resource direct upload use manageFunctions/manageHosting/manageApps.
- confirm: must be explicitly true to execute the deployment, otherwise it is rejected
- confirmDestructive: when the pending database migrations contain destructive statements (DROP/TRUNCATE/DELETE, ALTER…DROP/RENAME), besides confirm, confirmDestructive=true must also be explicitly passed to execute; otherwise it is rejected and the matched migrations and statements are listed. This parameter has no effect when there are no destructive migrations
- cwd: project root, defaults to the current working directory
- mode: environment name; when it matches envOverrides.&lt;mode&gt;, the corresponding multi-environment overrides are merged
- envId: target environment ID, takes priority over envId in cloudbaserc; if omitted, the config value or the currently bound environment is used
- only: deploy only the specified resource types
- skip: skip the specified resource types
- yes: how to handle existing resources. true=overwrite directly; false (default)=conservatively skip; in non-interactive scenarios existing resources will not be overwritten (same semantics as deployPlan's yes)
- concurrency: maximum parallelism for resources of the same type, default 1 (serial)
- continueOnError: continue deploying the remaining resources after one fails (a database failure still aborts)

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Dangerous-operation confirmation. Deployment changes cloud resources and requires explicit confirm=true.</td></tr>
<tr><td><code>confirmDestructive</code></td><td>boolean</td><td></td><td>Destructive database change confirmation. When pending migrations contain DROP/TRUNCATE/DELETE or ALTER…DROP/RENAME, explicitly pass confirmDestructive=true in addition to confirm=true. It has no effect without destructive migrations.</td></tr>
<tr><td><code>cwd</code></td><td>string</td><td></td><td>Project root directory; cloudbaserc is searched below it. Defaults to the current working directory.</td></tr>
<tr><td><code>mode</code></td><td>string</td><td></td><td>Environment name, such as production/staging. Matching envOverrides.&lt;mode&gt; values are merged.</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Target environment ID. Takes precedence over envId in cloudbaserc; when omitted, uses the config value or currently bound environment.</td></tr>
<tr><td><code>only</code></td><td>array of string</td><td></td><td>Deploy only the specified resource types.</td></tr>
<tr><td><code>skip</code></td><td>array of string</td><td></td><td>Skip the specified resource types.</td></tr>
<tr><td><code>yes</code></td><td>boolean</td><td></td><td>Whether to overwrite existing resources directly. true overwrites; false (default) conservatively skips existing resources.</td></tr>
<tr><td><code>concurrency</code></td><td>integer</td><td></td><td>Maximum parallelism for resources of the same type. Defaults to 1 (serial); dependency order across resource types is unchanged.</td></tr>
<tr><td><code>continueOnError</code></td><td>boolean</td><td></td><td>Whether to continue deploying remaining resources after one fails; database failures always abort.</td></tr>
</tbody>
</table>

---

### `queryGateway`
Unified read-only entry for the CloudBase HTTP gateway (Domain/Route). Query path routes under a domain and their upstreams: WEB_SCF/SCF=cloud functions, CBR=CloudRun, STATIC_STORE=static hosting, STORAGE=cloud storage, LH=Lighthouse. The primary key is Domain + Path; listRoutes / getRoute / listCustomDomains / getPrivilege / cachePurgeTask. getPrivilege queries the HTTP gateway master switch (enableService) and access auth (enableAuth) status. cachePurgeTask queries cache purge tasks for a domain (use the TaskId from manageGateway purgeCache). Before setting up custom domain access, run listCustomDomains first: if a custom domain already exists, prefer createRoute to attach a route (no certificate ID needed); use bindCustomDomain only when no usable custom domain exists.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Read-only action. getPrivilege needs no other parameter and returns the HTTP gateway master switch and access auth status directly. cachePurgeTask requires domain. For custom domain access, run listCustomDomains first to check whether an existing domain can be reused. Allowed values: "listRoutes", "getRoute", "listCustomDomains", "getPrivilege", "cachePurgeTask"</td></tr>
<tr><td><code>targetName</code></td><td>string</td><td></td><td>Upstream resource name filter (UpstreamResourceName): a cloud function name, CloudRun service name, or static-hosting instance name (commonly staticstore).</td></tr>
<tr><td><code>routeId</code></td><td>string</td><td></td><td>Route ID. Optional for getRoute</td></tr>
<tr><td><code>path</code></td><td>string</td><td></td><td>Route path. Optional as a getRoute / listRoutes filter</td></tr>
<tr><td><code>domain</code></td><td>string</td><td></td><td>Domain. Optional as a getRoute / listRoutes filter; required for cachePurgeTask</td></tr>
<tr><td><code>cacheType</code></td><td>string</td><td></td><td>Cache layer (cachePurgeTask only): CDN or EO. When omitted it is matched from the domain access type (EO→EO, CDN→CDN); DIRECT / CUSTOM / NONE domains have no CloudBase-hosted cache and are rejected with an explanation. Allowed values: "CDN", "EO"</td></tr>
<tr><td><code>taskId</code></td><td>string</td><td></td><td>Cache purge task ID (cachePurgeTask only, optional filter)</td></tr>
<tr><td><code>purgeType</code></td><td>string</td><td></td><td>Purge type filter (cachePurgeTask only): PURGE_URL=by URL, PURGE_PREFIX=by path prefix, PURGE_HOST=whole domain Allowed values: "PURGE_URL", "PURGE_PREFIX", "PURGE_HOST"</td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td>Task start time (cachePurgeTask only, optional). Format YYYY-MM-DD HH:mm:ss</td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td>Task end time (cachePurgeTask only, optional). Format YYYY-MM-DD HH:mm:ss</td></tr>
<tr><td><code>offset</code></td><td>integer</td><td></td><td>Pagination offset (cachePurgeTask only, optional)</td></tr>
<tr><td><code>limit</code></td><td>integer</td><td></td><td>Max records to return (cachePurgeTask only, optional)</td></tr>
</tbody>
</table>

---

### `manageGateway`
Unified write entry for the CloudBase HTTP gateway (Domain/Route). createRoute/updateRoute/deleteRoute forward a path under a domain to an upstream; enableRoute/disableRoute enable or disable existing routes (Routes[].Enable of ModifyHTTPServiceRoute underneath, not ModifyGatewayRoute); bindCustomDomain/deleteCustomDomain manage custom domains; enableService/authSwitch toggle the HTTP gateway master switch and access auth; purgeCache clears domain cache (returns a TaskId; check progress with queryGateway cachePurgeTask). When domain is omitted, the IsDefault default HTTP domain with DomainType=HTTPSERVICE (like *.\{region\}.app.tcloudbase.com) is used; static-hosting CDN domains (*.tcloudbaseapp.com, DomainType=STATIC_STORE) are never used. These are path routes on the gateway default domain, not STATIC_STORE upstream bindings; a STATIC_STORE upstream must pass upstreamResourceType=STATIC_STORE explicitly. To disable the static-hosting default domain (*.tcloudbaseapp.com): first queryGateway(listRoutes) to find the domain with DomainType=STATIC_STORE and IsDefault=true, then manageGateway(action="disableRoute", domain=that domain, path="/"); do not use manageHosting. After creation, verify Domain / DomainType / Path / UpstreamResourceType via queryGateway(action="listRoutes"). The upstream type uses a single parameter upstreamResourceType (or route.upstreamResourceType, route wins), together with targetName or route.serviceName for the upstream instance. createRoute only creates the gateway entry and does not change upstream permissions. ⚠️ Custom domain access: if the env already has a custom domain (queryGateway listCustomDomains first), prefer createRoute with that domain explicitly, no certificateId needed; use bindCustomDomain only when binding a brand-new custom domain for the first time. createRoute / bindCustomDomain run VerifyHTTPServiceRoute ownership pre-checks before creation; on failure, data.checks and DNS TXT guidance are returned; configure and retry. CORS/security domains (browser cross-origin allowlist, unrelated to the gateway custom domains of this tool) use manageEnv(action=addSecurityDomain/removeSecurityDomain). If access returns HTTPSERVICE_NONACTIVATED after createRoute, the master switch is usually off (query via queryGateway getPrivilege, enable via enableService). updateRoute only needs the fields you want to change — untouched CORS/rewrite/QPS/extension settings are carried over from the live route.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Write action. createRoute/updateRoute must provide upstreamResourceType; enableRoute/disableRoute need path (passing domain explicitly is recommended) and locate the existing route first, so the upstream usually does not need to be repeated; enableService/authSwitch require enable; purgeCache requires domain and targets. Custom domain setup guide: https://docs.cloudbase.net/service/custom-domain Allowed values: "createRoute", "updateRoute", "deleteRoute", "enableRoute", "disableRoute", "bindCustomDomain", "deleteCustomDomain", "enableService", "authSwitch", "purgeCache"</td></tr>
<tr><td><code>targetName</code></td><td>string</td><td></td><td>Upstream resource name (UpstreamResourceName); use either this or route.serviceName (route wins). Cloud function=function name; CloudRun=service name; static hosting=instance name (commonly staticstore). The upstream type is never inferred automatically.</td></tr>
<tr><td><code>path</code></td><td>string</td><td></td><td>Trigger path (the gateway match prefix), defaults to /{upstream name}. Examples: cloud function /api/hello, CloudRun /api, static hosting / or /app. This only creates the gateway entry; together with enablePathTransmission it determines the path the upstream actually receives.</td></tr>
<tr><td><code>upstreamResourceType</code></td><td>string</td><td></td><td>Upstream type (use either this or route.upstreamResourceType, route wins). For STORAGE, the upstream name is the cloud storage instance name — look it up with queryStorage first. Do not pass the manageFunctions type=HTTP\|Event value into this field. Allowed values: "SCF", "WEB_SCF", "CBR", "STATIC_STORE", "LH", "STORAGE"</td></tr>
<tr><td><code>auth</code></td><td>boolean</td><td></td><td>Gateway path auth (EnableAuth). Usually false for anonymous/browser public access. It only controls the gateway entry; cloud function security rules, CloudRun auth, and static hosting permissions must be configured with their own tools.</td></tr>
<tr><td><code>enablePathTransmission</code></td><td>boolean</td><td></td><td>Path transmission (EnablePathTransmission), platform default false. With path=/api and a request to /api/users: false→the upstream receives /users; true→the upstream receives /api/users. CBR CloudRun (Express and similar self-managed sub-routes) and multi-path WEB_SCF functions often need true; STATIC_STORE mapping a trigger path to the site root (e.g. /app → hosting /) is usually false; keep false for single-entry/root-path handling. route.enablePathTransmission also works (route wins).</td></tr>
<tr><td><code>enableSafeDomain</code></td><td>boolean</td><td></td><td>CORS / legit-domain check (EnableSafeDomain), the console's "cross-origin settings". true validates the request origin; false skips the check (common for browser-to-API calls). route.enableSafeDomain also works (route wins).</td></tr>
<tr><td><code>pathRewrite</code></td><td>object</td><td></td><td>Path rewriting (PathRewrite), e.g. {prefix:"/v1", staticStorePrefix:"app"}. prefix replaces the matched path prefix; staticStorePrefix is the target prefix for static hosting. Omit when no rewriting is needed; route.pathRewrite also works (route wins).</td></tr>
<tr><td><code>pathRewrite.prefix</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>pathRewrite.staticStorePrefix</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>qpsPolicy</code></td><td>object</td><td></td><td>Rate limiting (QPSPolicy), the console's "frequency limit". {total: total QPS, perClient:{limitBy:"ClientIP"\|"UserID", limitValue: per-client QPS}}. Omit for no limit; route.qpsPolicy also works (route wins).</td></tr>
<tr><td><code>qpsPolicy.total</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>qpsPolicy.perClient</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>qpsPolicy.perClient.limitBy</code></td><td>string</td><td></td><td>Allowed values: "ClientIP", "UserID"</td></tr>
<tr><td><code>qpsPolicy.perClient.limitValue</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>extension</code></td><td>object</td><td></td><td>Route-level extension: custom request/response headers and cache rules. ⚠️ The default domain (*.{region}.app.tcloudbase.com) rejects custom response headers; a custom domain is required. route.extension also works (route wins).</td></tr>
<tr><td><code>extension.headersHandler</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>extension.headersHandler.requestHeadersToAdd</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>extension.headersHandler.requestHeadersToAdd[].key</code></td><td>string</td><td>yes</td><td>Header name, e.g. X-Frame-Options</td></tr>
<tr><td><code>extension.headersHandler.requestHeadersToAdd[].value</code></td><td>string</td><td>yes</td><td>Header value, e.g. SAMEORIGIN</td></tr>
<tr><td><code>extension.headersHandler.requestHeadersToAdd[].action</code></td><td>string</td><td></td><td>Write strategy: APPEND_IF_EXISTS_OR_ADD=append; ADD_IF_ABSENT=add only when missing; OVERWRITE_IF_EXISTS_OR_ADD=overwrite or add; OVERWRITE_IF_EXISTS=overwrite existing only Allowed values: "APPEND_IF_EXISTS_OR_ADD", "ADD_IF_ABSENT", "OVERWRITE_IF_EXISTS_OR_ADD", "OVERWRITE_IF_EXISTS"</td></tr>
<tr><td><code>extension.headersHandler.requestHeadersToRemove</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>extension.headersHandler.responseHeadersToAdd</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>extension.headersHandler.responseHeadersToAdd[].key</code></td><td>string</td><td>yes</td><td>Header name, e.g. X-Frame-Options</td></tr>
<tr><td><code>extension.headersHandler.responseHeadersToAdd[].value</code></td><td>string</td><td>yes</td><td>Header value, e.g. SAMEORIGIN</td></tr>
<tr><td><code>extension.headersHandler.responseHeadersToAdd[].action</code></td><td>string</td><td></td><td>Write strategy: APPEND_IF_EXISTS_OR_ADD=append; ADD_IF_ABSENT=add only when missing; OVERWRITE_IF_EXISTS_OR_ADD=overwrite or add; OVERWRITE_IF_EXISTS=overwrite existing only Allowed values: "APPEND_IF_EXISTS_OR_ADD", "ADD_IF_ABSENT", "OVERWRITE_IF_EXISTS_OR_ADD", "OVERWRITE_IF_EXISTS"</td></tr>
<tr><td><code>extension.headersHandler.responseHeadersToRemove</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>extension.cache</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].description</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].enable</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].condition</code></td><td>object</td><td>yes</td><td>Cache rule match condition; values is the list of match values</td></tr>
<tr><td><code>extension.cache.rules[].condition.target</code></td><td>string</td><td></td><td>Allowed values: "url_path", "file_extension", "full_uri"</td></tr>
<tr><td><code>extension.cache.rules[].condition.matchType</code></td><td>string</td><td></td><td>Allowed values: "prefix", "suffix", "contains", "exact"</td></tr>
<tr><td><code>extension.cache.rules[].condition.values</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].actions</code></td><td>array of object</td><td>yes</td><td>Cache action list: type=Cache with cache{followOrigin,noCache,cacheTime,maxAgeTime} (mutually exclusive — enable one); type=CacheKey with cacheKey{fullUrlCache,queryStringSwitch,queryStringAction,queryStringValues}</td></tr>
<tr><td><code>extension.cache.rules[].actions[].type</code></td><td>string</td><td></td><td>Allowed values: "Cache", "CacheKey"</td></tr>
<tr><td><code>extension.cache.rules[].actions[].cache</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].actions[].cache.followOrigin</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].actions[].cache.noCache</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].actions[].cache.cacheTime</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].actions[].cache.maxAgeTime</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].actions[].cacheKey</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>extension.cache.rules[].actions[].cacheKey.fullUrlCache</code></td><td>string</td><td></td><td>Allowed values: "on", "off"</td></tr>
<tr><td><code>extension.cache.rules[].actions[].cacheKey.queryStringSwitch</code></td><td>string</td><td></td><td>Allowed values: "on", "off"</td></tr>
<tr><td><code>extension.cache.rules[].actions[].cacheKey.queryStringAction</code></td><td>string</td><td></td><td>Allowed values: "includeCustom", "excludeCustom"</td></tr>
<tr><td><code>extension.cache.rules[].actions[].cacheKey.queryStringValues</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>domainExtension</code></td><td>object</td><td></td><td>Domain-level extension applied to the whole domain (all paths), same shape as extension. Cache rules usually belong here; only effective for createRoute/updateRoute/bindCustomDomain. ⚠️ Same as extension: the default domain rejects custom response headers.</td></tr>
<tr><td><code>domainExtension.headersHandler</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>domainExtension.headersHandler.requestHeadersToAdd</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>domainExtension.headersHandler.requestHeadersToAdd[].key</code></td><td>string</td><td>yes</td><td>Header name, e.g. X-Frame-Options</td></tr>
<tr><td><code>domainExtension.headersHandler.requestHeadersToAdd[].value</code></td><td>string</td><td>yes</td><td>Header value, e.g. SAMEORIGIN</td></tr>
<tr><td><code>domainExtension.headersHandler.requestHeadersToAdd[].action</code></td><td>string</td><td></td><td>Write strategy: APPEND_IF_EXISTS_OR_ADD=append; ADD_IF_ABSENT=add only when missing; OVERWRITE_IF_EXISTS_OR_ADD=overwrite or add; OVERWRITE_IF_EXISTS=overwrite existing only Allowed values: "APPEND_IF_EXISTS_OR_ADD", "ADD_IF_ABSENT", "OVERWRITE_IF_EXISTS_OR_ADD", "OVERWRITE_IF_EXISTS"</td></tr>
<tr><td><code>domainExtension.headersHandler.requestHeadersToRemove</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>domainExtension.headersHandler.responseHeadersToAdd</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>domainExtension.headersHandler.responseHeadersToAdd[].key</code></td><td>string</td><td>yes</td><td>Header name, e.g. X-Frame-Options</td></tr>
<tr><td><code>domainExtension.headersHandler.responseHeadersToAdd[].value</code></td><td>string</td><td>yes</td><td>Header value, e.g. SAMEORIGIN</td></tr>
<tr><td><code>domainExtension.headersHandler.responseHeadersToAdd[].action</code></td><td>string</td><td></td><td>Write strategy: APPEND_IF_EXISTS_OR_ADD=append; ADD_IF_ABSENT=add only when missing; OVERWRITE_IF_EXISTS_OR_ADD=overwrite or add; OVERWRITE_IF_EXISTS=overwrite existing only Allowed values: "APPEND_IF_EXISTS_OR_ADD", "ADD_IF_ABSENT", "OVERWRITE_IF_EXISTS_OR_ADD", "OVERWRITE_IF_EXISTS"</td></tr>
<tr><td><code>domainExtension.headersHandler.responseHeadersToRemove</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].description</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].enable</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].condition</code></td><td>object</td><td>yes</td><td>Cache rule match condition; values is the list of match values</td></tr>
<tr><td><code>domainExtension.cache.rules[].condition.target</code></td><td>string</td><td></td><td>Allowed values: "url_path", "file_extension", "full_uri"</td></tr>
<tr><td><code>domainExtension.cache.rules[].condition.matchType</code></td><td>string</td><td></td><td>Allowed values: "prefix", "suffix", "contains", "exact"</td></tr>
<tr><td><code>domainExtension.cache.rules[].condition.values</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].actions</code></td><td>array of object</td><td>yes</td><td>Cache action list: type=Cache with cache{followOrigin,noCache,cacheTime,maxAgeTime} (mutually exclusive — enable one); type=CacheKey with cacheKey{fullUrlCache,queryStringSwitch,queryStringAction,queryStringValues}</td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].type</code></td><td>string</td><td></td><td>Allowed values: "Cache", "CacheKey"</td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cache</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cache.followOrigin</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cache.noCache</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cache.cacheTime</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cache.maxAgeTime</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cacheKey</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cacheKey.fullUrlCache</code></td><td>string</td><td></td><td>Allowed values: "on", "off"</td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cacheKey.queryStringSwitch</code></td><td>string</td><td></td><td>Allowed values: "on", "off"</td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cacheKey.queryStringAction</code></td><td>string</td><td></td><td>Allowed values: "includeCustom", "excludeCustom"</td></tr>
<tr><td><code>domainExtension.cache.rules[].actions[].cacheKey.queryStringValues</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>protocol</code></td><td>string</td><td></td><td>Domain protocol, effective for createRoute/updateRoute/bindCustomDomain only. Omit to keep the domain's current setting. Allowed values: "HTTP", "HTTPS", "HTTP_AND_HTTPS", "HTTP_TO_HTTPS", "HTTPS_TO_HTTP"</td></tr>
<tr><td><code>route</code></td><td>object</td><td></td><td>Route object (an optional form). Examples: cloud function {upstreamResourceType:"WEB_SCF",serviceName:"fn",path:"/api"}; CloudRun {upstreamResourceType:"CBR",serviceName:"svc",path:"/api"}; static hosting {upstreamResourceType:"STATIC_STORE",serviceName:"staticstore",path:"/"}; disable a route {path:"/",enable:false} (with updateRoute, or use disableRoute directly).</td></tr>
<tr><td><code>route.path</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>route.serviceName</code></td><td>string</td><td></td><td>Upstream instance name: cloud function name / CloudRun service name / static-hosting instance name (commonly staticstore) / LH instance. Takes precedence over the top-level targetName.</td></tr>
<tr><td><code>route.upstreamResourceType</code></td><td>string</td><td></td><td>Same as the top-level upstreamResourceType. When set inside route, it takes precedence over the top level. Allowed values: "SCF", "WEB_SCF", "CBR", "STATIC_STORE", "LH", "STORAGE"</td></tr>
<tr><td><code>route.auth</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>route.enablePathTransmission</code></td><td>boolean</td><td></td><td>Same as the top-level enablePathTransmission. When set inside route, it takes precedence over the top level.</td></tr>
<tr><td><code>route.enableSafeDomain</code></td><td>boolean</td><td></td><td>Same as the top-level enableSafeDomain (CORS / legit-domain check). When set inside route, it takes precedence.</td></tr>
<tr><td><code>route.pathRewrite</code></td><td>object</td><td></td><td>Same as the top-level pathRewrite. When set inside route, it takes precedence.</td></tr>
<tr><td><code>route.pathRewrite.prefix</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>route.pathRewrite.staticStorePrefix</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>route.qpsPolicy</code></td><td>object</td><td></td><td>Same as the top-level qpsPolicy (rate limiting). When set inside route, it takes precedence.</td></tr>
<tr><td><code>route.qpsPolicy.total</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>route.qpsPolicy.perClient</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>route.qpsPolicy.perClient.limitBy</code></td><td>string</td><td></td><td>Allowed values: "ClientIP", "UserID"</td></tr>
<tr><td><code>route.qpsPolicy.perClient.limitValue</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>route.extension</code></td><td>object</td><td></td><td>Same as the top-level extension (route-level custom headers and cache rules). When set inside route, it takes precedence.</td></tr>
<tr><td><code>route.extension.headersHandler</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>route.extension.headersHandler.requestHeadersToAdd</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>route.extension.headersHandler.requestHeadersToAdd[].key</code></td><td>string</td><td>yes</td><td>Header name, e.g. X-Frame-Options</td></tr>
<tr><td><code>route.extension.headersHandler.requestHeadersToAdd[].value</code></td><td>string</td><td>yes</td><td>Header value, e.g. SAMEORIGIN</td></tr>
<tr><td><code>route.extension.headersHandler.requestHeadersToAdd[].action</code></td><td>string</td><td></td><td>Write strategy: APPEND_IF_EXISTS_OR_ADD=append; ADD_IF_ABSENT=add only when missing; OVERWRITE_IF_EXISTS_OR_ADD=overwrite or add; OVERWRITE_IF_EXISTS=overwrite existing only Allowed values: "APPEND_IF_EXISTS_OR_ADD", "ADD_IF_ABSENT", "OVERWRITE_IF_EXISTS_OR_ADD", "OVERWRITE_IF_EXISTS"</td></tr>
<tr><td><code>route.extension.headersHandler.requestHeadersToRemove</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>route.extension.headersHandler.responseHeadersToAdd</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>route.extension.headersHandler.responseHeadersToAdd[].key</code></td><td>string</td><td>yes</td><td>Header name, e.g. X-Frame-Options</td></tr>
<tr><td><code>route.extension.headersHandler.responseHeadersToAdd[].value</code></td><td>string</td><td>yes</td><td>Header value, e.g. SAMEORIGIN</td></tr>
<tr><td><code>route.extension.headersHandler.responseHeadersToAdd[].action</code></td><td>string</td><td></td><td>Write strategy: APPEND_IF_EXISTS_OR_ADD=append; ADD_IF_ABSENT=add only when missing; OVERWRITE_IF_EXISTS_OR_ADD=overwrite or add; OVERWRITE_IF_EXISTS=overwrite existing only Allowed values: "APPEND_IF_EXISTS_OR_ADD", "ADD_IF_ABSENT", "OVERWRITE_IF_EXISTS_OR_ADD", "OVERWRITE_IF_EXISTS"</td></tr>
<tr><td><code>route.extension.headersHandler.responseHeadersToRemove</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].description</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].enable</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].condition</code></td><td>object</td><td>yes</td><td>Cache rule match condition; values is the list of match values</td></tr>
<tr><td><code>route.extension.cache.rules[].condition.target</code></td><td>string</td><td></td><td>Allowed values: "url_path", "file_extension", "full_uri"</td></tr>
<tr><td><code>route.extension.cache.rules[].condition.matchType</code></td><td>string</td><td></td><td>Allowed values: "prefix", "suffix", "contains", "exact"</td></tr>
<tr><td><code>route.extension.cache.rules[].condition.values</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].actions</code></td><td>array of object</td><td>yes</td><td>Cache action list: type=Cache with cache{followOrigin,noCache,cacheTime,maxAgeTime} (mutually exclusive — enable one); type=CacheKey with cacheKey{fullUrlCache,queryStringSwitch,queryStringAction,queryStringValues}</td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].type</code></td><td>string</td><td></td><td>Allowed values: "Cache", "CacheKey"</td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cache</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cache.followOrigin</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cache.noCache</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cache.cacheTime</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cache.maxAgeTime</code></td><td>integer</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cacheKey</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cacheKey.fullUrlCache</code></td><td>string</td><td></td><td>Allowed values: "on", "off"</td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cacheKey.queryStringSwitch</code></td><td>string</td><td></td><td>Allowed values: "on", "off"</td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cacheKey.queryStringAction</code></td><td>string</td><td></td><td>Allowed values: "includeCustom", "excludeCustom"</td></tr>
<tr><td><code>route.extension.cache.rules[].actions[].cacheKey.queryStringValues</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>route.enable</code></td><td>boolean</td><td></td><td>Route-level switch. enable=false disables this Domain+Path (access returns GATEWAY_ROUTE_DISABLED); enable=true re-enables it. Takes precedence over the top-level enable.</td></tr>
<tr><td><code>domain</code></td><td>string</td><td></td><td>Domain. When omitted, the env default HTTP domain with DomainType=HTTPSERVICE (*.{region}.app.tcloudbase.com) is used; verify it with queryGateway(action="listRoutes"). When enableRoute/disableRoute targets *.tcloudbaseapp.com, this domain must be passed explicitly. With an existing custom domain, pass it explicitly to configure routes without a certificate ID; for bindCustomDomain only, it means the new domain to bind.</td></tr>
<tr><td><code>certificateId</code></td><td>string</td><td></td><td>Certificate ID. Used only by bindCustomDomain: passing it explicitly skips the automatic search; when omitted, describeCertificates(SearchKey=domain) is called by domain — a single certificate is selected automatically, no certificate raises an error, and multiple certificates return structured selection guidance (MCP is non-interactive). createRoute / updateRoute / deleteRoute on an existing custom domain do not need certificateId.</td></tr>
<tr><td><code>accessType</code></td><td>string</td><td></td><td>Binding type (bindCustomDomain only, default DIRECT). DIRECT=direct connection (use this for normal domain binding); CDN=CloudBase CDN; CUSTOM=your own CDN/WAF (requires customCname). See https://docs.cloudbase.net/service/custom-domain Allowed values: "DIRECT", "CDN", "CUSTOM"</td></tr>
<tr><td><code>customCname</code></td><td>string</td><td></td><td>Origin/backfill address of your own CDN/WAF (bindCustomDomain with accessType=CUSTOM only). This is not the CNAME the user domain should resolve to in DNS; do not pass it for DIRECT/CDN. See https://docs.cloudbase.net/service/custom-domain</td></tr>
<tr><td><code>enable</code></td><td>boolean</td><td></td><td>Target switch state: required for enableService / authSwitch (true on / false off); optional for bindCustomDomain, where false disables the domain after binding; optional for updateRoute, mapping to Routes[].Enable (route.enable wins).</td></tr>
<tr><td><code>cacheType</code></td><td>string</td><td></td><td>Cache layer (purgeCache only): CDN or EO. When omitted it is matched from the domain access type (EO→EO, CDN→CDN); DIRECT / CUSTOM / NONE domains have no CloudBase-hosted cache and are rejected with an explanation. Allowed values: "CDN", "EO"</td></tr>
<tr><td><code>purgeType</code></td><td>string</td><td></td><td>Purge type (purgeCache only, default PURGE_URL): PURGE_URL=by full URL, PURGE_PREFIX=by path prefix, PURGE_HOST=whole domain Allowed values: "PURGE_URL", "PURGE_PREFIX", "PURGE_HOST"</td></tr>
<tr><td><code>targets</code></td><td>array of string</td><td></td><td>Purge targets (purgeCache only, required): full https://domain/path URLs for PURGE_URL; prefixes such as /static/ for PURGE_PREFIX; the domain itself for PURGE_HOST</td></tr>
</tbody>
</table>

---

### `queryAppAuth`
Read-only entry for CloudBase app-side authentication configuration. Queries login methods, providers, publishable key, API keys, client config, and static domain to check auth readiness. ⚠️ This is a management-side config query tool; it does not perform user login. When a task asks you to write client login code (e.g. "login with the JS SDK"), first confirm the configuration via this tool, then write @cloudbase/js-sdk client login code (e.g. auth.signInWithPassword()) in the project code instead of using this tool to log in. If the app should accept plain username-style identifiers, query action=getLoginConfig first; if usernamePassword=false, immediately call manageAppAuth(action=patchLoginStrategy, patch=\{ usernamePassword: true \}) next — do not write email login APIs directly.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "getLoginConfig", "listProviders", "getProvider", "getClientConfig", "getPublishableKey", "getStaticDomain", "listApiKeys"</td></tr>
<tr><td><code>providerId</code></td><td>string</td><td></td><td>Provider identifier, such as email or google.</td></tr>
<tr><td><code>clientId</code></td><td>string</td><td></td><td>OAuth client_id or DescribeClient Id. Defaults to the current environment ID (the default client) when omitted.</td></tr>
<tr><td><code>keyType</code></td><td>string</td><td></td><td>API key type filter. Allowed values are publish_key and api_key. Allowed values: "publish_key", "api_key"</td></tr>
<tr><td><code>pageNumber</code></td><td>integer</td><td></td><td>API key list page number, starting from 1.</td></tr>
<tr><td><code>pageSize</code></td><td>integer</td><td></td><td>Number of API keys per page.</td></tr>
</tbody>
</table>

---

### `manageAppAuth`
Write entry for CloudBase app-side authentication configuration. Modifies login methods, providers, and client config, ensures the publishable key, and creates or deletes API keys and custom login keys. ⚠️ This is a management-side config tool; it does not perform user login. When a task asks you to write client login code (e.g. "login with the JS SDK"), first complete the configuration here (e.g. enable usernamePassword, obtain the publishable key), then write @cloudbase/js-sdk client login code (e.g. auth.signInWithPassword()) in the project code instead of using this tool to log in. If the frontend should accept plain username-style identifiers, run action=patchLoginStrategy with patch=\{ usernamePassword: true \} first, then implement the corresponding frontend login logic. ⚠️ Phone SMS verification code login (patch=\{ phone: true \}) only turns the switch on: you still need to integrate your own SMS provider before any code is delivered. Prefer email verification code login to get a login flow working. See https://docs.cloudbase.net/authentication-v2/auth/custom-sms-provider for the SMS channel setup. ⚠️ The created field in the action=createApiKey response indicates whether a key was really created: created=false means an existing key in the environment was reused — the keyName/expireIn inputs take no effect, the returned keyName/expireAt are the server's real values, and warnings are attached. Never distribute it as a temporary credential.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "patchLoginStrategy", "addProvider", "updateProvider", "deleteProvider", "updateClientConfig", "ensurePublishableKey", "createApiKey", "deleteApiKey", "createCustomLoginKeys"</td></tr>
<tr><td><code>patch</code></td><td>object</td><td></td><td>Simplified login strategy patch for patchLoginStrategy, such as { usernamePassword: true }.</td></tr>
<tr><td><code>providerId</code></td><td>string</td><td></td><td>Provider identifier, such as email or google. For addProvider, it can also be a custom provider Id.</td></tr>
<tr><td><code>providerType</code></td><td>string</td><td></td><td>Provider protocol type for addProvider. Allowed values: "OAUTH", "OIDC", "SAML", "WX_MICRO_APP", "WX_QRCODE_MICRO_APP", "WX_CLOUDBASE_MICRO_APP", "WX_MP", "WX_OPEN", "WX_WORK_INTERNAL", "WX_WORK_AGENT", "WX_WORK_THIRD_PARTY", "WX_WORK_THIRD_PARTY_ASSOCIATION", "CUSTOM", "EMAIL"</td></tr>
<tr><td><code>displayName</code></td><td>string | object</td><td></td><td>Display name for addProvider; accepts a string or a localized object.</td></tr>
<tr><td><code>clientId</code></td><td>string</td><td></td><td>Client Id for updateClientConfig. Defaults to the current environment ID when omitted.</td></tr>
<tr><td><code>config</code></td><td>object</td><td></td><td>Configuration object for the provider or client.</td></tr>
<tr><td><code>keyType</code></td><td>string</td><td></td><td>API key type for createApiKey; defaults to publish_key. Allowed values: "publish_key", "api_key"</td></tr>
<tr><td><code>keyName</code></td><td>string</td><td></td><td>API key name for createApiKey. The server may ignore this value, for example when publish_key is unique per environment. The keyName in the response always reflects the name actually stored by the server.</td></tr>
<tr><td><code>expireIn</code></td><td>integer</td><td></td><td>Lifetime in seconds for createApiKey; 0 means no expiration. This value has no effect when an existing key is reused, in which case the response includes created=false and warnings.</td></tr>
<tr><td><code>keyId</code></td><td>string</td><td></td><td>Unique API key identifier for deleteApiKey.</td></tr>
</tbody>
</table>

---

### `queryApps`
Query CloudBase deployed apps and versions. Supports app list/detail and version list/detail; after deployment, poll build status by buildId with getAppVersion; getBuildLog retrieves build logs to diagnose failures.
action=getUploadUrl (read-only) returns a pre-signed upload URL: without a local filesystem (cloud mode), fetch the uploadUrl, PUT the code zip yourself, then call manageApps(action=deployApp, cosTimestamp) with the returned unixTimestamp to trigger deployment. The uploadUrl is a one-time upload credential; do not forward it or paste it into tickets.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "listApps", "getApp", "listAppVersions", "getAppVersion", "getBuildLog", "getUploadUrl"</td></tr>
<tr><td><code>serviceName</code></td><td>string</td><td></td><td>CloudBase app service name. Required for getApp, listAppVersions, getAppVersion, getBuildLog, and getUploadUrl. Reuse the same serviceName after redeployment to query its version history.</td></tr>
<tr><td><code>searchKey</code></td><td>string</td><td></td><td>Keyword for fuzzy matching app service names; used only when action=listApps.</td></tr>
<tr><td><code>pageNo</code></td><td>number</td><td></td><td>Page number, starting from 1.</td></tr>
<tr><td><code>pageSize</code></td><td>number</td><td></td><td>Number of items per page.</td></tr>
<tr><td><code>versionName</code></td><td>string</td><td></td><td>Version name. For getAppVersion, provide either this or buildId; prefer this value when the version name is known.</td></tr>
<tr><td><code>buildId</code></td><td>string,number</td><td></td><td>Build ID, accepted as a number or numeric string. For getAppVersion, provide either this or versionName. A BuildId returned by deployment can be passed directly to poll status. Required for getBuildLog.</td></tr>
<tr><td><code>start</code></td><td>number</td><td></td><td>Build log offset for fetching subsequent pages. Used only when action=getBuildLog; omit it to start from the beginning.</td></tr>
</tbody>
</table>

---

### `manageApps`
Deploy web apps to CloudBase (builds frontend and backend, deploys to a dedicated subdomain).
Cloud upload channel (cloud mode, no local filesystem): queryApps(action=getUploadUrl) or manageApps(action=getUploadUrl) returns a pre-signed upload URL → agent PUTs the code zip to uploadUrl itself (with uploadHeaders and Content-Type: application/zip) → call deployApp with the returned unixTimestamp as cosTimestamp to trigger deployment.
action=getUploadUrl returns the pre-signed upload URL (used in cloud mode), including the upload address and cosTimestamp.
action=deployApp uploads the source ZIP and triggers the remote build & deploy pipeline:
  1. Remote npm install (skip with installCmd="")
  2. Remote npm run build (skip with buildCmd="")
  3. Remote tcb hosting deploy

Domain format: `&lt;serviceName&gt;-&lt;envId&gt;.webapps.tcloudbase.com` (one dedicated subdomain per serviceName)

✅ Recommended usage (new projects / web apps needing a dedicated domain, prefer this tool):
  For a new project's first deployment, pass framework=static, installCmd="", buildCmd="" to skip the remote build
  and only run tcb hosting deploy. After deployment you get a dedicated subdomain with version management.

⚠️ Compatibility note:
- If an existing project was previously deployed with manageHosting (domain format: `&lt;envId&gt;-&lt;appId&gt;.tcloudbaseapp.com`),
  switching to manageApps produces a brand-new URL and old links break. Keep the original deployment method.
- To check: call queryHosting to see whether hosting files already exist.

Comparison with manageHosting:
- manageApps (this tool, preferred for new projects): domain `&lt;serviceName&gt;-&lt;envId&gt;.webapps.tcloudbase.com`, dedicated subdomain, version management
- manageHosting (existing projects or fallback): domain `&lt;envId&gt;-&lt;appId&gt;.tcloudbaseapp.com/&lt;path&gt;`, shared environment domain
Both support custom domains.

⚠️ If the manageApps build fails, check logs with queryApps(action="getBuildLog") first; if it still fails, fall back to manageHosting.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "deployApp", "getUploadUrl", "deleteApp", "deleteAppVersion"</td></tr>
<tr><td><code>serviceName</code></td><td>string</td><td>yes</td><td>CloudBase app service name, included in the domain as `&lt;serviceName&gt;-&lt;envId&gt;.webapps.tcloudbase.com`. Reusing an existing serviceName with deployApp creates a new deployment version and triggers redeployment instead of deleting and recreating the app. Use a new name for the first deployment.</td></tr>
<tr><td><code>filePath</code></td><td>string</td><td></td><td>Absolute path to the local project root to upload and deploy. Required for deployApp in local mode. Usually this is the source directory containing package.json and source files, not the dist directory; specify the output directory with buildPath. Omit this in cloud mode and use cosTimestamp instead.</td></tr>
<tr><td><code>cosTimestamp</code></td><td>string,number</td><td></td><td>COS timestamp returned as unixTimestamp by getUploadUrl; accepts a string or number. When provided, creates the app from previously uploaded code and skips local packaging and upload. Obtain a pre-signed URL with getUploadUrl and PUT the ZIP first. Required in cloud mode. Exactly one of filePath and cosTimestamp must be provided.</td></tr>
<tr><td><code>appPath</code></td><td>string</td><td></td><td>Online hosting mount path for the app, for example /my-web-app. This is not a local directory path. CloudApp has a dedicated subdomain, so the default is / when omitted.</td></tr>
<tr><td><code>buildPath</code></td><td>string</td><td></td><td>Build output directory relative to filePath, such as dist or build. ⚠️ When set, the remote build system changes to this directory before running tcb hosting deploy, so deployCmd automatically uses . (the current directory) instead of the directory name to avoid duplicated paths such as dist/dist. It can be omitted for static HTML in the project root, but note that deployCmd defaults to dist.</td></tr>
<tr><td><code>framework</code></td><td>string</td><td></td><td>Frontend framework. Even static uses the remote build pipeline. If the app is already built locally, use manageHosting to upload it directly and skip the remote build entirely. Allowed values: "vue", "react", "next", "nuxt", "vite", "angular", "static"</td></tr>
<tr><td><code>nodeJsVersion</code></td><td>string</td><td></td><td>Node.js version used for the build; when omitted, CloudBase uses its default.</td></tr>
<tr><td><code>installCmd</code></td><td>string</td><td></td><td>Dependency installation command, for example npm install. Defaults to npm install when omitted. Pass an empty string '' when dependencies are already installed or no installation is needed, though the remote pipeline still runs tcb hosting deploy.</td></tr>
<tr><td><code>buildCmd</code></td><td>string</td><td></td><td>Build command, for example npm run build. Defaults to npm run build when omitted. Pass an empty string '' to skip the build step when the app is already built locally. To skip the remote pipeline entirely, use manageHosting.</td></tr>
<tr><td><code>deployCmd</code></td><td>string</td><td></td><td>Custom deployment command. Usually unnecessary; a tcb hosting deploy command is generated automatically. When buildPath is set, the remote process has already changed to that directory and defaults to . as the source path; otherwise it defaults to dist.</td></tr>
<tr><td><code>ignore</code></td><td>array of string</td><td></td><td>Glob patterns for files and directories to exclude from upload, for example **/node_modules/**. ⚠️ Packaging starts at the project root (filePath), not the buildPath output directory. Add large build outputs at the project root, such as target/ (Rust), .next/, dist-old/, or build/, to ignore (for example **/target/**), or the entire directory will be included in the upload ZIP. By default, node_modules, .git, .DS_Store, **/target/**, .next/**, and .next.bak/** are excluded.</td></tr>
<tr><td><code>versionName</code></td><td>string</td><td></td><td>Historical version name to delete; required only when action=deleteAppVersion.</td></tr>
</tbody>
</table>

---

### `queryPermissions`
Query CloudBase permissions and user config: resource permissions (database/functions/buckets etc.), role list/detail, app user list/detail, and gateway OPA authorization policies.

Examples:
- List legacy gateway policies: `action="listPolicy"` (an empty list only means "no policy" when the query really ran; on PG / OPA engine environments the query is skipped and returns `skipped=true` with an empty list, which does **not** mean there is no policy — use getPolicy instead)
- Read user Rego: `action="getPolicy"`; platform extension policy: `action="getPolicy", extension=true`

📌 Cross-backend boundary note: before calling, check `EnvInfo.RuntimeBackends` via `queryEnv(action="info", envId=...)`. `resourceType="noSqlDatabase"` queries CloudBase NoSQL collection rules, which are a separate mechanism from row-level security (RLS) on CloudBase PostgreSQL (PG) tables — in the same PG environment, if NoSQL collections are still in use, querying them with this tool **remains valid**. To query PG table RLS, use `queryPgDatabase(action="sql", sql="SELECT * FROM pg_policies WHERE tablename=...")` instead. This tool does not cover MySQL permissions.

⚠️ PostgreSQL environments: the platform `DescribeResourcePermission` API rejects PG environments outright. When `resourceType="function"`, this tool automatically falls back to the Manager SDK `describeEnvAuthzConfig` (aligned with CLI `tcb policy get`, reading `authz.user.rego`). For explicit OPA policies use `listPolicy` / `getPolicy`.

⚠️ Role actions (`listRoles` / `getRole`) are rejected outright by the platform on **PostgreSQL environments** (`The current API does not support PostgreSQL type environments.`). This is a platform capability boundary, not a configuration problem — **do not keep retrying on PG**; use RLS (`managePgDatabase(action="execute")` with `CREATE POLICY`) or the console to manage permissions instead.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "getResourcePermission", "listResourcePermissions", "listRoles", "getRole", "listUsers", "getUser", "listPolicy", "getPolicy"</td></tr>
<tr><td><code>resourceType</code></td><td>string</td><td></td><td>Allowed values: "noSqlDatabase", "sqlDatabase", "function", "storage"</td></tr>
<tr><td><code>resourceId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>resourceIds</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>roleId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>roleIdentity</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>roleName</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>uid</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>username</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>pageNo</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>pageSize</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>extension</code></td><td>boolean</td><td></td><td>Used only when action=getPolicy. Set true to read the platform policy configured specifically for this environment (authz.platform.extension.rego); the default false reads the user policy (authz.user.rego). Aligned with CLI `tcb policy get --extension`.</td></tr>
<tr><td><code>policyResourceType</code></td><td>string</td><td></td><td>Used only when action=listPolicy. Filters by resource type; currently only `policy` is supported. Aligned with CLI `tcb policy list --resource-type policy`. Allowed values: "policy"</td></tr>
</tbody>
</table>

---

### `managePermissions`
Manage CloudBase permissions and user config: modify resource permissions (database/functions/buckets etc.), role management, member/policy add & remove, app user CRUD, and setting gateway OPA Rego policies.

Examples:
- Set a bucket to private: `action="updateResourcePermission", resourceType="storage", resourceId="bucket-name", permission="PRIVATE"`
- Open a cloud function to anonymous/unauthenticated access (PG goes through OPA): `action="updateResourcePermission", resourceType="function", resourceId="myFn", permission="CUSTOM", securityRule='\{"invoke":true\}'`
- Set user Rego directly: `action="setPolicy", regoContent="package authz.user\n\ndefault allow := false\n", confirm=true` (⚠️ immediately disables legacy gateway authorization)

Note: `createUser` / `updateUser` are environment-side app user management capabilities, suitable for test accounts, administrators, or pre-provisioned users; they should not replace the Web SDK signup form in the browser. For frontend username/password signup use `auth.signUp(\{ username, password \})` and for login `auth.signInWithPassword(\{ username, password \})`. Creating username/password users directly in the browser with `auth.signUp` depends on SDK/provider support and must be verified before use; if unsupported, go through a backend or management API boundary and never expose keys in the browser. The detailed semantics of `securityRule` depend on `resourceType`: `doc._openid`, `auth.openid`, query-condition subset validation, and the `create` / `update` / `delete` JSON templates only apply to document database security rules with `resourceType="noSqlDatabase"`; when configuring `function` or `storage`, refer to their official security rule docs instead of reusing NoSQL templates.

📌 Cross-backend boundary note: before calling, check `EnvInfo.RuntimeBackends` via `queryEnv(action="info", envId=...)`:
- `resourceType="noSqlDatabase"` only affects CloudBase NoSQL document database collections; row-level permissions of CloudBase PostgreSQL (PG) tables are **not** controlled by it — for PG tables use RLS instead: run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY ...` via `managePgDatabase(action="execute", confirm=true)`. In the same PG environment, if NoSQL collections are still in use, continuing to use `noSqlDatabase` rules for those **collections** is correct — it does not mean "this tool is disabled on PG environments".
- `resourceType="storage"` controls NoSQL/COS bucket ACLs; PG `pgstore` buckets are not covered by this `resourceType`.
- This tool does not cover MySQL; for MySQL database permissions use MySQL's own GRANT/REVOKE statements (via `manageMysqlDatabase`).

⚠️ PostgreSQL environments: the platform `ModifyResourcePermission` API rejects PG environments outright. When `resourceType="function"`, this tool automatically falls back to the Manager SDK `modifyEnvAuthzConfig` (writing `authz.user.rego`). `securityRule` accepts a full Rego document (`package authz.user`) or `'\{"invoke":true\}'` (auto-generates a policy allowing anonymous/unauthenticated calls to functions). Setting Rego replaces the environment-wide user policy document (it applies to the whole environment, not a single function/resource); legacy gateway authorization is disabled immediately and never rolls back, same as the CLI. Prefer `action="setPolicy"` for explicit OPA policies.

⚠️ Role actions (`createRole` / `deleteRoles` / `updateRole`) are rejected outright by the platform on **PostgreSQL environments** (`The current API does not support PostgreSQL type environments.`). This is a platform capability boundary, not a configuration problem — **do not keep retrying on PG**; use RLS (`managePgDatabase(action="execute")` with `CREATE POLICY`) or the console to manage permissions instead.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "updateResourcePermission", "createRole", "updateRole", "deleteRoles", "addRoleMembers", "removeRoleMembers", "addRolePolicies", "removeRolePolicies", "createUser", "updateUser", "deleteUsers", "setPolicy"</td></tr>
<tr><td><code>resourceType</code></td><td>string</td><td></td><td>Target resource type. The exact semantics of `securityRule` depend on this value. `noSqlDatabase` uses collection security rules, while `function` and `storage` each have distinct security rule semantics; do not apply NoSQL rule syntax to them. Allowed values: "noSqlDatabase", "sqlDatabase", "function", "storage"</td></tr>
<tr><td><code>resourceId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>permission</code></td><td>string</td><td></td><td>Allowed values: "READONLY", "PRIVATE", "ADMINWRITE", "ADMINONLY", "CUSTOM"</td></tr>
<tr><td><code>securityRule</code></td><td>string</td><td></td><td>Resource-type-specific rule content whose semantics depend on `resourceType`. When `resourceType="noSqlDatabase"` and `permission="CUSTOM"`, pass document database security rules as JSON (see `https://docs.cloudbase.net/database/security-rules`); keys are typically `read`, `create`, `update`, and `delete`, with expressions as values. Important: a `create` rule validates incoming data before the document exists, so it cannot use `doc.*`; `read`, `update`, and `delete` rules may reference existing fields with `doc.*`. Do not apply `doc._openid`, `auth.openid`, query-condition subset validation, or `create` / `update` / `delete` templates to `function`, `storage`, or `sqlDatabase`. For `function` or `storage`, consult the official security rule documentation instead: functions at `https://docs.cloudbase.net/cloud-function/security-rules` and storage at `https://docs.cloudbase.net/storage/security-rules`. Example: {"read":"auth.uid != null","create":"auth.uid != null &amp;&amp; auth.loginType != "ANONYMOUS"","update":"auth.uid != null &amp;&amp; doc._openid == auth.openid","delete":"auth.uid != null &amp;&amp; doc._openid == auth.openid"}</td></tr>
<tr><td><code>roleId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>roleIds</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>roleName</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>roleIdentity</code></td><td>string</td><td></td><td>Role identifier using letters, numbers, or _-:@. Required when action=createRole and used to reference the role programmatically.</td></tr>
<tr><td><code>description</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>memberUids</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>policies</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>policyIds</code></td><td>array of string</td><td></td><td>Policy ID list. Direct binding by ID is not currently supported; pass policy detail objects through policies instead.</td></tr>
<tr><td><code>uid</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>uids</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>username</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>password</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>userStatus</code></td><td>string</td><td></td><td>Allowed values: "ACTIVE", "BLOCKED"</td></tr>
<tr><td><code>regoContent</code></td><td>string</td><td></td><td>Used only when action=setPolicy. Full user OPA Rego document; it must begin with `package authz.user`. Aligned with CLI `tcb policy set &lt;regoContent&gt;`.</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Used only when action=setPolicy. Setting Rego immediately disables legacy gateway authorization, so confirm=true must be passed explicitly, matching the CLI confirmation prompt.</td></tr>
</tbody>
</table>

---

### `queryLogs`
Unified read-only entry for the CloudBase logs domain. Supports checking log service status and searching CLS logs.

**Important distinction**:
- Query cloud function logs: use `queryFunctions(action="listFunctionLogs", functionName="xxx")`
- Query CLS logs (cross-service log aggregation): use this tool `queryLogs(action="searchLogs")`
- Enable the CLS log service: use `manageLogs(action="createLogService", confirm=true)`

**Use cases**:
- Check whether the CLS log service is enabled: `action="checkLogService"`
- Cross-service log search (e.g. find all ERROR logs): `action="searchLogs"`
- Search logs of a specific service with CLS syntax: `action="searchLogs", service="tcb|tcbr"`

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: - `checkLogService`: Check whether the CLS log service is enabled - `searchLogs`: Search CLS logs (requires queryString) Allowed values: "checkLogService", "searchLogs"</td></tr>
<tr><td><code>queryString</code></td><td>string</td><td></td><td>CLS query statement. **Required when action="searchLogs"** and must strictly follow CLS (Cloud Log Service) syntax; see https://cloud.tencent.com/document/api/876/128127. **Cloud function queries**: - Cloud function logs: `(src:app OR src:system) AND log:"START RequestId"` - Aggregate cloud function request status: `\| select request_id, max(status_code) as status where ((request_id='44738f94-16dd-11f1-****' AND retry_num=0) AND retry_num=0) AND status_code!=202 group by request_id, retry_num` **Document database**: - Document database: `module:database` - Document database events: `module:database AND eventType:(MongoSlowQuery)` (MongoSlowQuery indicates a slow document database query) **SQL database**: - SQL database: `module:rdb` - SQL database events: `module:rdb AND eventType:(MysqlFreeze OR MysqlRecover OR MysqlSlowQuery)` (MysqlFreeze means frozen, MysqlRecover means recovered, and MysqlSlowQuery means a slow query) **Other services**: - Workflows: `module:workflow` - Models: `module:model` - User permissions: `module:auth` - LLMs: `module:llm AND logType:llm-tracelog` - Gateway service calls: `logType:accesslog` - App publish/delete events: `module:app AND eventType:(AppProdPub OR AppProdDel)` (AppProdPub is a publish event and AppProdDel is a delete event) These are examples only; adjust the query to the actual log content. **Note**: To query execution logs for a specific cloud function, prefer `queryFunctions(action="listFunctionLogs", functionName="xxx")`.</td></tr>
<tr><td><code>service</code></td><td>string</td><td></td><td>Log source service: - `tcb`: Logs from foundational services such as cloud functions, databases, and storage - `tcbr`: CloudRun container service logs Allowed values: "tcb", "tcbr"</td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td>Query start time in `YYYY-MM-DD HH:mm:ss` format, for example `2024-01-01 00:00:00`.</td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td>Query end time in `YYYY-MM-DD HH:mm:ss` format, for example `2024-01-01 23:59:59`.</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>Maximum number of log entries to return; defaults to 20.</td></tr>
<tr><td><code>context</code></td><td>string</td><td></td><td>Pagination context used to continue the previous query.</td></tr>
<tr><td><code>sort</code></td><td>string</td><td></td><td>Time sort order: `asc` for ascending or `desc` for descending. Allowed values: "asc", "desc"</td></tr>
</tbody>
</table>

---

### `manageLogs`
Write entry for the CloudBase logs domain. Enables the CLS log service (aligned with Manager SDK `log.createLogService` / CreateEnvResource Resources=['log']).

**Use cases**:
- Enable CLS log service: `action="createLogService", confirm=true`

Provisioning is asynchronous: API success does not mean the service is immediately ready. Poll with `queryLogs(action="checkLogService")` afterward.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: - `createLogService`: Enable the CLS log service (requires `confirm=true`) Allowed values: "createLogService"</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Explicit confirmation before enabling the log service. Must pass `confirm=true`; omitting it returns CONFIRM_REQUIRED.</td></tr>
</tbody>
</table>

---

### `queryAgents`
Unified read-only entry for the CloudBase Agents domain. Supports list, detail, and log queries.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "listAgents", "getAgent", "getAgentLogs"</td></tr>
<tr><td><code>agentId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>pageNumber</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>pageSize</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td></td></tr>
</tbody>
</table>

---

### `manageAgents`
Unified write entry for the CloudBase Agents domain. Supports creating, updating, and deleting remote agents.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "createAgent", "updateAgent", "deleteAgent"</td></tr>
<tr><td><code>agentId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>name</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>description</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>runtime</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>timeout</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>memorySize</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>installDependency</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>zipFile</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>cosBucketRegion</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>tempCosObjectName</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>sessionConfig</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>cwd</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td></td></tr>
</tbody>
</table>

---

### `callCloudApi`
Generic Cloud API invocation tool, mainly for CloudBase / Tencent Cloud control-plane and dependent-resource APIs. **Read the API index first** https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/api-reference.md (a daily-synced Action-level index including rate limits; confirm service/Action/params there before calling instead of guessing Action names; for products not covered by the index, check the product's official API docs). If your goal is to integrate CloudBase business APIs such as auth/functions/cloudrun/storage/mysqldb directly over HTTP, prefer the corresponding OpenAPI / Swagger instead of callCloudApi. The existing OpenAPI / Swagger capabilities are not the generic control-plane Action set; for control-plane APIs refer to the CloudBase API overview https://cloud.tencent.com/document/product/876/34809 and the dependent-resource API guide https://cloud.tencent.com/document/product/876/34808. Common tcb Actions by category:

**Env management**: `CreateEnv`, `ModifyEnv`, `DescribeEnvs`, `DestroyEnv`
**User management**: `CreateUser`, `ModifyUser`, `DescribeUserList`, `DeleteUsers`
**Auth config**: `EditAuthConfig`, `DescribeAuthDomains`
**Cloud functions**: `DescribeFunctions`, `CreateFunction`, `UpdateFunctionCode`, `DeleteFunction`
**Database**: `CreateMySQLInstance`, `DescribeMySQLInstances`, `DestroyMySQLInstance`

⚠️ CloudRun (CloudBase Run) must use the tcbr service (CreateCloudRunEnv / CreateCloudRunServer / DescribeEnvBaseInfo / DescribeCloudRunEnvs, version="2022-02-17"); legacy tcb small-tenant APIs such as CreateCloudBaseRunResource are disabled; use manageCloudRun for deploys. Use DescribeEnvBaseInfo (EnvId required) to query a single env's base info / CloudRun provisioning, and DescribeCloudRunEnvs (EnvId optional filter) to query env list / resource info.

⚠️ Region must be passed as the tool-level `region` parameter (mapped to X-TC-Region / regional endpoint), not inside params. Region inside params is stripped and used as the top-level region.

When destroying an env, the common practice is to pass at least `EnvId` and `BypassCheck: true`; if the env is already in quarantine, add `IsForce: true` per the docs.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>service</code></td><td>string</td><td>yes</td><td>Tencent Cloud product identifier. **The value must come from this field's enum allow-list (58 entries)** and determines the request domain https://&lt;service&gt;.tencentcloudapi.com. Values outside the list are rejected; do not invent one. COS is not part of the Cloud API system. See the cloud-api-operations skill for product-to-Action mappings. Always use tcbr for CloudBase Run. Allowed values: "tcb", "tcbr", "scf", "sts", "cam", "cloudaudit", "tag", "billing", "region", "ba", "cvm", "lighthouse", "tke", "cbs", "cfs", "tcr", "cdb", "mariadb", "postgres", "sqlserver", "redis", "mongodb", "cynosdb", "dcdb", "tcaplusdb", "keewidb", "vpc", "clb", "cdn", "ecdn", "dnspod", "privatedns", "domain", "ssl", "teo", "gaap", "kms", "ssm", "waf", "cwp", "tcss", "ckafka", "tdmq", "tdmysql", "apigateway", "monitor", "cls", "apm", "tsf", "tat", "hunyuan", "lkeap", "tts", "trtc", "live", "vod", "sms", "ses"</td></tr>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>The exact Action name defined by the official API for the selected service. **If uncertain, consult the official documentation first; do not guess with synonyms or legacy names** (an incorrect guess is reported by the server as action invalid and is difficult to diagnose). See the cloud-api-operations skill for common Actions.</td></tr>
<tr><td><code>version</code></td><td>string</td><td></td><td>API version (optional in most cases). Products with **exactly one official version in the allow-list are filled automatically**, so do not pass it. These multi-version products require an explicit version; omitting it returns an error with the available options: tke、mongodb、teo、monitor、vod、sms. Examples: service="tcbr", version="2022-02-17", action="CreateCloudRunEnv", params={EnvId:"env-xxx",PackageType:"Standard"}; service="monitor" requires "2018-07-24" for the alert-policy Action family.</td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td>Parameter object for the Action. Keys must match the official API definition; consult the documentation if uncertain. **Do not put Region here**; use the top-level region parameter for cross-region requests. For CloudBase business APIs, prefer searchKnowledgeBase(mode="openapi") instead of this tool. See the cloud-api-operations skill for examples.</td></tr>
<tr><td><code>region</code></td><td>string</td><td></td><td>Cloud API region (X-TC-Region), such as ap-shanghai. Cross-region requests must pass this top-level parameter, not put it in params. ⚠️ ap-singapore exists on both the domestic and international sites. When the site is unspecified, the international site (site=intl) is used. To operate a domestic-site environment in that region, first call auth(action="start_auth", site="domestic") or set TCB_SITE=domestic.</td></tr>
</tbody>
</table>

---

### `prepareFeedback`
Return the public repository's new-issue page.

**When to use**:
- `channel="case"`: the work is done and the user wants it on the case wall.
- `channel="retrospective"`: the session went badly and the user wants to report it.

**How to use**:
- Call once. The result is a page URL, not a submitted issue.
- Write the text in the chat and give the user the link. They log in and submit it.
- Do not submit it for them. Do not put an environment ID or secrets in the text.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>channel</code></td><td>string</td><td>yes</td><td>`case` opens the showcase template; `retrospective` opens the retrospective template. Allowed values: "case", "retrospective"</td></tr>
</tbody>
</table>

---

### `queryMessagePush`
Query Mini Program CloudBase message push config (qbase getappconfig) or all supported message push event constraints (getcallbacksupportlist). Two push modes: cloud function (default, per (msgType,event) callback) and CloudBase Run container (qbase_open=true, receives all messages as a whole payload at the container path). action=list also returns pushMode (cloudfunction|container), containerConfig, callbacks and version; in container mode callbacks may still exist but take no effect (see note); call ensureCloudFunctionMode to switch back before callbacks apply. action=listSupportedEvents returns all supported constraints grouped by message type. Requires the msg-push plugin to be enabled explicitly, plus the WeChat IDE login-state channel (host injects cloudBaseOptions.requestFn).

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>appid</code></td><td>string</td><td>yes</td><td>Mini Program AppID (required; must match WeChat DevTools and is used to select the WeChat login-state session)</td></tr>
<tr><td><code>env</code></td><td>string</td><td></td><td>Optional environment ID. When provided, list returns only subscriptions for that environment.</td></tr>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>list: Query the current message push configuration (including pushMode/containerConfig) listSupportedEvents: Query all supported message push event constraints (grouped by msgType) Allowed values: "list", "listSupportedEvents"</td></tr>
</tbody>
</table>

---

### `manageMessagePush`
Manage Mini Program CloudBase message push config (write ops, requires confirm="yes"). Push modes: cloud function (default, per (msgType,event) callback) vs CloudBase Run container (whole-payload receive; subscribe/unsubscribe/setEnable are rejected in container mode — call ensureCloudFunctionMode first). Declarative idempotency built on read-all → merge → overwrite-all (version optimistic lock). msg_type defaults to "event"; message-type entries use msg_type=text|image|voice|video|miniprogrampage. action=subscribe verifies function_name actually exists in the environment. action=ensureCloudFunctionMode disables container whole-payload receive; action=ensureContainerMode enables it (requires qbase_container_path/qbase_env/text_mode); action=setContainerCallback updates container path/env/text_mode. No write request is made when the set is unchanged (idempotent no-op). Requires the msg-push plugin to be enabled explicitly and the WeChat IDE login-state channel.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>appid</code></td><td>string</td><td>yes</td><td>Mini Program AppID (required; must match WeChat DevTools and is used to select the WeChat login-state session)</td></tr>
<tr><td><code>env_id</code></td><td>string</td><td>yes</td><td>Environment ID for the CloudBase environment bound to cloud function subscriptions. It is also the default CloudBase Run environment when ensureContainerMode/setContainerCallback omits qbase_env.</td></tr>
<tr><td><code>function_name</code></td><td>string</td><td>yes</td><td>Name of the cloud function that receives message pushes. Used by subscribe/unsubscribe/setEnable/ensureCloudFunctionMode; container-related actions may pass a placeholder.</td></tr>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>subscribe: Subscribe a specified cloud function (rejected in container mode) unsubscribe: Remove matching subscriptions (rejected in container mode) setEnable: Enable or disable matching subscriptions (rejected in container mode) ensureCloudFunctionMode: Switch to cloud function push mode (disable qbase_open) ensureContainerMode: Switch to CloudBase Run whole-payload receive (requires qbase_container_path + text_mode) setContainerCallback: Update the CloudBase Run callback path/env/text_mode Allowed values: "subscribe", "unsubscribe", "setEnable", "ensureCloudFunctionMode", "ensureContainerMode", "setContainerCallback"</td></tr>
<tr><td><code>msg_type</code></td><td>string</td><td></td><td>Message type (defaults to "event"). "event": event entries used with event_types (subscribe may omit it to use the 7 virtual payment events). "text"\|"image"\|"voice"\|"video"\|"miniprogrampage": message-type entries whose event is fixed to an empty string; do not pass event_types. Allowed values: "event", "text", "image", "voice", "video", "miniprogrampage"</td></tr>
<tr><td><code>event_types</code></td><td>array of string</td><td></td><td>Events to operate on (only when msg_type="event"; query all constraints first with queryMessagePush(action=listSupportedEvents)). subscribe defaults to the 7 virtual payment events when omitted; it is required for unsubscribe / setEnable when msg_type=event.</td></tr>
<tr><td><code>enable</code></td><td>boolean</td><td></td><td>Required for setEnable: true enables the subscription; false disables it.</td></tr>
<tr><td><code>qbase_container_path</code></td><td>string</td><td></td><td>CloudBase Run callback path/URL (required for ensureContainerMode; optional update for setContainerCallback)</td></tr>
<tr><td><code>qbase_env</code></td><td>string</td><td></td><td>Environment ID hosting the CloudBase Run service (optional for ensureContainerMode/setContainerCallback; defaults to env_id)</td></tr>
<tr><td><code>text_mode</code></td><td>number | number</td><td></td><td>CloudBase Run message body encoding: 1=json, 2=xml (required for ensureContainerMode; optional update for setContainerCallback)</td></tr>
<tr><td><code>confirm</code></td><td>string</td><td></td><td>Write confirmation. Pass confirm="yes" to proceed. Omitting it or passing another value returns a pending configuration summary (CONFIRM_REQUIRED); review it and retry. No confirmation is needed when the set is unchanged.</td></tr>
</tbody>
</table>

---
