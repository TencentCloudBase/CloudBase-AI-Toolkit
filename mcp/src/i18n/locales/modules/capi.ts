import { defineModule } from "../types.js";

export const capi = defineModule(
  {
    title: "调用云API",
    description:
      `通用的云 API 调用工具，主要用于 CloudBase / 腾讯云管控面与依赖资源相关 API 调用。**调用前必读接口索引** https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/api-reference.md （每日自动同步的 Action 级索引，含 rate limit；先查此索引确认 service/Action/参数，避免猜测 Action 名称；索引未覆盖的产品再去该产品官方 API 文档核对）。如果你的目标是通过 HTTP 协议直接集成 auth/functions/cloudrun/storage/mysqldb 等 CloudBase 业务 API，请不要优先使用 callCloudApi，而应优先查看对应 OpenAPI / Swagger。现有 OpenAPI / Swagger 能力不是通用的管控面 Action 集合；管控面 API 请优先参考 CloudBase API 概览 {controlPlaneUrl} 与云开发依赖资源接口指引 {dependencyUrl}。对于 tcb service，常用 Action 分类如下：\n\n**环境管理**: \`CreateEnv\`、\`ModifyEnv\`、\`DescribeEnvs\`、\`DestroyEnv\`\n**用户管理**: \`CreateUser\`、\`ModifyUser\`、\`DescribeUserList\`、\`DeleteUsers\`\n**认证配置**: \`EditAuthConfig\`、\`DescribeAuthDomains\`\n**云函数**: \`DescribeFunctions\`、\`CreateFunction\`、\`UpdateFunctionCode\`、\`DeleteFunction\`\n**数据库**: \`CreateMySQLInstance\`、\`DescribeMySQLInstances\`、\`DestroyMySQLInstance\`\n\n⚠️ 云托管（CloudBase Run）统一走 tcbr service（CreateCloudRunEnv / CreateCloudRunServer / DescribeEnvBaseInfo / DescribeCloudRunEnvs，version="2022-02-17"），tcb 旧小租户接口 CreateCloudBaseRunResource 等已被禁用；部署请用 manageCloudRun。查询单个环境基础信息/是否已开通云托管用 DescribeEnvBaseInfo（EnvId 必填），查询环境列表及资源信息用 DescribeCloudRunEnvs（EnvId 可选过滤）。\n\n⚠️ Region 必须作为本工具顶层参数 \`region\` 传入（对应 X-TC-Region / 地域 endpoint），不要放进 params。params 里的 Region 会被剥离并当作顶层 region 使用。\n\n销毁环境时，常见做法是至少带上 \`EnvId\` 和 \`BypassCheck: true\`，如果环境已经处于隔离期再按文档补 \`IsForce: true\`。`,
    tcbForbiddenHint:
      "云托管（CloudBase Run）统一走 tcbr 新逻辑（CreateCloudRunEnv / CreateCloudRunServer），不要使用 tcb 旧小租户接口（{actions}）。新环境请先初始化云托管：callCloudApi(service=\"tcbr\", version=\"2022-02-17\", action=\"CreateCloudRunEnv\", params={EnvId:\"...\"})，再通过 manageCloudRun(action=\"deploy\") 创建服务；查询单个环境基础信息/是否已开通云托管用 callCloudApi(service=\"tcbr\", version=\"2022-02-17\", action=\"DescribeEnvBaseInfo\", params={EnvId:\"...\"})，查询环境列表/资源信息用 DescribeCloudRunEnvs。",
    tcbForbiddenPrefix: "[{service}/{action}] 已禁用：{hint}",
    serviceNotAllowed:
      "不允许访问服务 {service}。允许的服务：{allowed}",
    evalModeNotExposed:
      "{service}/{action} 云 API 未开放或不存在。请改用其他 API。",
    docGuidanceCloudbase:
      "优先查阅 CloudBase API 概览 {controlPlaneUrl} 与云开发依赖资源接口指引 {dependencyUrl}。",
    docGuidanceMonitor:
      "请优先核对云监控（腾讯云可观测平台）官方 API 文档：API 概览 https://cloud.tencent.com/document/product/649/30343 ，单 Action 详细文档在 https://cloud.tencent.com/document/api/248/ 产品线下。",
    docGuidanceGeneric:
      "请优先核对对应官方云 API 文档；若你的场景其实是通过 HTTP 协议直接集成 auth/functions/cloudrun/storage/mysqldb 等 CloudBase 业务 API，请优先使用 OpenAPI / Swagger 或 searchKnowledgeBase(mode=\"openapi\")，不要继续猜测管控面 Action。",
    camAuthGuidance:
      "这是 CAM 权限不足。先分清是谁缺权限，再决定怎么补：用 auth(action=\"status\") 看 credential_scope，用 callCloudApi(service=\"sts\", action=\"GetCallerIdentity\") 看实际调用者（Type=CAMRole 表示角色扮演身份，UserId 里带角色名）。若缺权限的是角色（如 TCB_QcsRole），补的是挂在**角色**上的策略 —— 给用户一条 cam/role/grant 一键授权链接，拼法与 principal 取值见 skill cloud-api-operations 的 §3.2；若是账号级身份本人，则由主账号给这个身份追加策略（用腾讯云 SecretId/SecretKey 登录时，调用者就是该身份）。环境级 API Key 只能访问绑定环境的数据面，跨产品调用需改用账号级凭据：auth(action=\"start_auth\", authMode=\"device\")。另请确认目标资源确实属于当前账号。",
    errorInvalidAction:
      "Action `{action}` 可能不存在或不对外开放。请不要继续猜测 Action 名称，先确认 service=`{service}` 下该 Action 在当前 API 版本是否真实存在。",
    errorSuggestedActions: "可能的 tcb Action：{candidates}。",
    errorRegionParam:
      "Region 不是 Action body 参数。请使用 callCloudApi 顶层参数 region（例如 region=\"ap-singapore\"），对应 X-TC-Region。",
    errorParameterMismatch:
      "请求参数名与 API 定义不一致，请核对参数字段（区分大小写）并移除未支持字段。",
    errorParamKeys: "常见参数键：{keys}",
    errorRequiredKeys: "必填参数：{keys}",
    errorTcbEntryHint: "`{action}` {paramHint}。",
    errorTcbEntryHintKeys: "`{action}` 常见参数键：{keys}。",
    errorParamsTypeHint: "参数类型参考：\n```ts\n{paramsType}\n```",
    errorInvalidValueIntro: "请求参数值格式不正确或超出有效范围。请检查：",
    errorInvalidValue1: "1. 字符串参数是否为空或包含非法字符",
    errorInvalidValue2: "2. 数值参数是否在允许范围内",
    errorInvalidValue3: "3. 枚举值是否使用了正确的取值（区分大小写）",
    errorInvalidValue4: "4. 必填参数是否有值",
    errorInvalidValueTypeIntro: "参数类型参考：",
    errorNetwork:
      "网络请求异常，建议稍后重试，并检查本地网络/代理设置。请求发往 https://{service}.tencentcloudapi.com（该 service 已在白名单内），若目标地域的域名不可达也会表现为解析失败，请一并核对 region。",
    errorGenericFallback:
      "请检查 service/action/params 是否与官方 API 文档一致后重试。",
    errorBuild:
      "[{service}/{action}] 调用失败: {baseMessage}\n建议：{suggestions}\n参考文档：CloudBase API 概览 {controlPlaneUrl}\n云开发依赖资源接口指引 {dependencyUrl}",
    "schema.service":
      "腾讯云产品标识，**取值只能来自本字段的 enum 白名单（共 {count} 个）**，决定请求域名 https://<service>.tencentcloudapi.com。名单外的取值一律拒绝，不要臆造；COS 不在云 API 体系内。产品名与 Action 对照见 skill cloud-api-operations。云托管统一走 tcbr。",
    "schema.action":
      "具体 Action 名称，需符合对应服务的官方 API 定义。**不确定时先查官方文档，不要用近义词或历史命名猜测**（猜错会被服务端报成 action invalid，很难排查）。常用 Action 见 skill cloud-api-operations。",
    "schema.version":
      "API 版本（多数场景可省略）。白名单里**只有一个官方版本的产品会自动补齐**，不必传；以下多版本产品必须显式传，缺省会报错并列出可选项：{services}。示例：service=\"tcbr\", version=\"2022-02-17\", action=\"CreateCloudRunEnv\", params={EnvId:\"env-xxx\",PackageType:\"Standard\"}；service=\"monitor\" 需显式传 \"2018-07-24\"（告警策略族 Action 属于该版本）。",
    "schema.params":
      "Action 对应的参数对象，键名与官方 API 定义一致，不确定时先查文档。**不要把 Region 放这里**，跨地域用顶层 region。CloudBase 业务 API 请优先用 searchKnowledgeBase(mode=\"openapi\")，不要用本工具。示例见 skill cloud-api-operations。",
    "schema.region":
      "云 API 地域（X-TC-Region），如 ap-shanghai。跨地域必须传此顶层参数，不要写进 params。⚠️ ap-singapore 同属国内站与国际站，未指定站点按国际站（site=intl）处理：要操作国内站该地域环境，先 auth(action=\"start_auth\", site=\"domestic\") 或设 TCB_SITE=domestic。",
  },
  {
    title: "Call Cloud API",
    description:
      `Generic Cloud API invocation tool, mainly for CloudBase / Tencent Cloud control-plane and dependent-resource APIs. **Read the API index first** https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/api-reference.md (a daily-synced Action-level index including rate limits; confirm service/Action/params there before calling instead of guessing Action names; for products not covered by the index, check the product's official API docs). If your goal is to integrate CloudBase business APIs such as auth/functions/cloudrun/storage/mysqldb directly over HTTP, prefer the corresponding OpenAPI / Swagger instead of callCloudApi. The existing OpenAPI / Swagger capabilities are not the generic control-plane Action set; for control-plane APIs refer to the CloudBase API overview {controlPlaneUrl} and the dependent-resource API guide {dependencyUrl}. Common tcb Actions by category:\n\n**Env management**: \`CreateEnv\`, \`ModifyEnv\`, \`DescribeEnvs\`, \`DestroyEnv\`\n**User management**: \`CreateUser\`, \`ModifyUser\`, \`DescribeUserList\`, \`DeleteUsers\`\n**Auth config**: \`EditAuthConfig\`, \`DescribeAuthDomains\`\n**Cloud functions**: \`DescribeFunctions\`, \`CreateFunction\`, \`UpdateFunctionCode\`, \`DeleteFunction\`\n**Database**: \`CreateMySQLInstance\`, \`DescribeMySQLInstances\`, \`DestroyMySQLInstance\`\n\n⚠️ CloudRun (CloudBase Run) must use the tcbr service (CreateCloudRunEnv / CreateCloudRunServer / DescribeEnvBaseInfo / DescribeCloudRunEnvs, version="2022-02-17"); legacy tcb small-tenant APIs such as CreateCloudBaseRunResource are disabled; use manageCloudRun for deploys. Use DescribeEnvBaseInfo (EnvId required) to query a single env's base info / CloudRun provisioning, and DescribeCloudRunEnvs (EnvId optional filter) to query env list / resource info.\n\n⚠️ Region must be passed as the tool-level \`region\` parameter (mapped to X-TC-Region / regional endpoint), not inside params. Region inside params is stripped and used as the top-level region.\n\nWhen destroying an env, the common practice is to pass at least \`EnvId\` and \`BypassCheck: true\`; if the env is already in quarantine, add \`IsForce: true\` per the docs.`,
    tcbForbiddenHint:
      "CloudRun (CloudBase Run) must use the new tcbr flow (CreateCloudRunEnv / CreateCloudRunServer). Do not use legacy tcb small-tenant APIs ({actions}). For new envs, initialize CloudRun first: callCloudApi(service=\"tcbr\", version=\"2022-02-17\", action=\"CreateCloudRunEnv\", params={EnvId:\"...\"}), then create services via manageCloudRun(action=\"deploy\"); to query a single env's base info / CloudRun provisioning use callCloudApi(service=\"tcbr\", version=\"2022-02-17\", action=\"DescribeEnvBaseInfo\", params={EnvId:\"...\"}), and use DescribeCloudRunEnvs for env list / resource info.",
    tcbForbiddenPrefix: "[{service}/{action}] disabled: {hint}",
    serviceNotAllowed:
      "Service {service} is not allowed. Allowed services: {allowed}",
    evalModeNotExposed:
      "{service}/{action} Cloud API is not exposed or does not exist. Please use another API.",
    docGuidanceCloudbase:
      "Prefer the CloudBase API overview {controlPlaneUrl} and the dependent-resource API guide {dependencyUrl}.",
    docGuidanceMonitor:
      "Check the official Cloud Monitor (Tencent Cloud Observability Platform) API docs first: API overview https://cloud.tencent.com/document/product/649/30343 , per-Action docs live under https://cloud.tencent.com/document/api/248/ .",
    docGuidanceGeneric:
      "Check the corresponding official cloud API docs first; if your scenario is actually integrating CloudBase business APIs such as auth/functions/cloudrun/storage/mysqldb over HTTP, prefer OpenAPI / Swagger or searchKnowledgeBase(mode=\"openapi\") instead of guessing control-plane Actions.",
    camAuthGuidance:
      "This is a CAM permission gap. Work out who is missing it before choosing a fix: auth(action=\"status\") shows credential_scope, and callCloudApi(service=\"sts\", action=\"GetCallerIdentity\") shows the actual caller (Type=CAMRole means an assumed role; the UserId carries the role name). When the role is the one missing permission (e.g. TCB_QcsRole), the fix is a policy attached to that role — give the user a cam/role/grant authorization link, built as described in the cloud-api-operations skill, section 3.2. When an account-level identity is the caller, the main account attaches the policy to it (signing in with a Tencent Cloud SecretId/SecretKey makes the caller that identity). An environment-level API Key can only reach the bound environment's data plane; for cross-product calls switch to account-level credentials: auth(action=\"start_auth\", authMode=\"device\"). Also confirm the target resource belongs to the current account.",
    errorInvalidAction:
      "Action `{action}` may not exist or is not publicly available. Do not keep guessing Action names; first confirm the Action actually exists under service=`{service}` in the current API version.",
    errorSuggestedActions: "Possible tcb Actions: {candidates}.",
    errorRegionParam:
      "Region is not an Action body parameter. Use the callCloudApi top-level region parameter (e.g. region=\"ap-singapore\"), which maps to X-TC-Region.",
    errorParameterMismatch:
      "Request parameter names do not match the API definition; check the field names (case-sensitive) and remove unsupported fields.",
    errorParamKeys: "Common parameter keys: {keys}",
    errorRequiredKeys: "Required parameters: {keys}",
    errorTcbEntryHint: "`{action}` {paramHint}.",
    errorTcbEntryHintKeys: "`{action}` common parameter keys: {keys}.",
    errorParamsTypeHint: "Parameter type reference:\n```ts\n{paramsType}\n```",
    errorInvalidValueIntro:
      "Request parameter value is malformed or out of range. Check:",
    errorInvalidValue1: "1. String params are not empty or contain illegal characters",
    errorInvalidValue2: "2. Numeric params are within allowed ranges",
    errorInvalidValue3: "3. Enum values use correct casing",
    errorInvalidValue4: "4. Required params have values",
    errorInvalidValueTypeIntro: "Parameter type reference:",
    errorNetwork:
      "Network request failed; retry later and check local network/proxy settings. The request goes to https://{service}.tencentcloudapi.com (the service is in the allow-list), so an unreachable regional endpoint also surfaces as a lookup failure — check region as well.",
    errorGenericFallback:
      "Check service/action/params against the official API docs and retry.",
    errorBuild:
      "[{service}/{action}] call failed: {baseMessage}\nSuggestions: {suggestions}\nReferences: CloudBase API overview {controlPlaneUrl}\nDependent-resource API guide {dependencyUrl}",
    "schema.service":
      "Tencent Cloud product identifier. **The value must come from this field's enum allow-list ({count} entries)** and determines the request domain https://<service>.tencentcloudapi.com. Values outside the list are rejected; do not invent one. COS is not part of the Cloud API system. See the cloud-api-operations skill for product-to-Action mappings. Always use tcbr for CloudBase Run.",
    "schema.action":
      "The exact Action name defined by the official API for the selected service. **If uncertain, consult the official documentation first; do not guess with synonyms or legacy names** (an incorrect guess is reported by the server as action invalid and is difficult to diagnose). See the cloud-api-operations skill for common Actions.",
    "schema.version":
      "API version (optional in most cases). Products with **exactly one official version in the allow-list are filled automatically**, so do not pass it. These multi-version products require an explicit version; omitting it returns an error with the available options: {services}. Examples: service=\"tcbr\", version=\"2022-02-17\", action=\"CreateCloudRunEnv\", params={EnvId:\"env-xxx\",PackageType:\"Standard\"}; service=\"monitor\" requires \"2018-07-24\" for the alert-policy Action family.",
    "schema.params":
      "Parameter object for the Action. Keys must match the official API definition; consult the documentation if uncertain. **Do not put Region here**; use the top-level region parameter for cross-region requests. For CloudBase business APIs, prefer searchKnowledgeBase(mode=\"openapi\") instead of this tool. See the cloud-api-operations skill for examples.",
    "schema.region":
      "Cloud API region (X-TC-Region), such as ap-shanghai. Cross-region requests must pass this top-level parameter, not put it in params. ⚠️ ap-singapore exists on both the domestic and international sites. When the site is unspecified, the international site (site=intl) is used. To operate a domestic-site environment in that region, first call auth(action=\"start_auth\", site=\"domestic\") or set TCB_SITE=domestic.",
  },
);
