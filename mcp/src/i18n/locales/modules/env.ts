import { defineModule } from "../types.js";

export const env = defineModule(
  {
    // ---- 工具级 meta（description/title 由 server.ts 注册包装层按词典 key 解析）----
    authTitle: "CloudBase 开发阶段登录与环境",
    authDescription:
      "CloudBase（腾讯云开发）开发阶段登录与环境绑定。登录后即可访问云资源；环境(env)是云函数、数据库、静态托管等资源的隔离单元，绑定环境后其他 MCP 工具才能操作该环境。支持：查询状态、发起登录、API Key登录、绑定环境(set_env)、退出登录。auth(status) 会返回 credential_scope（account=账号级 / single_env=环境级 API Key）与当前 region；环境级 API Key 只能看到绑定的 envId，查不到其他地域环境是权限边界而非环境不存在。可选 site/region/lang 参数：site=站点(domestic/intl)，region=地域，lang=输出语言(zh/en)。",
    queryTitle: "CloudBase 环境查询",
    queryDescription:
      "查询 CloudBase 环境相关信息，支持查询环境列表、指定环境详情、安全域名、资源用量与监控指标。（曾用名：envQuery、listEnvs、getEnvInfo、getEnvAuthDomains）当 action=list 时，会按 DescribeEnvs 语义做列表/筛选，标准返回字段为 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault，并支持通过 fields 白名单裁剪这些字段；aliasExact=true 时会按别名精确筛选，避免把前缀相近的环境误当作候选；即使传入 envId，action=list 也只返回摘要，不会返回完整资源明细或 expiry。账号级登录可传 region（ap-shanghai/ap-guangzhou/ap-singapore）查询对应地域，对齐 CLI `tcb env list -r <region>`；环境级凭证（API Key / 托管授权 token）只能看到绑定的 envId，返回 credential_scope=single_env，此时 region 不参与查询会在 ignored_params 中如实说明（AppliedFilters.region 为 null），不要误判为环境不存在或地域过滤失效。如需查询某个已知 EnvId 对应环境的详细信息（包括资源字段和计费信息），必须使用 action=info 并传入目标环境的 envId 参数。action=info 会在可用时补充 BillingInfo（如 ExpireTime、PayMode、IsAutoRenew 等计费字段）。\n\n📊 action=usage 对齐 tcb env usage/info：透传 Manager SDK describeEnvAccountCircle + describeCreditsUsageDetail，返回计费周期与各模块资源点用量（FLEXDB/SCF/COS 等）。envId 必填；type 可选过滤模块；未传 startDate/endDate 时自动使用当前计费周期。\n\n📈 action=metrics 对齐 TCB DescribeCurveData（manager.monitor.describeCurveData，不是云监控 GetMonitorData）：查询环境/网关 QPS、云函数调用与错误、数据库 CPU/内存/磁盘、云托管 CPU/QPS 等时序。envId 与 metricName 必填；startTime/endTime 格式 YYYY-MM-DD HH:mm:ss，须成对传入，不传则默认最近 24 小时；period 仅 300/3600/86400。GatewayTraceEnvQPS 未传 resourceID 时自动填环境级 all|:|all|:|all|:|all；云托管 Tke* 指标必须传服务名 resourceID。禁止用 callCloudApi 猜测监控 Action。\n\n🔍 action=info 还会派生三个用于后端选型的字段：\n- `EnvInfo.RuntimeMode`：'postgresql' 或 'nosql'，表示新业务建议默认使用的后端（PG 已开通时为 postgresql，否则为 nosql）。\n- `EnvInfo.RuntimeBackends`：`{postgresql, nosql, mysql}` 三个布尔值，描述当前环境实际并存的后端。\n- `EnvInfo.RuntimeModeHints`：每个后端对应的 API/工具/skill 提示。\n\n🌐 action=info 还会在不改写 `StaticStorages[].StaticDomain`（云 API 名义域名）的前提下，投影网关路由 Enable 状态：`StaticStorages[].staticDomainRouteEnabled` 与 `EnvInfo.staticDomainRouteEnabled`（与 queryHosting websiteConfig 同源）。`false` 表示默认静态域名根路由已禁用（访问会返回 GATEWAY_ROUTE_DISABLED），勿把名义域名当成可达 URL。\n\nAI 在写业务/权限/存储代码前必须先看这三项：PG 模式下新业务推荐 `app.rdb()` + RLS（`managePgDatabase action=execute` 跑 `CREATE POLICY`）+ pgstore；已存在的 NoSQL 集合 / 旧 storage / `managePermissions(resourceType=\"noSqlDatabase\")` 在 PG 环境下仍然有效。真正不适用的是 MySQL：当 `RuntimeBackends.mysql === false` 时，`manageMysqlDatabase` / `queryMysqlDatabase` / `relational-database-mcp-cloudbase` skill 都不该使用。",
    envQueryDeprecatedNotice:
      "\n\n⚠️ DEPRECATED：此工具名已废弃，是 queryEnv 的旧词序别名，入参与 action 完全一致。请直接调用 queryEnv；本别名将在下个版本移除。",
    domainTitle: "CloudBase 环境安全域名管理（浏览器 CORS 白名单）【已废弃】",
    domainDescription: "⚠️ DEPRECATED：此工具已废弃并收编进 manageEnv，请改用 manageEnv(action=\"addSecurityDomain\") / manageEnv(action=\"removeSecurityDomain\")（入参 domains 完全一致）。本别名将在下个版本移除。\n\n管理【环境安全域名】＝浏览器跨域（CORS）白名单：控制允许哪些网页 origin（host:port）从浏览器直接调用本环境的 CloudBase 资源。只做 CORS 来源验证，不提供访问域名，不涉及 HTTPS 证书。⚠️ 与【网关自定义域名】是两套完全独立的配置，互不相干：如需给自己的域名绑定 HTTPS 访问入口（云托管 / 网关服务），那属于 manageGateway 的职责——先 queryGateway(listCustomDomains)；已有域名则 manageGateway(createRoute) 显式传 domain（无需证书）；仅首次绑定新域名才用 bindCustomDomain（需 certificateId）。不要用本工具做这件事。\n\n操作指引：（原工具名 createEnvDomain/deleteEnvDomain，为兼容旧 AI 规则可继续使用这些名称）当浏览器 Web 应用需要从本地 Vite / dev server 直接访问 CloudBase 资源时，先用 queryEnv(action=domains) 检查当前实际浏览器 origin 对应的 host:port 是否已在白名单中，再按该实际值添加。新增或删除后请每约 10 秒轮询 queryEnv(action=domains) 确认状态收敛，勿一次 sleep 满 10 分钟；多数环境数分钟内可收敛。",
    manageTitle: "CloudBase 环境管理（创建/变配/续费/安全域名）",
    manageDescription: "管理 CloudBase 环境，支持：listPackages=查询可选套餐列表，create=创建新环境（需确认），modifyPlan=变更套餐（升降配，需确认），renew=续费环境（需确认），addSecurityDomain=添加环境安全域名（浏览器 CORS 白名单，不计费、无需确认），removeSecurityDomain=删除环境安全域名（不计费、无需确认）。\n\n⚠️ 涉及费用的操作（create/modifyPlan/renew），执行前必须展示配置摘要并等待用户通过 confirm=\"yes\" 确认；安全域名操作（addSecurityDomain/removeSecurityDomain）不计费，无需 confirm。\n\nℹ️ 安全域名＝浏览器跨域（CORS）白名单，控制允许哪些网页 origin（host:port）从浏览器直接调用本环境的 CloudBase 资源，不提供访问域名、不涉及 HTTPS 证书。给自己的域名绑定 HTTPS 访问入口（云托管/网关服务）属于 manageGateway（listCustomDomains/bindCustomDomain）的职责，与本工具无关。",

    // ---- action=usage 入参校验 ----
    "usage.invalidModules": "无效的用量模块 type: {invalid}。可选值：{allowed}",
    "usage.datePairRequired":
      "查询资源用量时 startDate 与 endDate 必须同时提供，格式为 YYYY-MM-DD。",
    "usage.dateFormatInvalid": "startDate / endDate 格式必须为 YYYY-MM-DD。",
    "usage.dateOrderInvalid": "startDate 不能晚于 endDate。",
    "usage.dateRangeUnresolvable":
      "无法从计费周期推导用量日期范围。请显式传入 startDate/endDate（YYYY-MM-DD），或确认环境计费周期可用。",
    "usage.envIdRequired":
      "查询资源用量时 envId 为必填参数。请先调用 queryEnv(action=\"list\") 获取 EnvId，再调用 queryEnv(action=\"usage\", envId=\"<EnvId>\")。",

    // ---- action=metrics 入参校验 ----
    "metrics.nameRequired": "查询监控指标时 metricName 为必填参数。可选值：{allowed}",
    "metrics.nameInvalid": "无效的 metricName: {metricName}。可选值：{allowed}",
    "metrics.periodInvalid": "period 仅支持 300、3600、86400（秒）。当前值：{period}",
    "metrics.timePairRequired":
      "查询监控指标时 startTime 与 endTime 必须同时提供，格式为 YYYY-MM-DD HH:mm:ss。",
    "metrics.timeFormatInvalid": "startTime / endTime 格式必须为 YYYY-MM-DD HH:mm:ss。",
    "metrics.timeUnparsable": "startTime / endTime 无法解析为有效时间。",
    "metrics.timeRangeTooShort":
      "结束时间需要晚于开始时间至少五分钟（监控最小粒度为 5 分钟）。",
    "metrics.resourceIdRequired":
      "查询 {metricName} 时 resourceID 为必填（云托管服务名）。请先 queryCloudRun(action=\"list\") 获取服务名后再查询。",
    "metrics.envIdRequired":
      "查询监控指标时 envId 为必填参数。请先调用 queryEnv(action=\"list\") 获取 EnvId，再调用 queryEnv(action=\"metrics\", envId=\"<EnvId>\", metricName=\"GatewayTraceEnvQPS\")。",
    "metrics.curveUnsupported":
      "当前 CloudBase Manager 不支持 monitor.describeCurveData。请升级 @cloudbase/manager-node。",

    // ---- 本地开发安全域名提示 ----
    "domainHint.requiredValue": "当前浏览器实际访问 origin 对应的 host:port",
    "domainHint.deriveFromOrigin": "浏览器地址栏中的当前 origin",
    "domainHint.deriveFromDevServer": "本地 dev server 实际启动输出",
    "domainHint.note":
      "如果你的前端运行在自定义域名或本地开发端口上，请把当前浏览器实际访问地址对应的 host:port 加入安全域名。不要依赖一组固定默认端口，也不要假设已有 localhost/127.0.0.1 条目已经覆盖当前运行端口。",
    "domainStatus.note":
      "此查询不会自动知道你当前浏览器实际使用的自定义域名或本地端口。即使已经存在一些 localhost/127.0.0.1 条目，也不能据此认定浏览器上传已就绪。若浏览器 Web 应用需要直接上传文件到 CloudBase，请先确认并添加当前访问地址对应的 host:port，再依赖 app.uploadFile()。",
    "domainStatus.nextStepNote":
      "请把占位符替换为当前浏览器实际访问 origin 对应的 host:port，再执行添加。manageEnv(action=addSecurityDomain) 即原 envDomainManagement(create)。",

    // ---- 安全域名变更结果 ----
    "domainResult.createMessage":
      "安全域名已提交添加请求。该变更通常需要数分钟传播（平台侧）；请每 10 秒轮询 queryEnv(action=\"domains\") 直到 Status 为 ENABLE，勿一次 sleep 满 10 分钟。",
    "domainResult.createSuccess":
      "目标域名出现在 queryEnv(action=\"domains\") 返回中，且 Status 为 ENABLE。",
    "domainResult.deleteMessage":
      "安全域名已提交删除请求。该变更通常需要数分钟传播；请每 10 秒轮询 queryEnv(action=\"domains\") 直到目标域名不再出现，勿一次 sleep 满数分钟。",
    "domainResult.deleteSuccess":
      "目标域名不再出现在 queryEnv(action=\"domains\") 返回中。",
    "domain.unsupportedActionType": "不支持的操作类型: {action}",
    "domain.operationFailed": "域名管理操作失败: {message}",

    // ---- Device Flow 授权提示 ----
    "deviceAuth.heading": "### Device Flow 授权信息",
    "deviceAuth.uriNotice":
      "请优先向用户展示完整的 `verification_uri_complete`，不要截断或改写 URL。",

    // ---- 凭据权限边界 ----
    "credential.singleEnvNote":
      "当前为环境级凭证登录（单环境权限，API Key 或托管授权 token）。只能访问已绑定的 envId{pinnedEnvId}，看不到账号下其他环境或其他地域。这是凭据权限边界，不是环境不存在。queryEnv(action=\"list\") 会自动降级为仅返回绑定环境的信息。",
    "credential.accountNote":
      "当前为账号级登录。DescribeEnvs 按地域查询；未传 region 时使用当前地域 {currentRegion}。其他地域请用 queryEnv(action=\"list\", region=\"ap-singapore\")，或 CLI: tcb env list -r ap-singapore。",
    "apiKey.camLimitation":
      "\n\n⚠️ 注意：该 API Key 换取的临时凭据无法调用管理面 API（CAM 鉴权不通过），管理类工具（queryEnv、queryAppAuth、manageAppAuth 等）将不可用。如需完整能力，请改用长期密钥 TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY 认证。",

    // ---- 登录后环境准备 ----
    "prepare.envReady": "当前已登录，环境: {envId}",
    "prepare.autoBound": "当前已登录，已自动绑定唯一环境: {envId}",
    "prepare.multipleEnvs": "当前已登录，但存在多个可用环境，请先选择环境。",
    "prepare.tcbInitFailed": "CloudBase 服务初始化失败，请稍后重试。",
    "prepare.autoCreated": "当前已登录，已自动创建并绑定环境: {envId}",
    "prepare.envCreateFailed": "环境创建失败，请稍后重试或手动创建环境。",

    // ---- 环境列表 ----
    "list.currentEnvOnlyNote":
      "已绑定环境，list 默认只返回当前环境。要查看其他地域请传 region（例如 region=\"ap-singapore\"），或使用 CLI: tcb env list -r ap-singapore。",
    "list.singleEnvDegradedNote":
      "当前凭证为环境级（托管授权凭证绑定 {envId}），账号级环境列表接口无权限，已降级为仅返回绑定环境的信息。如需查看账号下全部环境，请用有账号级权限的凭证登录。",

    // ---- queryEnv 错误增强 ----
    "queryError.paramHeader": "参数错误：请求未通过服务端的参数校验，请检查本次调用的入参：",
    "queryError.paramItem1": "1. 各参数取值是否在允许范围内（枚举值、时间粒度、数量上限等）",
    "queryError.paramItem2": "2. 各参数格式是否正确，需要成对传入的参数是否齐全",
    "queryError.paramItem3": "3. 必填参数是否都已提供，参数名与类型是否正确",
    "queryError.paramItem4": "4. 修正参数后重新调用 queryEnv(action=\"{action}\")",
    "queryError.authHeader": "认证错误：当前未登录或认证已过期。",
    "queryError.authAdvice":
      "建议先执行 auth(action=\"status\") 查看状态，然后按提示完成登录。",
    "queryError.permissionHeader": "权限错误：当前账号可能没有访问该资源的权限。",
    "queryError.permissionAdvice": "请确认：1) 已选择正确的环境 2) 账号有对应权限",
    "queryError.envHeader": "环境错误：指定的环境不存在或无法访问。",
    "queryError.envAdvice": "请使用 queryEnv(action=\"list\") 查看可用的环境列表。",
    "queryError.network": "网络错误：请检查网络连接，稍后重试。",
    "queryError.usageHeader": "查询环境资源用量失败，建议：",
    "queryError.stepAuthStatus":
      "1. 先调用 auth(action=\"status\") 确认登录状态；未登录则 auth(action=\"start_auth\")",
    "queryError.stepListEnv": "2. 使用 queryEnv(action=\"list\") 确认 envId 正确且可访问",
    "queryError.usageStep3":
      "3. 再调用 queryEnv(action=\"usage\", envId=\"<EnvId>\")；可用 type 过滤模块（{modules}）",
    "queryError.metricsHeader": "查询环境监控指标失败，建议：",
    "queryError.metricsStep3":
      "3. 再调用 queryEnv(action=\"metrics\", envId=\"<EnvId>\", metricName=\"GatewayTraceEnvQPS\")；metricName 可选值：{names}",
    "queryError.metricsStep4":
      "4. startTime/endTime 格式为 YYYY-MM-DD HH:mm:ss，须成对传入；period 仅 300/3600/86400",
    "queryError.generalHeader": "查询环境信息时出错，建议：",
    "queryError.generalStep1": "1. 先调用 auth(action=\"status\") 确认登录状态",
    "queryError.generalStep2": "2. 如未登录，执行 auth(action=\"start_auth\") 完成认证",
    "queryError.generalStep3": "3. 确认环境 ID 正确且可访问",
    "queryError.wrapper":
      "[queryEnv/{action}] 调用失败: {message}\n\n解决建议：\n{suggestions}",
    "queryError.unsupportedAction": "不支持的查询类型: {action}",

    // ---- 询价格式化 ----
    "price.empty": "询价返回为空",
    "price.missingTotal": "询价返回缺少总价字段",
    "price.estimatedReal": "预计实付 {currency}{amount}",
    "price.estimated": "预计费用 {currency}{amount}",
    "price.refundOnly": "退款 {currency}{amount}",
    "price.refundSuffix": "，退款 {currency}{amount}",
    "price.lineRealTotal": "- 实付总价: {currency}{amount}",
    "price.lineTotal": "- 总价: {currency}{amount}",
    "price.lineOriginal": "- 原价: {currency}{amount}",
    "price.lineUnit": "- 单价: {currency}{amount}",
    "price.lineDuration": "- 时长: {timeSpan} {timeUnit}",
    "price.lineRefund": "- 退款: {currency}{amount}（变配降级时退回差价）",
    "price.lineFormula": "- 计价公式: {formula}",

    // ---- 释放方式 / 文档链接 / 计费披露 ----
    "release.method": "手动销毁",
    "release.note":
      "环境创建后可随时销毁以停止计费。当前 manageEnv 未提供 destroy action，请前往控制台手动销毁，或调用 manageEnv(action=\"listPackages\") 查看其他套餐。",
    "docLink.package": "包年包月套餐说明",
    "docLink.billingItems": "计费能力项说明",
    "docLink.resourcePointPrice": "资源点价格文档",
    "docLink.prepayExpiry": "预付费计费与到期释放（费用中心通用）",
    "docLink.header": "参考文档：\n{entries}",
    resourceListText:
      "资源清单：\n- 云开发环境 ×1（含 云数据库 / 云函数 / 云存储 / 静态托管 / 身份认证 等基础资源）",
    billingItemsText:
      "计费项：\n- 数据库容量/调用 · 云函数调用/资源/流量 · 存储读写/CDN · 网关/认证/API 调用 · QPS 超限按量 · 日志",
    "billingMode.free":
      "计费方式：\n- 免费体验版（每月赠送约 3000 资源点 ≈ 3 元，0 元开通）\n- 付费套餐：个人版 / 标准版 / 企业版 / 企业高级版",
    "billingMode.paid":
      "计费方式：\n- 付费套餐：个人版 / 标准版 / 企业版 / 企业高级版\n- 免费体验版通过 auth 工具自动创建；本次 manageEnv(create) 不会创建免费版",
    "releaseDetail.header": "资源释放方式：\n- 可随时在控制台销毁环境、关闭按量、退订加购资源",
    "releaseDetail.free":
      "- 免费体验版：有效期 1 个月，到期可免费续期 1 个月；未续期则停服(保留数据)→1~7天回收站→释放(数据不可恢复)",
    "releaseDetail.paidExpiry":
      "- 付费套餐到期未续费：停服(保留数据)→1~7天可回收站找回→释放(数据不可恢复)",
    "releaseDetail.paidManual": "- 主动销毁：随时生效；销毁前请确保已迁移或备份数据",
    "pricing.header": "预计费用：",
    "pricing.freeLine": "- 免费体验版：本次开通 0 元；超免费额度后需升级为付费套餐（免费版不支持开按量）",
    "pricing.freeUnit": "- 实际单价以资源点价格文档为准（3000 资源点 ≈ 3 元）",
    "pricing.paidLine": "- 付费套餐：{summary}",
    "pricing.inquiryFailed": "⚠️ 询价失败（{error}），请前往控制台确认",
    "pricing.partialMissing": "- ⚠️ 部分明细缺失：{error}",
    "pricing.period": "- 计费周期：约 {period} 个月（包年包月），到期可续费或变配",
    "pricing.overage": "- 超额可另开按量（次日结算），详细计费项以官方文档为准",

    // ---- auth 工具输出 ----
    "auth.actionNotSupported": "当前 IDE 不支持 auth(action=\"{action}\")。",
    "auth.invalidSite": "site 取值无效：{site}。可选值：domestic（国内站）、intl（国际站）。",
    "auth.devicePending":
      "设备码授权进行中，请完成浏览器授权后再次调用 auth(action=\"status\")",
    "auth.notLoggedInCodeBuddy":
      "当前未登录。CodeBuddy 暂不支持在 tool 内发起认证，请在外部完成认证后再次调用 auth(action=\"status\")。",
    "auth.notLoggedIn": "当前未登录，请先执行 auth(action=\"start_auth\")",
    "auth.notLoggedInPeriod": "当前未登录，请先执行 auth(action=\"start_auth\")。",
    "auth.apiKeyAutoLogin": "当前使用 API Key 认证模式，已自动完成登录，无需手动授权。",
    "auth.apiKeyEnvExchangeFailed": "当前配置了 API Key 认证模式，但换取临时密钥失败。",
    "auth.apiKeyDiagEnv":
      "\n\n诊断信息：\n- CLOUDBASE_ENV_ID: {envId}\n- CLOUDBASE_API_KEY: {apiKeyPrefix}...（已截断）\n- TCB_SITE: {site}\n- 换取网关地域: {gatewayRegion}\n- Endpoint: {endpoint}\n\n可能原因：\n1. API Key 已过期或被删除\n2. Endpoint 不可达（网络/DNS 问题）\n3. CLOUDBASE_ENV_ID 与 API Key 所属环境不匹配\n4. API Key 与站点不匹配：国际站环境的 Key 需配置 TCB_SITE=intl（走 ap-singapore 网关）；国内站环境（含 ap-guangzhou/ap-singapore 地域）不要配置 intl\n\n建议：检查 MCP 配置中的 CLOUDBASE_API_KEY（或兼容的 CLOUDBASE_APIKEY）和 CLOUDBASE_ENV_ID 环境变量是否正确。",
    "auth.gatewayRegionDefault": "ap-shanghai（国内站默认，多地域环境均经其路由）",
    "auth.siteUnset": "(未设置)",
    "auth.devicePendingBrowser":
      "设备码授权进行中，请在浏览器中打开 verification_uri 并输入 user_code 完成授权。",
    "auth.deviceInitFailed": "设备码登录初始化失败: {message}",
    "auth.deviceCodeMissing": "未获取到设备码信息，请重试设备码登录",
    "auth.deviceStarted":
      "已发起设备码登录，请在浏览器中打开 verification_uri 并输入 user_code 完成授权。授权完成后请再次调用 auth(action=\"status\")。",
    "auth.loginStateMissing": "未获取到登录态，请先完成认证",
    "auth.apiKeyArgsRequired": "action=login_by_api_key 时必须同时提供 apiKey 和 envId。",
    "auth.apiKeySuccess": "API Key 认证成功，已获取临时密钥。",
    "auth.apiKeyExchangeFailed": "API Key 换取临时密钥失败。",
    "auth.apiKeyDiagLogin":
      "\n\n诊断信息：\n- CLOUDBASE_ENV_ID: {envId}\n- CLOUDBASE_API_KEY: {apiKeyPrefix}...（已截断）\n- TCB_SITE: {site}\n\n可能原因：\n1. API Key 已过期或被删除\n2. CLOUDBASE_ENV_ID 与 API Key 所属环境不匹配\n3. API Key 与站点不匹配：国际站环境的 Key 需配置 TCB_SITE=intl（走 ap-singapore 网关）；国内站环境（含 ap-guangzhou/ap-singapore 地域）不要配置 intl\n4. 网络连接问题\n\n建议：请检查 API Key 和环境 ID 是否正确。",
    "auth.apiKeyException": "API Key 认证异常: {message}",
    "auth.setEnvIdRequired": "action=set_env 时必须提供 envId",
    "auth.credentialScopeLimited":
      "当前为环境级 API Key 登录，只能绑定已授权环境 {pinnedEnvId}，不能切换到 {envId}。这是凭据权限边界，不是目标环境不存在。",
    "auth.envReady": "环境设置成功，当前环境: {envId}",
    "auth.envReadyWithHint": "环境设置成功，当前环境: {envId}{regionHint}",
    "auth.regionHint": "，地域: {region}",
    "auth.regionHintUnverified":
      "。未在当前探测地域中确认该 envId，已按唯一 ID 直绑；若后续接口仍指向错误地域，请设置 TCB_REGION 或 queryEnv(action=\"list\", region=...)",
    "auth.logoutNotAllowedApiKey":
      "当前使用 API Key 认证模式，不支持退出登录。如需切换认证方式，请移除 CLOUDBASE_API_KEY（或兼容的 CLOUDBASE_APIKEY）环境变量后重启。",
    "auth.logoutConfirmRequired": "action=logout 时必须传 confirm=\"yes\"",
    "auth.loggedOut": "✅ 已退出登录",
    "auth.tempCredNotLoggedIn": "当前未登录，请先完成管理端认证后再获取临时密钥。",
    "auth.tempCredConfirmRequired":
      "action=get_temp_credentials 时必须显式传 confirm=\"yes\"，以确认你要导出当前管理端临时密钥。",
    "auth.tempCredUnsupportedType":
      "当前登录态不是可导出的临时密钥。仅支持通过 Web / device 登录得到的临时密钥，永久密钥登录不允许导出。",
    "auth.tempCredIncomplete": "当前登录态缺少完整的临时密钥字段，请重新登录后再试。",
    "auth.tempCredReadyReveal": "当前管理端临时密钥已准备好，请注意避免泄露。",
    "auth.tempCredReadyMasked": "当前管理端临时密钥已准备好，默认仅返回脱敏结果。",
    "auth.unsupportedAction": "不支持的 auth action: {action}",
    "auth.internalError": "auth 执行失败: {message}",

    // ---- manageEnv 输出 ----
    "manage.packagesSuccess": "成功获取可选套餐列表。",
    "manage.missingPackageIdForPrice": "缺少 packageId，无法询价",
    "manage.createHeader": "即将为你开通云开发环境",
    "manage.createNotice": "本操作会创建腾讯云开发环境资源。",
    "manage.createFreeNote":
      "为付费套餐后才会产生费用；免费体验版不会立即扣费（每月赠送约 3000 资源点 ≈ 3 元）。",
    "manage.createConfirmPrompt": "请核对以下配置信息后传入 confirm=\"yes\"：",
    "manage.createAlias": "- 别名: {alias}",
    "manage.createPackage": "- 套餐: {packageId}",
    "manage.createResources": "- 资源类型: {resources}",
    "manage.createDuration": "- 时长: {duration} 个月",
    "manage.createRegionNote":
      "- 说明: CreateEnv 不接受 Region 入参，环境地域由账号与套餐侧决定。",
    "manage.createAck": "☐ 我已知晓将创建付费资源及计费规则，确认按上述配置开通。",
    "manage.createCancelNote": "（如需取消或修改，请勿传 confirm=\"yes\"，改传其他参数重试）",
    "manage.createAckText": "我已知晓将创建付费资源及计费规则",
    "manage.createAliasRequired": "创建环境时 alias（环境别名）为必填参数",
    "manage.createPackageRequired": "创建环境时 packageId（套餐 ID）为必填参数",
    "manage.createSuccess":
      "环境创建成功！新环境 ID: {envId}。环境初始化可能需要几分钟，请通过 queryEnv(action=\"info\", envId=\"{envId}\") 轮询直到 Status 为正常。",
    "manage.notProvided": "(未提供)",
    "manage.unknownValue": "(未知)",
    "manage.modifyArgsRequired": "变更套餐时 envId 和 packageId 为必填参数",
    "manage.modifyHeader":
      "变更环境 {envId} 的套餐需要您确认。变配后不会立即重新计费，但会触发差价结算或退款。",
    "manage.confirmPrompt": "请核对后传入 confirm=\"yes\"：",
    "manage.currentPackage": "- 当前套餐: {packageName}",
    "manage.currentExpireTime": "- 当前到期时间: {expireTime}",
    "manage.newPackage": "- 新套餐: {packageId}",
    "manage.modifyPriceChange": "预计费用变化：{summary}（差价/退款以账单为准）",
    "manage.modifyPriceFailed": "预计费用变化：⚠️ 询价失败（{error}），请前往控制台确认价格",
    "manage.modifyPriceEmpty": "预计费用变化：询价返回为空，请前往控制台确认价格",
    "manage.modifyAck": "☐ 我已知晓变配将触发差价结算或退款，确认按上述配置变更。",
    "manage.cancelNote": "（如需取消或修改，请勿传 confirm=\"yes\"）",
    "manage.modifyAckText": "我已知晓变配将触发差价结算或退款",
    "manage.modifyEnvIdRequired": "变更套餐时 envId 为必填参数",
    "manage.modifyPackageIdRequired": "变更套餐时 packageId 为必填参数",
    "manage.modifySuccess": "环境 {envId} 的套餐已成功变更为 {packageId}。",
    "manage.renewEnvIdRequired": "续费环境时 envId 为必填参数",
    "manage.renewHeader": "续费环境 {envId} 需要您确认。续费按当前套餐类型计算，延长到期时间。",
    "manage.renewDuration": "- 续费时长: {duration} 个月",
    "manage.renewPrice": "预计费用：{summary}",
    "manage.renewPriceFailed": "预计费用：⚠️ 询价失败（{error}），请前往控制台确认价格",
    "manage.renewPriceEmpty": "预计费用：询价返回为空，请前往控制台确认价格",
    "manage.renewAck": "☐ 我已知晓续费将延长当前套餐的到期时间，确认按上述配置续费。",
    "manage.renewAckText": "我已知晓续费将延长当前套餐的到期时间",
    "manage.renewSuccess": "环境 {envId} 已成功续费 {duration} 个月。",
    "manage.wxideDomainUnsupported":
      "微信开发者工具场景不提供环境安全域名管理。如需配置浏览器 CORS 白名单，请使用其他接入方式（CloudBase MCP / 控制台）。",
    "manage.domainsRequired":
      "action={action} 时 domains 为必填参数（host:port 数组，例如 [\"localhost:5173\"]）。添加前建议先用 queryEnv(action=\"domains\") 检查浏览器实际 origin 是否已在白名单中。",
    "manage.unsupportedAction":
      "不支持的操作: {action}。支持的操作: listPackages, create, modifyPlan, renew, addSecurityDomain, removeSecurityDomain。",
    "manage.listPackagesFailed":
      "查询套餐列表失败（计费标签 BillTags）：{message}。可改用控制台查看套餐，或直接使用已知 packageId（如 baas_personal）调用 manageEnv(action=\"create\")。",
    "manage.operationFailed": "环境管理操作失败: {message}",
  },
  {
    // ---- Tool-level meta ----
    authTitle: "CloudBase dev-stage login and environment",
    authDescription:
      "CloudBase (Tencent CloudBase) dev-stage login and environment binding. After login you can access cloud resources; an environment (env) is the isolation unit for cloud functions, databases, static hosting, etc. Other MCP tools operate on the bound environment. Supports: status, start_auth (login), login_by_api_key, set_env (bind env), logout. auth(status) returns credential_scope (account / single_env API Key) and current region; a single-env API Key can only see its bound envId — missing other-region envs is a permission boundary, not a missing environment. Optional site/region/lang params: site=domestic|intl, region=e.g. ap-shanghai|ap-singapore, lang=zh|en output language.",
    queryTitle: "Query CloudBase environments",
    queryDescription:
      "Query CloudBase environment information: environment list, details of a specific environment, security domains, resource usage and monitoring metrics. (Former names: envQuery, listEnvs, getEnvInfo, getEnvAuthDomains) When action=list, listing/filtering follows DescribeEnvs semantics; the standard returned fields are EnvId, Alias, Status, EnvType, Region, PackageId, PackageName, IsDefault, and those fields can be trimmed via the fields whitelist; aliasExact=true filters by exact alias so environments with similar prefixes are not mistaken for candidates; even when envId is passed, action=list still returns only a summary, never full resource details or expiry. Account-level logins may pass region (ap-shanghai/ap-guangzhou/ap-singapore) to query that region, matching CLI `tcb env list -r <region>`; an env-level credential (API Key / hosted authorization token) can only see its bound envId and returns credential_scope=single_env; in that case region plays no part in the query and is reported as such in ignored_params (AppliedFilters.region is null) — do not mistake that for a missing environment or a region filter that failed to apply. To query details of a known EnvId (including resource fields and billing info), you must use action=info and pass the target environment's envId. action=info appends BillingInfo when available (billing fields such as ExpireTime, PayMode, IsAutoRenew).\n\n📊 action=usage matches tcb env usage/info: it passes through Manager SDK describeEnvAccountCircle + describeCreditsUsageDetail and returns the billing cycle and per-module resource-point usage (FLEXDB/SCF/COS, etc.). envId is required; type optionally filters modules; when startDate/endDate are omitted the current billing cycle is used.\n\n📈 action=metrics matches TCB DescribeCurveData (manager.monitor.describeCurveData, not Cloud Monitor GetMonitorData): query time series for env/gateway QPS, cloud function invocations and errors, database CPU/memory/disk, CloudRun CPU/QPS, and more. envId and metricName are required; startTime/endTime use the format YYYY-MM-DD HH:mm:ss and must be passed as a pair, defaulting to the last 24 hours when omitted; period only supports 300/3600/86400. When resourceID is omitted for GatewayTraceEnvQPS, the env-level all|:|all|:|all|:|all is filled in automatically; CloudRun Tke* metrics must pass the service name as resourceID. Do not use callCloudApi to guess monitoring Actions.\n\n🔍 action=info also derives three fields used for backend selection:\n- `EnvInfo.RuntimeMode`: 'postgresql' or 'nosql', the backend recommended by default for new work (postgresql when PG is enabled, otherwise nosql).\n- `EnvInfo.RuntimeBackends`: the three booleans `{postgresql, nosql, mysql}`, describing the backends that actually coexist in the current environment.\n- `EnvInfo.RuntimeModeHints`: the API/tool/skill hints for each backend.\n\n🌐 action=info also projects the gateway route Enable state without rewriting `StaticStorages[].StaticDomain` (the Cloud API nominal domain): `StaticStorages[].staticDomainRouteEnabled` and `EnvInfo.staticDomainRouteEnabled` (same source as queryHosting websiteConfig). `false` means the default static domain root route is disabled (requests return GATEWAY_ROUTE_DISABLED) — do not treat the nominal domain as a reachable URL.\n\nBefore writing business/permission/storage code, AI must check these three items first: in PG mode, new work should prefer `app.rdb()` + RLS (`managePgDatabase action=execute` running `CREATE POLICY`) + pgstore; existing NoSQL collections / legacy storage / `managePermissions(resourceType=\"noSqlDatabase\")` remain valid in a PG environment. What truly does not apply is MySQL: when `RuntimeBackends.mysql === false`, none of `manageMysqlDatabase` / `queryMysqlDatabase` / the `relational-database-mcp-cloudbase` skill should be used.",
    envQueryDeprecatedNotice:
      "\n\n⚠️ DEPRECATED: This tool name is deprecated. It is the old word-order alias of queryEnv with identical parameters and actions. Call queryEnv directly; this alias will be removed in the next version.",
    domainTitle:
      "CloudBase environment security domain management (browser CORS allowlist) [DEPRECATED]",
    domainDescription:
      "⚠️ DEPRECATED: This tool is deprecated and has been folded into manageEnv. Use manageEnv(action=\"addSecurityDomain\") / manageEnv(action=\"removeSecurityDomain\") instead (the domains parameter is identical). This alias will be removed in the next version.\n\nManages [environment security domains] = the browser cross-origin (CORS) allowlist: it controls which web origins (host:port) may call this environment's CloudBase resources directly from the browser. It only performs CORS origin validation; it does not provide an access domain and does not involve HTTPS certificates. ⚠️ This is completely independent from [gateway custom domains] — the two are unrelated: to bind your own domain as an HTTPS access entry (CloudRun / gateway service), that is manageGateway's job — first queryGateway(listCustomDomains); if a domain already exists, use manageGateway(createRoute) with an explicit domain (no certificate needed); only use bindCustomDomain when binding a brand-new domain for the first time (certificateId required). Do not use this tool for that.\n\nUsage guidance: (the original tool names createEnvDomain/deleteEnvDomain may still be used for compatibility with older AI rules) when a browser web app needs to access CloudBase resources directly from a local Vite / dev server, first use queryEnv(action=domains) to check whether the host:port of the actual current browser origin is already in the allowlist, then add that actual value. After adding or deleting, poll queryEnv(action=domains) about every 10 seconds to confirm the state has converged; do not sleep a full 10 minutes at once — most environments converge within a few minutes.",
    manageTitle: "CloudBase environment management (create/change plan/renew/security domains)",
    manageDescription:
      "Manages CloudBase environments. Supports: listPackages=query available packages, create=create a new environment (confirmation required), modifyPlan=change the package (upgrade/downgrade, confirmation required), renew=renew the environment (confirmation required), addSecurityDomain=add an environment security domain (browser CORS allowlist, not billed, no confirmation needed), removeSecurityDomain=remove an environment security domain (not billed, no confirmation needed).\n\n⚠️ For billed operations (create/modifyPlan/renew) you must show the configuration summary and wait for the user to confirm with confirm=\"yes\" before executing; security domain operations (addSecurityDomain/removeSecurityDomain) are not billed and need no confirm.\n\nℹ️ A security domain = the browser cross-origin (CORS) allowlist; it controls which web origins (host:port) may call this environment's CloudBase resources directly from the browser, does not provide an access domain, and does not involve HTTPS certificates. Binding your own domain as an HTTPS access entry (CloudRun/gateway service) is manageGateway's job (listCustomDomains/bindCustomDomain) and is unrelated to this tool.",

    // ---- action=usage input validation ----
    "usage.invalidModules": "Invalid usage module type: {invalid}. Allowed values: {allowed}",
    "usage.datePairRequired":
      "When querying resource usage, startDate and endDate must both be provided in the format YYYY-MM-DD.",
    "usage.dateFormatInvalid": "startDate / endDate must use the format YYYY-MM-DD.",
    "usage.dateOrderInvalid": "startDate cannot be later than endDate.",
    "usage.dateRangeUnresolvable":
      "Cannot derive the usage date range from the billing cycle. Pass startDate/endDate explicitly (YYYY-MM-DD), or confirm the environment billing cycle is available.",
    "usage.envIdRequired":
      "envId is required when querying resource usage. Call queryEnv(action=\"list\") first to get the EnvId, then call queryEnv(action=\"usage\", envId=\"<EnvId>\").",

    // ---- action=metrics input validation ----
    "metrics.nameRequired":
      "metricName is required when querying monitoring metrics. Allowed values: {allowed}",
    "metrics.nameInvalid": "Invalid metricName: {metricName}. Allowed values: {allowed}",
    "metrics.periodInvalid":
      "period only supports 300, 3600, 86400 (seconds). Current value: {period}",
    "metrics.timePairRequired":
      "When querying monitoring metrics, startTime and endTime must both be provided in the format YYYY-MM-DD HH:mm:ss.",
    "metrics.timeFormatInvalid": "startTime / endTime must use the format YYYY-MM-DD HH:mm:ss.",
    "metrics.timeUnparsable": "startTime / endTime cannot be parsed as valid times.",
    "metrics.timeRangeTooShort":
      "The end time must be at least five minutes later than the start time (the minimum monitoring granularity is 5 minutes).",
    "metrics.resourceIdRequired":
      "resourceID is required when querying {metricName} (the CloudRun service name). Call queryCloudRun(action=\"list\") first to get the service name, then query again.",
    "metrics.envIdRequired":
      "envId is required when querying monitoring metrics. Call queryEnv(action=\"list\") first to get the EnvId, then call queryEnv(action=\"metrics\", envId=\"<EnvId>\", metricName=\"GatewayTraceEnvQPS\").",
    "metrics.curveUnsupported":
      "The current CloudBase Manager does not support monitor.describeCurveData. Please upgrade @cloudbase/manager-node.",

    // ---- Local dev security domain hints ----
    "domainHint.requiredValue": "the host:port of the origin the browser actually uses",
    "domainHint.deriveFromOrigin": "the current origin in the browser address bar",
    "domainHint.deriveFromDevServer": "the actual startup output of the local dev server",
    "domainHint.note":
      "If your frontend runs on a custom domain or a local dev port, add the host:port of the address the browser actually uses to the security domains. Do not rely on a fixed set of default ports, and do not assume existing localhost/127.0.0.1 entries already cover the current running port.",
    "domainStatus.note":
      "This query cannot automatically know the custom domain or local port your browser actually uses. Even when some localhost/127.0.0.1 entries already exist, that does not mean browser uploads are ready. If a browser web app needs to upload files directly to CloudBase, first confirm and add the host:port of the current access address, then rely on app.uploadFile().",
    "domainStatus.nextStepNote":
      "Replace the placeholder with the host:port of the origin the browser actually uses, then perform the add. manageEnv(action=addSecurityDomain) is the former envDomainManagement(create).",

    // ---- Security domain change results ----
    "domainResult.createMessage":
      "The security domain add request has been submitted. This change usually takes a few minutes to propagate (platform side); poll queryEnv(action=\"domains\") every 10 seconds until Status is ENABLE, instead of sleeping a full 10 minutes at once.",
    "domainResult.createSuccess":
      "The target domain appears in the queryEnv(action=\"domains\") response with Status ENABLE.",
    "domainResult.deleteMessage":
      "The security domain delete request has been submitted. This change usually takes a few minutes to propagate; poll queryEnv(action=\"domains\") every 10 seconds until the target domain no longer appears, instead of sleeping several minutes at once.",
    "domainResult.deleteSuccess":
      "The target domain no longer appears in the queryEnv(action=\"domains\") response.",
    "domain.unsupportedActionType": "Unsupported action type: {action}",
    "domain.operationFailed": "Domain management operation failed: {message}",

    // ---- Device Flow authorization hints ----
    "deviceAuth.heading": "### Device Flow authorization info",
    "deviceAuth.uriNotice":
      "Show the full `verification_uri_complete` to the user first; do not truncate or rewrite the URL.",

    // ---- Credential permission boundary ----
    "credential.singleEnvNote":
      "Currently logged in with an env-level credential (single-environment permission, API Key or hosted authorization token). Only the bound envId{pinnedEnvId} is accessible; other environments or regions under the account are not visible. This is a credential permission boundary, not a missing environment. queryEnv(action=\"list\") automatically degrades to returning only the bound environment.",
    "credential.accountNote":
      "Currently logged in at account level. DescribeEnvs queries by region; when region is omitted the current region {currentRegion} is used. For other regions use queryEnv(action=\"list\", region=\"ap-singapore\"), or CLI: tcb env list -r ap-singapore.",
    "apiKey.camLimitation":
      "\n\n⚠️ Note: the temporary credential exchanged from this API Key cannot call management-plane APIs (CAM authorization fails), so management tools (queryEnv, queryAppAuth, manageAppAuth, etc.) will be unavailable. For full capabilities, switch to long-term key authentication with TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY.",

    // ---- Environment preparation after login ----
    "prepare.envReady": "Logged in. Environment: {envId}",
    "prepare.autoBound": "Logged in. Automatically bound the only environment: {envId}",
    "prepare.multipleEnvs":
      "Logged in, but multiple environments are available. Please select an environment first.",
    "prepare.tcbInitFailed": "CloudBase service initialization failed. Please retry later.",
    "prepare.autoCreated": "Logged in. Automatically created and bound the environment: {envId}",
    "prepare.envCreateFailed":
      "Environment creation failed. Please retry later or create an environment manually.",

    // ---- Environment list ----
    "list.currentEnvOnlyNote":
      "An environment is bound, so list returns only the current environment by default. To see other regions pass region (for example region=\"ap-singapore\"), or use CLI: tcb env list -r ap-singapore.",
    "list.singleEnvDegradedNote":
      "The current credential is env-level (hosted authorization credential bound to {envId}) and has no permission for the account-level environment list API, so the result is degraded to only the bound environment. To see all environments under the account, log in with a credential that has account-level permission.",

    // ---- queryEnv error enrichment ----
    "queryError.paramHeader":
      "Parameter error: the request failed server-side parameter validation. Check the arguments of this call:",
    "queryError.paramItem1":
      "1. Whether each value is within the allowed range (enum values, time granularity, count limits, etc.)",
    "queryError.paramItem2":
      "2. Whether each parameter format is correct and whether parameters that must be passed in pairs are complete",
    "queryError.paramItem3":
      "3. Whether all required parameters are provided and whether parameter names and types are correct",
    "queryError.paramItem4":
      "4. After fixing the parameters, call queryEnv(action=\"{action}\") again",
    "queryError.authHeader":
      "Authentication error: currently not logged in, or the authentication has expired.",
    "queryError.authAdvice":
      "Run auth(action=\"status\") first to check the state, then complete the login as prompted.",
    "queryError.permissionHeader":
      "Permission error: the current account may not have permission to access this resource.",
    "queryError.permissionAdvice":
      "Confirm: 1) the correct environment is selected 2) the account has the matching permission",
    "queryError.envHeader":
      "Environment error: the specified environment does not exist or is not accessible.",
    "queryError.envAdvice":
      "Use queryEnv(action=\"list\") to see the list of available environments.",
    "queryError.network": "Network error: check the network connection and retry later.",
    "queryError.usageHeader": "Failed to query environment resource usage. Suggestions:",
    "queryError.stepAuthStatus":
      "1. Call auth(action=\"status\") first to confirm the login state; if not logged in, run auth(action=\"start_auth\")",
    "queryError.stepListEnv":
      "2. Use queryEnv(action=\"list\") to confirm the envId is correct and accessible",
    "queryError.usageStep3":
      "3. Then call queryEnv(action=\"usage\", envId=\"<EnvId>\"); type can filter modules ({modules})",
    "queryError.metricsHeader": "Failed to query environment monitoring metrics. Suggestions:",
    "queryError.metricsStep3":
      "3. Then call queryEnv(action=\"metrics\", envId=\"<EnvId>\", metricName=\"GatewayTraceEnvQPS\"); allowed metricName values: {names}",
    "queryError.metricsStep4":
      "4. startTime/endTime use the format YYYY-MM-DD HH:mm:ss and must be passed as a pair; period only supports 300/3600/86400",
    "queryError.generalHeader": "An error occurred while querying environment information. Suggestions:",
    "queryError.generalStep1": "1. Call auth(action=\"status\") first to confirm the login state",
    "queryError.generalStep2":
      "2. If not logged in, run auth(action=\"start_auth\") to complete authentication",
    "queryError.generalStep3": "3. Confirm the environment ID is correct and accessible",
    "queryError.wrapper":
      "[queryEnv/{action}] call failed: {message}\n\nSuggestions:\n{suggestions}",
    "queryError.unsupportedAction": "Unsupported query type: {action}",

    // ---- Price formatting ----
    "price.empty": "the price inquiry returned empty",
    "price.missingTotal": "the price inquiry response is missing the total price field",
    "price.estimatedReal": "estimated payable {currency}{amount}",
    "price.estimated": "estimated cost {currency}{amount}",
    "price.refundOnly": "refund {currency}{amount}",
    "price.refundSuffix": ", refund {currency}{amount}",
    "price.lineRealTotal": "- Payable total: {currency}{amount}",
    "price.lineTotal": "- Total: {currency}{amount}",
    "price.lineOriginal": "- List price: {currency}{amount}",
    "price.lineUnit": "- Unit price: {currency}{amount}",
    "price.lineDuration": "- Duration: {timeSpan} {timeUnit}",
    "price.lineRefund": "- Refund: {currency}{amount} (price difference returned on downgrade)",
    "price.lineFormula": "- Pricing formula: {formula}",

    // ---- Release method / doc links / billing disclosure ----
    "release.method": "manual destroy",
    "release.note":
      "An environment can be destroyed at any time after creation to stop billing. manageEnv currently provides no destroy action — destroy it manually in the console, or call manageEnv(action=\"listPackages\") to view other packages.",
    "docLink.package": "Monthly/yearly package overview",
    "docLink.billingItems": "Billable capability items",
    "docLink.resourcePointPrice": "Resource point pricing doc",
    "docLink.prepayExpiry": "Prepaid billing and release on expiry (Billing Center general)",
    "docLink.header": "Reference docs:\n{entries}",
    resourceListText:
      "Resource list:\n- CloudBase environment ×1 (includes base resources such as cloud database / cloud functions / cloud storage / static hosting / authentication)",
    billingItemsText:
      "Billing items:\n- Database capacity/calls · function calls/resources/traffic · storage read-write/CDN · gateway/auth/API calls · pay-as-you-go beyond QPS limits · logs",
    "billingMode.free":
      "Billing mode:\n- Free trial edition (about 3000 resource points granted monthly ≈ CNY 3, activated for CNY 0)\n- Paid packages: Personal / Standard / Enterprise / Enterprise Premium",
    "billingMode.paid":
      "Billing mode:\n- Paid packages: Personal / Standard / Enterprise / Enterprise Premium\n- The free trial edition is created automatically by the auth tool; this manageEnv(create) call will not create a free edition",
    "releaseDetail.header":
      "Resource release methods:\n- You can destroy the environment, disable pay-as-you-go and unsubscribe add-on resources in the console at any time",
    "releaseDetail.free":
      "- Free trial edition: valid for 1 month and can be renewed free for 1 more month; without renewal it goes service-suspended (data retained) → recycle bin for 1-7 days → released (data unrecoverable)",
    "releaseDetail.paidExpiry":
      "- Paid package not renewed at expiry: service-suspended (data retained) → recoverable from the recycle bin for 1-7 days → released (data unrecoverable)",
    "releaseDetail.paidManual":
      "- Manual destroy: takes effect immediately; make sure data is migrated or backed up first",
    "pricing.header": "Estimated cost:",
    "pricing.freeLine":
      "- Free trial edition: CNY 0 for this activation; once the free quota is exceeded you must upgrade to a paid package (the free edition does not support pay-as-you-go)",
    "pricing.freeUnit":
      "- Actual unit prices follow the resource point pricing doc (3000 resource points ≈ CNY 3)",
    "pricing.paidLine": "- Paid package: {summary}",
    "pricing.inquiryFailed":
      "⚠️ Price inquiry failed ({error}); please confirm in the console",
    "pricing.partialMissing": "- ⚠️ Some details are missing: {error}",
    "pricing.period":
      "- Billing cycle: about {period} month(s) (monthly/yearly); renewable or changeable at expiry",
    "pricing.overage":
      "- Overage can be billed pay-as-you-go separately (settled the next day); see the official docs for detailed billing items",

    // ---- auth tool output ----
    "auth.actionNotSupported": "The current IDE does not support auth(action=\"{action}\").",
    "auth.invalidSite":
      "Invalid site value: {site}. Allowed values: domestic (China site), intl (international site).",
    "auth.devicePending":
      "Device-code authorization in progress. Complete the browser authorization, then call auth(action=\"status\") again",
    "auth.notLoggedInCodeBuddy":
      "Not logged in. CodeBuddy does not yet support in-tool authentication; complete authentication externally, then call auth(action=\"status\") again.",
    "auth.notLoggedIn": "Not logged in. Call auth(action=\"start_auth\") first",
    "auth.notLoggedInPeriod": "Not logged in. Call auth(action=\"start_auth\") first.",
    "auth.apiKeyAutoLogin":
      "API Key authentication mode is in use; login completed automatically, no manual authorization needed.",
    "auth.apiKeyEnvExchangeFailed":
      "API Key authentication mode is configured, but exchanging it for temporary credentials failed.",
    "auth.apiKeyDiagEnv":
      "\n\nDiagnostics:\n- CLOUDBASE_ENV_ID: {envId}\n- CLOUDBASE_API_KEY: {apiKeyPrefix}... (truncated)\n- TCB_SITE: {site}\n- Exchange gateway region: {gatewayRegion}\n- Endpoint: {endpoint}\n\nPossible causes:\n1. The API Key has expired or was deleted\n2. The Endpoint is unreachable (network/DNS issue)\n3. CLOUDBASE_ENV_ID does not match the environment the API Key belongs to\n4. The API Key does not match the site: keys for international-site environments need TCB_SITE=intl (routed via the ap-singapore gateway); do not set intl for domestic-site environments (including the ap-guangzhou/ap-singapore regions)\n\nSuggestion: check that the CLOUDBASE_API_KEY (or the compatible CLOUDBASE_APIKEY) and CLOUDBASE_ENV_ID environment variables in the MCP configuration are correct.",
    "auth.gatewayRegionDefault":
      "ap-shanghai (domestic-site default; multi-region environments are all routed through it)",
    "auth.siteUnset": "(not set)",
    "auth.devicePendingBrowser":
      "Device-code authorization in progress. Open verification_uri in the browser and enter user_code to complete the authorization.",
    "auth.deviceInitFailed": "Device-code login initialization failed: {message}",
    "auth.deviceCodeMissing": "No device code info was returned; please retry device-code login",
    "auth.deviceStarted":
      "Device-code login started. Open verification_uri in the browser and enter user_code to complete the authorization. Once authorized, call auth(action=\"status\") again.",
    "auth.loginStateMissing": "No login state was obtained; please complete authentication first",
    "auth.apiKeyArgsRequired":
      "Both apiKey and envId must be provided when action=login_by_api_key.",
    "auth.apiKeySuccess":
      "API Key authentication succeeded; temporary credentials obtained.",
    "auth.apiKeyExchangeFailed":
      "Failed to exchange the API Key for temporary credentials.",
    "auth.apiKeyDiagLogin":
      "\n\nDiagnostics:\n- CLOUDBASE_ENV_ID: {envId}\n- CLOUDBASE_API_KEY: {apiKeyPrefix}... (truncated)\n- TCB_SITE: {site}\n\nPossible causes:\n1. The API Key has expired or was deleted\n2. CLOUDBASE_ENV_ID does not match the environment the API Key belongs to\n3. The API Key does not match the site: keys for international-site environments need TCB_SITE=intl (routed via the ap-singapore gateway); do not set intl for domestic-site environments (including the ap-guangzhou/ap-singapore regions)\n4. Network connectivity issue\n\nSuggestion: check that the API Key and environment ID are correct.",
    "auth.apiKeyException": "API Key authentication error: {message}",
    "auth.setEnvIdRequired": "envId must be provided when action=set_env",
    "auth.credentialScopeLimited":
      "Currently logged in with an env-level API Key, which can only bind the authorized environment {pinnedEnvId} and cannot switch to {envId}. This is a credential permission boundary, not a missing target environment.",
    "auth.envReady": "Environment bound successfully. Current env: {envId}",
    "auth.envReadyWithHint": "Environment bound successfully. Current env: {envId}{regionHint}",
    "auth.regionHint": ", region: {region}",
    "auth.regionHintUnverified":
      ". This envId was not confirmed in the probed regions, so it was bound directly by its unique ID; if later APIs still target the wrong region, set TCB_REGION or use queryEnv(action=\"list\", region=...)",
    "auth.logoutNotAllowedApiKey":
      "API Key authentication mode is in use and logout is not supported. To switch the authentication method, remove the CLOUDBASE_API_KEY (or the compatible CLOUDBASE_APIKEY) environment variable and restart.",
    "auth.logoutConfirmRequired": "confirm=\"yes\" must be passed when action=logout",
    "auth.loggedOut": "✅ Logged out",
    "auth.tempCredNotLoggedIn":
      "Not logged in. Complete management-plane authentication before fetching temporary credentials.",
    "auth.tempCredConfirmRequired":
      "confirm=\"yes\" must be passed explicitly when action=get_temp_credentials, to confirm that you want to export the current management-plane temporary credentials.",
    "auth.tempCredUnsupportedType":
      "The current login state is not an exportable temporary credential. Only temporary credentials obtained via Web / device login are supported; permanent key logins cannot be exported.",
    "auth.tempCredIncomplete":
      "The current login state lacks complete temporary credential fields; please log in again and retry.",
    "auth.tempCredReadyReveal":
      "The current management-plane temporary credentials are ready; take care not to leak them.",
    "auth.tempCredReadyMasked":
      "The current management-plane temporary credentials are ready; by default only a masked result is returned.",
    "auth.unsupportedAction": "Unsupported auth action: {action}",
    "auth.internalError": "auth execution failed: {message}",

    // ---- manageEnv output ----
    "manage.packagesSuccess": "Successfully retrieved the list of available packages.",
    "manage.missingPackageIdForPrice": "packageId is missing, cannot run a price inquiry",
    "manage.createHeader": "About to activate a CloudBase environment for you",
    "manage.createNotice": "This operation creates Tencent CloudBase environment resources.",
    "manage.createFreeNote":
      "Costs are incurred only for paid packages; the free trial edition is not charged immediately (about 3000 resource points granted monthly ≈ CNY 3).",
    "manage.createConfirmPrompt":
      "Review the configuration below, then pass confirm=\"yes\":",
    "manage.createAlias": "- Alias: {alias}",
    "manage.createPackage": "- Package: {packageId}",
    "manage.createResources": "- Resource types: {resources}",
    "manage.createDuration": "- Duration: {duration} month(s)",
    "manage.createRegionNote":
      "- Note: CreateEnv does not accept a Region argument; the environment region is decided by the account and package side.",
    "manage.createAck":
      "☐ I understand that paid resources will be created and the billing rules apply, and confirm activation with the configuration above.",
    "manage.createCancelNote":
      "(To cancel or modify, do not pass confirm=\"yes\"; retry with different parameters instead)",
    "manage.createAckText": "I understand that paid resources will be created and the billing rules apply",
    "manage.createAliasRequired":
      "alias (environment alias) is required when creating an environment",
    "manage.createPackageRequired":
      "packageId (package ID) is required when creating an environment",
    "manage.createSuccess":
      "Environment created successfully! New environment ID: {envId}. Initialization may take a few minutes; poll queryEnv(action=\"info\", envId=\"{envId}\") until Status is normal.",
    "manage.notProvided": "(not provided)",
    "manage.unknownValue": "(unknown)",
    "manage.modifyArgsRequired": "envId and packageId are required when changing the package",
    "manage.modifyHeader":
      "Changing the package of environment {envId} requires your confirmation. Billing is not restarted immediately after the change, but it triggers a price-difference settlement or refund.",
    "manage.confirmPrompt": "Review the details, then pass confirm=\"yes\":",
    "manage.currentPackage": "- Current package: {packageName}",
    "manage.currentExpireTime": "- Current expiry time: {expireTime}",
    "manage.newPackage": "- New package: {packageId}",
    "manage.modifyPriceChange":
      "Estimated cost change: {summary} (the price difference/refund follows the bill)",
    "manage.modifyPriceFailed":
      "Estimated cost change: ⚠️ price inquiry failed ({error}); please confirm the price in the console",
    "manage.modifyPriceEmpty":
      "Estimated cost change: the price inquiry returned empty; please confirm the price in the console",
    "manage.modifyAck":
      "☐ I understand that the change triggers a price-difference settlement or refund, and confirm the change with the configuration above.",
    "manage.cancelNote": "(To cancel or modify, do not pass confirm=\"yes\")",
    "manage.modifyAckText":
      "I understand that the change triggers a price-difference settlement or refund",
    "manage.modifyEnvIdRequired": "envId is required when changing the package",
    "manage.modifyPackageIdRequired": "packageId is required when changing the package",
    "manage.modifySuccess":
      "The package of environment {envId} was successfully changed to {packageId}.",
    "manage.renewEnvIdRequired": "envId is required when renewing an environment",
    "manage.renewHeader":
      "Renewing environment {envId} requires your confirmation. Renewal is calculated by the current package type and extends the expiry time.",
    "manage.renewDuration": "- Renewal duration: {duration} month(s)",
    "manage.renewPrice": "Estimated cost: {summary}",
    "manage.renewPriceFailed":
      "Estimated cost: ⚠️ price inquiry failed ({error}); please confirm the price in the console",
    "manage.renewPriceEmpty":
      "Estimated cost: the price inquiry returned empty; please confirm the price in the console",
    "manage.renewAck":
      "☐ I understand that renewal extends the expiry time of the current package, and confirm the renewal with the configuration above.",
    "manage.renewAckText":
      "I understand that renewal extends the expiry time of the current package",
    "manage.renewSuccess": "Environment {envId} was successfully renewed for {duration} month(s).",
    "manage.wxideDomainUnsupported":
      "Environment security domain management is not available in the WeChat Developer Tools scenario. To configure a browser CORS allowlist, use another entry point (CloudBase MCP / console).",
    "manage.domainsRequired":
      "domains is required when action={action} (an array of host:port, for example [\"localhost:5173\"]). Before adding, use queryEnv(action=\"domains\") to check whether the browser's actual origin is already in the allowlist.",
    "manage.unsupportedAction":
      "Unsupported action: {action}. Supported actions: listPackages, create, modifyPlan, renew, addSecurityDomain, removeSecurityDomain.",
    "manage.listPackagesFailed":
      "Failed to query the package list (billing tag BillTags): {message}. You can view packages in the console instead, or call manageEnv(action=\"create\") directly with a known packageId (such as baas_personal).",
    "manage.operationFailed": "Environment management operation failed: {message}",
  },
);
