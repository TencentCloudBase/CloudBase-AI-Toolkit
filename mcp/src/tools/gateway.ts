import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';
import { successResult, toMCPResponse } from '../utils/response-builder.js';

export function registerGatewayTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool?.(
    "createFunctionHTTPAccess",
    {
      title: "创建云函数HTTP访问",
      description: "创建云函数的 HTTP 访问",
      inputSchema: {
        name: z.string().describe("函数名"),
        path: z.string().describe("HTTP 访问路径"),
        type: z
          .enum(["Event", "HTTP"])
          .optional()
          .describe("函数类型，Event 为事件型云函数（默认），HTTP 为 HTTP 云函数")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "gateway"
      }
    },
    async ({ name, path, type }: { name: string; path: string; type?: "Event" | "HTTP" }) => {
      const cloudbase = await getManager()

      // Event 云函数 type=1，HTTP 云函数 type=6
      const accessType = type === "HTTP" ? 6 : 1;

      const result = await cloudbase.access.createAccess({
        type: accessType as 1 | 2,  // HTTP 云函数使用 type=6，需要类型断言
        name,
        path
      });
      logCloudBaseResult(server.logger, result);

      return toMCPResponse(successResult(
        result,
        `成功为云函数 ${name} 创建 HTTP 访问路径 ${path}`
        // No nextActions - complete operation
      ));
    }
  );
}