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
    buildIdMustBeNumeric:
      "buildId 必须是数字（云 API DescribeCloudBaseRunBuildLog 的 BuildId 为整数）。收到的值：{buildId}。请使用部署回执或 getAppVersion 返回的 BuildId。",
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
    "schema.queryServiceName": "CloudBase 应用服务名。getApp / listAppVersions / getAppVersion / getBuildLog / getUploadUrl 时必填；重新部署后复用同一个 serviceName 查询版本历史。",
    "schema.searchKey": "按应用服务名模糊搜索关键词，仅 action=listApps 时使用。",
    "schema.pageNo": "分页页码，从 1 开始。",
    "schema.pageSize": "分页大小。",
    "schema.queryVersionName": "版本名称。getAppVersion 时可与 buildId 二选一；已知版本号时优先传该值。",
    "schema.buildId": "构建 ID（数字或数字字符串均可）。getAppVersion 时可与 versionName 二选一；部署返回 BuildId 后可直接用它轮询状态。getBuildLog 时必填。",
    "schema.start": "构建日志偏移量，用于分页拉取后续日志。仅 action=getBuildLog 时使用，不传时从开头返回。",
    "schema.manageServiceName": "CloudBase 应用服务名，会体现在域名中：`<serviceName>-<envId>.webapps.tcloudbase.com`。deployApp 时复用现有 serviceName 会新增一个部署版本并触发重新部署，而不是删除重建。首次部署请用新名称。",
    "schema.filePath": "要上传并部署的本地项目根目录绝对路径。本地模式下 deployApp 时必填；通常传源码所在目录（含 package.json 和源码），不是 dist 目录。构建产物目录请用 buildPath 指定。cloud mode 下无需传此参数，改用 cosTimestamp。",
    "schema.cosTimestamp": "COS 时间戳（getUploadUrl 返回的 unixTimestamp，字符串或数字均可）。传入则直接用已上传的代码创建应用，跳过本地打包上传；需先 getUploadUrl 拿预签名 URL 并 PUT ZIP。cloud mode 必填。与 filePath 严格二选一，同时提供或都不提供都会报错。",
    "schema.appPath": "应用线上访问路径（hosting mount path），例如 /my-web-app。不是本地目录路径；CloudApp 已有独立子域名，省略时默认为 /（根路径）。",
    "schema.buildPath": "构建产物目录，相对于 filePath，例如 dist 或 build。\n" +
      "⚠️ 传此值后远端构建系统会 cd 到此目录再执行 tcb hosting deploy，因此 deployCmd 会自动使用 .（当前目录）而非目录名，避免路径重复（如 dist/dist 错误）。\n" +
      "纯静态 HTML 如果在项目根目录可省略，但注意 deployCmd 默认用 dist。",
    "schema.framework": "前端框架类型。可选值：vue、react、next、nuxt、vite、angular、static。\n" +
      "即使传 static，仍会经过远端构建管道。如果本地已构建好，建议改用 manageHosting 直接上传，可完全跳过远端构建。",
    "schema.nodeJsVersion": "构建时使用的 Node.js 版本；不传时由 CloudBase 使用默认值。",
    "schema.installCmd": "依赖安装命令，例如 npm install。不传时默认 npm install。本地已安装或无需安装可传空字符串 '' 跳过，但远端仍会执行 tcb hosting deploy。",
    "schema.buildCmd": "构建命令，例如 npm run build。不传时默认 npm run build。本地已构建好可传空字符串 '' 跳过构建步骤。若希望完全跳过远端管道，请改用 manageHosting。",
    "schema.deployCmd": "自定义部署命令。通常无需填写，默认自动生成 tcb hosting deploy 命令。" +
      "有 buildPath 时远端已 cd 到该目录，默认用 . 作为源码路径；无 buildPath 时默认用 dist。",
    "schema.ignore": "上传时忽略的文件/目录 glob 模式，例如 **/node_modules/**。\n" +
      "⚠️ 打包的是项目根目录（filePath）而非 buildPath 产物目录：若项目根含 target/（Rust）、.next/、dist-old/、build/ 等大构建产物，必须加进 ignore（如 **/target/**），否则整个目录被打进上传 zip（实证 54GB target → 34GB zip）。默认已排除 node_modules/.git/.DS_Store/**/target/**/.next/**/.next.bak/**。",
    "schema.manageVersionName": "要删除的历史版本名，仅 action=deleteAppVersion 时必填。",
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
    buildIdMustBeNumeric:
      "buildId must be numeric (the BuildId of the cloud API DescribeCloudBaseRunBuildLog is an integer). Received: {buildId}. Use the BuildId returned by the deploy response or getAppVersion.",
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
    "schema.queryServiceName": "CloudBase app service name. Required for getApp, listAppVersions, getAppVersion, getBuildLog, and getUploadUrl. Reuse the same serviceName after redeployment to query its version history.",
    "schema.searchKey": "Keyword for fuzzy matching app service names; used only when action=listApps.",
    "schema.pageNo": "Page number, starting from 1.",
    "schema.pageSize": "Number of items per page.",
    "schema.queryVersionName": "Version name. For getAppVersion, provide either this or buildId; prefer this value when the version name is known.",
    "schema.buildId": "Build ID, accepted as a number or numeric string. For getAppVersion, provide either this or versionName. A BuildId returned by deployment can be passed directly to poll status. Required for getBuildLog.",
    "schema.start": "Build log offset for fetching subsequent pages. Used only when action=getBuildLog; omit it to start from the beginning.",
    "schema.manageServiceName": "CloudBase app service name, included in the domain as `<serviceName>-<envId>.webapps.tcloudbase.com`. Reusing an existing serviceName with deployApp creates a new deployment version and triggers redeployment instead of deleting and recreating the app. Use a new name for the first deployment.",
    "schema.filePath": "Absolute path to the local project root to upload and deploy. Required for deployApp in local mode. Usually this is the source directory containing package.json and source files, not the dist directory; specify the output directory with buildPath. Omit this in cloud mode and use cosTimestamp instead.",
    "schema.cosTimestamp": "COS timestamp returned as unixTimestamp by getUploadUrl; accepts a string or number. When provided, creates the app from previously uploaded code and skips local packaging and upload. Obtain a pre-signed URL with getUploadUrl and PUT the ZIP first. Required in cloud mode. Exactly one of filePath and cosTimestamp must be provided.",
    "schema.appPath": "Online hosting mount path for the app, for example /my-web-app. This is not a local directory path. CloudApp has a dedicated subdomain, so the default is / when omitted.",
    "schema.buildPath": "Build output directory relative to filePath, such as dist or build.\n" +
      "⚠️ When set, the remote build system changes to this directory before running tcb hosting deploy, so deployCmd automatically uses . (the current directory) instead of the directory name to avoid duplicated paths such as dist/dist.\n" +
      "It can be omitted for static HTML in the project root, but note that deployCmd defaults to dist.",
    "schema.framework": "Frontend framework. Allowed values: vue, react, next, nuxt, vite, angular, and static.\n" +
      "Even static uses the remote build pipeline. If the app is already built locally, use manageHosting to upload it directly and skip the remote build entirely.",
    "schema.nodeJsVersion": "Node.js version used for the build; when omitted, CloudBase uses its default.",
    "schema.installCmd": "Dependency installation command, for example npm install. Defaults to npm install when omitted. Pass an empty string '' when dependencies are already installed or no installation is needed, though the remote pipeline still runs tcb hosting deploy.",
    "schema.buildCmd": "Build command, for example npm run build. Defaults to npm run build when omitted. Pass an empty string '' to skip the build step when the app is already built locally. To skip the remote pipeline entirely, use manageHosting.",
    "schema.deployCmd": "Custom deployment command. Usually unnecessary; a tcb hosting deploy command is generated automatically. When buildPath is set, the remote process has already changed to that directory and defaults to . as the source path; otherwise it defaults to dist.",
    "schema.ignore": "Glob patterns for files and directories to exclude from upload, for example **/node_modules/**.\n" +
      "⚠️ Packaging starts at the project root (filePath), not the buildPath output directory. Add large build outputs at the project root, such as target/ (Rust), .next/, dist-old/, or build/, to ignore (for example **/target/**), or the entire directory will be included in the upload ZIP. By default, node_modules, .git, .DS_Store, **/target/**, .next/**, and .next.bak/** are excluded.",
    "schema.manageVersionName": "Historical version name to delete; required only when action=deleteAppVersion.",
  },
);
