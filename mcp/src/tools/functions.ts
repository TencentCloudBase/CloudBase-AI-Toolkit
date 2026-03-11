import { z } from "zod";
import {
  getCloudBaseManager,
  logCloudBaseResult,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { debug } from "../utils/logger.js";

import { IEnvVariable } from "@cloudbase/manager-node/types/function/types.js";
import path from "path";

// 支持的 Node.js 运行时列表
export const SUPPORTED_NODEJS_RUNTIMES = [
  "Nodejs20.19",
  "Nodejs18.15",
  "Nodejs16.13",
  "Nodejs14.18",
  "Nodejs12.16",
  "Nodejs10.15",
  "Nodejs8.9",
];
export const DEFAULT_NODEJS_RUNTIME = "Nodejs18.15";

// Supported trigger types
export const SUPPORTED_TRIGGER_TYPES = [
  "timer", // Timer trigger
] as const;

export type TriggerType = (typeof SUPPORTED_TRIGGER_TYPES)[number];

// Trigger configuration examples
export const TRIGGER_CONFIG_EXAMPLES = {
  timer: {
    description:
      "Timer trigger configuration using cron expression format: second minute hour day month week year",
    examples: [
      "0 0 2 1 * * *", // Execute at 2:00 AM on the 1st of every month
      "0 30 9 * * * *", // Execute at 9:30 AM every day
      "0 0 12 * * * *", // Execute at 12:00 PM every day
      "0 0 0 1 1 * *", // Execute at midnight on January 1st every year
    ],
  },
};

/**
 * 处理函数根目录路径，确保不包含函数名
 * @param functionRootPath 用户输入的路径
 * @param functionName 函数名称
 * @returns 处理后的根目录路径
 */
function processFunctionRootPath(
  functionRootPath: string | undefined,
  functionName: string,
): string | undefined {
  if (!functionRootPath) return functionRootPath;

  const normalizedPath = path.normalize(functionRootPath);
  const lastDir = path.basename(normalizedPath);

  // 如果路径的最后一级目录名与函数名相同，说明用户可能传入了包含函数名的路径
  if (lastDir === functionName) {
    const parentPath = path.dirname(normalizedPath);
    console.warn(
      `检测到 functionRootPath 包含函数名 "${functionName}"，已自动调整为父目录: ${parentPath}`,
    );
    return parentPath;
  }

  return functionRootPath;
}

export function registerFunctionTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // getFunctionList - 获取云函数列表或详情(推荐)
  server.registerTool?.(
    "getFunctionList",
    {
      title: "查询云函数列表或详情",
      description:
        "获取云函数列表或单个函数详情。通过 action 参数区分操作类型：list=获取函数列表（默认，无需额外参数），detail=获取函数详情（需要提供 name 参数指定函数名称）",
      inputSchema: {
        action: z
          .enum(["list", "detail"])
          .optional()
          .describe(
            "操作类型：list=获取函数列表（默认，无需额外参数），detail=获取函数详情（需要提供 name 参数）",
          ),
        limit: z.number().optional().describe("范围（list 操作时使用）"),
        offset: z.number().optional().describe("偏移（list 操作时使用）"),
        name: z
          .string()
          .optional()
          .describe(
            "要查询的函数名称。当 action='detail' 时，此参数为必填项，必须提供已存在的函数名称。可通过 action='list' 操作获取可用的函数名称列表",
          ),
        codeSecret: z
          .string()
          .optional()
          .describe("代码保护密钥（detail 操作时使用）"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({
      action = "list",
      limit,
      offset,
      name,
      codeSecret,
    }: {
      action?: "list" | "detail";
      limit?: number;
      offset?: number;
      name?: string;
      codeSecret?: string;
    }) => {
      // 使用闭包中的 cloudBaseOptions
      const cloudbase = await getManager();

      if (action === "list") {
        const result = await cloudbase.functions.getFunctionList(limit, offset);
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } else if (action === "detail") {
        if (!name) {
          throw new Error("获取函数详情时，name 参数是必需的");
        }
        const result = await cloudbase.functions.getFunctionDetail(
          name,
          codeSecret,
        );
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } else {
        throw new Error(`不支持的操作类型: ${action}`);
      }
    },
  );

  // createFunction - 创建云函数 (cloud-incompatible)
  server.registerTool(
    "createFunction",
    {
      title: "创建云函数",
      description: "创建云函数。云函数分为事件型云函数和 HTTP 云函数，请确认你要创建的函数类型。",
      inputSchema: {
        func: z
          .object({
            name: z.string().describe("函数名称"),
            type: z
              .enum(["Event", "HTTP"])
              .optional()
              .describe("函数类型，Event 为事件型云函数，HTTP 为 HTTP 云函数"),
            protocolType: z
              .enum(["HTTP", "WS"])
              .optional()
              .describe("HTTP 云函数的协议类型，HTTP 为 HTTP 协议（默认），WS 为 WebSocket 协议，仅当 type 为 HTTP 时有效"),
            protocolParams: z
              .object({
                wsParams: z
                  .object({
                    idleTimeOut: z.number().optional().describe("WebSocket 空闲超时时间（秒），默认 15 秒"),
                  })
                  .optional()
                  .describe("WebSocket 协议参数"),
              })
              .optional()
              .describe("协议参数配置，仅当 protocolType 为 WS 时有效"),
            instanceConcurrencyConfig: z
              .object({
                dynamicEnabled: z.boolean().optional().describe("是否启用动态并发，默认 false"),
                maxConcurrency: z.number().optional().describe("最大并发数，默认 10"),
              })
              .optional()
              .describe("多并发配置，仅当 type 为 HTTP 时有效"),
            timeout: z.number().optional().describe("函数超时时间"),
            envVariables: z.record(z.string()).optional().describe("环境变量"),
            vpc: z
              .object({
                vpcId: z.string(),
                subnetId: z.string(),
              })
              .optional()
              .describe("私有网络配置"),
            runtime: z
              .string()
              .optional()
              .describe(
                "运行时环境,建议指定为 'Nodejs18.15'，其他可选值：" +
                  SUPPORTED_NODEJS_RUNTIMES.join("，"),
              ),
            triggers: z
              .array(
                z.object({
                  name: z.string().describe("Trigger name"),
                  type: z
                    .enum(SUPPORTED_TRIGGER_TYPES)
                    .describe("Trigger type, currently only supports 'timer'"),
                  config: z
                    .string()
                    .describe(
                      "Trigger configuration. For timer triggers, use cron expression format: second minute hour day month week year. IMPORTANT: Must include exactly 7 fields (second minute hour day month week year). Examples: '0 0 2 1 * * *' (monthly), '0 30 9 * * * *' (daily at 9:30 AM)",
                    ),
                }),
              )
              .optional()
              .describe("Trigger configuration array"),
            handler: z.string().optional().describe("函数入口"),
            ignore: z
              .union([z.string(), z.array(z.string())])
              .optional()
              .describe("忽略文件"),
            isWaitInstall: z.boolean().optional().describe("是否等待依赖安装"),
            layers: z
              .array(
                z.object({
                  name: z.string(),
                  version: z.number(),
                }),
              )
              .optional()
              .describe("Layer配置"),
          })
          .describe("函数配置"),
        functionRootPath: z
          .string()
          .optional()
          .describe(
            "函数根目录（云函数目录的父目录），这里需要传操作系统上文件的绝对路径，注意：不要包含函数名本身，例如函数名为 'hello'，应传入 '/path/to/cloudfunctions'，而不是 '/path/to/cloudfunctions/hello'",
          ),
        force: z.boolean().describe("是否覆盖"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({
      func,
      functionRootPath,
      force,
    }: {
      func: any;
      functionRootPath?: string;
      force: boolean;
    }) => {
      debug(`[createFunction] name=${func.name}, type=${func.type || "Event"}`);

      // HTTP 云函数跳过 runtime 验证，Event 云函数进行验证
      const isHttpFunction = func.type === "HTTP";

      if (!isHttpFunction) {
        // 自动填充默认 runtime
        if (!func.runtime) {
          func.runtime = DEFAULT_NODEJS_RUNTIME;
        } else {
          // 验证 runtime 格式，防止常见的空格问题
          const normalizedRuntime = func.runtime.replace(/\s+/g, "");
          if (SUPPORTED_NODEJS_RUNTIMES.includes(normalizedRuntime)) {
            func.runtime = normalizedRuntime;
          } else if (func.runtime.includes(" ")) {
            console.warn(
              `检测到 runtime 参数包含空格: "${func.runtime}"，已自动移除空格`,
            );
            func.runtime = normalizedRuntime;
          }
        }

        // 验证 runtime 是否有效
        if (!SUPPORTED_NODEJS_RUNTIMES.includes(func.runtime)) {
          throw new Error(
            `不支持的运行时环境: "${func.runtime}"。支持的值：${SUPPORTED_NODEJS_RUNTIMES.join(", ")}`,
          );
        }
      }

      // 强制设置 installDependency 为 true（不暴露给AI）
      func.installDependency = true;

      // 处理函数根目录路径，确保不包含函数名
      const processedRootPath = processFunctionRootPath(
        functionRootPath,
        func.name,
      );

      // 使用闭包中的 cloudBaseOptions
      const cloudbase = await getManager();
      const result = await cloudbase.functions.createFunction({
        func,
        functionRootPath: processedRootPath,
        force,
      });
      logCloudBaseResult(server.logger, result);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // updateFunctionCode - 更新函数代码 (cloud-incompatible)
  server.registerTool(
    "updateFunctionCode",
    {
      title: "更新云函数代码",
      description:
        "更新已存在函数的代码。注意：此工具仅用于更新代码，不支持修改函数配置（如 runtime）。如果需要修改 runtime，需要删除函数后使用 createFunction 重新创建。",
      inputSchema: {
        name: z.string().describe("函数名称"),
        functionRootPath: z
          .string()
          .describe(
            "函数根目录（云函数目录的父目录），这里需要传操作系统上文件的绝对路径",
          ),
        // zipFile: z.string().optional().describe("Base64编码的函数包"),
        // handler: z.string().optional().describe("函数入口"),
        // runtime: z.string().optional().describe("运行时（可选值：" + SUPPORTED_NODEJS_RUNTIMES.join('，') + "，默认 Nodejs 18.15)")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({
      name,
      functionRootPath,
      zipFile,
      handler,
    }: {
      name: string;
      functionRootPath?: string;
      zipFile?: string;
      handler?: string;
    }) => {
      // 处理函数根目录路径，确保不包含函数名
      const processedRootPath = processFunctionRootPath(functionRootPath, name);

      // 构建更新参数，强制设置 installDependency 为 true（不暴露给AI）
      // 注意：不包含 runtime 参数，因为云开发平台不支持修改已存在函数的 runtime
      const updateParams: any = {
        func: {
          name,
          installDependency: true,
          ...(handler && { handler }),
        },
        functionRootPath: processedRootPath,
      };

      // 如果提供了zipFile，则添加到参数中
      if (zipFile) {
        updateParams.zipFile = zipFile;
      }

      // 使用闭包中的 cloudBaseOptions
      const cloudbase = await getManager();
      const result = await cloudbase.functions.updateFunctionCode(updateParams);
      logCloudBaseResult(server.logger, result);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // updateFunctionConfig - 更新函数配置
  server.registerTool?.(
    "updateFunctionConfig",
    {
      title: "更新云函数配置",
      description: "更新云函数配置",
      inputSchema: {
        funcParam: z
          .object({
            name: z.string().describe("函数名称"),
            timeout: z.number().optional().describe("超时时间"),
            envVariables: z.record(z.string()).optional().describe("环境变量"),
            vpc: z
              .object({
                vpcId: z.string(),
                subnetId: z.string(),
              })
              .optional()
              .describe("VPC配置"),
            // runtime: z.string().optional().describe("运行时（可选值：" + SUPPORTED_NODEJS_RUNTIMES.join('，') + "，默认 Nodejs 18.15)")
          })
          .describe("函数配置"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({ funcParam }: { funcParam: any }) => {
      // 自动填充默认 runtime
      // if (!funcParam.runtime) {
      //   funcParam.runtime = DEFAULT_NODEJS_RUNTIME;
      // }
      // 使用闭包中的 cloudBaseOptions
      const cloudbase = await getManager();
      const functionDetail = await cloudbase.functions.getFunctionDetail(
        funcParam.name,
      );
      functionDetail.Environment;
      const vpc =
        typeof functionDetail.VpcConfig === "object" &&
        functionDetail.VpcConfig !== null &&
        functionDetail.VpcConfig.SubnetId &&
        functionDetail.VpcConfig.VpcId
          ? {
              subnetId: functionDetail.VpcConfig.SubnetId,
              vpcId: functionDetail.VpcConfig.VpcId,
            }
          : undefined;
      const result = await cloudbase.functions.updateFunctionConfig({
        name: funcParam.name,
        envVariables: Object.assign(
          {},
          functionDetail.Environment.Variables.reduce(
            (
              acc: Record<string, string | number | boolean>,
              curr: IEnvVariable,
            ) => {
              acc[curr.Key] = curr.Value;
              return acc;
            },
            {},
          ),
          funcParam.envVariables ?? {},
        ),
        timeout: funcParam.timeout ?? functionDetail.Timeout,
        vpc: Object.assign({}, vpc, funcParam.vpc ?? {}),
      });
      logCloudBaseResult(server.logger, result);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // invokeFunction - 调用函数
  server.registerTool?.(
    "invokeFunction",
    {
      title: "调用云函数",
      description: "调用云函数",
      inputSchema: {
        name: z.string().describe("函数名称"),
        params: z.record(z.any()).optional().describe("调用参数"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({
      name,
      params,
    }: {
      name: string;
      params?: Record<string, any>;
    }) => {
      // 使用闭包中的 cloudBaseOptions
      try {
        const cloudbase = await getManager();
        const result = await cloudbase.functions.invokeFunction(name, params);
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes("Function not found") ||
          errorMessage.includes("函数不存在")
        ) {
          throw new Error(
            `${errorMessage}\n\n` +
              `Tip: "invokeFunction" can only call deployed cloud functions. ` +
              `For database operations (such as creating collections), ` +
              `please use the appropriate database tools instead.`,
          );
        }

        throw error;
      }
    },
  );

  // getFunctionLogs - 获取云函数日志（新版，参数直接展开）
  // server.registerTool?.(
  //   "getFunctionLogs",
  //   {
  //     title: "获取云函数日志（新版）",
  //     description:
  //       "获取云函数日志基础信息（LogList），如需日志详情请用 RequestId 调用 getFunctionLogDetail 工具。此接口基于 manger-node 4.4.0+ 的 getFunctionLogsV2 实现，不返回具体日志内容。参数 offset+limit 不得大于 10000，startTime/endTime 间隔不得超过一天。",
  //     inputSchema: {
  //       name: z.string().describe("函数名称"),
  //       offset: z
  //         .number()
  //         .optional()
  //         .describe("数据的偏移量，Offset+Limit 不能大于 10000"),
  //       limit: z
  //         .number()
  //         .optional()
  //         .describe("返回数据的长度，Offset+Limit 不能大于 10000"),
  //       startTime: z
  //         .string()
  //         .optional()
  //         .describe(
  //           "查询的具体日期，例如：2017-05-16 20:00:00，只能与 EndTime 相差一天之内",
  //         ),
  //       endTime: z
  //         .string()
  //         .optional()
  //         .describe(
  //           "查询的具体日期，例如：2017-05-16 20:59:59，只能与 StartTime 相差一天之内",
  //         ),
  //       requestId: z.string().optional().describe("执行该函数对应的 requestId"),
  //       qualifier: z.string().optional().describe("函数版本，默认为 $LATEST"),
  //     },
  //     annotations: {
  //       readOnlyHint: true,
  //       openWorldHint: true,
  //       category: "functions",
  //     },
  //   },
  //   async ({
  //     name,
  //     offset,
  //     limit,
  //     startTime,
  //     endTime,
  //     requestId,
  //     qualifier,
  //   }) => {
  //     if ((offset || 0) + (limit || 0) > 10000) {
  //       throw new Error("offset+limit 不能大于 10000");
  //     }
  //     if (startTime && endTime) {
  //       const start = new Date(startTime).getTime();
  //       const end = new Date(endTime).getTime();
  //       if (end - start > 24 * 60 * 60 * 1000) {
  //         throw new Error("startTime 和 endTime 间隔不能超过一天");
  //       }
  //     }
  //     const cloudbase = await getManager();
  //     const result = await cloudbase.functions.getFunctionLogsV2({
  //       name,
  //       offset,
  //       limit,
  //       startTime,
  //       endTime,
  //       requestId,
  //       qualifier,
  //     });
  //     logCloudBaseResult(server.logger, result);
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: JSON.stringify(result, null, 2),
  //         },
  //       ],
  //     };
  //   },
  // );

  // getFunctionLogDetail - 查询日志详情（参数直接展开）
  // server.registerTool?.(
  //   "getFunctionLogDetail",
  //   {
  //     title: "获取云函数日志详情",
  //     description:
  //       "根据 getFunctionLogs 返回的 RequestId 查询日志详情。参数 startTime、endTime、requestId，返回日志内容（LogJson 等）。仅支持 manger-node 4.4.0+。",
  //     inputSchema: {
  //       startTime: z
  //         .string()
  //         .optional()
  //         .describe(
  //           "查询的具体日期，例如：2017-05-16 20:00:00，只能与 EndTime 相差一天之内",
  //         ),
  //       endTime: z
  //         .string()
  //         .optional()
  //         .describe(
  //           "查询的具体日期，例如：2017-05-16 20:59:59，只能与 StartTime 相差一天之内",
  //         ),
  //       requestId: z.string().describe("执行该函数对应的 requestId"),
  //     },
  //     annotations: {
  //       readOnlyHint: true,
  //       openWorldHint: true,
  //       category: "functions",
  //     },
  //   },
  //   async ({ startTime, endTime, requestId }) => {
  //     if (startTime && endTime) {
  //       const start = new Date(startTime).getTime();
  //       const end = new Date(endTime).getTime();
  //       if (end - start > 24 * 60 * 60 * 1000) {
  //         throw new Error("startTime 和 endTime 间隔不能超过一天");
  //       }
  //     }
  //     const cloudbase = await getManager();
  //     const result = await cloudbase.functions.getFunctionLogDetail({
  //       startTime,
  //       endTime,
  //       logRequestId: requestId,
  //     });
  //     logCloudBaseResult(server.logger, result);
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: JSON.stringify(result, null, 2),
  //         },
  //       ],
  //     };
  //   },
  // );

  // manageFunctionTriggers - 管理云函数触发器（创建/删除）
  server.registerTool?.(
    "manageFunctionTriggers",
    {
      title: "管理云函数触发器",
      description: "创建或删除云函数触发器，通过 action 参数区分操作类型",
      inputSchema: {
        action: z
          .enum(["create", "delete"])
          .describe("操作类型：create=创建触发器，delete=删除触发器"),
        name: z.string().describe("函数名"),
        triggers: z
          .array(
            z.object({
              name: z.string().describe("Trigger name"),
              type: z
                .enum(SUPPORTED_TRIGGER_TYPES)
                .describe("Trigger type, currently only supports 'timer'"),
              config: z
                .string()
                .describe(
                  "Trigger configuration. For timer triggers, use cron expression format: second minute hour day month week year. IMPORTANT: Must include exactly 7 fields (second minute hour day month week year). Examples: '0 0 2 1 * * *' (monthly), '0 30 9 * * * *' (daily at 9:30 AM)",
                ),
            }),
          )
          .optional()
          .describe("触发器配置数组（创建时必需）"),
        triggerName: z.string().optional().describe("触发器名称（删除时必需）"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({
      action,
      name,
      triggers,
      triggerName,
    }: {
      action: "create" | "delete";
      name: string;
      triggers?: any[];
      triggerName?: string;
    }) => {
      // 使用闭包中的 cloudBaseOptions
      const cloudbase = await getManager();

      if (action === "create") {
        if (!triggers || triggers.length === 0) {
          throw new Error("创建触发器时，triggers 参数是必需的");
        }
        const result = await cloudbase.functions.createFunctionTriggers(
          name,
          triggers,
        );
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } else if (action === "delete") {
        if (!triggerName) {
          throw new Error("删除触发器时，triggerName 参数是必需的");
        }
        const result = await cloudbase.functions.deleteFunctionTrigger(
          name,
          triggerName,
        );
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } else {
        throw new Error(`不支持的操作类型: ${action}`);
      }
    },
  );

  // // Layer相关功能
  // // createLayer - 创建Layer
  // server.tool(
  //   "createLayer",
  //   "创建Layer",
  //   {
  //     options: z.object({
  //       contentPath: z.string().optional().describe("Layer内容路径"),
  //       base64Content: z.string().optional().describe("base64编码的内容"),
  //       name: z.string().describe("Layer名称"),
  //       runtimes: z.array(z.string()).describe("运行时列表"),
  //       description: z.string().optional().describe("描述"),
  //       licenseInfo: z.string().optional().describe("许可证信息")
  //     }).describe("Layer配置")
  //   },
  //   async ({ options }) => {
  //     const cloudbase = await getCloudBaseManager()
  //     const result = await cloudbase.functions.createLayer(options);
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: JSON.stringify(result, null, 2)
  //         }
  //       ]
  //     };
  //   }
  // );

  // // listLayers - 获取Layer列表
  // server.tool(
  //   "listLayers",
  //   "获取Layer列表",
  //   {
  //     options: z.object({
  //       offset: z.number().optional().describe("偏移"),
  //       limit: z.number().optional().describe("数量限制"),
  //       runtime: z.string().optional().describe("运行时"),
  //       searchKey: z.string().optional().describe("搜索关键字")
  //     }).optional().describe("查询选项")
  //   },
  //   async ({ options }) => {
  //     const cloudbase = await getCloudBaseManager()
  //     const result = await cloudbase.functions.listLayers(options || {});
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: JSON.stringify(result, null, 2)
  //         }
  //       ]
  //     };
  //   }
  // );

  // // getLayerVersion - 获取Layer版本详情
  // server.tool(
  //   "getLayerVersion",
  //   "获取Layer版本详情",
  //   {
  //     options: z.object({
  //       name: z.string().describe("Layer名称"),
  //       version: z.number().describe("版本号")
  //     }).describe("查询选项")
  //   },
  //   async ({ options }) => {
  //     const cloudbase = await getCloudBaseManager()
  //     const result = await cloudbase.functions.getLayerVersion(options);
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: JSON.stringify(result, null, 2)
  //         }
  //       ]
  //     };
  //   }
  // );

  // // 版本管理相关功能
  // // publishVersion - 发布新版本
  // server.tool(
  //   "publishVersion",
  //   "发布函数新版本",
  //   {
  //     options: z.object({
  //       functionName: z.string().describe("函数名称"),
  //       description: z.string().optional().describe("版本描述")
  //     }).describe("发布选项")
  //   },
  //   async ({ options }) => {
  //     const cloudbase = await getCloudBaseManager()
  //     const result = await cloudbase.functions.publishVersion(options);
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: JSON.stringify(result, null, 2)
  //         }
  //       ]
  //     };
  //   }
  // );

  // // listVersionByFunction - 获取版本列表
  // server.tool(
  //   "listVersionByFunction",
  //   "获取函数版本列表",
  //   {
  //     options: z.object({
  //       functionName: z.string().describe("函数名称"),
  //       offset: z.number().optional().describe("偏移"),
  //       limit: z.number().optional().describe("数量限制"),
  //       order: z.string().optional().describe("排序方式"),
  //       orderBy: z.string().optional().describe("排序字段")
  //     }).describe("查询选项")
  //   },
  //   async ({ options }) => {
  //     const cloudbase = await getCloudBaseManager()
  //     const result = await cloudbase.functions.listVersionByFunction(options);
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: JSON.stringify(result, null, 2)
  //         }
  //       ]
  //     };
  //   }
  // );

  // // 别名配置相关功能
  // // updateFunctionAliasConfig - 更新别名配置
  // server.tool(
  //   "updateFunctionAliasConfig",
  //   "更新函数别名配置",
  //   {
  //     options: z.object({
  //       functionName: z.string().describe("函数名称"),
  //       name: z.string().describe("别名名称"),
  //       functionVersion: z.string().describe("函数版本"),
  //       description: z.string().optional().describe("描述"),
  //       routingConfig: z.object({
  //         AddtionVersionMatchs: z.array(z.object({
  //           Version: z.string(),
  //           Key: z.string(),
  //           Method: z.string(),
  //           Expression: z.string()
  //         }))
  //       }).optional().describe("路由配置")
  //     }).describe("别名配置")
  //   },
  //   async ({ options }) => {
  //     const cloudbase = await getCloudBaseManager()
  //     const result = await cloudbase.functions.updateFunctionAliasConfig(options);
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: JSON.stringify(result, null, 2)
  //         }
  //       ]
  //     };
  //   }
  // );

  // // getFunctionAlias - 获取别名配置
  // server.tool(
  //   "getFunctionAlias",
  //   "获取函数别名配置",
  //   {
  //     options: z.object({
  //       functionName: z.string().describe("函数名称"),
  //       name: z.string().describe("别名名称")
  //     }).describe("查询选项")
  //   },
  //   async ({ options }) => {
  //     const cloudbase = await getCloudBaseManager()
  //     const result = await cloudbase.functions.getFunctionAlias(options);
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: JSON.stringify(result, null, 2)
  //         }
  //       ]
  //     };
  //   }
  // );
}
