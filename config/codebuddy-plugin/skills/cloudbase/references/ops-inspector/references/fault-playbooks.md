# Fault Playbooks (故障剧本)

Six high-frequency KA / ops triage playbooks. Use the matching playbook when the symptom matches; always prefer MCP tools listed here — **never** invent Monitor/TCB Actions via `callCloudApi`.

Shared prerequisites for every playbook:

1. `queryEnv(action="info")` — bind `envId`
2. Prefer metrics via `queryEnv(action="metrics", ...)`
3. Prefer logs via `queryLogs` / `queryFunctions` log actions
4. Summarize with severity + next action + console link

---

## Playbook 1 — HTTP 429 / rate limit

### Symptoms

- Client or gateway returns **429**
- User says 限频 / 被限流 / QPS 不够
- Activity traffic spike near launch

### Tools (in order)

1. `queryEnv(action="metrics", envId, metricName="GatewayTraceEnvQPS")` — peak QPS vs package baseline (see `alarm-interpretation.md`; default package **500** if unknown)
2. `queryEnv(action="metrics", envId, metricName="FunctionThrottle", resourceID="<functionName>")` when a function is implicated
3. `queryLogs(action="checkLogService")` then `queryLogs(action="searchLogs", queryString="429 OR throttle OR 限流 OR FREQUENCY", ...)`
4. Optional: `queryFunctions(action="listFunctionLogs", functionName="...")` for per-function evidence

### Decision tree

| Evidence | Likely cause | What to tell the user |
|----------|--------------|------------------------|
| Peak QPS ≥ ~90% of package | Package QPS ceiling | 告警/429 **合理**；需要升配或开按量（集成版可能无法自助，引导控制台/工单） |
| Peak QPS low but `FunctionThrottle` > 0 | Function concurrency / throttle | 查函数并发与预置并发；短时重试 + 降峰 |
| Metrics healthy, logs show 429 on one route | Route/gateway or upstream limit | 核对网关路由与上游；不要盲目升整环境配额 |
| No metrics + no logs | Observability gap | 先开 CLS；用控制台监控核对后再结论 |

### Do not

- Do not call `callCloudApi` to guess rate-limit APIs
- Do not claim the package was raised unless the user or console confirms

---

## Playbook 2 — Cloud function intermittent / persistent 404

### Symptoms

- Invoking a cloud function or HTTP access path returns **404**
- Works sometimes / after redeploy / only on one path
- "函数找不到" / `FUNCTION_NOT_FOUND` / gateway 404

### Tools (in order)

1. `queryFunctions(action="listFunctions")` — does the name exist in **this** env?
2. `queryFunctions(action="getFunctionDetail", functionName="...")` — status, HTTP access, triggers
3. If HTTP: confirm path / domain / gateway with `queryGateway` / hosting docs as available; mismatch often looks like 404
4. `queryLogs(action="searchLogs", queryString="404 OR FUNCTION_NOT_FOUND OR function_name:\"<name>\"", ...)`
5. `queryEnv(action="metrics", metricName="FunctionInvocation", resourceID="<functionName>")` — if `allZero`, traffic never reached the function (client/env/path issue more likely than runtime crash)

### Decision tree

| Evidence | Likely cause | What to tell the user |
|----------|--------------|------------------------|
| Function missing in list | Wrong env or never deployed | 切换到正确 envId 或重新部署 |
| Function exists, invocation allZero, client 404 | Wrong URL / path / domain / envId in client | 核对调用方 env 与路径，而非改函数代码 |
| Function exists, invocations > 0, sporadic 404 | Bad alias/version, deleted route, or wrong qualifier | 查版本/别名/HTTP 访问配置与最近部署 |
| Only HTTP path 404 | Gateway route / static hosting path | 查路由 Enable 与 upstream，勿只看函数列表 |

### Do not

- Do not redeploy blindly before confirming the function exists in the target env
- Do not use Web SDK auth debugging for pure routing 404s

---

## Playbook 3 — ACCESS_TOKEN_INVALID

### Symptoms

