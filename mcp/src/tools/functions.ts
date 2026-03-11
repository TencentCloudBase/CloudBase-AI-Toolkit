import { z } from "zod";
import {
  getCloudBaseManager,
  getEnvId,
  logCloudBaseResult,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { debug } from "../utils/logger.js";
import { successResult, errorResult, toMCPResponse, buildNextAction, recommendDocs } from "../utils/response-builder.js";

import { IEnvVariable } from "@cloudbase/manager-node/types/function/types.js";
import path from "path";

// 所有支持的运行时环境(按语言分类)
export const SUPPORTED_RUNTIMES = {
  nodejs: [
    "Nodejs20.19",
    "Nodejs18.15",
    "Nodejs16.13",
    "Nodejs14.18",
    "Nodejs12.16",
    "Nodejs10.15",
    "Nodejs8.9",
  ],
  python: [
    "Python3.10",
    "Python3.9",
    "Python3.7",
    "Python3.6",
    "Python2.7",
  ],
  php: [
    "Php8.0",
    "Php7.4",
    "Php7.2",
  ],
  java: [
    "Java8",
    "Java11",
  ],
  golang: [
    "Golang1",
  ],
} as const;

// 所有支持的运行时(扁平化数组,用于验证)
export const ALL_SUPPORTED_RUNTIMES = Object.values(SUPPORTED_RUNTIMES).flat();

// 默认运行时
export const DEFAULT_RUNTIME = "Nodejs18.15";

// 推荐运行时(用于文档和提示)
export const RECOMMENDED_RUNTIMES = {
  nodejs: "Nodejs18.15",
  python: "Python3.9",
  php: "Php7.4",
  java: "Java11",
  golang: "Golang1",
} as const;

// 保留向后兼容
export const SUPPORTED_NODEJS_RUNTIMES = SUPPORTED_RUNTIMES.nodejs;
export const DEFAULT_NODEJS_RUNTIME = DEFAULT_RUNTIME;

/**
 * 格式化运行时列表(按语言分类)
 * 用于错误提示和用户引导
 */
export function formatRuntimeList(): string {
  return Object.entries(SUPPORTED_RUNTIMES)
    .map(([lang, runtimes]) => {
      const capitalizedLang = lang.charAt(0).toUpperCase() + lang.slice(1);
      return `  ${capitalizedLang}: ${runtimes.join(', ')}`;
    })
    .join('\n');
}

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

export const READ_FUNCTION_LAYER_ACTIONS = [
  "listLayers",
  "listLayerVersions",
  "getLayerVersion",
  "getFunctionLayers",
] as const;

export const WRITE_FUNCTION_LAYER_ACTIONS = [
  "createLayerVersion",
  "deleteLayerVersion",
  "attachLayer",
  "detachLayer",
  "updateFunctionLayers",
] as const;

type ReadFunctionLayerAction = (typeof READ_FUNCTION_LAYER_ACTIONS)[number];
type WriteFunctionLayerAction = (typeof WRITE_FUNCTION_LAYER_ACTIONS)[number];

type FunctionLayerInput = {
  LayerName: string;
  LayerVersion: number;
};

function jsonContent(body: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(body, null, 2),
      },
    ],
  };
}

