import { defineModule } from "../types.js";

export const functions = defineModule(
  {
    // ---- 工具 meta ----
    queryTitle: "查询 CloudBase 云函数",
    queryDescription:
      "CloudBase 云函数统一只读入口。通过更自解释的 action 查询 CloudBase 云函数列表、函数详情、执行日志、层、触发器和代码下载地址。" +
      "\n\n**分页说明**：`listFunctions`、`listLayers` 支持 `limit` 和 `offset` 参数。" +
      "\n- `limit`: 分页数量，默认值由后端决定" +
      "\n- `offset`: 分页偏移，从 0 开始" +
      "\n- 示例：`queryFunctions(action=\"listFunctions\", offset=10, limit=10)`" +
      "\n\n**查询 CloudBase 云函数日志**：使用 `action=\"listFunctionLogs\"`，需要提供 `functionName` 参数。" +
      "\n- 示例：`queryFunctions(action=\"listFunctionLogs\", functionName=\"my-function\")`" +
      "\n- 如需查看日志详情：`queryFunctions(action=\"getFunctionLogDetail\", requestId=\"xxx\")`" +
      "\n\n**定时任务 / cron / 定时跑**：使用 `listFunctionTriggers` 查询函数的 timer 触发器配置。" +
      "\n\n**层（Layer）说明**：" +
      "\n- 层为 SCF 账号级共享命名空间：不同环境创建同名层会共享同一层的版本序列；删除某版本会影响所有绑定该版本的环境的函数" +
      "\n- 创建层必须用带环境标识的唯一层名，固定格式：`{layerName}_{当前envId}`（如 `common_cloud1-d9ghadgak3edf6b36`）。不要在不同环境使用相同裸层名，创建前先 `listLayers` 查重" +
      "\n- `listLayers` / `listLayerVersions` / `getLayerVersionDetail` 返回账号级视图，可能含其他环境创建的层" +
      "\n\n**区分 `queryLogs` 工具**：" +
      "\n- 本工具用于查询特定 CloudBase 云函数的执行日志" +
      "\n- `queryLogs` 工具用于搜索 CLS 日志服务（跨服务日志聚合）",
    manageTitle: "管理 CloudBase 云函数",
    manageDescription:
      "CloudBase 云函数统一写入口。支持创建函数、更新代码、更新配置、调用函数、管理定时跑 / 定时任务 / scheduled job 的 timer 触发器和层绑定。" +
      "如果要创建 cron 定时任务，先用 createFunction 创建函数，再用 createFunctionTrigger 创建 timer 触发器（支持7段cron表达式），deleteFunctionTrigger 删除触发器。" +
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
    "cloudMode.localOnly": "{action} 在 cloud mode 下不可用，因为该操作依赖本地函数代码目录。请改用本地模式执行，或使用镜像部署（runtime=CustomImage + imageConfig）。",
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
    "reason.imageGatewayRoute": "如需通过 URL 访问镜像 HTTP 函数，显式创建 Domain/Route 访问入口并传 type=\"HTTP\"（映射 WEB_SCF）",
    "reason.latestConfig": "确认最新函数配置",

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
    createdHttpFunctionMessage: "已创建 HTTP 函数 {fnName}。如果后续需要通过 URL 访问，请显式调用 manageGateway(action=\"createRoute\")，并把 upstreamResourceType=\"WEB_SCF\" 一起传入，再按实际路径和鉴权需求创建访问入口。评测或其他外部调用方可能会以匿名身份访问，而且失败后不一定会把 EXCEED_AUTHORITY 再反馈给 AI；交付前请主动确认访问路径和函数安全规则，若已出现 EXCEED_AUTHORITY，请先调用 queryPermissions(action=\"getResourcePermission\", resourceType=\"function\", resourceId=\"{fnName}\") 查看当前规则，再按需要使用 managePermissions(action=\"updateResourcePermission\") 调整权限。",
    createdFunction: "已创建函数 {fnName}",
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
  },
  {
    // ---- Tool meta ----
    queryTitle: "Query CloudBase Cloud Functions",
    queryDescription:
      "Unified read-only entry for CloudBase cloud functions. Query function lists, function details, execution logs, layers, triggers, and code download URLs through self-explanatory actions." +
      "\n\n**Pagination**: `listFunctions` and `listLayers` support `limit` and `offset` parameters." +
      "\n- `limit`: page size, the default is decided by the backend" +
      "\n- `offset`: pagination offset, starting from 0" +
      "\n- Example: `queryFunctions(action=\"listFunctions\", offset=10, limit=10)`" +
      "\n\n**Querying cloud function logs**: use `action=\"listFunctionLogs\"`, which requires the `functionName` parameter." +
      "\n- Example: `queryFunctions(action=\"listFunctionLogs\", functionName=\"my-function\")`" +
      "\n- To view log details: `queryFunctions(action=\"getFunctionLogDetail\", requestId=\"xxx\")`" +
      "\n\n**Scheduled tasks / cron / timers**: use `listFunctionTriggers` to query a function's timer trigger configuration." +
      "\n\n**Layers**:" +
      "\n- Layers are account-level shared namespaces in SCF: same-named layers created in different environments share one version sequence; deleting a version affects functions in every environment bound to it" +
      "\n- When creating a layer, use a unique name with the environment suffix, in the fixed format `{layerName}_{current envId}` (e.g. `common_cloud1-d9ghadgak3edf6b36`). Do not reuse the same bare layer name across environments; check with `listLayers` before creating" +
      "\n- `listLayers` / `listLayerVersions` / `getLayerVersionDetail` return the account-level view, which may include layers created by other environments" +
      "\n\n**Distinguish from the `queryLogs` tool**:" +
      "\n- This tool queries execution logs of a specific CloudBase cloud function" +
      "\n- The `queryLogs` tool searches the CLS log service (cross-service log aggregation)",
    manageTitle: "Manage CloudBase Cloud Functions",
    manageDescription:
      "Unified write entry for CloudBase cloud functions. Supports creating functions, updating code, updating configuration, invoking functions, and managing timer triggers (scheduled jobs / cron) and layer bindings." +
      "To create a cron scheduled task, first create the function with createFunction, then create the timer trigger with createFunctionTrigger (7-field cron expression supported), and delete triggers with deleteFunctionTrigger." +
      "HTTP function image build & deploy: createFunction / updateFunctionCode distinguish via func.buildStrategy." +
      "func.buildStrategy=image (existing image, set func.imageConfig.imageUri) creates/updates the HTTP function directly;" +
      "func.buildStrategy=local (local Docker build & push) and cloud (CloudApp cloud build) go through the image build/deploy orchestration (func.imageConfig required; build optional — missing registry coordinates are auto-filled: namespace defaults to envId, repository defaults to the function name)," +
      "and only a dry-run plan is generated by default; pass dryRun=false with confirm=true to execute the real deployment. A real deployment may pass wait=false to return a taskId immediately; query progress and results via getFunctionDeployStatus of queryFunctions. wait=false only means this tool call does not wait for the full deployment; the caller must not finish while status=running and must keep polling until succeeded/failed before reporting to the user, unless the polling limit is reached." +
      "local always requires local MCP mode; the real execution of cloud also requires local MCP mode because it reads the local build context; cloud mode only supports cloud dry-run and the image strategy." +
      "When func.buildStrategy is omitted or zip, traditional code package deployment applies. Dangerous operations require explicit confirm=true." +
      "\n\n**Personal-edition TCR credentials**: local/cloud builds with imageType=personal need push credentials." +
      "If TCB_TCR_USERNAME and TCB_TCR_PASSWORD are already set in the env of the MCP configuration (configured the same way as TENCENTCLOUD_SECRETID and other keys)," +
      "there is no need to pass func.imageConfig.build.registryCredential in request parameters — leave it empty and it will be read automatically." +
      "Do not ask users for plaintext passwords, and do not put passwords into tool parameters." +
      "\nNote this env channel only works with **local stdio MCP and clients whose mcp.json supports a custom env block**:" +
      "some GUI clients do not inherit shell exports, and IDE built-in MCPs usually inject credentials through a hardcoded whitelist (e.g. only TENCENTCLOUD_*)," +
      "so those users have no channel to configure a custom env — telling them to \"set it in the MCP config env\" is ineffective guidance." +
      "For built-in MCP users, guide them instead to use the enterprise edition (imageType=enterprise, instance temporary tokens, no fixed password) or to use buildStrategy=image to deploy an already-pushed image." +
      "\n**Enterprise-edition login requirements**: cloud/local builds for enterprise require minting a TCR temporary token via CAM." +
      "Environment-level API keys and temporary credentials from OAuth carry no CAM policy and will be blocked up front with a hint to switch to account-level keys or the image strategy;" +
      "personal edition logs in directly with a static password via docker login without CAM, and is in fact the only build path that works for API-key users." +
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
    "cloudMode.localOnly": "{action} is unavailable in cloud mode because the operation depends on a local function code directory. Run it in local mode, or use image deployment (runtime=CustomImage + imageConfig).",
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
    "reason.imageGatewayRoute": "To access the image HTTP function via URL, explicitly create a Domain/Route access entry and pass type=\"HTTP\" (mapped to WEB_SCF)",
    "reason.latestConfig": "Confirm the latest function configuration",

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
    createdHttpFunctionMessage: "Created HTTP function {fnName} from the image. If URL access is needed later, explicitly call manageGateway(action=\"createRoute\") with upstreamResourceType=\"WEB_SCF\", then create the access entry according to the actual path and auth requirements. Evaluators or other external callers may access anonymously, and failures may not feed EXCEED_AUTHORITY back to the AI; before delivery, proactively confirm the access path and the function security rules. If EXCEED_AUTHORITY has already appeared, first call queryPermissions(action=\"getResourcePermission\", resourceType=\"function\", resourceId=\"{fnName}\") to view the current rules, then adjust permissions with managePermissions(action=\"updateResourcePermission\") as needed.",
    createdFunction: "Created function {fnName}",
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
  },
);
