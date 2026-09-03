import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";
import { isCloudMode } from "../utils/cloud-mode.js";
import { preferGatewayOrFallback, resolveGatewayAccessUrls } from "../utils/gateway-access-urls.js";

const QUERY_APP_ACTIONS = ["listApps", "getApp", "listAppVersions", "getAppVersion", "getBuildLog", "getUploadUrl"] as const;
const MANAGE_APP_ACTIONS = ["deployApp", "getUploadUrl", "deleteApp", "deleteAppVersion"] as const;
const APP_FRAMEWORKS = ["vue", "react", "next", "nuxt", "vite", "angular", "static"] as const;

type QueryAppAction = (typeof QUERY_APP_ACTIONS)[number];
type ManageAppAction = (typeof MANAGE_APP_ACTIONS)[number];

type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
  code?: string;
};

function buildEnvelope(data: Record<string, unknown>, message: string): ToolEnvelope {
  return {
    success: true,
    data,
    message,
  };
}

function buildErrorEnvelope(error: unknown, code?: string): ToolEnvelope {
  return {
    success: false,
    data: code ? { code } : {},
    message: error instanceof Error ? error.message : String(error),
    ...(code ? { code } : {}),
  };
}

const CLOUD_MODE_UNSUPPORTED_ACTION = "CLOUD_MODE_UNSUPPORTED_ACTION";

function buildCloudModeUnsupportedDeployEnvelope(serviceName: string, reason: "localPath" | "missingCosTimestamp"): ToolEnvelope {
  const message =
    reason === "localPath"
      ? "CLOUD_MODE_UNSUPPORTED_ACTION: cloud mode does not support deployApp with localPath/filePath " +
        "(server has no trusted local filesystem). Use getUploadUrl → HTTP PUT zip → deployApp(cosTimestamp), " +
        "or run manageApps in local stdio mode / CLI."
      : "CLOUD_MODE_UNSUPPORTED_ACTION: cloud mode deployApp requires cosTimestamp. " +
        "Call getUploadUrl first, upload the zip to the pre-signed URL, then pass cosTimestamp.";

  return {
    success: false,
    code: CLOUD_MODE_UNSUPPORTED_ACTION,
    data: {
      code: CLOUD_MODE_UNSUPPORTED_ACTION,
      action: "deployApp",
      serviceName,
      reason,
      nextStep: {
        tool: "manageApps",
        args: { action: "getUploadUrl", serviceName },
        hint: "getUploadUrl → PUT zip to uploadUrl → deployApp(cosTimestamp)",
      },
    },
    message,
  };
}

function getCloudAppService(cloudbase: any) {
  return cloudbase.cloudAppService ?? cloudbase.getCloudAppService?.();
}

function normalizeAccessUrlFromDomain(domain: unknown): { domain?: string; accessUrl?: string } {
  if (typeof domain !== "string" || !domain.trim()) return {};
  const trimmed = domain.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    return {
      domain: url.host,
      accessUrl: url.toString().replace(/\/$/, ""),
    };
  } catch {
    return {};
  }
}

