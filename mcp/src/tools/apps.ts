import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";
import { isCloudMode } from "../utils/cloud-mode.js";
import { preferGatewayOrFallback, resolveGatewayAccessUrls } from "../utils/gateway-access-urls.js";
import { t } from "../i18n/index.js";

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
      ? t("apps.cloudModeLocalPathUnsupported")
      : t("apps.cloudModeCosTimestampRequired");

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
      title: "apps.queryTitle",
      description: "apps.queryDescription",
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
          throw new Error(t("apps.noCloudAppService"));
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
              t("apps.listSuccess"),
            ),
          );
        }

        if (!serviceName) {
          throw new Error(t("apps.serviceNameRequired", { action }));
        }

        // getUploadUrl — 只读获取预签名上传 URL（cloud mode 上传通道第一步）
        // 语义说明：本 action 是"铸造一张 staging 范围的上传凭据"而非纯查询，挂在只读工具下
        // 是有意为之（cloud agent 可能只有只读权限）。凭据只能 PUT 到该 serviceName 的构建
        // staging key，且时效短；真正改变状态的 deployApp 必须再经 manageApps（非只读）二次授权。
        if (action === "getUploadUrl") {
          const cosInfoResult = await appService.describeCosInfo({
            deployType: "static-hosting",
            serviceName,
            suffix: ".zip",
          });
          // 只记录 RequestId：UploadUrl / UploadHeaders 含预签名凭据（Authorization），不能进日志
          logCloudBaseResult(server.logger, { RequestId: cosInfoResult.RequestId });

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
                    t("apps.uploadStep1"),
                    t("apps.uploadStep2"),
                    t("apps.uploadStep3", { serviceName }),
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
              t("apps.getUploadUrlSuccess"),
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
              t("apps.getSuccess"),
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
              t("apps.listVersionsSuccess"),
            ),
          );
        }

        if (action === "getBuildLog") {
          if (!buildId) {
            throw new Error(t("apps.buildIdRequired"));
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
                ? t("apps.buildLogFound", { count: logs.length })
                : t("apps.buildLogEmpty"),
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
            action: t("apps.nextStepQueryBuildLog"),
            tool: "queryApps",
            args: {
              action: "getBuildLog",
              serviceName,
              buildId: result.BuildId,
            },
            hint: t("apps.buildFailedHint", {
              serviceName,
              buildId: result.BuildId,
            }),
          };
        }

        return jsonContent(
          buildEnvelope(
            payload,
            t("apps.getVersionSuccess", {
              status: result.Status,
              extra: `${result.FailReason ? t("apps.versionFailReason", { reason: result.FailReason }) : ""}${isFailed ? t("apps.versionBuildLogAvailable") : ""}`,
            }),
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
      title: "apps.manageTitle",
      description: "apps.manageDescription",
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
          .int()
          .positive()
          .optional()
          .describe("COS 时间戳（正整数 number，来自 getUploadUrl 返回的 unixTimestamp）。传入此值则直接使用已上传的代码创建应用，跳过本地文件上传。需先调用 getUploadUrl 获取预签名 URL，上传 ZIP 包后再传此时间戳。cloud mode 下为必填；本地模式也可传此值代替 filePath。两个路径严格二选一：filePath（本地打包上传）或 cosTimestamp（预签名 URL 上传），同时提供或都不提供都会报错。"),
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
          throw new Error(t("apps.noCloudAppService"));
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
            throw new Error(t("apps.uploadServiceNameRequired"));
          }
          const cosInfoResult = await appService.describeCosInfo({
            deployType: "static-hosting",
            serviceName,
          });
          // 只记录 RequestId：UploadUrl / UploadHeaders 含预签名凭据（Authorization），不能进日志
          logCloudBaseResult(server.logger, { RequestId: cosInfoResult.RequestId });

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
                  action: t("apps.nextActionUploadTitle"),
                  hint: t("apps.nextActionUploadHint"),
                  details: [
                    t("apps.packDetail", { cmd: zipCmd }),
                    t("apps.uploadDetail", { url: cosInfoResult.UploadUrl }),
                    t("apps.deployDetail", {
                      serviceName,
                      cosTimestamp: cosInfoResult.UnixTimestamp,
                    }),
                  ],
                  followup: {
                    tool: "manageApps",
                    args: followupArgs,
                  },
                },
              },
              t("apps.getUploadUrlShort"),
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
              throw new Error(t("apps.bothPathAndTimestamp"));
            }
            if (!filePath && !cosTimestamp) {
              throw new Error(t("apps.pathOrTimestampRequired"));
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
                  throw new Error(t("apps.managerUnavailable"));
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
                  action: t("apps.nextStepPollTitle"),
                  tool: "queryApps",
                  args: {
                    action: "getAppVersion",
                    serviceName,
                    buildId: BuildId,
                  },
                  hint: accessUrl
                    ? t("apps.deployHintWithUrl", {
                        serviceName,
                        buildId: BuildId,
                        accessUrl,
                      })
                    : t("apps.deployHintNoUrl", { serviceName, buildId: BuildId }),
                },
              },
              accessUrl
                ? t("apps.deploySuccessWithUrl")
                : t("apps.deploySuccessNoUrl"),
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
              t("apps.deleteSuccess"),
            ),
          );
        }

        if (!versionName) {
          throw new Error(t("apps.versionNameRequired"));
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
            t("apps.deleteVersionSuccess"),
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );
}