- API / SDK returns **ACCESS_TOKEN_INVALID** (or token invalid / unauthorized token)
- Login worked before, then sudden failures
- PG / HTTP / management calls fail auth while env is healthy

### Tools (in order)

1. Confirm which surface failed: **app user token** vs **env API key / publishable key** vs **MCP management login**
2. App auth: follow `../auth-tool-cloudbase/SKILL.md` then platform auth skill (`auth-web` / `auth-wechat` / `auth-nodejs`) — check providers with `queryAppAuth` / related auth tools when available
3. Env binding: `queryEnv(action="info")` — wrong env often presents as token/env mismatch
4. `queryLogs(action="searchLogs", queryString="ACCESS_TOKEN_INVALID OR token invalid OR unauthorized", ...)`
5. Metrics are usually secondary; only use `queryEnv(action="metrics")` if correlating a traffic drop after auth breakage

### Decision tree

| Evidence | Likely cause | What to tell the user |
|----------|--------------|------------------------|
| Expired / rotated key or publishable key | Credential lifecycle | 轮换后更新客户端配置；不要把密钥写进仓库 |
| Provider disabled or misconfigured | Auth provider readiness | 先用 auth-tool 打开并校验登录方式 |
| Token from env A used on env B | Env mismatch | 统一 envId 与初始化配置 |
| MCP/management auth failure | Agent not logged in / wrong credential type | 走 `auth` 登录与环境绑定，而不是改业务代码 |
| PG API Key limitation | Product constraint | 说明集成版/PG 场景限制，避免反复重试同一错误密钥类型 |

### Do not

- Do not paste secrets into chat or source
- Do not "fix" by switching to anonymous login unless the product intentionally allows it
- Do not call `callCloudApi` to probe undocumented auth Actions

---

## Playbook 4 — Function / API call volume is 0（调用量为 0）

### Symptoms

- Console or user says 调用次数为 0 / 没有调用量
- Activity is online but metrics stay flat
- Need to know whether the app is broken or metrics are empty

### Tools (in order)

1. `queryEnv(action="metrics", envId, metricName="FunctionInvocation", resourceID="<functionName>")` — inspect `Summary.allZero`, `max`, `sampleCount`
2. Also pull `GatewayTraceEnvQPS` — distinguishes "no function traffic" vs "no env traffic at all"
3. `queryFunctions(action="listFunctions")` + `getFunctionDetail` — triggers, HTTP access, status
4. `queryLogs` / `listFunctionLogs` over the same window — absolute silence vs client errors
5. If CloudRun: `TkeInvokeNumService` / `TkeQPSService` with `resourceID=<serviceName>`

### Decision tree

| Evidence | Likely cause | What to tell the user |
|----------|--------------|------------------------|
| `FunctionInvocation` allZero + gateway QPS also ~0 | No client traffic to this env | 检查前端/活动是否指向该 envId，DNS/域名是否生效 |
| Gateway QPS > 0 but function invocation 0 | Traffic not routed to that function | 查网关路由、函数名、触发器、HTTP 路径 |
| Invocations > 0 in metrics but console UI shows 0 | UI delay / wrong console filter | 以 `queryEnv(metrics)` Summary 为准并给出峰值时间 |
| sampleCount 0 | Empty monitor window / API empty | 扩大时间窗；不要断言业务一定无流量 |
| Function inactive / missing | Not deployed | 部署后再看指标 |

### Do not

- Do not conclude "platform outage" from a single empty series without checking gateway QPS and function existence
- Do not use `callCloudApi` to pull custom monitor Actions

---

## Playbook 5 — AI model call returns 429 / Token quota exceeded

> **This is not Playbook 1.** Gateway/QPS 429 is the environment's own traffic ceiling; an **AI model** 429 comes from the model pool and has its own two layers. Treating one as the other sends the user to raise a package quota that was never the limit.

### Symptoms

- `wx.cloud.extend.AI` / `createModel` calls return **429 Too Many Requests**, or `EXCEED_TOKEN_QUOTA_LIMIT`
- User says the model is 限流, or that a request was rejected even though the last one was long ago
- User reports the Token pack "did not apply" while resource points were charged

