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
  },
);
