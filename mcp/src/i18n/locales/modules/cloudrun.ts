import { defineModule } from "../types.js";

export const cloudrun = defineModule(
  {
    "query.title": "查询 CloudRun 服务信息",
    "query.description":
      "查询云托管服务信息，支持获取服务列表、查询服务详情、获取可用模板列表、获取构建日志（getDeployLog，仅云端源码构建/依赖 CODING）、获取运行日志（getProcessLog，镜像与源码部署均可/不依赖 CODING）、获取部署记录以及查询环境云托管开通状态（envStatus）。返回的服务信息包括服务名称、状态、访问类型、配置详情以及最近部署上下文。",
    "manage.title": "管理 CloudRun 服务",
    "manage.description":
      "管理云托管服务，按开发顺序支持：开通云托管环境（initEnv）、初始化项目（可从模板开始，模板列表可通过 queryCloudRun 查询）、下载服务代码、本地运行（仅函数型服务）、部署代码、仅更新配置（updateConfig，无需重新上传代码）、删除服务。deploy 支持两种方式：1) 源码构建（传入 targetPath，本地代码打包上传，默认路径）；2) 已有镜像部署（传入 imageUrl，如 ccr.ccs.tencentyun.com/ns/img:v1，走 DeployType=image 容器型部署，targetPath 可省略）。deploy 语义为「触发部署 + 轻量等待任务注册」（最多约 45s）。源码构建返回 buildId，用 getDeployLog 轮询构建进度后再 getProcessLog；镜像部署（imageUrl）BuildId 常为 0，跳过 getDeployLog，返回 runId/next_step 引导 getProcessLog（或先 getDeployRecords 取 RunId）。若用户明确指定镜像或无需重新构建，必须传 imageUrl，不要仅因本地有源码目录就回退到源码构建。deploy 对已存在服务会先读取远程配置再合并（保留 VpcConf/EnvParams/OpenAccessTypes）。updateConfig 对齐控制台服务设置页。删除操作需要确认，建议设置force=true。新环境首次部署前若提示未开通云托管，先调用 initEnv 开通（异步、幂等）。",

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
      "如果你确认要覆盖当前流程，可在合适时机使用 `force=true` 再次发起。",
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
      "任务注册等待超时；请稍候重试 getDeployLog，或打开 consoleUrl 查看。构建完成后用 getProcessLog 查看运行日志。",

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
  },
  {
    "query.title": "Query CloudRun service info",
    "query.description":
      "Query CloudRun service info: list services, get service details, list available templates, get build logs (getDeployLog, cloud source builds only / depends on CODING), get runtime logs (getProcessLog, works for both image and source deploys / no CODING needed), get deploy records, and check the env's CloudRun provisioning status (envStatus). Returned info includes service name, status, access type, config details, and latest deploy context.",
    "manage.title": "Manage CloudRun services",
    "manage.description":
      "Manage CloudRun services, in development order: provision the CloudRun env (initEnv), initialize a project (optionally from a template; list templates via queryCloudRun), download service code, run locally (function services only), deploy code, update config only (updateConfig, no code upload needed), and delete the service. deploy supports two modes: 1) source build (pass targetPath; local code is packaged and uploaded, the default); 2) existing image deploy (pass imageUrl, e.g. ccr.ccs.tencentyun.com/ns/img:v1; DeployType=image container deploy, targetPath optional). deploy means \"trigger deploy + lightweight wait for task registration\" (up to ~45s). Source builds return buildId — poll getDeployLog for build progress, then getProcessLog; image deploys (imageUrl) usually have BuildId=0 — getDeployLog is skipped, and runId/next_step guide you to getProcessLog (or getDeployRecords first for RunId). If the user explicitly specifies an image or no rebuild is needed, you must pass imageUrl instead of falling back to a source build just because a local source directory exists. For existing services, deploy reads the remote config first and merges (preserving VpcConf/EnvParams/OpenAccessTypes). updateConfig aligns with the console service settings page. Deletion requires confirmation; set force=true. If a new env reports CloudRun not provisioned before the first deploy, call initEnv first (async, idempotent).",

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
      "If you are sure you want to override the current flow, use `force=true` to retry at an appropriate time.",
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
      "Registration timed out; wait a moment then retry getDeployLog, or open consoleUrl. After build, use getProcessLog for runtime logs.",

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
  },
);
