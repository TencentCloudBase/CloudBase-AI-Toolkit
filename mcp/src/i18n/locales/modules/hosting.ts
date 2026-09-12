import { defineModule } from "../types.js";

export const hosting = defineModule(
  {
    queryTitle: "查询 CloudBase 静态托管",
    queryDescription:
      "查询 CloudBase 静态托管的只读信息。适合 AI 先做发现再决定下一步：action=websiteConfig 查询首页/错误页/路由规则与站点域名信息；action=status 查询托管服务状态；action=findFiles 按前缀查找文件；action=listFiles 列出全部托管文件；action=domainStatus 查询自定义域名的当前状态与配置。该工具不会产生任何副作用。",
    manageTitle: "管理 CloudBase 静态托管",
    manageDescription:
      "管理 CloudBase 静态托管的变更操作。action=upload 上传本地构建产物到共享域名（域名格式：<envId>-<appId>.tcloudbaseapp.com/<cloudPath>）；action=delete 删除托管文件或目录（必须 confirm=true）；action=setWebsiteDocument 设置首页/错误页/路由规则；action=enableService 开通静态托管；action=bindDomain / unbindDomain / updateDomain 管理自定义域名；action=downloadFile / downloadDirectory 下载托管内容到本地。⚠️ 底层每次托管操作都会请求 DescribeStaticStore 管控接口（20 次/秒 QPS 限制）：批量删除多个文件请逐次调用并保持间隔（建议每秒不超过 10 次），同一目录下多个文件可优先用 isDir=true 一次删除整个目录；若报错含 \"frequency limit\" 说明触发了限流，请等待 1-2 秒后重试，不要连续快速重试。⚠️ 本工具没有关闭默认域名（*.tcloudbaseapp.com）的 action；要禁用该默认公网域名，请用 manageGateway(action=\"disableRoute\", domain=该 STATIC_STORE IsDefault 域名, path=\"/\")（底层 ModifyHTTPServiceRoute，不是 ModifyGatewayRoute）。⚠️ 新项目部署优先使用 manageApps（部署到独立子域名），本工具适合已有老项目继续使用或作为 manageApps 的 fallback。manageApps 与 manageHosting 域名不同，切换会导致老链接失效。若任务只是查看配置、文件或域名状态，请改用 queryHosting。",
    commonServiceUnsupported:
      "当前 CloudBase Manager 实例不支持 commonService.call，无法执行 {action}。",
    managerUnavailable: "CloudBase Manager 实例不可用。",
    hostingStoreMissing:
      "当前环境 {envId} 未发现静态托管资源配置，无法上传文件。请先确认 MCP 已绑定到已开通静态托管的 CloudBase 环境；如需切换环境，请调用 auth(action=\"set_env\", envId=\"目标环境ID\") 后重试。",
    cloudModeLocalActionUnavailable:
      "manageHosting(action=\"{action}\") 在 cloud mode 下不可用，因为该操作依赖本地文件路径。请改用本地模式执行；若只需要远端管理静态托管，可继续使用 delete / setWebsiteDocument / enableService / bindDomain / unbindDomain / updateDomain。",
    uploadArgsRequired:
      "manageHosting(action=\"upload\") 需要提供 localPath + cloudPath，或提供 files 多文件上传列表。",
    uploadSuccess:
      "静态托管文件上传成功。若需要校验上传结果，请继续调用 queryHosting(action=\"findFiles\") 或 queryHosting(action=\"listFiles\")。",
    uploadRouteDisabledWithFallback:
      "静态托管文件上传成功。默认静态托管域名的网关路由已禁用（访问会返回 GATEWAY_ROUTE_DISABLED），已改用其他可达域名作为 accessUrl。可用 manageGateway(action=\"updateRoute\", route.enable=true) 重新启用默认域路由。",
    uploadRouteDisabledNoAccess:
      "静态托管文件上传成功，但默认静态托管域名的网关路由已禁用（GATEWAY_ROUTE_DISABLED），当前没有可达的 accessUrl。请用 manageGateway(action=\"updateRoute\", domain=\"<静态域名>\", path=\"/\", upstreamResourceType=\"STATIC_STORE\", targetName=\"staticstore\", route.enable=true) 启用路由，或改用已启用的自定义域名 / CloudBase Sites 域名访问。",
    uploadErrorWrapper: "[manageHosting(upload)] {message}\n建议：{suggestions}",
    uploadErrorPathSuggestion: "请先确认本地路径 `{localPath}` 存在且当前进程有读取权限。",
    uploadErrorAssetSuggestion:
      "如果报错的是构建产物中的某个静态资源文件，请检查构建后的资源引用路径是否正确。",
    uploadErrorPublicPathSuggestion:
      "若站点部署到子路径，请确认 publicPath、base、assetPrefix 等配置没有把资源指向不存在的位置。",
    uploadErrorDefaultSuggestion: "请检查上传目录、文件权限和构建产物完整性后重试。",
    deleteErrorWrapper: "[manageHosting(delete)] {message}",
    deleteRateLimitGuidance:
      "[manageHosting(delete)] {message}\n原因：静态托管底层 DescribeStaticStore 管控接口有 20 次/秒的 QPS 限制，连续快速删除多个文件（或失败后立即重试）容易触发限流，删除操作本身可能已经部分生效。\n处理建议：\n1) 等待 1-2 秒后重试本次删除，不要立即连续重试；\n2) 批量删除多个文件时，逐次调用并保持间隔（建议每秒不超过 10 次），不要并发或循环快速重试；\n3) 同一目录下的多个文件可改用 isDir=true 一次删除整个目录，减少调用次数；\n4) 若不确定删除是否已生效，可调用 queryHosting(action=\"findFiles\") 核对。",
    deleteCloudPathRequired: "manageHosting(action=\"delete\") 需要提供 cloudPath。",
    deleteConfirmRequired:
      "manageHosting(action=\"delete\") 是破坏性操作，必须显式传 confirm=true。",
    deleteVerificationIncomplete: "删除请求未生效：{errors}",
    deleteVerifyFailed: "删除后验证失败：文件仍在静态托管中",
    deleteSuccess: "已删除静态托管{type} `{cloudPath}`。",
    deleteUnverified:
      "删除操作已提交，但验证发现文件可能未完全删除。可能原因：底层 COS 删除请求失败（如文件不存在、存储桶权限不足），或触发 DescribeStaticStore 限流后删除未生效。建议：1) 等待 1-2 秒后用 queryHosting(action=\"findFiles\", prefix=\"{cloudPath}\") 核对文件状态；2) 若确认文件仍存在，重新调用 manageHosting(action=\"delete\", confirm=true) 重试；3) 批量删除多个文件请逐次调用并保持间隔（DescribeStaticStore 有 20 次/秒 QPS 限制）。",
    typeDirectory: "目录",
    typeFile: "文件",
    setWebsiteDocumentIndexRequired:
      "manageHosting(action=\"setWebsiteDocument\") 需要提供 indexDocument，例如 index.html。",
    setWebsiteDocumentSuccess:
      "静态托管网站文档配置已提交。若需要确认最终配置，请继续调用 queryHosting(action=\"websiteConfig\")。",
    enableServiceSuccess:
      "静态托管服务开通请求已提交。请继续调用 queryHosting(action=\"status\") 确认服务是否已可用。",
    bindDomainArgsRequired: "manageHosting(action=\"bindDomain\") 需要提供 domain 和 certId。",
    unbindDomainArgsRequired: "manageHosting(action=\"unbindDomain\") 需要提供 domain。",
    unbindDomainConfirmRequired:
      "manageHosting(action=\"unbindDomain\") 会解绑现有自定义域名，必须显式传 confirm=true。",
    updateDomainArgsRequired:
      "manageHosting(action=\"updateDomain\") 需要同时提供 domain、domainId 和 domainConfig。",
    downloadFileArgsRequired:
      "manageHosting(action=\"downloadFile\") 需要同时提供 cloudPath 和 localPath，localPath 应包含目标文件名。",
    downloadFileSuccess: "已将静态托管文件 `{cloudPath}` 下载到本地路径 `{localPath}`。",
    downloadDirectoryArgsRequired:
      "manageHosting(action=\"downloadDirectory\") 需要同时提供 cloudPath 和 localPath，localPath 应为本地目录路径。",
    downloadDirectorySuccess: "已将静态托管目录 `{cloudPath}` 下载到本地目录 `{localPath}`。",
    domainMutationSubmitted:
      "静态托管域名{actionLabel}请求已提交。域名配置、证书校验和边缘侧传播通常需要 30 秒到 10 分钟，请继续调用 queryHosting(action=\"domainStatus\") 确认最终结果。",
    domainActionBind: "绑定",
    domainActionUnbind: "解绑",
    domainActionUpdate: "修改",
    domainSuccessIndicatorBind:
      "继续调用 queryHosting(action=\"domainStatus\", domains=[\"{domain}\"])，直到返回中出现该域名，并且相关状态字段显示为已生效。",
    domainSuccessIndicatorUnbind:
      "继续调用 queryHosting(action=\"domainStatus\", domains=[\"{domain}\"])，直到返回中不再出现该域名。",
    domainSuccessIndicatorUpdate:
      "继续调用 queryHosting(action=\"domainStatus\", domains=[\"{domain}\"])，确认返回中的配置字段已更新为最新值。",
    websiteConfigSuccess: "已获取静态托管网站文档配置与站点域名信息。",
    statusEnabled: "已获取静态托管服务状态。",
    statusNotEnabled: "静态托管服务当前未返回可用实例信息，可能尚未开通。",
    findFilesPrefixRequired:
      "queryHosting(action=\"findFiles\") 需要提供 prefix，用于按前缀查找托管文件。",
    findFilesSuccess: "已按前缀 `{prefix}` 查询静态托管文件，共 {count} 个。{more}",
    findFilesMore: " 还有更多文件，可使用 nextMarker 继续查询。",
    listFilesSuccess: "已列出静态托管中的文件（第 {start}-{end} 个，共 {count} 个）。{more}",
    domainStatusDomainsRequired:
      "queryHosting(action=\"domainStatus\") 需要提供 domains 数组，例如 [\"www.example.com\"]。",
    domainStatusSuccessIndicator: "目标域名出现在返回结果中，并且相关状态字段显示为已生效。",
    domainStatusAllMatched:
      "已查询到目标静态托管域名配置。若这是绑定或修改后的确认步骤，请继续核对状态字段、证书信息和配置内容是否符合预期。",
    domainStatusPending:
      "部分目标静态托管域名尚未在查询结果中出现。若这是绑定后的确认步骤，请继续调用 queryHosting(action=\"domainStatus\") 直到结果收敛或达到超时。",
    queryRateLimitGuidance:
      "{message}\n原因：静态托管底层 DescribeStaticStore 管控接口有 20 次/秒的 QPS 限制，连续快速调用（或失败后立即重试）容易触发限流，本次查询/操作可能没有完整生效。\n处理建议：等待 1-2 秒后重试，不要连续快速重试；多个文件操作请逐次调用并保持间隔。",
  },
  {
    queryTitle: "Query CloudBase static hosting",
    queryDescription:
      "Read-only information about CloudBase static hosting. Lets the AI discover state first and then decide the next step: action=websiteConfig queries the index/error document, routing rules, and site domain info; action=status queries the hosting service status; action=findFiles finds files by prefix; action=listFiles lists all hosted files; action=domainStatus queries the current status and configuration of custom domains. This tool has no side effects.",
    manageTitle: "Manage CloudBase static hosting",
    manageDescription:
      "Mutation operations for CloudBase static hosting. action=upload uploads local build artifacts to the shared domain (domain format: <envId>-<appId>.tcloudbaseapp.com/<cloudPath>); action=delete deletes hosted files or directories (confirm=true required); action=setWebsiteDocument sets the index/error document and routing rules; action=enableService enables static hosting; action=bindDomain / unbindDomain / updateDomain manage custom domains; action=downloadFile / downloadDirectory download hosted content to local disk. ⚠️ Every hosting operation calls the DescribeStaticStore control-plane API underneath (20 req/s QPS limit): when deleting multiple files, call sequentially with intervals (no more than 10 calls per second recommended); for multiple files in the same directory, prefer isDir=true to delete the whole directory in one call. If the error contains \"frequency limit\", rate limiting was triggered — wait 1-2 seconds and retry; do not retry in rapid succession. ⚠️ This tool has no action to disable the default domain (*.tcloudbaseapp.com); to disable that default public domain, use manageGateway(action=\"disableRoute\", domain=the STATIC_STORE IsDefault domain, path=\"/\") (backed by ModifyHTTPServiceRoute, not ModifyGatewayRoute). ⚠️ For new projects prefer manageApps (deploys to a dedicated subdomain); this tool suits existing legacy projects or as a fallback for manageApps. manageApps and manageHosting use different domains, so switching invalidates old links. If the task is only inspecting config, files, or domain status, use queryHosting instead.",
    commonServiceUnsupported:
      "The current CloudBase Manager instance does not support commonService.call; cannot execute {action}.",
    managerUnavailable: "CloudBase manager is unavailable.",
    hostingStoreMissing:
      "No static hosting storage config found for environment {envId}; cannot upload files. Make sure MCP is bound to a CloudBase environment with static hosting enabled; to switch environments, call auth(action=\"set_env\", envId=\"<target env ID>\") and retry.",
    cloudModeLocalActionUnavailable:
      "manageHosting(action=\"{action}\") is unavailable in cloud mode because the operation depends on local file paths. Run MCP in local mode instead; for remote-only static hosting management, you can still use delete / setWebsiteDocument / enableService / bindDomain / unbindDomain / updateDomain.",
    uploadArgsRequired:
      "manageHosting(action=\"upload\") requires localPath + cloudPath, or a files list for multi-file upload.",
    uploadSuccess:
      "Static hosting files uploaded. To verify the upload result, call queryHosting(action=\"findFiles\") or queryHosting(action=\"listFiles\").",
    uploadRouteDisabledWithFallback:
      "Static hosting files uploaded. The gateway route for the default static hosting domain is disabled (access returns GATEWAY_ROUTE_DISABLED); another reachable domain is used as accessUrl. Use manageGateway(action=\"updateRoute\", route.enable=true) to re-enable the default domain route.",
    uploadRouteDisabledNoAccess:
      "Static hosting files uploaded, but the gateway route for the default static hosting domain is disabled (GATEWAY_ROUTE_DISABLED) and no reachable accessUrl exists. Use manageGateway(action=\"updateRoute\", domain=\"<static domain>\", path=\"/\", upstreamResourceType=\"STATIC_STORE\", targetName=\"staticstore\", route.enable=true) to enable the route, or access via an enabled custom domain / CloudBase Sites domain.",
    uploadErrorWrapper: "[manageHosting(upload)] {message}\nSuggestions: {suggestions}",
    uploadErrorPathSuggestion:
      "First confirm the local path `{localPath}` exists and the current process has read permission.",
    uploadErrorAssetSuggestion:
      "If the failing file is a static asset inside the build output, check that the post-build asset reference paths are correct.",
    uploadErrorPublicPathSuggestion:
      "If the site is deployed under a sub-path, confirm that publicPath, base, assetPrefix, and similar settings do not point assets to a non-existent location.",
    uploadErrorDefaultSuggestion:
      "Check the upload directory, file permissions, and build output integrity, then retry.",
    deleteErrorWrapper: "[manageHosting(delete)] {message}",
    deleteRateLimitGuidance:
      "[manageHosting(delete)] {message}\nReason: the underlying DescribeStaticStore control-plane API has a 20 req/s QPS limit; deleting multiple files in rapid succession (or retrying immediately after a failure) easily triggers rate limiting, and the deletion itself may have partially taken effect.\nSuggestions:\n1) Wait 1-2 seconds and retry this deletion; do not retry immediately in a tight loop;\n2) When deleting multiple files, call sequentially with intervals (no more than 10 calls per second recommended); do not retry concurrently or in fast loops;\n3) For multiple files in the same directory, use isDir=true to delete the whole directory in one call;\n4) To verify whether the deletion took effect, call queryHosting(action=\"findFiles\").",
    deleteCloudPathRequired: "manageHosting(action=\"delete\") requires cloudPath.",
    deleteConfirmRequired:
      "manageHosting(action=\"delete\") is a destructive operation and requires explicit confirm=true.",
    deleteVerificationIncomplete: "Deletion request did not take effect: {errors}",
    deleteVerifyFailed:
      "Post-delete verification failed: file still exists in static hosting",
    deleteSuccess: "Deleted static hosting {type} `{cloudPath}`.",
    deleteUnverified:
      "The deletion was submitted, but verification suggests the files may not be fully deleted. Possible causes: the underlying COS delete request failed (e.g. file not found, insufficient bucket permissions), or the deletion did not take effect after DescribeStaticStore rate limiting. Suggestions: 1) Wait 1-2 seconds and check the file status with queryHosting(action=\"findFiles\", prefix=\"{cloudPath}\"); 2) If the files still exist, call manageHosting(action=\"delete\", confirm=true) again; 3) When deleting multiple files, call sequentially with intervals (DescribeStaticStore has a 20 req/s QPS limit).",
    typeDirectory: "directory",
    typeFile: "file",
    setWebsiteDocumentIndexRequired:
      "manageHosting(action=\"setWebsiteDocument\") requires indexDocument, e.g. index.html.",
    setWebsiteDocumentSuccess:
      "Static hosting website document config submitted. To confirm the final config, call queryHosting(action=\"websiteConfig\").",
    enableServiceSuccess:
      "Static hosting service enablement request submitted. Call queryHosting(action=\"status\") to confirm the service is available.",
    bindDomainArgsRequired:
      "manageHosting(action=\"bindDomain\") requires domain and certId.",
    unbindDomainArgsRequired: "manageHosting(action=\"unbindDomain\") requires domain.",
    unbindDomainConfirmRequired:
      "manageHosting(action=\"unbindDomain\") unbinds an existing custom domain and requires explicit confirm=true.",
    updateDomainArgsRequired:
      "manageHosting(action=\"updateDomain\") requires domain, domainId, and domainConfig together.",
    downloadFileArgsRequired:
      "manageHosting(action=\"downloadFile\") requires cloudPath and localPath together; localPath should include the target file name.",
    downloadFileSuccess:
      "Downloaded static hosting file `{cloudPath}` to local path `{localPath}`.",
    downloadDirectoryArgsRequired:
      "manageHosting(action=\"downloadDirectory\") requires cloudPath and localPath together; localPath should be a local directory path.",
    downloadDirectorySuccess:
      "Downloaded static hosting directory `{cloudPath}` to local directory `{localPath}`.",
    domainMutationSubmitted:
      "Static hosting domain {actionLabel} request submitted. Domain configuration, certificate validation, and edge propagation usually take 30 seconds to 10 minutes; keep calling queryHosting(action=\"domainStatus\") to confirm the final result.",
    domainActionBind: "bind",
    domainActionUnbind: "unbind",
    domainActionUpdate: "update",
    domainSuccessIndicatorBind:
      "Keep calling queryHosting(action=\"domainStatus\", domains=[\"{domain}\"]) until the domain appears in the response and the related status fields show it has taken effect.",
    domainSuccessIndicatorUnbind:
      "Keep calling queryHosting(action=\"domainStatus\", domains=[\"{domain}\"]) until the domain no longer appears in the response.",
    domainSuccessIndicatorUpdate:
      "Keep calling queryHosting(action=\"domainStatus\", domains=[\"{domain}\"]) and confirm the config fields in the response have been updated to the latest values.",
    websiteConfigSuccess:
      "Retrieved static hosting website document config and site domain info.",
    statusEnabled: "Retrieved static hosting service status.",
    statusNotEnabled:
      "The static hosting service returned no available instance info; it may not be enabled yet.",
    findFilesPrefixRequired:
      "queryHosting(action=\"findFiles\") requires prefix to find hosted files by prefix.",
    findFilesSuccess:
      "Found {count} static hosting files under prefix `{prefix}`.{more}",
    findFilesMore: " More files are available; use nextMarker to continue.",
    listFilesSuccess:
      "Listed static hosting files (items {start}-{end} of {count}).{more}",
    domainStatusDomainsRequired:
      "queryHosting(action=\"domainStatus\") requires a domains array, e.g. [\"www.example.com\"].",
    domainStatusSuccessIndicator:
      "The target domains appear in the response and the related status fields show they have taken effect.",
    domainStatusAllMatched:
      "Retrieved the target static hosting domain configs. If this is a confirmation step after binding or updating, keep checking the status fields, certificate info, and config values against expectations.",
    domainStatusPending:
      "Some target static hosting domains have not appeared in the query results yet. If this is a confirmation step after binding, keep calling queryHosting(action=\"domainStatus\") until the results converge or the timeout is reached.",
    queryRateLimitGuidance:
      "{message}\nReason: the underlying DescribeStaticStore control-plane API has a 20 req/s QPS limit; rapid successive calls (or immediate retries after failures) easily trigger rate limiting, and this query/operation may not have fully taken effect.\nSuggestions: wait 1-2 seconds before retrying and avoid rapid successive retries; for multi-file operations, call sequentially with intervals.",
  },
);
