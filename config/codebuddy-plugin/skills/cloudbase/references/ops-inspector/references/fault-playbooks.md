# Fault Playbooks (故障剧本)

Four high-frequency KA / ops triage playbooks. Use the matching playbook when the symptom matches; always prefer MCP tools listed here — **never** invent Monitor/TCB Actions via `callCloudApi`.

Shared prerequisites for every playbook:

1. `envQuery(action="info")` — bind `envId`
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
4. `queryLogs(action="searchLogs", queryString="404 OR FUNCTION_NOT_FOUND OR functionName:<name>", ...)`
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
3. Env binding: `envQuery(action="info")` — wrong env often presents as token/env mismatch
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
