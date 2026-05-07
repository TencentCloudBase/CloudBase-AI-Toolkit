import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";

const QUERY_APP_ACTIONS = ["listApps", "getApp", "listAppVersions", "getAppVersion"] as const;
const MANAGE_APP_ACTIONS = ["deployApp", "deleteApp", "deleteAppVersion"] as const;

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
      description: "CloudApp 域统一只读入口。支持应用、版本列表与版本详情查询。",
      inputSchema: {
        action: z.enum(QUERY_APP_ACTIONS),
        serviceName: z.string().optional(),
        searchKey: z.string().optional(),
        pageNo: z.number().optional(),
        pageSize: z.number().optional(),
        versionName: z.string().optional(),
        buildId: z.string().optional(),
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
      description: "CloudApp 域统一写入口。首轮仅支持静态部署、删除应用和删除版本。",
      inputSchema: {
        action: z.enum(MANAGE_APP_ACTIONS),
        serviceName: z.string(),
        filePath: z.string().optional().describe("要上传并部署的本地文件或目录绝对路径。该字段会直接传给 cloudAppService.uploadCode(filePath)，用于触发 CloudApp 的首次部署或同名应用的重新部署。"),
        appPath: z.string().optional(),
        buildPath: z.string().optional(),
        framework: z.string().optional(),
        nodeJsVersion: z.string().optional(),
        installCmd: z.string().optional(),
        buildCmd: z.string().optional(),
        deployCmd: z.string().optional(),
        ignore: z.array(z.string()).optional(),
        versionName: z.string().optional(),
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
            serviceName,
            filePath,
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