export function registerAppTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool?.(
    "queryApps",
    {
      title: "查询 CloudBase 应用部署状态",
      description:
        "查询 CloudBase 应用部署的应用和版本。可查应用列表/详情、版本列表/详情；部署后用 getAppVersion 按 buildId 轮询构建状态；getBuildLog 可查询构建日志用于诊断失败原因。\n" +
        "action=getUploadUrl（只读）可获取预签名上传 URL：无本地文件系统时（cloud mode），先拿到 uploadUrl 自行 PUT 代码 zip，再用返回的 unixTimestamp 调 manageApps(action=deployApp, cosTimestamp) 触发部署。",
      inputSchema: {
        action: z.enum(QUERY_APP_ACTIONS),
        serviceName: z
          .string()
          .optional()
          .describe("CloudBase 应用服务名。getApp / listAppVersions / getAppVersion / getBuildLog / getUploadUrl 时必填；重新部署后复用同一个 serviceName 查询版本历史。"),
        searchKey: z.string().optional().describe("按应用服务名模糊搜索关键词，仅 action=listApps 时使用。"),
        pageNo: z.number().optional().describe("分页页码，从 1 开始。"),
        pageSize: z.number().optional().describe("分页大小。"),
        versionName: z
          .string()
          .optional()
          .describe("版本名称。getAppVersion 时可与 buildId 二选一；已知版本号时优先传该值。"),
        buildId: z
          .string()
          .optional()
          .describe("构建 ID。getAppVersion 时可与 versionName 二选一；部署返回 BuildId 后可直接用它轮询状态。getBuildLog 时必填。"),
        start: z
          .number()
          .optional()
          .describe("构建日志偏移量，用于分页拉取后续日志。仅 action=getBuildLog 时使用，不传时从开头返回。"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "apps",
      },
    },
    async ({
      action,
      serviceName,
      searchKey,
      pageNo,
      pageSize,
      versionName,
      buildId,
      start,
    }: {
      action: QueryAppAction;
      serviceName?: string;
      searchKey?: string;
      pageNo?: number;
      pageSize?: number;
      versionName?: string;
      buildId?: string;
      start?: number;
    }) => {
      try {
        const cloudbase = await getManager();
        const appService = getCloudAppService(cloudbase);
        if (!appService) {
          throw new Error("当前 manager 未提供 cloudAppService");
        }

        if (action === "listApps") {
          const result = await appService.describeAppList({
            deployType: "static-hosting",
            pageNo: pageNo ?? 1,
            pageSize: pageSize ?? 20,
            searchKey,
          });
          logCloudBaseResult(server.logger, result);
          return jsonContent(
            buildEnvelope(
              {
                action,
                apps: result.ServiceList ?? [],
                total: result.Total ?? 0,
                raw: result,
              },
              "CloudBase 应用列表查询成功",
            ),
          );
        }

        if (!serviceName) {
          throw new Error(`action=${action} 时必须提供 serviceName`);
        }

        // getUploadUrl — 只读获取预签名上传 URL（cloud mode 上传通道第一步）
        if (action === "getUploadUrl") {
          const cosInfoResult = await appService.describeCosInfo({
            deployType: "static-hosting",
            serviceName,
            suffix: ".zip",
          });
          logCloudBaseResult(server.logger, cosInfoResult);

          return jsonContent(
            buildEnvelope(
              {
                action,
                serviceName,
                uploadUrl: cosInfoResult.UploadUrl,
                uploadHeaders: cosInfoResult.UploadHeaders,
                unixTimestamp: cosInfoResult.UnixTimestamp,
                usage: {
                  method: "PUT",
                  contentType: "application/zip",
                  steps: [
                    "1. 将代码打包为 zip（排除 node_modules/.git）",
                    "2. 用 PUT 方法把 zip 上传到 uploadUrl，请求头带 Content-Type: application/zip 以及 uploadHeaders 中的每个 header",
                    `3. 调用 manageApps(action="deployApp", serviceName="${serviceName}", cosTimestamp=<unixTimestamp>) 触发部署`,
                  ],
                  followup: {
                    tool: "manageApps",
                    args: {
                      action: "deployApp",
                      serviceName,
                      cosTimestamp: cosInfoResult.UnixTimestamp,
                    },
                  },
                },
              },
              "预签名上传 URL 获取成功。请将代码 zip PUT 上传到 uploadUrl（携带 uploadHeaders 与 Content-Type: application/zip），然后用返回的 unixTimestamp 作为 cosTimestamp 调用 manageApps(action=deployApp) 触发部署。",
            ),
          );
        }

        if (action === "getApp") {
          const result = await appService.describeAppInfo({
            deployType: "static-hosting",
            serviceName,
          });
          logCloudBaseResult(server.logger, result);
          return jsonContent(
            buildEnvelope(
              {
                action,
                serviceName,
                app: result,
              },
              "CloudBase 应用详情查询成功",
            ),
          );
        }

        if (action === "listAppVersions") {
          const result = await appService.describeAppVersionList({
            deployType: "static-hosting",
            serviceName,
            pageNo: pageNo ?? 1,
            pageSize: pageSize ?? 20,
          });
          logCloudBaseResult(server.logger, result);
          return jsonContent(
            buildEnvelope(
              {
                action,
                serviceName,
                versions: result.VersionList ?? [],
                total: result.Total ?? 0,
                raw: result,
              },
              "CloudBase 应用版本列表查询成功",
            ),
          );
        }

        if (action === "getBuildLog") {
          if (!buildId) {
            throw new Error("action=getBuildLog 时必须提供 buildId");
          }
          const result = await cloudbase.commonService("tcb", "2018-06-08").call({
            Action: "DescribeCloudBaseRunBuildLog",
            Param: {
              EnvId: cloudBaseOptions?.envId || process.env.CLOUDBASE_ENV_ID,
              ServiceName: serviceName,
              BuildId: buildId,
              Start: start ?? 0,
            },
          });
          logCloudBaseResult(server.logger, result);
          const logs = result.Response?.LogList || [];
          return jsonContent(
            buildEnvelope(
              {
                action,
                serviceName,
                buildId,
                logs,
                total: result.Response?.Total || logs.length,
                nextStart: result.Response?.NextStart,
                raw: result,
              },
              logs.length > 0
                ? `查询到 ${logs.length} 条构建日志`
                : "暂无构建日志",
            ),
          );
        }

        const result = await appService.describeAppVersion({
          deployType: "static-hosting",
          serviceName,
          versionName,
          buildId,
        });
        logCloudBaseResult(server.logger, result);

        // Platform may return Failed/failed; normalize before matching.
        const isFailed =
          typeof result.Status === "string" &&
          result.Status.toLowerCase() === "failed";
        const payload: Record<string, unknown> = {
          action,
          serviceName,
          status: result.Status,
          buildId: result.BuildId,
          failReason: result.FailReason,
          buildDuration: result.BuildDuration,
          version: result,
        };

        if (isFailed) {
          payload.nextStep = {
            action: "查询构建日志",
            tool: "queryApps",
            args: {
              action: "getBuildLog",
              serviceName,
              buildId: result.BuildId,
            },
            hint: `构建失败。调用 queryApps(action="getBuildLog", serviceName="${serviceName}", buildId="${result.BuildId}") 查看构建日志，诊断失败原因。`,
          };
        }

        return jsonContent(
          buildEnvelope(
            payload,
          `CloudBase 应用版本详情查询成功（状态: ${result.Status}${result.FailReason ? `, 失败原因: ${result.FailReason}` : ""}${isFailed ? "，可查询构建日志" : ""}）`,
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );

  server.registerTool?.(
    "manageApps",
    {
      title: "部署应用到 CloudBase（独立子域名）",
      description:
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
      inputSchema: {
        action: z.enum(MANAGE_APP_ACTIONS),
        serviceName: z
          .string()
          .describe("CloudBase 应用服务名，会体现在域名中：`<serviceName>-<envId>.webapps.tcloudbase.com`。deployApp 时复用现有 serviceName 会新增一个部署版本并触发重新部署，而不是删除重建。首次部署请用新名称。"),
        filePath: z
          .string()
          .optional()
          .describe("要上传并部署的本地项目根目录绝对路径。本地模式下 deployApp 时必填；通常传源码所在目录（含 package.json 和源码），不是 dist 目录。构建产物目录请用 buildPath 指定。cloud mode 下无需传此参数，改用 cosTimestamp。"),
        cosTimestamp: z
          .coerce
          .number()
          .optional()
          .describe("COS 时间戳（number，来自 getUploadUrl 返回的 unixTimestamp）。传入此值则直接使用已上传的代码创建应用，跳过本地文件上传。需先调用 getUploadUrl 获取预签名 URL，上传 ZIP 包后再传此时间戳。cloud mode 下为必填；本地模式也可传此值代替 filePath。两个路径严格二选一：filePath（本地打包上传）或 cosTimestamp（预签名 URL 上传），同时提供或都不提供都会报错。"),
        appPath: z
          .string()
          .optional()
          .describe("应用线上访问路径（hosting mount path），例如 /my-web-app。不是本地目录路径；CloudApp 已有独立子域名，省略时默认为 /（根路径）。"),
        buildPath: z
          .string()
          .optional()
          .describe("构建产物目录，相对于 filePath，例如 dist 或 build。\n" +
            "⚠️ 传此值后远端构建系统会 cd 到此目录再执行 tcb hosting deploy，因此 deployCmd 会自动使用 .（当前目录）而非目录名，避免路径重复（如 dist/dist 错误）。\n" +
            "纯静态 HTML 如果在项目根目录可省略，但注意 deployCmd 默认用 dist。"),
        framework: z
          .enum(APP_FRAMEWORKS)
          .optional()
          .describe("前端框架类型。可选值：vue、react、next、nuxt、vite、angular、static。\n" +
            "即使传 static，仍会经过远端构建管道。如果本地已构建好，建议改用 manageHosting 直接上传，可完全跳过远端构建。"),
        nodeJsVersion: z
          .string()
          .optional()
          .describe("构建时使用的 Node.js 版本；不传时由 CloudBase 使用默认值。"),
        installCmd: z
          .string()
          .optional()
          .describe("依赖安装命令，例如 npm install。不传时默认 npm install。本地已安装或无需安装可传空字符串 '' 跳过，但远端仍会执行 tcb hosting deploy。"),
        buildCmd: z
          .string()
          .optional()
          .describe("构建命令，例如 npm run build。不传时默认 npm run build。本地已构建好可传空字符串 '' 跳过构建步骤。若希望完全跳过远端管道，请改用 manageHosting。"),
        deployCmd: z
          .string()
          .optional()
          .describe("自定义部署命令。通常无需填写，默认自动生成 tcb hosting deploy 命令。" +
            "有 buildPath 时远端已 cd 到该目录，默认用 . 作为源码路径；无 buildPath 时默认用 dist。"),
        ignore: z.array(z.string()).optional().describe("上传时忽略的文件/目录 glob 模式，例如 **/node_modules/**。\n" +
          "⚠️ 打包的是项目根目录（filePath）而非 buildPath 产物目录：若项目根含 target/（Rust）、.next/、dist-old/、build/ 等大构建产物，必须加进 ignore（如 **/target/**），否则整个目录被打进上传 zip（实证 54GB target → 34GB zip）。默认已排除 node_modules/.git/.DS_Store/**/target/**/.next/**/.next.bak/**。"),
        versionName: z
          .string()
          .optional()
          .describe("要删除的历史版本名，仅 action=deleteAppVersion 时必填。"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "apps",
      },
    },
    async ({
      action,
      serviceName,
      filePath,
      cosTimestamp,
      appPath,
      buildPath,
      framework,
      nodeJsVersion,
      installCmd,
      buildCmd,
      deployCmd,
      ignore,
      versionName,
    }: {
      action: ManageAppAction;
      serviceName: string;
      filePath?: string;
      cosTimestamp?: number;
      appPath?: string;
      buildPath?: string;
      framework?: string;
      nodeJsVersion?: string;
      installCmd?: string;
      buildCmd?: string;
      deployCmd?: string;
      ignore?: string[];
      versionName?: string;
    }) => {
      try {
        const cloudbase = await getManager();
        const appService = getCloudAppService(cloudbase);
        if (!appService) {
          throw new Error("当前 manager 未提供 cloudAppService");
        }

        // 默认排除的大目录（2026-08-14 实证：ato 项目 target/ 54GB 被整个打进 zip）
        // tcb app deploy 打包的是项目根目录（localPath）而非 outputDir，必须排除构建产物
        const defaultPackIgnore = [
          "node_modules/**",
          ".git/**",
          ".DS_Store",
          "**/.DS_Store",
          "**/target/**",
          "**/.next/**",
          "**/.next.bak/**",
        ];

        // getUploadUrl — 获取预签名上传 URL（cloud mode 专用）
        if (action === "getUploadUrl") {
          if (!serviceName) {
            throw new Error("action=getUploadUrl 时必须提供 serviceName");
          }
          const cosInfoResult = await appService.describeCosInfo({
            deployType: "static-hosting",
            serviceName,
          });
          logCloudBaseResult(server.logger, cosInfoResult);

          const defaultIgnore = defaultPackIgnore;
          // eslint-disable-next-line max-len
          const zipCmd = "zip -r upload.zip . -x 'node_modules/**' -x '.git/**' -x '.DS_Store' -x '**/.DS_Store' -x '**/target/**' -x '**/.next/**' -x '**/.next.bak/**'";
          const followupArgs: Record<string, unknown> = {
            action: "deployApp",
            serviceName,
            cosTimestamp: cosInfoResult.UnixTimestamp,
          };

          return jsonContent(
            buildEnvelope(
              {
                action,
                serviceName,
                uploadUrl: cosInfoResult.UploadUrl,
                uploadHeaders: cosInfoResult.UploadHeaders,
                cosTimestamp: cosInfoResult.UnixTimestamp,
                method: "PUT",
                ignore: defaultIgnore,
                zipCommand: zipCmd,
                nextAction: {
                  action: "上传代码到预签名 URL",
                  hint: "请先在本地打包项目代码（排除 node_modules/.git），再将其上传到预签名 URL，然后调用 deployApp 触发构建",
                  details: [
                    `1. 打包: ${zipCmd}`,
                    `2. 上传: curl -X PUT -T upload.zip '${cosInfoResult.UploadUrl}'`,
                    `3. 触发构建: manageApps(action="deployApp", serviceName="${serviceName}", cosTimestamp="${cosInfoResult.UnixTimestamp}")`,
                  ],
                  followup: {
                    tool: "manageApps",
                    args: followupArgs,
                  },
                },
              },
              "预签名上传 URL 获取成功。请上传代码后调用 deployApp 触发构建。",
            ),
          );
        }

        if (action === "deployApp") {
          // Per-action cloud gate: never read caller-controlled local paths in cloud mode.
          // Upload channel: getUploadUrl → agent HTTP PUT zip → deployApp(cosTimestamp).
          if (isCloudMode()) {
            // 云端模式保持 #984 语义：带 localPath 一律拒绝（即使同时传了 cosTimestamp）；
            // 仅「不带 localPath 且带 cosTimestamp」的路径放行。
            if (filePath) {
              return jsonContent(buildCloudModeUnsupportedDeployEnvelope(serviceName, "localPath"));
            }
            if (!cosTimestamp) {
              return jsonContent(buildCloudModeUnsupportedDeployEnvelope(serviceName, "missingCosTimestamp"));
            }
          } else {
            // 本地模式：filePath 与 cosTimestamp 严格二选一，都传或都不传都报错
            if (filePath && cosTimestamp) {
              throw new Error(
                "action=deployApp 时 filePath 与 cosTimestamp 二选一，不能同时提供。" +
                "本地目录上传请只传 filePath；预签名 URL 上传请只传 cosTimestamp。",
              );
            }
            if (!filePath && !cosTimestamp) {
              throw new Error("action=deployApp 时必须提供 filePath（本地模式）或 cosTimestamp（cloud mode）。");
            }
          }

          // Local stdio only: pack directory and upload. Cloud mode must never reach uploadCode.
          let cosTs = cosTimestamp;
          if (!isCloudMode() && filePath) {
            // Default excludes large build dirs (empirically target/ can be tens of GB).
            // Merge caller ignore with defaults so explicit ignore does not drop safety excludes.
            const mergedIgnore = Array.from(new Set([
              ...defaultPackIgnore,
              ...(ignore ?? []),
            ]));
            const uploadResult = await appService.uploadCode({
              deployType: "static-hosting",
              serviceName,
              localPath: filePath,
              ignore: mergedIgnore,
            });
            logCloudBaseResult(server.logger, uploadResult);
            cosTs = uploadResult.cosTimestamp;
          }

          // 构建命令智能默认值
          const resolvedInstallCmd = installCmd ?? "npm install";
          const resolvedBuildCmd = buildCmd ?? "npm run build";
          const resolvedDeployPath = appPath || "/";
          const resolvedBuildPath = buildPath || "";
          // ⚠️ 远端构建系统在有 buildPath 时 cd 到此目录再执行 tcb hosting deploy
          // 部署命令用 "." 避免 dist/dist 重复。framework=static 无构建步骤，用根目录
          const resolvedDeployCmd = deployCmd || (
            resolvedBuildPath || framework === "static"
              ? `tcb hosting deploy . ${resolvedDeployPath}`
              : `tcb hosting deploy dist ${resolvedDeployPath}`);

          // 触发远端构建
          const result = await appService.createApp({
            deployType: "static-hosting",
            serviceName,
            buildType: "ZIP",
            staticConfig: {
              appPath: resolvedDeployPath,
              buildPath: resolvedBuildPath,
              framework,
              nodeJsVersion,
              cosTimestamp: cosTs,
              staticCmd: {
                installCmd: resolvedInstallCmd,
                buildCmd: resolvedBuildCmd,
                deployCmd: resolvedDeployCmd,
              },
            },
          });
          logCloudBaseResult(server.logger, result);

          const { BuildId, VersionName } = result;
          let appInfo: Record<string, unknown> | undefined;
          let domain: string | undefined;
          let accessUrl: string | undefined;
          let accessUrls: string[] = [];
          let accessUrlSource: string | undefined;
          let accessUrlLookupWarning: string | undefined;
          try {
            appInfo = await appService.describeAppInfo({
              deployType: "static-hosting",
              serviceName,
            });
            logCloudBaseResult(server.logger, appInfo);
            ({ domain, accessUrl } = normalizeAccessUrlFromDomain(appInfo?.Domain));
            const envId = await getEnvId(cloudBaseOptions);
            const gateway = await resolveGatewayAccessUrls({
              envId,
              upstreamResourceName: serviceName,
              upstreamResourceTypes: ["STATIC_STORE"],
              getManager: async () => {
                const manager = await getManager();
                if (!manager) {
                  throw new Error("cloudbase manager unavailable");
                }
                return manager as any;
              },
            });
            const preferred = preferGatewayOrFallback({
              gateway,
              fallbackUrl: accessUrl,
              fallbackSource: "describeAppInfo.Domain",
            });
            accessUrl = preferred.accessUrl;
            accessUrls = preferred.accessUrls;
            accessUrlSource = preferred.accessUrlSource;
          } catch (error) {
            accessUrlLookupWarning = error instanceof Error ? error.message : String(error);
            if (accessUrl) {
              accessUrls = [accessUrl];
              accessUrlSource = "describeAppInfo.Domain";
            }
          }

          return jsonContent(
            buildEnvelope(
              {
                action,
                serviceName,
                versionName: VersionName,
                buildId: BuildId,
                domain,
                accessUrl,
                accessUrls: accessUrls.length > 0 ? accessUrls : undefined,
                accessUrlSource,
                accessUrlLookupWarning,
                app: appInfo,
                upload: { cosTimestamp: cosTs },
                deployment: result,
                buildConfig: {
                  installCmd: resolvedInstallCmd,
                  buildCmd: resolvedBuildCmd,
                  deployCmd: resolvedDeployCmd,
                },
                nextStep: {
                  action: "轮询构建状态",
                  tool: "queryApps",
                  args: {
                    action: "getAppVersion",
                    serviceName,
                    buildId: BuildId,
                  },
                  hint: accessUrl
                    ? `调用 queryApps(action="getAppVersion", serviceName="${serviceName}", buildId="${BuildId}") 轮询构建状态，直到 status 变为 SUCCESS 或 FAILED。构建成功后，后续记录部署时必须使用本结果的 accessUrl=${accessUrl}，不要自行拼接域名。若状态为 FAILED，可继续调用 queryApps(action="getBuildLog", serviceName="${serviceName}", buildId="${BuildId}") 查看构建日志诊断失败原因。`
                    : `调用 queryApps(action="getAppVersion", serviceName="${serviceName}", buildId="${BuildId}") 轮询构建状态，直到 status 变为 SUCCESS 或 FAILED；再调用 queryApps(action="getApp", serviceName="${serviceName}") 读取 app.Domain 作为 accessUrl，不能自行拼接域名。若状态为 FAILED，可继续调用 queryApps(action="getBuildLog", serviceName="${serviceName}", buildId="${BuildId}") 查看构建日志诊断失败原因。`,
                },
              },
              accessUrl
                ? "CloudBase 应用构建已触发，已返回真实 accessUrl；请通过 queryApps 轮询构建状态。"
                : "CloudBase 应用构建已触发，请通过 queryApps 轮询构建状态，并用 getApp 读取真实域名。",
            ),
          );
        }

        if (action === "deleteApp") {
          const result = await appService.deleteApp({
            deployType: "static-hosting",
            serviceName,
          });
          logCloudBaseResult(server.logger, result);
          return jsonContent(
            buildEnvelope(
              {
                action,
                serviceName,
                raw: result,
              },
              "CloudBase 应用删除成功",
            ),
          );
        }

        if (!versionName) {
          throw new Error("action=deleteAppVersion 时必须提供 versionName");
        }
        const result = await appService.deleteAppVersion({
          deployType: "static-hosting",
          serviceName,
          versionName,
        });
        logCloudBaseResult(server.logger, result);
        return jsonContent(
          buildEnvelope(
            {
              action,
              serviceName,
              versionName,
              raw: result,
            },
            "CloudBase 应用版本删除成功",
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );
}
