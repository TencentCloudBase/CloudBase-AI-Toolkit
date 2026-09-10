import { defineModule } from "../types.js";

export const apps = defineModule(
  {
    queryTitle: "查询 CloudBase 应用部署状态",
    queryDescription:
      "查询 CloudBase 应用部署的应用和版本。可查应用列表/详情、版本列表/详情；部署后用 getAppVersion 按 buildId 轮询构建状态；getBuildLog 可查询构建日志用于诊断失败原因。\n" +
      "action=getUploadUrl（只读）可获取预签名上传 URL：无本地文件系统时（cloud mode），先拿到 uploadUrl 自行 PUT 代码 zip，再用返回的 unixTimestamp 调 manageApps(action=deployApp, cosTimestamp) 触发部署。",
    manageTitle: "部署应用到 CloudBase（独立子域名）",
    manageDescription:
      "部署 Web 应用到 CloudBase（构建前后端，部署到独立子域名）。\n" +
      "云端上传通道（cloud mode，无本地文件系统）：queryApps(action=getUploadUrl) 或 manageApps(action=getUploadUrl) 获取预签名上传 URL → agent 自行 PUT 代码 zip 到 uploadUrl（带 uploadHeaders 与 Content-Type: application/zip）→ 用返回的 unixTimestamp 作为 cosTimestamp 调 deployApp 触发部署。\n" +
      "action=getUploadUrl 获取预签名上传 URL（cloud mode 下使用），返回上传地址和 cosTimestamp。\n" +
      "action=deployApp 上传源码 ZIP 并触发远端构建部署管道：\n" +
      "  1. 远端 npm install（可通过 installCmd=\"\" 跳过）\n" +
      "  2. 远端 npm run build（可通过 buildCmd=\"\" 跳过）\n" +
      "  3. 远端 tcb hosting deploy\n" +
      "\n" +
      "域名格式：`<serviceName>-<envId>.webapps.tcloudbase.com`（每个 serviceName 一个独立子域名）\n" +
      "\n" +
      "✅ 推荐用法（新项目／需要独立域名的 Web 应用，首选此工具）：\n" +
      "  新建项目首次部署时，传 framework=static, installCmd=\"\", buildCmd=\"\" 跳过远端构建，\n" +
      "  只执行 tcb hosting deploy。部署后获得独立子域名，支持版本管理。\n" +
      "\n" +
      "⚠️ 兼容性说明：\n" +
      "- 已有项目若之前用 manageHosting 部署过（域名格式：`<envId>-<appId>.tcloudbaseapp.com`），\n" +
      "  切换到 manageApps 会产生全新的 URL，老链接失效。请保持原部署方式不变。\n" +
      "- 如需判断：调用 queryHosting 检查是否已有托管文件。\n" +
      "\n" +
      "与 manageHosting 对比：\n" +
      "- manageApps（本工具，新项目首选）：域名 `<serviceName>-<envId>.webapps.tcloudbase.com`，独立子域名，支持版本管理\n" +
      "- manageHosting（已有项目或 fallback）：域名 `<envId>-<appId>.tcloudbaseapp.com/<path>`，共享环境域名\n" +
      "两者均可绑定自定义域名。\n" +
      "\n" +
      "⚠️ 如果 manageApps 构建失败，先用 queryApps(action=\"getBuildLog\") 查日志；仍不行再 fallback 到 manageHosting。",
    noCloudAppService: "当前 manager 未提供 cloudAppService",
    listSuccess: "CloudBase 应用列表查询成功",
    serviceNameRequired: "action={action} 时必须提供 serviceName",
    uploadStep1: "1. 将代码打包为 zip（排除 node_modules/.git）",
    uploadStep2: "2. 用 PUT 方法把 zip 上传到 uploadUrl，请求头带 Content-Type: application/zip 以及 uploadHeaders 中的每个 header",
    uploadStep3: "3. 调用 manageApps(action=\"deployApp\", serviceName=\"{serviceName}\", cosTimestamp=<unixTimestamp>) 触发部署",
    getUploadUrlSuccess:
      "预签名上传 URL 获取成功。请将代码 zip PUT 上传到 uploadUrl（携带 uploadHeaders 与 Content-Type: application/zip），然后用返回的 unixTimestamp 作为 cosTimestamp 调用 manageApps(action=deployApp) 触发部署。",
    getSuccess: "CloudBase 应用详情查询成功",
    listVersionsSuccess: "CloudBase 应用版本列表查询成功",
    buildIdRequired: "action=getBuildLog 时必须提供 buildId",
    buildLogFound: "查询到 {count} 条构建日志",
    buildLogEmpty: "暂无构建日志",
    nextStepQueryBuildLog: "查询构建日志",
    buildFailedHint:
      "构建失败。调用 queryApps(action=\"getBuildLog\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") 查看构建日志，诊断失败原因。",
    getVersionSuccess: "CloudBase 应用版本详情查询成功（状态: {status}{extra}）",
    versionFailReason: "，失败原因: {reason}",
    versionBuildLogAvailable: "，可查询构建日志",
    uploadServiceNameRequired: "action=getUploadUrl 时必须提供 serviceName",
    nextActionUploadTitle: "上传代码到预签名 URL",
    nextActionUploadHint:
      "请先在本地打包项目代码（排除 node_modules/.git），再将其上传到预签名 URL，然后调用 deployApp 触发构建",
    packDetail: "1. 打包: {cmd}",
    uploadDetail: "2. 上传: curl -X PUT -T upload.zip '{url}'",
    deployDetail: "3. 触发构建: manageApps(action=\"deployApp\", serviceName=\"{serviceName}\", cosTimestamp=\"{cosTimestamp}\")",
    getUploadUrlShort: "预签名上传 URL 获取成功。请上传代码后调用 deployApp 触发构建。",
    cloudModeLocalPathUnsupported:
      "CLOUD_MODE_UNSUPPORTED_ACTION: cloud mode 不支持带 localPath/filePath 的 deployApp " +
      "(服务端没有可信任的本地文件系统)。请改用 getUploadUrl → HTTP PUT 上传 zip → deployApp(cosTimestamp)，" +
      "或在本地 stdio 模式 / CLI 下运行 manageApps。",
    cloudModeCosTimestampRequired:
      "CLOUD_MODE_UNSUPPORTED_ACTION: cloud mode 下的 deployApp 必须提供 cosTimestamp。" +
      "请先调用 getUploadUrl，把 zip 上传到预签名 URL，然后再传入 cosTimestamp。",
    bothPathAndTimestamp:
      "action=deployApp 时 filePath 与 cosTimestamp 二选一，不能同时提供。" +
      "本地目录上传请只传 filePath；预签名 URL 上传请只传 cosTimestamp。",
    pathOrTimestampRequired: "action=deployApp 时必须提供 filePath（本地模式）或 cosTimestamp（cloud mode）。",
    managerUnavailable: "cloudbase manager 不可用",
    nextStepPollTitle: "轮询构建状态",
    deployHintWithUrl:
      "调用 queryApps(action=\"getAppVersion\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") 轮询构建状态，直到 status 变为 SUCCESS 或 FAILED。构建成功后，后续记录部署时必须使用本结果的 accessUrl={accessUrl}，不要自行拼接域名。若状态为 FAILED，可继续调用 queryApps(action=\"getBuildLog\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") 查看构建日志诊断失败原因。",
    deployHintNoUrl:
      "调用 queryApps(action=\"getAppVersion\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") 轮询构建状态，直到 status 变为 SUCCESS 或 FAILED；再调用 queryApps(action=\"getApp\", serviceName=\"{serviceName}\") 读取 app.Domain 作为 accessUrl，不能自行拼接域名。若状态为 FAILED，可继续调用 queryApps(action=\"getBuildLog\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") 查看构建日志诊断失败原因。",
    deploySuccessWithUrl: "CloudBase 应用构建已触发，已返回真实 accessUrl；请通过 queryApps 轮询构建状态。",
    deploySuccessNoUrl: "CloudBase 应用构建已触发，请通过 queryApps 轮询构建状态，并用 getApp 读取真实域名。",
    deleteSuccess: "CloudBase 应用删除成功",
    versionNameRequired: "action=deleteAppVersion 时必须提供 versionName",
    deleteVersionSuccess: "CloudBase 应用版本删除成功",
  },
  {
    queryTitle: "Query CloudBase app deployment status",
    queryDescription:
      "Query CloudBase deployed apps and versions. Supports app list/detail and version list/detail; after deployment, poll build status by buildId with getAppVersion; getBuildLog retrieves build logs to diagnose failures.\n" +
      "action=getUploadUrl (read-only) returns a pre-signed upload URL: without a local filesystem (cloud mode), fetch the uploadUrl, PUT the code zip yourself, then call manageApps(action=deployApp, cosTimestamp) with the returned unixTimestamp to trigger deployment.",
    manageTitle: "Deploy app to CloudBase (dedicated subdomain)",
    manageDescription:
      "Deploy web apps to CloudBase (builds frontend and backend, deploys to a dedicated subdomain).\n" +
      "Cloud upload channel (cloud mode, no local filesystem): queryApps(action=getUploadUrl) or manageApps(action=getUploadUrl) returns a pre-signed upload URL → agent PUTs the code zip to uploadUrl itself (with uploadHeaders and Content-Type: application/zip) → call deployApp with the returned unixTimestamp as cosTimestamp to trigger deployment.\n" +
      "action=getUploadUrl returns the pre-signed upload URL (used in cloud mode), including the upload address and cosTimestamp.\n" +
      "action=deployApp uploads the source ZIP and triggers the remote build & deploy pipeline:\n" +
      "  1. Remote npm install (skip with installCmd=\"\")\n" +
      "  2. Remote npm run build (skip with buildCmd=\"\")\n" +
      "  3. Remote tcb hosting deploy\n" +
      "\n" +
      "Domain format: `<serviceName>-<envId>.webapps.tcloudbase.com` (one dedicated subdomain per serviceName)\n" +
      "\n" +
      "✅ Recommended usage (new projects / web apps needing a dedicated domain, prefer this tool):\n" +
      "  For a new project's first deployment, pass framework=static, installCmd=\"\", buildCmd=\"\" to skip the remote build\n" +
      "  and only run tcb hosting deploy. After deployment you get a dedicated subdomain with version management.\n" +
      "\n" +
      "⚠️ Compatibility note:\n" +
      "- If an existing project was previously deployed with manageHosting (domain format: `<envId>-<appId>.tcloudbaseapp.com`),\n" +
      "  switching to manageApps produces a brand-new URL and old links break. Keep the original deployment method.\n" +
      "- To check: call queryHosting to see whether hosting files already exist.\n" +
      "\n" +
      "Comparison with manageHosting:\n" +
      "- manageApps (this tool, preferred for new projects): domain `<serviceName>-<envId>.webapps.tcloudbase.com`, dedicated subdomain, version management\n" +
      "- manageHosting (existing projects or fallback): domain `<envId>-<appId>.tcloudbaseapp.com/<path>`, shared environment domain\n" +
      "Both support custom domains.\n" +
      "\n" +
      "⚠️ If the manageApps build fails, check logs with queryApps(action=\"getBuildLog\") first; if it still fails, fall back to manageHosting.",
    noCloudAppService: "The current manager does not provide cloudAppService",
    listSuccess: "CloudBase app list retrieved successfully",
    serviceNameRequired: "serviceName is required when action={action}",
    uploadStep1: "1. Pack the code into a zip (exclude node_modules/.git)",
    uploadStep2: "2. PUT the zip to uploadUrl with header Content-Type: application/zip and every header from uploadHeaders",
    uploadStep3: "3. Call manageApps(action=\"deployApp\", serviceName=\"{serviceName}\", cosTimestamp=<unixTimestamp>) to trigger deployment",
    getUploadUrlSuccess:
      "Pre-signed upload URL obtained. PUT the code zip to uploadUrl (with uploadHeaders and Content-Type: application/zip), then call manageApps(action=deployApp) with the returned unixTimestamp as cosTimestamp to trigger deployment.",
    getSuccess: "CloudBase app details retrieved successfully",
    listVersionsSuccess: "CloudBase app version list retrieved successfully",
    buildIdRequired: "buildId is required when action=getBuildLog",
    buildLogFound: "Retrieved {count} build log entries",
    buildLogEmpty: "No build logs yet",
    nextStepQueryBuildLog: "Query build logs",
    buildFailedHint:
      "Build failed. Call queryApps(action=\"getBuildLog\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") to view the build logs and diagnose the failure.",
    getVersionSuccess: "CloudBase app version details retrieved successfully (status: {status}{extra})",
    versionFailReason: ", fail reason: {reason}",
    versionBuildLogAvailable: ", build logs available",
    uploadServiceNameRequired: "serviceName is required when action=getUploadUrl",
    nextActionUploadTitle: "Upload code to the pre-signed URL",
    nextActionUploadHint:
      "First pack the project code locally (excluding node_modules/.git), upload it to the pre-signed URL, then call deployApp to trigger the build",
    packDetail: "1. Pack: {cmd}",
    uploadDetail: "2. Upload: curl -X PUT -T upload.zip '{url}'",
    deployDetail: "3. Trigger build: manageApps(action=\"deployApp\", serviceName=\"{serviceName}\", cosTimestamp=\"{cosTimestamp}\")",
    getUploadUrlShort: "Pre-signed upload URL obtained. Upload the code, then call deployApp to trigger the build.",
    cloudModeLocalPathUnsupported:
      "CLOUD_MODE_UNSUPPORTED_ACTION: cloud mode does not support deployApp with localPath/filePath " +
      "(server has no trusted local filesystem). Use getUploadUrl → HTTP PUT zip → deployApp(cosTimestamp), " +
      "or run manageApps in local stdio mode / CLI.",
    cloudModeCosTimestampRequired:
      "CLOUD_MODE_UNSUPPORTED_ACTION: cloud mode deployApp requires cosTimestamp. " +
      "Call getUploadUrl first, upload the zip to the pre-signed URL, then pass cosTimestamp.",
    bothPathAndTimestamp:
      "action=deployApp requires either filePath or cosTimestamp, not both. " +
      "For local directory upload pass only filePath; for pre-signed URL upload pass only cosTimestamp.",
    pathOrTimestampRequired: "action=deployApp requires filePath (local mode) or cosTimestamp (cloud mode).",
    managerUnavailable: "cloudbase manager unavailable",
    nextStepPollTitle: "Poll build status",
    deployHintWithUrl:
      "Call queryApps(action=\"getAppVersion\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") to poll the build status until it becomes SUCCESS or FAILED. Once the build succeeds, use accessUrl={accessUrl} from this result when recording the deployment; do not assemble the domain yourself. If the status is FAILED, call queryApps(action=\"getBuildLog\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") to view the build logs and diagnose the failure.",
    deployHintNoUrl:
      "Call queryApps(action=\"getAppVersion\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") to poll the build status until it becomes SUCCESS or FAILED; then call queryApps(action=\"getApp\", serviceName=\"{serviceName}\") to read app.Domain as the accessUrl — do not assemble the domain yourself. If the status is FAILED, call queryApps(action=\"getBuildLog\", serviceName=\"{serviceName}\", buildId=\"{buildId}\") to view the build logs and diagnose the failure.",
    deploySuccessWithUrl: "CloudBase app build triggered; the real accessUrl has been returned. Poll the build status via queryApps.",
    deploySuccessNoUrl: "CloudBase app build triggered. Poll the build status via queryApps and read the real domain with getApp.",
    deleteSuccess: "CloudBase app deleted successfully",
    versionNameRequired: "versionName is required when action=deleteAppVersion",
    deleteVersionSuccess: "CloudBase app version deleted successfully",
  },
);
