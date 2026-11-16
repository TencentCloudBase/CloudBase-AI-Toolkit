import { defineModule } from "../types.js";

export const gateway = defineModule(
  {
    "query.title": "查询 CloudBase 网关",
    "query.description":
      "CloudBase HTTP 网关统一只读入口（Domain/Route）。查询域名下路径路由及其上游：WEB_SCF/SCF=云函数，CBR=云托管，STATIC_STORE=静态托管，STORAGE=云存储，LH=轻量应用服务器。主键为 Domain + Path；listRoutes / getRoute / listCustomDomains / getPrivilege / cachePurgeTask。getPrivilege 查询 HTTP 网关总开关（enableService）与访问鉴权（enableAuth）状态。cachePurgeTask 查询域名缓存清除任务（先 manageGateway purgeCache 拿 TaskId）。实现自定义域名访问前，先 listCustomDomains：若已有自定义域名，优先 createRoute 挂路由（无需证书 ID）；仅在没有可用自定义域名时才 bindCustomDomain。",
    "manage.title": "管理 CloudBase 网关",
    "manage.description":
      "CloudBase HTTP 网关统一写入口（Domain/Route）。createRoute/updateRoute/deleteRoute 把域名下的 path 转到上游；enableRoute/disableRoute 启用或禁用已有路由（底层 ModifyHTTPServiceRoute 的 Routes[].Enable，不是 ModifyGatewayRoute）；bindCustomDomain/deleteCustomDomain 管理自定义域名；enableService/authSwitch 开关 HTTP 网关总开关与访问鉴权；purgeCache 清除域名缓存（返回 TaskId 后用 queryGateway cachePurgeTask 查进度）。未传 domain 时用 DomainType=HTTPSERVICE 的 IsDefault 默认 HTTP 域名（形如 *.{region}.app.tcloudbase.com），不会使用静态托管 CDN 域名（*.tcloudbaseapp.com，DomainType=STATIC_STORE）。这是网关默认域上的路径路由，不是 STATIC_STORE 上游绑定；STATIC_STORE 上游必须显式传 upstreamResourceType=STATIC_STORE。关闭静态托管默认域名（*.tcloudbaseapp.com）：先 queryGateway(listRoutes) 找到 DomainType=STATIC_STORE 且 IsDefault=true 的 domain，再 manageGateway(action=\"disableRoute\", domain=该域名, path=\"/\")；勿用 manageHosting。创建后可用 queryGateway(action=\"listRoutes\") 核对 Domain / DomainType / Path / UpstreamResourceType。上游类型只用一个参数 upstreamResourceType（也可写在 route.upstreamResourceType，route 优先）：WEB_SCF=HTTP云函数，SCF=Event云函数，CBR=云托管，STATIC_STORE=静态托管，STORAGE=云存储，LH=轻量应用服务器；配合 targetName 或 route.serviceName 指定上游实例。createRoute 只建网关入口，不改上游权限。⚠️ 自定义域名访问：若环境已有自定义域名（先 queryGateway listCustomDomains），优先 createRoute 并显式传入该 domain，无需 certificateId；仅首次绑定全新自定义域名时用 bindCustomDomain。createRoute / bindCustomDomain 创建前会调用 VerifyHTTPServiceRoute 做归属权等预检；失败时返回 data.checks 与 DNS TXT 指引，配置后重试。CORS/安全域名（浏览器跨域白名单，与本工具的网关自定义域名无关）用 manageEnv(action=addSecurityDomain/removeSecurityDomain)。createRoute 后若访问报 HTTPSERVICE_NONACTIVATED，通常是总开关未开启（用 queryGateway getPrivilege 查询、enableService 开启）。updateRoute 只传要改的字段即可，未传的 CORS/重写/限频/扩展配置会保持原值。",
    "verify.failWithDns":
      "HTTP 服务域名配置预检未通过：域名归属权校验失败。请按 data.checks 中 ownership.dnsRecords 配置 DNS TXT 记录后重试。",
    "verify.fail":
      "HTTP 服务域名配置预检未通过。请根据 data.checks 修复问题后重试。",
    "verify.failWithDnsReason":
      "配置 DNS TXT（主机记录/记录类型/记录值见 data.checks[].dnsRecords）后重新调用本 action",
    "verify.failReason": "根据 data.checks 修复预检失败项后重新调用本 action",
    "cert.listFailed":
      "获取 SSL 证书列表失败：{message}。请传入 certificateId，或确认账号有 SSL 证书服务权限。",
    "cert.noneFound":
      "未找到域名 [{domain}] 相关的可用 SSL 证书。请在腾讯云 SSL 证书控制台上传/申请后传入 certificateId 重试。",
    "cert.noneFoundReason":
      "上传或申请匹配该域名的证书后，传入 certificateId 再调用 bindCustomDomain",
    "cert.missingId":
      "域名 [{domain}] 匹配到证书但缺少 CertificateId，请显式传入 certificateId。",
    "cert.multiSelect":
      "找到 {count} 个匹配证书，请选择其中一个 certificateId 后重试 bindCustomDomain（MCP 非交互，不会自动选择）。",
    "cert.multiReason":
      "使用 certificateId={certificateId}（domain={domain}, 到期={certEndTime}）重试",
    "privilege.unknown": "未知",
    "privilege.on": "已开启",
    "privilege.off": "未开启",
    "privilege.description": "HTTP 网关{serviceStatus}，访问鉴权{authStatus}",
    "privilege.nonActivatedHint":
      "；若路由创建成功但访问报 HTTPSERVICE_NONACTIVATED（403），请先开启 HTTP 网关",
    "privilege.enableServiceReason":
      "开启 HTTP 网关总开关（EnableService），开启后路由即可通过默认域访问",
    "defaultDomain.notReady":
      "环境默认 HTTP 访问域名未就绪或未开通。请先在控制台开通 HTTP 访问服务，或用 queryGateway(action=\"listRoutes\") 确认 Domains 中是否存在 DomainType=HTTPSERVICE 且 IsDefault=true 的域名（形如 *.{region}.app.tcloudbase.com）；不要使用静态托管域名（*.tcloudbaseapp.com）。也可以显式传入 domain 后重试 createRoute/updateRoute/deleteRoute。",
    "upstreamTypeRequired":
      "必须提供 upstreamResourceType（或 route.upstreamResourceType）：WEB_SCF=HTTP云函数，SCF=Event云函数，CBR=云托管，STATIC_STORE=静态托管，STORAGE=云存储，LH=轻量应用服务器。禁止仅凭 targetName/serviceName 推断上游类型。",
    "upstreamNameRequired":
      "必须提供 targetName 或 route.serviceName 作为上游资源名称：云函数名、云托管服务名，或静态托管实例名（常见为 staticstore）。",
    "toggle.pathRequired":
      "action=enableRoute/disableRoute 时必须提供 path 或 route.path（例如 \"/\" 或 \"/api\"）",
    "toggle.notFound":
      "未找到路径 {path} 的路由{domainSuffix}{upstreamSuffix}。请先用 queryGateway(action=\"listRoutes\") 确认 Domain / Path，再调用 enableRoute/disableRoute。关闭静态托管默认域名（*.tcloudbaseapp.com）时，请显式传 domain=该 STATIC_STORE IsDefault 域名，并通常 path=\"/\"。",
    "toggle.notFoundDomainSuffix": "（域名 {domain}）",
    "toggle.notFoundUpstreamSuffix": "（上游 {upstreamName}）",
    "toggle.ambiguous":
      "路径 {path} 匹配到 {count} 条路由（域名：{domains}）。请补充 domain（必要时再加 targetName/route.serviceName）精确定位后再 enableRoute/disableRoute。",
    "toggle.upstreamNameRequired":
      "action={action} 无法解析上游资源名；请用 queryGateway(listRoutes) 确认后传入 targetName 或 route.serviceName。",
    "toggle.title": "HTTP 路由已{verb}（{domain}{path}，Enable={enable}）。",
    "toggle.verbEnable": "启用",
    "toggle.verbDisable": "禁用",
    "toggle.enabledTail":
      "启用后通常数秒到约 30 秒内可访问；请用 queryGateway(getRoute) 或探测 accessUrl 确认。",
    "toggle.disabledTail":
      "禁用后该路径将不可公网访问（GATEWAY_ROUTE_DISABLED）；关闭静态托管默认域名（*.tcloudbaseapp.com）时，请确认 DomainType=STATIC_STORE 且 IsDefault=true。",
    "toggle.messageEnd":
      " 底层对应 tcb ModifyHTTPServiceRoute（不是 ModifyGatewayRoute）。",
    "toggle.verifyReason": "复核路由 Enable={enable} 是否已生效",
    "mutation.pollGetRoute":
      "创建后通常数秒到约 30 秒内生效；请立刻轮询 getRoute 或探测 accessUrl，勿盲等 60 秒以上",
    "mutation.checkPermission":
      "确认函数安全规则是否允许预期访问方；网关 EnableAuth/auth=false 不等于函数已允许匿名访问",
    "mutation.updatePermission":
      "只有在确认需要匿名或浏览器直连访问时，才按实际安全要求更新函数权限",
    "query.listCustomDomains": "已获取 {count} 个自定义域名",
    "query.listRoutes": "已获取 {count} 条 HTTP 路由",
    "query.getRouteRequired":
      "action=getRoute 时至少需要提供 routeId、targetName 或 path",
    "query.getRouteNotFound": "未找到对应路由",
    "query.getRouteSingle": "已获取路由详情",
    "query.getRouteMulti":
      "匹配到 {count} 条路由，请补充 path 或 domain 精确定位",
    "query.getRouteCreateReason": "为该目标新增 Domain/Route 访问路径",
    "error.unsupportedAction": "不支持的操作类型: {action}",
    "create.backendError":
      "为目标资源配置访问路由失败（后端内部错误）。请确保：1) 目标云函数已成功创建并处于 Active 状态；2) 环境默认 HTTP 域名已完成初始化（IsDefault）；3) 该访问路径未被占用。",
    "create.backendErrorScfHint":
      "此外注意：HTTP 云函数必须用 upstreamResourceType=WEB_SCF，Event 云函数必须用 SCF；互标会导致此错误。",
    "create.backendErrorSuffix": " 原始错误：{message}",
    "create.upstreamNotFound":
      "createRoute 未执行：上游目标不存在。upstreamResourceType={type}、targetName={name} 在环境中未找到，未创建任何路由。请先创建该资源（或核对名称/类型），再重新调用 createRoute。",
    "create.upstreamCandidates":
      "当前环境已有的 {type} 目标（最多 10 个，供核对名称）：{candidates}",
    "create.upstreamNotFoundReason":
      "核对上游资源名称与 upstreamResourceType 后重试 createRoute",
    "create.privilegeOffHint":
      "⚠️ HTTP 网关总开关未开启，路由创建成功后访问仍将返回 HTTPSERVICE_NONACTIVATED（403）；请先调用 manageGateway(action=\"enableService\", enable=true) 开启，再立刻探测 accessUrl（通常数秒到约 30 秒内生效，勿盲等 60 秒以上）。",
    "create.privilegeOffReason":
      "开启 HTTP 网关总开关（EnableService），否则访问路由会报 HTTPSERVICE_NONACTIVATED（403）",
    "create.privilegeUnknownHint":
      "（无法确认 HTTP 网关开关状态；若访问报 HTTPSERVICE_NONACTIVATED，请用 queryGateway(action=\"getPrivilege\") 查询后用 manageGateway(action=\"enableService\") 开启）",
    "create.message":
      "已为目标 {upstreamResourceName} 在域名 {domain} 创建路由 {path}（{upstreamResourceType}）",
    "create.pathTransmissionOn": "；已开启路径透传（后端收到完整请求路径）",
    "create.pathTransmissionOff":
      "；路径透传关闭（网关会剥掉触发路径前缀后再转发给后端）",
    "create.pathTransmissionUnset":
      "；路径透传未显式设置（平台默认 false，会剥掉触发路径前缀）",
    "create.messageTail":
      "。注意：路由配置传播通常数秒到约 30 秒；请立刻用 queryGateway(getRoute) 或探测 accessUrl 确认，勿盲等 60 秒以上。该操作只创建网关入口，不会自动放开上游权限；若上游是云函数且需要匿名或浏览器直接访问，请继续检查函数资源权限。",
    "update.message": "HTTP 路由更新成功（{domain}{path}",
    "update.enableOff": "，路由已禁用 Enable=false",
    "update.enableOn": "，路由已启用 Enable=true",
    "update.transmissionOn": "，路径透传=开启",
    "update.transmissionOff": "，路径透传=关闭",
    "update.messageEnd": "）",
    "deleteRoute.pathRequired":
      "action=deleteRoute 时必须提供 route.path 或 path",
    "deleteRoute.message": "HTTP 路由删除成功",
    "bind.domainRequired": "action=bindCustomDomain 时必须提供 domain",
    "bind.customCnameRequired":
      "action=bindCustomDomain 且 accessType=CUSTOM 时必须提供 customCname（自有 CDN/WAF 的回源/回填地址，不是 DNS 解析目标）。说明：https://docs.cloudbase.net/service/custom-domain",
    "bind.customCnameNotAllowed":
      "customCname 仅在 accessType=CUSTOM 时可用；普通绑定用默认 DIRECT，不要传 customCname。说明：https://docs.cloudbase.net/service/custom-domain",
    "bind.message": "自定义域名绑定成功（{accessType}）",
    "bind.createRouteReason":
      "绑定后需 createRoute 添加访问路径，并完成 DNS CNAME 解析后才可访问",
    "deleteCustomDomain.domainRequired":
      "action=deleteCustomDomain 时必须提供 domain",
    "deleteCustomDomain.message": "自定义域名删除成功",
    "deleteCustomDomain.routeBinding":
      "域名 {domain} 下仍有路由绑定，需先删除路由再删除域名。原始错误：{message}",
    "deleteCustomDomain.listRoutesReason": "查看该域名下的路由，确认需要删除的路径",
    "deleteCustomDomain.deleteRoutesReason":
      "先删除该域名下的全部路由（逐个 deleteRoute），再重试 deleteCustomDomain",
    "enableService.enableRequired":
      "action=enableService 时必须提供 enable 参数（boolean），如 enable=true 开启 HTTP 网关总开关、enable=false 关闭；禁止省略或传非布尔值。",
    "enableService.onMessage": "HTTP 网关总开关开启成功",
    "enableService.offMessage": "HTTP 网关总开关关闭成功",
    "enableService.verifyReason": "复核 HTTP 网关总开关与访问鉴权状态",
    "authSwitch.enableRequired":
      "action=authSwitch 时必须提供 enable 参数（boolean），如 enable=true 开启访问鉴权、enable=false 关闭；禁止省略或传非布尔值。",
    "authSwitch.onMessage": "HTTP 访问服务鉴权开启成功",
    "authSwitch.offMessage": "HTTP 访问服务鉴权关闭成功",
    "authSwitch.verifyReason": "复核 HTTP 网关总开关与访问鉴权状态",
    "purgeCache.domainRequired": "action=purgeCache 时必须提供 domain",
    "purgeCache.targetsRequired":
      "action=purgeCache 时必须提供 targets：PURGE_URL 传完整 URL、PURGE_PREFIX 传路径前缀、PURGE_HOST 传待刷新的域名",
    "purgeCache.message":
      "已提交 {count} 个目标的缓存清除任务；CDN/EO 刷新通常数秒到数分钟，请用 queryGateway(action=\"cachePurgeTask\") 按 TaskId 查进度",
    "purgeCache.verifyReason": "查询缓存清除任务状态",
    "query.cachePurgeTask": "已获取 {count} 条缓存清除任务记录",
    "query.cachePurgeTaskDomainRequired":
      "action=cachePurgeTask 时必须提供 domain",
    "cache.domainNotFound":
      "未找到域名 {domain} 的接入配置，无法确定缓存层。请先用 queryGateway(action=\"listRoutes\") 确认域名。",
    "cache.notManaged":
      "域名 {domain} 的接入方式是 {accessType}，CloudBase 侧没有该域名的 CDN/EO 缓存，缓存刷新不适用（DIRECT 直连与 CUSTOM 自有 CDN 的缓存不由平台托管）。如需刷新，请先把域名切到 CDN 或 EO 接入。",
    "cache.typeMismatch":
      "域名 {domain} 的接入方式是 {accessType}，不能按 cacheType={requested} 刷新。省略 cacheType 就会按接入方式自动匹配。",
    // Input schema parameter descriptions
    "schema.query.action":
      "只读操作类型：listRoutes、getRoute、listCustomDomains、getPrivilege、cachePurgeTask。" +
      "getPrivilege 无需其他参数，直接返回 HTTP 网关总开关与访问鉴权状态。" +
      "cachePurgeTask 需要 domain（可选 cacheType/taskId/purgeType/startTime/endTime/offset/limit）。" +
      "自定义域名访问场景先 listCustomDomains 确认是否已有域名可复用。",
    "schema.query.targetName":
      "上游资源名过滤（UpstreamResourceName）：云函数名、云托管服务名，或静态托管实例名（常见 staticstore）。",
    "schema.query.routeId": "路由 ID。getRoute 时可选",
    "schema.query.path": "路由路径。getRoute / listRoutes 过滤时可选",
    "schema.query.domain": "域名。getRoute / listRoutes 过滤时可选；cachePurgeTask 时必填",
    "schema.query.cacheType":
      "缓存层（仅 cachePurgeTask）：CDN 或 EO。省略时按域名接入方式自动匹配（EO→EO、CDN→CDN）；" +
      "DIRECT / CUSTOM / NONE 的域没有 CloudBase 托管的缓存，会直接拒绝并说明原因。",
    "schema.query.taskId": "缓存清除任务 ID（仅 cachePurgeTask，可选过滤）",
    "schema.query.purgeType":
      "清除方式过滤（仅 cachePurgeTask）：PURGE_URL=按 URL、PURGE_PREFIX=按前缀、PURGE_HOST=整站",
    "schema.query.startTime":
      "任务开始时间（仅 cachePurgeTask，可选）。格式 YYYY-MM-DD HH:mm:ss",
    "schema.query.endTime":
      "任务结束时间（仅 cachePurgeTask，可选）。格式 YYYY-MM-DD HH:mm:ss",
    "schema.query.offset": "分页偏移（仅 cachePurgeTask，可选）",
    "schema.query.limit": "返回数量上限（仅 cachePurgeTask，可选）",
    "schema.manage.action":
      "写操作。createRoute/updateRoute 必须提供 upstreamResourceType；enableRoute/disableRoute 需 path（建议显式传 domain），会先定位已有路由，通常不必重填上游；enableService/authSwitch 需配合 enable；purgeCache 需 domain 与 targets。自定义域名接入说明：https://docs.cloudbase.net/service/custom-domain",
    "schema.manage.targetName":
      "上游资源名称（UpstreamResourceName），与 route.serviceName 二选一（route 优先）。" +
      "云函数=函数名；云托管=服务名；静态托管=实例名（常见 staticstore）。不会自动推断上游类型。",
    "schema.manage.path":
      "触发路径（网关匹配前缀），默认 /{上游名}。例：云函数 /api/hello、云托管 /api、静态托管 / 或 /app。" +
      "只建网关入口；与 enablePathTransmission 共同决定上游实际收到的路径。",
    "schema.manage.upstreamResourceType":
      "上游类型（与 route.upstreamResourceType 二选一，route 优先）。STORAGE 的上游名是云存储实例名，可先用 queryStorage 查实例。勿把 manageFunctions 的 type=HTTP|Event 传到本字段。",
    "schema.manage.auth":
      "网关路径鉴权（EnableAuth）。匿名/浏览器公网访问通常 false。" +
      "只控制网关入口；云函数安全规则、云托管鉴权、静态托管权限需各自工具另行配置。",
    "schema.manage.enablePathTransmission":
      "路径透传（EnablePathTransmission），平台默认 false。例 path=/api 且请求 /api/users：" +
      "false→上游收到 /users；true→上游收到 /api/users。" +
      "CBR 云托管（Express 等自管子路由）与 WEB_SCF 多路径函数常需 true；" +
      "STATIC_STORE 把触发路径映射到站点根目录（如 /app → 托管 /）时通常 false；" +
      "单入口/根路径处理保持 false。也可用 route.enablePathTransmission（route 优先）。",
    "schema.manage.enableSafeDomain":
      "跨域/合法域名校验（EnableSafeDomain），即控制台的「跨域设置」。true 时校验请求来源域名，" +
      "false 时不校验（浏览器直连调用 API 的常见选择）。也可用 route.enableSafeDomain（route 优先）。",
    "schema.manage.pathRewrite":
      "路径重写（PathRewrite），形如 {prefix:\"/v1\", staticStorePrefix:\"app\"}。" +
      "prefix=命中路径前缀后替换为的内容；staticStorePrefix=静态托管场景下的目标前缀。" +
      "不需要改写就省略；也可用 route.pathRewrite（route 优先）。",
    "schema.manage.qpsPolicy":
      "限频（QPSPolicy），即控制台的「频限」。{total:总 QPS, perClient:{limitBy:\"ClientIP\"|\"UserID\", limitValue:单客户端 QPS}}。" +
      "不传则不限频；也可用 route.qpsPolicy（route 优先）。",
    "schema.manage.extension":
      "路由级扩展：自定义请求/响应头与缓存规则。⚠️ 默认域（*.{region}.app.tcloudbase.com）不支持自定义响应头，需要自定义域名。也可用 route.extension（route 优先）。",
    "schema.manage.extension.header.key": "请求/响应头名称，如 X-Frame-Options",
    "schema.manage.extension.header.value": "请求/响应头取值，如 SAMEORIGIN",
    "schema.manage.extension.header.action":
      "写入策略：APPEND_IF_EXISTS_OR_ADD 追加；ADD_IF_ABSENT 不存在才加；OVERWRITE_IF_EXISTS_OR_ADD 覆盖或新增；OVERWRITE_IF_EXISTS 仅覆盖已存在的",
    "schema.manage.extension.cacheCondition":
      "缓存规则匹配条件，values 为匹配值数组",
    "schema.manage.extension.cacheActions":
      "缓存动作数组：type=Cache 配 cache{followOrigin,noCache,cacheTime,maxAgeTime}（三者互斥，需开启其一）；" +
      "type=CacheKey 配 cacheKey{fullUrlCache,queryStringSwitch,queryStringAction,queryStringValues}",
    "schema.manage.domainExtension":
      "域名级扩展，作用于整个域名（含所有路径），结构同 extension。缓存规则通常配在域名级；仅 createRoute/updateRoute/bindCustomDomain 生效。⚠️ 同 extension：默认域不支持自定义响应头。",
    "schema.manage.protocol":
      "域名协议，仅 createRoute/updateRoute/bindCustomDomain 生效。省略则沿用域名现有配置。",
    "schema.manage.route.serviceName":
      "上游实例名：云函数名 / 云托管服务名 / 静态托管实例名（常见 staticstore）/ LH 实例。优先于顶层 targetName。",
    "schema.manage.route.upstreamResourceType":
      "同顶层 upstreamResourceType。route 内设置时优先于顶层。",
    "schema.manage.route.enablePathTransmission":
      "同顶层 enablePathTransmission。route 内设置时优先于顶层。",
    "schema.manage.route.enable":
      "路由级开关。enable=false 禁用该 Domain+Path（访问返回 GATEWAY_ROUTE_DISABLED）；enable=true 重新启用。优先于顶层 enable。",
    "schema.manage.route.enableSafeDomain":
      "同顶层 enableSafeDomain（跨域/合法域名校验）。route 内设置时优先于顶层。",
    "schema.manage.route.pathRewrite":
      "同顶层 pathRewrite。route 内设置时优先于顶层。",
    "schema.manage.route.qpsPolicy":
      "同顶层 qpsPolicy（限频）。route 内设置时优先于顶层。",
    "schema.manage.route.extension":
      "同顶层 extension（路由级自定义头与缓存规则）。route 内设置时优先于顶层。",
    "schema.manage.route":
      "路由对象（可选写法）。例：云函数 {upstreamResourceType:\"WEB_SCF\",serviceName:\"fn\",path:\"/api\"}；" +
      "云托管 {upstreamResourceType:\"CBR\",serviceName:\"svc\",path:\"/api\"}；" +
      "静态托管 {upstreamResourceType:\"STATIC_STORE\",serviceName:\"staticstore\",path:\"/\"}；" +
      "禁用路由 {path:\"/\",enable:false}（配合 updateRoute，或直接用 disableRoute）。",
    "schema.manage.domain":
      "域名。省略时自动使用环境 DomainType=HTTPSERVICE 的默认 HTTP 域名（*.{region}.app.tcloudbase.com），可用 queryGateway(action=\"listRoutes\") 核对。enableRoute/disableRoute 操作 *.tcloudbaseapp.com 时必须显式传入该域名。已有自定义域名时显式传入该域名即可配路由，无需证书 ID；仅 bindCustomDomain 时表示要新绑定的域名。",
    "schema.manage.certificateId":
      "证书 ID。仅 bindCustomDomain 使用：显式传入时跳过自动检索；" +
      "省略时按 domain 调用 describeCertificates(SearchKey=domain)——" +
      "单证书自动选用，无证书报错，多证书返回结构化选择指引（MCP 非交互）。" +
      "在已有自定义域名上 createRoute / updateRoute / deleteRoute 不需要 certificateId。",
    "schema.manage.accessType":
      "绑定类型（仅 bindCustomDomain，默认 DIRECT）。" +
      "DIRECT=直连（普通绑域名用这个）；CDN=云开发 CDN；CUSTOM=自有 CDN/WAF（需 customCname）。" +
      "详见 https://docs.cloudbase.net/service/custom-domain",
    "schema.manage.customCname":
      "自有 CDN/WAF 的回源/回填地址（仅 bindCustomDomain 且 accessType=CUSTOM）。" +
      "不是 DNS 里用户域名要解析到的那个 CNAME；DIRECT/CDN 不要传。" +
      "详见 https://docs.cloudbase.net/service/custom-domain",
    "schema.manage.enable":
      "开关目标状态：enableService / authSwitch 必填（true 开启 / false 关闭）；bindCustomDomain 可选，false 表示绑定后禁用域名；updateRoute 可选，映射到 Routes[].Enable（route.enable 优先）。",
    "schema.manage.cacheType":
      "缓存层（仅 purgeCache）：CDN 或 EO。省略时按域名接入方式自动匹配（EO→EO、CDN→CDN）；" +
      "DIRECT / CUSTOM / NONE 的域没有 CloudBase 托管的缓存，会直接拒绝并说明原因。",
    "schema.manage.purgeType":
      "清除方式（仅 purgeCache，默认 PURGE_URL）：PURGE_URL=按完整 URL、PURGE_PREFIX=按路径前缀、PURGE_HOST=整个域名",
    "schema.manage.targets":
      "清除目标（仅 purgeCache，必填）：PURGE_URL 传 https://域名/路径 形式；PURGE_PREFIX 传 /static/ 这样的前缀；PURGE_HOST 传域名本身",
  },
  {
    "query.title": "Query CloudBase Gateway",
    "query.description":
      "Unified read-only entry for the CloudBase HTTP gateway (Domain/Route). Query path routes under a domain and their upstreams: WEB_SCF/SCF=cloud functions, CBR=CloudRun, STATIC_STORE=static hosting, STORAGE=cloud storage, LH=Lighthouse. The primary key is Domain + Path; listRoutes / getRoute / listCustomDomains / getPrivilege / cachePurgeTask. getPrivilege queries the HTTP gateway master switch (enableService) and access auth (enableAuth) status. cachePurgeTask queries cache purge tasks for a domain (use the TaskId from manageGateway purgeCache). Before setting up custom domain access, run listCustomDomains first: if a custom domain already exists, prefer createRoute to attach a route (no certificate ID needed); use bindCustomDomain only when no usable custom domain exists.",
    "manage.title": "Manage CloudBase Gateway",
    "manage.description":
      "Unified write entry for the CloudBase HTTP gateway (Domain/Route). createRoute/updateRoute/deleteRoute forward a path under a domain to an upstream; enableRoute/disableRoute enable or disable existing routes (Routes[].Enable of ModifyHTTPServiceRoute underneath, not ModifyGatewayRoute); bindCustomDomain/deleteCustomDomain manage custom domains; enableService/authSwitch toggle the HTTP gateway master switch and access auth; purgeCache clears domain cache (returns a TaskId; check progress with queryGateway cachePurgeTask). When domain is omitted, the IsDefault default HTTP domain with DomainType=HTTPSERVICE (like *.{region}.app.tcloudbase.com) is used; static-hosting CDN domains (*.tcloudbaseapp.com, DomainType=STATIC_STORE) are never used. These are path routes on the gateway default domain, not STATIC_STORE upstream bindings; a STATIC_STORE upstream must pass upstreamResourceType=STATIC_STORE explicitly. To disable the static-hosting default domain (*.tcloudbaseapp.com): first queryGateway(listRoutes) to find the domain with DomainType=STATIC_STORE and IsDefault=true, then manageGateway(action=\"disableRoute\", domain=that domain, path=\"/\"); do not use manageHosting. After creation, verify Domain / DomainType / Path / UpstreamResourceType via queryGateway(action=\"listRoutes\"). The upstream type uses a single parameter upstreamResourceType (or route.upstreamResourceType, route wins), together with targetName or route.serviceName for the upstream instance. createRoute only creates the gateway entry and does not change upstream permissions. ⚠️ Custom domain access: if the env already has a custom domain (queryGateway listCustomDomains first), prefer createRoute with that domain explicitly, no certificateId needed; use bindCustomDomain only when binding a brand-new custom domain for the first time. createRoute / bindCustomDomain run VerifyHTTPServiceRoute ownership pre-checks before creation; on failure, data.checks and DNS TXT guidance are returned; configure and retry. CORS/security domains (browser cross-origin allowlist, unrelated to the gateway custom domains of this tool) use manageEnv(action=addSecurityDomain/removeSecurityDomain). If access returns HTTPSERVICE_NONACTIVATED after createRoute, the master switch is usually off (query via queryGateway getPrivilege, enable via enableService). updateRoute only needs the fields you want to change — untouched CORS/rewrite/QPS/extension settings are carried over from the live route.",
    "verify.failWithDns":
      "HTTP service domain pre-check failed: domain ownership verification failed. Configure the DNS TXT records per ownership.dnsRecords in data.checks, then retry.",
    "verify.fail":
      "HTTP service domain pre-check failed. Fix the issues per data.checks, then retry.",
    "verify.failWithDnsReason":
      "Configure the DNS TXT records (host/record type/record value in data.checks[].dnsRecords), then call this action again",
    "verify.failReason":
      "Fix the failed pre-check items per data.checks, then call this action again",
    "cert.listFailed":
      "Failed to list SSL certificates: {message}. Pass certificateId, or confirm the account has SSL certificate service permissions.",
    "cert.noneFound":
      "No usable SSL certificate found for domain [{domain}]. Upload/apply for one on the Tencent Cloud SSL certificate console, then pass certificateId and retry.",
    "cert.noneFoundReason":
      "After uploading or applying for a certificate matching the domain, pass certificateId and call bindCustomDomain again",
    "cert.missingId":
      "Domain [{domain}] matched a certificate but the CertificateId is missing; pass certificateId explicitly.",
    "cert.multiSelect":
      "Found {count} matching certificates. Choose one certificateId and retry bindCustomDomain (MCP is non-interactive and will not auto-select).",
    "cert.multiReason":
      "Retry with certificateId={certificateId} (domain={domain}, expires={certEndTime})",
    "privilege.unknown": "unknown",
    "privilege.on": "enabled",
    "privilege.off": "disabled",
    "privilege.description":
      "HTTP gateway {serviceStatus}, access auth {authStatus}",
    "privilege.nonActivatedHint":
      "; if the route is created successfully but access returns HTTPSERVICE_NONACTIVATED (403), enable the HTTP gateway first",
    "privilege.enableServiceReason":
      "Turn on the HTTP gateway master switch (EnableService); once on, routes are accessible via the default domain",
    "defaultDomain.notReady":
      "The env default HTTP access domain is not ready or not provisioned. Enable the HTTP access service in the console first, or use queryGateway(action=\"listRoutes\") to confirm that Domains contains a domain with DomainType=HTTPSERVICE and IsDefault=true (shaped like *.{region}.app.tcloudbase.com); do not use static-hosting domains (*.tcloudbaseapp.com). You may also pass domain explicitly and retry createRoute/updateRoute/deleteRoute.",
    "upstreamTypeRequired":
      "upstreamResourceType (or route.upstreamResourceType) is required: WEB_SCF=HTTP cloud function, SCF=Event cloud function, CBR=CloudRun, STATIC_STORE=static hosting, STORAGE=cloud storage, LH=Lighthouse. Do not infer the upstream type from targetName/serviceName alone.",
    "upstreamNameRequired":
      "targetName or route.serviceName is required as the upstream resource name: a cloud function name, CloudRun service name, or static-hosting instance name (commonly staticstore).",
    "toggle.pathRequired":
      "path or route.path is required for action=enableRoute/disableRoute (e.g. \"/\" or \"/api\")",
    "toggle.notFound":
      "No route found for path {path}{domainSuffix}{upstreamSuffix}. Use queryGateway(action=\"listRoutes\") first to confirm Domain / Path, then call enableRoute/disableRoute. When disabling the static-hosting default domain (*.tcloudbaseapp.com), pass domain=that STATIC_STORE IsDefault domain explicitly, usually with path=\"/\".",
    "toggle.notFoundDomainSuffix": " (domain {domain})",
    "toggle.notFoundUpstreamSuffix": " (upstream {upstreamName})",
    "toggle.ambiguous":
      "Path {path} matched {count} routes (domains: {domains}). Add domain (and targetName/route.serviceName if needed) to locate precisely, then enableRoute/disableRoute.",
    "toggle.upstreamNameRequired":
      "action={action} could not resolve the upstream resource name; confirm via queryGateway(listRoutes), then pass targetName or route.serviceName.",
    "toggle.title": "HTTP route {verb} ({domain}{path}, Enable={enable}).",
    "toggle.verbEnable": "enabled",
    "toggle.verbDisable": "disabled",
    "toggle.enabledTail":
      "Once enabled, the path is usually accessible within a few seconds to ~30 seconds; confirm via queryGateway(getRoute) or by probing accessUrl.",
    "toggle.disabledTail":
      "Once disabled, the path is no longer publicly accessible (GATEWAY_ROUTE_DISABLED); when disabling the static-hosting default domain (*.tcloudbaseapp.com), confirm DomainType=STATIC_STORE and IsDefault=true.",
    "toggle.messageEnd":
      " This maps to tcb ModifyHTTPServiceRoute underneath (not ModifyGatewayRoute).",
    "toggle.verifyReason":
      "Verify whether the route Enable={enable} has taken effect",
    "mutation.pollGetRoute":
      "Takes effect within a few seconds to ~30 seconds after creation; poll getRoute or probe accessUrl immediately instead of waiting 60+ seconds",
    "mutation.checkPermission":
      "Confirm the function security rules allow the expected callers; gateway EnableAuth/auth=false does not mean the function already allows anonymous access",
    "mutation.updatePermission":
      "Only update function permissions when anonymous or browser-direct access is actually needed, following real security requirements",
    "query.listCustomDomains": "Retrieved {count} custom domains",
    "query.listRoutes": "Retrieved {count} HTTP routes",
    "query.getRouteRequired":
      "At least one of routeId, targetName, or path is required for action=getRoute",
    "query.getRouteNotFound": "No matching route found",
    "query.getRouteSingle": "Retrieved route details",
    "query.getRouteMulti":
      "Matched {count} routes; add path or domain to locate precisely",
    "query.getRouteCreateReason":
      "Add a Domain/Route access path for this target",
    "error.unsupportedAction": "Unsupported action: {action}",
    "create.backendError":
      "Failed to configure the access route for the target resource (backend internal error). Ensure: 1) the target cloud function is created and Active; 2) the env default HTTP domain is initialized (IsDefault); 3) the access path is not taken.",
    "create.backendErrorScfHint":
      "Also note: HTTP cloud functions must use upstreamResourceType=WEB_SCF, Event cloud functions must use SCF; swapping them causes this error.",
    "create.backendErrorSuffix": " Original error: {message}",
    "create.upstreamNotFound":
      "createRoute skipped: the upstream target does not exist. upstreamResourceType={type}, targetName={name} was not found in this environment; no route was created. Create the resource (or fix the name/type), then call createRoute again.",
    "create.upstreamCandidates":
      "Existing {type} targets in this environment (up to 10, for name verification): {candidates}",
    "create.upstreamNotFoundReason":
      "Verify the upstream resource name and upstreamResourceType, then retry createRoute",
    "create.privilegeOffHint":
      "⚠️ The HTTP gateway master switch is off; after the route is created, access will still return HTTPSERVICE_NONACTIVATED (403). Call manageGateway(action=\"enableService\", enable=true) first, then probe accessUrl immediately (usually takes effect within a few seconds to ~30 seconds; do not wait 60+ seconds).",
    "create.privilegeOffReason":
      "Turn on the HTTP gateway master switch (EnableService), otherwise accessing the route returns HTTPSERVICE_NONACTIVATED (403)",
    "create.privilegeUnknownHint":
      " (Could not confirm the HTTP gateway switch status; if access returns HTTPSERVICE_NONACTIVATED, query via queryGateway(action=\"getPrivilege\") and enable via manageGateway(action=\"enableService\"))",
    "create.message":
      "Created route {path} ({upstreamResourceType}) for target {upstreamResourceName} on domain {domain}",
    "create.pathTransmissionOn":
      "; path transmission enabled (the backend receives the full request path)",
    "create.pathTransmissionOff":
      "; path transmission disabled (the gateway strips the trigger path prefix before forwarding to the backend)",
    "create.pathTransmissionUnset":
      "; path transmission not explicitly set (platform default false, strips the trigger path prefix)",
    "create.messageTail":
      ". Note: route config propagation usually takes a few seconds to ~30 seconds; confirm immediately via queryGateway(getRoute) or by probing accessUrl instead of waiting 60+ seconds. This only creates the gateway entry and does not automatically open upstream permissions; if the upstream is a cloud function requiring anonymous or browser-direct access, continue checking the function resource permissions.",
    "update.message": "HTTP route updated successfully ({domain}{path}",
    "update.enableOff": ", route disabled Enable=false",
    "update.enableOn": ", route enabled Enable=true",
    "update.transmissionOn": ", path transmission=on",
    "update.transmissionOff": ", path transmission=off",
    "update.messageEnd": ")",
    "deleteRoute.pathRequired":
      "route.path or path is required for action=deleteRoute",
    "deleteRoute.message": "HTTP route deleted successfully",
    "bind.domainRequired": "domain is required for action=bindCustomDomain",
    "bind.customCnameRequired":
      "customCname is required for action=bindCustomDomain with accessType=CUSTOM (the origin/backfill address of your own CDN/WAF, not the DNS resolution target). See: https://docs.cloudbase.net/service/custom-domain",
    "bind.customCnameNotAllowed":
      "customCname is only available with accessType=CUSTOM; for normal binding use the default DIRECT and do not pass customCname. See: https://docs.cloudbase.net/service/custom-domain",
    "bind.message": "Custom domain bound successfully ({accessType})",
    "bind.createRouteReason":
      "After binding, use createRoute to add an access path; the domain is accessible only after the DNS CNAME resolution completes",
    "deleteCustomDomain.domainRequired":
      "domain is required for action=deleteCustomDomain",
    "deleteCustomDomain.message": "Custom domain deleted successfully",
    "deleteCustomDomain.routeBinding":
      "Domain {domain} still has route bindings; delete the routes before deleting the domain. Original error: {message}",
    "deleteCustomDomain.listRoutesReason":
      "List the routes under this domain to confirm the paths to delete",
    "deleteCustomDomain.deleteRoutesReason":
      "Delete all routes under this domain (one deleteRoute at a time), then retry deleteCustomDomain",
    "enableService.enableRequired":
      "The enable parameter (boolean) is required for action=enableService, e.g. enable=true to turn on the HTTP gateway master switch, enable=false to turn it off; omitting or passing a non-boolean is not allowed.",
    "enableService.onMessage": "HTTP gateway master switch enabled successfully",
    "enableService.offMessage": "HTTP gateway master switch disabled successfully",
    "enableService.verifyReason":
      "Verify the HTTP gateway master switch and access auth status",
    "authSwitch.enableRequired":
      "The enable parameter (boolean) is required for action=authSwitch, e.g. enable=true to turn on access auth, enable=false to turn it off; omitting or passing a non-boolean is not allowed.",
    "authSwitch.onMessage": "HTTP access service auth enabled successfully",
    "authSwitch.offMessage": "HTTP access service auth disabled successfully",
    "authSwitch.verifyReason":
      "Verify the HTTP gateway master switch and access auth status",
    "purgeCache.domainRequired": "domain is required for action=purgeCache",
    "purgeCache.targetsRequired":
      "targets is required for action=purgeCache: full URLs for PURGE_URL, path prefixes for PURGE_PREFIX, or the domain itself for PURGE_HOST",
    "purgeCache.message":
      "Submitted a cache purge task for {count} target(s); CDN/EO purges usually take seconds to minutes — check progress with queryGateway(action=\"cachePurgeTask\") by TaskId",
    "purgeCache.verifyReason": "Query the cache purge task status",
    "query.cachePurgeTask": "Retrieved {count} cache purge task record(s)",
    "query.cachePurgeTaskDomainRequired":
      "domain is required for action=cachePurgeTask",
    "cache.domainNotFound":
      "No access configuration found for domain {domain}, so the cache layer is undetermined. Confirm the domain with queryGateway(action=\"listRoutes\") first.",
    "cache.notManaged":
      "Domain {domain} uses access type {accessType}; CloudBase does not host a CDN/EO cache for it, so cache purging does not apply (DIRECT and CUSTOM own-CDN caches are not managed by the platform). Switch the domain to CDN or EO access first.",
    "cache.typeMismatch":
      "Domain {domain} uses access type {accessType} and cannot be purged with cacheType={requested}. Omit cacheType to match the access type automatically.",
    // Input schema parameter descriptions
    "schema.query.action":
      "Read-only action: listRoutes, getRoute, listCustomDomains, getPrivilege, cachePurgeTask. " +
      "getPrivilege needs no other parameter and returns the HTTP gateway master switch and access auth status directly. " +
      "cachePurgeTask requires domain (optional cacheType/taskId/purgeType/startTime/endTime/offset/limit). " +
      "For custom domain access, run listCustomDomains first to check whether an existing domain can be reused.",
    "schema.query.targetName":
      "Upstream resource name filter (UpstreamResourceName): a cloud function name, CloudRun service name, or static-hosting instance name (commonly staticstore).",
    "schema.query.routeId": "Route ID. Optional for getRoute",
    "schema.query.path": "Route path. Optional as a getRoute / listRoutes filter",
    "schema.query.domain":
      "Domain. Optional as a getRoute / listRoutes filter; required for cachePurgeTask",
    "schema.query.cacheType":
      "Cache layer (cachePurgeTask only): CDN or EO. When omitted it is matched from the domain access type (EO→EO, CDN→CDN); " +
      "DIRECT / CUSTOM / NONE domains have no CloudBase-hosted cache and are rejected with an explanation.",
    "schema.query.taskId": "Cache purge task ID (cachePurgeTask only, optional filter)",
    "schema.query.purgeType":
      "Purge type filter (cachePurgeTask only): PURGE_URL=by URL, PURGE_PREFIX=by path prefix, PURGE_HOST=whole domain",
    "schema.query.startTime":
      "Task start time (cachePurgeTask only, optional). Format YYYY-MM-DD HH:mm:ss",
    "schema.query.endTime":
      "Task end time (cachePurgeTask only, optional). Format YYYY-MM-DD HH:mm:ss",
    "schema.query.offset": "Pagination offset (cachePurgeTask only, optional)",
    "schema.query.limit": "Max records to return (cachePurgeTask only, optional)",
    "schema.manage.action":
      "Write action. createRoute/updateRoute must provide upstreamResourceType; enableRoute/disableRoute need path (passing domain explicitly is recommended) and locate the existing route first, so the upstream usually does not need to be repeated; enableService/authSwitch require enable; purgeCache requires domain and targets. Custom domain setup guide: https://docs.cloudbase.net/service/custom-domain",
    "schema.manage.targetName":
      "Upstream resource name (UpstreamResourceName); use either this or route.serviceName (route wins). " +
      "Cloud function=function name; CloudRun=service name; static hosting=instance name (commonly staticstore). The upstream type is never inferred automatically.",
    "schema.manage.path":
      "Trigger path (the gateway match prefix), defaults to /{upstream name}. Examples: cloud function /api/hello, CloudRun /api, static hosting / or /app. " +
      "This only creates the gateway entry; together with enablePathTransmission it determines the path the upstream actually receives.",
    "schema.manage.upstreamResourceType":
      "Upstream type (use either this or route.upstreamResourceType, route wins). For STORAGE, the upstream name is the cloud storage instance name — look it up with queryStorage first. Do not pass the manageFunctions type=HTTP|Event value into this field.",
    "schema.manage.auth":
      "Gateway path auth (EnableAuth). Usually false for anonymous/browser public access. " +
      "It only controls the gateway entry; cloud function security rules, CloudRun auth, and static hosting permissions must be configured with their own tools.",
    "schema.manage.enablePathTransmission":
      "Path transmission (EnablePathTransmission), platform default false. With path=/api and a request to /api/users: " +
      "false→the upstream receives /users; true→the upstream receives /api/users. " +
      "CBR CloudRun (Express and similar self-managed sub-routes) and multi-path WEB_SCF functions often need true; " +
      "STATIC_STORE mapping a trigger path to the site root (e.g. /app → hosting /) is usually false; " +
      "keep false for single-entry/root-path handling. route.enablePathTransmission also works (route wins).",
    "schema.manage.enableSafeDomain":
      "CORS / legit-domain check (EnableSafeDomain), the console's \"cross-origin settings\". " +
      "true validates the request origin; false skips the check (common for browser-to-API calls). " +
      "route.enableSafeDomain also works (route wins).",
    "schema.manage.pathRewrite":
      "Path rewriting (PathRewrite), e.g. {prefix:\"/v1\", staticStorePrefix:\"app\"}. " +
      "prefix replaces the matched path prefix; staticStorePrefix is the target prefix for static hosting. " +
      "Omit when no rewriting is needed; route.pathRewrite also works (route wins).",
    "schema.manage.qpsPolicy":
      "Rate limiting (QPSPolicy), the console's \"frequency limit\". {total: total QPS, perClient:{limitBy:\"ClientIP\"|\"UserID\", limitValue: per-client QPS}}. " +
      "Omit for no limit; route.qpsPolicy also works (route wins).",
    "schema.manage.extension":
      "Route-level extension: custom request/response headers and cache rules. ⚠️ The default domain (*.{region}.app.tcloudbase.com) rejects custom response headers; a custom domain is required. route.extension also works (route wins).",
    "schema.manage.extension.header.key": "Header name, e.g. X-Frame-Options",
    "schema.manage.extension.header.value": "Header value, e.g. SAMEORIGIN",
    "schema.manage.extension.header.action":
      "Write strategy: APPEND_IF_EXISTS_OR_ADD appends; ADD_IF_ABSENT only adds when missing; OVERWRITE_IF_EXISTS_OR_ADD overwrites or adds; OVERWRITE_IF_EXISTS only overwrites existing",
    "schema.manage.extension.cacheCondition":
      "Cache rule match condition; values is the list of match values",
    "schema.manage.extension.cacheActions":
      "Cache action list: type=Cache with cache{followOrigin,noCache,cacheTime,maxAgeTime} (mutually exclusive — enable one); " +
      "type=CacheKey with cacheKey{fullUrlCache,queryStringSwitch,queryStringAction,queryStringValues}",
    "schema.manage.domainExtension":
      "Domain-level extension applied to the whole domain (all paths), same shape as extension. Cache rules usually belong here; only effective for createRoute/updateRoute/bindCustomDomain. ⚠️ Same as extension: the default domain rejects custom response headers.",
    "schema.manage.protocol":
      "Domain protocol, effective for createRoute/updateRoute/bindCustomDomain only. Omit to keep the domain's current setting.",
    "schema.manage.route.serviceName":
      "Upstream instance name: cloud function name / CloudRun service name / static-hosting instance name (commonly staticstore) / LH instance. Takes precedence over the top-level targetName.",
    "schema.manage.route.upstreamResourceType":
      "Same as the top-level upstreamResourceType. When set inside route, it takes precedence over the top level.",
    "schema.manage.route.enablePathTransmission":
      "Same as the top-level enablePathTransmission. When set inside route, it takes precedence over the top level.",
    "schema.manage.route.enable":
      "Route-level switch. enable=false disables this Domain+Path (access returns GATEWAY_ROUTE_DISABLED); enable=true re-enables it. Takes precedence over the top-level enable.",
    "schema.manage.route.enableSafeDomain":
      "Same as the top-level enableSafeDomain (CORS / legit-domain check). When set inside route, it takes precedence.",
    "schema.manage.route.pathRewrite":
      "Same as the top-level pathRewrite. When set inside route, it takes precedence.",
    "schema.manage.route.qpsPolicy":
      "Same as the top-level qpsPolicy (rate limiting). When set inside route, it takes precedence.",
    "schema.manage.route.extension":
      "Same as the top-level extension (route-level custom headers and cache rules). When set inside route, it takes precedence.",
    "schema.manage.route":
      "Route object (an optional form). Examples: cloud function {upstreamResourceType:\"WEB_SCF\",serviceName:\"fn\",path:\"/api\"}; " +
      "CloudRun {upstreamResourceType:\"CBR\",serviceName:\"svc\",path:\"/api\"}; " +
      "static hosting {upstreamResourceType:\"STATIC_STORE\",serviceName:\"staticstore\",path:\"/\"}; " +
      "disable a route {path:\"/\",enable:false} (with updateRoute, or use disableRoute directly).",
    "schema.manage.domain":
      "Domain. When omitted, the env default HTTP domain with DomainType=HTTPSERVICE (*.{region}.app.tcloudbase.com) is used; verify it with queryGateway(action=\"listRoutes\"). When enableRoute/disableRoute targets *.tcloudbaseapp.com, this domain must be passed explicitly. With an existing custom domain, pass it explicitly to configure routes without a certificate ID; for bindCustomDomain only, it means the new domain to bind.",
    "schema.manage.certificateId":
      "Certificate ID. Used only by bindCustomDomain: passing it explicitly skips the automatic search; " +
      "when omitted, describeCertificates(SearchKey=domain) is called by domain — " +
      "a single certificate is selected automatically, no certificate raises an error, and multiple certificates return structured selection guidance (MCP is non-interactive). " +
      "createRoute / updateRoute / deleteRoute on an existing custom domain do not need certificateId.",
    "schema.manage.accessType":
      "Binding type (bindCustomDomain only, default DIRECT). " +
      "DIRECT=direct connection (use this for normal domain binding); CDN=CloudBase CDN; CUSTOM=your own CDN/WAF (requires customCname). " +
      "See https://docs.cloudbase.net/service/custom-domain",
    "schema.manage.customCname":
      "Origin/backfill address of your own CDN/WAF (bindCustomDomain with accessType=CUSTOM only). " +
      "This is not the CNAME the user domain should resolve to in DNS; do not pass it for DIRECT/CDN. " +
      "See https://docs.cloudbase.net/service/custom-domain",
    "schema.manage.enable":
      "Target switch state: required for enableService / authSwitch (true on / false off); optional for bindCustomDomain, where false disables the domain after binding; optional for updateRoute, mapping to Routes[].Enable (route.enable wins).",
    "schema.manage.cacheType":
      "Cache layer (purgeCache only): CDN or EO. When omitted it is matched from the domain access type (EO→EO, CDN→CDN); " +
      "DIRECT / CUSTOM / NONE domains have no CloudBase-hosted cache and are rejected with an explanation.",
    "schema.manage.purgeType":
      "Purge type (purgeCache only, default PURGE_URL): PURGE_URL=by full URL, PURGE_PREFIX=by path prefix, PURGE_HOST=whole domain",
    "schema.manage.targets":
      "Purge targets (purgeCache only, required): full https://domain/path URLs for PURGE_URL; prefixes such as /static/ for PURGE_PREFIX; the domain itself for PURGE_HOST",
  },
);