function normalizeFunctionLayers(layers: unknown): FunctionLayerInput[] {
  if (!Array.isArray(layers)) {
    return [];
  }

  return layers
    .filter((layer): layer is Record<string, unknown> => Boolean(layer))
    .map((layer) => ({
      LayerName: String(layer.LayerName ?? ""),
      LayerVersion: Number(layer.LayerVersion ?? 0),
    }))
    .filter((layer) => Boolean(layer.LayerName) && Number.isFinite(layer.LayerVersion));
}

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
        "获取云函数列表或单个函数详情。通过 action 参数区分操作类型：list=获取函数列表（默认，无需额外参数），detail=获取函数详情（需要提供 name 参数指定函数名称，返回结果中包含函数当前绑定的 Layers 信息）",
      inputSchema: {
        action: z
          .enum(["list", "detail"])
          .optional()
          .describe(
            "操作类型：list=获取函数列表（默认，无需额外参数），detail=获取函数详情（需要提供 name 参数，返回结果中包含当前绑定的 Layers）",
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
      description:
        "创建云函数。云函数分为事件型云函数(Event)和 HTTP 云函数。\n\n" +
        "支持的运行时:\n" +
        "- Event 函数: Node.js, Python, PHP, Java, Go\n" +
        "- HTTP 函数: 所有语言(通过 scf_bootstrap 启动脚本)\n\n" +
        "注意: 运行时创建后不可修改，请谨慎选择。",
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
                "运行时环境。Event 函数支持多种运行时:\n" +
                formatRuntimeList() + "\n\n" +
                "推荐运行时:\n" +
                `  Node.js: ${RECOMMENDED_RUNTIMES.nodejs}\n` +
                `  Python: ${RECOMMENDED_RUNTIMES.python}\n` +
                `  PHP: ${RECOMMENDED_RUNTIMES.php}\n` +
                `  Java: ${RECOMMENDED_RUNTIMES.java}\n` +
                `  Go: ${RECOMMENDED_RUNTIMES.golang}\n\n` +
                "注意:\n" +
                "- HTTP 函数已支持所有语言(通过 scf_bootstrap 启动脚本)\n" +
                "- Node.js 函数会自动安装依赖\n" +
                "- Python/PHP/Java/Go 函数需要预先打包依赖到函数目录"
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
          func.runtime = DEFAULT_RUNTIME;
          console.log(
            `未指定 runtime，使用默认值: ${DEFAULT_RUNTIME}\n` +
            `可选运行时:\n${formatRuntimeList()}`
          );
        } else {
          // 验证 runtime 格式，防止常见的空格问题
          const normalizedRuntime = func.runtime.replace(/\s+/g, "");
          if (ALL_SUPPORTED_RUNTIMES.includes(normalizedRuntime)) {
            func.runtime = normalizedRuntime;
          } else if (func.runtime.includes(" ")) {
            console.warn(
              `检测到 runtime 参数包含空格: "${func.runtime}"，已自动移除空格`,
            );
            func.runtime = normalizedRuntime;
          }
        }

        // 验证 runtime 是否有效
        if (!ALL_SUPPORTED_RUNTIMES.includes(func.runtime)) {
          throw new Error(
            `不支持的运行时环境: "${func.runtime}"\n\n` +
            `支持的运行时:\n${formatRuntimeList()}\n\n` +
            `提示:\n` +
            `- Node.js 函数会自动安装依赖\n` +
            `- Python/PHP/Java/Go 函数需要预先打包依赖到函数目录\n` +
            `- 详细信息请参考文档: https://docs.cloudbase.net/api-reference/manager/node/function#createfunction`
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
  server.registerTool?.(
    "getFunctionLogs",
    {
      title: "获取云函数日志（新版）",
      description:
        "获取云函数日志基础信息（LogList），如需日志详情请用 RequestId 调用 getFunctionLogDetail 工具。此接口基于 manger-node 4.4.0+ 的 getFunctionLogsV2 实现，不返回具体日志内容。参数 offset+limit 不得大于 10000，startTime/endTime 间隔不得超过一天。",
      inputSchema: {
        name: z.string().describe("函数名称"),
        offset: z
          .number()
          .optional()
          .describe("数据的偏移量，Offset+Limit 不能大于 10000"),
        limit: z
          .number()
          .optional()
          .describe("返回数据的长度，Offset+Limit 不能大于 10000"),
        startTime: z
          .string()
          .optional()
          .describe(
            "查询的具体日期，例如：2017-05-16 20:00:00，只能与 EndTime 相差一天之内",
          ),
        endTime: z
          .string()
          .optional()
          .describe(
            "查询的具体日期，例如：2017-05-16 20:59:59，只能与 StartTime 相差一天之内",
          ),
        requestId: z.string().optional().describe("执行该函数对应的 requestId"),
        qualifier: z.string().optional().describe("函数版本，默认为 $LATEST"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({
      name,
      offset,
      limit,
      startTime,
      endTime,
      requestId,
      qualifier,
    }) => {
      if ((offset || 0) + (limit || 0) > 10000) {
        throw new Error("offset+limit 不能大于 10000");
      }
      if (startTime && endTime) {
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        if (end - start > 24 * 60 * 60 * 1000) {
          throw new Error("startTime 和 endTime 间隔不能超过一天");
        }
      }
      const cloudbase = await getManager();
      const result = await cloudbase.functions.getFunctionLogsV2({
        name,
        offset,
        limit,
        startTime,
        endTime,
        requestId,
        qualifier,
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

  // getFunctionLogDetail - 查询日志详情（参数直接展开）
  server.registerTool?.(
    "getFunctionLogDetail",
    {
      title: "获取云函数日志详情",
      description:
        "根据 getFunctionLogs 返回的 RequestId 查询日志详情。参数 startTime、endTime、requestId，返回日志内容（LogJson 等）。仅支持 manger-node 4.4.0+。",
      inputSchema: {
        startTime: z
          .string()
          .optional()
          .describe(
            "查询的具体日期，例如：2017-05-16 20:00:00，只能与 EndTime 相差一天之内",
          ),
        endTime: z
          .string()
          .optional()
          .describe(
            "查询的具体日期，例如：2017-05-16 20:59:59，只能与 StartTime 相差一天之内",
          ),
        requestId: z.string().describe("执行该函数对应的 requestId"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({ startTime, endTime, requestId }) => {
      if (startTime && endTime) {
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        if (end - start > 24 * 60 * 60 * 1000) {
          throw new Error("startTime 和 endTime 间隔不能超过一天");
        }
      }
      const cloudbase = await getManager();
      const result = await cloudbase.functions.getFunctionLogDetail({
        startTime,
        endTime,
        logRequestId: requestId,
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

  server.registerTool?.(
    "readFunctionLayers",
    {
      title: "查询云函数层信息",
      description:
        "查询云函数层及函数层配置。通过 action 区分操作：listLayers=查询层列表，listLayerVersions=查询指定层的版本列表，getLayerVersion=查询层版本详情（含下载地址/元信息），getFunctionLayers=查询指定函数当前绑定的层。返回格式：JSON 包含 success、data（含 action 与对应结果字段）、message；data.layers 或 data.layerVersions 为数组，getFunctionLayers 的 data.layers 每项为 { LayerName, LayerVersion }。",
      inputSchema: {
        action: z
          .enum(READ_FUNCTION_LAYER_ACTIONS)
          .describe(
            "操作类型：listLayers=查询层列表，listLayerVersions=查询指定层的版本列表，getLayerVersion=查询层版本详情，getFunctionLayers=查询指定函数当前绑定的层",
          ),
        name: z
          .string()
          .optional()
          .describe("层名称。listLayerVersions 和 getLayerVersion 操作时必填"),
        version: z
          .number()
          .optional()
          .describe("层版本号。getLayerVersion 操作时必填"),
        runtime: z
          .string()
          .optional()
          .describe("运行时筛选。listLayers 操作时可选"),
        searchKey: z
          .string()
          .optional()
          .describe("层名称搜索关键字。listLayers 操作时可选"),
        offset: z.number().optional().describe("分页偏移。listLayers 操作时可选"),
        limit: z.number().optional().describe("分页数量。listLayers 操作时可选"),
        functionName: z
          .string()
          .optional()
          .describe("函数名称。getFunctionLayers 操作时必填"),
        codeSecret: z
          .string()
          .optional()
          .describe("代码保护密钥。getFunctionLayers 操作时可选"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({
      action,
      name,
      version,
      runtime,
      searchKey,
      offset,
      limit,
      functionName,
      codeSecret,
    }: {
      action: ReadFunctionLayerAction;
      name?: string;
      version?: number;
      runtime?: string;
      searchKey?: string;
      offset?: number;
      limit?: number;
      functionName?: string;
      codeSecret?: string;
    }) => {
      if (action === "listLayers") {
        const cloudbase = await getManager();
        const result = await cloudbase.functions.listLayers({
          offset,
          limit,
          runtime,
          searchKey,
        });
        logCloudBaseResult(server.logger, result);
        return jsonContent({
          success: true,
          data: {
            action,
            layers: result.Layers || [],
            totalCount: result.TotalCount || 0,
            requestId: result.RequestId,
          },
          message: `Successfully retrieved ${result.Layers?.length || 0} layer entries`,
          nextActions: [
            { tool: "readFunctionLayers", action: "listLayerVersions", reason: "List versions of a layer" },
            { tool: "writeFunctionLayers", action: "createLayerVersion", reason: "Create a new layer version" },
          ],
        });
      }

      if (action === "listLayerVersions") {
        if (!name) {
          throw new Error("查询层版本列表时，name 参数是必需的");
        }

        const cloudbase = await getManager();
        const result = await cloudbase.functions.listLayerVersions({ name });
        logCloudBaseResult(server.logger, result);
        return jsonContent({
          success: true,
          data: {
            action,
            name,
            layerVersions: result.LayerVersions || [],
            requestId: result.RequestId,
          },
          message: `Successfully retrieved ${result.LayerVersions?.length || 0} versions for layer '${name}'`,
          nextActions: [
            { tool: "readFunctionLayers", action: "getLayerVersion", reason: "Get version details and download info" },
            { tool: "writeFunctionLayers", action: "attachLayer", reason: "Bind this layer to a function" },
          ],
        });
      }

      if (action === "getLayerVersion") {
        if (!name) {
          throw new Error("查询层版本详情时，name 参数是必需的");
        }
        if (typeof version !== "number") {
          throw new Error("查询层版本详情时，version 参数是必需的");
        }

        const cloudbase = await getManager();
        const result = await cloudbase.functions.getLayerVersion({
          name,
          version,
        });
        logCloudBaseResult(server.logger, result);
        return jsonContent({
          success: true,
          data: {
            action,
            name,
            version,
            layerVersion: result,
            downloadInfo: {
              location: result.Location,
              codeSha256: result.CodeSha256,
            },
            requestId: result.RequestId,
          },
          message: `Successfully retrieved details for layer '${name}' version ${version}`,
          nextActions: [
            { tool: "writeFunctionLayers", action: "attachLayer", reason: "Bind this layer version to a function" },
            { tool: "writeFunctionLayers", action: "deleteLayerVersion", reason: "Delete this layer version" },
          ],
        });
      }

      if (!functionName) {
        throw new Error("查询函数层配置时，functionName 参数是必需的");
      }

      const cloudbase = await getManager();
      const result = await cloudbase.functions.getFunctionDetail(
        functionName,
        codeSecret,
      );
      logCloudBaseResult(server.logger, result);
      const layers = normalizeFunctionLayers(result.Layers);
      return jsonContent({
        success: true,
        data: {
          action,
          functionName,
          layers,
          count: layers.length,
          requestId: result.RequestId,
        },
        message: `Successfully retrieved ${layers.length} bound layers for function '${functionName}'`,
        nextActions: [
          { tool: "writeFunctionLayers", action: "attachLayer", reason: "Add a layer to this function" },
          { tool: "writeFunctionLayers", action: "detachLayer", reason: "Remove a layer from this function" },
          { tool: "writeFunctionLayers", action: "updateFunctionLayers", reason: "Replace or reorder bound layers" },
        ],
      });
    },
  );

  server.registerTool?.(
    "writeFunctionLayers",
    {
      title: "管理云函数层",
      description:
        "管理云函数层和函数层绑定。通过 action 区分操作：createLayerVersion=创建层版本，deleteLayerVersion=删除层版本，attachLayer=给函数追加绑定层，detachLayer=解绑函数层，updateFunctionLayers=整体更新函数层数组以调整顺序或批量更新。返回格式：JSON 包含 success、data（含 action 与结果字段，如 layerVersion、layers）、message、nextActions（建议的后续操作）。",
      inputSchema: {
        action: z
          .enum(WRITE_FUNCTION_LAYER_ACTIONS)
          .describe(
            "操作类型：createLayerVersion=创建层版本，deleteLayerVersion=删除层版本，attachLayer=追加绑定层，detachLayer=解绑层，updateFunctionLayers=整体更新函数层数组",
          ),
        name: z
          .string()
          .optional()
          .describe("层名称。createLayerVersion 和 deleteLayerVersion 操作时必填"),
        version: z
          .number()
          .optional()
          .describe("层版本号。deleteLayerVersion 操作时必填"),
        contentPath: z
          .string()
          .optional()
          .describe("层内容路径，可以是目录或 ZIP 文件路径。createLayerVersion 操作时与 base64Content 二选一"),
        base64Content: z
          .string()
          .optional()
          .describe("层内容的 base64 编码。createLayerVersion 操作时与 contentPath 二选一"),
        runtimes: z
          .array(z.string())
          .optional()
          .describe("层适用的运行时列表。createLayerVersion 操作时必填"),
        description: z
          .string()
          .optional()
          .describe("层版本描述。createLayerVersion 操作时可选"),
        licenseInfo: z
          .string()
          .optional()
          .describe("许可证信息。createLayerVersion 操作时可选"),
        functionName: z
          .string()
          .optional()
          .describe("函数名称。attachLayer、detachLayer、updateFunctionLayers 操作时必填"),
        layerName: z
          .string()
          .optional()
          .describe("要绑定或解绑的层名称。attachLayer 和 detachLayer 操作时必填"),
        layerVersion: z
          .number()
          .optional()
          .describe("要绑定或解绑的层版本号。attachLayer 和 detachLayer 操作时必填"),
        layers: z
          .array(
            z.object({
              LayerName: z.string().describe("层名称"),
              LayerVersion: z.number().describe("层版本号"),
            }),
          )
          .optional()
          .describe("目标函数层数组。updateFunctionLayers 操作时必填，顺序即最终顺序"),
        codeSecret: z
          .string()
          .optional()
          .describe("代码保护密钥。attachLayer 和 detachLayer 操作时可选"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "functions",
      },
    },
    async ({
      action,
      name,
      version,
      contentPath,
      base64Content,
      runtimes,
      description,
      licenseInfo,
      functionName,
      layerName,
      layerVersion,
      layers,
      codeSecret,
    }: {
      action: WriteFunctionLayerAction;
      name?: string;
      version?: number;
      contentPath?: string;
      base64Content?: string;
      runtimes?: string[];
      description?: string;
      licenseInfo?: string;
      functionName?: string;
      layerName?: string;
      layerVersion?: number;
      layers?: FunctionLayerInput[];
      codeSecret?: string;
    }) => {
      if (action === "createLayerVersion") {
        if (!name) {
          throw new Error("创建层版本时，name 参数是必需的");
        }
        if (!runtimes || runtimes.length === 0) {
          throw new Error("创建层版本时，runtimes 参数是必需的");
        }
        if (!contentPath && !base64Content) {
          throw new Error(
            "创建层版本时，contentPath 和 base64Content 至少需要提供一个",
          );
        }

        const cloudbase = await getManager();
        const result = await cloudbase.functions.createLayer({
          name,
          contentPath,
          base64Content,
          runtimes,
          description,
          licenseInfo,
        });
        logCloudBaseResult(server.logger, result);
        return jsonContent({
          success: true,
          data: {
            action,
            name,
            layerVersion: result.LayerVersion,
            requestId: result.RequestId,
          },
          message: `Successfully created a new version for layer '${name}'`,
          nextActions: [
            { tool: "readFunctionLayers", action: "listLayerVersions", reason: "List all versions of this layer" },
            { tool: "writeFunctionLayers", action: "attachLayer", reason: "Bind this version to a function" },
          ],
        });
      }

      if (action === "deleteLayerVersion") {
        if (!name) {
          throw new Error("删除层版本时，name 参数是必需的");
        }
        if (typeof version !== "number") {
          throw new Error("删除层版本时，version 参数是必需的");
        }

        const cloudbase = await getManager();
        const result = await cloudbase.functions.deleteLayerVersion({
          name,
          version,
        });
        logCloudBaseResult(server.logger, result);
        return jsonContent({
          success: true,
          data: {
            action,
            name,
            version,
            requestId: result.RequestId,
          },
          message: `Successfully deleted layer '${name}' version ${version}`,
          nextActions: [
            { tool: "readFunctionLayers", action: "listLayers", reason: "List remaining layers" },
          ],
        });
      }

      if (
        action === "attachLayer" ||
        action === "detachLayer" ||
        action === "updateFunctionLayers"
      ) {
        if (!functionName) {
          throw new Error(`${action} 操作时，functionName 参数是必需的`);
        }
      }

      const envId = await getEnvId(cloudBaseOptions);
      const cloudbase = await getManager();

      if (action === "attachLayer") {
        if (!layerName) {
          throw new Error("attachLayer 操作时，layerName 参数是必需的");
        }
        if (typeof layerVersion !== "number") {
          throw new Error("attachLayer 操作时，layerVersion 参数是必需的");
        }

        const result = await cloudbase.functions.attachLayer({
          envId,
          functionName: functionName as string,
          layerName,
          layerVersion,
          codeSecret,
        });
        logCloudBaseResult(server.logger, result);
        const detail = await cloudbase.functions.getFunctionDetail(
          functionName as string,
          codeSecret,
        );
        const boundLayers = normalizeFunctionLayers(detail.Layers);
        return jsonContent({
          success: true,
          data: {
            action,
            functionName,
            layers: boundLayers,
            requestId: result.RequestId,
          },
          message: `Successfully attached layer '${layerName}' version ${layerVersion} to function '${functionName}'`,
          nextActions: [
            { tool: "readFunctionLayers", action: "getFunctionLayers", reason: "Verify bound layers" },
            { tool: "writeFunctionLayers", action: "detachLayer", reason: "Remove this layer from function" },
          ],
        });
      }

      if (action === "detachLayer") {
        if (!layerName) {
          throw new Error("detachLayer 操作时，layerName 参数是必需的");
        }
        if (typeof layerVersion !== "number") {
          throw new Error("detachLayer 操作时，layerVersion 参数是必需的");
        }

        const result = await cloudbase.functions.unAttachLayer({
          envId,
          functionName: functionName as string,
          layerName,
          layerVersion,
          codeSecret,
        });
        logCloudBaseResult(server.logger, result);
        const detail = await cloudbase.functions.getFunctionDetail(
          functionName as string,
          codeSecret,
        );
        const boundLayers = normalizeFunctionLayers(detail.Layers);
        return jsonContent({
          success: true,
          data: {
            action,
            functionName,
            layers: boundLayers,
            requestId: result.RequestId,
          },
          message: `Successfully detached layer '${layerName}' version ${layerVersion} from function '${functionName}'`,
          nextActions: [
            { tool: "readFunctionLayers", action: "getFunctionLayers", reason: "Verify current bound layers" },
          ],
        });
      }

      if (!layers || layers.length === 0) {
        throw new Error("updateFunctionLayers 操作时，layers 参数是必需的");
      }

      const normalizedLayers = normalizeFunctionLayers(layers);
      if (normalizedLayers.length === 0) {
        throw new Error(
          "updateFunctionLayers 操作时，layers 参数必须包含有效的 LayerName 和 LayerVersion",
        );
      }

      const result = await cloudbase.functions.updateFunctionLayer({
        envId,
        functionName: functionName as string,
        layers: normalizedLayers,
      });
      logCloudBaseResult(server.logger, result);
      const detail = await cloudbase.functions.getFunctionDetail(
        functionName as string,
      );
      const boundLayers = normalizeFunctionLayers(detail.Layers);
      return jsonContent({
        success: true,
        data: {
          action,
          functionName,
          layers: boundLayers,
          requestId: result.RequestId,
        },
        message: `Successfully updated bound layers for function '${functionName}'`,
        nextActions: [
          { tool: "readFunctionLayers", action: "getFunctionLayers", reason: "Verify updated layer order" },
        ],
      });
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
