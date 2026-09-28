import { defineModule } from "../types.js";

export const functions = defineModule(
  {
    // ---- 工具 meta ----
    queryTitle: "查询 CloudBase 云函数",
    queryDescription:
      "CloudBase 云函数统一只读入口。通过更自解释的 action 查询 CloudBase 云函数列表、函数详情、执行日志、层、触发器、代码下载地址、已发布版本与流量别名。" +
      "\n\n**分页说明**：`listFunctions`、`listLayers`、`listVersionByFunction` 支持 `limit` 和 `offset` 参数。" +
      "\n- `limit`: 分页数量，默认值由后端决定" +
      "\n- `offset`: 分页偏移，从 0 开始" +
      "\n- 示例：`queryFunctions(action=\"listFunctions\", offset=10, limit=10)`" +
      "\n\n**查询 CloudBase 云函数日志**：使用 `action=\"listFunctionLogs\"`，需要提供 `functionName` 参数。" +
      "\n- 示例：`queryFunctions(action=\"listFunctionLogs\", functionName=\"my-function\")`" +
      "\n- 如需查看日志详情：`queryFunctions(action=\"getFunctionLogDetail\", requestId=\"xxx\")`" +
      "\n\n**定时任务 / cron / 定时跑**：使用 `listFunctionTriggers` 查询函数的 timer 触发器配置。" +
      "\n\n**版本与流量路由**：`listVersionByFunction` 列出已发布版本（对齐 tcb fn list-function-versions）；`getFunctionAlias` 查看别名/灰度配置（对齐 tcb fn get-route，aliasName 默认 `$DEFAULT`）。" +
      "\n\n**层（Layer）说明**：" +
      "\n- 层为 SCF 账号级共享命名空间：不同环境创建同名层会共享同一层的版本序列；删除某版本会影响所有绑定该版本的环境的函数" +
      "\n- 创建层必须用带环境标识的唯一层名，固定格式：`{layerName}_{当前envId}`（如 `common_cloud1-d9ghadgak3edf6b36`）。不要在不同环境使用相同裸层名，创建前先 `listLayers` 查重" +
      "\n- `listLayers` / `listLayerVersions` / `getLayerVersionDetail` 返回账号级视图，可能含其他环境创建的层" +
      "\n\n**区分 `queryLogs` 工具**：" +
      "\n- 本工具用于查询特定 CloudBase 云函数的执行日志" +
      "\n- `queryLogs` 工具用于搜索 CLS 日志服务（跨服务日志聚合）",
    manageTitle: "管理 CloudBase 云函数",
    manageDescription:
      "CloudBase 云函数统一写入口。支持创建函数、更新代码、更新配置、调用函数、发布版本、配置流量别名、管理定时跑 / 定时任务 / scheduled job 的 timer 触发器和层绑定。" +
      "如果要创建 cron 定时任务，先用 createFunction 创建函数，再用 createFunctionTrigger 创建 timer 触发器（支持7段cron表达式），deleteFunctionTrigger 删除触发器。" +
      "版本发布：`publishVersion` 对齐 tcb fn publish-version / SDK publishVersion；灰度/切流：`updateFunctionAliasConfig` 对齐 tcb fn config-route / SDK updateFunctionAliasConfig（aliasName 默认 `$DEFAULT`）。" +
      "HTTP 云函数镜像构建部署：createFunction / updateFunctionCode 通过 func.buildStrategy 区分。" +
      "func.buildStrategy=image（已有镜像，填 func.imageConfig.imageUri）直接创建/更新 HTTP 函数；" +
      "func.buildStrategy=local（本地 Docker 构建推送）、cloud（CloudApp 云端构建）走镜像构建部署编排（需要 func.imageConfig；build 非必填，缺省仓库坐标自动补齐：namespace 默认 envId、repository 默认函数名），" +
      "默认仅生成 dry-run 计划；传入 dryRun=false 且 confirm=true 后执行真实部署。真实部署可传 wait=false 立即返回 taskId，再通过 queryFunctions 的 getFunctionDeployStatus 查询进度和结果。wait=false 仅表示当前 Tool 不等待完整部署；调用方不得在 status=running 时结束流程，必须自动轮询到 succeeded/failed 后再向用户汇报，除非达到轮询上限。" +
      "local 始终要求本地 MCP 模式；cloud 的真实执行需要读取本地构建上下文，也要求本地 MCP 模式；cloud mode 仅支持 cloud dry-run 和 image 策略。" +
      "func.buildStrategy 省略或为 zip 时按传统代码包部署。危险操作需要显式 confirm=true。" +
      "\n\n**个人版 TCR 凭证**：imageType=personal 的 local/cloud 构建需要推送凭证。" +
      "若 MCP 配置的 env 中已设置 TCB_TCR_USERNAME 与 TCB_TCR_PASSWORD（与 TENCENTCLOUD_SECRETID 等密钥同样的配置方式），" +
      "则不需要在请求参数中传递 func.imageConfig.build.registryCredential，留空即可自动读取。" +
      "不要向用户索要密码明文，也不要把密码写进工具参数。" +
      "\n注意这条 env 通道只在**本地 stdio MCP、且客户端的 mcp.json 支持自定义 env 块**时可用：" +
      "部分 GUI 客户端不继承 shell 的 export，IDE 内置型 MCP 的凭据注入通常是硬编码白名单（例如只放行 TENCENTCLOUD_*），" +
      "这类用户没有配置自定义 env 的通道，「在 MCP 配置的 env 中设置」对他们是无效指引。" +
      "面向内置 MCP 用户应改为引导：使用企业版（imageType=enterprise，走实例临时令牌，不需要固定密码），或改用 buildStrategy=image 直接部署已推送的镜像。" +
      "\n**企业版登录态要求**：enterprise 的 cloud/local 构建要经 CAM 铸造 TCR 临时令牌，" +
      "环境级 API Key 与 OAuth 换出的临时凭据都不带 CAM 策略，会被前置拦截并提示改用账号级密钥或 image 策略；" +
      "个人版走静态密码直接 docker login，不经过 CAM，反而是 API Key 用户唯一能走通的构建路径。" +
      "\n\n**层（Layer）说明**：" +
      "\n- 层为 SCF 账号级共享命名空间：不同环境创建同名层会共享同一层的版本序列；删除某版本会影响所有绑定该版本的环境的函数" +
      "\n- 创建层必须用带环境标识的唯一层名，固定格式：`{layerName}_{当前envId}`（如 `common_cloud1-d9ghadgak3edf6b36`）。不要在不同环境使用相同裸层名，创建前先 `listLayers` 查重" +
      "\n- 相关 action：`createLayerVersion` / `deleteLayerVersion` / `attachLayer` / `detachLayer` / `updateFunctionLayers`（只读查询见 queryFunctions 的 listLayers / listLayerVersions / getLayerVersionDetail）",

    // ---- Layer 软提示 ----
    "layerWarn.createNameFormat": "建议使用 {layerName}_{envId} 格式，当前名称可能与其他环境共享版本序列",
    "layerWarn.deleteVersion": "该层为账号级共享资源，删除版本会影响所有绑定该版本的环境的函数，请确认",
    "layerWarn.bindShared": "层为账号级共享，绑定/解绑影响所有引用该层名的环境",
    "layerWarn.accountLevelView": "返回账号级视图，含其他环境创建的层",

    // ---- 校验与错误 ----
    unsupportedRuntime: "不支持的运行时环境: \"{runtime}\"\n\n支持的运行时:\n{runtimes}",
    "timerCron.5Fields": "timer 触发器的 cron 表达式必须使用 7 段格式（秒 分 时 日 月 星期 年），不支持标准 5 段格式。\n收到 5 段: \"{cron}\"\n正确示例: \"0 */5 * * * * *\"（每 5 分钟执行），\"0 0 2 1 * * *\"（每月 1 号 2 点）",
    "timerCron.fewFields": "timer 触发器的 cron 表达式必须使用 7 段格式（秒 分 时 日 月 星期 年），当前只有 {fieldCount} 段。\n正确示例: \"0 */5 * * * * *\"（每 5 分钟执行），\"0 0 2 1 * * *\"（每月 1 号 2 点）",
    "timerCron.refine": "timer 触发器的 cron 表达式必须使用 7 段格式（秒 分 时 日 月 星期 年），不支持 5 段格式。正确示例：0 */5 * * * * *",

    "opErr.missingFn": "请先确认环境中已存在函数 `{fnName}`；如果还未创建，请先执行 `manageFunctions(action=\"createFunction\")`。",
    "opErr.expectedPath": "当前工具会从 `functionRootPath + 函数名` 查找代码目录，期望目录是 `{expectedPath}`。",
    "opErr.passParentDir": "如果你传入的已经是函数目录本身，请改为传它的父目录。",
    "opErr.rootPathFormat": "functionRootPath 应该是直接包含函数文件夹的目录（如 cloudfunctions 或 functions），而不是项目根目录。请将 functionRootPath 改为 `{cloudPath}` 或 `{functionsPath}`。",
    "opErr.missingRootPath": "HTTP 函数创建时需要提供 functionRootPath（指向 cloudfunctions 或 functions 目录的绝对路径，不是项目根目录）或 zipFile，否则 SDK 无法定位函数目录。",
    "opErr.nativeHttpHint": "如果 HTTP 函数只使用原生 Node.js API 且没有第三方依赖，可以保留函数目录中的 index.js 和 scf_bootstrap，工具会跳过依赖安装。",
    "opErr.addPackageJson": "如果你确实依赖 npm 包，请在函数目录下补充 package.json 后重试。",
    "opErr.updatingBusy": "函数当前处于 Updating/非 Active，不要立即重试 {operation}。请等待约 10 秒，或先 queryFunctions(action=\"getFunctionDetail\") 确认 Status 为 Active 后再重试。",
    "opErr.invalidParamHeader": "检测到参数值格式错误。请重点检查以下配置项：",
    "opErr.invalidParamRuntime": "1. runtime: 请使用支持的运行时版本，如 Nodejs18.15、Nodejs16.13、Nodejs20.19 等（区分大小写，不要加空格）",
    "opErr.invalidParamHandler": "2. handler: Event 函数默认使用 index.main，HTTP 函数默认使用 app.handler 或 scf_bootstrap 启动",
    "opErr.invalidParamFunctionName": "3. functionName: 函数名称只能包含字母、数字、下划线、连字符，不能以数字开头",
    "opErr.invalidParamTimeout": "4. timeout: 超时时间需为整数，单位为秒，范围 1-900",
    "opErr.invalidParamEnvVariables": "5. envVariables: 环境变量键值对不能为空字符串",
    "opErr.invalidParamType": "6. type: 函数类型只能是 Event 或 HTTP（区分大小写）",
    "opErr.default": "请检查函数名、目录结构和环境中的函数状态后重试。",
    "opErr.prefix": "[{operation}] {message}\n建议：",

    confirmRequired: "{action} 是危险操作，请显式传入 confirm=true 后再执行",
    "cloudMode.localOnly": "{action} 在 cloud mode 下不可用，因为该操作依赖本地函数代码目录。可用出路：1) 使用镜像部署（runtime=CustomImage + imageConfig）；2) 使用 ZIP 两段式部署：先 queryFunctions action=getFunctionUploadUrl 获取预签名上传地址，PUT 代码 zip 后通过 manageFunctions 的 code 入参部署（阶段 B 同样不依赖本地目录）。",
    "cloudMode.contentPathUnsupported": "createLayerVersion 在 cloud mode 下不支持 contentPath，本地文件内容请改为 base64Content 或改用本地模式执行。",

    offsetLimitTooLarge: "offset+limit 不能大于 10000",
    startTimeInvalid: "startTime 格式错误: \"{value}\"。必须使用 YYYY-MM-DD HH:mm:ss 格式（如 2024-01-01 00:00:00）",
    endTimeInvalid: "endTime 格式错误: \"{value}\"。必须使用 YYYY-MM-DD HH:mm:ss 格式（如 2024-01-01 23:59:59）",
    logRangeInvalidDatetime: "startTime 和 endTime 必须是有效的日期时间字符串",
    logRangeTooLong: "startTime 和 endTime 间隔不能超过一天",
    logsInvalidParamTips: "常见原因：\n1. startTime/endTime 格式错误，必须为 YYYY-MM-DD HH:mm:ss（如 2024-01-01 00:00:00），不支持 ISO 8601 或时间戳\n2. startTime 和 endTime 间隔超过一天\n3. functionName 不存在或格式不正确\n建议：不传 startTime/endTime 时默认查询最近一天的日志。",
    logDetailInvalidParamTips: "常见原因：\n1. startTime/endTime 格式错误，必须为 YYYY-MM-DD HH:mm:ss（如 2024-01-01 00:00:00），不支持 ISO 8601 或时间戳\n2. startTime 和 endTime 间隔超过一天\n建议：不传 startTime/endTime 时默认查询最近一天的日志。",

    paramRequired: "{action} 操作时，{param} 参数是必需的",

    "deployStatus.cloudMode": "{action} 在 cloud mode 下不可用：异步部署任务只由 buildStrategy=cloud/local 的真实部署创建，而这两种策略的真实执行在 cloud mode 下都不支持（需要读取本地构建上下文或本地 Docker），因此不会存在任何 taskId。buildStrategy=image 走同步部署，直接在 manageFunctions 的返回里拿结果，也不需要查询部署状态。如需异步镜像构建部署，请改用本地 MCP 模式。",
    deployTaskNotFound: "未找到部署任务 {taskId}；部署任务不存在，可能已过期、不属于当前环境 {envId}，或 MCP Server 已重启（任务仅保存在 MCP 进程内存中）。",
    unsupportedAction: "不支持的操作类型: {action}",
    storageMissing: "当前环境没有可用的对象存储桶（DescribeEnvs 未返回 Storages），无法使用 COS 两段式部署。请检查环境存储配置，或改用本地模式部署。共享存储桶（ExternalStorage）环境同样不支持该通道。",
    credentialMissing: "当前凭据缺少 SecretId/SecretKey（如 IDE 代理模式），无法本地铸造 COS 预签名上传地址。请改用本地模式或包含永久密钥/临时密钥的登录方式。",

    // ---- nextActions reasons ----
    "reason.continuePolling": "继续查询云函数部署状态",
    "reason.getDetail": "查看单个函数详情",
    "reason.createFn": "创建新的云函数",
    "reason.viewLogs": "查看该函数的执行日志",
    "reason.updateConfig": "更新该函数配置",
    "reason.checkGateway": "查看该函数是否已暴露网关访问入口",
    "reason.logDetail": "按 requestId 查看单条日志详情",
    "reason.attachLayer": "为该函数追加绑定层",
    "reason.reorderLayers": "整体调整层顺序或绑定列表",
    "reason.layerVersions": "查看某个层的版本列表",
    "reason.publishLayer": "发布新的层版本",
    "reason.layerVersionDetail": "查看某个层版本详情",
    "reason.bindLayerVersion": "将某个层版本绑定到函数",
    "reason.bindThisLayerVersion": "绑定该层版本到函数",
    "reason.deleteLayerVersion": "删除该层版本",
    "reason.createTrigger": "创建新的触发器",
    "reason.deleteTrigger": "删除指定触发器",
    "reason.confirmTriggers": "确认触发器已生效",
    "reason.remainingTriggers": "确认剩余触发器列表",
    "reason.confirmDeleted": "确认函数已被删除",
    "reason.viewCallLogs": "查看本次调用日志",
    "reason.allLayerVersions": "查看该层的全部版本",
    "reason.remainingLayerVersions": "确认剩余层版本",
    "reason.currentLayers": "确认函数当前绑定层列表",
    "reason.detachedLayers": "确认解绑后的层列表",
    "reason.latestLayerOrder": "确认最新层顺序和绑定结果",
    "reason.confirmConfig": "确认函数配置",
    "reason.checkTriggers": "检查函数触发器",
    "reason.confirmConfigChange": "确认配置变更结果",
    "reason.gatewayRouteForHttp": "如果需要通过 URL 访问 HTTP 函数，请调用 manageGateway(action=\"createRoute\") 并显式传 upstreamResourceType=\"WEB_SCF\"，再按实际路径和鉴权需求创建访问入口，不要默认假设 /函数名 已存在",
    "reason.confirmAccessPath": "交付前确认 HTTP 访问路径是否已存在并已生效",
    "reason.checkPermission": "评测、浏览器或其他外部调用方可能以匿名身份访问；若直接报 EXCEED_AUTHORITY，应先读取当前函数安全规则",
    "reason.adjustPermission": "只有在确认需要匿名访问时，才按实际安全要求调整函数安全规则，例如处理 EXCEED_AUTHORITY",
    "reason.checkDeployStatus": "查询异步部署任务状态",
    "reason.imageFnReady": "确认镜像函数已就绪（Active）",
    "reason.imageUpdateReady": "确认镜像更新后函数已就绪（Active）",
    "reason.imageNextIteration": "后续迭代只需用新镜像 tag 调用 updateFunctionCode 更新镜像",
    "reason.cosCreate": "把 PUT 好的代码 zip 通过 code 入参部署为函数（两段式阶段 B）",
    "reason.imageGatewayRoute": "如需通过 URL 访问镜像 HTTP 函数，显式创建 Domain/Route 访问入口并传 type=\"HTTP\"（映射 WEB_SCF）",
    "reason.latestConfig": "确认最新函数配置",
    "reason.publishVersion": "发布函数新版本（对齐 tcb fn publish-version）",
    "reason.getFunctionAlias": "查看函数流量别名配置（对齐 tcb fn get-route）",
    "reason.updateFunctionAlias": "更新函数流量别名/灰度路由（对齐 tcb fn config-route）",
    "reason.listVersions": "查看函数已发布版本列表（对齐 tcb fn list-function-versions）",
    "reason.routeTraffic": "将流量切到新版本或配置灰度权重",
    "reason.confirmAlias": "确认别名与流量配置已生效",

    // ---- 成功 message ----
    listedFunctions: "已获取 {count} 个云函数",
    gotFunctionDetail: "已获取函数 {fnName} 的详情",
    gotFunctionLogs: "已获取函数 {fnName} 的日志列表",
    gotLogDetail: "已获取 requestId={requestId} 的日志详情",
    gotFunctionLayers: "已获取函数 {fnName} 当前绑定的层",
    gotLayers: "已获取 {count} 条层记录",
    gotLayerVersions: "已获取层 {layerName} 的版本列表",
    gotLayerVersionDetail: "已获取层 {layerName} 版本 {layerVersion} 的详情",
    gotFunctionTriggers: "已获取函数 {fnName} 的触发器列表",
    gotDownloadUrl: "已获取函数 {fnName} 的代码下载链接",
    gotUploadUrl: "已生成函数代码包上传地址（{seconds} 秒内有效）。下一步：PUT 代码 zip 到 uploadUrl（uploadHeaders 非空时须随请求携带），再调用 manageFunctions createFunction/updateFunctionCode 并传入 code 三元组（cosBucketName/cosObjectName/cosBucketRegion）完成部署",
    gotFunctionVersions: "已获取函数 {fnName} 的版本列表",
    gotFunctionAlias: "已获取函数 {fnName} 的别名 {aliasName}",
    publishedVersion: "已发布函数 {fnName} 的新版本 {version}",
    updatedFunctionAlias: "已更新函数 {fnName} 别名 {aliasName}（主版本 {version}）",
    createdHttpFunctionMessage: "已创建 HTTP 函数 {fnName}。如果后续需要通过 URL 访问，请显式调用 manageGateway(action=\"createRoute\")，并把 upstreamResourceType=\"WEB_SCF\" 一起传入，再按实际路径和鉴权需求创建访问入口。评测或其他外部调用方可能会以匿名身份访问，而且失败后不一定会把 EXCEED_AUTHORITY 再反馈给 AI；交付前请主动确认访问路径和函数安全规则，若已出现 EXCEED_AUTHORITY，请先调用 queryPermissions(action=\"getResourcePermission\", resourceType=\"function\", resourceId=\"{fnName}\") 查看当前规则，再按需要使用 managePermissions(action=\"updateResourcePermission\") 调整权限。",
    createdFunction: "已创建函数 {fnName}",
    cosCreatedMessage: "已基于环境 COS 桶中的代码包（deployMode=cos）创建函数 {fnName}。部署后可用 queryFunctions(action=\"getFunctionDetail\") 确认函数已就绪。",
    cosUpdatedMessage: "已用环境 COS 桶中的新代码包（deployMode=cos）更新函数 {fnName} 的代码。部署后可用 queryFunctions(action=\"getFunctionDetail\") 确认函数已就绪（Active）。",
    imageCreatedMessage: "已基于镜像 {imageUri} 创建 HTTP 函数 {fnName}。请确认 TCR、SCF 与构建管道处于同一地域；如需通过 URL 访问，请显式调用 manageGateway(action=\"createRoute\", upstreamResourceType=\"WEB_SCF\") 并按需调整函数安全规则。部署后可用 queryFunctions(action=\"getFunctionDetail\") 确认函数已就绪。",
    imageUpdatedMessage: "已将函数 {fnName} 的镜像更新为 {imageUri}。部署后可用 queryFunctions(action=\"getFunctionDetail\") 确认函数已就绪（Active）。",
    updatedCode: "已更新函数 {fnName} 的代码",
    updatedConfig: "已更新函数 {fnName} 的配置",
    invokedFunction: "已调用函数 {fnName}",
    invokeNotFoundTip: "{message}\n\nTip: \"invokeFunction\" 只能调用已部署的云函数。数据库操作请使用对应的数据工具。",
    deletedFunction: "已删除函数 {fnName}",
    createdTriggers: "已为函数 {fnName} 创建触发器",
    deletedTrigger: "已删除函数 {fnName} 的触发器 {triggerName}",
    createdLayerVersion: "已创建层 {layerName} 的新版本",
    deletedLayerVersion: "已删除层 {layerName} 的版本 {layerVersion}",
    attachedLayer: "已将层 {layerName}:{layerVersion} 绑定到函数 {fnName}",
    detachedLayer: "已从函数 {fnName} 解绑层 {layerName}:{layerVersion}",
    updatedLayers: "已更新函数 {fnName} 的层绑定列表",
    overrideDeployOk: "云函数部署成功（override）",
    overrideUpdateOk: "云函数代码更新成功（override）",
    incrementalDeployOk: "云函数增量部署成功",
    incrementalNotInjected: "incrementalDeployFunction 需要通过 pluginOptions.functions.incrementalDeployFunction 注入实现（仅在支持的 IDE 环境中可用）",

    // ---- 镜像构建部署 ----
    imageDeployFnNameRequired: "{action} 触发镜像构建部署时，函数名是必需的（func.name 或顶层 functionName）。",
    imageDeployConfirmRequired: "{action} 执行真实镜像部署时必须显式传入 confirm=true；如只查看计划，请使用 dryRun=true。",
    imageDeployLocalCloudMode: "{action} 的 buildStrategy=local 依赖本地源码与 Docker，在 cloud mode 下不可用。请改用本地 MCP 模式，或改用 cloud/image 策略。",
    imageDeployCloudCloudMode: "{action} 的 buildStrategy=cloud 在真实执行时需要读取并打包本地构建上下文，在 cloud mode 下不可用。请改用本地 MCP 模式执行，或先提供已推送镜像并使用 image 策略。",
    imageDeployValidationFailed: "{action} 镜像部署参数校验失败：{detail}",
    imageDeployCamLimited: "{action} 的 buildStrategy={strategy} 需要通过 CAM 为企业版 TCR 铸造临时令牌，但当前登录态无 CAM 权限（环境级 API Key 与 OAuth 换出的临时凭据都不带 CAM 策略），构建必然在中途失败。请改用账号级密钥 TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY 登录，或改用 buildStrategy=image 直接部署已推送的镜像；个人版镜像（imageType=personal）走静态密码不经过 CAM，也不受此限制。",
    imageDeployAsyncAccepted: "已接受云函数 {fnName} 的异步镜像部署任务。当前请求不会等待完整构建；请勿向用户报告“部署已完成”。必须使用 queryFunctions(action=\"getFunctionDeployStatus\", taskId=\"{taskId}\") 自动轮询，直到 status=succeeded 或 failed，再向用户汇报最终结果。建议首次等待约 5 秒，后续按返回的 progress 继续查询；仅达到轮询上限时，才报告任务仍在执行并附带 taskId。",
    imageDeploySyncWaitHint: "提示：本次为同步等待完整部署（wait 默认 true），构建耗时可能达到十几分钟并触发 MCP Client 请求超时；超时只会断开请求，云端部署仍在继续，但届时拿不到 taskId 追踪。下次执行真实构建部署建议传 wait=false，再用 queryFunctions(action=\"getFunctionDeployStatus\") 轮询。",

    // ---- 镜像分支错误 ----
    imageUriRequired: "镜像部署（runtime=CustomImage）时，imageConfig.imageUri 是必需的，格式为 {domain}/{namespace}/{image}:{tag}（含 tag，不要用 :latest）。",
    imageUpdateUriRequired: "镜像更新时，imageConfig.imageUri 是必需的，格式为 {domain}/{namespace}/{image}:{tag}（含 tag，不要用 :latest）。",
    registryIdRequired: "imageType=enterprise（企业版 TCR）时，imageConfig.registryId（tcr-xxxxxxxx）是必需的。",
    httpFunctionNeedsRootPath: "createFunction 创建 HTTP 函数时，需要提供 functionRootPath（指向 cloudfunctions 或 functions 目录的绝对路径，不是项目根目录）或 zipFile。",
    functionMissing: "函数 {fnName} 不存在或无法获取详情",
    layersInvalid: "updateFunctionLayers 操作时，layers 参数必须包含有效的 layerName 和 layerVersion",
    contentPathRequired: "createLayerVersion 操作时，contentPath 和 base64Content 至少需要提供一个",

    // ---- 诊断警告（stderr） ----
    rootPathAdjustedWarn: "检测到 functionRootPath 包含函数名 \"{fnName}\"，已自动调整为父目录: {parentPath}",
    runtimeSpacesRemovedWarn: "检测到 runtime 参数包含空格: \"{runtime}\"，已自动移除空格",
    noPackageJsonWarn: "检测到 HTTP 函数 {fnName} 目录下没有 package.json，已跳过依赖安装；如果你需要第三方依赖，请补充 package.json 后重试。",

    // ---- Schema parameter descriptions ----
    "schema.vpcId": "VPC ID from the real database/network console (e.g. vpc-xxxxxxxx). Required for non-native TCP DB access. Do NOT invent or use placeholders.",
    "schema.subnetId": "Subnet ID in the same VPC as the private DB endpoint (e.g. subnet-xxxxxxxx). Do NOT invent or use placeholders.",
    "schema.image.imageUri": "完整镜像地址（必须含 tag），格式 {domain}/{namespace}/{image}:{tag}，例如 ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001。不要使用 :latest。buildStrategy=image（已有镜像）时必填；buildStrategy=cloud/local 可以不填：镜像地址由构建流程产出并回传；目标仓库由 build.repository/build.namespace 决定，显式提供时优先使用你提供的配置，省略时由 manager-node 用默认值自动补齐并创建/复用（namespace 默认 envId、repository 默认函数名）。",
    "schema.image.build": "镜像构建目标。buildStrategy=cloud（云端构建）或 local（本地 Docker 构建）时使用；buildStrategy=image（已有镜像）不填。cloud/local 下 build 非必填：缺省仓库坐标可自动补齐（namespace 默认 envId、repository 默认函数名），仅需指定构建细节或个人版 build.registryCredential 等字段时才填。",
    "schema.image.localFallback": "buildStrategy=local 时本地构建不可用的处理方式，默认 error。",
    "schema.trigger.name": "触发器名称",
    "schema.trigger.type": "触发器类型",
    "schema.trigger.config": "触发器配置。timer 必须使用 CloudBase 7 段 cron 格式：秒 分 时 日 月 星期 年。⚠️ 不支持标准 5 段 cron（如 */5 * * * * 是错误的）。正确示例：0 */5 * * * * *（每5分钟）、0 0 2 1 * * *（每月1号2点）、0 30 9 * * * *（每天9:30）",
    "schema.create.name": "函数名称",
    "schema.create.type": "函数类型",
    "schema.create.protocolType": "HTTP 函数访问协议，当前仅支持 WebSockets，取值为 WS（配合 protocolParams.wsParams 使用）。普通 HTTP 函数不要传此字段；传其他值（如 HTTP）会报 InvalidParameterValue.ProtocolType。",
    "schema.create.wsIdleTimeout": "WebSocket 空闲超时时间（秒）",
    "schema.create.timeout": "函数超时时间",
    "schema.create.envVariables": "环境变量。若包含 DATABASE_URL / MYSQL_* / POSTGRES_* / REDIS_* 等传统 TCP 连库变量，必须同时配置 vpc（vpcId+subnetId），且 ID 必须来自真实库/网络信息，禁止猜测。原生 app.rdb()/app.database() 不需要 VPC。",
    "schema.create.vpc": "私有网络配置（出网）。非原生 SDK、用 TCP 访问 VPC 内 MySQL/PostgreSQL/Redis 时必填。vpcId/subnetId 必须与数据库内网 VPC 一致；未知时先查控制台或询问用户，禁止填占位符。",
    "schema.create.runtime": "运行时环境。Event 函数支持多种运行时:\n  Nodejs: Nodejs20.19, Nodejs18.15, Nodejs16.13, Nodejs14.18, Nodejs12.16, Nodejs10.15, Nodejs8.9\n  Python: Python3.10, Python3.9, Python3.7, Python3.6, Python2.7\n  Php: Php8.0, Php7.4, Php7.2\n  Java: Java8, Java11\n  Golang: Golang1\n\n推荐运行时:\n  Node.js: Nodejs18.15\n  Python: Python3.9\n  PHP: Php7.4\n  Java: Java11\n  Go: Golang1\n\n镜像部署（基于 TCR 镜像创建函数）时填 \"CustomImage\"，并提供 imageConfig；此时无需 functionRootPath/zipFile。",
    "schema.create.buildStrategy": "HTTP 函数部署策略：zip=代码包部署（默认，缺省即 zip）；image=使用已有镜像（imageConfig.imageUri 必填）；cloud=云端构建镜像；local=本地 Docker 构建镜像。cloud/local 走镜像构建部署编排，需要 imageConfig；其中 build 非必填：目标仓库坐标（namespace 默认 envId、repository 默认函数名）等缺省可自动补齐，仅在需要指定构建细节或个人版 build.registryCredential 等特定字段时才提供 build。",
    "schema.create.imageConfig": "镜像配置（buildStrategy=image/cloud/local 或 runtime=CustomImage 时使用），镜像相关字段全部收敛在此命名空间下。image：填 imageUri 使用已有镜像；cloud/local：可填 build 描述如何构建，省略时用默认仓库坐标自动补齐。传入已有镜像（imageUri）即按镜像部署处理，函数无需打包本地代码、scf_bootstrap 或 Handler。",
    "schema.create.triggers": "触发器配置数组",
    "schema.create.handler": "函数入口",
    "schema.create.ignore": "忽略文件",
    "schema.create.isWaitInstall": "是否等待依赖安装",
    "schema.create.layers": "Layer 配置",
    "schema.manageLayer.name": "层名称",
    "schema.manageLayer.version": "层版本号",
    "schema.query.action": "只读操作类型：\n- `listFunctions`: 列出所有 CloudBase 云函数\n- `getFunctionDetail`: 获取 CloudBase 云函数详情（需要 functionName）\n- `listFunctionLogs`: 查询 CloudBase 云函数执行日志（需要 functionName）\n- `getFunctionLogDetail`: 获取日志详情（需要 requestId）\n- `listFunctionLayers`: 列出函数绑定的层\n- `listLayers`: 列出所有层（账号级视图，含其他环境创建的层）\n- `listLayerVersions`: 列出层的版本（注意：是 Versions 不是 Version；账号级视图）\n- `getLayerVersionDetail`: 获取层版本详情（账号级视图）\n- `listFunctionTriggers`: 列出函数触发器（用于查看定时任务 / cron / timer 配置）\n- `getFunctionDownloadUrl`: 获取函数代码下载地址\n- `getFunctionDeployStatus`: 按 taskId 查询异步部署状态、阶段进度和最终结果。返回 data.build（构建子状态）、data.deploy（部署子状态）、data.progress（阶段事件）；status=running 时 data.result 与 data.error 一律为 null，不得报告部署完成。调用方必须持续轮询直到 status=succeeded/failed；status=expired 表示任务超过最长保留时间（2 小时）被终结，云端可能仍在部署，需用 getFunctionDetail 确认。任务只保存在 MCP 进程内存中，过期或 MCP Server 重启后返回 errorCode=DEPLOY_TASK_NOT_FOUND；任务按环境隔离，只能查到当前环境自己发起的部署。cloud mode 下本 action 不可用：异步任务只由 buildStrategy=cloud/local 的真实部署创建，而这两种策略在 cloud mode 下都不支持真实执行，image 策略则走同步部署不产生 taskId。\n- `listVersionByFunction`: 列出函数已发布版本（对齐 tcb fn list-function-versions / SDK listVersionByFunction；需要 functionName）\n- `getFunctionAlias`: 查询函数别名与流量路由（对齐 tcb fn get-route / SDK getFunctionAlias；需要 functionName；aliasName 默认 $DEFAULT）\n- `getFunctionUploadUrl`: 获取函数代码包的 COS 预签名上传地址（ZIP 两段式部署阶段 A）：PUT 代码 zip 到 uploadUrl（uploadHeaders 非空时须随请求携带对应请求头），再调用 manageFunctions 的 createFunction/updateFunctionCode 并传 code 三元组（阶段 B）。functionName 可选，仅用于生成上传对象 key。返回的 uploadUrl 含凭据签名，不得写入日志或持久化",
    "schema.query.functionName": "CloudBase 云函数名称。`getFunctionDetail`、`listFunctionLogs`、`listFunctionLayers`、`listFunctionTriggers`、`getFunctionDownloadUrl`、`listVersionByFunction`、`getFunctionAlias` 时必填；`getFunctionUploadUrl` 可选（仅用于生成上传对象 key）",
    "schema.query.limit": "分页数量（limit）。列表类 action 可选，默认值由后端决定",
    "schema.query.offset": "分页偏移（offset）。列表类 action 可选，默认 0",
    "schema.query.codeSecret": "代码保护密钥，用于解密函数代码",
    "schema.query.revealEnvValues": "getFunctionDetail / listFunctionTriggers 时是否返回环境变量明文值。默认 false：Value 脱敏为 ***，仅保留 Key 与 ValueLength，足以确认配置了哪些变量及变更是否生效；true 时返回明文，敏感变量会进入模型上下文，谨慎使用。如需查看明文，建议优先使用控制台或 CLI",
    "schema.query.startTime": "日志查询开始时间，格式必须为 YYYY-MM-DD HH:mm:ss（如 2024-01-01 00:00:00）。与 endTime 间隔不能超过一天。不传时默认查询最近一天",
    "schema.query.endTime": "日志查询结束时间，格式必须为 YYYY-MM-DD HH:mm:ss（如 2024-01-01 23:59:59）。与 startTime 间隔不能超过一天。不传时默认为当前时间",
    "schema.query.requestId": "日志请求 ID。`getFunctionLogDetail` 操作必填，可从 `listFunctionLogs` 结果中获取",
    "schema.query.qualifier": "函数版本别名，如 $LATEST、$DEFAULT。日志查询时可选",
    "schema.query.runtime": "层查询的运行时筛选，如 Nodejs18.15",
    "schema.query.searchKey": "层名称搜索关键字",
    "schema.query.layerName": "层名称。`listLayerVersions`、`getLayerVersionDetail` 操作必填。层为账号级共享命名空间；推荐固定格式 `{layerName}_{当前envId}`（如 common_cloud1-d9ghadgak3edf6b36）",
    "schema.query.layerVersion": "层版本号。`getLayerVersionDetail` 操作必填",
    "schema.query.taskId": "`getFunctionDeployStatus` 操作时的异步部署任务 ID（由 manageFunctions 的 wait=false 返回）。任务仅保存在当前 MCP 进程内存中：终态任务保留约 30 分钟，运行中任务最长保留 2 小时。",
    "schema.query.order": "`listVersionByFunction` 排序方向，如 ASC / DESC",
    "schema.query.orderBy": "`listVersionByFunction` 排序字段，如 AddTime / ModTime",
    "schema.query.aliasName": "`getFunctionAlias` 的别名名称。省略时默认 `$DEFAULT`（与 tcb fn get-route 一致）",
    "schema.manage.action": "写操作类型，例如 createFunction、updateFunctionCode、incrementalDeployFunction、invokeFunction、deleteFunction、createFunctionTrigger（定时任务 / cron / timer）、deleteFunctionTrigger、createLayerVersion、deleteLayerVersion、attachLayer、detachLayer、updateFunctionLayers、publishVersion（发布新版本，对齐 tcb fn publish-version）、updateFunctionAliasConfig（更新别名/流量路由，对齐 tcb fn config-route）。层名推荐固定格式 `{layerName}_{当前envId}`（如 common_cloud1-d9ghadgak3edf6b36）",
    "schema.manage.func": "createFunction / updateFunctionCode 的函数配置。镜像/构建部署通过 func.buildStrategy（zip/cloud/local/image）区分，镜像相关字段收敛在 func.imageConfig 命名空间下。",
    "schema.manage.functionRootPath": "创建或更新函数代码时默认推荐的本地目录方式。必须是直接包含函数文件夹的目录绝对路径（如 /abs/path/cloudfunctions 或 /abs/path/functions），不要传项目根目录（如 /abs/path），也不要传到函数名子目录（如 /abs/path/cloudfunctions/hello）。本地应按 cloudfunctions/<functionName>/index.js 或 functions/<functionName>/index.js 布局，此参数传 cloudfunctions 或 functions 目录的绝对路径。SDK 会自动拼接函数名子目录，无需预先压缩 zip 或 base64 编码。",
    "schema.manage.force": "createFunction 时是否覆盖",
    "schema.manage.functionName": "目标函数名称（顶层）。updateFunctionCode / updateFunctionConfig / invokeFunction / publishVersion / updateFunctionAliasConfig 等 action 使用此字段。不要只写在 func.name：createFunction 用 func.name，其它 action 用顶层 functionName。若误传 func.name，也会被识别为 functionName。",
    "schema.manage.zipFile": "仅兼容特殊场景：预先准备好的代码包 base64 编码。普通 createFunction/updateFunctionCode 默认不要先压缩 zip，优先使用 functionRootPath。",
    "schema.manage.code": "ZIP 两段式部署阶段 B：代码包已通过 queryFunctions action=getFunctionUploadUrl 上传到环境 COS 桶。三元组（cosBucketName/cosObjectName/cosBucketRegion）直接使用 getFunctionUploadUrl 返回值原样透传。传入 code 后 createFunction/updateFunctionCode 不再读取本地目录（functionRootPath/zipFile 均不需要），默认不触发云端依赖安装（可用 func.installDependency 覆盖）。",
    "schema.code.cosBucketName": "环境存储桶短名（不含 -appid 后缀），直接使用 getFunctionUploadUrl 返回的 cosBucketName，不要自填",
    "schema.code.cosObjectName": "上传对象 key，直接使用 getFunctionUploadUrl 返回的 cosObjectName",
    "schema.code.cosBucketRegion": "存储桶地域，省略时自动使用当前环境存储桶地域",
    "schema.manage.handler": "函数入口",
    "schema.manage.timeout": "配置更新时的超时时间",
    "schema.manage.envVariables": "配置更新时要合并的环境变量。若含 DATABASE_URL / MYSQL_* / POSTGRES_* / REDIS_* 等 TCP 连库变量，必须同时提供真实 vpc（或函数已绑定完整 VPC）。禁止猜测 vpcId/subnetId。",
    "schema.manage.vpc": "配置更新时的 VPC 信息。非原生 TCP 连库场景必填真实 vpcId+subnetId；不要用占位符。",
    "schema.manage.params": "invokeFunction 的调用参数",
    "schema.manage.triggers": "createFunctionTrigger 的触发器列表，用于定时跑 / 定时任务 / scheduled job。timer 触发器使用7段 cron 表达式（秒 分 时 日 月 星期 年），如 \"0 */5 * * * * *\" 表示每5分钟执行一次",
    "schema.manage.triggerName": "deleteFunctionTrigger 的目标触发器名称",
    "schema.manage.layerName": "层名称。创建层推荐固定格式 `{layerName}_{当前envId}`（如 common_cloud1-d9ghadgak3edf6b36）；不要跨环境复用裸层名。层为账号级共享命名空间",
    "schema.manage.layerVersion": "层版本号",
    "schema.manage.contentPath": "层内容路径，可为目录或 ZIP 文件",
    "schema.manage.base64Content": "层内容的 base64 编码",
    "schema.manage.runtimes": "层适用的运行时列表",
    "schema.manage.description": "描述信息。createLayerVersion 时为层版本描述；publishVersion / updateFunctionAliasConfig 时为版本或别名描述",
    "schema.manage.licenseInfo": "层许可证信息",
    "schema.manage.layers": "updateFunctionLayers 的目标层列表，顺序即最终顺序",
    "schema.manage.codeSecret": "层绑定时的代码保护密钥",
    "schema.manage.dryRun": "镜像构建部署（func.buildStrategy=cloud/local）是否只生成部署计划。默认 true；传 false 时必须同时传 confirm=true。",
    "schema.manage.wait": "真实镜像部署是否等待完整部署；设为 false 立即返回 taskId 并后台执行。默认 true 是为了兼容既有调用方，但同步等待最长可达约 15 分钟，很容易先撞上 MCP Client 的请求超时——客户端超时只是断开这次请求，云端部署仍在继续，却拿不到 taskId 追踪。因此执行真实构建部署（buildStrategy=cloud/local，dryRun=false）时建议显式传 wait=false。",
    "schema.manage.autoGrant": "镜像部署是否允许 manager-node 自动补齐固定白名单 CAM 策略。默认 false；仅在明确确认权限变更时设为 true。",
    "schema.manage.confirm": "危险操作确认开关。deleteFunction、deleteFunctionTrigger、deleteLayerVersion、detachLayer 等删除类操作以及镜像构建部署（func.buildStrategy=cloud/local）真实执行需要显式传入 confirm=true",
    "schema.manage.incrementalFile": "incrementalDeployFunction 增量部署时的变更文件路径",
    "schema.manage.aliasName": "`updateFunctionAliasConfig` 的别名名称。省略时默认 `$DEFAULT`（与 tcb fn config-route 一致）",
    "schema.manage.functionVersion": "`updateFunctionAliasConfig` 的主版本。可为具体版本号或 `$LATEST`",
    "schema.manage.routingConfig": "`updateFunctionAliasConfig` 的流量路由配置。AdditionalVersionWeights 用于灰度权重；AddtionVersionMatchs 为 SCF/SDK 历史字段名（含拼写）",
    "schema.routing.version": "附加流量版本号",
    "schema.routing.weight": "附加流量权重（0-1 或百分比，按 SCF 约定）",
    "schema.routing.matchVersion": "匹配规则指向的版本号",
    "schema.routing.matchKey": "匹配规则的 Header/Query Key",
    "schema.routing.matchMethod": "匹配方法，如 Exact / Regex",
    "schema.routing.matchExpression": "匹配表达式",
    "schema.routing.additionalWeights": "附加版本权重列表（灰度发布）",
    "schema.routing.additionalMatches": "附加版本匹配规则列表（字段名保持 SCF AddtionVersionMatchs）",
  },
  {
    // ---- Tool meta ----
    queryTitle: "Query CloudBase Cloud Functions",
    queryDescription:
      "Unified read-only entry for CloudBase cloud functions. Query function lists, function details, execution logs, layers, triggers, code download URLs, published versions, and traffic aliases through self-explanatory actions." +
      "\n\n**Pagination**: `listFunctions`, `listLayers`, and `listVersionByFunction` support `limit` and `offset` parameters." +
      "\n- `limit`: page size, the default is decided by the backend" +
      "\n- `offset`: pagination offset, starting from 0" +
      "\n- Example: `queryFunctions(action=\"listFunctions\", offset=10, limit=10)`" +
      "\n\n**Querying cloud function logs**: use `action=\"listFunctionLogs\"`, which requires the `functionName` parameter." +
      "\n- Example: `queryFunctions(action=\"listFunctionLogs\", functionName=\"my-function\")`" +
      "\n- To view log details: `queryFunctions(action=\"getFunctionLogDetail\", requestId=\"xxx\")`" +
      "\n\n**Scheduled tasks / cron / timers**: use `listFunctionTriggers` to query a function's timer trigger configuration." +
      "\n\n**Versions and traffic routing**: `listVersionByFunction` lists published versions (aligns with tcb fn list-function-versions); `getFunctionAlias` views alias / canary config (aligns with tcb fn get-route; aliasName defaults to `$DEFAULT`)." +
      "\n\n**Layers**:" +
      "\n- Layers are account-level shared namespaces in SCF: same-named layers created in different environments share one version sequence; deleting a version affects functions in every environment bound to it" +
      "\n- When creating a layer, use a unique name with the environment suffix, in the fixed format `{layerName}_{current envId}` (e.g. `common_cloud1-d9ghadgak3edf6b36`). Do not reuse the same bare layer name across environments; check with `listLayers` before creating" +
      "\n- `listLayers` / `listLayerVersions` / `getLayerVersionDetail` return the account-level view, which may include layers created by other environments" +
      "\n\n**Distinguish from the `queryLogs` tool**:" +
      "\n- This tool queries execution logs of a specific CloudBase cloud function" +
      "\n- The `queryLogs` tool searches the CLS log service (cross-service log aggregation)",
    manageTitle: "Manage CloudBase Cloud Functions",
    manageDescription:
      "Unified write entry for CloudBase cloud functions. Supports creating functions, updating code, updating configuration, invoking functions, publishing versions, configuring traffic aliases, and managing timer triggers (scheduled jobs / cron) and layer bindings." +
      " To create a cron scheduled task, first create the function with createFunction, then create the timer trigger with createFunctionTrigger (7-field cron expression supported), and delete triggers with deleteFunctionTrigger." +
      " Version publish: `publishVersion` aligns with tcb fn publish-version / SDK publishVersion; canary / traffic shift: `updateFunctionAliasConfig` aligns with tcb fn config-route / SDK updateFunctionAliasConfig (aliasName defaults to `$DEFAULT`)." +
      " HTTP function image build & deploy: createFunction / updateFunctionCode distinguish via func.buildStrategy." +
      " func.buildStrategy=image (existing image, set func.imageConfig.imageUri) creates/updates the HTTP function directly;" +
      " func.buildStrategy=local (local Docker build & push) and cloud (CloudApp cloud build) go through the image build/deploy orchestration (func.imageConfig required; build optional — missing registry coordinates are auto-filled: namespace defaults to envId, repository defaults to the function name)," +
      " and only a dry-run plan is generated by default; pass dryRun=false with confirm=true to execute the real deployment. A real deployment may pass wait=false to return a taskId immediately; query progress and results via getFunctionDeployStatus of queryFunctions. wait=false only means this tool call does not wait for the full deployment; the caller must not finish while status=running and must keep polling until succeeded/failed before reporting to the user, unless the polling limit is reached." +
      " local always requires local MCP mode; the real execution of cloud also requires local MCP mode because it reads the local build context; cloud mode only supports cloud dry-run and the image strategy." +
      " When func.buildStrategy is omitted or zip, traditional code package deployment applies. Dangerous operations require explicit confirm=true." +
      "\n\n**Personal-edition TCR credentials**: local/cloud builds with imageType=personal need push credentials." +
      " If TCB_TCR_USERNAME and TCB_TCR_PASSWORD are already set in the env of the MCP configuration (configured the same way as TENCENTCLOUD_SECRETID and other keys)," +
      " there is no need to pass func.imageConfig.build.registryCredential in request parameters — leave it empty and it will be read automatically." +
      " Do not ask users for plaintext passwords, and do not put passwords into tool parameters." +
      "\nNote this env channel only works with **local stdio MCP and clients whose mcp.json supports a custom env block**:" +
      " some GUI clients do not inherit shell exports, and IDE built-in MCPs usually inject credentials through a hardcoded whitelist (e.g. only TENCENTCLOUD_*)," +
      " so those users have no channel to configure a custom env — telling them to \"set it in the MCP config env\" is ineffective guidance." +
      " For built-in MCP users, guide them instead to use the enterprise edition (imageType=enterprise, instance temporary tokens, no fixed password) or to use buildStrategy=image to deploy an already-pushed image." +
      "\n**Enterprise-edition login requirements**: cloud/local builds for enterprise require minting a TCR temporary token via CAM." +
      " Environment-level API keys and temporary credentials from OAuth carry no CAM policy and will be blocked up front with a hint to switch to account-level keys or the image strategy;" +
      " personal edition logs in directly with a static password via docker login without CAM, and is in fact the only build path that works for API-key users." +
      "\n\n**Layers**:" +
      "\n- Layers are account-level shared namespaces in SCF: same-named layers created in different environments share one version sequence; deleting a version affects functions in every environment bound to it" +
      "\n- When creating a layer, use a unique name with the environment suffix, in the fixed format `{layerName}_{current envId}` (e.g. `common_cloud1-d9ghadgak3edf6b36`). Do not reuse the same bare layer name across environments; check with `listLayers` before creating" +
      "\n- Related actions: `createLayerVersion` / `deleteLayerVersion` / `attachLayer` / `detachLayer` / `updateFunctionLayers` (read-only queries: listLayers / listLayerVersions / getLayerVersionDetail of queryFunctions)",

    // ---- Layer soft warnings ----
    "layerWarn.createNameFormat": "Consider using the {layerName}_{envId} format; the current name may share a version sequence with other environments",
    "layerWarn.deleteVersion": "This layer is an account-level shared resource; deleting a version affects functions in every environment bound to it. Please confirm.",
    "layerWarn.bindShared": "Layers are account-level shared; binding/unbinding affects every environment referencing this layer name",
    "layerWarn.accountLevelView": "Returns the account-level view, including layers created by other environments",

    // ---- Validation & errors ----
    unsupportedRuntime: "Unsupported runtime: \"{runtime}\"\n\nSupported runtimes:\n{runtimes}",
    "timerCron.5Fields": "The cron expression of a timer trigger must use the 7-field format (second minute hour day month week year); the standard 5-field format is not supported.\nReceived 5 fields: \"{cron}\"\nCorrect examples: \"0 */5 * * * * *\" (every 5 minutes), \"0 0 2 1 * * *\" (02:00 on the 1st of every month)",
    "timerCron.fewFields": "The cron expression of a timer trigger must use the 7-field format (second minute hour day month week year), but only {fieldCount} fields were provided.\nCorrect examples: \"0 */5 * * * * *\" (every 5 minutes), \"0 0 2 1 * * *\" (02:00 on the 1st of every month)",
    "timerCron.refine": "The cron expression of a timer trigger must use the 7-field format (second minute hour day month week year); 5-field format is not supported. Correct example: 0 */5 * * * * *",

    "opErr.missingFn": "Please confirm the function `{fnName}` already exists in the environment; if it has not been created yet, run `manageFunctions(action=\"createFunction\")` first.",
    "opErr.expectedPath": "This tool looks up the code directory at `functionRootPath + function name`; the expected directory is `{expectedPath}`.",
    "opErr.passParentDir": "If what you passed is already the function directory itself, pass its parent directory instead.",
    "opErr.rootPathFormat": "functionRootPath should be the directory that directly contains the function folders (e.g. cloudfunctions or functions), not the project root. Please change functionRootPath to `{cloudPath}` or `{functionsPath}`.",
    "opErr.missingRootPath": "Creating an HTTP function requires functionRootPath (an absolute path to the cloudfunctions or functions directory, not the project root) or zipFile; otherwise the SDK cannot locate the function directory.",
    "opErr.nativeHttpHint": "If the HTTP function only uses native Node.js APIs with no third-party dependencies, you can keep index.js and scf_bootstrap in the function directory and the tool will skip dependency installation.",
    "opErr.addPackageJson": "If you do depend on npm packages, add a package.json in the function directory and retry.",
    "opErr.updatingBusy": "The function is currently Updating/not Active; do not retry {operation} immediately. Wait about 10 seconds, or first run queryFunctions(action=\"getFunctionDetail\") to confirm the Status is Active before retrying.",
    "opErr.invalidParamHeader": "Invalid parameter value detected. Please check the following configuration items:",
    "opErr.invalidParamRuntime": "1. runtime: use a supported runtime version such as Nodejs18.15, Nodejs16.13, or Nodejs20.19 (case-sensitive, no spaces)",
    "opErr.invalidParamHandler": "2. handler: Event functions default to index.main; HTTP functions start with app.handler or scf_bootstrap by default",
    "opErr.invalidParamFunctionName": "3. functionName: function names may only contain letters, digits, underscores, and hyphens, and cannot start with a digit",
    "opErr.invalidParamTimeout": "4. timeout: must be an integer in seconds, in the range 1-900",
    "opErr.invalidParamEnvVariables": "5. envVariables: environment variable key/value pairs cannot be empty strings",
    "opErr.invalidParamType": "6. type: the function type must be Event or HTTP (case-sensitive)",
    "opErr.default": "Please check the function name, directory structure, and the function status in the environment, then retry.",
    "opErr.prefix": "[{operation}] {message}\nSuggestions: ",

    confirmRequired: "{action} is a dangerous operation; pass confirm=true explicitly before executing",
    "cloudMode.localOnly": "{action} is unavailable in cloud mode because the operation depends on a local function code directory. Options: 1) use image deployment (runtime=CustomImage + imageConfig); 2) use two-phase ZIP deployment: first call queryFunctions action=getFunctionUploadUrl to get a presigned upload URL, PUT the code zip, then deploy via the manageFunctions code parameter (phase B also needs no local directory).",
    "cloudMode.contentPathUnsupported": "createLayerVersion does not support contentPath in cloud mode; switch local file content to base64Content or run in local mode.",

    offsetLimitTooLarge: "offset+limit must not be greater than 10000",
    startTimeInvalid: "Invalid startTime: \"{value}\". It must use the YYYY-MM-DD HH:mm:ss format (e.g. 2024-01-01 00:00:00)",
    endTimeInvalid: "Invalid endTime: \"{value}\". It must use the YYYY-MM-DD HH:mm:ss format (e.g. 2024-01-01 23:59:59)",
    logRangeInvalidDatetime: "startTime and endTime must be valid datetime strings",
    logRangeTooLong: "The interval between startTime and endTime must not exceed one day",
    logsInvalidParamTips: "Common causes:\n1. startTime/endTime format error; it must be YYYY-MM-DD HH:mm:ss (e.g. 2024-01-01 00:00:00); ISO 8601 or timestamps are not supported\n2. The interval between startTime and endTime exceeds one day\n3. functionName does not exist or is malformed\nTip: without startTime/endTime, logs from the most recent day are queried by default.",
    logDetailInvalidParamTips: "Common causes:\n1. startTime/endTime format error; it must be YYYY-MM-DD HH:mm:ss (e.g. 2024-01-01 00:00:00); ISO 8601 or timestamps are not supported\n2. The interval between startTime and endTime exceeds one day\nTip: without startTime/endTime, logs from the most recent day are queried by default.",

    paramRequired: "The {param} parameter is required for the {action} action",

    "deployStatus.cloudMode": "{action} is unavailable in cloud mode: async deployment tasks are only created by real deployments with buildStrategy=cloud/local, and real execution of both strategies is unsupported in cloud mode (they need the local build context or local Docker), so no taskId can exist. buildStrategy=image uses synchronous deployment and returns the result directly from manageFunctions, so no deployment status query is needed. For async image build deployment, switch to local MCP mode.",
    deployTaskNotFound: "Deployment task {taskId} not found; the task does not exist — it may have expired, belong to a different environment than {envId}, or the MCP Server was restarted (tasks are only kept in MCP process memory).",
    unsupportedAction: "Unsupported action: {action}",
    storageMissing: "The current environment has no usable object storage bucket (DescribeEnvs returned no Storages), so COS two-phase deployment is unavailable. Check the environment storage configuration, or deploy in local mode. Environments with a shared bucket (ExternalStorage) are not supported either.",
    credentialMissing: "The current credential lacks SecretId/SecretKey (e.g. IDE proxy mode), so a COS presigned upload URL cannot be minted locally. Use local mode or a login method with permanent/temporary keys.",

    // ---- nextActions reasons ----
    "reason.continuePolling": "Keep polling the cloud function deployment status",
    "reason.getDetail": "View details of a single function",
    "reason.createFn": "Create a new cloud function",
    "reason.viewLogs": "View the execution logs of this function",
    "reason.updateConfig": "Update this function's configuration",
    "reason.checkGateway": "Check whether this function has an exposed gateway access URL",
    "reason.logDetail": "View a single log entry by requestId",
    "reason.attachLayer": "Attach an additional layer to this function",
    "reason.reorderLayers": "Adjust layer order or the binding list as a whole",
    "reason.layerVersions": "View the version list of a layer",
    "reason.publishLayer": "Publish a new layer version",
    "reason.layerVersionDetail": "View details of a layer version",
    "reason.bindLayerVersion": "Bind a layer version to a function",
    "reason.bindThisLayerVersion": "Bind this layer version to the function",
    "reason.deleteLayerVersion": "Delete this layer version",
    "reason.createTrigger": "Create a new trigger",
    "reason.deleteTrigger": "Delete the specified trigger",
    "reason.confirmTriggers": "Confirm the trigger has taken effect",
    "reason.remainingTriggers": "Confirm the remaining trigger list",
    "reason.confirmDeleted": "Confirm the function has been deleted",
    "reason.viewCallLogs": "View the logs of this invocation",
    "reason.allLayerVersions": "View all versions of this layer",
    "reason.remainingLayerVersions": "Confirm the remaining layer versions",
    "reason.currentLayers": "Confirm the layers currently bound to the function",
    "reason.detachedLayers": "Confirm the layer list after unbinding",
    "reason.latestLayerOrder": "Confirm the latest layer order and binding result",
    "reason.confirmConfig": "Confirm the function configuration",
    "reason.checkTriggers": "Check the function's triggers",
    "reason.confirmConfigChange": "Confirm the configuration change result",
    "reason.gatewayRouteForHttp": "If the HTTP function needs to be accessed via URL, call manageGateway(action=\"createRoute\") and explicitly pass upstreamResourceType=\"WEB_SCF\", then create the access entry according to the actual path and auth requirements; do not assume /<functionName> exists by default",
    "reason.confirmAccessPath": "Before delivery, confirm whether the HTTP access path already exists and has taken effect",
    "reason.checkPermission": "Evaluators, browsers, or other external callers may access anonymously; if EXCEED_AUTHORITY is returned directly, read the current function security rules first",
    "reason.adjustPermission": "Only adjust the function security rules when anonymous access is actually required, e.g. to handle EXCEED_AUTHORITY",
    "reason.checkDeployStatus": "Query the async deployment task status",
    "reason.imageFnReady": "Confirm the image function is ready (Active)",
    "reason.imageUpdateReady": "Confirm the function is ready (Active) after the image update",
    "reason.imageNextIteration": "For later iterations, just call updateFunctionCode with the new image tag to update the image",
    "reason.cosCreate": "Deploy the uploaded code zip as a function via the code parameter (two-phase deployment phase B)",
    "reason.imageGatewayRoute": "To access the image HTTP function via URL, explicitly create a Domain/Route access entry and pass type=\"HTTP\" (mapped to WEB_SCF)",
    "reason.latestConfig": "Confirm the latest function configuration",
    "reason.publishVersion": "Publish a new function version (aligns with tcb fn publish-version)",
    "reason.getFunctionAlias": "View function traffic alias config (aligns with tcb fn get-route)",
    "reason.updateFunctionAlias": "Update function traffic alias / canary routing (aligns with tcb fn config-route)",
    "reason.listVersions": "List published function versions (aligns with tcb fn list-function-versions)",
    "reason.routeTraffic": "Shift traffic to the new version or configure canary weights",
    "reason.confirmAlias": "Confirm the alias and traffic config have taken effect",

    // ---- Success messages ----
    listedFunctions: "Retrieved {count} cloud functions",
    gotFunctionDetail: "Retrieved details of function {fnName}",
    gotFunctionLogs: "Retrieved the log list of function {fnName}",
    gotLogDetail: "Retrieved the log detail for requestId={requestId}",
    gotFunctionLayers: "Retrieved the layers currently bound to function {fnName}",
    gotLayers: "Retrieved {count} layer records",
    gotLayerVersions: "Retrieved the version list of layer {layerName}",
    gotLayerVersionDetail: "Retrieved details of layer {layerName} version {layerVersion}",
    gotFunctionTriggers: "Retrieved the trigger list of function {fnName}",
    gotDownloadUrl: "Retrieved the code download URL of function {fnName}",
    gotUploadUrl: "Generated the code package upload URL (valid for {seconds} seconds). Next: PUT the code zip to uploadUrl (include the uploadHeaders when non-empty), then call manageFunctions createFunction/updateFunctionCode with the code triplet (cosBucketName/cosObjectName/cosBucketRegion) to deploy",
    gotFunctionVersions: "Retrieved the version list of function {fnName}",
    gotFunctionAlias: "Retrieved alias {aliasName} of function {fnName}",
    publishedVersion: "Published new version {version} of function {fnName}",
    updatedFunctionAlias: "Updated alias {aliasName} of function {fnName} (primary version {version})",
    createdHttpFunctionMessage: "Created HTTP function {fnName} from the image. If URL access is needed later, explicitly call manageGateway(action=\"createRoute\") with upstreamResourceType=\"WEB_SCF\", then create the access entry according to the actual path and auth requirements. Evaluators or other external callers may access anonymously, and failures may not feed EXCEED_AUTHORITY back to the AI; before delivery, proactively confirm the access path and the function security rules. If EXCEED_AUTHORITY has already appeared, first call queryPermissions(action=\"getResourcePermission\", resourceType=\"function\", resourceId=\"{fnName}\") to view the current rules, then adjust permissions with managePermissions(action=\"updateResourcePermission\") as needed.",
    createdFunction: "Created function {fnName}",
    cosCreatedMessage: "Created function {fnName} from the code package in the environment COS bucket (deployMode=cos). Use queryFunctions(action=\"getFunctionDetail\") after deployment to confirm the function is ready.",
    cosUpdatedMessage: "Updated the code of function {fnName} with the new package in the environment COS bucket (deployMode=cos). Use queryFunctions(action=\"getFunctionDetail\") after deployment to confirm the function is ready (Active).",
    imageCreatedMessage: "Created HTTP function {fnName} from image {imageUri}. Please confirm TCR, SCF, and the build pipeline are in the same region; for URL access, explicitly call manageGateway(action=\"createRoute\", upstreamResourceType=\"WEB_SCF\") and adjust the function security rules as needed. After deployment, use queryFunctions(action=\"getFunctionDetail\") to confirm the function is ready.",
    imageUpdatedMessage: "Updated the image of function {fnName} to {imageUri}. After deployment, use queryFunctions(action=\"getFunctionDetail\") to confirm the function is ready (Active).",
    updatedCode: "Updated the code of function {fnName}",
    updatedConfig: "Updated the configuration of function {fnName}",
    invokedFunction: "Invoked function {fnName}",
    invokeNotFoundTip: "{message}\n\nTip: \"invokeFunction\" can only invoke deployed cloud functions. Use the corresponding database tools for database operations.",
    deletedFunction: "Deleted function {fnName}",
    createdTriggers: "Created triggers for function {fnName}",
    deletedTrigger: "Deleted trigger {triggerName} of function {fnName}",
    createdLayerVersion: "Created a new version of layer {layerName}",
    deletedLayerVersion: "Deleted version {layerVersion} of layer {layerName}",
    attachedLayer: "Bound layer {layerName}:{layerVersion} to function {fnName}",
    detachedLayer: "Unbound layer {layerName}:{layerVersion} from function {fnName}",
    updatedLayers: "Updated the layer binding list of function {fnName}",
    overrideDeployOk: "Cloud function deployed successfully (override)",
    overrideUpdateOk: "Cloud function code updated successfully (override)",
    incrementalDeployOk: "Cloud function incremental deployment succeeded",
    incrementalNotInjected: "incrementalDeployFunction requires an implementation injected via pluginOptions.functions.incrementalDeployFunction (only available in supported IDE environments)",

    // ---- Image build & deploy ----
    imageDeployFnNameRequired: "The function name is required when {action} triggers an image build deployment (func.name or top-level functionName).",
    imageDeployConfirmRequired: "{action} requires an explicit confirm=true for a real image deployment; to only view the plan, use dryRun=true.",
    imageDeployLocalCloudMode: "buildStrategy=local of {action} depends on local source code and Docker and is unavailable in cloud mode. Switch to local MCP mode, or use the cloud/image strategy.",
    imageDeployCloudCloudMode: "The real execution of buildStrategy=cloud of {action} needs to read and package the local build context and is unavailable in cloud mode. Run it in local MCP mode, or provide an already-pushed image and use the image strategy.",
    imageDeployValidationFailed: "Image deployment parameter validation failed for {action}: {detail}",
    imageDeployCamLimited: "buildStrategy={strategy} of {action} needs to mint a temporary token for enterprise TCR via CAM, but the current login state has no CAM permission (environment-level API keys and temporary credentials from OAuth carry no CAM policy), so the build will fail midway. Please log in with account-level keys TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY, or use buildStrategy=image to deploy an already-pushed image directly; personal images (imageType=personal) use a static password without CAM and are not affected by this limit.",
    imageDeployAsyncAccepted: "Accepted the async image deployment task for cloud function {fnName}. The current request does not wait for the full build; do not report \"deployment completed\" to the user. You must poll automatically with queryFunctions(action=\"getFunctionDeployStatus\", taskId=\"{taskId}\") until status=succeeded or failed, then report the final result. Wait about 5 seconds for the first poll, then keep polling per the returned progress; only when the polling limit is reached should you report that the task is still running along with the taskId.",
    imageDeploySyncWaitHint: "Tip: this run waited synchronously for the full deployment (wait defaults to true). The build may take over ten minutes and trigger an MCP Client request timeout; the timeout only disconnects the request while the cloud deployment continues, but no taskId will be available for tracking. Next time you run a real build deployment, pass wait=false and poll with queryFunctions(action=\"getFunctionDeployStatus\").",

    // ---- Image branch errors ----
    imageUriRequired: "For image deployment (runtime=CustomImage), imageConfig.imageUri is required, in the format {domain}/{namespace}/{image}:{tag} (including the tag; do not use :latest).",
    imageUpdateUriRequired: "For image updates, imageConfig.imageUri is required, in the format {domain}/{namespace}/{image}:{tag} (including the tag; do not use :latest).",
    registryIdRequired: "For imageType=enterprise (enterprise TCR), imageConfig.registryId (tcr-xxxxxxxx) is required.",
    httpFunctionNeedsRootPath: "Creating an HTTP function with createFunction requires functionRootPath (an absolute path to the cloudfunctions or functions directory, not the project root) or zipFile.",
    functionMissing: "Function {fnName} does not exist or its details are unavailable",
    layersInvalid: "For the updateFunctionLayers action, layers must contain valid layerName and layerVersion entries",
    contentPathRequired: "For the createLayerVersion action, provide at least one of contentPath and base64Content",

    // ---- Diagnostic warnings (stderr) ----
    rootPathAdjustedWarn: "Detected that functionRootPath contains the function name \"{fnName}\"; automatically adjusted to the parent directory: {parentPath}",
    runtimeSpacesRemovedWarn: "Detected spaces in the runtime parameter: \"{runtime}\"; spaces removed automatically",
    noPackageJsonWarn: "Detected no package.json under HTTP function {fnName}'s directory; dependency installation skipped. If you need third-party dependencies, add a package.json and retry.",

    // ---- Schema parameter descriptions ----
    "schema.vpcId": "VPC ID from the real database/network console (e.g. vpc-xxxxxxxx). Required for non-native TCP DB access. Do NOT invent or use placeholders.",
    "schema.subnetId": "Subnet ID in the same VPC as the private DB endpoint (e.g. subnet-xxxxxxxx). Do NOT invent or use placeholders.",
    "schema.image.imageUri": "Full image URL (tag required), in the format {domain}/{namespace}/{image}:{tag}, for example ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001. Do not use :latest. Required when buildStrategy=image (existing image); optional for buildStrategy=cloud/local because the build process produces and returns the image URL. The target repository is determined by build.repository/build.namespace; explicit values take precedence. If omitted, manager-node fills defaults and creates or reuses the repository (namespace defaults to envId and repository defaults to the function name).",
    "schema.image.build": "Image build target. Used when buildStrategy=cloud (cloud build) or local (local Docker build); omit for buildStrategy=image (existing image). build is optional for cloud/local because missing repository coordinates can be filled automatically (namespace defaults to envId and repository defaults to the function name). Provide it only to specify build details or fields such as build.registryCredential for personal registries.",
    "schema.image.localFallback": "How to handle an unavailable local build when buildStrategy=local. Defaults to error.",
    "schema.trigger.name": "Trigger name",
    "schema.trigger.type": "Trigger type",
    "schema.trigger.config": "Trigger configuration. timer must use the CloudBase 7-field cron format: second minute hour day month weekday year. The standard 5-field cron format is not supported (for example, */5 * * * * is invalid). Valid examples: 0 */5 * * * * * (every 5 minutes), 0 0 2 1 * * * (02:00 on the first day of every month), and 0 30 9 * * * * (09:30 every day).",
    "schema.create.name": "Function name",
    "schema.create.type": "Function type",
    "schema.create.protocolType": "HTTP function access protocol. Currently only WebSockets is supported; use WS together with protocolParams.wsParams. Do not pass this field for ordinary HTTP functions. Other values such as HTTP cause InvalidParameterValue.ProtocolType.",
    "schema.create.wsIdleTimeout": "WebSocket idle timeout in seconds",
    "schema.create.timeout": "Function timeout",
    "schema.create.envVariables": "Environment variables. If they include traditional TCP database variables such as DATABASE_URL, MYSQL_*, POSTGRES_*, or REDIS_*, also configure vpc (vpcId + subnetId), using IDs from the actual database/network configuration. Never guess them. Native app.rdb()/app.database() access does not require a VPC.",
    "schema.create.vpc": "Private network configuration (egress). Required when using a non-native SDK to access MySQL, PostgreSQL, or Redis over TCP in a VPC. vpcId/subnetId must match the private database endpoint VPC. If unknown, check the console or ask the user; never use placeholders.",
    "schema.create.runtime": "Runtime environment. Event functions support multiple runtimes:\n  Nodejs: Nodejs20.19, Nodejs18.15, Nodejs16.13, Nodejs14.18, Nodejs12.16, Nodejs10.15, Nodejs8.9\n  Python: Python3.10, Python3.9, Python3.7, Python3.6, Python2.7\n  Php: Php8.0, Php7.4, Php7.2\n  Java: Java8, Java11\n  Golang: Golang1\n\nRecommended runtimes:\n  Node.js: Nodejs18.15\n  Python: Python3.9\n  PHP: Php7.4\n  Java: Java11\n  Go: Golang1\n\nFor image deployment (creating a function from a TCR image), use \"CustomImage\" and provide imageConfig; functionRootPath/zipFile is not needed.",
    "schema.create.buildStrategy": "HTTP function deployment strategy: zip=code package deployment (default); image=use an existing image (imageConfig.imageUri required); cloud=cloud image build; local=local Docker image build. cloud/local use image build deployment orchestration and require imageConfig. build itself is optional because repository coordinates (namespace defaults to envId and repository defaults to the function name) can be filled automatically. Provide build only for build details or fields such as build.registryCredential for a personal registry.",
    "schema.create.imageConfig": "Image configuration used with buildStrategy=image/cloud/local or runtime=CustomImage. All image fields are under this namespace. For image, set imageUri to use an existing image. For cloud/local, build may describe how to build; if omitted, default repository coordinates are filled automatically. Providing an existing image (imageUri) selects image deployment, so local code, scf_bootstrap, and Handler do not need to be packaged.",
    "schema.create.triggers": "Trigger configuration array",
    "schema.create.handler": "Function entry point",
    "schema.create.ignore": "Files to ignore",
    "schema.create.isWaitInstall": "Whether to wait for dependency installation",
    "schema.create.layers": "Layer configuration",
    "schema.manageLayer.name": "Layer name",
    "schema.manageLayer.version": "Layer version number",
    "schema.query.action": "Read-only action type:\n- `listFunctions`: list all CloudBase cloud functions\n- `getFunctionDetail`: get function details (requires functionName)\n- `listFunctionLogs`: query function execution logs (requires functionName)\n- `getFunctionLogDetail`: get log details (requires requestId)\n- `listFunctionLayers`: list layers bound to a function\n- `listLayers`: list all layers (account-level view, including layers from other environments)\n- `listLayerVersions`: list layer versions (Versions, not Version; account-level view)\n- `getLayerVersionDetail`: get layer version details (account-level view)\n- `listFunctionTriggers`: list function triggers (scheduled task / cron / timer configuration)\n- `getFunctionDownloadUrl`: get the function code download URL\n- `getFunctionDeployStatus`: query async deployment status, stage progress, and final result by taskId. Returns data.build, data.deploy, and data.progress. While status=running, data.result and data.error are null and deployment must not be reported as complete. Keep polling until status=succeeded/failed. status=expired means the task exceeded the 2-hour retention limit; cloud deployment may still be running, so confirm with getFunctionDetail. Tasks exist only in MCP process memory; expired tasks or a restarted MCP Server return errorCode=DEPLOY_TASK_NOT_FOUND. Tasks are isolated by environment. This action is unavailable in cloud mode because real cloud/local builds cannot run there, while image deployment is synchronous and creates no taskId.\n- `listVersionByFunction`: list published function versions (aligns with tcb fn list-function-versions / SDK listVersionByFunction; requires functionName)\n- `getFunctionAlias`: get function alias and traffic routing (aligns with tcb fn get-route / SDK getFunctionAlias; requires functionName; aliasName defaults to $DEFAULT)\n- `getFunctionUploadUrl`: get a COS presigned upload URL for a function code package (two-phase ZIP deployment phase A): PUT the code zip to uploadUrl (include the corresponding request headers when uploadHeaders is non-empty), then call manageFunctions createFunction/updateFunctionCode with the code triplet (phase B). functionName is optional and only shapes the upload object key. The uploadUrl carries credential-bound signatures; never log or persist it",
    "schema.query.functionName": "CloudBase cloud function name. Required for `getFunctionDetail`, `listFunctionLogs`, `listFunctionLayers`, `listFunctionTriggers`, `getFunctionDownloadUrl`, `listVersionByFunction`, and `getFunctionAlias`. Optional for `getFunctionUploadUrl` (only used to generate the upload object key).",
    "schema.query.limit": "Page size (limit). Optional for list actions; the backend determines the default.",
    "schema.query.offset": "Pagination offset. Optional for list actions; defaults to 0.",
    "schema.query.codeSecret": "Code protection secret used to decrypt function code.",
    "schema.query.revealEnvValues": "Whether `getFunctionDetail` / `listFunctionTriggers` returns plaintext environment variable values. Defaults to false: Value is masked as ***, while Key and ValueLength remain, which is sufficient to verify configured variables and changes. true returns plaintext and may expose secrets to the model context; use cautiously. Prefer the console or CLI for plaintext values.",
    "schema.query.startTime": "Log query start time in YYYY-MM-DD HH:mm:ss format (for example, 2024-01-01 00:00:00). The interval to endTime must not exceed one day. Defaults to the most recent day when omitted.",
    "schema.query.endTime": "Log query end time in YYYY-MM-DD HH:mm:ss format (for example, 2024-01-01 23:59:59). The interval from startTime must not exceed one day. Defaults to the current time when omitted.",
    "schema.query.requestId": "Log request ID. Required for `getFunctionLogDetail`; obtain it from `listFunctionLogs`.",
    "schema.query.qualifier": "Function version alias, such as $LATEST or $DEFAULT. Optional for log queries.",
    "schema.query.runtime": "Runtime filter for layer queries, such as Nodejs18.15.",
    "schema.query.searchKey": "Layer name search keyword.",
    "schema.query.layerName": "Layer name. Required for `listLayerVersions` and `getLayerVersionDetail`. Layers use an account-level shared namespace; use the fixed format `{layerName}_{current envId}` (for example, common_cloud1-d9ghadgak3edf6b36).",
    "schema.query.layerVersion": "Layer version number. Required for `getLayerVersionDetail`.",
    "schema.query.taskId": "Async deployment task ID for `getFunctionDeployStatus` (returned by manageFunctions with wait=false). Tasks exist only in current MCP process memory: terminal tasks are retained for about 30 minutes and running tasks for at most 2 hours.",
    "schema.query.order": "Sort direction for `listVersionByFunction`, such as ASC / DESC.",
    "schema.query.orderBy": "Sort field for `listVersionByFunction`, such as AddTime / ModTime.",
    "schema.query.aliasName": "Alias name for `getFunctionAlias`. Defaults to `$DEFAULT` when omitted (same as tcb fn get-route).",
    "schema.manage.action": "Write action type, such as createFunction, updateFunctionCode, incrementalDeployFunction, invokeFunction, deleteFunction, createFunctionTrigger (scheduled task / cron / timer), deleteFunctionTrigger, createLayerVersion, deleteLayerVersion, attachLayer, detachLayer, updateFunctionLayers, publishVersion (publish a new version; aligns with tcb fn publish-version), or updateFunctionAliasConfig (update alias / traffic routing; aligns with tcb fn config-route). Use the fixed layer naming format `{layerName}_{current envId}` (for example, common_cloud1-d9ghadgak3edf6b36).",
    "schema.manage.func": "Function configuration for createFunction / updateFunctionCode. Image/build deployment is selected by func.buildStrategy (zip/cloud/local/image), with image fields under func.imageConfig.",
    "schema.manage.functionRootPath": "Recommended local-directory input for creating or updating function code. It must be the absolute directory that directly contains function folders (for example, /abs/path/cloudfunctions or /abs/path/functions), not the project root or the function subdirectory. Local layout should be cloudfunctions/<functionName>/index.js or functions/<functionName>/index.js. Pass the absolute cloudfunctions/functions directory; the SDK appends the function subdirectory. Do not precompress ZIP or base64 content.",
    "schema.manage.force": "Whether createFunction overwrites an existing function.",
    "schema.manage.functionName": "Target function name at the top level. Used by updateFunctionCode, updateFunctionConfig, invokeFunction, publishVersion, updateFunctionAliasConfig, and similar actions. createFunction uses func.name; other actions use top-level functionName. A mistakenly supplied func.name is also recognized as functionName.",
    "schema.manage.zipFile": "Compatibility only: base64-encoded prebuilt code package. For ordinary createFunction/updateFunctionCode, do not create a ZIP first; prefer functionRootPath.",
    "schema.manage.code": "Two-phase ZIP deployment phase B: the code package has been uploaded to the environment COS bucket via queryFunctions action=getFunctionUploadUrl. Pass the triplet (cosBucketName/cosObjectName/cosBucketRegion) through unchanged from the getFunctionUploadUrl response. With code provided, createFunction/updateFunctionCode no longer reads local directories (functionRootPath/zipFile are unnecessary), and cloud dependency installation is skipped by default (override with func.installDependency).",
    "schema.code.cosBucketName": "Environment bucket short name (without the -appid suffix); pass through the cosBucketName returned by getFunctionUploadUrl, do not invent one",
    "schema.code.cosObjectName": "Uploaded object key; pass through the cosObjectName returned by getFunctionUploadUrl",
    "schema.code.cosBucketRegion": "Bucket region; defaults to the current environment bucket region when omitted",
    "schema.manage.handler": "Function entry point",
    "schema.manage.timeout": "Timeout used for configuration updates.",
    "schema.manage.envVariables": "Environment variables to merge during a configuration update. If they contain TCP database variables such as DATABASE_URL, MYSQL_*, POSTGRES_*, or REDIS_*, also provide a real vpc (or ensure the function already has a complete VPC binding). Never guess vpcId/subnetId.",
    "schema.manage.vpc": "VPC information for configuration updates. Real vpcId + subnetId are required for non-native TCP database access; do not use placeholders.",
    "schema.manage.params": "Parameters passed to invokeFunction.",
    "schema.manage.triggers": "Trigger list for createFunctionTrigger, used for scheduled jobs. timer triggers use a 7-field cron expression (second minute hour day month weekday year), such as \"0 */5 * * * * *\" for every 5 minutes.",
    "schema.manage.triggerName": "Target trigger name for deleteFunctionTrigger.",
    "schema.manage.layerName": "Layer name. When creating a layer, use `{layerName}_{current envId}` (for example, common_cloud1-d9ghadgak3edf6b36). Do not reuse a bare layer name across environments; layers use an account-level shared namespace.",
    "schema.manage.layerVersion": "Layer version number",
    "schema.manage.contentPath": "Layer content path, either a directory or ZIP file.",
    "schema.manage.base64Content": "Base64-encoded layer content.",
    "schema.manage.runtimes": "Runtimes supported by the layer.",
    "schema.manage.description": "Description. Layer version description for createLayerVersion; version or alias description for publishVersion / updateFunctionAliasConfig.",
    "schema.manage.licenseInfo": "Layer license information.",
    "schema.manage.layers": "Target layer list for updateFunctionLayers; array order becomes final order.",
    "schema.manage.codeSecret": "Code protection secret used when binding a layer.",
    "schema.manage.dryRun": "Whether image build deployment (func.buildStrategy=cloud/local) only generates a deployment plan. Defaults to true; false also requires confirm=true.",
    "schema.manage.wait": "Whether a real image deployment waits for completion. false returns a taskId immediately and continues in the background. true remains the default for compatibility, but synchronous waiting can take about 15 minutes and exceed the MCP Client timeout. A client timeout only disconnects the request while cloud deployment continues, leaving no taskId to track. For a real build deployment (buildStrategy=cloud/local, dryRun=false), explicitly use wait=false.",
    "schema.manage.autoGrant": "Whether manager-node may automatically add the fixed allowlist of CAM policies for image deployment. Defaults to false; set true only after explicitly confirming permission changes.",
    "schema.manage.confirm": "Dangerous-operation confirmation. deleteFunction, deleteFunctionTrigger, deleteLayerVersion, detachLayer, other delete actions, and real image build deployment (func.buildStrategy=cloud/local) require confirm=true.",
    "schema.manage.incrementalFile": "Changed-file path for incrementalDeployFunction incremental deployment.",
    "schema.manage.aliasName": "Alias name for `updateFunctionAliasConfig`. Defaults to `$DEFAULT` when omitted (same as tcb fn config-route).",
    "schema.manage.functionVersion": "Primary version for `updateFunctionAliasConfig`. May be a concrete version number or `$LATEST`.",
    "schema.manage.routingConfig": "Traffic routing config for `updateFunctionAliasConfig`. AdditionalVersionWeights is used for canary weights; AddtionVersionMatchs keeps the SCF/SDK historical field name (including the typo).",
    "schema.routing.version": "Additional traffic version number",
    "schema.routing.weight": "Additional traffic weight (0-1 or percentage per SCF convention)",
    "schema.routing.matchVersion": "Version targeted by a match rule",
    "schema.routing.matchKey": "Header/Query key for a match rule",
    "schema.routing.matchMethod": "Match method, such as Exact / Regex",
    "schema.routing.matchExpression": "Match expression",
    "schema.routing.additionalWeights": "Additional version weight list (canary release)",
    "schema.routing.additionalMatches": "Additional version match rules (field name keeps SCF AddtionVersionMatchs)",
  },
);
