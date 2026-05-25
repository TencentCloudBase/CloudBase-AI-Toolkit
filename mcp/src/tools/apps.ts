import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";

const QUERY_APP_ACTIONS = ["listApps", "getApp", "listAppVersions", "getAppVersion"] as const;
const MANAGE_APP_ACTIONS = ["deployApp", "deleteApp", "deleteAppVersion"] as const;
const APP_FRAMEWORKS = ["vue", "react", "next", "nuxt", "vite", "angular", "static"] as const;

type QueryAppAction = (typeof QUERY_APP_ACTIONS)[number];
type ManageAppAction = (typeof MANAGE_APP_ACTIONS)[number];

type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
};

function buildEnvelope(data: Record<string, unknown>, message: string): ToolEnvelope {
  return {
    success: true,
    data,
    message,
  };
}

function buildErrorEnvelope(error: unknown): ToolEnvelope {
  return {
    success: false,
    data: {},
    message: error instanceof Error ? error.message : String(error),
  };
}

function getCloudAppService(cloudbase: any) {
  return cloudbase.cloudAppService ?? cloudbase.getCloudAppService?.();
}

export function registerAppTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool?.(
    "queryApps",
    {
      title: "查询 CloudApp",
      description:
        "CloudApp 域统一只读入口。可先查应用/版本，再在重新部署后用 listAppVersions 或 getAppVersion 按 serviceName 验证是否生成了新版本与最新构建状态。",
      inputSchema: {
        action: z.enum(QUERY_APP_ACTIONS),
        serviceName: z
          .string()
          .optional()
          .describe("CloudApp 服务名。getApp / listAppVersions / getAppVersion 时必填；重新部署后复用同一个 serviceName 查询版本历史。"),
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
          .describe("构建 ID。getAppVersion 时可与 versionName 二选一；部署返回 BuildId 后可直接用它轮询状态。"),
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
    }: {
      action: QueryAppAction;
      serviceName?: string;
      searchKey?: string;
      pageNo?: number;
      pageSize?: number;
      versionName?: string;
      buildId?: string;
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
              "CloudApp 列表查询成功",
            ),
          );
        }

        if (!serviceName) {
          throw new Error(`action=${action} 时必须提供 serviceName`);
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
              "CloudApp 详情查询成功",
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
              "CloudApp 版本列表查询成功",
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
        return jsonContent(
          buildEnvelope(
            {
              action,
              serviceName,
              version: result,
            },
            "CloudApp 版本详情查询成功",
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
      title: "管理 CloudApp",
      description:
        "CloudApp 域统一写入口。action=deployApp 会先 uploadCode 再 createApp；首次调用创建应用，后续复用同一个 serviceName 会直接触发重新部署并生成新版本，无需先删除旧应用。",
      inputSchema: {
        action: z.enum(MANAGE_APP_ACTIONS),
        serviceName: z
          .string()
          .describe("CloudApp 服务名。deployApp 时复用现有 serviceName 会新增一个部署版本并触发重新部署，而不是删除重建。"),
        filePath: z
          .string()
          .optional()
          .describe("要上传并部署的本地项目根目录或 zip 文件绝对路径。deployApp 时必填；通常传源码所在目录而不是 build 产物目录，构建产物目录请用 buildPath 指定。"),
        appPath: z
          .string()
          .optional()
          .describe("应用线上访问路径（hosting mount path），例如 /my-web-app。不是本地目录路径；省略时默认为 /serviceName。"),
        buildPath: z
          .string()
          .optional()
          .describe("构建产物目录，相对于 filePath，例如 dist 或 build。纯静态 HTML 如果入口文件直接在项目根目录，可省略。"),
        framework: z
          .enum(APP_FRAMEWORKS)
          .optional()
          .describe("前端框架类型。可选值：vue、react、next、nuxt、vite、angular、static；纯 HTML/静态站点请传 static。"),
        nodeJsVersion: z
          .string()
          .optional()
          .describe("构建时使用的 Node.js 版本；不传时由 CloudApp 使用默认值。"),
        installCmd: z
          .string()
          .optional()
          .describe("依赖安装命令，例如 npm install；静态资源无需安装依赖时可省略。"),
        buildCmd: z
          .string()
          .optional()
          .describe("构建命令，例如 npm run build；纯静态 HTML 无构建步骤时可省略。"),
        deployCmd: z
          .string()
          .optional()
          .describe("自定义部署命令。通常无需填写，只有在默认部署步骤不满足要求时才传。"),
        ignore: z.array(z.string()).optional().describe("上传时忽略的文件/目录 glob 模式，例如 **/node_modules/**。"),
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

        if (action === "deployApp") {
          if (!filePath) {
            throw new Error("action=deployApp 时必须提供 filePath");
          }
          const uploadResult = await appService.uploadCode({
            deployType: "static-hosting",
            serviceName,
            localPath: filePath,
            ignore,
          });
          logCloudBaseResult(server.logger, uploadResult);
          const result = await appService.createApp({
            deployType: "static-hosting",
            serviceName,
            buildType: "ZIP",
            staticConfig: {
              appPath,
              buildPath,
              framework,
              nodeJsVersion,
              cosTimestamp: uploadResult.cosTimestamp,
              staticCmd: {
                installCmd,
                buildCmd,
                deployCmd,
              },
            },
          });
          logCloudBaseResult(server.logger, result);
          return jsonContent(
            buildEnvelope(
              {
                action,
                serviceName,
                upload: uploadResult,
                deployment: result,
              },
              "CloudApp 部署成功",
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
              "CloudApp 删除成功",
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
            "CloudApp 版本删除成功",
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );
}
