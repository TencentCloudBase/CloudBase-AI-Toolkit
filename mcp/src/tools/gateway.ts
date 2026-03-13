import { z } from "zod";
import {
  getCloudBaseManager,
  getEnvId,
  logCloudBaseResult,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";

export function registerGatewayTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool?.(
    "createFunctionHTTPAccess",
    {
      title: "创建云函数HTTP访问",
      description: "创建云函数的 HTTP 访问，并返回可直接使用的访问地址提示",
      inputSchema: {
        name: z.string().describe("函数名"),
        path: z.string().describe("HTTP 访问路径"),
        type: z
          .enum(["Event", "HTTP"])
          .optional()
          .describe("函数类型，Event 为事件型云函数（默认），HTTP 为 HTTP 云函数"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true as const,
        category: "gateway",
      },
    },
    async ({
      name,
      path,
      type,
    }: {
      name: string;
      path: string;
      type?: "Event" | "HTTP";
    }) => {
      const cloudbase = await getManager();
      const normalizedPath = `/${path.trim().replace(/^\/+/, "")}`;

      if (normalizedPath === "/" && path.trim() === "") {
        throw new Error("HTTP 访问路径不能为空");
      }

      // Event 云函数 type=1，HTTP 云函数 type=6
      const accessType = type === "HTTP" ? 6 : 1;

      const result = await cloudbase.access.createAccess({
        type: accessType as 1 | 6,
        name,
        path: normalizedPath,
      });
      logCloudBaseResult(server.logger, result);

      const envId = await getEnvId(cloudBaseOptions);
      const region = cloudBaseOptions?.region ?? process.env.TCB_REGION ?? null;
      const invokeUrl = region
        ? `https://${envId}.${region}.app.tcloudbase.com${normalizedPath}`
        : null;

      const payload = {
        ok: true,
        code: "HTTP_ACCESS_CREATED",
        message: "云函数 HTTP 访问创建成功。",
        function_name: name,
        function_type: type ?? "Event",
        access_type: accessType,
        env_id: envId,
        region,
        path: normalizedPath,
        invoke_url: invokeUrl,
        readiness: {
          status: "created",
          note: "HTTP 服务激活可能有短暂延迟；若首次访问失败，请稍后重试。",
        },
        next_steps: invokeUrl
          ? [
              `Use GET ${invokeUrl} to verify the entrypoint.`,
              "If the gateway reports activation/not-ready errors, retry after the service finishes provisioning.",
            ]
          : [
              "Region is unavailable, so the default invoke URL could not be generated.",
              "Set cloudBaseOptions.region or TCB_REGION to enable direct invoke URL guidance.",
            ],
        raw_result: result,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );
}
