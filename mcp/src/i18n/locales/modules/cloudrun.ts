import { defineModule } from "../types.js";

export const cloudrun = defineModule(
  {
    "query.title": "查询 CloudRun 服务信息",
    "query.description":
      "查询云托管服务信息，支持获取服务列表、查询服务详情、获取可用模板列表、获取构建日志（getDeployLog，仅云端源码构建/依赖 CODING）、获取运行日志（getProcessLog，镜像与源码部署均可/不依赖 CODING）、获取部署记录以及查询环境云托管开通状态（envStatus）。返回的服务信息包括服务名称、状态、访问类型、配置详情以及最近部署上下文。",
    "manage.title": "管理 CloudRun 服务",
    "manage.description":
      "管理云托管服务，按开发顺序支持：开通云托管环境（initEnv）、初始化项目（可从模板开始，模板列表可通过 queryCloudRun 查询）、下载服务代码、本地运行（仅函数型服务）、部署代码、仅更新配置（updateConfig，无需重新上传代码）、删除服务。deploy 支持两种方式：1) 源码构建（传入 targetPath，本地代码打包上传，默认路径）；2) 已有镜像部署（传入 imageUrl，如 ccr.ccs.tencentyun.com/ns/img:v1，走 DeployType=image 容器型部署，targetPath 可省略）。deploy 语义为「触发部署 + 轻量等待任务注册」（最多约 45s；不需要 buildId 时可传 waitRegistration=false 跳过等待）。源码构建返回 buildId，用 getDeployLog 轮询构建进度后再 getProcessLog；镜像部署（imageUrl）BuildId 常为 0，跳过 getDeployLog，返回 runId/next_step 引导 getProcessLog（或先 getDeployRecords 取 RunId）。若用户明确指定镜像或无需重新构建，必须传 imageUrl，不要仅因本地有源码目录就回退到源码构建。deploy 对已存在服务会先读取远程配置再合并（保留 VpcConf/EnvParams/OpenAccessTypes）。updateConfig 对齐控制台服务设置页。删除操作需要确认，建议设置force=true。新环境首次部署前若提示未开通云托管，先调用 initEnv 开通（异步、幂等）。",

    "error.managerInitFailed":
      "CloudBase Manager 初始化失败，请检查凭据与环境配置。",
    "error.unsupportedAction": "不支持的操作：{action}",
    "error.pathOutsideCwd": "路径必须在当前工作目录内：{cwd}",
    "error.commonServiceQueryEnv":
      "当前 CloudBase Manager 不支持 commonService，无法查询云托管环境开通状态。",
    "error.commonServiceInitEnv":
      "当前 CloudBase Manager 不支持 commonService，无法初始化云托管环境。",
    "error.commonServiceSubmitDiff":
      "当前 CloudBase Manager 不支持 commonService，无法调用 SubmitServerConfigChangeDiff。",
    "error.getProcessLogUnsupported":
      "当前 CloudBase Manager SDK 不支持 getProcessLog；请升级 @cloudbase/manager-node。",
    "error.envNotInitialized":
      "当前环境（{envId}）尚未初始化云托管（CloudRun Env）。不能直接创建服务（CreateCloudRunServer 在无大租户记录时会默认创建到小租户，产生错误的小租户服务与版本）。\n请先开通云托管环境，再重试部署：\n- MCP：manageCloudRun(action=\"initEnv\", envId=\"{envId}\")（异步开通，幂等；开通完成后可用 queryCloudRun(action=\"envStatus\", envId=\"{envId}\") 查询 Status=normal）\n- 或控制台：环境 → 云托管 → 开通（https://tcb.cloud.tencent.com/dev?envId={envId}#/platform-run）\n初始化完成后重新调用 manageCloudRun(action=\"deploy\")。",
    "error.actionFailed": "[{context}] {baseMessage}",
    "error.buildManage":
      "[manageCloudRun/{action}] {baseMessage}\n建议：{suggestions}",
    "error.deployTaskRunning":
      "服务 `{serverName}` 当前已有部署任务在执行，请等待现有任务完成后再重试。",
    "error.deployTaskRunningForce":
      "注意：`force=true` 仅跳过本工具的确认提示，不会取消或覆盖平台上的发布任务。请先用 queryCloudRun(action=\"getManageTask\", serverName=\"{serverName}\") 确认任务真实状态：若任务已结束却仍报此错，或任务长时间停在非终态，请携带该输出联系 CloudBase 平台排查该环境的发布任务。",
    "error.vpcRequired":
      "CreateCloudRunServer 需要有效 VPC：请传 serverConfig.VpcConf（VpcId+SubnetId），或在 initEnv 时传入 vpcId/subnetIds（环境开通后 deploy 会自动从 EnvBaseInfo 回填）。若平台拒绝系统创建网络，必须指定上海地域 VPC。",
    "error.genericRetry": "请检查服务状态、部署参数和目标目录后重试。",
    "error.targetPathRequired": "{action} 操作需要提供 targetPath",
    "error.agentConfigRequired": "createAgent 操作需要提供 agentConfig",
    "error.deployTargetRequired":
      "deploy 操作需要提供 targetPath（源码构建）或 imageUrl（已有镜像）",
    "error.serverConfigRequired":
      "updateConfig 需要提供至少包含一个字段的 serverConfig",
    "error.trafficOpRequired":
      "traffic 操作必须提供 trafficOp（set | promote | rollback）",
    "error.percentsRequired":
      "trafficOp=set 时必须提供 stablePercent 和 canaryPercent",
    "error.percentSum":
      "stablePercent + canaryPercent 之和必须等于 100（当前 {stable} + {canary} = {sum}）。例如 90/10 表示 90% 流量到稳定版、10% 到灰度版。",
    "error.localRunContainerUnsupported":
      "本地运行仅支持函数型云托管服务，不支持容器型服务。",
    "error.startFailed": "本地进程启动失败：PID 未定义。",
    "error.deleteConfirm": "删除操作需要确认",
    "error.deleteConfirmMessage":
      "请设置 force: true 以确认删除服务。该操作不可撤销。",
    "error.serverNameRequired":
      "{action} 操作需要提供 detailServerName 或 serverName",
    "error.provideServerName": "请提供 detailServerName 或 serverName。",
    "error.serviceNotFound": "服务 '{serverName}' 不存在",
    "error.serviceNotFoundRetry": "请检查服务名后重试。",
    "error.noDeployRecords": "服务 '{serverName}' 没有部署记录。",
    "error.deployFirst": "请先部署服务，再查询构建日志。",
    "error.runIdRequired":
      "需要提供 runId，或传 detailServerName/serverName 以解析最近一次部署的 RunId",
    "error.runIdRequiredHint":
      "runId 可从 detail/getDeployRecords 的 latestDeploy.RunId 获取，或提供服务名以使用最近一次部署的 RunId。",
    "error.noRunIdOnLatest": "服务 '{serverName}' 最近一次部署记录上没有 RunId。",
    "error.runIdRequiredAction": "getProcessLog 操作需要提供 runId",
    "error.runIdReadGuide":
      "请先部署服务，然后从 queryCloudRun(action=\"detail\") 或 getDeployRecords（latestDeploy.RunId）读取 RunId。",

    "list.message": "找到 {count} 个云托管服务",
    "templates.message": "找到 {count} 个可用模板",

    "detail.noRecords": "已获取服务 '{serverName}' 的详情。暂无部署记录。",
    "detail.deployFailed":
      "服务 '{serverName}' 最近一次部署失败。请用 queryCloudRun(action=\"getProcessLog\") 查看运行/部署步骤日志（RunId 来自 latestDeploy）；getDeployLog 仅用于云端源码构建日志（依赖 CODING）。",
    "detail.deployRunning":
      "服务 '{serverName}' 最近一次部署仍在进行中。请稍后重试，或查询部署日志获取进度。",
    "detail.ok":
      "已获取服务 '{serverName}' 的详情。服务状态：{status}，最近部署状态：{deployStatus}。",
    "detail.recordsWarning": "获取部署记录失败：{baseMessage}",
    "detail.recordsUnavailable":
      "已获取服务 '{serverName}' 的详情，但部署记录当前不可用。",

    "buildLog.message":
      "已获取服务 '{serverName}' 的构建日志（getDeployLog=构建日志；运行日志请用 getProcessLog 并传 RunId）",
    "processLog.message":
      "已获取 RunId='{runId}' 的运行日志（getProcessLog=运行日志；getDeployLog=构建日志，且仅云端构建/依赖 CODING）",
    "deployRecords.message":
      "已获取服务 '{serverName}' 的 {count} 条部署记录",
    "manageTask.message":
      "服务 '{serverName}' 的发布任务：TaskId={taskId}，TaskStatus={taskStatus}，最新版本状态={deployStatus}。若 TaskStatus 长时间不变、或版本长时间停在 creating，请用 queryCloudRun(action=\"getProcessLog\") 查看部署阶段日志。",

    "envStatus.unopened":
      "环境 {envId} 尚未开通云托管。请先调用 manageCloudRun(action=\"initEnv\", envId=\"{envId}\") 开通（异步、幂等），或前往控制台 环境 → 云托管 → 开通；Status=normal 后即可 deploy。",
    "envStatus.creating":
      "环境 {envId} 云托管正在开通中（Status=creating）。请稍后重试 manageCloudRun(action=\"deploy\")，或用本 action 再次查询直到 Status=normal。",
    "envStatus.normal":
      "环境 {envId} 云托管已开通（Status=normal），可直接 manageCloudRun(action=\"deploy\")。",
    "envStatus.unknown":
      "环境 {envId} 云托管状态未知（Status={status}），请稍后重试。",

    "initEnv.alreadyNormal":
      "环境 {envId} 已开通云托管（Status=normal），无需重复开通。可直接 manageCloudRun(action=\"deploy\")。",
    "initEnv.creating":
      "环境 {envId} 云托管正在开通中（Status=creating），无需重复开通。请稍后用 queryCloudRun(action=\"envStatus\", envId=\"{envId}\") 查询，Status=normal 后即可 deploy。",
    "initEnv.started":
      "已发起云托管开通（异步，Status=creating）。请稍后用 queryCloudRun(action=\"envStatus\", envId=\"{envId}\") 查询状态，Status=normal 后即可 manageCloudRun(action=\"deploy\")。",

    "traffic.set.message":
      "已调整服务 '{serverName}' 的流量：稳定版 {stable}% / 灰度版 {canary}%",
    "traffic.promote.message":
      "已将服务 '{serverName}' 的灰度版本全量发布（100% 流量）。该操作不可逆。",
    "traffic.rollback.message":
      "已将服务 '{serverName}' 回滚到上一个稳定版本。",

    "createAgent.message":
      "已成功创建 Agent '{agentName}'（BotId：'{botId}'），位于 {projectDir}",

    "deploy.message":
      "已触发 {serverType} 服务 '{serverName}' 的部署（{source}）。部署任务注册中/{phase}（status=deploying）；本次调用不会等待完整部署完成。",
    "deploy.fromImage": "镜像 {imageUrl}",
    "deploy.fromPath": "来自 {targetPath}",
    "deploy.phaseBuilding": "构建中",
    "deploy.phaseStarting": "启动中",
    "deploy.warningSuffix":
      " 警告：{message} 请在依赖数据库连通性之前配置 serverConfig.VpcConf。",

    "updateConfig.noop": "服务 '{serverName}' 无有效配置变更。",
    "updateConfig.taskRunningHint":
      "可能有部署或配置任务仍在执行。请稍候重试；或使用 queryCloudRun(action=\"getDeployLog\")。",
    "updateConfig.message":
      "已提交 '{serverName}' 的配置变更。{redeployHint}请用 queryCloudRun(action=\"detail\") 核验。控制台：{consoleUrl}",
    "updateConfig.redeployFields":
      " 常触发「重新部署并换镜像」的字段：{fields}。",
    "updateConfig.hotUpdate":
      " 变更可能以热更新方式生效（如 MinNum/MaxNum/AccessTypes）。",

    "run.alreadyRunning": "服务 '{serverName}' 已在本地运行（pid={pid}）",
    "run.message":
      "已在端口 {port} 本地启动 {runMode} 服务 '{serverName}'（pid={pid}）",

    "download.message": "已成功下载服务 '{serverName}' 到 {targetPath}",
    "delete.message": "已成功删除服务 '{serverName}'",
    "init.message":
      "已成功使用模板 '{template}' 初始化服务 '{serverName}'，路径：{targetPath}",

    "risk.noJson.message":
      "EnvParams 看起来包含数据库/缓存连接 URL，但缺少 serverConfig.VpcConf。未配置 VpcConf 时，云托管实例通常无法访问 VPC 内网的 MySQL/PostgreSQL/Redis。",
    "risk.noJson.remediation.1":
      "将 serverConfig.VpcConf 设置为与数据库相同地域/VPC（以及有空闲 IP 的子网）。",
    "risk.noJson.remediation.2":
      "禁止编造 VpcId/SubnetId。真实 ID 须来自数据库控制台、资源详情、callCloudApi 或用户确认。",
    "risk.noJson.remediation.3":
      "EnvParams 中使用数据库内网地址，而不是 localhost 或 docker-compose 服务名。",
    "risk.noJson.remediation.4":
      "确认数据库安全组放行云托管子网访问数据库端口。",
    "risk.noJson.remediation.5":
      "配置 VpcConf 后重新部署。仅 OpenAccessTypes 不能提供访问数据库的 VPC 出网能力。",
    "risk.detected.message":
      "EnvParams 包含数据库/缓存连接配置，但缺少 serverConfig.VpcConf。部署可能成功，但运行时数据库连接会失败。",
    "risk.detected.remediation.1":
      "将 serverConfig.VpcConf.VpcId 和 SubnetId 设置为数据库所在 VPC/子网（同地域）。",
    "risk.detected.remediation.2":
      "禁止编造 VpcId/SubnetId。真实 ID 须来自数据库控制台、资源详情、callCloudApi 或用户确认。",
    "risk.detected.remediation.3": "EnvParams 中使用数据库内网地址。",
    "risk.detected.remediation.4":
      "确认安全组/白名单允许云托管子网访问数据库端口。",
    "risk.detected.remediation.5":
      "不要混淆 OpenAccessTypes（入站访问）与 VpcConf（出站访问 VPC 内资源）。",

    "fallback.noteCoding":
      "getDeployLog 依赖 CODING / DescribeCloudRunBuildLog。请用 getProcessLog 获取部署步骤与运行日志。",
    "fallback.noteRecords":
      "请从 getDeployRecords 读取 latestDeploy.RunId，再调用 queryCloudRun(action=\"getProcessLog\")。CODING 登录错误时不要重试 getDeployLog。",
    "fallback.messageNoBuild":
      "服务 '{serverName}' 没有云端源码构建（BuildId=0）。请跳过 getDeployLog，用 queryCloudRun(action=\"getProcessLog\"{runIdSuffix}) 获取部署步骤与运行日志。",
    "fallback.messageCoding":
      "getDeployLog（DescribeCloudRunBuildLog）失败：当前账号不是 CODING 用户。请不要重试 getDeployLog，改用 queryCloudRun(action=\"getProcessLog\", detailServerName=\"{serverName}\"{runIdSuffix})——RunId 来自 getDeployRecords/latestDeploy。",

    "nextStep.imageWithRunId":
      "镜像部署没有 CODING 构建过程；请跳过 getDeployLog，直接轮询 getProcessLog 获取部署步骤与容器运行日志。",
    "nextStep.imageRegistered":
      "镜像部署：请从 getDeployRecords 读取 latestDeploy.RunId，再调用 queryCloudRun(action=\"getProcessLog\", runId=...)。跳过 getDeployLog。",
    "nextStep.imageQueueing":
      "镜像部署任务仍在排队注册；请重试 getDeployRecords 获取 RunId，再用 getProcessLog。跳过 getDeployLog。",
    "nextStep.sourceWithBuildId":
      "源码构建：请轮询 getDeployLog 获取构建进度，之后用 getProcessLog（RunId 来自 detail/getDeployRecords）查看运行/部署步骤日志。",
    "nextStep.sourceNoBuildId":
      "BuildId 尚未就绪；可省略 buildId 以使用最近一次部署记录。构建完成后用 getProcessLog 查看运行日志。",
    "nextStep.sourceTimeout":
      "任务注册尚未就绪（等待超时，或调用时指定了 waitRegistration=false）；可省略 buildId 直接调 getDeployLog 使用最近一次部署记录，或用 queryCloudRun(action=\"getManageTask\") 查询发布任务状态。构建完成后用 getProcessLog 查看运行日志。",

    "progress.imageWithRunId":
      " 镜像部署：请用 queryCloudRun(action=\"getProcessLog\", detailServerName=\"{serverName}\", runId=\"{runId}\") 获取运行/部署步骤日志（跳过 getDeployLog）。",
    "progress.imageRegistered":
      " 镜像部署任务已注册{taskIdSuffix}；RunId 尚未就绪——请用 queryCloudRun(action=\"getDeployRecords\", detailServerName=\"{serverName}\") 后再用 getProcessLog（跳过 getDeployLog），或查看 {consoleUrl}。",
    "progress.imageTimeout":
      " 镜像部署任务注册等待 {seconds}s 后超时——请重试 getDeployRecords 获取 RunId 再用 getProcessLog（跳过 getDeployLog），或查看 {consoleUrl}。",
    "progress.sourceWithBuildId":
      " 请用 queryCloudRun(action=\"getDeployLog\", detailServerName=\"{serverName}\", buildId={buildId}) 轮询构建进度，之后用 getProcessLog 查看运行日志。",
    "progress.sourceRegistered":
      " 任务已注册（taskId={taskId}）；BuildId 尚未就绪——请稍后重试 queryCloudRun(action=\"getDeployLog\", detailServerName=\"{serverName}\")，再用 getProcessLog，或查看 {consoleUrl}。",
    "progress.sourceTimeout":
      " 构建任务注册等待 {seconds}s 后超时——部署可能仍在排队。请查看 {consoleUrl}，或稍后重试 queryCloudRun(action=\"getDeployLog\", detailServerName=\"{serverName}\")。",

    // Input schema parameter descriptions
    "schema.query.action":
      "查询操作类型：list=获取云托管服务列表（支持分页和筛选），detail=查询指定服务的详细信息（包含服务配置和最新部署状态），templates=获取可用的项目模板列表（用于初始化新项目），getDeployLog=获取构建日志（仅云端源码构建有意义，走 CODING/DescribeCloudRunBuildLog；已有镜像部署无构建过程；未登录 CODING 的账号会报错），getProcessLog=获取运行日志（部署阶段步骤+容器启动/运行日志，走 tcbr/DescribeCloudRunProcessLog；镜像部署与源码构建均可用，不依赖 CODING；RunId 来自 detail/getDeployRecords 的 latestDeploy.RunId），getDeployRecords=获取指定服务的部署记录列表（按部署时间倒序，含 BuildId/RunId/FlowRatio/Status 等字段，用于查看历史发布与回滚上下文），envStatus=查询当前环境云托管是否已开通及开通状态（Status=creating开通中/normal已开通），用于initEnv之后轮询进度或deploy之前确认环境是否就绪，getManageTask=查询指定服务的发布任务状态（走 tcbr/DescribeServerManageTask），返回任务 Id/Status 与最新部署记录状态，用于判断部署是在推进还是已经卡住（例如版本长时间停在 creating）；遇到「已有部署发布任务运行中」时先用它确认任务真实状态，不要盲目重试",
    "schema.query.pageSize":
      "分页大小，控制每页返回的服务数量。取值范围：1-100，默认值：10。建议根据网络性能和显示需求调整",
    "schema.query.pageNum":
      "页码，用于分页查询。从1开始，默认值：1。配合pageSize使用可实现分页浏览",
    "schema.query.serverName":
      "服务名称筛选条件，支持模糊匹配。例如：输入\"test\"可匹配\"test-service\"、\"my-test-app\"等服务名称。留空则查询所有服务",
    "schema.query.serverType":
      "服务类型筛选条件：function=函数型云托管（仅支持Node.js，有特殊的开发要求和限制，适合简单的API服务），container=容器型服务（推荐使用，支持任意语言和框架如Java/Go/Python/PHP/.NET等，适合大多数应用场景）",
    "schema.query.envId":
      "环境 ID（action=envStatus 时使用；不传则使用当前配置的环境）。格式如 env-xxxxxx",
    "schema.query.detailServerName":
      "要查询详细信息、部署记录、构建日志或运行日志的服务名称。当action为detail、getDeployLog、getProcessLog或getDeployRecords时建议提供，必须是已存在的服务名称。可通过list操作获取可用的服务名称列表",
    "schema.query.buildId":
      "构建ID，仅在action=getDeployLog时使用（构建日志，仅云端源码构建）。不传时默认返回最近一次部署的构建日志",
    "schema.query.runId":
      "运行ID（RunId），仅在action=getProcessLog时使用。不传时默认取该服务最近一次部署记录的 RunId（与 detail/getDeployRecords 的 latestDeploy.RunId 同源）。镜像部署与源码构建均可查询运行日志",
    "schema.query.revealEnvParams":
      "是否返回服务环境变量（ServerConfig.EnvParams）明文值（仅 action=detail 时生效）。默认 false，值脱敏为 \"***\"（保留 key，足够排查配置了哪些变量、变更是否生效）；true 时返回明文，敏感变量（如带密码的 DATABASE_URL）可能暴露给模型上下文，谨慎使用",
    "schema.manage.action":
      "云托管服务管理操作类型：init=从模板初始化新的云托管项目代码（在targetPath目录下创建以serverName命名的子目录，支持多种语言和框架模板），download=从云端下载现有服务的代码到本地进行开发，run=在本地运行函数型云托管服务（用于开发和调试，仅支持函数型服务），deploy=触发部署并轻量等待任务注册（不会 hang 等完整构建）。源码构建（targetPath）返回 buildId，用 getDeployLog 轮询后再 getProcessLog；已有镜像部署（imageUrl，DeployType=image，BuildId 常为 0）跳过 getDeployLog，用 detail/getDeployRecords 取 RunId 后 getProcessLog。传 imageUrl 时 targetPath 可省略；已存在服务会 Read-Merge-Write 保留远程 VpcConf/EnvParams/OpenAccessTypes），updateConfig=仅更新服务配置不重新上传代码（对齐控制台服务设置，走 SubmitServerConfigChangeDiff；不需要 targetPath），delete=删除指定的云托管服务（不可恢复，需要确认），createAgent=创建函数型Agent（基于函数型云托管开发AI智能体），initEnv=开通当前环境的云托管（异步创建云托管环境，幂等：已开通直接返回；适合新环境首次部署前使用），traffic=流量管理与灰度发布（set=调整稳定版/灰度版流量比例，promote=将灰度版本升级为全量，rollback=回滚到上一个稳定版本；对应 tcb cloudrun traffic 命令）",
    "schema.manage.serverName":
      "云托管服务名称，用于标识和管理服务。命名规则：支持大小写字母、数字、连字符和下划线，必须以字母开头，长度3-45个字符。在init操作中会作为在targetPath下创建的子目录名，在其他操作中作为目标服务名。initEnv 操作不需要此参数",
    "schema.manage.trafficOp":
      "流量管理子操作（action=traffic 时使用）：set=调整灰度流量比例（需先部署新版本至灰度，通过 stablePercent/canaryPercent 设置稳定版与灰度版流量比例，两者之和必须等于100）；promote=将灰度版本全量发布（灰度版本流量置为100%并关闭灰度发布，等价于 tcb cloudrun traffic promote）；rollback=回滚到上一个稳定版本（停止当前灰度/发布中的版本，回到稳定版本，等价于 tcb cloudrun traffic rollback）",
    "schema.manage.stablePercent":
      "稳定版本流量比例（trafficOp=set 时使用），取值范围0-100。与 canaryPercent 之和必须等于100。例如希望 90% 流量打到稳定版、10% 打到灰度版，则 stablePercent=90, canaryPercent=10",
    "schema.manage.canaryPercent":
      "灰度版本流量比例（trafficOp=set 时使用），取值范围0-100。与 stablePercent 之和必须等于100。例如希望 90% 流量打到稳定版、10% 打到灰度版，则 stablePercent=90, canaryPercent=10",
    "schema.manage.envId":
      "环境 ID（action=initEnv 时使用；不传则使用当前配置的环境）。格式如 env-xxxxxx",
    "schema.manage.packageType":
      "云托管环境套餐类型（action=initEnv 时使用）：Trial=试用，Standard=标准，Professional=专业，Enterprise=企业。默认 Trial",
    "schema.manage.vpcId":
      "VPC 网络 ID（action=initEnv 时可选）。当平台拒绝系统创建网络时必填，格式如 vpc-xxxxxxxx。与 subnetIds 一起透传给 CreateCloudRunEnv 的 VpcId/SubNetIds。多数场景可不传（由系统创建网络）",
    "schema.manage.subnetIds":
      "子网 ID 列表（action=initEnv 时可选）。当需指定自有 VPC 时必填，如 [\"subnet-xxxxxxxx\"]。与 vpcId 一起透传给 CreateCloudRunEnv 的 SubNetIds",
    "schema.manage.targetPath":
      "本地代码路径，必须是绝对路径。在deploy操作中指定要部署的代码目录，在download操作中指定下载目标目录，在init操作中指定云托管服务的上级目录（会在该目录下创建以serverName命名的子目录）。updateConfig 不需要此参数。建议约定：项目根目录下的cloudrun/目录，例如：/Users/username/projects/my-project/cloudrun。使用 imageUrl 部署已有镜像时此参数可省略。注意：本地有源码目录不等于必须走源码构建；若用户指定镜像请优先传 imageUrl，不要仅因存在 targetPath 就回退到源码构建",
    "schema.manage.imageUrl":
      "已有镜像部署（action=deploy 时使用）：直接指定容器镜像地址，如 ccr.ccs.tencentyun.com/ns/img:v1 或公网 registry 地址。传入后走 DeployType=\"image\"（容器型）部署，无需本地源码目录（targetPath 可省略）。支持：1) 公网匿名可拉取的镜像直填地址；2) 私有/需登录的镜像（如 ghcr.io）需先在本地 docker pull → docker tag/push 到腾讯云 CCR → 填入 CCR 地址。不传则维持源码构建（本地代码打包上传）。约束：若用户明确提到使用某个镜像、或无需重新构建代码，则必须传 imageUrl 走镜像部署，不要回退到源码构建。注意：无论哪种部署方式，环境都需先开通云托管（未开通时先调用 initEnv，Status=normal 后再部署）",
    "schema.manage.envParamsReplaceAll":
      "EnvParams 合并策略（deploy / updateConfig）：false（默认）= 与远程按 key 合并（输入覆盖同名 key，远程其余 key 保留）；true= 用输入 EnvParams 整包替换远程。仅当显式传入 EnvParams 时生效",
    "schema.manage.serverConfig":
      "服务配置项，用于 deploy / updateConfig。包括资源规格、访问权限、环境变量、日志、网络等。deploy 未提供时对已存在服务仍会从远程合并保留 VpcConf/EnvParams/OpenAccessTypes；updateConfig 至少需要一个配置字段",
    "schema.manage.serverConfig.openAccessTypes":
      "公网访问类型配置，控制服务的访问权限：OA=办公网访问，PUBLIC=公网访问（默认，可通过HTTPS域名访问），MINIAPP=小程序访问，VPC=VPC访问（仅同VPC内可访问）。可配置多个类型",
    "schema.manage.serverConfig.cpu":
      "CPU规格配置，单位为核。可选值：0.25、0.5、1、2、4、8等。注意：内存规格必须是CPU规格的2倍（如CPU=0.25时内存=0.5，CPU=1时内存=2）。影响服务性能和计费",
    "schema.manage.serverConfig.mem":
      "内存规格配置，单位为GB。可选值：0.5、1、2、4、8、16等。注意：必须是CPU规格的2倍。影响服务性能和计费",
    "schema.manage.serverConfig.minNum":
      "最小实例数配置，控制服务的最小运行实例数量。设置为0时支持缩容到0（无请求时不产生费用），设置为大于0时始终保持指定数量的实例运行（确保快速响应但会增加成本）。建议设置为1以降低冷启动延迟，提升用户体验",
    "schema.manage.serverConfig.maxNum":
      "最大实例数配置，控制服务的最大运行实例数量。当请求量增加时，服务最多可以扩展到指定数量的实例，超过此数量后将拒绝新的请求。建议根据业务峰值设置",
    "schema.manage.serverConfig.policyDetails":
      "扩缩容配置数组，用于配置服务的自动扩缩容策略。可配置多个扩缩容策略",
    "schema.manage.serverConfig.policyDetails.policyType":
      "扩缩容类型：cpu=基于CPU使用率扩缩容，mem=基于内存使用率扩缩容，cpu/mem=基于CPU和内存使用率扩缩容",
    "schema.manage.serverConfig.policyDetails.policyThreshold":
      "扩缩容阈值，单位为百分比。如60表示当资源使用率达到60%时触发扩缩容",
    "schema.manage.serverConfig.customLogs":
      "自定义日志配置，用于配置服务的日志收集和存储策略",
    "schema.manage.serverConfig.port":
      "服务监听端口配置。函数型服务固定为3000（函数框架自身监听该端口，业务代码不要自行 app.listen）；容器型服务可自定义，业务代码必须监听此端口",
    "schema.manage.serverConfig.envParams":
      "环境变量配置，JSON字符串格式。用于传递配置信息给服务代码，如'{\"DATABASE_URL\":\"postgres://user:pass@10.x.x.x:5432/db\",\"NODE_ENV\":\"production\"}'。SDK v5.6.1+ 会自动对传入的环境变量进行 AES-256-CBC 加密传输。⚠️ 若 EnvParams 含 DATABASE_URL / MYSQL_* / POSTGRES_* / REDIS_* 等传统 TCP 连库变量，必须同时配置 VpcConf，否则实例通常无法访问 VPC 内数据库",
    "schema.manage.serverConfig.dockerfile":
      "Dockerfile文件名配置，仅容器型服务需要。指定用于构建容器镜像的Dockerfile文件路径，默认为项目根目录下的Dockerfile",
    "schema.manage.serverConfig.buildDir":
      "构建目录配置，指定代码构建的目录路径。当代码结构与标准不同时使用，默认为项目根目录",
    "schema.manage.serverConfig.internalAccess":
      "内网访问开关配置，控制是否启用内网访问。true=启用内网访问（可通过云开发SDK直接调用），false=关闭内网访问（仅公网访问）",
    "schema.manage.serverConfig.internalDomain":
      "内网域名配置，用于配置服务的内网访问域名。仅在启用内网访问时有效",
    "schema.manage.serverConfig.entryPoint":
      "Dockerfile EntryPoint参数配置，仅容器型服务需要。指定容器启动时的入口程序数组，如[\"node\",\"app.js\"]",
    "schema.manage.serverConfig.cmd":
      "Dockerfile Cmd参数配置，仅容器型服务需要。指定容器启动时的默认命令数组，如[\"npm\",\"start\"]",
    "schema.manage.serverConfig.initialDelaySeconds":
      "端口健康检查初始延迟（秒）。部署完成后先等待 N 秒才开始端口探测，之后约每 5s 检查一次、连续约 30 次；30 次全失败才判定部署失败（约 150s 探测窗口），不是「N 秒后立即失败」。启动耗时长的应用建议调到 60–120",
    "schema.manage.serverConfig.logType":
      "日志类型配置，指定服务的日志收集类型。影响日志的采集方式和存储格式",
    "schema.manage.serverConfig.logSetId":
      "CLS日志集ID配置，指定日志服务（CLS）的日志集ID。需要先开通CLS日志服务",
    "schema.manage.serverConfig.logTopicId":
      "CLS日志主题ID配置，指定日志服务（CLS）的日志主题ID。需要先开通CLS日志服务",
    "schema.manage.serverConfig.logParseType":
      "日志解析类型配置，指定日志的解析方式。用于将原始日志解析为结构化数据",
    "schema.manage.serverConfig.tag":
      "服务标签配置，用于标识服务类型。如设置为\"function:\"表示函数型服务。SDK会自动根据配置生成",
    "schema.manage.serverConfig.operationMode":
      "运行模式配置，指定服务的运行模式。影响服务的调度和资源分配方式",
    "schema.manage.serverConfig.sessionAffinity":
      "会话保持配置，用于控制是否启用会话保持功能。启用后会将同一客户端的请求路由到同一实例",
    "schema.manage.serverConfig.timerScale":
      "定时扩缩容配置数组，用于配置服务的定时自动扩缩容策略。可配置多个时间段的扩缩容计划，支持每日/每周/每月循环",
    "schema.manage.serverConfig.timerScale.cycleType":
      "循环类型：none=无循环，daily=每日循环，weekly=每周循环，monthly=每月循环",
    "schema.manage.serverConfig.timerScale.startDate": "循环起始日期，格式：YYYY-MM-DD",
    "schema.manage.serverConfig.timerScale.endDate": "循环结束日期，格式：YYYY-MM-DD",
    "schema.manage.serverConfig.timerScale.startTime": "起始时间，格式：HH:mm:ss",
    "schema.manage.serverConfig.timerScale.endTime": "结束时间，格式：HH:mm:ss",
    "schema.manage.serverConfig.timerScale.replicaNum":
      "定时扩缩容的目标副本数，最小值0（缩容到0）",
    "schema.manage.serverConfig.vpcConf":
      "VPC网络配置（实例出网/私有网络）。用于让云托管实例接入指定 VPC，从而内网访问 MySQL/PostgreSQL/Redis/CVM 等资源。与 OpenAccessTypes（外部如何访问本服务）是不同概念。TCP 连库场景必须配置。禁止猜测 VpcId/SubnetId，须来自数据库控制台、已有资源详情、callCloudApi 或用户确认。创建时映射为 SDK vpcInfo(CreateType=2)；已存在服务可用 updateConfig 或 deploy（RMW 会保留未传入的远程 VpcConf）。部署/更新后必须用 queryCloudRun detail 复核 ServerConfig.VpcConf",
    "schema.manage.serverConfig.vpcConf.vpcId":
      "VPC网络ID，格式如 vpc-xxxxxxxx。必须与目标数据库/Redis 处于同一地域，并优先选择同一 VPC。禁止猜测或使用占位符；须来自数据库控制台、已有资源详情、callCloudApi 或用户确认。建议首次创建即配置；已存在服务也可在 deploy 时传入，部署后必须用 queryCloudRun detail 复核是否生效",
    "schema.manage.serverConfig.vpcConf.subnetId":
      "子网ID，格式如 subnet-xxxxxxxx。云托管实例将占用该子网 IP，需确保有足够可用 IP",
    "schema.manage.serverConfig.volumesConf":
      "存储卷配置数组，用于挂载云存储（如CFS）到服务实例中。可用于持久化数据或共享文件",
    "schema.manage.serverConfig.volumesConf.volumeName": "存储卷名称",
    "schema.manage.serverConfig.volumesConf.volumeType":
      "存储卷类型，如CFS表示云文件存储",
    "schema.manage.serverConfig.volumesConf.volumePath":
      "存储卷挂载路径，服务代码中的目标路径",
    "schema.manage.serverConfig.publicNetConf":
      "公网访问配置，用于控制服务的公网访问策略。可配置是否开启公网访问及访问路径",
    "schema.manage.serverConfig.publicNetConf.publicAccess":
      "是否开启公网访问，true=开启公网访问，false=关闭公网访问",
    "schema.manage.serverConfig.publicNetConf.publicAccessPath": "公网访问路径配置",
    "schema.manage.template":
      "项目模板标识符，用于指定初始化项目时使用的模板。可通过queryCloudRun的templates操作获取可用模板列表。常用模板：helloworld=Hello World示例，nodejs=Node.js项目模板，python=Python项目模板等",
    "schema.manage.runOptions":
      "本地运行参数配置，仅函数型云托管服务支持。用于配置本地开发环境的运行参数，不影响云端部署",
    "schema.manage.runOptions.port":
      "本地运行端口配置，仅函数型服务有效。指定服务在本地运行时监听的端口号，默认3000。确保端口未被其他程序占用",
    "schema.manage.runOptions.envParams":
      "本地运行时的附加环境变量配置，用于本地开发和调试。格式为键值对，如{\"DEBUG\":\"true\",\"LOG_LEVEL\":\"debug\"}。这些变量仅在本地运行时生效",
    "schema.manage.runOptions.runMode":
      "运行模式：normal=普通函数模式，agent=Agent模式（用于AI智能体开发）",
    "schema.manage.runOptions.agentId":
      "Agent ID，在agent模式下使用，用于标识特定的Agent实例",
    "schema.manage.agentConfig": "Agent配置项，仅在createAgent操作时使用",
    "schema.manage.agentConfig.agentName": "Agent名称，用于生成BotId",
    "schema.manage.agentConfig.botTag": "Bot标签，用于生成BotId，不提供时自动生成",
    "schema.manage.agentConfig.description": "Agent描述信息",
    "schema.manage.agentConfig.template": "Agent模板类型，默认为blank（空白模板）",
    "schema.manage.waitRegistration":
      "deploy 时是否等待平台登记本次发布（默认 true，最多约 45 秒）。等待是为了拿到后续查询所需的标识（源码构建的 BuildId / 镜像部署的 RunId）；设为 false 时只做一次探测就返回，响应更快，适合不需要 buildId、之后再按需查询发布任务状态的场景",
    "schema.manage.force":
      "强制操作开关，用于跳过确认提示。默认false（需要确认），设置为true时跳过所有确认步骤。删除操作时强烈建议设置为true以避免误操作",
    "schema.manage.serverType":
      "服务类型配置：function=函数型云托管（仅支持Node.js，有特殊的开发要求和限制，适合简单的API服务），container=容器型服务（推荐使用，支持任意语言和框架如Java/Go/Python/PHP/.NET等，适合大多数应用场景）。不提供时自动检测：1)现有服务类型 2)有Dockerfile→container 3)有@cloudbase/aiagent-framework依赖→function 4)其他情况→container",
  },
  {
    "query.title": "Query CloudRun service info",
    "query.description":
      "Query CloudRun service info: list services, get service details, list available templates, get build logs (getDeployLog, cloud source builds only / depends on CODING), get runtime logs (getProcessLog, works for both image and source deploys / no CODING needed), get deploy records, and check the env's CloudRun provisioning status (envStatus). Returned info includes service name, status, access type, config details, and latest deploy context.",
    "manage.title": "Manage CloudRun services",
    "manage.description":
      "Manage CloudRun services, in development order: provision the CloudRun env (initEnv), initialize a project (optionally from a template; list templates via queryCloudRun), download service code, run locally (function services only), deploy code, update config only (updateConfig, no code upload needed), and delete the service. deploy supports two modes: 1) source build (pass targetPath; local code is packaged and uploaded, the default); 2) existing image deploy (pass imageUrl, e.g. ccr.ccs.tencentyun.com/ns/img:v1; DeployType=image container deploy, targetPath optional). deploy means \"trigger deploy + lightweight wait for task registration\" (up to ~45s; pass waitRegistration=false to skip the wait when you don't need the buildId). Source builds return buildId — poll getDeployLog for build progress, then getProcessLog; image deploys (imageUrl) usually have BuildId=0 — getDeployLog is skipped, and runId/next_step guide you to getProcessLog (or getDeployRecords first for RunId). If the user explicitly specifies an image or no rebuild is needed, you must pass imageUrl instead of falling back to a source build just because a local source directory exists. For existing services, deploy reads the remote config first and merges (preserving VpcConf/EnvParams/OpenAccessTypes). updateConfig aligns with the console service settings page. Deletion requires confirmation; set force=true. If a new env reports CloudRun not provisioned before the first deploy, call initEnv first (async, idempotent).",

    "error.managerInitFailed":
      "Failed to initialize CloudBase manager. Please check your credentials and environment configuration.",
    "error.unsupportedAction": "Unsupported action: {action}",
    "error.pathOutsideCwd": "Path must be within current working directory: {cwd}",
    "error.commonServiceQueryEnv":
      "Current CloudBase Manager does not support commonService; cannot query CloudRun env status.",
    "error.commonServiceInitEnv":
      "Current CloudBase Manager does not support commonService; cannot initialize CloudRun env.",
    "error.commonServiceSubmitDiff":
      "Current CloudBase Manager does not support commonService; cannot call SubmitServerConfigChangeDiff.",
    "error.getProcessLogUnsupported":
      "Current CloudBase Manager SDK does not support getProcessLog; please upgrade @cloudbase/manager-node.",
    "error.envNotInitialized":
      "The current environment ({envId}) has not initialized CloudRun (CloudRun Env). You cannot create services directly (without a large-tenant record, CreateCloudRunServer defaults to the small tenant, producing wrong small-tenant services and versions).\nProvision the CloudRun env first, then retry the deploy:\n- MCP: manageCloudRun(action=\"initEnv\", envId=\"{envId}\") (async, idempotent; once done, query Status=normal via queryCloudRun(action=\"envStatus\", envId=\"{envId}\"))\n- Or console: Environment → CloudRun → Provision (https://tcb.cloud.tencent.com/dev?envId={envId}#/platform-run)\nAfter initialization, call manageCloudRun(action=\"deploy\") again.",
    "error.actionFailed": "[{context}] {baseMessage}",
    "error.buildManage":
      "[manageCloudRun/{action}] {baseMessage}\nSuggestions: {suggestions}",
    "error.deployTaskRunning":
      "Service `{serverName}` already has a deploy task running. Wait for the current task to finish before retrying.",
    "error.deployTaskRunningForce":
      "Note: `force=true` only skips this tool's confirmation prompt; it does not cancel or override the platform-side deploy task. First confirm the real task state with queryCloudRun(action=\"getManageTask\", serverName=\"{serverName}\"): if the task has already finished but this error persists, or it stays in a non-terminal state for a long time, contact the CloudBase platform with that output to investigate this environment's deploy task.",
    "error.vpcRequired":
      "CreateCloudRunServer requires a valid VPC: pass serverConfig.VpcConf (VpcId+SubnetId), or pass vpcId/subnetIds during initEnv (after provisioning, deploy auto-fills from EnvBaseInfo). If the platform rejects system-created networks, you must specify a Shanghai-region VPC.",
    "error.genericRetry":
      "Check the service status, deploy parameters, and target directory, then retry.",
    "error.targetPathRequired": "targetPath is required for {action} operation",
    "error.agentConfigRequired":
      "agentConfig is required for createAgent operation",
    "error.deployTargetRequired":
      "targetPath (source build) or imageUrl (existing image) is required for deploy operation",
    "error.serverConfigRequired":
      "serverConfig with at least one field is required for updateConfig",
    "error.trafficOpRequired":
      "trafficOp is required for traffic operation (set | promote | rollback)",
    "error.percentsRequired":
      "stablePercent and canaryPercent are required for trafficOp=set",
    "error.percentSum":
      "stablePercent + canaryPercent must equal 100 (got {stable} + {canary} = {sum}). Example: 90/10 means 90% to stable version, 10% to canary version.",
    "error.localRunContainerUnsupported":
      "Local run is only supported for function-type CloudRun services. Container services are not supported.",
    "error.startFailed": "Failed to start local process: PID is undefined.",
    "error.deleteConfirm": "Delete operation requires confirmation",
    "error.deleteConfirmMessage":
      "Please set force: true to confirm deletion of the service. This action cannot be undone.",
    "error.serverNameRequired":
      "detailServerName or serverName is required for {action} action",
    "error.provideServerName":
      "Please provide detailServerName or serverName.",
    "error.serviceNotFound": "Service '{serverName}' not found",
    "error.serviceNotFoundRetry":
      "Please check the service name and try again.",
    "error.noDeployRecords": "Service '{serverName}' has no deploy records.",
    "error.deployFirst":
      "Please deploy the service first, then query the deploy log again.",
    "error.runIdRequired":
      "runId is required, or provide detailServerName/serverName to resolve latest RunId",
    "error.runIdRequiredHint":
      "Pass runId from detail/getDeployRecords latestDeploy.RunId, or provide a service name to use the latest deploy RunId.",
    "error.noRunIdOnLatest":
      "Service '{serverName}' has no RunId on the latest deploy record.",
    "error.runIdRequiredAction": "runId is required for getProcessLog action",
    "error.runIdReadGuide":
      "Deploy the service first, then read RunId from queryCloudRun(action=\"detail\") or getDeployRecords (latestDeploy.RunId).",

    "list.message": "Found {count} CloudRun services",
    "templates.message": "Found {count} available templates",

    "detail.noRecords":
      "Retrieved details for service '{serverName}'. No deploy records found yet.",
    "detail.deployFailed":
      "Service '{serverName}' latest deploy failed. Use queryCloudRun(action=\"getProcessLog\") for runtime/deploy-step logs (RunId from latestDeploy); use getDeployLog only for cloud source-build logs (CODING).",
    "detail.deployRunning":
      "Service '{serverName}' latest deploy is still running. Please check again later or query the deploy log for progress.",
    "detail.ok":
      "Retrieved details for service '{serverName}'. Latest service status: {status}, latest deploy status: {deployStatus}.",
    "detail.recordsWarning": "Failed to fetch deploy records: {baseMessage}",
    "detail.recordsUnavailable":
      "Retrieved details for service '{serverName}', but deploy records are currently unavailable.",

    "buildLog.message":
      "Retrieved build log for service '{serverName}' (getDeployLog=build log; for runtime logs use getProcessLog with RunId)",
    "processLog.message":
      "Retrieved process/runtime log for RunId='{runId}' (getProcessLog=runtime log; getDeployLog=build log, cloud source builds only / depends on CODING)",
    "deployRecords.message":
      "Retrieved {count} deploy records for service '{serverName}'",
    "manageTask.message":
      "Deploy task for service '{serverName}': TaskId={taskId}, TaskStatus={taskStatus}, latest version status={deployStatus}. If TaskStatus never changes or the version stays in 'creating', check the deploy-phase log with queryCloudRun(action=\"getProcessLog\").",

    "envStatus.unopened":
      "CloudRun is not provisioned for environment {envId}. Call manageCloudRun(action=\"initEnv\", envId=\"{envId}\") first (async, idempotent), or use the console: Environment → CloudRun → Provision; deploy is available once Status=normal.",
    "envStatus.creating":
      "CloudRun for environment {envId} is being provisioned (Status=creating). Retry manageCloudRun(action=\"deploy\") later, or query again with this action until Status=normal.",
    "envStatus.normal":
      "CloudRun is provisioned for environment {envId} (Status=normal); you can call manageCloudRun(action=\"deploy\") directly.",
    "envStatus.unknown":
      "CloudRun status for environment {envId} is unknown (Status={status}); please retry later.",

    "initEnv.alreadyNormal":
      "CloudRun is already provisioned for environment {envId} (Status=normal); no need to provision again. You can call manageCloudRun(action=\"deploy\") directly.",
    "initEnv.creating":
      "CloudRun for environment {envId} is being provisioned (Status=creating); no need to provision again. Later, query via queryCloudRun(action=\"envStatus\", envId=\"{envId}\"); deploy is available once Status=normal.",
    "initEnv.started":
      "CloudRun provisioning started (async, Status=creating). Later, query status via queryCloudRun(action=\"envStatus\", envId=\"{envId}\"); once Status=normal, call manageCloudRun(action=\"deploy\").",

    "traffic.set.message":
      "Set traffic for service '{serverName}': stable {stable}% / canary {canary}%",
    "traffic.promote.message":
      "Promoted canary version to full release for service '{serverName}' (100% traffic). This is irreversible.",
    "traffic.rollback.message":
      "Rolled back service '{serverName}' to the previous stable version.",

    "createAgent.message":
      "Successfully created Agent '{agentName}' with BotId '{botId}' in {projectDir}",

    "deploy.message":
      "Triggered deployment for {serverType} service '{serverName}' ({source}). Deployment is registering/{phase} (status=deploying); this call does not wait for full completion.",
    "deploy.fromImage": "from image {imageUrl}",
    "deploy.fromPath": "from {targetPath}",
    "deploy.phaseBuilding": "building",
    "deploy.phaseStarting": "starting",
    "deploy.warningSuffix":
      " Warning: {message} Set serverConfig.VpcConf before relying on DB connectivity.",

    "updateConfig.noop": "No effective config changes for '{serverName}'.",
    "updateConfig.taskRunningHint":
      "A deploy or config task may still be running. Wait, then retry; or use queryCloudRun(action=\"getDeployLog\").",
    "updateConfig.message":
      "Submitted config change for '{serverName}'.{redeployHint} Verify with queryCloudRun(action=\"detail\"). Console: {consoleUrl}",
    "updateConfig.redeployFields":
      " Fields that often trigger redeploy-with-online-image: {fields}.",
    "updateConfig.hotUpdate":
      " Change may apply as a hot update (e.g. MinNum/MaxNum/AccessTypes).",

    "run.alreadyRunning":
      "Service '{serverName}' is already running locally (pid={pid})",
    "run.message":
      "Started local run for {runMode} service '{serverName}' on port {port} (pid={pid})",

    "download.message":
      "Successfully downloaded service '{serverName}' to {targetPath}",
    "delete.message": "Successfully deleted service '{serverName}'",
    "init.message":
      "Successfully initialized service '{serverName}' with template '{template}' at {targetPath}",

    "risk.noJson.message":
      "EnvParams appears to include a database/cache connection URL, but serverConfig.VpcConf is missing. CloudRun instances usually cannot reach VPC-private MySQL/PostgreSQL/Redis without VpcConf.",
    "risk.noJson.remediation.1":
      "Set serverConfig.VpcConf to the same region/VPC (and a subnet with free IPs) as the database.",
    "risk.noJson.remediation.2":
      "Do NOT invent VpcId/SubnetId. Resolve real IDs from the DB console, resource detail, callCloudApi, or the user.",
    "risk.noJson.remediation.3":
      "Use the database private/intranet hostname in EnvParams, not localhost or docker-compose service names.",
    "risk.noJson.remediation.4":
      "Ensure the DB security group allows the CloudRun subnet on the DB port.",
    "risk.noJson.remediation.5":
      "Re-deploy after VpcConf is set. OpenAccessTypes alone does not provide VPC egress to databases.",
    "risk.detected.message":
      "EnvParams includes database/cache connection settings, but serverConfig.VpcConf is missing. Deploy may succeed while runtime DB connections fail.",
    "risk.detected.remediation.1":
      "Set serverConfig.VpcConf.VpcId and SubnetId to the database VPC/subnet (same region).",
    "risk.detected.remediation.2":
      "Do NOT invent VpcId/SubnetId. Resolve real IDs from the DB console, resource detail, callCloudApi, or the user.",
    "risk.detected.remediation.3":
      "Use the private DB endpoint in EnvParams.",
    "risk.detected.remediation.4":
      "Confirm security group / allowlist permits CloudRun subnet access to the DB port.",
    "risk.detected.remediation.5":
      "Do not confuse OpenAccessTypes (ingress) with VpcConf (egress to VPC resources).",

    "fallback.noteCoding":
      "getDeployLog needs CODING / DescribeCloudRunBuildLog. Use getProcessLog for deploy-step and runtime logs.",
    "fallback.noteRecords":
      "Read latestDeploy.RunId from getDeployRecords, then queryCloudRun(action=\"getProcessLog\"). Skip retrying getDeployLog for CODING login errors.",
    "fallback.messageNoBuild":
      "Service '{serverName}' has no cloud source build (BuildId=0). Skip getDeployLog; use queryCloudRun(action=\"getProcessLog\"{runIdSuffix}) for deploy-step and runtime logs.",
    "fallback.messageCoding":
      "getDeployLog (DescribeCloudRunBuildLog) failed because this account is not a CODING user. Do not retry getDeployLog. Use queryCloudRun(action=\"getProcessLog\", detailServerName=\"{serverName}\"{runIdSuffix}) — RunId comes from getDeployRecords/latestDeploy.",

    "nextStep.imageWithRunId":
      "Image deploy has no CODING build process; skip getDeployLog. Poll getProcessLog for deploy-step and container runtime logs.",
    "nextStep.imageRegistered":
      "Image deploy: read latestDeploy.RunId, then queryCloudRun(action=\"getProcessLog\", runId=...). Skip getDeployLog.",
    "nextStep.imageQueueing":
      "Image deploy registration still queueing; retry getDeployRecords for RunId, then getProcessLog. Skip getDeployLog.",
    "nextStep.sourceWithBuildId":
      "Source build: poll getDeployLog for build progress, then getProcessLog (RunId from detail/getDeployRecords) for runtime/deploy-step logs.",
    "nextStep.sourceNoBuildId":
      "BuildId not yet available; omit buildId to use the latest deploy record. After build, use getProcessLog for runtime logs.",
    "nextStep.sourceTimeout":
      "Task registration is not ready yet (either the wait timed out, or waitRegistration=false was set); omit buildId to use the latest deploy record with getDeployLog, or check the deploy-task state via queryCloudRun(action=\"getManageTask\"). After build, use getProcessLog for runtime logs.",

    "progress.imageWithRunId":
      " Image deploy: use queryCloudRun(action=\"getProcessLog\", detailServerName=\"{serverName}\", runId=\"{runId}\") for runtime/deploy-step logs (skip getDeployLog).",
    "progress.imageRegistered":
      " Image deploy registered{taskIdSuffix}; RunId not yet available — use queryCloudRun(action=\"getDeployRecords\", detailServerName=\"{serverName}\") then getProcessLog (skip getDeployLog), or check {consoleUrl}.",
    "progress.imageTimeout":
      " Image deploy registration timed out after {seconds}s — retry getDeployRecords for RunId then getProcessLog (skip getDeployLog), or check {consoleUrl}.",
    "progress.sourceWithBuildId":
      " Use queryCloudRun(action=\"getDeployLog\", detailServerName=\"{serverName}\", buildId={buildId}) to poll build progress, then getProcessLog for runtime logs.",
    "progress.sourceRegistered":
      " Task registered (taskId={taskId}); BuildId not yet available — retry queryCloudRun(action=\"getDeployLog\", detailServerName=\"{serverName}\") shortly, then getProcessLog, or check {consoleUrl}.",
    "progress.sourceTimeout":
      " Build registration timed out after {seconds}s — deployment may still be queueing. Check {consoleUrl} or retry queryCloudRun(action=\"getDeployLog\", detailServerName=\"{serverName}\") later.",

    // Input schema parameter descriptions
    "schema.query.action":
      "Query action: list=list CloudRun services (supports pagination and filtering), detail=query details of a service (including service config and latest deploy status), templates=list available project templates (for initializing new projects), getDeployLog=get build logs (only meaningful for cloud source builds, backed by CODING/DescribeCloudRunBuildLog; existing-image deploys have no build phase; accounts not logged into CODING get an error), getProcessLog=get runtime logs (deploy-phase steps plus container startup/runtime logs, backed by tcbr/DescribeCloudRunProcessLog; works for both image deploys and source builds and does not depend on CODING; RunId comes from latestDeploy.RunId of detail/getDeployRecords), getDeployRecords=list deploy records of a service (newest first, including BuildId/RunId/FlowRatio/Status, useful for release history and rollback context), envStatus=check whether CloudRun is provisioned for the current env and its status (Status=creating provisioning/normal provisioned), used to poll progress after initEnv or to confirm readiness before deploy, getManageTask=query the deploy task of a service (backed by tcbr/DescribeServerManageTask); returns the task Id/Status plus the latest deploy record status, used to tell whether a deploy is progressing or stuck (e.g. a version stuck in 'creating'). Use it to confirm the real task state when you hit \"a deploy task is already running\" instead of blindly retrying",
    "schema.query.pageSize":
      "Page size, controlling how many services are returned per page. Range: 1-100, default: 10. Adjust based on network performance and display needs",
    "schema.query.pageNum":
      "Page number for paginated queries. Starts at 1, default: 1. Use with pageSize to browse page by page",
    "schema.query.serverName":
      "Service name filter with fuzzy matching. For example, \"test\" matches service names like \"test-service\" and \"my-test-app\". Leave empty to query all services",
    "schema.query.serverType":
      "Service type filter: function=function-type CloudRun (Node.js only, with special development requirements and limits, suitable for simple API services), container=container service (recommended; supports any language and framework such as Java/Go/Python/PHP/.NET, suitable for most scenarios)",
    "schema.query.envId":
      "Environment ID (used with action=envStatus; the currently configured env is used when omitted). Format: env-xxxxxx",
    "schema.query.detailServerName":
      "Name of the service whose details, deploy records, build logs, or runtime logs you want. Recommended when action is detail, getDeployLog, getProcessLog, or getDeployRecords; it must be an existing service name. Use the list action to get available service names",
    "schema.query.buildId":
      "Build ID, used only with action=getDeployLog (build logs, cloud source builds only). When omitted, the build log of the most recent deploy is returned",
    "schema.query.runId":
      "Run ID (RunId), used only with action=getProcessLog. When omitted, the RunId of the service's most recent deploy record is used (the same source as latestDeploy.RunId in detail/getDeployRecords). Runtime logs are available for both image deploys and source builds",
    "schema.query.revealEnvParams":
      "Whether to return plaintext service environment variables (ServerConfig.EnvParams) (effective only with action=detail). Default false, values are masked as \"***\" (keys are kept, which is enough to check which variables are configured and whether a change took effect); when true, plaintext is returned and sensitive variables (such as a DATABASE_URL containing a password) may be exposed to the model context — use with care",
    "schema.manage.action":
      "CloudRun service management action: init=initialize new CloudRun project code from a template (creates a subdirectory named after serverName under targetPath, with templates for many languages and frameworks), download=download an existing service's code locally for development, run=run a function-type CloudRun service locally (for development and debugging, function services only), deploy=trigger the deploy and wait lightly for task registration (does not hang for the full build). Source builds (targetPath) return buildId — poll getDeployLog and then getProcessLog; existing-image deploys (imageUrl, DeployType=image, BuildId usually 0) skip getDeployLog — take the RunId from detail/getDeployRecords and then use getProcessLog. targetPath may be omitted when imageUrl is passed; for existing services, Read-Merge-Write preserves the remote VpcConf/EnvParams/OpenAccessTypes), updateConfig=update the service config only without re-uploading code (aligned with the console service settings, backed by SubmitServerConfigChangeDiff; targetPath not needed), delete=delete a CloudRun service (irreversible, requires confirmation), createAgent=create a function-type Agent (build AI agents on function-type CloudRun), initEnv=provision CloudRun for the current env (creates the CloudRun env asynchronously; idempotent: returns directly when already provisioned; use before the first deploy in a new env), traffic=traffic management and canary release (set=adjust the stable/canary traffic split, promote=promote the canary version to full traffic, rollback=roll back to the previous stable version; matches the tcb cloudrun traffic command)",
    "schema.manage.serverName":
      "CloudRun service name, used to identify and manage the service. Naming rules: upper/lowercase letters, digits, hyphens, and underscores; must start with a letter; 3-45 characters. For init it is the subdirectory name created under targetPath; for other actions it is the target service name. The initEnv action does not need this parameter",
    "schema.manage.trafficOp":
      "Traffic management sub-action (used with action=traffic): set=adjust the canary traffic split (deploy the new version to canary first, then set the stable/canary traffic split via stablePercent/canaryPercent, which must sum to 100); promote=release the canary version to full traffic (sets canary traffic to 100% and turns off canary release, equivalent to tcb cloudrun traffic promote); rollback=roll back to the previous stable version (stops the current canary/releasing version and returns to the stable version, equivalent to tcb cloudrun traffic rollback)",
    "schema.manage.stablePercent":
      "Stable version traffic percentage (used with trafficOp=set), range 0-100. It must sum to 100 with canaryPercent. For example, to send 90% of traffic to stable and 10% to canary, use stablePercent=90, canaryPercent=10",
    "schema.manage.canaryPercent":
      "Canary version traffic percentage (used with trafficOp=set), range 0-100. It must sum to 100 with stablePercent. For example, to send 90% of traffic to stable and 10% to canary, use stablePercent=90, canaryPercent=10",
    "schema.manage.envId":
      "Environment ID (used with action=initEnv; the currently configured env is used when omitted). Format: env-xxxxxx",
    "schema.manage.packageType":
      "CloudRun env package type (used with action=initEnv): Trial, Standard, Professional, Enterprise. Default Trial",
    "schema.manage.vpcId":
      "VPC network ID (optional with action=initEnv). Required when the platform refuses to create the network for you; format: vpc-xxxxxxxx. Passed through to VpcId/SubNetIds of CreateCloudRunEnv together with subnetIds. It can be omitted in most cases (the system creates the network)",
    "schema.manage.subnetIds":
      "Subnet ID list (optional with action=initEnv). Required when you need to specify your own VPC, e.g. [\"subnet-xxxxxxxx\"]. Passed through to SubNetIds of CreateCloudRunEnv together with vpcId",
    "schema.manage.targetPath":
      "Local code path; must be absolute. For deploy it is the code directory to deploy, for download it is the download target directory, and for init it is the parent directory of the CloudRun service (a subdirectory named after serverName is created there). updateConfig does not need this parameter. Recommended convention: the cloudrun/ directory under the project root, e.g. /Users/username/projects/my-project/cloudrun. It may be omitted when deploying an existing image via imageUrl. Note: having a local source directory does not mean a source build is required; when the user specifies an image, prefer imageUrl instead of falling back to a source build just because targetPath exists",
    "schema.manage.imageUrl":
      "Existing-image deploy (used with action=deploy): specify the container image address directly, e.g. ccr.ccs.tencentyun.com/ns/img:v1 or a public registry address. When provided, deployment uses DeployType=\"image\" (container type) and no local source directory is needed (targetPath may be omitted). Supported: 1) publicly pullable anonymous images can be used directly; 2) private/login-required images (such as ghcr.io) must first be docker pull'ed locally, then docker tag/push'ed to Tencent Cloud CCR, and the CCR address used here. When omitted, the source build path is kept (local code is packaged and uploaded). Constraint: if the user explicitly mentions using a specific image, or no code rebuild is needed, you must pass imageUrl for an image deploy instead of falling back to a source build. Note: whichever deploy mode you use, the env must have CloudRun provisioned first (call initEnv when it is not, then deploy after Status=normal)",
    "schema.manage.envParamsReplaceAll":
      "EnvParams merge strategy (deploy / updateConfig): false (default)=merge with the remote config by key (input overrides same-named keys, other remote keys are preserved); true=replace the remote EnvParams entirely with the input. Effective only when EnvParams is passed explicitly",
    "schema.manage.serverConfig":
      "Service config for deploy / updateConfig. Includes resource specs, access permissions, environment variables, logs, network, and more. When deploy omits it, existing services still merge and preserve the remote VpcConf/EnvParams/OpenAccessTypes; updateConfig needs at least one config field",
    "schema.manage.serverConfig.openAccessTypes":
      "Public access type config, controlling access permissions of the service: OA=office network access, PUBLIC=public access (default, reachable via an HTTPS domain), MINIAPP=mini program access, VPC=VPC access (reachable only within the same VPC). Multiple types can be configured",
    "schema.manage.serverConfig.cpu":
      "CPU spec in cores. Allowed values: 0.25, 0.5, 1, 2, 4, 8, and so on. Note: the memory spec must be twice the CPU spec (e.g. CPU=0.25 means memory=0.5, CPU=1 means memory=2). Affects service performance and billing",
    "schema.manage.serverConfig.mem":
      "Memory spec in GB. Allowed values: 0.5, 1, 2, 4, 8, 16, and so on. Note: it must be twice the CPU spec. Affects service performance and billing",
    "schema.manage.serverConfig.minNum":
      "Minimum instance count, controlling the minimum number of running instances. 0 allows scaling to zero (no cost when there are no requests); a value greater than 0 keeps that many instances running at all times (fast responses but higher cost). Setting 1 is recommended to reduce cold-start latency and improve user experience",
    "schema.manage.serverConfig.maxNum":
      "Maximum instance count, controlling the maximum number of running instances. As traffic grows, the service scales out up to this count and rejects new requests beyond it. Set it based on your peak traffic",
    "schema.manage.serverConfig.policyDetails":
      "Autoscaling policy array, used to configure automatic scaling of the service. Multiple policies can be configured",
    "schema.manage.serverConfig.policyDetails.policyType":
      "Scaling type: cpu=scale on CPU utilization, mem=scale on memory utilization, cpu/mem=scale on CPU and memory utilization",
    "schema.manage.serverConfig.policyDetails.policyThreshold":
      "Scaling threshold as a percentage. For example, 60 means scaling is triggered when resource utilization reaches 60%",
    "schema.manage.serverConfig.customLogs":
      "Custom log config, used to configure log collection and storage policies of the service",
    "schema.manage.serverConfig.port":
      "Service listening port. Function services are fixed at 3000 (the function framework listens on that port itself, so business code must not call app.listen); container services can customize it, and business code must listen on this port",
    "schema.manage.serverConfig.envParams":
      "Environment variable config as a JSON string. Used to pass configuration to the service code, e.g. '{\"DATABASE_URL\":\"postgres://user:pass@10.x.x.x:5432/db\",\"NODE_ENV\":\"production\"}'. SDK v5.6.1+ automatically encrypts the passed environment variables with AES-256-CBC in transit. ⚠️ If EnvParams contains traditional TCP database variables such as DATABASE_URL / MYSQL_* / POSTGRES_* / REDIS_*, VpcConf must be configured as well, otherwise instances usually cannot reach databases inside the VPC",
    "schema.manage.serverConfig.dockerfile":
      "Dockerfile name config, needed for container services only. Specifies the Dockerfile path used to build the container image; defaults to the Dockerfile in the project root",
    "schema.manage.serverConfig.buildDir":
      "Build directory config, specifying the directory used to build the code. Use it when the code layout differs from the standard; defaults to the project root",
    "schema.manage.serverConfig.internalAccess":
      "Internal access switch, controlling whether internal network access is enabled. true=enable internal access (callable directly via the CloudBase SDK), false=disable internal access (public access only)",
    "schema.manage.serverConfig.internalDomain":
      "Internal domain config, used to configure the internal access domain of the service. Effective only when internal access is enabled",
    "schema.manage.serverConfig.entryPoint":
      "Dockerfile EntryPoint config, needed for container services only. Specifies the container entry program array, e.g. [\"node\",\"app.js\"]",
    "schema.manage.serverConfig.cmd":
      "Dockerfile Cmd config, needed for container services only. Specifies the container default command array, e.g. [\"npm\",\"start\"]",
    "schema.manage.serverConfig.initialDelaySeconds":
      "Initial delay of the port health check, in seconds. After deployment, the platform waits N seconds before probing the port, then probes roughly every 5s for about 30 consecutive attempts; the deploy is only marked failed after all 30 fail (a ~150s probe window) — it does not fail immediately after N seconds. Raise it to 60–120 for slow-starting applications",
    "schema.manage.serverConfig.logType":
      "Log type config, specifying the log collection type of the service. Affects how logs are collected and stored",
    "schema.manage.serverConfig.logSetId":
      "CLS log set ID config, specifying the CLS (Cloud Log Service) log set ID. CLS must be enabled first",
    "schema.manage.serverConfig.logTopicId":
      "CLS log topic ID config, specifying the CLS (Cloud Log Service) log topic ID. CLS must be enabled first",
    "schema.manage.serverConfig.logParseType":
      "Log parse type config, specifying how logs are parsed. Used to turn raw logs into structured data",
    "schema.manage.serverConfig.tag":
      "Service tag config, used to mark the service type. For example, \"function:\" indicates a function-type service. The SDK generates it automatically from the config",
    "schema.manage.serverConfig.operationMode":
      "Operation mode config, specifying the running mode of the service. Affects scheduling and resource allocation",
    "schema.manage.serverConfig.sessionAffinity":
      "Session affinity config, controlling whether session affinity is enabled. Once enabled, requests from the same client are routed to the same instance",
    "schema.manage.serverConfig.timerScale":
      "Scheduled scaling config array, used to configure scheduled automatic scaling of the service. Multiple time windows can be configured, with daily/weekly/monthly recurrence",
    "schema.manage.serverConfig.timerScale.cycleType":
      "Recurrence type: none=no recurrence, daily=daily, weekly=weekly, monthly=monthly",
    "schema.manage.serverConfig.timerScale.startDate":
      "Recurrence start date, format: YYYY-MM-DD",
    "schema.manage.serverConfig.timerScale.endDate":
      "Recurrence end date, format: YYYY-MM-DD",
    "schema.manage.serverConfig.timerScale.startTime":
      "Start time, format: HH:mm:ss",
    "schema.manage.serverConfig.timerScale.endTime": "End time, format: HH:mm:ss",
    "schema.manage.serverConfig.timerScale.replicaNum":
      "Target replica count for scheduled scaling, minimum 0 (scale to zero)",
    "schema.manage.serverConfig.vpcConf":
      "VPC network config (instance egress / private network). Used to attach CloudRun instances to a specified VPC so they can reach MySQL/PostgreSQL/Redis/CVM and other resources over the internal network. This is a different concept from OpenAccessTypes (how external callers reach this service). It is mandatory for TCP database connections. Do not guess VpcId/SubnetId; they must come from the database console, existing resource details, callCloudApi, or user confirmation. On creation it maps to the SDK vpcInfo(CreateType=2); existing services can use updateConfig or deploy (RMW preserves the remote VpcConf when it is not passed). After deploying/updating, verify ServerConfig.VpcConf with queryCloudRun detail",
    "schema.manage.serverConfig.vpcConf.vpcId":
      "VPC network ID, format: vpc-xxxxxxxx. It must be in the same region as the target database/Redis, and preferably the same VPC. Do not guess it or use placeholders; it must come from the database console, existing resource details, callCloudApi, or user confirmation. Configuring it at creation time is recommended; existing services can also pass it during deploy, and after deployment you must verify it took effect with queryCloudRun detail",
    "schema.manage.serverConfig.vpcConf.subnetId":
      "Subnet ID, format: subnet-xxxxxxxx. CloudRun instances consume IPs from this subnet, so make sure enough IPs are available",
    "schema.manage.serverConfig.volumesConf":
      "Volume config array, used to mount cloud storage (such as CFS) into service instances. Useful for persisting data or sharing files",
    "schema.manage.serverConfig.volumesConf.volumeName": "Volume name",
    "schema.manage.serverConfig.volumesConf.volumeType":
      "Volume type; CFS means Cloud File Storage",
    "schema.manage.serverConfig.volumesConf.volumePath":
      "Volume mount path, the target path inside the service code",
    "schema.manage.serverConfig.publicNetConf":
      "Public access config, used to control the public access policy of the service. You can configure whether public access is enabled and the access path",
    "schema.manage.serverConfig.publicNetConf.publicAccess":
      "Whether public access is enabled: true=enable public access, false=disable public access",
    "schema.manage.serverConfig.publicNetConf.publicAccessPath":
      "Public access path config",
    "schema.manage.template":
      "Project template identifier, specifying the template used when initializing a project. Use the templates action of queryCloudRun to list available templates. Common templates: helloworld=Hello World example, nodejs=Node.js project template, python=Python project template, and so on",
    "schema.manage.runOptions":
      "Local run parameters, supported by function-type CloudRun services only. Used to configure the local development runtime; it does not affect cloud deployments",
    "schema.manage.runOptions.port":
      "Local run port, effective for function services only. Specifies the port the service listens on locally, default 3000. Make sure the port is not already in use",
    "schema.manage.runOptions.envParams":
      "Extra environment variables for local runs, used for local development and debugging. Key-value pairs, e.g. {\"DEBUG\":\"true\",\"LOG_LEVEL\":\"debug\"}. These variables apply to local runs only",
    "schema.manage.runOptions.runMode":
      "Run mode: normal=plain function mode, agent=Agent mode (for AI agent development)",
    "schema.manage.runOptions.agentId":
      "Agent ID, used in agent mode to identify a specific Agent instance",
    "schema.manage.agentConfig":
      "Agent config, used only with the createAgent action",
    "schema.manage.agentConfig.agentName":
      "Agent name, used to generate the BotId",
    "schema.manage.agentConfig.botTag":
      "Bot tag, used to generate the BotId; generated automatically when omitted",
    "schema.manage.agentConfig.description": "Agent description",
    "schema.manage.agentConfig.template":
      "Agent template type, defaults to blank (empty template)",
    "schema.manage.waitRegistration":
      "Whether deploy waits for the platform to register this release (default true, up to ~45s). Waiting yields the identifier needed for follow-up queries (BuildId for source builds, RunId for image deploys). Set false to probe once and return immediately - faster, and suitable when you don't need the buildId and will query the deploy-task state on demand instead",
    "schema.manage.force":
      "Force switch, used to skip confirmation prompts. Default false (confirmation required); true skips all confirmation steps. Setting true is strongly recommended for delete operations to avoid accidental interruptions",
    "schema.manage.serverType":
      "Service type: function=function-type CloudRun (Node.js only, with special development requirements and limits, suitable for simple API services), container=container service (recommended; supports any language and framework such as Java/Go/Python/PHP/.NET, suitable for most scenarios). When omitted it is detected automatically: 1) the existing service type 2) a Dockerfile exists→container 3) a @cloudbase/aiagent-framework dependency exists→function 4) otherwise→container",
  },
);
