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

### Others

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

### Data Models

- [`manageDataModel`](#managedatamodel)
- [`modifyDataModel`](#modifydatamodel)

### PostgreSQL Database

- [`queryPgDatabase`](#querypgdatabase)
- [`managePgDatabase`](#managepgdatabase)

### PostgreSQL Cloud Storage

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

### CloudRun

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

## Remote MCP Configuration

For cloud MCP, connect directly to the **official hosted endpoint with OAuth** — no keys to configure:

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

On first connect, the client opens a browser for OAuth authorization (sign in to Tencent Cloud, pick an environment) — no keys in config files. For the international site, use `https://tcb-api.tencentcloud.com/mcp/v1`. See [Connection Modes — Remote Mode](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/connection-modes#remote-mode).

Clients without OAuth support (and CI/CD or other non-interactive scenarios) pass Tencent Cloud API keys as static credentials in request headers — the environment variables below are not needed there either.

### Environment Variable Configuration (self-hosted remote services only)

The following variables are for **self-hosting** the MCP service on your own server (with Cloud Mode enabled) to inject credentials; the hosted endpoint above needs none of them:

| Environment Variable | Description | How to Obtain |
|---------|------|---------|
| `TENCENTCLOUD_SECRETID` | Tencent Cloud SecretId | [Get Tencent Cloud API Key](https://console.cloud.tencent.com/cam/capi) |
| `TENCENTCLOUD_SECRETKEY` | Tencent Cloud SecretKey | [Get Tencent Cloud API Key](https://console.cloud.tencent.com/cam/capi) |
| `TENCENTCLOUD_SESSIONTOKEN` | Optional, Tencent Cloud temporary key Token | Only needed when using temporary keys, can be obtained via [STS Service](https://console.cloud.tencent.com/cam/capi) |
| `CLOUDBASE_ENV_ID` | CloudBase Environment ID | [Get CloudBase Environment ID](https://tcb.cloud.tencent.com/dev) |

## Detailed Specs

### `auth`
CloudBase (Tencent Cloud Development) development stage login and environment binding. Not sure where to start? Call auth(status) once (read-only, no parameters) to confirm the login state and current environment. After logging in, you can access cloud resources; an environment (env) is an isolation unit for cloud functions, databases, static hosting and other resources. After binding the environment, other MCP tools can operate on that environment. No environment yet: new users on the China site can enable a free trial environment, then bind it with set_env. Supports: query status, initiate login, API Key login, bind environment (set_env), logout. auth(status) returns credential_scope (account=account-level / single_env=environment-level API Key) and the current region; environment-level API Keys can only see the bound envId, not being able to query other regions' environments is a permission boundary, not that the environment doesn't exist. Optional site/region/lang parameters: site=site (domestic/intl), region=region, lang=output language (zh/en).

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td></td><td>Action: status=query status, start_auth=initiate login, login_by_api_key=API Key login, set_env=bind environment (pass envId), logout=logout. Allowed values: "status", "start_auth", "set_env", "logout", "get_temp_credentials", "login_by_api_key"</td></tr>
<tr><td><code>authMode</code></td><td>string</td><td></td><td>Authentication mode: device=device code authorization, web=browser callback authorization. Allowed values: "device", "web"</td></tr>
<tr><td><code>oauthEndpoint</code></td><td>string</td><td></td><td>Advanced optional: Custom device-code login endpoint. When configured, oauthCustom defaults to true</td></tr>
<tr><td><code>clientId</code></td><td>string</td><td></td><td>Advanced optional: Custom device-code login client_id, uses default value if not provided</td></tr>
<tr><td><code>oauthCustom</code></td><td>boolean</td><td></td><td>Advanced optional: Custom endpoint return format switch. Defaults to false when endpoint not configured; defaults to true when endpoint is configured. Endpoints using the standard &#123;code,result&#125; wrapper format (e.g. the international site tcb-api.tencentcloud.com) should explicitly pass false</td></tr>
<tr><td><code>site</code></td><td>string</td><td></td><td>Site: domestic=China site, intl=international site. When the environment is provisioned on the Tencent Cloud international site, login (start_auth/login_by_api_key) must explicitly pass intl, otherwise the China-site flow is used and international-site environments are invisible. An explicitly passed value takes precedence over the TCB_SITE environment variable / the region mapping table / project config, and affects the login endpoint, the authorization page and the API Key exchange gateway. Allowed values: "domestic", "intl"</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Environment ID (CloudBase environment unique identifier), after binding the tool will operate on this environment. Required when action=set_env</td></tr>
<tr><td><code>region</code></td><td>string</td><td></td><td>Region (e.g. ap-shanghai / ap-guangzhou / ap-singapore). Used for region→site inference and API Key exchange gateway selection; an explicit site takes precedence</td></tr>
<tr><td><code>lang</code></td><td>string</td><td></td><td>Output language: zh=Chinese (default), en=English. Overrides the instance-level language (createCloudBaseMcpServer lang option / TCB_LANG / project.json). Allowed values: "zh", "en"</td></tr>
<tr><td><code>apiKey</code></td><td>string</td><td></td><td>CloudBase API Key, required when action=login_by_api_key</td></tr>
<tr><td><code>apiKeyEnvId</code></td><td>string</td><td></td><td>CloudBase environment ID (EnvId), required when action=login_by_api_key, used to specify the environment the API Key belongs to</td></tr>
<tr><td><code>confirm</code></td><td>string</td><td></td><td>Confirm operation when action=logout, pass yes. Allowed values: const "yes"</td></tr>
<tr><td><code>reveal</code></td><td>boolean</td><td></td><td>Optional when action=get_temp_credentials. true=return plaintext temporary credentials; defaults to false returning masked results only</td></tr>
</tbody>
</table>

---

### `queryEnv`
Query CloudBase environment related information, supports querying the environment list, details of a specific environment, security domains, resource usage, and monitoring metrics. (Former names: envQuery, listEnvs, getEnvInfo, getEnvAuthDomains) When action=list, it filters/lists per DescribeEnvs semantics, returning standard fields EnvId, Alias, Status, EnvType, Region, PackageId, PackageName, IsDefault, and supports trimming these fields via the fields whitelist; aliasExact=true filters by exact alias match to avoid mistaking environments with similar prefixes as candidates; even when envId is passed, action=list only returns the summary, not full resource details or expiry. Account-level login can pass region (ap-shanghai/ap-guangzhou/ap-singapore) to query corresponding regions, aligned with CLI `tcb env list -r <region>`; environment-level credentials (API Key / hosted authorization token) can only see the bound envId, returning credential_scope=single_env; in that case region is not applied and is truthfully reported in ignored_params (AppliedFilters.region is null) — do not misjudge this as the environment not existing or region filtering being broken. To query the detailed information of a known EnvId environment (including resource fields and billing info), use action=info with the target envId. action=info supplements BillingInfo (e.g. ExpireTime, PayMode, IsAutoRenew) when available.

📊 action=usage aligns with tcb env usage/info: passes through Manager SDK describeEnvAccountCircle + describeCreditsUsageDetail, returning billing cycle and resource credit usage by module (FLEXDB/SCF/COS etc.). envId required; type optionally filters modules; when startDate/endDate are not passed, the current billing cycle is used automatically.

📈 action=metrics aligns with TCB DescribeCurveData (manager.monitor.describeCurveData, not Cloud Monitor GetMonitorData): queries environment/gateway QPS, cloud function invocations and errors, database CPU/memory/disk, CloudRun CPU/QPS time series. envId and metricName required; startTime/endTime format YYYY-MM-DD HH:mm:ss, must be passed as a pair, defaults to last 24 hours when omitted; period only supports 300/3600/86400. When GatewayTraceEnvQPS is called without resourceID, environment-level all|:|all|:|all|:|all is auto-filled; CloudRun Tke* metrics must pass service name as resourceID. Do not use callCloudApi to guess monitoring Actions.

🔍 action=info also derives three fields for backend selection:
- `EnvInfo.RuntimeMode`: 'postgresql' or 'nosql', indicating the recommended default backend for new services (postgresql when PG is enabled, otherwise nosql).
- `EnvInfo.RuntimeBackends`: three booleans `\{postgresql, nosql, mysql\}` describing which backends currently coexist in the environment.
- `EnvInfo.RuntimeModeHints`: API/tool/skill hints for each backend.
- `EnvInfo.PostgreSQL[].TenantType`: PG instance type — `SHARED` (SDK / gateway access only) or `DEDICATED` (private network host / direct TCP).

🌐 action=info also projects gateway route Enable status without overwriting `StaticStorages[].StaticDomain` (cloud API nominal domain): `StaticStorages[].staticDomainRouteEnabled` and `EnvInfo.staticDomainRouteEnabled` (same source as queryHosting websiteConfig). `false` means the default static domain root route is disabled (access returns GATEWAY_ROUTE_DISABLED), do not treat the nominal domain as a reachable URL.

AI must check these three items before writing business/permission/storage code: In PG mode, new services should use `app.rdb()` + RLS (`managePgDatabase action=execute` to run `CREATE POLICY`) + pgstore; existing NoSQL collections / old storage / `managePermissions(resourceType="noSqlDatabase")` remain valid in classic PG environments. **Exception (pgdoc)**: when the document-database API is carried by PostgreSQL and client SDK calls stay unchanged, CUSTOM collection security rules do not take effect — use the four basic permissions or move validation into a cloud function. Do not rewrite existing document-database code into `app.rdb()`, and do not assume data was migrated automatically. `RuntimeBackends` lists provisioned resources only; it does not say who carries document requests, so confirm the enablement state with the user. What is truly inapplicable is MySQL and the data model tools: when `RuntimeBackends.mysql === false`, `manageMysqlDatabase` / `queryMysqlDatabase` / `relational-database-mcp-cloudbase` skill should not be used; `manageDataModel` / `modifyDataModel` only work in classic mode and have no PG counterpart.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Query type: list=environment list/summary filter (filters per DescribeEnvs semantics, supports filtering by envId/region, returns EnvId, Alias, Status, EnvType, Region, PackageId, PackageName, IsDefault, no expiry), info=detailed info of the specified environment (envId required, returns resource fields and billing info), domains=security domain list, usage=environment resource usage (envId required, aligned with tcb env usage/info), metrics=environment monitoring time series (envId and metricName required, aligned with CloudBase DescribeCurveData). Allowed values: "list", "info", "domains", "usage", "metrics"</td></tr>
<tr><td><code>alias</code></td><td>string</td><td></td><td>Filter by environment alias. Optional when action=list</td></tr>
<tr><td><code>aliasExact</code></td><td>boolean</td><td></td><td>Filter by exact environment alias. Optional when action=list; used with alias</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Environment ID. Optional when action=list (only filters per DescribeEnvs semantics, still returns the summary); required when action=info / action=usage / action=metrics; optional when action=domains (queries the currently bound environment when omitted, or that environment's security domains when provided).</td></tr>
<tr><td><code>region</code></td><td>string</td><td></td><td>Query region. Only effective when action=list. Account-level credentials pass this value through to DescribeEnvs (X-TC-Region), e.g. ap-singapore. Equivalent CLI: tcb env list -r &lt;region&gt; --json. Environment-level credentials (API Key / hosted authorization token) are single-environment scoped and this parameter is ignored: the result is always the bound environment, the response has AppliedFilters.region = null, query_region takes that environment's own Region, and ignored_params explains why it was ignored — do not conclude from this that the region has no environments. ⚠️ ap-singapore belongs to both the China site and the international site; when no site is explicitly specified it is treated as the international site (site=intl): if you have logged in to both sites, passing this region silently queries the international-site account, so call auth(site="domestic") or set TCB_SITE=domestic first to pin the site. Allowed values: "ap-shanghai", "ap-guangzhou", "ap-singapore"</td></tr>
<tr><td><code>limit</code></td><td>integer</td><td></td><td>Max number of results. Optional when action=list</td></tr>
<tr><td><code>offset</code></td><td>integer</td><td></td><td>Pagination offset. Optional when action=list</td></tr>
<tr><td><code>fields</code></td><td>array of string</td><td></td><td>Return field whitelist. Only supports EnvId, Alias, Status, EnvType, Region, PackageId, PackageName, IsDefault. Optional when action=list</td></tr>
<tr><td><code>type</code></td><td>array of string</td><td></td><td>Usage module filter. Only effective when action=usage; omitting it queries all modules. WARNING: passing it narrows the query to those modules, so credits.total is omitted and the panel stops judging sufficiency; the plan is still returned. Omit this parameter to compare against the full quota. Allowed values: FLEXDB, TDSQL, PostgreSQL, SCF, CBF, EKS, COS, AI, Token, HOSTING, Auth, Gateway, Workflow, CLS, EO, STORAGE_EO, CI, VM, Other (same set the console usage page requests).</td></tr>
<tr><td><code>startDate</code></td><td>string</td><td></td><td>Usage start date (YYYY-MM-DD). Only effective when action=usage; passed as a pair with endDate. Uses current billing cycle when omitted.</td></tr>
<tr><td><code>endDate</code></td><td>string</td><td></td><td>Usage end date (YYYY-MM-DD). Only effective when action=usage; passed as a pair with startDate. Uses current billing cycle when omitted.</td></tr>
<tr><td><code>needUsageDetails</code></td><td>boolean</td><td></td><td>Whether to return daily usage details. Only effective when action=usage; defaults to true.</td></tr>
<tr><td><code>metricName</code></td><td>string</td><td></td><td>Monitoring metric name. Only effective and required when action=metrics. GatewayTraceEnvQPS/EnvQPSAll=environment and gateway QPS; FunctionInvocation/FunctionError/FunctionTimeout/FunctionThrottle=cloud function invocations, errors, timeouts, throttling; DbRead/DbWrite/DbSizepkg=document database reads, writes, and capacity; MysqlCpuUsageRate/MysqlMemoryUse/MysqlStorageUsage=SQL database CPU/memory/disk; TkeCpuUsedService/TkeQPSService/TkeHttpErrorService=CloudRun CPU/QPS/errors. Allowed values: "GatewayTraceEnvQPS", "EnvQPSAll", "FunctionInvocation", "FunctionError", "FunctionTimeout", "FunctionThrottle", "FunctionDuration", "FunctionConcurrentExecutions", "DbRead", "DbWrite", "DbSizepkg", "MysqlCpuUsageRate", "MysqlMemoryUse", "MysqlStorageUsage", "MysqlQps", "MysqlSlowQueries", "MysqlDbConnections", "TkeCpuUsedService", "TkeMemUsedService", "TkeQPSService", "TkeHttpErrorService", "TkeInvokeNumService"</td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td>Monitoring start time (YYYY-MM-DD HH:mm:ss). Only effective when action=metrics; passed as a pair with endTime. Defaults to last 24 hours when omitted. End time must be at least five minutes after start time.</td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td>Monitoring end time (YYYY-MM-DD HH:mm:ss). Only effective when action=metrics; passed as a pair with startTime. Defaults to last 24 hours when omitted.</td></tr>
<tr><td><code>period</code></td><td>number</td><td></td><td>Statistics period (seconds). Only effective when action=metrics; only supports 300, 3600, 86400. Auto-selected by backend based on time range when omitted. Time range ≤1 day cannot use 86400; >3 days cannot use 300. Allowed values: 300, 3600, 86400</td></tr>
<tr><td><code>resourceID</code></td><td>string</td><td></td><td>Resource ID. Only effective when action=metrics. Cloud functions pass function name, document database passes collection name, CloudRun must pass service name; GatewayTraceEnvQPS auto-fills environment-level all|:|all|:|all|:|all when omitted.</td></tr>
<tr><td><code>subresourceID</code></td><td>string</td><td></td><td>Sub-resource ID. Only effective when action=metrics; pass version name when querying CloudRun version monitoring.</td></tr>
</tbody>
</table>

---


### `envDomainManagement`
⚠️ DEPRECATED: This tool has been folded into `manageEnv`. Use `manageEnv(action="addSecurityDomain")` / `manageEnv(action="removeSecurityDomain")` instead; the `domains` parameter is identical. This alias will be removed in the next version.

It manages **environment security domains**, which are browser CORS allowlists controlling which web origins (`host:port`) may call CloudBase resources directly. It does not provide an access domain or manage HTTPS certificates. Gateway custom domains are managed by `manageGateway` and are unrelated. Before adding or removing a domain, use `queryEnv(action="domains")` to inspect the actual browser origin; after the change, poll `queryEnv(action="domains")` about every 10 seconds until the state converges.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Operation type: create=add domain, delete=delete domain. Allowed values: "create", "delete"</td></tr>
<tr><td><code>domains</code></td><td>array of string</td><td>Yes</td><td>Security domain array</td></tr>
</tbody>
</table>

---

### `manageEnv`
Manage CloudBase environments, supports: listPackages=query available plan list, create=create a new environment (requires confirmation), modifyPlan=change plan (scale up/down, requires confirmation), renew=renew environment (requires confirmation).

⚠️ All fee-incurring operations (create/modifyPlan/renew) must show a configuration summary and wait for the user to confirm via confirm="yes" before execution.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: listPackages=query available plans, create=create environment, modifyPlan=change plan, renew=renew. Allowed values: "listPackages", "create", "modifyPlan", "renew"</td></tr>
<tr><td><code>alias</code></td><td>string</td><td></td><td>Environment alias (required when action=create). Requirements: lowercase letters/numbers/hyphens, cannot start or end with a hyphen, max 20 characters</td></tr>
<tr><td><code>packageId</code></td><td>string</td><td></td><td>Plan ID (required when action=create/modifyPlan). Take the PackageName returned by manageEnv(action="listPackages") — those are the plans selectable in the purchase / create menus (Personal baas_personal, Standard baas_pf_standard, Enterprise baas_pf_enterprise, Enterprise Premium baas_pf_enterprise_senior, Trial baas_trial, Integration baas_integration). Other valid packageIds are still accepted (legacy plan families, whitelisted plans); the actual creation result is authoritative. The plans on sale differ per site, so do not fill this in from memory</td></tr>
<tr><td><code>resources</code></td><td>array of string</td><td></td><td>Enabled resource types (optional when action=create). Available values: storage, function (cloud function), postgresql; defaults to all three when omitted. CreateEnv requires a non-empty Resources field; MCP always sends it. flexdb (document database) is no longer included: newly created environments do not create a NoSQL instance, and its availability is determined by EnvInfo.RuntimeBackends returned by queryEnv(action="info")</td></tr>
<tr><td><code>duration</code></td><td>integer</td><td></td><td>Purchase or renewal duration (months), optional when action=create/renew, default 1</td></tr>
<tr><td><code>externalStorage</code></td><td>object</td><td></td><td>Shared Cloud Storage bucket configuration, optional for action=create. Providing this object prevents automatic allocation of a dedicated COS bucket and uses the specified bucket instead, isolating this environment from others through basePath. It affects Cloud Storage only; Static Hosting receives its bucket when hosting is enabled. All three child fields are required. ⚠️ As with region, the confirmation call (`confirm="yes"`) reads only parameters sent in that call; omitting this object creates an environment with a dedicated bucket without reporting an error.</td></tr>
<tr><td><code>externalStorage.bucketName</code></td><td>string</td><td>yes</td><td>Shared bucket name (COS bucket name)</td></tr>
<tr><td><code>externalStorage.region</code></td><td>string</td><td>yes</td><td>Region of the shared bucket, for example ap-shanghai</td></tr>
<tr><td><code>externalStorage.basePath</code></td><td>string</td><td>yes</td><td>Base path prefix. It must be unique within the shared bucket and isolates this environment from other environments using the same bucket</td></tr>
<tr><td><code>region</code></td><td>string</td><td></td><td>Creation region (only effective when action=create). Passed through with X-TC-Region semantics and determines where the new environment lives; equivalent CLI: tcb env create --region ap-shanghai. When omitted, the current session region is used (cloudBaseOptions.region → TCB_REGION → project config / rc binding → site default region: ap-shanghai for the China site, ap-singapore for the international site). Note: region is not written into the CreateEnv request body but takes effect through the request-level region context — consistent with the callCloudApi rule "do not put Region into params". ⚠️ ap-singapore belongs to both the China site and the international site; when no site is explicitly specified it is treated as the international site (site=intl). To create in that region on the China site, call auth(site="domestic") or set TCB_SITE=domestic first. Allowed values: "ap-shanghai", "ap-guangzhou", "ap-singapore"</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Environment ID (required when action=modifyPlan/renew)</td></tr>
<tr><td><code>confirm</code></td><td>string</td><td></td><td>Confirmation. All paid operations (create/modifyPlan/renew) must pass "yes". Allowed values: const "yes"</td></tr>
</tbody>
</table>

---

### `readNoSqlDatabaseStructure`
Read NoSQL database collection and index structure, supports listing collections, viewing collection details, listing indexes, and checking if an index exists.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>listCollections: List collection list<br/>describeCollection: Describe collection details (returns index summary)<br/>checkCollection: Check if collection exists<br/>listIndexes: List indexes of specified collection<br/>checkIndex: Check if specified index exists. Allowed values: "listCollections", "describeCollection", "checkCollection", "listIndexes", "checkIndex"</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>Return count limit (optional for listCollections operation)</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>Offset (optional for listCollections operation)</td></tr>
<tr><td><code>collectionName</code></td><td>string</td><td></td><td>Collection name (required for describeCollection, listIndexes, checkIndex operations)</td></tr>
<tr><td><code>indexName</code></td><td>string</td><td></td><td>Index name (required for checkIndex operation)</td></tr>
</tbody>
</table>

---

### `writeNoSqlDatabaseStructure`
Modify NoSQL database structure, supports creating/deleting collections, and adding/deleting indexes via updateCollection's updateOptions.CreateIndexes / updateOptions.DropIndexes.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>createCollection: Create collection<br/>updateCollection: Update collection configuration; pass updateOptions.CreateIndexes to add indexes, pass updateOptions.DropIndexes to delete indexes<br/>deleteCollection: Delete collection. Allowed values: "createCollection", "updateCollection", "deleteCollection"</td></tr>
<tr><td><code>collectionName</code></td><td>string</td><td>Yes</td><td>Collection name</td></tr>
<tr><td><code>updateOptions</code></td><td>object</td><td></td><td>Update options (used for updateCollection). CreateIndexes for adding indexes, DropIndexes for deleting indexes.</td></tr>
<tr><td><code>updateOptions.CreateIndexes</code></td><td>array of object</td><td></td><td>List of indexes to add</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].IndexName</code></td><td>string</td><td>Yes</td><td>Index name to create</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema</code></td><td>object</td><td>Yes</td><td>Field and constraint configuration for index to be created</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIsUnique</code></td><td>boolean</td><td>Yes</td><td>Whether unique index</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIndexKeys</code></td><td>array of object</td><td>Yes</td><td>Index field list, supports single field or compound indexes</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIndexKeys[].Name</code></td><td>string</td><td>Yes</td><td>Index field name</td></tr>
<tr><td><code>updateOptions.CreateIndexes[].MgoKeySchema.MgoIndexKeys[].Direction</code></td><td>string</td><td>Yes</td><td>Index direction, typically 1 for ascending, -1 for descending</td></tr>
<tr><td><code>updateOptions.DropIndexes</code></td><td>array of object</td><td></td><td>List of indexes to delete</td></tr>
<tr><td><code>updateOptions.DropIndexes[].IndexName</code></td><td>string</td><td>Yes</td><td>Index name to delete</td></tr>
</tbody>
</table>

---

### `readNoSqlDatabaseContent`
Query and get NoSQL database data records

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>collectionName</code></td><td>string</td><td>Yes</td><td>Collection name</td></tr>
<tr><td><code>instanceId</code></td><td>string</td><td></td><td>Optional: Explicitly specify database instance ID; will be automatically resolved and cached if not provided</td></tr>
<tr><td><code>query</code></td><td>object | string</td><td></td><td>Query conditions (object or string, object recommended)</td></tr>
<tr><td><code>projection</code></td><td>object | string</td><td></td><td>Return field projection (object or string, object recommended)</td></tr>
<tr><td><code>sort</code></td><td>array of object | string</td><td></td><td>Sort conditions, only supports array <code>[&#123;"key":"createdAt","direction":-1&#125;]</code> or corresponding JSON string.</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>Return count limit</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>Number of records to skip</td></tr>
</tbody>
</table>

---

### `writeNoSqlDatabaseContent`
Modify NoSQL database data records. Can be understood using MongoDB updateOne/updateMany mental model: partial updates must use update operators like <code>$set</code>/<code>$inc</code>/<code>$push</code>; if you directly pass a plain object like <code>&#123; field: value &#125;</code>, the underlying layer treats it as replacement content, risking overwriting the entire document. When updating a field in a nested object, you must use dot notation path (e.g., <code>&#123; "$set": &#123; "address.city": "shenzhen" &#125; &#125;</code>); if written as <code>&#123; "$set": &#123; "address": &#123; "city": "shenzhen" &#125; &#125; &#125;</code>, the entire address object will be replaced and other sibling fields will be lost. If role/profile documents in a collection are read on the frontend via <code>db.collection(...).doc(uid)</code>, ensure the document <code>_id</code> is that <code>uid</code>; do not use <code>query=&#123;"uid":"..."&#125;</code> + <code>upsert=true</code> to update <code>users</code> / <code>profiles</code>, otherwise it often generates a different <code>_id</code>, causing subsequent <code>doc(uid)</code> reads to miss.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>insert: Insert data (add document)<br/>update: Update data<br/>delete: Delete data. Allowed values: "insert", "update", "delete"</td></tr>
<tr><td><code>collectionName</code></td><td>string</td><td>Yes</td><td>Collection name</td></tr>
<tr><td><code>instanceId</code></td><td>string</td><td></td><td>Optional: Explicitly specify database instance ID; will be automatically resolved and cached if not provided</td></tr>
<tr><td><code>documents</code></td><td>array of object</td><td></td><td>Array of document objects to insert, each document is an object (required for insert operation)</td></tr>
<tr><td><code>query</code></td><td>object | string</td><td></td><td>Query conditions (object or string, object recommended) (required for update/delete operations)</td></tr>
<tr><td><code>update</code></td><td>object | string</td><td></td><td>Update content (object or string, object recommended) (required for update operation). Pass MgoUpdate using MongoDB update semantics: for partial updates use <code>$set</code>/<code>$inc</code>/<code>$unset</code>/<code>$push</code> operators, e.g., <code>&#123; "$set": &#123; "status": "pending" &#125; &#125;</code>; do not directly pass <code>&#123; "status": "pending" &#125;</code>, otherwise the entire document may be replaced. When updating nested fields, use dot notation path, e.g., <code>&#123; "$set": &#123; "address.city": "shenzhen" &#125; &#125;</code>, do not write <code>&#123; "$set": &#123; "address": &#123; "city": "shenzhen" &#125; &#125; &#125;</code> (will replace entire address object).</td></tr>
<tr><td><code>isMulti</code></td><td>boolean</td><td></td><td>Whether to update multiple records (optional for update/delete operations)</td></tr>
<tr><td><code>upsert</code></td><td>boolean</td><td></td><td>Whether to insert if not exists (optional for update operation)</td></tr>
</tbody>
</table>

---

### `queryPgDatabase`
Query CloudBase PostgreSQL databases. Supports getting the current PG context, listing schema-qualified database objects, reading lightweight metadata, inspecting a single object structure, and executing read-only SQL.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: context=get current PostgreSQL context; objects=list schema-qualified database objects; metadata=get lightweight table metadata; schema=inspect a single schema-qualified object structure; sql=execute read-only SQL. Allowed values: "context", "objects", "metadata", "schema", "sql"</td></tr>
<tr><td><code>sql</code></td><td>string</td><td></td><td>Read-only SQL used when action=sql</td></tr>
<tr><td><code>objectName</code></td><td>string</td><td></td><td>Schema-qualified PostgreSQL object name used when action=schema, e.g. public.users</td></tr>
<tr><td><code>schema</code></td><td>string</td><td></td><td>Optional schema filter, used for action=objects or action=metadata</td></tr>
<tr><td><code>limit</code></td><td>integer</td><td></td><td>Optional cap on summary rows for objects, metadata, or SQL results. Default 20, max 200</td></tr>
</tbody>
</table>

---

### `managePgDatabase`
Manage CloudBase PostgreSQL: execute confirmed write SQL, SQL risk preflight, migration management, and Realtime settings. Schema changes such as CREATE/ALTER/DROP MUST use applyMigration (explicit migrationVersion; before success, it automatically writes or validates the local cloudbase/migrations/&lt;version&gt;_&lt;name&gt;.sql file, consistent with the CLI `tcb db pg migration`). Do not default to execute. execute is mainly for DML and operational SQL like GRANT/RLS. Three Realtime actions: describeRealtime reads the settings (the response has no provisioning flag, so success does not mean Realtime is provisioned); enableRealtime provisions and resumes the service, equivalent to setting Suspend=false (the first call on an unprovisioned environment provisions it automatically and is a no-op when already provisioned and not suspended); modifyRealtime applies an incremental update from the fields you pass explicitly (requires confirm=true, and changing suspend immediately drops all live WebSocket connections of the environment, globally; client subscriptions use app.realtime(), not collection.watch() — see references/realtime.md in the postgresql-development-cloudbase skill).

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: execute=execute confirmed write SQL (DML/GRANT/RLS; schema DDL is rejected by default, requires allowDdlViaExecute=true); dryRun=only analyze SQL risk without executing; planMigration=preview migration plan (requires migrationName + migrationVersion + sql; optional includeAll=true allows out-of-order, aligned with CLI --include-all); applyMigration=apply migration, preferred for CREATE/ALTER schema (requires migrationName + migrationVersion + sql + confirm=true; optional includeAll; if the local SQL is missing it is automatically written to cloudbase/migrations/, if content mismatches it fails closed with LOCAL_MIGRATION_FILE_MISMATCH; before returning success it polls DescribeTaskResult (default max 10 minutes, adjustable via taskPollTimeoutMs / waitForTask) and verifies the migrationVersion has landed in remote history; on timeout returns MIGRATION_TASK_TIMEOUT, must first describeMigrationTask then listMigrations, do NOT immediately re-push the same version; if not applied returns success=false with errorCode=MIGRATION_NOT_APPLIED); listMigrations=query the applied Migration list (supports limit/offset paging); migrationDetail=view a single Migration detail (requires migrationVersion); describeMigrationTask=query the Push async task status by TaskId (DescribeTaskResult: Status/Phase/Reason; requires taskId; used for waitForTask=false / MIGRATION_TASK_TIMEOUT / failure diagnosis, listMigrations cannot see Reason); fetchMigration=pull SQL from remote history and write to local cloudbase/migrations/ (aligned with CLI tcb db pg migration fetch; optional migrationVersion pulls a single entry, omitted pulls all; force=true overwrites existing files, default skips); repairMigration=repair Migration history (requires migrationVersion + migrationName + repairStatus + repairReason); describeRealtime=read the Realtime settings (does not indicate provisioning); enableRealtime=provision and resume, equivalent to Suspend=false (the first call on an unprovisioned environment provisions it automatically and is a no-op when already provisioned and not suspended); modifyRealtime=incremental Realtime update (requires confirm=true). Allowed values: "execute", "dryRun", "planMigration", "applyMigration", "listMigrations", "migrationDetail", "describeMigrationTask", "fetchMigration", "repairMigration", "describeRealtime", "enableRealtime", "modifyRealtime"</td></tr>
<tr><td><code>sql</code></td><td>string</td><td></td><td>SQL statement used by action=execute, dryRun, planMigration, applyMigration, or repairMigration(applied)</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Must be explicitly set to true before executing any write SQL and for action=modifyRealtime; when modifyRealtime omits it nothing is sent and the tool returns the current values plus the pending changes so you can confirm with the user first</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Optional CloudBase environment ID; uses the current MCP environment when omitted</td></tr>
<tr><td><code>instanceId</code></td><td>string</td><td></td><td>Optional PostgreSQL logical instance identifier, default cloudbase-pg</td></tr>
<tr><td><code>defaultSchema</code></td><td>string</td><td></td><td>Optional default schema, default public</td></tr>
<tr><td><code>role</code></td><td>string</td><td></td><td>Optional PostgreSQL role, passed to Manager SDK executePGSql; e.g. pass postgres when managing policies</td></tr>
<tr><td><code>objectName</code></td><td>string</td><td></td><td>Optional object name, currently only used for non-migration scenarios. For migration operations use migrationName / migrationVersion</td></tr>
<tr><td><code>migrationName</code></td><td>string</td><td></td><td>Required for plan/apply/repair: migration name, starts with a lowercase letter, only lowercase letters, digits, and underscores allowed</td></tr>
<tr><td><code>migrationVersion</code></td><td>string</td><td></td><td>14-digit timestamp YYYYMMDDHHMMSS. Required for plan/apply/detail/repair; optional for fetchMigration (pass to pull that entry only, omit to pull all remote history); must not be silently generated server-side, to avoid diverging from local cloudbase/migrations/&lt;version&gt;_&lt;name&gt;.sql. applyMigration is not incremental: always pass the complete SQL; when a run ends in a failed final state and listMigrations has not recorded it, the version number is not consumed — just resend the full SQL under a new migrationVersion (the same name with a different version does not conflict)</td></tr>
<tr><td><code>rollbackSql</code></td><td>string</td><td></td><td>Optional for plan/apply: rollback SQL statement</td></tr>

<tr><td><code>limit</code></td><td>integer</td><td></td><td>Optional for list: max number of results, 1-500, default 100</td></tr>
<tr><td><code>offset</code></td><td>integer</td><td></td><td>Optional for list: pagination offset, default 0</td></tr>
<tr><td><code>lockTimeoutMs</code></td><td>integer</td><td></td><td>Optional for apply: max time to acquire the database lock (ms), default 5000</td></tr>
<tr><td><code>statementTimeoutMs</code></td><td>integer</td><td></td><td>Optional for apply: max execution time per SQL statement (ms), default 300000</td></tr>
<tr><td><code>taskPollTimeoutMs</code></td><td>integer</td><td></td><td>Optional for apply: max wait for polling DescribeTaskResult (ms). Default 600000 (aligned with CLI tcb db pg migration up 10-minute wait). Range 5000-600000. On timeout, first describeMigrationTask(taskId) then listMigrations, do NOT immediately re-push the same version</td></tr>
<tr><td><code>waitForTask</code></td><td>boolean</td><td></td><td>Optional for apply, default true. When false, Push returns the TaskId immediately (errorCode=MIGRATION_TASK_PENDING) and the caller polls the task final state with describeMigrationTask, then confirms persistence with listMigrations; suitable for MCP host tool calls with short timeout. Default true waits synchronously for the task final state</td></tr>
<tr><td><code>taskId</code></td><td>string</td><td></td><td>Required for describeMigrationTask: the TaskId returned by PushPGUserMigrations / applyMigration. Used for a one-shot DescribeTaskResult (Status/Phase/Reason) query, no polling</td></tr>
<tr><td><code>repairStatus</code></td><td>string</td><td></td><td>Required for repair: applied=mark as applied (can backfill Query), reverted=delete history record. Allowed values: "applied", "reverted"</td></tr>
<tr><td><code>repairReason</code></td><td>string</td><td></td><td>Required for repair: repair reason</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>Optional for fetchMigration, default false. true=overwrite an existing local SQL file with the same name (aligned with CLI tcb db pg migration fetch --force); false=skip existing files. Used to realign Git checksums from remote history</td></tr>
<tr><td><code>includeAll</code></td><td>boolean</td><td></td><td>Optional for planMigration / applyMigration, default false. true=allow out-of-order (version lower than remote LatestVersion) Preview/Push, aligned with CLI tcb db pg migration up --include-all; only use when intentionally backfilling history/out-of-order migrations, otherwise choose a larger migrationVersion</td></tr>
<tr><td><code>allowDdlViaExecute</code></td><td>boolean</td><td></td><td>Optional, default false. Only set true when deliberately bypassing migration history to allow schema DDL via execute; normal CREATE/ALTER schema must use applyMigration</td></tr>
<tr><td><code>suspend</code></td><td>boolean</td><td></td><td>Applies to action=modifyRealtime (enableRealtime is equivalent to Suspend=false). Global, affects every node of the environment: true immediately drops all live WebSocket connections, rejects new ones (HTTP 403 Realtime was disabled for this tenant) and disables the server-side broadcast API; false restores the service. Any change of the suspend value triggers one disconnect, so clients must reconnect</td></tr>
<tr><td><code>privateOnly</code></td><td>boolean</td><td></td><td>Applies to action=modifyRealtime: when true only private channels are allowed; clients cannot join channels prefixed with public:</td></tr>
<tr><td><code>presenceEnabled</code></td><td>boolean</td><td></td><td>Applies to action=modifyRealtime: global presence switch. When false, client presence joins on a channel are rejected</td></tr>
<tr><td><code>maxConcurrentUsers</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum concurrent users (multiple connections of the same user count once); new connections are rejected above it. Server-side range 0-15000</td></tr>
<tr><td><code>maxEventsPerSecond</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum broadcast events per second across all clients; exceeding it returns a rate-limit error</td></tr>
<tr><td><code>maxJoinsPerSecond</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum joins per second; new joins are throttled above it</td></tr>
<tr><td><code>maxBytesPerSecond</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum broadcast payload bytes per second across all clients; exceeding it rejects messages</td></tr>
<tr><td><code>maxChannelsPerClient</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum channels per client; a client above it cannot join more channels</td></tr>
<tr><td><code>maxPresenceEventsPerSecond</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum presence events per second across all clients (track/untrack)</td></tr>
<tr><td><code>maxPayloadSizeInKB</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: maximum payload size per message in KB; larger messages are rejected</td></tr>
<tr><td><code>connectionPool</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: Realtime database connection pool size used for RLS authorization queries. This is not the PG instance connection pool</td></tr>
<tr><td><code>postgresChangesPool</code></td><td>integer</td><td></td><td>Applies to action=modifyRealtime: Realtime dedicated connection pool for CDC (postgres_changes), isolated from the broadcast/auth pool</td></tr>
</tbody>
</table>

---

### `queryPgStorage`
Query cloud storage capabilities in the CloudBase PostgreSQL environment. Returns bucket/config capability summaries, object info query plans, and upload implementation plans based on HTTP API or SDK; does not read local files and does not output large numbers of signed URLs by default.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Operation type: buckets/config=query storage capability summary; createBucket=generate bucket creation plan (SQL/HTTP API/CLI); uploadPlan=generate HTTP API/SDK upload plan; objectInfo=generate object metadata query plan; signUpload/signDownload=explicit one-time signed URL request placeholders. Allowed values: "buckets", "config", "uploadPlan", "objectInfo", "signUpload", "signDownload", "createBucket"</td></tr>
<tr><td><code>bucket</code></td><td>string</td><td></td><td>Cloud storage bucket name</td></tr>
<tr><td><code>objectKey</code></td><td>string</td><td></td><td>Single object key</td></tr>
<tr><td><code>objectKeys</code></td><td>array of string</td><td></td><td>Multiple object keys, used for object metadata query planning</td></tr>
<tr><td><code>objects</code></td><td>array of object</td><td></td><td>Metadata of objects to upload. File byte content is not passed through MCP</td></tr>
<tr><td><code>expiresIn</code></td><td>integer</td><td></td><td>Signed URL validity period in seconds, range 60 to 86400</td></tr>
</tbody>
</table>

---

### `queryMysqlDatabase`
Query CloudBase MySQL database information. Supports read-only SQL execution, instance-create task result lookup (tasks started from the console), MySQL task status lookup, current instance context discovery, and instance slow-query / error-log retrieval (aligned with Manager SDK describeInstanceSlowQueries / describeInstanceErrorLogs).

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>runQuery=execute read-only SQL; describeCreateResult=query instance-create task results (tasks started from the console); describeTaskStatus=query MySQL task status; getInstanceInfo=get current SQL instance context; describeInstance=alias of getInstanceInfo; describeInstanceSlowQueries=query instance slow-query logs; describeInstanceErrorLogs=query instance error logs. Allowed values: "runQuery", "describeCreateResult", "describeTaskStatus", "getInstanceInfo", "describeInstance", "getConnectionInfo", "describeInstanceSlowQueries", "describeInstanceErrorLogs"</td></tr>
<tr><td><code>sql</code></td><td>string</td><td></td><td>Read-only SQL used by action=runQuery</td></tr>
<tr><td><code>request</code></td><td>object</td><td></td><td>Official request payload used by describeCreateResult/describeTaskStatus/describeInstanceSlowQueries/describeInstanceErrorLogs (may include InstanceId and similar)</td></tr>
<tr><td><code>dbInstance</code></td><td>object</td><td></td><td>Optional SQL database instance context for runQuery / slow-query / error logs</td></tr>
<tr><td><code>dbInstance.instanceId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>dbInstance.schema</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td>Slow-query / error-log query start time (YYYY-MM-DD HH:mm:ss)</td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td>Slow-query / error-log query end time (YYYY-MM-DD HH:mm:ss)</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>Maximum number of slow-query / error-log rows to return</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>Pagination offset for slow-query / error logs</td></tr>
<tr><td><code>username</code></td><td>string</td><td></td><td>Slow-query filter: user name</td></tr>
<tr><td><code>host</code></td><td>string</td><td></td><td>Slow-query filter: client host</td></tr>
<tr><td><code>database</code></td><td>string</td><td></td><td>Slow-query filter: database name</td></tr>
<tr><td><code>orderBy</code></td><td>string</td><td></td><td>Sort field. Slow queries support QueryTime/LockTime/RowsExamined/RowsSent; error logs support Timestamp. Allowed values: "QueryTime", "LockTime", "RowsExamined", "RowsSent", "Timestamp"</td></tr>
<tr><td><code>orderByType</code></td><td>string</td><td></td><td>Sort direction: asc/desc (either case). Allowed values: "asc", "desc", "ASC", "DESC"</td></tr>
<tr><td><code>sqlText</code></td><td>string</td><td></td><td>Slow-query filter: SQL text fragment</td></tr>
<tr><td><code>logLevels</code></td><td>array of string</td><td></td><td>Error-log level filter; available values: error / warning / note</td></tr>
<tr><td><code>keyWords</code></td><td>array of string</td><td></td><td>Fuzzy keyword search list for error logs</td></tr>
</tbody>

</table>

---

### `manageMysqlDatabase`
Manage an existing CloudBase MySQL instance: destroy the instance, execute write SQL/DDL, and initialize the database schema. MySQL provisioning has been retired from the MCP tool surface, so this tool no longer creates instances — create one in the CloudBase console instead. When the environment has no instance, the tool returns MYSQL_NOT_CREATED together with the console entry point instead of provisioning guidance. Prefer CloudBase PostgreSQL for new environments (managePgDatabase / queryPgDatabase).

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>destroyMySQL=destroy the MySQL instance; runStatement=execute write SQL or DDL; initializeSchema=run ordered schema initialization statements. Allowed values: "destroyMySQL", "runStatement", "initializeSchema"</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Explicit confirmation required for action=destroyMySQL</td></tr>
<tr><td><code>sql</code></td><td>string</td><td></td><td>SQL statement used by action=runStatement</td></tr>
<tr><td><code>request</code></td><td>object</td><td></td><td>Official request payload used by action=destroyMySQL</td></tr>
<tr><td><code>statements</code></td><td>array of string</td><td></td><td>Ordered schema initialization SQL statements used by action=initializeSchema</td></tr>
<tr><td><code>requireReady</code></td><td>boolean</td><td></td><td>Whether initializeSchema should block until MySQL is confirmed ready. Defaults to true.</td></tr>
<tr><td><code>statusContext</code></td><td>object</td><td></td><td>Optional instance status requests used to confirm readiness before initializeSchema (for provisioning/destruction tasks started from the console)</td></tr>
<tr><td><code>statusContext.createResultRequest</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>statusContext.taskStatusRequest</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>dbInstance</code></td><td>object</td><td></td><td>Optional SQL database instance context for runStatement/initializeSchema</td></tr>
<tr><td><code>dbInstance.instanceId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>dbInstance.schema</code></td><td>string</td><td></td><td></td></tr>
</tbody>
</table>

---

### `manageDataModel`
Data model query tool, supports querying and listing data models (read-only operations). Use the action parameter to distinguish operation types: list=get model list (without Schema, optional names parameter for filtering), get=query single model details (with Schema field list, format, relationships, etc., requires name parameter), docs=generate SDK usage documentation (requires name parameter)

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Operation type: get=query single model (with Schema field list, format, relationships, requires name parameter), list=get model list (without Schema, optional names parameter for filtering), docs=generate SDK usage documentation (requires name parameter). Allowed values: "get", "list", "docs"</td></tr>
<tr><td><code>name</code></td><td>string</td><td></td><td>Data model name to query. When action='get' or action='docs', this parameter is required and must provide an existing data model name. Available model names can be obtained via action='list' operation</td></tr>
<tr><td><code>names</code></td><td>array of string</td><td></td><td>Model name array (optional for list operation, for filtering)</td></tr>
</tbody>
</table>

---

### `modifyDataModel`
Create or update data model based on Mermaid classDiagram. Supports creating new models and updating existing model structures. Built-in async task monitoring, automatically polls until completion or timeout.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>mermaidDiagram</code></td><td>string</td><td>Yes</td><td>Mermaid classDiagram code describing the data model structure.</td></tr>
<tr><td><code>action</code></td><td>string</td><td></td><td>Operation type: create=create new model. Allowed values: "create"; Default: "create"</td></tr>
<tr><td><code>publish</code></td><td>boolean</td><td></td><td>Whether to publish the model immediately. Default: false</td></tr>
<tr><td><code>dbInstanceType</code></td><td>string</td><td></td><td>Database instance type. Default: "MYSQL"</td></tr>
</tbody>
</table>

<details>
<summary>Example</summary>

```text
classDiagram
    class Student {
        name: string <<Name>>
        age: number = 18 <<Age>>
        gender: x-enum = "Male" <<Gender>>
        classId: string <<Class ID>>
        identityId: string <<Identity ID>>
        course: Course[] <<Courses>>
        required() ["name"]
        unique() ["name"]
        enum_gender() ["Male", "Female"]
        display_field() "name"
    }
    class Class {
        className: string <<Class Name>>
        display_field() "className"
    }
    class Course {
        name: string <<Course Name>>
        students: Student[] <<Students>>
        display_field() "name"
    }
    class Identity {
        number: string <<ID Number>>
        display_field() "number"
    }

    %% Relationships
    Student "1" --> "1" Identity : studentId
    Student "n" --> "1" Class : student2class
    Student "n" --> "m" Course : course
    Student "n" <-- "m" Course : students
    %% Class naming
    note for Student "Student Model"
    note for Class "Class Model"
    note for Course "Course Model"
    note for Identity "Identity Model"
```
</details>

---

### `queryFunctions`
Unified read-only entry for CloudBase Functions. It queries function lists, function details, execution logs, layers, triggers, code download URLs, published versions, and traffic aliases through self-explanatory actions.

**Pagination**: `listFunctions`, `listLayers`, and `listVersionByFunction` support `limit` and `offset`.
- `limit`: page size; the backend chooses the default
- `offset`: pagination offset starting at 0
- Example: `queryFunctions(action="listFunctions", offset=10, limit=10)`

**Cloud Function logs**: use `action="listFunctionLogs"` with `functionName`.
- Example: `queryFunctions(action="listFunctionLogs", functionName="my-function")`
- For log details: `queryFunctions(action="getFunctionLogDetail", requestId="xxx")`

**Scheduled jobs / cron / timers**: use `listFunctionTriggers` to inspect timer triggers.

**Versions and traffic routing**: `listVersionByFunction` lists published versions (aligned with `tcb fn list-function-versions`); `getFunctionAlias` retrieves aliases and traffic routing (aligned with `tcb fn get-route`, with `aliasName` defaulting to `$DEFAULT`).

**Layers**:
- Layers use an account-level shared namespace. The same layer name in different environments shares one version sequence, and deleting a version affects every function bound to that version.
- Use a unique layer name containing the environment ID: `&#123;layerName&#125;_&#123;currentEnvId&#125;`, for example `common_cloud1-d9ghadgak3edf6b36`. Check `listLayers` before creating one.
- `listLayers` / `listLayerVersions` / `getLayerVersionDetail` return an account-level view and may include layers created for other environments.

**Difference from `queryLogs`**:
- This tool queries execution logs for a specific CloudBase Function.
- `queryLogs` searches CLS across services.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Read-only operation type: listFunctions=list CloudBase Functions; getFunctionDetail=get function details (functionName required); listFunctionLogs=query execution logs (functionName required); getFunctionLogDetail=get log details (requestId required); listFunctionLayers=list layers bound to a function; listLayers=list all layers in the account-level namespace; listLayerVersions=list layer versions; getLayerVersionDetail=get layer version details; listFunctionTriggers=list triggers, including cron/timer configuration; getFunctionDownloadUrl=get a code download URL; getFunctionDeployStatus=query async deployment status by taskId; listVersionByFunction=list published versions; getFunctionAlias=query an alias and its traffic route; getFunctionUploadUrl=get a COS presigned upload URL for a function ZIP package (stage A of two-stage deployment). PUT the code ZIP to uploadUrl, including uploadHeaders when non-empty, then call manageFunctions createFunction or updateFunctionCode with the returned code triplet (stage B). functionName is optional and is used only to generate the upload object key. The returned uploadUrl contains a credential-bearing signature and must not be logged or persisted. Allowed values: "listFunctions", "getFunctionDetail", "listFunctionLogs", "getFunctionLogDetail", "listFunctionLayers", "listLayers", "listLayerVersions", "getLayerVersionDetail", "listFunctionTriggers", "getFunctionDownloadUrl", "getFunctionDeployStatus", "listVersionByFunction", "getFunctionAlias", "getFunctionUploadUrl"</td></tr>
<tr><td><code>functionName</code></td><td>string</td><td></td><td>CloudBase Function name. Required for getFunctionDetail, listFunctionLogs, listFunctionLayers, listFunctionTriggers, getFunctionDownloadUrl, listVersionByFunction, and getFunctionAlias; optional for getFunctionUploadUrl, where it is used only to generate the upload object key</td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td>Pagination count. Optional for list-type actions</td></tr>
<tr><td><code>offset</code></td><td>number</td><td></td><td>Pagination offset. Optional for list-type actions</td></tr>
<tr><td><code>codeSecret</code></td><td>string</td><td></td><td>Code protection secret used to decrypt function code</td></tr>
<tr><td><code>revealEnvValues</code></td><td>boolean</td><td></td><td>Whether getFunctionDetail / listFunctionTriggers / listFunctionLayers returns plaintext environment-variable values. Defaults to false: values are masked as ***, retaining only Key and ValueLength. When true, sensitive values enter the model context; prefer the console or CLI for plaintext inspection.</td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td>Log query start time</td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td>Log query end time</td></tr>
<tr><td><code>requestId</code></td><td>string</td><td></td><td>Log requestId. Required when getting log details</td></tr>
<tr><td><code>qualifier</code></td><td>string</td><td></td><td>Function version, optional for log queries</td></tr>
<tr><td><code>runtime</code></td><td>string</td><td></td><td>Runtime filter for layer queries</td></tr>
<tr><td><code>searchKey</code></td><td>string</td><td></td><td>Layer name search keyword</td></tr>
<tr><td><code>layerName</code></td><td>string</td><td></td><td>Layer name. Required for layer-related actions</td></tr>
<tr><td><code>layerVersion</code></td><td>number</td><td></td><td>Layer version number. Required when getting layer version details</td></tr>
<tr><td><code>taskId</code></td><td>string</td><td></td><td>Async deployment task ID for getFunctionDeployStatus, returned by manageFunctions when wait=false. Tasks exist only in the current MCP process: completed tasks are retained for about 30 minutes and running tasks for up to two hours.</td></tr>
<tr><td><code>order</code></td><td>string</td><td></td><td>Sort direction for listVersionByFunction, such as ASC or DESC</td></tr>
<tr><td><code>orderBy</code></td><td>string</td><td></td><td>Sort field for listVersionByFunction, such as AddTime or ModTime</td></tr>
<tr><td><code>aliasName</code></td><td>string</td><td></td><td>Alias name for getFunctionAlias. Defaults to `$DEFAULT`, consistent with `tcb fn get-route`</td></tr>
</tbody>
</table>

---

### `manageFunctions`
Unified write entry for CloudBase Functions. It supports creating functions, updating code and configuration, invoking functions, publishing versions, configuring traffic aliases, and managing timer triggers and layer bindings. The deployment package has a hard size limit: do not bundle static content into it — media files (video, large images, fonts), user uploads, and frequently updated static assets belong in cloud storage, referenced by URL. Otherwise every change needs a redeploy and the package may exceed the limit. To create a scheduled job, first create the function, then call createFunctionTrigger with a seven-field cron expression; delete it with deleteFunctionTrigger. `publishVersion` aligns with `tcb fn publish-version` / SDK publishVersion; `updateFunctionAliasConfig` aligns with `tcb fn config-route` / SDK updateFunctionAliasConfig and defaults `aliasName` to `$DEFAULT`. HTTP Function deployment uses func.buildStrategy: image deploys an existing image; local and cloud run the image build/deploy orchestration. Real local/cloud deployment requires dryRun=false and confirm=true. With wait=false it returns a taskId immediately; callers must poll queryFunctions/getFunctionDeployStatus until succeeded or failed. Local always requires local MCP; cloud requires local build context for real execution; Cloud Mode supports cloud dry-run and image only. Omitting buildStrategy, or setting it to zip, uses a traditional code package. Dangerous operations require confirm=true.

**Personal-edition TCR credentials**: local/cloud builds with imageType=personal require push credentials. Prefer `TCB_TCR_USERNAME` and `TCB_TCR_PASSWORD` in the MCP configuration's `env`; do not pass plaintext passwords in tool parameters. This environment-variable path works only with local stdio MCP clients that allow custom `env` values. For IDE-bundled MCP clients without that channel, use enterprise TCR or deploy an already-pushed image with buildStrategy=image.

**Enterprise-edition login requirement**: enterprise cloud/local builds mint temporary TCR credentials through CAM. Environment-level API Keys and OAuth temporary credentials do not carry CAM policies and are rejected before the build; use account-level credentials or image deployment. Personal-edition builds use a static registry password and do not call CAM.

**Layers**: layers use an account-level shared namespace. Use names in the form `&#123;layerName&#125;_&#123;currentEnvId&#125;`, check for duplicates with listLayers, and remember that deleting a layer version affects functions in every environment bound to it.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Write operation type, including function creation, updates, invocation, timer triggers, layer management, version publishing, and alias/traffic routing. Allowed values: "createFunction", "updateFunctionCode", "updateFunctionConfig", "invokeFunction", "deleteFunction", "createFunctionTrigger", "deleteFunctionTrigger", "createLayerVersion", "deleteLayerVersion", "attachLayer", "detachLayer", "updateFunctionLayers", "publishVersion", "updateFunctionAliasConfig", "incrementalDeployFunction"</td></tr>
<tr><td><code>func</code></td><td>object</td><td></td><td>Function configuration for createFunction operation</td></tr>
<tr><td><code>func.name</code></td><td>string</td><td>Yes</td><td>Function name</td></tr>
<tr><td><code>func.type</code></td><td>string</td><td></td><td>Function type. Allowed values: "Event", "HTTP"</td></tr>
<tr><td><code>func.protocolType</code></td><td>string</td><td></td><td>HTTP cloud function protocol type. Allowed values: "HTTP", "WS"</td></tr>
<tr><td><code>func.protocolParams</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>func.protocolParams.wsParams</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>func.protocolParams.wsParams.idleTimeOut</code></td><td>number</td><td></td><td>WebSocket idle timeout (seconds)</td></tr>
<tr><td><code>func.instanceConcurrencyConfig</code></td><td>object</td><td></td><td></td></tr>
<tr><td><code>func.instanceConcurrencyConfig.dynamicEnabled</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>func.instanceConcurrencyConfig.maxConcurrency</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>func.timeout</code></td><td>number</td><td></td><td>Function timeout</td></tr>
<tr><td><code>func.envVariables</code></td><td>object</td><td></td><td>Environment variables</td></tr>
<tr><td><code>func.vpc</code></td><td>object</td><td></td><td>VPC configuration</td></tr>
<tr><td><code>func.vpc.vpcId</code></td><td>string</td><td>Yes</td><td></td></tr>
<tr><td><code>func.vpc.subnetId</code></td><td>string</td><td>Yes</td><td></td></tr>
<tr><td><code>func.runtime</code></td><td>string</td><td></td><td>Runtime environment. Event functions support multiple runtimes:<br/>  Nodejs: Nodejs24.11(Beta), Nodejs22.21(Beta), Nodejs20.19, Nodejs18.15, Nodejs16.13<br/>  Python: Python3.11, Python3.10, Python3.9, Python3.7<br/>  Php: Php8.0, Php7.4<br/>  Java: Java11<br/>  Golang: Golang1<br/>Image deployment (create HTTP function from TCR image) use "CustomImage", also provide imageConfig; no functionRootPath/zipFile needed.<br/>Recommended runtimes:<br/>  Node.js: Nodejs20.19<br/>  Python: Python3.11<br/>  PHP: Php7.4<br/>  Java: Java11<br/>  Go: Golang1</td></tr>
<tr><td><code>func.imageConfig</code></td><td>object</td><td></td><td>Image deployment configuration (only used when runtime=CustomImage). Used for stage B of zip→COS→CloudApp custom build→TCR→SCF: creating an HTTP function from a TCR image. Once imageConfig is passed, the function is treated as image-deployed and requires no local code packaging, scf_bootstrap, or Handler.</td></tr>
<tr><td><code>func.imageConfig.imageType</code></td><td>string</td><td></td><td>Image registry type: enterprise (Enterprise TCR) or personal (Personal TCR). Defaults to enterprise when omitted. Allowed values: "enterprise", "personal"</td></tr>
<tr><td><code>func.imageConfig.imageUri</code></td><td>string</td><td>Yes</td><td>Full image address (must include tag), format &#123;domain&#125;/&#123;namespace&#125;/&#123;image&#125;:&#123;tag&#125;, e.g., ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001. Do not use :latest.</td></tr>
<tr><td><code>func.imageConfig.registryId</code></td><td>string</td><td></td><td>TCR instance ID, e.g., tcr-xxxxxxxx. Required when imageType=enterprise.</td></tr>
<tr><td><code>func.imageConfig.command</code></td><td>string</td><td></td><td>Override image ENTRYPOINT. Uses Dockerfile default if not provided, e.g., python.</td></tr>
<tr><td><code>func.imageConfig.args</code></td><td>string</td><td></td><td>Override image CMD, space-separated, e.g., -u app.py.</td></tr>
<tr><td><code>func.imageConfig.entryPoint</code></td><td>string</td><td></td><td>Image entry point, generally not needed.</td></tr>
<tr><td><code>func.imageConfig.imagePort</code></td><td>number</td><td></td><td>Container listening port. Web Server functions use 9000 (default), Job-type images use -1.</td></tr>
<tr><td><code>func.imageConfig.containerImageAccelerate</code></td><td>boolean</td><td></td><td>Whether to enable image acceleration. Recommended for large images to reduce cold start time.</td></tr>
<tr><td><code>func.triggers</code></td><td>array of object</td><td></td><td>Trigger configuration array</td></tr>
<tr><td><code>func.triggers[].name</code></td><td>string</td><td>Yes</td><td>Trigger name</td></tr>
<tr><td><code>func.triggers[].type</code></td><td>string</td><td>Yes</td><td>Trigger type. Allowed values: "timer"</td></tr>
<tr><td><code>func.triggers[].config</code></td><td>string</td><td>Yes</td><td>Trigger configuration, timer uses 7-segment cron: second minute hour day month week year</td></tr>
<tr><td><code>func.handler</code></td><td>string</td><td></td><td>Function entry point</td></tr>
<tr><td><code>func.ignore</code></td><td>string | array of string</td><td></td><td>Ignored files</td></tr>
<tr><td><code>func.isWaitInstall</code></td><td>boolean</td><td></td><td>Whether to wait for dependency installation</td></tr>
<tr><td><code>func.layers</code></td><td>array of object</td><td></td><td>Layer configuration</td></tr>
<tr><td><code>func.layers[].name</code></td><td>string</td><td>Yes</td><td></td></tr>
<tr><td><code>func.layers[].version</code></td><td>number</td><td>Yes</td><td></td></tr>
<tr><td><code>functionRootPath</code></td><td>string</td><td></td><td>Function root directory (parent directory absolute path)</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>Whether to overwrite when createFunction</td></tr>
<tr><td><code>functionName</code></td><td>string</td><td></td><td>Top-level target function name. updateFunctionCode, updateFunctionConfig, invokeFunction, publishVersion, updateFunctionAliasConfig, and similar actions use this field. createFunction uses func.name. If func.name is provided by mistake, it is also recognized as functionName.</td></tr>
<tr><td><code>zipFile</code></td><td>string</td><td></td><td>Base64-encoded code package, retained only for special cases. For normal createFunction and updateFunctionCode operations, do not pre-compress a ZIP by default; prefer functionRootPath.</td></tr>
<tr><td><code>code</code></td><td>object</td><td></td><td>Stage B of two-stage ZIP deployment: the code package has already been uploaded to the environment COS bucket through queryFunctions action=getFunctionUploadUrl. Pass the returned cosBucketName, cosObjectName, and cosBucketRegion values unchanged. When code is provided, createFunction and updateFunctionCode no longer read a local directory, so functionRootPath and zipFile are unnecessary. Cloud-side dependency installation is disabled by default and can be overridden with func.installDependency. The bucket and region in the code triple must belong to this environment's own storage bucket, and the object key must have the fnzip-upload/... form returned by getFunctionUploadUrl; values assembled by hand, pointing at another bucket, or reused across environments are rejected and the caller must fetch a new URL.</td></tr>
<tr><td><code>code.cosBucketName</code></td><td>string</td><td>Yes</td><td>Environment bucket short name without the -appid suffix. Use the cosBucketName returned by getFunctionUploadUrl; do not construct it manually.</td></tr>
<tr><td><code>code.cosObjectName</code></td><td>string</td><td>Yes</td><td>Uploaded object key. Use the cosObjectName returned by getFunctionUploadUrl.</td></tr>
<tr><td><code>code.cosBucketRegion</code></td><td>string</td><td></td><td>Bucket region. If omitted, the current environment bucket region is used automatically.</td></tr>
<tr><td><code>handler</code></td><td>string</td><td></td><td>Function entry point</td></tr>
<tr><td><code>timeout</code></td><td>number</td><td></td><td>Timeout for config update</td></tr>
<tr><td><code>envVariables</code></td><td>object</td><td></td><td>Environment variables to merge for config update</td></tr>
<tr><td><code>vpc</code></td><td>unknown</td><td></td><td>VPC info for config update</td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td>Invocation parameters for invokeFunction</td></tr>
<tr><td><code>triggers</code></td><td>array of unknown</td><td></td><td>Trigger list for createFunctionTrigger</td></tr>
<tr><td><code>triggerName</code></td><td>string</td><td></td><td>Target trigger name for deleteFunctionTrigger</td></tr>
<tr><td><code>layerName</code></td><td>string</td><td></td><td>Layer name</td></tr>
<tr><td><code>layerVersion</code></td><td>number</td><td></td><td>Layer version number</td></tr>
<tr><td><code>contentPath</code></td><td>string</td><td></td><td>Layer content path, can be directory or ZIP file</td></tr>
<tr><td><code>base64Content</code></td><td>string</td><td></td><td>Layer content base64 encoding</td></tr>
<tr><td><code>runtimes</code></td><td>array of string</td><td></td><td>List of runtimes the layer applies to</td></tr>
<tr><td><code>description</code></td><td>string</td><td></td><td>Description. For createLayerVersion it describes the layer version; for publishVersion / updateFunctionAliasConfig it describes the function version or alias</td></tr>
<tr><td><code>licenseInfo</code></td><td>string</td><td></td><td>Layer license information</td></tr>
<tr><td><code>layers</code></td><td>array of object</td><td></td><td>Target layer list for updateFunctionLayers, order is final order</td></tr>
<tr><td><code>layers[].layerName</code></td><td>string</td><td>Yes</td><td>Layer name</td></tr>
<tr><td><code>layers[].layerVersion</code></td><td>number</td><td>Yes</td><td>Layer version number</td></tr>
<tr><td><code>codeSecret</code></td><td>string</td><td></td><td>Code protection secret for layer binding</td></tr>
<tr><td><code>imageConfig</code></td><td>unknown</td><td></td><td>Image deployment configuration (Runtime=CustomImage). Used with createFunction to create an HTTP function from a TCR image, or with updateFunctionCode to swap image tags only. Requires imageUri (with tag); enterprise TCR also requires registryId. Can also be provided in func.imageConfig; when both are passed, the top-level imageConfig takes precedence.</td></tr>
<tr><td><code>incrementalFile</code></td><td>string</td><td></td><td>File path for incrementalDeployFunction incremental deployment</td></tr>
<tr><td><code>aliasName</code></td><td>string</td><td></td><td>Alias name for updateFunctionAliasConfig. Defaults to `$DEFAULT`, consistent with `tcb fn config-route`</td></tr>
<tr><td><code>functionVersion</code></td><td>string</td><td></td><td>Primary version for updateFunctionAliasConfig. May be a concrete version number or `$LATEST`</td></tr>
<tr><td><code>routingConfig</code></td><td>object</td><td></td><td>Traffic-routing configuration for updateFunctionAliasConfig. AdditionalVersionWeights defines canary weights; AddtionVersionMatchs is the historical SCF/SDK field name, including its spelling</td></tr>
<tr><td><code>routingConfig.AdditionalVersionWeights</code></td><td>array of object</td><td></td><td>Additional version weights for canary rollout</td></tr>
<tr><td><code>routingConfig.AdditionalVersionWeights[].Version</code></td><td>string</td><td>yes</td><td>Additional traffic version number</td></tr>
<tr><td><code>routingConfig.AdditionalVersionWeights[].Weight</code></td><td>number</td><td>yes</td><td>Additional traffic weight (0–1 or a percentage, following SCF conventions)</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs</code></td><td>array of object</td><td></td><td>Additional version match rules; field name preserved as SCF AddtionVersionMatchs</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs[].Version</code></td><td>string</td><td>yes</td><td>Version targeted by the match rule</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs[].Key</code></td><td>string</td><td>yes</td><td>Header or query key used by the rule</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs[].Method</code></td><td>string</td><td>yes</td><td>Match method, such as Exact or Regex</td></tr>
<tr><td><code>routingConfig.AddtionVersionMatchs[].Expression</code></td><td>string</td><td>yes</td><td>Match expression</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Dangerous operation confirmation switch</td></tr>
</tbody>
</table>

---

### `queryHosting`
Query read-only information about CloudBase static hosting. Suitable for AI discovery before deciding next steps: action=websiteConfig queries index/error page, routing rules and site domain info; action=status queries hosting service status; action=findFiles finds files by prefix; action=listFiles lists all hosted files; action=domainStatus queries the current status and config of custom domains. This tool has no side effects.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Query type: websiteConfig=query static hosting website document config and site domain info, status=query static hosting service status, findFiles=find hosted files by prefix, listFiles=list all files in static hosting, domainStatus=query custom domain config and effective status. This tool is strictly read-only and does not modify any resources. Allowed values: "websiteConfig", "status", "findFiles", "listFiles", "domainStatus"</td></tr>
<tr><td><code>prefix</code></td><td>string</td><td></td><td>File prefix filter. Only used when action=findFiles, e.g. app/ or assets/logo</td></tr>
<tr><td><code>marker</code></td><td>string</td><td></td><td>Pagination start marker. Only used when action=findFiles, to continue fetching results after the previous page</td></tr>
<tr><td><code>maxKeys</code></td><td>integer</td><td></td><td>Max file entries returned per call. Only used when action=findFiles</td></tr>
<tr><td><code>domains</code></td><td>array of string</td><td></td><td>Custom domain list to query. Only used when action=domainStatus, e.g. ["www.example.com"]</td></tr>
</tbody>
</table>

---

### `manageHosting`
Manage change operations for CloudBase static hosting. action=upload uploads local build artifacts to the shared domain (domain format: &lt;envId&gt;-&lt;appId&gt;.tcloudbaseapp.com/&lt;cloudPath&gt;); action=delete deletes hosted files or directories (must confirm=true); action=setWebsiteDocument sets index/error pages and routing rules; action=enableService enables static hosting; action=bindDomain / unbindDomain / updateDomain manage custom domains; action=downloadFile / downloadDirectory download hosted content to local. ⚠️ For new project deployments, prefer manageApps (deploys to an independent subdomain); this tool is for existing legacy projects or as a fallback for manageApps. manageApps and manageHosting use different domains; switching will break old links. If the task only needs to view config, files, or domain status, use queryHosting instead.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Management type: upload=upload local build artifacts to static hosting, delete=delete hosted files or directories, setWebsiteDocument=set index/error pages and routing rules, enableService=enable static hosting service, bindDomain=bind a custom domain, unbindDomain=unbind a custom domain, updateDomain=update domain cache/anti-leech/IP rules, downloadFile=download a single hosted file locally, downloadDirectory=download a hosted directory locally. Allowed values: "upload", "delete", "setWebsiteDocument", "enableService", "bindDomain", "unbindDomain", "updateDomain", "downloadFile", "downloadDirectory"</td></tr>
<tr><td><code>localPath</code></td><td>string</td><td></td><td>Local path. For action=upload, the local file/directory path to upload; for action=downloadFile or downloadDirectory, the local destination path. Absolute paths recommended</td></tr>
<tr><td><code>cloudPath</code></td><td>string</td><td></td><td>Target path in static hosting. For action=upload, the hosted path after upload; for action=delete/downloadFile/downloadDirectory, the hosted file or directory path</td></tr>
<tr><td><code>files</code></td><td>array of object</td><td></td><td>Multi-file upload config. Optional when action=upload; when passed, each file is uploaded individually and single localPath/cloudPath is not used</td></tr>
<tr><td><code>ignore</code></td><td>union</td><td></td><td>File patterns to ignore when uploading. Optional when action=upload, e.g. node_modules or ["**/*.map", "**/.DS_Store"]</td></tr>
<tr><td><code>isDir</code></td><td>boolean</td><td></td><td>Whether to treat cloudPath as a directory. Only used when action=delete; true=delete directory, false=delete a single file</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Confirmation switch for high-risk operations. Must be explicitly true for action=delete and action=unbindDomain to avoid accidental file deletion or domain unbinding</td></tr>
<tr><td><code>indexDocument</code></td><td>string</td><td></td><td>Website index document name. Required only when action=setWebsiteDocument, e.g. index.html</td></tr>
<tr><td><code>errorDocument</code></td><td>string</td><td></td><td>Error page document name. Optional when action=setWebsiteDocument, e.g. 404.html</td></tr>
<tr><td><code>routingRules</code></td><td>array of object</td><td></td><td>Website routing rule list. Optional when action=setWebsiteDocument. A common SPA config rewrites 404 to index.html</td></tr>
<tr><td><code>domain</code></td><td>string</td><td></td><td>Custom domain. Used for action=bindDomain / unbindDomain / updateDomain, e.g. www.example.com</td></tr>
<tr><td><code>certId</code></td><td>string</td><td></td><td>Certificate ID. Required only when action=bindDomain</td></tr>
<tr><td><code>domainId</code></td><td>number</td><td></td><td>Domain ID. Required only when action=updateDomain, for precisely updating the specified domain config</td></tr>
<tr><td><code>domainConfig</code></td><td>object</td><td></td><td>Domain config. Required only when action=updateDomain; supports cache, Referer, anti-leech, IP rules, and rate limiting</td></tr>
</tbody>
</table>

---

### `queryStorage`
Query cloud storage information, supports listing directory files, getting file information, getting temporary download links and other read-only operations. Returned file information includes file name, size, modification time, download link, etc.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Query operation type: list=list all files in directory, info=get detailed information of specified file, url=get temporary download link for file. Allowed values: "list", "info", "url", "read"</td></tr>
<tr><td><code>cloudPath</code></td><td>string</td><td>Yes</td><td>Cloud file path, e.g., files/data.txt or files/ (directory)</td></tr>
<tr><td><code>maxAge</code></td><td>number</td><td></td><td>Temporary link validity period in seconds, range: 1-86400, default: 3600 (1 hour). Default: 3600</td></tr>
</tbody>
</table>

---

### `manageStorage`
Manage cloud storage files, only for COS/Storage objects, not for static website hosting. Supports uploading files/directories, downloading files/directories, deleting files/directories and other operations. Delete operation requires setting force=true for confirmation to prevent accidental deletion of important files.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Management operation type: upload=upload file or directory, download=download file or directory, delete=delete file or directory. Allowed values: "upload", "download", "delete"</td></tr>
<tr><td><code>localPath</code></td><td>string</td><td>Yes</td><td>Local file path, absolute path recommended, e.g., /tmp/files/data.txt</td></tr>
<tr><td><code>cloudPath</code></td><td>string</td><td>Yes</td><td>Cloud file path, e.g., files/data.txt</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>Force operation switch, recommended to set to true for delete operations to confirm deletion, defaults to false. Default: false</td></tr>
<tr><td><code>isDirectory</code></td><td>boolean</td><td></td><td>Whether directory operation, true=directory operation, false=file operation, defaults to false. Default: false</td></tr>
</tbody>
</table>

---

### `downloadTemplate`
Automatically download and deploy CloudBase project templates. ⚠️ **MANDATORY FOR NEW PROJECTS** ⚠️

**CRITICAL**: This tool MUST be called FIRST when starting a new project.

Supported templates:
- react: React + CloudBase full-stack application template
- vue: Vue + CloudBase full-stack application template
- miniprogram: WeChat Mini Program + CloudBase template
- uniapp: UniApp + CloudBase cross-platform application template
- rules: Only includes AI editor configuration files (includes all mainstream editor configurations such as Cursor, WindSurf, CodeBuddy, etc.), suitable for supplementing AI editor configuration in existing projects

Supported IDE types:
- all: Download all IDE configurations
- cursor: Cursor AI editor
- Other IDE types see list below

Note: If ide parameter is not passed and IDE cannot be detected from environment, an error will be prompted and require passing ide parameter
- windsurf: WindSurf AI editor
- codebuddy: CodeBuddy AI editor
- claude-code: Claude Code AI editor
- cline: Cline AI editor
- gemini-cli: Gemini CLI
- opencode: OpenCode AI editor
- qwen-code: Tongyi Lingma
- baidu-comate: Baidu Comate
- openai-codex-cli: OpenAI Codex CLI
- augment-code: Augment Code
- github-copilot: GitHub Copilot
- roocode: RooCode AI editor
- tongyi-lingma: Tongyi Lingma
- trae: Trae AI editor
- qoder: Qoder AI editor
- antigravity: Google Antigravity AI editor
- vscode: Visual Studio Code
- kiro: Kiro AI editor
- aider: Aider AI editor

Special notes:
- rules template will automatically include current MCP version information, which helps with later maintenance and version tracking
- When downloading rules template, if README.md file already exists in the project, the system will automatically protect the file from being overwritten (unless overwrite=true is set)

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>template</code></td><td>string</td><td>Yes</td><td>Template type to download. Allowed values: "react", "vue", "miniprogram", "uniapp", "rules"</td></tr>
<tr><td><code>ide</code></td><td>string</td><td>Yes</td><td>Specify the IDE type to download. Allowed values: "all", "cursor", "windsurf", "codebuddy", "claude-code", "cline", "gemini-cli", "opencode", "qwen-code", "baidu-comate", "openai-codex-cli", "augment-code", "github-copilot", "roocode", "tongyi-lingma", "trae", "qoder", "antigravity", "vscode", "kiro", "aider", "iflow-cli"</td></tr>
<tr><td><code>overwrite</code></td><td>boolean</td><td></td><td>Whether to overwrite existing files, defaults to false (no overwrite)</td></tr>
</tbody>
</table>

---

### `searchKnowledgeBase`
CloudBase knowledge base search tool. It supports CloudBase official documentation (`docs`), curated skill documents (`skill`), and OpenAPI documents (`openapi`).

      Choose the mode by scenario:
      - If a tool error contains a specific error code such as OperationDenied.FreePackageDenied, use mode=docs + action=searchDocs with the error code as query. Read the official meaning and remediation before acting; do not retry by guesswork.
      - If you do not know where the answer is, or need full-text search across official documentation, use mode=docs + action=searchDocs with query keywords.
      - If you know the document title, hierarchy path, or URL, use mode=docs + action=findByName with input, or action=readDoc with docPath.
      - For a scenario-specific implementation guide or best practice, use mode=skill + skillName.
      - For an HTTP API definition, use mode=openapi + apiName.

      ⚠️ Important: when CloudBase skills are disabled or the current IDE cannot read skill files, use searchKnowledgeBase(mode=skill, skillName=...) to retrieve the CloudBase skill documentation. Do not try to read the skill file directly; that may return a 400 error. Examples:
      - Minimal Web + database demo: searchKnowledgeBase(mode=skill, skillName=minimal-web-baas-demo)
      - Authentication configuration guide: searchKnowledgeBase(mode=skill, skillName=auth-tool-cloudbase)
      - Web authentication guide: searchKnowledgeBase(mode=skill, skillName=auth-web-cloudbase)
      - CloudBase Agent guide: searchKnowledgeBase(mode=skill, skillName=cloudbase-agent)
      - MCP connection modes (local / remote), calling tools from the shell with mcporter, or the site / plugin switches: searchKnowledgeBase(mode=skill, skillName=cloudbase-mcp)

      The response contains the full SKILL.md of that skill plus the address list of every .md file for it in the remote aggregation repo (CNB raw) — SKILL.md, references/, and so on, directly fetchable over HTTP. Relative links outside code fences in the body are also rewritten to absolute addresses; if the skill does not exist in the remote repo, only the inline content is returned, clearly marked, and no dead links are returned.

      If you are unsure which document to choose, call mode=skill without skillName or mode=openapi without apiName. The tool returns the available items and a short description of when to use each one; then call it again with the selected name. The `skillName` and `apiName` enums below contain the same choices (33 skills and 8 APIs).

      OpenAPI queries need only mode="openapi" and apiName. Do not pass action; action is used only with mode="docs".

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>mode</code></td><td>string</td><td>Yes</td><td>Allowed values: "skill", "openapi", "docs"</td></tr>
<tr><td><code>skillName</code></td><td>string</td><td></td><td>Specify when mode=skill. Skill name. Allowed values: "cloudbase-all-in-one", "ai-model-nodejs", "ai-model-web", "ai-model-wechat", "auth-nodejs-cloudbase", "auth-tool-cloudbase", "auth-web-cloudbase", "auth-wechat-miniprogram", "cloud-api-operations", "cloud-functions", "cloud-storage-web", "cloudbase-agent", "cloudbase-cli", "cloudbase-code-review", "cloudbase-declarative-deploy", "cloudbase-document-database-in-wechat-miniprogram", "cloudbase-document-database-web-sdk", "cloudbase-mcp", "cloudbase-platform", "cloudbase-wechat-integration", "cloudrun-development", "http-api-cloudbase", "minimal-web-baas-demo", "miniprogram-development", "ops-inspector", "postgresql-best-practices-cloudbase", "postgresql-development-cloudbase", "relational-database-mcp-cloudbase", "relational-database-web-cloudbase", "spec-workflow", "ui-design", "web-development"</td></tr>
<tr><td><code>apiName</code></td><td>string</td><td></td><td>Specify when mode=openapi. API name. Allowed values: "mysqldb", "pgdb", "functions", "auth", "cloudrun", "storage", "nosql", "ai_model"</td></tr>
<tr><td><code>action</code></td><td>string</td><td></td><td>Specify when mode=docs. CloudBase documentation operation type: listModules=list all documentation modules, listModuleDocs=get directory structure of specified module, findByName=smart search by name/path/URL, readDoc=read specified documentation Markdown, searchDocs=full-text search official documentation. Allowed values: "listModules", "listModuleDocs", "findByName", "readDoc", "searchDocs"</td></tr>
<tr><td><code>moduleName</code></td><td>string</td><td></td><td>Specify when mode=docs and action=listModuleDocs. Module name.</td></tr>
<tr><td><code>input</code></td><td>string</td><td></td><td>Specify when mode=docs and action=findByName. Supports module name, document title, hierarchy path or URL.</td></tr>
<tr><td><code>docPath</code></td><td>string</td><td></td><td>Specify when mode=docs and action=readDoc. Pass a site-relative path such as /quick-start, or a document URL returned by findByName / searchDocs. When a URL is provided, only its path is used and the hostname is ignored.</td></tr>
<tr><td><code>query</code></td><td>string</td><td></td><td>Specify when mode=docs and action=searchDocs. Full-text search keywords.</td></tr>

</tbody>
</table>

---

### `queryCloudRun`
Query CloudBase Run service information, including service lists, service details, available templates, build logs (`getDeployLog`, cloud source builds only and dependent on CODING), process logs (`getProcessLog`, available for image and source deployments without CODING), deployment records, and environment enablement status (`envStatus`). Results include service name, status, access type, configuration details, and recent deployment context.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Query operation type: list=get the CloudBase Run service list; detail=get service details and latest deployment status; templates=get project templates; getDeployLog=get source-build logs through CODING/DescribeCloudRunBuildLog; getProcessLog=get deployment-stage and container runtime logs through tcbr/DescribeCloudRunProcessLog; getDeployRecords=list deployment records newest first; envStatus=query whether CloudBase Run is enabled for the environment; getManageTask=query a service release task through tcbr/DescribeServerManageTask, returning task Id/Status and the latest deployment state to determine whether a deployment is progressing or stuck. When a deployment reports that another release task is running, use getManageTask before retrying. Allowed values: "list", "detail", "templates", "getDeployLog", "getProcessLog", "getDeployRecords", "envStatus", "getManageTask"</td></tr>
<tr><td><code>pageSize</code></td><td>number</td><td></td><td>Page size, controls number of services returned per page. Range: 1-100, default: 10. Adjust based on network performance and display requirements. Default: 10</td></tr>
<tr><td><code>pageNum</code></td><td>number</td><td></td><td>Page number, for paginated queries. Starts from 1, default: 1. Use with pageSize for paginated browsing. Default: 1</td></tr>
<tr><td><code>serverName</code></td><td>string</td><td></td><td>Service name filter condition, supports fuzzy matching. E.g., entering "test" matches "test-service", "my-test-app", etc. Leave empty to query all services</td></tr>
<tr><td><code>serverType</code></td><td>string</td><td></td><td>Service type filter condition: function=function-type CloudBase Run (Node.js only, with specialized development requirements), container=container service (recommended; supports Java, Go, Python, PHP, .NET, and other languages/frameworks). Allowed values: "function", "container"</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Environment ID used by action=envStatus. Uses the currently configured environment when omitted; format such as env-xxxxxx</td></tr>
<tr><td><code>detailServerName</code></td><td>string</td><td></td><td>Service name for detail, deployment records, build logs, process logs, or release-task status. Use an existing name returned by list</td></tr>
<tr><td><code>buildId</code></td><td>number</td><td></td><td>Build ID used only by action=getDeployLog for cloud source builds. Defaults to the latest deployment build when omitted</td></tr>
<tr><td><code>runId</code></td><td>string</td><td></td><td>RunId used only by action=getProcessLog. Defaults to the latest deployment record's RunId, shared with detail/getDeployRecords. Process logs are available for image and source deployments</td></tr>
<tr><td><code>revealEnvParams</code></td><td>boolean</td><td></td><td>Whether action=detail returns plaintext ServerConfig.EnvParams values. Defaults to false and masks values as "***" while retaining keys. When true, sensitive values such as password-bearing DATABASE_URL values may enter the model context; use with care</td></tr>
</tbody>
</table>

---

### `manageCloudRun`
Manage CloudBase Run services in development order: enable CloudBase Run for the environment (`initEnv`), initialize a project from a template, download service code, run it locally (function services only), deploy code, update configuration without re-uploading code (`updateConfig`), and delete a service. `deploy` supports source builds through `targetPath` and existing-image deployment through `imageUrl`. It triggers deployment and waits briefly for task registration (up to about 45 seconds); set `waitRegistration=false` when no buildId is needed. Source builds return a buildId for getDeployLog, followed by getProcessLog. Image deployments commonly have BuildId 0; skip getDeployLog and use the returned runId/next_step or getDeployRecords before getProcessLog. When image deployment is requested, pass imageUrl rather than falling back to source merely because local source exists. Existing services use read-merge-write to preserve VpcConf, EnvParams, and OpenAccessTypes. `updateConfig` aligns with the console's service settings. Deletion requires confirmation; `force=true` is recommended. For a new environment, call the asynchronous, idempotent initEnv before the first deployment when CloudBase Run is not enabled. Before deploying, make sure the image carries no static content: media files (video, large images, fonts), user uploads, and frequently updated static assets belong in cloud storage, referenced by URL. Otherwise every deployment repushes everything and every scaled instance re-pulls it — a single demo video can turn a 30-second deploy into minutes.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>CloudBase Run management operation: init=initialize project code; download=download service code; run=run a function service locally; deploy=trigger deployment and briefly wait for task registration; updateConfig=update service configuration without uploading code; delete=delete a service; createAgent=create a function-type Agent; initEnv=enable CloudBase Run for the current environment; traffic=manage canary traffic with set/promote/rollback. Allowed values: "init", "download", "run", "deploy", "delete", "createAgent", "updateConfig", "initEnv", "traffic"</td></tr>
<tr><td><code>serverName</code></td><td>string</td><td></td><td>CloudBase Run service name. It becomes the subdirectory name for init and identifies the target service for other actions. Not required for initEnv</td></tr>
<tr><td><code>targetPath</code></td><td>string</td><td></td><td>Local code path, must be absolute path. In deploy operation specifies code directory to deploy, in download operation specifies download target directory, in init operation specifies CloudRun service parent directory (will create subdirectory named serverName under this directory). Recommended convention: cloudrun/ directory under project root, e.g., /Users/username/projects/my-project/cloudrun</td></tr>
<tr><td><code>serverConfig</code></td><td>object</td><td></td><td>Service configuration items, used to set service runtime parameters during deployment. Includes resource specs, access permissions, environment variables and other configuration. Uses default configuration if not provided</td></tr>
<tr><td><code>serverConfig.OpenAccessTypes</code></td><td>array of string</td><td></td><td>Public network access type configuration, controls service access permissions: OA=office network access, PUBLIC=public network access (default, accessible via HTTPS domain), MINIAPP=mini program access, VPC=VPC access (only accessible within same VPC). Can configure multiple types</td></tr>
<tr><td><code>serverConfig.Cpu</code></td><td>number</td><td></td><td>CPU spec configuration, unit is cores. Options: 0.25, 0.5, 1, 2, 4, 8, etc. Note: Memory spec must be 2x CPU spec (e.g., CPU=0.25 then memory=0.5, CPU=1 then memory=2). Affects service performance and billing</td></tr>
<tr><td><code>serverConfig.Mem</code></td><td>number</td><td></td><td>Memory spec configuration, unit is GB. Options: 0.5, 1, 2, 4, 8, 16, etc. Note: Must be 2x CPU spec. Affects service performance and billing</td></tr>
<tr><td><code>serverConfig.MinNum</code></td><td>number</td><td></td><td>Minimum instance count configuration, controls minimum number of running service instances. Setting to 0 enables scale-to-zero (no cost when no requests), setting > 0 always keeps specified number of instances running (ensures fast response but increases cost). Recommended to set to 1 to reduce cold start latency and improve user experience</td></tr>
<tr><td><code>serverConfig.MaxNum</code></td><td>number</td><td></td><td>Maximum instance count configuration, controls maximum number of running service instances. When request volume increases, service can scale up to specified number of instances, beyond which new requests will be rejected. Recommended to set based on business peak</td></tr>
<tr><td><code>serverConfig.PolicyDetails</code></td><td>array of object</td><td></td><td>Scaling configuration array, used to configure service auto-scaling policies. Can configure multiple scaling policies</td></tr>
<tr><td><code>serverConfig.PolicyDetails[].PolicyType</code></td><td>string</td><td>Yes</td><td>Scaling type: cpu=CPU utilization-based scaling, mem=memory utilization-based scaling, cpu/mem=CPU and memory utilization-based scaling. Allowed values: "cpu", "mem", "cpu/mem"</td></tr>
<tr><td><code>serverConfig.PolicyDetails[].PolicyThreshold</code></td><td>number</td><td>Yes</td><td>Scaling threshold, unit is percentage. E.g., 60 means trigger scaling when resource utilization reaches 60%</td></tr>
<tr><td><code>serverConfig.CustomLogs</code></td><td>string</td><td></td><td>Custom log configuration, used to configure service log collection and storage policies</td></tr>
<tr><td><code>serverConfig.Port</code></td><td>number</td><td></td><td>Service listening port. Function-type services use port 3000 through the function framework; application code must not call app.listen itself. Container services can use a custom port, and application code must listen on that port</td></tr>
<tr><td><code>serverConfig.EnvParams</code></td><td>string</td><td></td><td>Environment variable configuration, JSON string format. Used to pass configuration information to service code, e.g., <code>'&#123;"DATABASE_URL":"mysql://...","NODE_ENV":"production"&#125;'</code>. Sensitive information is recommended to use environment variables rather than hardcoding</td></tr>
<tr><td><code>serverConfig.Dockerfile</code></td><td>string</td><td></td><td>Dockerfile filename configuration, only required for container-type services. Specifies the Dockerfile file path for building container images, defaults to Dockerfile in project root</td></tr>
<tr><td><code>serverConfig.BuildDir</code></td><td>string</td><td></td><td>Build directory configuration, specifies the directory path for code building. Used when code structure differs from standard, defaults to project root</td></tr>
<tr><td><code>serverConfig.InternalAccess</code></td><td>string</td><td></td><td>Internal network access switch configuration, controls whether to enable internal network access. true=enable internal network access (can be called directly via CloudBase SDK), false=disable internal network access (public network access only)</td></tr>
<tr><td><code>serverConfig.InternalDomain</code></td><td>string</td><td></td><td>Internal network domain configuration, used to configure service internal network access domain. Only effective when internal network access is enabled</td></tr>
<tr><td><code>serverConfig.EntryPoint</code></td><td>array of string</td><td></td><td>Dockerfile EntryPoint parameter configuration, only required for container-type services. Specifies entry program array when container starts, e.g., <code>["node","app.js"]</code></td></tr>
<tr><td><code>serverConfig.Cmd</code></td><td>array of string</td><td></td><td>Dockerfile Cmd parameter configuration, only required for container-type services. Specifies default command array when container starts, e.g., <code>["npm","start"]</code></td></tr>
<tr><td><code>template</code></td><td>string</td><td></td><td>Project template identifier, used to specify template for project initialization. Available template list can be obtained via queryCloudRun templates operation. Common templates: helloworld=Hello World example, nodejs=Node.js project template, python=Python project template, etc. Default: "helloworld"</td></tr>
<tr><td><code>runOptions</code></td><td>object</td><td></td><td>Local run parameter configuration, only supports function-type CloudRun services. Used to configure local development environment run parameters, does not affect cloud deployment</td></tr>
<tr><td><code>runOptions.port</code></td><td>number</td><td></td><td>Local run port configuration, only effective for function-type services. Specifies the port number for service to listen on locally, default 3000. Ensure port is not occupied by other programs. Default: 3000</td></tr>
<tr><td><code>runOptions.envParams</code></td><td>object</td><td></td><td>Additional environment variable configuration for local run, used for local development and debugging. Format is key-value pairs, e.g., <code>&#123;"DEBUG":"true","LOG_LEVEL":"debug"&#125;</code>. These variables only take effect when running locally</td></tr>
<tr><td><code>runOptions.runMode</code></td><td>string</td><td></td><td>Run mode: normal=normal function mode, agent=Agent mode (for AI agent development). Allowed values: "normal", "agent"; Default: "normal"</td></tr>
<tr><td><code>runOptions.agentId</code></td><td>string</td><td></td><td>Agent ID, used in agent mode to identify specific Agent instance</td></tr>
<tr><td><code>agentConfig</code></td><td>object</td><td></td><td>Agent configuration items, only used in createAgent operation</td></tr>
<tr><td><code>agentConfig.agentName</code></td><td>string</td><td>Yes</td><td>Agent name, used to generate BotId</td></tr>
<tr><td><code>agentConfig.botTag</code></td><td>string</td><td></td><td>Bot tag, used to generate BotId, auto-generated if not provided</td></tr>
<tr><td><code>agentConfig.description</code></td><td>string</td><td></td><td>Agent description information</td></tr>
<tr><td><code>agentConfig.template</code></td><td>string</td><td></td><td>Agent template type, defaults to blank (blank template). Default: "blank"</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td></td><td>Force operation switch, used to skip confirmation prompts. Defaults to false (requires confirmation), set to true to skip all confirmation steps. Strongly recommended to set to true for delete operations to avoid accidental operations. Default: false</td></tr>
<tr><td><code>serverType</code></td><td>string</td><td></td><td>Service type: function=Node.js function service for simple APIs; container=recommended container service supporting Java, Go, Python, PHP, .NET, and other languages/frameworks. If omitted, MCP detects: 1) existing service type, 2) Dockerfile → container, 3) @cloudbase/aiagent-framework dependency → function, 4) otherwise → container. Allowed values: "function", "container"</td></tr>
<tr><td><code>waitRegistration</code></td><td>boolean</td><td></td><td>Whether deploy waits for the platform to register the release, default true, for up to about 45 seconds. Waiting obtains identifiers needed for later queries (BuildId for source builds or RunId for image deployment). When false, perform one probe and return immediately; use it when buildId is unnecessary and task status will be queried later</td></tr>
</tbody>
</table>

---

### `deployBuild`
Parses cloudbaserc and runs a local build for projects that declare `buildCommand` in `hosting[]` (it only executes `buildCommand` — it does not install dependencies and does not upload). Equivalent to the CLI's `tcb app build`, but it only handles `hosting[]` static hosting entries and is unrelated to the cloudbaserc `app` resource type (cloud build pipeline). Declarative hosting deployment is split into three steps — build → plan → apply — and this tool is the first step: build artifacts locally, then dry-run with deployPlan, and finally upload the artifacts with deployApply. deployApply no longer builds locally implicitly — hosting entries with a build command error out when artifacts are missing and point you here first. Pure static hosting (no `buildCommand` configured and no detectable framework) is skipped automatically. The build is a purely local operation: it does not resolve an environment, does not require login, and does not need `confirm`.
- cwd: Project root directory; cloudbaserc is searched downward from here. Defaults to the current working directory
- mode: Environment name; merges the corresponding override config when it matches `envOverrides.<mode>`

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>cwd</code></td><td>string</td><td></td><td>Project root directory; cloudbaserc is searched downward from here. Defaults to the current working directory</td></tr>
<tr><td><code>mode</code></td><td>string</td><td></td><td>Environment name (e.g. production/staging); merges overrides when it matches envOverrides.&lt;mode&gt;</td></tr>
</tbody>
</table>

---

### `deployPlan`
Parses cloudbaserc and computes a declarative deployment plan (dry-run — it produces no changes). This is the dry-run counterpart to deployApply: plan computes and deployApply executes the same cloudbaserc. It returns the action classification for each resource: create=new, update=overwrite update, skip=no change / will not run, conflict=conflict detected and must abort, deploy=direct upload overwrite. The plan has already been recomputed with `yes` into "the actions that will actually happen": when `yes=true` is not passed, functions that already exist in the cloud are marked `skip` (keeping `update` in `declaredStatus`), which matches what deployApply actually executes, so the dry-run never contradicts the real run.
Applicability boundary: this tool is for project-level declarative orchestration (one cloudbaserc for plan/apply); for one-off single-resource direct uploads use manageFunctions/manageHosting/manageApps.
- cwd: Project root directory; cloudbaserc is searched downward from here. Defaults to the current working directory
- mode: Environment name; merges the corresponding override config when it matches `envOverrides.<mode>`
- envId: Target environment ID; takes precedence over the `envId` in cloudbaserc. When omitted, the configured value or the currently bound environment is used
- only: Compute the plan only for the specified resource types
- skip: Skip the specified resource types
- yes: Aligned with deployApply's `yes`, used to recompute the effective action for functions that already exist. true=dry-run as overwrite update; false (default)=dry-run as conservative skip

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>cwd</code></td><td>string</td><td></td><td>Project root directory; cloudbaserc is searched downward from here. Defaults to the current working directory</td></tr>
<tr><td><code>mode</code></td><td>string</td><td></td><td>Environment name (e.g. production/staging); merges overrides when it matches envOverrides.&lt;mode&gt;</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Target environment ID; takes precedence over the envId in cloudbaserc. When omitted, the configured value or the currently bound environment is used</td></tr>
<tr><td><code>only</code></td><td>array of string</td><td></td><td>Compute the plan only for the specified resource types. Available values: database/functions/app/hosting/gateway</td></tr>
<tr><td><code>skip</code></td><td>array of string</td><td></td><td>Skip the specified resource types. Available values: database/functions/app/hosting/gateway</td></tr>
<tr><td><code>yes</code></td><td>boolean</td><td></td><td>Aligned with deployApply's yes, used to recompute the effective action for functions that already exist. true=dry-run as overwrite update; false (default)=dry-run as conservative skip</td></tr>
</tbody>
</table>

---

### `deployApply`
Parses cloudbaserc and executes a declarative deployment in the order database→functions→app→hosting→gateway. This is the execution counterpart to deployPlan (plan dry-runs / deployApply executes the same cloudbaserc). It is a local-form apply (reads the local cloudbaserc, builds and uploads locally) and is a write operation that changes cloud resources, so it only runs when `confirm=true` is passed explicitly. Prefer running deployPlan first, then executing once the plan checks out.
Applicability boundary: this tool is for project-level declarative orchestration (one cloudbaserc for plan/apply); for one-off single-resource direct uploads use manageFunctions/manageHosting/manageApps.
- confirm: Must be explicitly passed as true for the deployment to run, otherwise it is rejected outright
- confirmDestructive: When the database migrations in this run contain destructive statements (DROP/TRUNCATE/DELETE, ALTER…DROP/RENAME), `confirmDestructive=true` must additionally be passed explicitly on top of `confirm`; otherwise it is rejected and the matching migrations and statements are listed. Has no effect when there are no destructive migrations
- cwd: Project root directory; cloudbaserc is searched downward from here. Defaults to the current working directory
- mode: Environment name; merges the corresponding override config when it matches `envOverrides.<mode>`
- envId: Target environment ID; takes precedence over the `envId` in cloudbaserc. When omitted, the configured value or the currently bound environment is used
- only: Deploy only the specified resource types
- skip: Skip the specified resource types
- yes: How to handle resources that already exist. true=overwrite and update directly; false (default)=conservatively skip, so existing resources are not overwritten in scenarios where interactive confirmation is impossible (consistent with deployPlan's `yes` semantics)
- concurrency: Maximum parallelism within a resource type, default 1 (serial)
- continueOnError: Continue deploying the remaining resources after one fails (a database failure still aborts forcibly)

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Destructive-operation confirmation switch. Deployment changes cloud resources, so confirm=true must be passed explicitly for it to run</td></tr>
<tr><td><code>confirmDestructive</code></td><td>boolean</td><td></td><td>Destructive database change confirmation switch. When the pending migrations contain DROP/TRUNCATE/DELETE or ALTER…DROP/RENAME, confirmDestructive=true must additionally be passed explicitly on top of confirm=true; no effect when there are no destructive migrations</td></tr>
<tr><td><code>cwd</code></td><td>string</td><td></td><td>Project root directory; cloudbaserc is searched downward from here. Defaults to the current working directory</td></tr>
<tr><td><code>mode</code></td><td>string</td><td></td><td>Environment name (e.g. production/staging); merges overrides when it matches envOverrides.&lt;mode&gt;</td></tr>
<tr><td><code>envId</code></td><td>string</td><td></td><td>Target environment ID; takes precedence over the envId in cloudbaserc. When omitted, the configured value or the currently bound environment is used</td></tr>
<tr><td><code>only</code></td><td>array of string</td><td></td><td>Deploy only the specified resource types. Available values: database/functions/app/hosting/gateway</td></tr>
<tr><td><code>skip</code></td><td>array of string</td><td></td><td>Skip the specified resource types. Available values: database/functions/app/hosting/gateway</td></tr>
<tr><td><code>yes</code></td><td>boolean</td><td></td><td>Whether to overwrite and update resources that already exist. true=overwrite; false (default)=conservatively skip existing resources</td></tr>
<tr><td><code>concurrency</code></td><td>integer</td><td></td><td>Maximum parallelism within a resource type, default 1 (serial); only applies within a type, cross-type dependency order is unchanged</td></tr>
<tr><td><code>continueOnError</code></td><td>boolean</td><td></td><td>Whether to continue deploying the remaining resources after one fails; a database failure always aborts forcibly</td></tr>
</tbody>
</table>

---

### `queryGateway`
Unified read-only entry for the gateway domain. Query gateway domains, access entries, and target exposure status via action.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Read-only operation type, e.g., getAccess, listDomains. Allowed values: "getAccess", "listDomains", "listRoutes", "getRoute", "listCustomDomains"</td></tr>
<tr><td><code>targetType</code></td><td>string</td><td></td><td>Target resource type. Currently supports function, extensible in future. Allowed values: "function"</td></tr>
<tr><td><code>targetName</code></td><td>string</td><td></td><td>Target resource name. Required for getAccess</td></tr>
<tr><td><code>routeId</code></td><td>string</td><td></td><td>Route ID. Optional for getRoute</td></tr>
</tbody>
</table>

---

### `manageGateway`
Unified write entry for the gateway domain. Create target access entries via action, with more general gateway configuration capabilities to follow.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Write operation type, e.g., createAccess. Allowed values: "createAccess", "createRoute", "updateRoute", "deleteRoute", "bindCustomDomain", "deleteCustomDomain", "deleteAccess", "updatePathAuth"</td></tr>
<tr><td><code>targetType</code></td><td>string</td><td></td><td>Target resource type. Currently supports function, extensible in future. Allowed values: "function"</td></tr>
<tr><td><code>targetName</code></td><td>string</td><td></td><td>Target resource name</td></tr>
<tr><td><code>path</code></td><td>string</td><td></td><td>Access path, defaults to /&#123;targetName&#125;</td></tr>
<tr><td><code>type</code></td><td>string</td><td></td><td>Target function's own type (not access form). If the accessed function is Event type (default), pass Event here; only pass HTTP when the accessed function was created as HTTP function. Allowed values: "Event", "HTTP"</td></tr>
<tr><td><code>auth</code></td><td>boolean</td><td></td><td>Whether to enable authentication</td></tr>
<tr><td><code>route</code></td><td>object</td><td></td><td>HTTP route configuration object</td></tr>
<tr><td><code>route.routeId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>route.path</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>route.serviceType</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>route.serviceName</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>route.auth</code></td><td>boolean</td><td></td><td></td></tr>
<tr><td><code>domain</code></td><td>string</td><td></td><td>Custom domain</td></tr>
<tr><td><code>certificateId</code></td><td>string</td><td></td><td>Certificate ID</td></tr>
<tr><td><code>accessName</code></td><td>string</td><td></td><td>Access entry name, reserved field</td></tr>
</tbody>
</table>

---

### `queryAppAuth`
Read-only entry for application-side authentication configuration. Used to query login methods, providers, publishable key, API key, client configuration, and static domain authentication readiness status. If the business needs to accept plain username-style identifiers, first query action=getLoginConfig; if usernamePassword=false, the next step should immediately call manageAppAuth(action=patchLoginStrategy, patch=&#123; usernamePassword: true &#125;), do not directly write email login API.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Allowed values: "getLoginConfig", "listProviders", "getProvider", "getClientConfig", "getPublishableKey", "getStaticDomain", "listApiKeys"</td></tr>
<tr><td><code>providerId</code></td><td>string</td><td></td><td>Provider identifier, e.g., email, google</td></tr>
<tr><td><code>clientId</code></td><td>string</td><td></td><td>OAuth client_id / DescribeClient Id; uses current environment ID (default client) when omitted</td></tr>
<tr><td><code>keyType</code></td><td>string</td><td></td><td>API key type filter, optional publish_key or api_key. Allowed values: "publish_key", "api_key"</td></tr>
<tr><td><code>pageNumber</code></td><td>integer</td><td></td><td>API key list page number, starts from 1</td></tr>
<tr><td><code>pageSize</code></td><td>integer</td><td></td><td>API key list items per page</td></tr>
</tbody>
</table>

---

### `manageAppAuth`
Write entry for application-side authentication configuration. Used to modify login methods, providers, client configuration, ensure publishable key, and create or delete API keys and custom login keys. If the frontend needs to accept plain username-style identifiers, first execute action=patchLoginStrategy with patch=&#123; usernamePassword: true &#125;, then implement the corresponding frontend login logic.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Allowed values: "patchLoginStrategy", "addProvider", "updateProvider", "deleteProvider", "updateClientConfig", "ensurePublishableKey", "createApiKey", "deleteApiKey", "createCustomLoginKeys"</td></tr>
<tr><td><code>patch</code></td><td>object</td><td></td><td>Simplified login strategy patch used by patchLoginStrategy, e.g., <code>&#123; usernamePassword: true &#125;</code></td></tr>
<tr><td><code>providerId</code></td><td>string</td><td></td><td>Provider identifier, e.g., email, google; for addProvider can also be used as custom provider Id</td></tr>
<tr><td><code>providerType</code></td><td>string</td><td></td><td>Provider protocol type for addProvider, e.g., OAUTH, OIDC, EMAIL</td></tr>
<tr><td><code>displayName</code></td><td>string | object</td><td></td><td>Display name for addProvider, can pass string or multilingual object</td></tr>
<tr><td><code>clientId</code></td><td>string</td><td></td><td>Client Id for updateClientConfig; uses current environment ID when omitted</td></tr>
<tr><td><code>config</code></td><td>object</td><td></td><td>Provider / client configuration object</td></tr>
<tr><td><code>keyType</code></td><td>string</td><td></td><td>API key type for createApiKey, defaults to publish_key. Allowed values: "publish_key", "api_key"</td></tr>
<tr><td><code>keyName</code></td><td>string</td><td></td><td>API key name for createApiKey</td></tr>
<tr><td><code>expireIn</code></td><td>integer</td><td></td><td>Validity period for createApiKey, unit is seconds; 0 means no expiration</td></tr>
<tr><td><code>keyId</code></td><td>string</td><td></td><td>API key unique identifier for deleteApiKey</td></tr>
</tbody>
</table>

---

### `queryApps`
Query CloudBase apps and versions deployed through app deployment. It can list apps and versions and retrieve their details; after deployment, poll build status with getAppVersion by buildId, and use getBuildLog to diagnose failures.
action=getUploadUrl (read-only) returns a presigned upload URL. In cloud mode without a local filesystem, obtain uploadUrl, PUT the code ZIP, then pass the returned unixTimestamp as cosTimestamp to manageApps(action=deployApp). The uploadUrl is a one-time upload credential: do not share it or paste it into a ticket.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "listApps", "getApp", "listAppVersions", "getAppVersion", "getBuildLog", "getUploadUrl"</td></tr>
<tr><td><code>serviceName</code></td><td>string</td><td></td><td>CloudBase app service name. Required for getApp / listAppVersions / getAppVersion / getBuildLog; reuse the same serviceName after redeployment to query version history</td></tr>
<tr><td><code>searchKey</code></td><td>string</td><td></td><td>Fuzzy search keyword by app service name, only used when action=listApps</td></tr>
<tr><td><code>pageNo</code></td><td>number</td><td></td><td>Pagination page number, starting from 1</td></tr>
<tr><td><code>pageSize</code></td><td>number</td><td></td><td>Pagination size</td></tr>
<tr><td><code>versionName</code></td><td>string</td><td></td><td>Version name. For getAppVersion, can be used alternatively with buildId; prefer passing it when the version number is known</td></tr>
<tr><td><code>buildId</code></td><td>string,number</td><td></td><td>Build ID, accepted as a number or numeric string. For getAppVersion, use either buildId or versionName; after deployment returns BuildId, use it directly to poll status. Required for getBuildLog</td></tr>
<tr><td><code>start</code></td><td>number</td><td></td><td>Build log offset for paginating subsequent logs. Only used when action=getBuildLog; when omitted, returns from the beginning</td></tr>
</tbody>
</table>

---

### `manageApps`
Deploy web apps to CloudBase, building the frontend and backend and deploying to an independent subdomain.
Cloud upload flow (cloud mode, no local filesystem): call queryApps(action=getUploadUrl) or manageApps(action=getUploadUrl) for a presigned URL → PUT the code ZIP to uploadUrl with uploadHeaders and `Content-Type: application/zip` → pass the returned unixTimestamp as cosTimestamp to deployApp.
action=getUploadUrl returns the presigned upload URL and cosTimestamp for cloud mode.
action=deployApp uploads a source ZIP and triggers the remote build/deploy pipeline:
  1. Remote npm install (can be skipped with installCmd="")
  2. Remote npm run build (can be skipped with buildCmd="")
  3. Remote tcb hosting deploy

Domain format: `&lt;serviceName&gt;-&lt;envId&gt;.webapps.tcloudbase.com` (each serviceName gets an independent subdomain)

✅ Recommended usage (new projects / web apps that need an independent domain, prefer this tool):
  On first deployment of a new project, pass framework=static, installCmd="", buildCmd="" to skip remote build,
  and only run tcb hosting deploy. After deployment you get an independent subdomain with version management.

⚠️ Compatibility notes:
- If an existing project was previously deployed with manageHosting (domain format: `&lt;envId&gt;-&lt;appId&gt;.tcloudbaseapp.com`),
  switching to manageApps produces a brand new URL and old links break. Keep the original deployment method unchanged.
- To check: call queryHosting to see if hosted files already exist.

Comparison with manageHosting:
- manageApps (this tool, preferred for new projects): domain `&lt;serviceName&gt;-&lt;envId&gt;.webapps.tcloudbase.com`, independent subdomain, version management
- manageHosting (existing projects or fallback): domain `&lt;envId&gt;-&lt;appId&gt;.tcloudbaseapp.com/&lt;path&gt;`, shared environment domain
Both can bind custom domains.

⚠️ If manageApps build fails, first check logs with queryApps(action="getBuildLog"); if still failing, fall back to manageHosting.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>yes</td><td>Allowed values: "deployApp", "getUploadUrl", "deleteApp", "deleteAppVersion"</td></tr>
<tr><td><code>serviceName</code></td><td>string</td><td>yes</td><td>CloudBase app service name, reflected in the domain: `&lt;serviceName&gt;-&lt;envId&gt;.webapps.tcloudbase.com`. For deployApp, reusing an existing serviceName adds a new deployment version and triggers redeployment rather than delete-and-recreate. Use a new name for first deployment</td></tr>
<tr><td><code>filePath</code></td><td>string</td><td></td><td>Absolute path to the local project root to upload and deploy. Required for deployApp in local mode; usually the source directory (containing package.json and source), not the dist directory. Specify the build output directory with buildPath. Not needed in cloud mode; use cosTimestamp instead</td></tr>
<tr><td><code>cosTimestamp</code></td><td>string,number</td><td></td><td>COS timestamp returned as unixTimestamp by getUploadUrl; a string or number is accepted. Passing it creates the app from already-uploaded code and skips local packaging/upload. First obtain the presigned URL and PUT the ZIP. Required in cloud mode. Exactly one of filePath and cosTimestamp must be provided</td></tr>
<tr><td><code>appPath</code></td><td>string</td><td></td><td>App online access path (hosting mount path), e.g. /my-web-app. Not a local directory path; CloudApp already has an independent subdomain, defaults to / (root) when omitted</td></tr>
<tr><td><code>buildPath</code></td><td>string</td><td></td><td>Build output directory, relative to filePath, e.g. dist or build. ⚠️ When passed, the remote build system cds into this directory before running tcb hosting deploy, so deployCmd automatically uses . (current directory) instead of the directory name to avoid path duplication (e.g. dist/dist). Can be omitted for pure static HTML at the project root, but note deployCmd defaults to dist</td></tr>
<tr><td><code>framework</code></td><td>string</td><td></td><td>Frontend framework type. Options: vue, react, next, nuxt, vite, angular, static. Even when passing static, it still goes through the remote build pipeline. If already built locally, consider manageHosting to upload directly and skip remote build entirely. Allowed values: "vue", "react", "next", "nuxt", "vite", "angular", "static"</td></tr>
<tr><td><code>nodeJsVersion</code></td><td>string</td><td></td><td>Node.js version used for the build; CloudBase uses its default when omitted</td></tr>
<tr><td><code>installCmd</code></td><td>string</td><td></td><td>Dependency install command, e.g. npm install. Defaults to npm install. If already installed locally or no install needed, pass an empty string '' to skip, but the remote still runs tcb hosting deploy</td></tr>
<tr><td><code>buildCmd</code></td><td>string</td><td></td><td>Build command, e.g. npm run build. Defaults to npm run build. If already built locally, pass an empty string '' to skip the build step. To skip the remote pipeline entirely, use manageHosting</td></tr>
<tr><td><code>deployCmd</code></td><td>string</td><td></td><td>Custom deploy command. Usually not needed; a tcb hosting deploy command is generated by default. With buildPath the remote already cds into that directory and uses . as the source path; without buildPath it defaults to dist</td></tr>
<tr><td><code>ignore</code></td><td>array of string</td><td></td><td>File/directory glob patterns to ignore when uploading, e.g. **/node_modules/**</td></tr>
<tr><td><code>versionName</code></td><td>string</td><td></td><td>Historical version name to delete, required only when action=deleteAppVersion</td></tr>
</tbody>
</table>

---

### `queryPermissions`
Read-only entry for CloudBase permissions and users. It queries resource permissions for databases, functions, and storage; role lists/details; application user lists/details; and gateway OPA authorization policies aligned with `tcb policy list/get`.

Examples:
- Query storage-bucket permissions: `action="getResourcePermission", resourceType="storage", resourceId="bucket-name"`
- List legacy gateway policies: `action="listPolicy"` (returns an empty list in PG / OPA-engine environments, consistent with the CLI)
- Read user Rego: `action="getPolicy"`; read platform extension policy with `action="getPolicy", extension=true`

Before crossing backend boundaries, call `queryEnv(action="info", envId=...)` and inspect `EnvInfo.RuntimeBackends`. `resourceType="noSqlDatabase"` applies to CloudBase NoSQL collection rules and is separate from PostgreSQL row-level security. Existing NoSQL collections in a PG environment still use these rules. Inspect PG policies with `queryPgDatabase(action="sql", sql="SELECT * FROM pg_policies WHERE tablename=...")`. This tool does not manage MySQL permissions.

On PostgreSQL environments, the platform rejects `DescribeResourcePermission`. For `resourceType="function"`, this tool falls back to Manager SDK `describeEnvAuthzConfig`, consistent with `tcb policy get`. Use `listPolicy` / `getPolicy` for explicit OPA policies.

⚠️ Role actions (`listRoles` / `getRole`) are rejected for **PostgreSQL environments** with `The current API does not support PostgreSQL type environments.` This is a platform boundary, not a configuration error. Do not retry repeatedly; use PostgreSQL RLS through `managePgDatabase(action="execute")` and `CREATE POLICY`, or manage permissions in the console.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Allowed values: "getResourcePermission", "listResourcePermissions", "listRoles", "getRole", "listUsers", "getUser", "listPolicy", "getPolicy"</td></tr>
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
<tr><td><code>extension</code></td><td>boolean</td><td></td><td>Used only by action=getPolicy. true reads the platform extension policy (`authz.platform.extension.rego`); false, the default, reads the user policy (`authz.user.rego`), aligned with `tcb policy get --extension`</td></tr>
<tr><td><code>policyResourceType</code></td><td>string</td><td></td><td>Used only by action=listPolicy. Filters by resource type; currently only `policy` is supported, aligned with `tcb policy list --resource-type policy`. Allowed values: "policy"</td></tr>
</tbody>
</table>

---

### `managePermissions`
Write entry for CloudBase permissions and users. It modifies resource permissions, manages roles, members, and policies, performs application-user CRUD, and sets gateway OPA Rego policies aligned with `tcb policy set`.

Examples:
- Set a storage bucket to private: `action="updateResourcePermission", resourceType="storage", resourceId="bucket-name", permission="PRIVATE"`
- Create a role: `action="createRole", roleName="admin", roleIdentity="admin"`
- Allow anonymous function invocation (PG uses OPA): `action="updateResourcePermission", resourceType="function", resourceId="myFn", permission="CUSTOM", securityRule='&#123;"invoke":true&#125;'`
- Set user Rego directly: `action="setPolicy", regoContent="package authz.user\n\ndefault allow := false\n", confirm=true` (this immediately disables legacy gateway authentication)

`createUser` / `updateUser` are environment-side application-user management capabilities for test accounts, administrators, or pre-provisioned users; they must not replace browser-side Web SDK registration forms. Frontend username/password registration should use `auth.signUp(&#123; username, password &#125;)`, and login should use `auth.signInWithPassword(&#123; username, password &#125;)`. Browser support for `auth.signUp` depends on the SDK/provider and must be verified; otherwise use a backend or management boundary without exposing credentials in the browser. `securityRule` semantics depend on `resourceType`. NoSQL concepts such as `doc._openid`, `auth.openid`, query-condition subset validation, and `create` / `update` / `delete` JSON templates apply only to `resourceType="noSqlDatabase"`.

Before crossing backend boundaries, inspect `EnvInfo.RuntimeBackends` with `queryEnv(action="info", envId=...)`:
- `resourceType="noSqlDatabase"` applies only to CloudBase NoSQL collections. PostgreSQL table access uses RLS through `managePgDatabase(action="execute", confirm=true)` with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY`. Existing NoSQL collections in a PG environment still use NoSQL rules.
- `resourceType="storage"` controls the NoSQL/COS bucket ACL; it does not cover PG `pgstore` buckets.
- MySQL permissions use MySQL GRANT/REVOKE statements through `manageMysqlDatabase`.

On PostgreSQL environments, the platform rejects `ModifyResourcePermission`. For `resourceType="function"`, the tool falls back to Manager SDK `modifyEnvAuthzConfig`, consistent with `tcb policy set`, writing `authz.user.rego`. `securityRule` may contain complete Rego beginning with `package authz.user` or `'&#123;"invoke":true&#125;'`, which generates a policy allowing anonymous/unauthenticated function calls. Setting Rego disables legacy gateway authentication. Prefer `action="setPolicy"` for explicit OPA policy changes.

⚠️ Role actions (`createRole` / `deleteRoles` / `updateRole`) are rejected for **PostgreSQL environments** with `The current API does not support PostgreSQL type environments.` This is a platform boundary, not a configuration error. Do not retry repeatedly; use PostgreSQL RLS through `managePgDatabase(action="execute")` and `CREATE POLICY`, or use the console.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Allowed values: "updateResourcePermission", "createRole", "updateRole", "deleteRoles", "addRoleMembers", "removeRoleMembers", "addRolePolicies", "removeRolePolicies", "createUser", "updateUser", "deleteUsers", "setPolicy"</td></tr>
<tr><td><code>resourceType</code></td><td>string</td><td></td><td>Target resource type. The specific semantics of `securityRule` depend on this value; `noSqlDatabase` uses collection security rules, `function` and `storage` also have their own independent security rule semantics, do not apply NoSQL rule syntax. Allowed values: "noSqlDatabase", "sqlDatabase", "function", "storage"</td></tr>
<tr><td><code>resourceId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>permission</code></td><td>string</td><td></td><td>Allowed values: "READONLY", "PRIVATE", "ADMINWRITE", "ADMINONLY", "CUSTOM"</td></tr>
<tr><td><code>securityRule</code></td><td>string</td><td></td><td>Resource type-specific rule content, detailed semantics depend on `resourceType`. When `resourceType="noSqlDatabase"` and `permission="CUSTOM"`, should pass document database security rule JSON (document database rules: `https://docs.cloudbase.net/database/security-rules`); keys are typically `read` / `create` / `update` / `delete`, values are expressions. Important: `create` rule validates written data, document doesn't exist yet at this point, cannot use `doc.*`; `read` / `update` / `delete` rules can use `doc.*` to reference existing document fields. Do not misuse `doc._openid`, `auth.openid`, query condition subset validation or `create` / `update` / `delete` templates for `function`, `storage` or `sqlDatabase`. For configuring `function` or `storage`, please refer to official security rule documentation: cloud functions `https://docs.cloudbase.net/cloud-function/security-rules`, cloud storage `https://docs.cloudbase.net/storage/security-rules`. Example: `&#123;"read":"auth.uid != null","create":"auth.uid != null && auth.loginType != \"ANONYMOUS\"","update":"auth.uid != null && doc._openid == auth.openid","delete":"auth.uid != null && doc._openid == auth.openid"&#125;`</td></tr>
<tr><td><code>roleId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>roleIds</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>roleName</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>roleIdentity</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>description</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>memberUids</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>policies</code></td><td>array of object</td><td></td><td></td></tr>
<tr><td><code>policyIds</code></td><td>array of string</td><td></td><td>Policy ID list. Direct binding by ID is not currently supported; pass policy detail objects through policies instead</td></tr>
<tr><td><code>uid</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>uids</code></td><td>array of string</td><td></td><td></td></tr>
<tr><td><code>username</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>password</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>userStatus</code></td><td>string</td><td></td><td>Allowed values: "ACTIVE", "BLOCKED"</td></tr>
<tr><td><code>regoContent</code></td><td>string</td><td></td><td>Used only by action=setPolicy. Complete user OPA Rego text; it must start with `package authz.user`, aligned with `tcb policy set &lt;regoContent&gt;`</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Used only by action=setPolicy. Setting Rego immediately disables legacy gateway authentication, so confirm=true is required explicitly</td></tr>
</tbody>
</table>

---

### `queryLogs`
Unified read-only entry for the logs domain. Supports checking log service status and searching CLS logs.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Allowed values: "checkLogService", "searchLogs"</td></tr>
<tr><td><code>queryString</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>service</code></td><td>string</td><td></td><td>Allowed values: "tcb", "tcbr"</td></tr>
<tr><td><code>startTime</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>endTime</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>limit</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>context</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>sort</code></td><td>string</td><td></td><td>Allowed values: "asc", "desc"</td></tr>
</tbody>
</table>

---

### `manageLogs`
Write entry for the CloudBase logs domain. Used to enable the CLS log service (aligned with Manager SDK `log.createLogService` / CreateEnvResource Resources=['log']).

**When to use**:
- Enable the CLS log service: `action="createLogService", confirm=true`

Enabling is asynchronous: a successful API call does not mean the service is immediately usable. Poll afterwards with `queryLogs(action="checkLogService")` to confirm.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Operation type. createLogService=enable the CLS log service (requires confirm=true). Allowed values: "createLogService"</td></tr>
<tr><td><code>confirm</code></td><td>boolean</td><td></td><td>Explicit confirmation before enabling the log service. `confirm=true` is required; when omitted the tool returns CONFIRM_REQUIRED.</td></tr>
</tbody>
</table>

---


### `queryAgents`
Unified read-only entry for the Agent domain. Supports listing, details, and log queries.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Allowed values: "listAgents", "getAgent", "getAgentLogs"</td></tr>
<tr><td><code>agentId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>pageNumber</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>pageSize</code></td><td>number</td><td></td><td></td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td></td></tr>
</tbody>
</table>

---

### `manageAgents`
Unified write entry for the Agent domain. Supports creating, updating, and deleting remote Agents.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Allowed values: "createAgent", "updateAgent", "deleteAgent"</td></tr>
<tr><td><code>agentId</code></td><td>string</td><td></td><td></td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td></td></tr>
</tbody>
</table>

---

### `callCloudApi`
General cloud API calling tool, mainly used for CloudBase / Tencent Cloud management plane and dependent resource related API calls. **Read the interface index before calling**: https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/api-reference.md (an Action-level index synced daily, including rate limits; check this index first to confirm service/Action/parameters so you never guess an Action name; for products the index does not cover, verify against that product's official API docs). If your goal is to directly integrate auth/functions/cloudrun/storage/mysqldb and other CloudBase business APIs via HTTP protocol, do not prioritize using callCloudApi, instead prioritize checking the corresponding OpenAPI / Swagger. The existing OpenAPI / Swagger capabilities are not a general management plane Action collection; for management plane APIs, please prioritize referring to CloudBase API Overview https://cloud.tencent.com/document/product/876/34809 and CloudBase Dependent Resource API Guide https://cloud.tencent.com/document/product/876/34808. For tcb service, common Action categories are as follows:

**Environment Management**: `CreateEnv`, `ModifyEnv`, `DescribeEnvs`, `DestroyEnv`
**User Management**: `CreateUser`, `ModifyUser`, `DescribeUserList`, `DeleteUsers`
**Authentication Configuration**: `EditAuthConfig`, `DescribeAuthDomains`
**Cloud Functions**: `DescribeFunctions`, `CreateFunction`, `UpdateFunctionCode`, `DeleteFunction`
**Database**: `CreateMySQLInstance`, `DescribeMySQLInstances`, `DestroyMySQLInstance`

⚠️ CloudBase Run uses the `tcbr` service for `CreateCloudRunEnv`, `CreateCloudRunServer`, `DescribeEnvBaseInfo`, and `DescribeCloudRunEnvs` with version `2022-02-17`. Legacy small-tenant actions under `tcb`, such as CreateCloudBaseRunResource, are disabled; use manageCloudRun for deployment. Use DescribeEnvBaseInfo with required EnvId to query one environment's base information or enablement state; use DescribeCloudRunEnvs, optionally filtered by EnvId, for environment lists and resource information.

⚠️ Pass Region through the tool's top-level `region` parameter, which maps to X-TC-Region / the regional endpoint. Do not place Region in params; a Region value there is stripped and treated as the top-level region.

When destroying an environment, the common practice is to at least include `EnvId` and `BypassCheck: true`; if the environment is already in isolation period, add `IsForce: true` per documentation.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>service</code></td><td>string</td><td>Yes</td><td>Tencent Cloud product identifier. **Values may only come from this field's enum whitelist (58 in total)**, which determines the request domain https://&lt;service&gt;.tencentcloudapi.com. Values outside the list are rejected — do not invent them; COS is not part of the cloud API system. See the cloud-api-operations skill for the product-to-Action mapping. CloudRun always goes through tcbr. Allowed values: "tcb", "tcbr", "scf", "sts", "cam", "cloudaudit", "tag", "billing", "region", "ba", "cvm", "lighthouse", "tke", "cbs", "cfs", "tcr", "cdb", "mariadb", "postgres", "sqlserver", "redis", "mongodb", "cynosdb", "dcdb", "tcaplusdb", "keewidb", "vpc", "clb", "cdn", "ecdn", "dnspod", "privatedns", "domain", "ssl", "teo", "gaap", "kms", "ssm", "waf", "cwp", "tcss", "ckafka", "tdmq", "tdmysql", "apigateway", "monitor", "cls", "apm", "tsf", "tat", "hunyuan", "lkeap", "tts", "trtc", "live", "vod", "sms", "ses"</td></tr>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>Specific Action name, must conform to the corresponding service's official API definition. **When unsure, check the official documentation first — do not guess from synonyms or historical names** (a wrong guess surfaces as an invalid-action server error that is hard to diagnose). See the cloud-api-operations skill for common Actions.</td></tr>
<tr><td><code>params</code></td><td>object</td><td></td><td>Parameter object corresponding to the Action; key names match the official API definition — check the docs first when unsure. **Do not put Region here**; use the top-level region for cross-region calls. For CloudBase business APIs prefer searchKnowledgeBase(mode="openapi") rather than this tool. Examples are in the cloud-api-operations skill.</td></tr>
<tr><td><code>version</code></td><td>string</td><td></td><td>API version (omittable in most cases). Products with **only one official version in the whitelist are auto-filled** and need not pass it; the following multi-version products must pass it explicitly, otherwise an error listing the available options is returned: tke, mongodb, teo, monitor, vod, sms. Example: service="tcbr", version="2022-02-17", action="CreateCloudRunEnv", params=&#123;EnvId:"env-xxx",PackageType:"Standard"&#125;; service="monitor" must explicitly pass "2018-07-24" (the alarm-policy Action family belongs to that version).</td></tr>
<tr><td><code>region</code></td><td>string</td><td></td><td>Cloud API region (X-TC-Region), e.g. ap-shanghai. Cross-region calls must pass this top-level parameter — do not write it into params. ⚠️ ap-singapore belongs to both the China site and the international site; when no site is specified it is treated as the international site (site=intl): to operate on that region on the China site, call auth(action="start_auth", site="domestic") or set TCB_SITE=domestic first.</td></tr>
</tbody>
</table>

---

### `prepareFeedback`
Returns the new-issue page of the public repository.

**When to use**:
- `channel="case"`: the work is done and the user wants to showcase it on the case wall.
- `channel="retrospective"`: this build did not go smoothly and the user wants to feed the blockers back to the platform.

**How to use**:
- Call it once only. It returns a page address, not a submitted issue.
- Write the body in the conversation and hand the link to the user. The user logs in and submits it.
- Do not submit on the user's behalf, and do not put an environment ID or secret into the body.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>channel</code></td><td>string</td><td>Yes</td><td>`case` opens the case template; `retrospective` opens the retrospective template. Allowed values: "case", "retrospective"</td></tr>
</tbody>
</table>

---


### `queryMessagePush`
Query Mini Program cloud development message push configuration (qbase getappconfig) or all valid message push event constraints (getcallbacksupportlist). There are two push modes: cloud function (default, callback per (msgType, event)) and CloudRun (qbase_open=true, receives all messages in bulk to container path). action=list also returns pushMode (cloudfunction|container), containerConfig, callbacks, and version; in CloudRun mode, callbacks may still exist but are not effective (see note), use ensureCloudFunctionMode to switch back to cloud function mode before callbacks take effect. action=listSupportedEvents returns all valid constraints (grouped by message type). Requires WeChat IDE login session channel (host-injected cloudBaseOptions.requestFn).

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>appid</code></td><td>string</td><td>Yes</td><td>Mini Program AppID (required, consistent with WeChat Developer Tools; used to select WeChat login session)</td></tr>
<tr><td><code>env</code></td><td>string</td><td></td><td>Optional: Environment ID; when passed, list only returns subscription entries for that environment</td></tr>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>list: Query current message push configuration list (includes pushMode/containerConfig). listSupportedEvents: Query all valid message push event constraints (grouped by msgType). Allowed values: "list", "listSupportedEvents"</td></tr>
</tbody>
</table>

---

### `manageMessagePush`
Manage Mini Program cloud development message push configuration (write operations, requires confirm="yes" confirmation). Push modes: cloud function (default, callback per (msgType, event)) vs CloudRun (bulk reception; in CloudRun mode subscribe/unsubscribe/setEnable will be rejected, use ensureCloudFunctionMode first). Implements declarative idempotency based on "read full → merge → full overwrite (with version optimistic lock)". msg_type defaults to "event"; message types use msg_type=text|image|voice|video|miniprogrampage. action=subscribe validates that function_name actually exists in the environment before proceeding. action=ensureCloudFunctionMode disables CloudRun bulk reception; action=ensureContainerMode enables CloudRun (requires qbase_container_path/qbase_env/text_mode); action=setContainerCallback updates CloudRun path/env/text_mode. No write request is sent when the collection has no changes (idempotent no-op). Requires WeChat IDE login session channel.

#### Parameters

<table>
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>appid</code></td><td>string</td><td>Yes</td><td>Mini Program AppID (required, consistent with WeChat Developer Tools; used to select WeChat login session)</td></tr>
<tr><td><code>env_id</code></td><td>string</td><td>Yes</td><td>Environment ID (cloud development environment bound to cloud function subscriptions; also serves as default CloudRun environment when qbase_env is not passed for ensureContainerMode/setContainerCallback)</td></tr>
<tr><td><code>function_name</code></td><td>string</td><td>Yes</td><td>Cloud function name to receive message push (used by subscribe/unsubscribe/setEnable/ensureCloudFunctionMode; CloudRun-related actions can pass a placeholder)</td></tr>
<tr><td><code>action</code></td><td>string</td><td>Yes</td><td>subscribe: Subscribe to specified cloud function (rejected in CloudRun mode). unsubscribe: Remove matching subscription (rejected in CloudRun mode). setEnable: Enable/disable matching subscription (rejected in CloudRun mode). ensureCloudFunctionMode: Switch to cloud function push mode (disable qbase_open). ensureContainerMode: Switch to CloudRun bulk reception (requires qbase_container_path + text_mode). setContainerCallback: Update CloudRun callback path/env/text_mode. Allowed values: "subscribe", "unsubscribe", "setEnable", "ensureCloudFunctionMode", "ensureContainerMode", "setContainerCallback"</td></tr>
<tr><td><code>msg_type</code></td><td>string</td><td></td><td>Message type (defaults to "event"). "event": Event-type entries, used with event_types (subscribe defaults to virtual payment 7 events when omitted). "text"|"image"|"voice"|"video"|"miniprogrampage": Message type entries (event is always empty string), do not pass event_types. Allowed values: "event", "text", "image", "voice", "video", "miniprogrampage"</td></tr>
<tr><td><code>event_types</code></td><td>array of string</td><td></td><td>Event list to operate on (only used when msg_type="event"; can first query all constraints via queryMessagePush(action=listSupportedEvents)). subscribe defaults to subscribing to virtual payment 7 events when omitted; required for unsubscribe / setEnable when msg_type=event.</td></tr>
<tr><td><code>enable</code></td><td>boolean</td><td></td><td>Required for setEnable: true to enable subscription / false to disable subscription</td></tr>
<tr><td><code>qbase_container_path</code></td><td>string</td><td></td><td>CloudRun callback path/URL (required for ensureContainerMode; optional update for setContainerCallback)</td></tr>
<tr><td><code>qbase_env</code></td><td>string</td><td></td><td>CloudRun service environment ID (optional for ensureContainerMode/setContainerCallback; defaults to env_id when omitted)</td></tr>
<tr><td><code>text_mode</code></td><td>number</td><td></td><td>CloudRun message body encoding: 1=json, 2=xml (required for ensureContainerMode; optional update for setContainerCallback). Allowed values: 1, 2</td></tr>
<tr><td><code>confirm</code></td><td>string</td><td></td><td>Write operation confirmation: pass confirm="yes" to confirm execution; returns a pending configuration summary (CONFIRM_REQUIRED) when omitted or other value is passed, review and retry. No confirmation needed when the collection has no changes.</td></tr>
</tbody>
</table>

---