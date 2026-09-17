import { defineModule } from "../types.js";

export const gateway = defineModule(
  {
    "query.title": "查询 CloudBase 网关",
    "query.description":
      "CloudBase HTTP 网关统一只读入口（Domain/Route）。查询域名下路径路由及其上游：WEB_SCF/SCF=云函数，CBR=云托管，STATIC_STORE=静态托管，LH=轻量应用服务器。主键为 Domain + Path；listRoutes / getRoute / listCustomDomains / getPrivilege。getPrivilege 查询 HTTP 网关总开关（enableService）与访问鉴权（enableAuth）状态。实现自定义域名访问前，先 listCustomDomains：若已有自定义域名，优先 createRoute 挂路由（无需证书 ID）；仅在没有可用自定义域名时才 bindCustomDomain。",
    "manage.title": "管理 CloudBase 网关",
    "manage.description":
      "CloudBase HTTP 网关统一写入口（Domain/Route）。createRoute/updateRoute/deleteRoute 把域名下的 path 转到上游；enableRoute/disableRoute 启用或禁用已有路由（底层 ModifyHTTPServiceRoute 的 Routes[].Enable，不是 ModifyGatewayRoute）。未传 domain 时用 DomainType=HTTPSERVICE 的 IsDefault 默认 HTTP 域名（形如 *.{region}.app.tcloudbase.com），不会使用静态托管 CDN 域名（*.tcloudbaseapp.com，DomainType=STATIC_STORE）。这是网关默认域上的路径路由，不是 STATIC_STORE 上游绑定；STATIC_STORE 上游必须显式传 upstreamResourceType=STATIC_STORE。关闭静态托管默认域名（*.tcloudbaseapp.com）：先 queryGateway(listRoutes) 找到 DomainType=STATIC_STORE 且 IsDefault=true 的 domain，再 manageGateway(action=\"disableRoute\", domain=该域名, path=\"/\")；勿用 manageHosting。创建后可用 queryGateway(action=\"listRoutes\") 核对 Domain / DomainType / Path / UpstreamResourceType。上游类型只用一个参数 upstreamResourceType（也可写在 route.upstreamResourceType，route 优先）：WEB_SCF=HTTP云函数，SCF=Event云函数，CBR=云托管，STATIC_STORE=静态托管，LH=轻量应用服务器；配合 targetName 或 route.serviceName（云函数名/云托管服务名/静态托管实例名，常见 staticstore）。createRoute 只建网关入口，不改上游权限。enablePathTransmission：默认 false 剥触发路径前缀；true 透传完整路径（CBR 多路由、WEB_SCF 自管子路径常需 true；STATIC_STORE 自定义触发路径映射站点根通常 false）。⚠️ 自定义域名访问：若环境已有自定义域名（先 queryGateway listCustomDomains），优先 createRoute 并显式传入该 domain，无需 certificateId；仅首次绑定全新自定义域名时用 bindCustomDomain（certificateId 可选：未传时按域名自动检索证书，单证书自动选用、多证书返回选择指引）。createRoute / bindCustomDomain 创建前会调用 VerifyHTTPServiceRoute 做归属权等预检（探测→创建）；失败时返回 data.checks 与 DNS TXT 指引，配置后重试。CORS/安全域名（浏览器跨域白名单，与本工具的网关自定义域名无关）用 manageEnv(action=addSecurityDomain/removeSecurityDomain)。enableService/authSwitch：HTTP 网关总开关与访问鉴权开关；createRoute 后若访问报 HTTPSERVICE_NONACTIVATED，通常是总开关未开启（用 queryGateway getPrivilege 查询、enableService 开启）。",
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
      "必须提供 upstreamResourceType（或 route.upstreamResourceType）：WEB_SCF=HTTP云函数，SCF=Event云函数，CBR=云托管，STATIC_STORE=静态托管，LH=轻量应用服务器。禁止仅凭 targetName/serviceName 推断上游类型。",
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
    // Input schema parameter descriptions
    "schema.query.action":
      "只读操作类型：listRoutes、getRoute、listCustomDomains、getPrivilege。" +
      "getPrivilege 无需其他参数，直接返回 HTTP 网关总开关与访问鉴权状态。" +
      "自定义域名访问场景先 listCustomDomains 确认是否已有域名可复用。",
    "schema.query.targetName":
      "上游资源名过滤（UpstreamResourceName）：云函数名、云托管服务名，或静态托管实例名（常见 staticstore）。",
    "schema.query.routeId": "路由 ID。getRoute 时可选",
    "schema.query.path": "路由路径。getRoute / listRoutes 过滤时可选",
    "schema.query.domain": "域名。getRoute / listRoutes 过滤时可选",
    "schema.manage.action":
      "写操作：createRoute/updateRoute/deleteRoute 管理路由；enableRoute/disableRoute 启用或禁用已有路由（需 path，建议显式传 domain）；" +
      "bindCustomDomain/deleteCustomDomain 管理自定义域名；" +
      "enableService/authSwitch 开关 HTTP 网关总开关与访问鉴权（需配合 enable 参数）。" +
      "createRoute/updateRoute 必须提供 upstreamResourceType；enableRoute/disableRoute 会先 listRoutes 定位已有路由，通常不必重填上游。" +
      "updateRoute 也可传 enable/route.enable 直接改 Routes[].Enable。" +
      "关闭 *.tcloudbaseapp.com 默认静态托管域：disableRoute + domain=该 STATIC_STORE IsDefault 域名 + path=\"/\"。" +
      "已有自定义域名时优先 createRoute(domain=已有域名) 实现访问，不必再次 bindCustomDomain / 传入 certificateId；" +
      "bindCustomDomain 仅用于首次绑定新域名（certificateId 可选，未传则按域名自动检索；可选 accessType=DIRECT|CDN|CUSTOM，CUSTOM 需 customCname；普通场景用默认 DIRECT）。" +
      "createRoute/bindCustomDomain 创建前会 VerifyHTTPServiceRoute 预检；失败时按返回的 DNS TXT 指引配置后重试。" +
      "接入说明：https://docs.cloudbase.net/service/custom-domain",
    "schema.manage.targetName":
      "上游资源名称（UpstreamResourceName），与 route.serviceName 二选一（route 优先）。" +
      "云函数=函数名；云托管=服务名；静态托管=实例名（常见 staticstore）。不会自动推断上游类型。",
    "schema.manage.path":
      "触发路径（网关匹配前缀），默认 /{上游名}。例：云函数 /api/hello、云托管 /api、静态托管 / 或 /app。" +
      "只建网关入口；与 enablePathTransmission 共同决定上游实际收到的路径。",
    "schema.manage.upstreamResourceType":
      "上游类型（与 route.upstreamResourceType 二选一，route 优先）。" +
      "WEB_SCF=HTTP云函数，SCF=Event云函数，CBR=云托管，STATIC_STORE=静态托管，LH=轻量应用服务器。" +
      "createRoute/updateRoute 必填其一；勿把 manageFunctions 的 type=HTTP|Event 传到本字段。",
    "schema.manage.auth":
      "网关路径鉴权（EnableAuth）。匿名/浏览器公网访问通常 false。" +
      "只控制网关入口；云函数安全规则、云托管鉴权、静态托管权限需各自工具另行配置。",
    "schema.manage.enablePathTransmission":
      "路径透传（EnablePathTransmission），平台默认 false。例 path=/api 且请求 /api/users：" +
      "false→上游收到 /users；true→上游收到 /api/users。" +
      "CBR 云托管（Express 等自管子路由）与 WEB_SCF 多路径函数常需 true；" +
      "STATIC_STORE 把触发路径映射到站点根目录（如 /app → 托管 /）时通常 false；" +
      "单入口/根路径处理保持 false。也可用 route.enablePathTransmission（route 优先）。",
    "schema.manage.route.serviceName":
      "上游实例名：云函数名 / 云托管服务名 / 静态托管实例名（常见 staticstore）/ LH 实例。优先于顶层 targetName。",
    "schema.manage.route.upstreamResourceType":
      "同顶层 upstreamResourceType。route 内设置时优先于顶层。",
    "schema.manage.route.enablePathTransmission":
      "同顶层 enablePathTransmission。route 内设置时优先于顶层。",
    "schema.manage.route.enable":
      "路由级开关（Routes[].Enable / Route.Enable）。createRoute/updateRoute 可用：" +
      "enable=false 禁用该 Domain+Path（访问返回 GATEWAY_ROUTE_DISABLED）；" +
      "enable=true 重新启用。updateRoute 也可用顶层 enable 表达同一语义；" +
      "也可用专用 action enableRoute/disableRoute。route.enable 优先于顶层 enable。",
    "schema.manage.route":
      "路由对象（可选写法）。例：云函数 {upstreamResourceType:\"WEB_SCF\",serviceName:\"fn\",path:\"/api\"}；" +
      "云托管 {upstreamResourceType:\"CBR\",serviceName:\"svc\",path:\"/api\"}；" +
      "静态托管 {upstreamResourceType:\"STATIC_STORE\",serviceName:\"staticstore\",path:\"/\"}；" +
      "禁用路由 {path:\"/\",enable:false}（配合 updateRoute，或直接用 disableRoute）。",
    "schema.manage.domain":
      "域名。省略时自动使用环境 DomainType=HTTPSERVICE 的 IsDefault 默认 HTTP 域名（*.{region}.app.tcloudbase.com），不会回退到静态托管 CDN 域名（*.tcloudbaseapp.com，DomainType=STATIC_STORE）；也不是 STATIC_STORE 上游绑定。" +
      "可用 queryGateway(action=\"listRoutes\") 核对实际 Domain / DomainType。" +
      "enableRoute/disableRoute 操作 *.tcloudbaseapp.com 时必须显式传入该域名。" +
      "已有自定义域名时请显式传入该域名并 createRoute/updateRoute/deleteRoute，即可实现自定义域名访问且无需证书 ID；" +
      "仅 bindCustomDomain 时表示要新绑定的域名。",
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
      "开关目标状态：enableService / authSwitch 必填（true 开启 / false 关闭）；" +
      "bindCustomDomain 可选：enable=false 表示绑定后禁用域名（默认启用）；" +
      "updateRoute 可选：映射到 Routes[].Enable（也可用 route.enable，route 优先；" +
      "也可用专用 action enableRoute/disableRoute）。" +
      "省略或非布尔值在 enableService/authSwitch 会返回参数错误。",
  },
  {
    "query.title": "Query CloudBase Gateway",
    "query.description":
      "Unified read-only entry for the CloudBase HTTP gateway (Domain/Route). Query path routes under a domain and their upstreams: WEB_SCF/SCF=cloud functions, CBR=CloudRun, STATIC_STORE=static hosting, LH=Lighthouse. The primary key is Domain + Path; listRoutes / getRoute / listCustomDomains / getPrivilege. getPrivilege queries the HTTP gateway master switch (enableService) and access auth (enableAuth) status. Before setting up custom domain access, run listCustomDomains first: if a custom domain already exists, prefer createRoute to attach a route (no certificate ID needed); use bindCustomDomain only when no usable custom domain exists.",
    "manage.title": "Manage CloudBase Gateway",
    "manage.description":
      "Unified write entry for the CloudBase HTTP gateway (Domain/Route). createRoute/updateRoute/deleteRoute forward a path under a domain to an upstream; enableRoute/disableRoute enable or disable existing routes (Routes[].Enable of ModifyHTTPServiceRoute underneath, not ModifyGatewayRoute). When domain is omitted, the IsDefault default HTTP domain with DomainType=HTTPSERVICE (like *.{region}.app.tcloudbase.com) is used; static-hosting CDN domains (*.tcloudbaseapp.com, DomainType=STATIC_STORE) are never used. These are path routes on the gateway default domain, not STATIC_STORE upstream bindings; a STATIC_STORE upstream must pass upstreamResourceType=STATIC_STORE explicitly. To disable the static-hosting default domain (*.tcloudbaseapp.com): first queryGateway(listRoutes) to find the domain with DomainType=STATIC_STORE and IsDefault=true, then manageGateway(action=\"disableRoute\", domain=that domain, path=\"/\"); do not use manageHosting. After creation, verify Domain / DomainType / Path / UpstreamResourceType via queryGateway(action=\"listRoutes\"). The upstream type uses a single parameter upstreamResourceType (or route.upstreamResourceType, route wins): WEB_SCF=HTTP cloud function, SCF=Event cloud function, CBR=CloudRun, STATIC_STORE=static hosting, LH=Lighthouse; together with targetName or route.serviceName (function name / CloudRun service name / static-hosting instance name, commonly staticstore). createRoute only creates the gateway entry and does not change upstream permissions. enablePathTransmission: default false strips the trigger path prefix; true forwards the full path (CBR multi-route and WEB_SCF self-managed sub-paths often need true; STATIC_STORE custom trigger path mapping to site root usually false). ⚠️ Custom domain access: if the env already has a custom domain (queryGateway listCustomDomains first), prefer createRoute with that domain explicitly, no certificateId needed; use bindCustomDomain only when binding a brand-new custom domain for the first time (certificateId optional: when omitted, certificates are auto-searched by domain — a single cert is auto-selected, multiple certs return selection guidance). createRoute / bindCustomDomain call VerifyHTTPServiceRoute for ownership pre-checks before creation (probe → create); on failure, data.checks and DNS TXT guidance are returned; configure and retry. CORS/security domains (browser cross-origin allowlist, unrelated to the gateway custom domains of this tool) use manageEnv(action=addSecurityDomain/removeSecurityDomain). enableService/authSwitch: HTTP gateway master switch and access auth switch; if access returns HTTPSERVICE_NONACTIVATED after createRoute, the master switch is usually off (query via queryGateway getPrivilege, enable via enableService).",
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
      "upstreamResourceType (or route.upstreamResourceType) is required: WEB_SCF=HTTP cloud function, SCF=Event cloud function, CBR=CloudRun, STATIC_STORE=static hosting, LH=Lighthouse. Do not infer the upstream type from targetName/serviceName alone.",
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
    // Input schema parameter descriptions
    "schema.query.action":
      "Read-only action: listRoutes, getRoute, listCustomDomains, getPrivilege. " +
      "getPrivilege needs no other parameter and returns the HTTP gateway master switch and access auth status directly. " +
      "For custom domain access, run listCustomDomains first to check whether an existing domain can be reused.",
    "schema.query.targetName":
      "Upstream resource name filter (UpstreamResourceName): a cloud function name, CloudRun service name, or static-hosting instance name (commonly staticstore).",
    "schema.query.routeId": "Route ID. Optional for getRoute",
    "schema.query.path": "Route path. Optional as a getRoute / listRoutes filter",
    "schema.query.domain": "Domain. Optional as a getRoute / listRoutes filter",
    "schema.manage.action":
      "Write actions: createRoute/updateRoute/deleteRoute manage routes; enableRoute/disableRoute enable or disable an existing route (path required, passing domain explicitly is recommended); " +
      "bindCustomDomain/deleteCustomDomain manage custom domains; " +
      "enableService/authSwitch toggle the HTTP gateway master switch and access auth (requires the enable parameter). " +
      "createRoute/updateRoute must provide upstreamResourceType; enableRoute/disableRoute run listRoutes first to locate the existing route, so the upstream usually does not need to be repeated. " +
      "updateRoute can also pass enable/route.enable to change Routes[].Enable directly. " +
      "To disable the default static-hosting domain *.tcloudbaseapp.com: disableRoute + domain=that STATIC_STORE IsDefault domain + path=\"/\". " +
      "When a custom domain already exists, prefer createRoute(domain=existing domain) for access instead of calling bindCustomDomain / passing certificateId again; " +
      "bindCustomDomain is only for binding a new domain the first time (certificateId is optional — when omitted, certificates are searched by domain; optional accessType=DIRECT|CDN|CUSTOM, CUSTOM requires customCname; use the default DIRECT for normal cases). " +
      "createRoute/bindCustomDomain run a VerifyHTTPServiceRoute pre-check before creation; on failure, follow the returned DNS TXT guidance and retry. " +
      "Setup guide: https://docs.cloudbase.net/service/custom-domain",
    "schema.manage.targetName":
      "Upstream resource name (UpstreamResourceName); use either this or route.serviceName (route wins). " +
      "Cloud function=function name; CloudRun=service name; static hosting=instance name (commonly staticstore). The upstream type is never inferred automatically.",
    "schema.manage.path":
      "Trigger path (the gateway match prefix), defaults to /{upstream name}. Examples: cloud function /api/hello, CloudRun /api, static hosting / or /app. " +
      "This only creates the gateway entry; together with enablePathTransmission it determines the path the upstream actually receives.",
    "schema.manage.upstreamResourceType":
      "Upstream type (use either this or route.upstreamResourceType, route wins). " +
      "WEB_SCF=HTTP cloud function, SCF=Event cloud function, CBR=CloudRun, STATIC_STORE=static hosting, LH=Lighthouse. " +
      "One of them is required for createRoute/updateRoute; do not pass the manageFunctions type=HTTP|Event value into this field.",
    "schema.manage.auth":
      "Gateway path auth (EnableAuth). Usually false for anonymous/browser public access. " +
      "It only controls the gateway entry; cloud function security rules, CloudRun auth, and static hosting permissions must be configured with their own tools.",
    "schema.manage.enablePathTransmission":
      "Path transmission (EnablePathTransmission), platform default false. With path=/api and a request to /api/users: " +
      "false→the upstream receives /users; true→the upstream receives /api/users. " +
      "CBR CloudRun (Express and similar self-managed sub-routes) and multi-path WEB_SCF functions often need true; " +
      "STATIC_STORE mapping a trigger path to the site root (e.g. /app → hosting /) is usually false; " +
      "keep false for single-entry/root-path handling. route.enablePathTransmission also works (route wins).",
    "schema.manage.route.serviceName":
      "Upstream instance name: cloud function name / CloudRun service name / static-hosting instance name (commonly staticstore) / LH instance. Takes precedence over the top-level targetName.",
    "schema.manage.route.upstreamResourceType":
      "Same as the top-level upstreamResourceType. When set inside route, it takes precedence over the top level.",
    "schema.manage.route.enablePathTransmission":
      "Same as the top-level enablePathTransmission. When set inside route, it takes precedence over the top level.",
    "schema.manage.route.enable":
      "Route-level switch (Routes[].Enable / Route.Enable). Available for createRoute/updateRoute: " +
      "enable=false disables this Domain+Path (access returns GATEWAY_ROUTE_DISABLED); " +
      "enable=true re-enables it. updateRoute can express the same semantics with the top-level enable; " +
      "the dedicated actions enableRoute/disableRoute also work. route.enable takes precedence over the top-level enable.",
    "schema.manage.route":
      "Route object (an optional form). Examples: cloud function {upstreamResourceType:\"WEB_SCF\",serviceName:\"fn\",path:\"/api\"}; " +
      "CloudRun {upstreamResourceType:\"CBR\",serviceName:\"svc\",path:\"/api\"}; " +
      "static hosting {upstreamResourceType:\"STATIC_STORE\",serviceName:\"staticstore\",path:\"/\"}; " +
      "disable a route {path:\"/\",enable:false} (with updateRoute, or use disableRoute directly).",
    "schema.manage.domain":
      "Domain. When omitted, the env IsDefault default HTTP domain with DomainType=HTTPSERVICE (*.{region}.app.tcloudbase.com) is used; it never falls back to the static-hosting CDN domain (*.tcloudbaseapp.com, DomainType=STATIC_STORE), and it is not a STATIC_STORE upstream binding. " +
      "Use queryGateway(action=\"listRoutes\") to verify the actual Domain / DomainType. " +
      "When enableRoute/disableRoute targets *.tcloudbaseapp.com, this domain must be passed explicitly. " +
      "If a custom domain already exists, pass it explicitly with createRoute/updateRoute/deleteRoute to serve custom domain access without a certificate ID; " +
      "for bindCustomDomain only, it means the new domain to bind.",
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
      "Target switch state: required for enableService / authSwitch (true to turn on / false to turn off); " +
      "optional for bindCustomDomain: enable=false disables the domain after binding (enabled by default); " +
      "optional for updateRoute: maps to Routes[].Enable (route.enable also works and wins; " +
      "the dedicated actions enableRoute/disableRoute are available too). " +
      "Omitting it or passing a non-boolean returns a parameter error for enableService/authSwitch.",
  },
);