### Tools (in order)

1. Console → **AI module** → per-model **Token** consumption (the only place that shows quota side)
2. `DescribeAIModels` — which groups/models are actually enabled for this environment (`hunyuan-exp` / `cloudbase` / custom)
3. `DescribeActivityInfo` — 小程序成长计划 enrollment (`ai_miniprogram_inspire_plan`), then `DescribeEnvPostpayPackage` for the Token Credits pack

### Decision tree

| Evidence | Likely cause | What to tell the user |
| --- | --- | --- |
| Single environment under its own limits, but requests still 429 | **Pool-level** concurrency: per-environment concurrency is 10, and the shared pool has its own ceiling — other users' volume can 429 you | 这是设计内的两层并发（环境级 + 整体资源池），不是故障；**稍后重试**或**换模型**（不同模型资源池相互独立） |
| Requests concentrated / bursty | Per-environment concurrency (10) exceeded | 控制并发、指数退避重试；不要对流式请求做无限重试（会放大流量） |
| Quota-side error (`EXCEED_TOKEN_QUOTA_LIMIT`) | Model/Token quota exhausted for that path | 换模型或配置自定义模型 API Key；必要时提工单申请提额 |
| Token pack present but resource points were charged | **Call origin outside the gifted Token's scope** | 成长计划赠送的 Token 仅限**小程序端调用**与**管理员身份调用**（含控制台体验、云函数内调用）；来源不符即落到资源点池，不是"没抵扣" |

### Do not

- Do not run Playbook 1's QPS metrics as the primary evidence and recommend a package upgrade for an AI-model 429
- Do not state a specific RPM/TPM number — the published baseline is "10 concurrent per environment + pool-level ceiling"; anything more precise must come from the console or the model team
- Do not hard-code the model roster when suggesting a switch — query it (`DescribeManagedAIModelList` / `DescribeAIModels`)

---

## Playbook 6 — Cloud function timeout / poll-retry exhausted

### Symptoms

- Client SDK reports `-404005` (`超出最大正常结果轮询尝试次数`), or a function returns **433 TimeLimitReached**
- Call waited tens of seconds (e.g. 60s+) then failed
- Metrics show the invocation **counted**, but the log window has **no `START` log** — the user asks which layer it was stuck in

### Tools (in order)

1. `queryFunctions(action="getFunctionDetail", functionName="...")` — runtime, timeout setting, memory, `MinNum` (cold start), last update
2. `queryFunctions(action="listFunctionLogs", functionName="...")` — presence/absence of `START` + `END` for the failing window
3. `queryEnv(action="metrics", metricName="FunctionInvocation", resourceID="<functionName>")` — invocation vs error counts in the same window
4. `queryLogs(action="searchLogs", queryString="timeout OR 404005 OR 433 OR coldStart OR 冷启动", ...)` — cross-function correlation

### Decision tree

| Evidence | Likely cause | What to tell the user |
| --- | --- | --- |
| Invocation counted, **no `START` log**, errors spread across functions at the same time | Execution never started — platform-side (cold start / host resources), not the code | 这是平台侧；**不要改代码**。留证（时间窗 + 函数名 + RequestId）后走工单/公告，同时看是否同地域多函数同时中招 |
| `START` + `END` present, duration ≈ configured timeout | Function genuinely ran out of time | 查慢查询/外部调用；按需调大超时或用异步执行 |
| `START` present, no `END`, memory metric pinned | OOM / crash | 调大内存、查内存泄漏 |
| Consistently slow only on first invocation | Cold start | `MinNum: 1` 预热；冷启动优化 |
| `-404005` on the **client** while server logs look normal | Client-side poll-retry exhausted | 这是**客户端 SDK 的轮询超时码**，不等于服务端故障；先看上面三步再定性 |

### Do not

- Do not read `-404005` as "the service failed" — it is a client SDK code meaning the result poll exhausted its retries; the server side may have completed
- Do not push a code change while the evidence points at "execution never started"
- Do not report a single function's timeout as a region-wide incident without the cross-function correlation in step 4
