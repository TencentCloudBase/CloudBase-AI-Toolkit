import CloudBase from "@cloudbase/manager-node";
import { z } from "zod";
import {
  getDatabaseInstanceId,
  getCloudBaseManager,
  invalidateDatabaseInstanceIdCache,
  logCloudBaseResult,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { Logger } from "../types.js";
import { debug } from "../utils/logger.js";

const CATEGORY = "NoSQL database";
const COLLECTION_READY_TIMEOUT_MS = 10000;
const COLLECTION_READY_POLL_INTERVAL_MS = 500;

/** Convert object values to JSON strings for API calls */
const toJSONString = (v: any): any =>
  typeof v === "object" && v !== null ? JSON.stringify(v) : v;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function parseNoSqlDocument(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" ? parsed : value;
  } catch {
    return value;
  }
}

function normalizeNoSqlDocuments(data: unknown) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item) => parseNoSqlDocument(item));
}

function normalizeSortDirection(value: unknown): 1 | -1 {
  if (value === 1) {
    return 1;
  }

  if (value === -1) {
    return -1;
  }

  throw new Error(
    `非法 sort direction: ${String(value)}，仅支持 1 / -1`,
  );
}

function normalizeSortItem(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("sort 数组项必须是 { key, direction } 对象");
  }

  const { key, direction } = value as {
    key?: unknown;
    direction?: unknown;
  };

  if (typeof key !== "string" || key.trim() === "") {
    throw new Error("sort.key 必须是非空字符串");
  }

  return {
    key,
    direction: normalizeSortDirection(direction),
  };
}

function normalizeSortInput(sort: unknown) {
  if (sort === undefined || sort === null) {
    return undefined;
  }

  let parsed = sort;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("sort 必须是 sort 数组的 JSON 字符串");
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      'sort 仅支持数组 [{"key":"createdAt","direction":-1}] 或对应 JSON 字符串',
    );
  }

  if (parsed.length === 0) {
    return undefined;
  }

  return JSON.stringify(parsed.map((item) => normalizeSortItem(item)));
}

function withCollectionName<T extends Record<string, unknown>>(
  collectionName: string,
  payload: T,
) {
  return {
    ...payload,
    collection: collectionName,
    collectionName,
  };
}

function logNoSqlLatency(
  toolName: string,
  phase: string,
  details: Record<string, unknown>,
) {
  debug("[nosql-latency]", {
    toolName,
    phase,
    ...details,
  });
}

function isInvalidInstanceIdError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /(instance.?id|tag).*(invalid|错误|不存在|not exist|not found)|invalid.*(instance.?id|tag)/i.test(
    message,
  );
}

async function resolveNoSqlInstanceId(options: {
  toolName: string;
  cloudbase: CloudBase;
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"];
  instanceIdOverride?: string;
  collectionName: string;
}) {
  const startedAt = Date.now();
  const resolved = await getDatabaseInstanceId({
    instanceId: options.instanceIdOverride,
    cloudBaseOptions: options.cloudBaseOptions,
    cloudbase: options.cloudbase,
  });

  logNoSqlLatency(options.toolName, "resolveInstanceId", {
    collectionName: options.collectionName,
    durationMs: Date.now() - startedAt,
    instanceIdSource: resolved.source,
    cacheKey: resolved.cacheKey,
  });

  return resolved;
}

async function callNoSqlContentApi(options: {
  toolName: string;
  action: string;
  collectionName: string;
  cloudbase: CloudBase;
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"];
  instanceIdOverride?: string;
  param: Record<string, unknown>;
}) {
  const resolvedInstance = await resolveNoSqlInstanceId({
    toolName: options.toolName,
    cloudbase: options.cloudbase,
    cloudBaseOptions: options.cloudBaseOptions,
    instanceIdOverride: options.instanceIdOverride,
    collectionName: options.collectionName,
  });

  const startedAt = Date.now();

  try {
    const result = await options.cloudbase
      .commonService("tcb", "2018-06-08")
      .call({
        Action: options.action,
        Param: {
          ...options.param,
          TableName: options.collectionName,
          Tag: resolvedInstance.instanceId,
        },
      });

    logNoSqlLatency(options.toolName, "cloudApiCall", {
      collectionName: options.collectionName,
      action: options.action,
      durationMs: Date.now() - startedAt,
      instanceIdSource: resolvedInstance.source,
      requestId: result?.RequestId,
    });

    return result;
  } catch (error) {
    logNoSqlLatency(options.toolName, "cloudApiError", {
      collectionName: options.collectionName,
      action: options.action,
      durationMs: Date.now() - startedAt,
      instanceIdSource: resolvedInstance.source,
      message: error instanceof Error ? error.message : String(error),
    });

    if (
      !options.instanceIdOverride &&
      resolvedInstance.cacheKey &&
      isInvalidInstanceIdError(error)
    ) {
      invalidateDatabaseInstanceIdCache({
        cacheKey: resolvedInstance.cacheKey,
      });
      logNoSqlLatency(options.toolName, "invalidateInstanceIdCache", {
        collectionName: options.collectionName,
        cacheKey: resolvedInstance.cacheKey,
      });
    }

    throw error;
  }
}

async function waitForCollectionReady({
  cloudbase,
  collectionName,
  logger,
  timeoutMs = COLLECTION_READY_TIMEOUT_MS,
  pollIntervalMs = COLLECTION_READY_POLL_INTERVAL_MS,
}: {
  cloudbase: CloudBase;
  collectionName: string;
  logger?: Logger;
  timeoutMs?: number;
  pollIntervalMs?: number;
}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastError: unknown;

  logger?.({
    type: "toolInfo",
    toolName: "writeNoSqlDatabaseStructure",
    message: "Waiting for NoSQL collection readiness after createCollection",
    collectionName,
    timeoutMs,
    pollIntervalMs,
  });

  while (Date.now() <= deadline) {
    try {
      const result =
        await cloudbase.database.checkCollectionExists(collectionName);
      logCloudBaseResult(logger, result);
      if (result.Exists) {
        logger?.({
          type: "toolInfo",
          toolName: "writeNoSqlDatabaseStructure",
          message: "NoSQL collection is ready for subsequent operations",
          collectionName,
          waitedMs: Date.now() - startedAt,
        });
        return;
      }
    } catch (error) {
      lastError = error;
    }

    if (Date.now() + pollIntervalMs > deadline) {
      break;
    }
    await delay(pollIntervalMs);
  }

  const baseMessage = `集合 ${collectionName} 创建成功后等待就绪超时 (${timeoutMs}ms)`;
  const errorMessage =
    lastError instanceof Error
      ? `${baseMessage}，最后一次检查错误: ${lastError.message}`
      : `${baseMessage}，集合仍未进入可用状态`;

  logger?.({
    type: "toolError",
    toolName: "writeNoSqlDatabaseStructure",
    message: errorMessage,
    collectionName,
    timeoutMs,
  });

  throw new Error(errorMessage);
}

export function registerDatabaseTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions,如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;
  const logger = server.logger;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // readNoSqlDatabaseStructure
  server.registerTool?.(
    "readNoSqlDatabaseStructure",
    {
      title: "读取 NoSQL 数据库结构",
      description:
        "读取 NoSQL 数据库集合与索引结构，支持列出集合、查看集合详情、列出索引以及检查索引是否存在。本工具为服务端管理工具，用于管理端查询数据库结构，不用于编写客户端代码。",
      inputSchema: {
        action: z.enum([
          "listCollections",
          "describeCollection",
          "checkCollection",
          "listIndexes",
          "checkIndex",
        ]).describe(`listCollections: 列出集合列表
describeCollection: 描述集合详情（会返回索引摘要）
checkCollection: 检查集合是否存在
listIndexes: 列出指定集合的索引列表
checkIndex: 检查指定索引是否存在`),
        limit: z
          .number()
          .optional()
          .describe("返回数量限制(listCollections 操作时可选)"),
        offset: z
          .number()
          .optional()
          .describe("偏移量(listCollections 操作时可选)"),
        collectionName: z
          .string()
          .optional()
          .describe(
            "集合名称(describeCollection、listIndexes、checkIndex 操作时必填)",
          ),
        indexName: z
          .string()
          .optional()
          .describe("索引名称(checkIndex 操作时必填)"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async ({ action, limit, offset, collectionName, indexName }) => {
      const cloudbase = await getManager();

      if (action === "listCollections") {
        const result = await cloudbase.database.listCollections({
          MgoOffset: offset,
          MgoLimit: limit,
        });
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  requestId: result.RequestId,
                  collections: result.Collections,
                  pager: result.Pager,
                  message: "获取 NoSQL 数据库集合列表成功",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === "checkCollection") {
        if (!collectionName) {
          throw new Error("检查集合时必须提供 collectionName");
        }
        const result =
          await cloudbase.database.checkCollectionExists(collectionName);
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                withCollectionName(collectionName, {
                  success: true,
                  exists: result.Exists,
                  requestId: result.RequestId,
                  message: result.Exists
                    ? "云开发数据库集合已存在"
                    : "云开发数据库集合不存在",
                }),
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === "describeCollection") {
        if (!collectionName) {
          throw new Error("查看集合详情时必须提供 collectionName");
        }
        const result =
          await cloudbase.database.describeCollection(collectionName);
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                withCollectionName(collectionName, {
                  success: true,
                  requestId: result.RequestId,
                  indexNum: result.IndexNum,
                  indexes: result.Indexes,
                  message: "获取云开发数据库集合信息成功",
                }),
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === "listIndexes") {
        if (!collectionName) {
          throw new Error("获取索引列表时必须提供 collectionName");
        }
        const result =
          await cloudbase.database.describeCollection(collectionName);
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                withCollectionName(collectionName, {
                  success: true,
                  requestId: result.RequestId,
                  indexNum: result.IndexNum,
                  indexes: result.Indexes,
                  message: "获取索引列表成功",
                }),
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === "checkIndex") {
        if (!collectionName || !indexName) {
          throw new Error("检查索引时必须提供 collectionName 和 indexName");
        }
        const result = await cloudbase.database.checkIndexExists(
          collectionName,
          indexName,
        );
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                withCollectionName(collectionName, {
                  success: true,
                  indexName,
                  exists: result.Exists,
                  requestId: result.RequestId,
                  message: result.Exists ? "索引已存在" : "索引不存在",
                }),
                null,
                2,
              ),
            },
          ],
        };
      }

      throw new Error(`不支持的操作类型: ${action}`);
    },
  );

  // writeNoSqlDatabaseStructure
  server.registerTool?.(
    "writeNoSqlDatabaseStructure",
    {
      title: "修改 NoSQL 数据库结构",
      description:
        "修改 NoSQL 数据库结构，支持创建/删除集合，以及通过 updateCollection 的 updateOptions.CreateIndexes / updateOptions.DropIndexes 添加索引和删除索引。本工具为服务端管理工具，用于管理端操作集合和索引结构，不用于编写客户端代码。",
      inputSchema: {
        action: z.enum([
          "createCollection",
          "updateCollection",
          "deleteCollection",
        ]).describe(`createCollection: 创建集合
updateCollection: 更新集合配置；添加索引请传 updateOptions.CreateIndexes，删除索引请传 updateOptions.DropIndexes
deleteCollection: 删除集合`),
        collectionName: z.string().describe("集合名称"),
        updateOptions: z
          .object({
            CreateIndexes: z
              .array(
                z.object({
                  IndexName: z.string().describe("要创建的索引名称"),
                  MgoKeySchema: z.object({
                    MgoIsUnique: z.boolean().describe("是否唯一索引"),
                    MgoIndexKeys: z.array(
                      z.object({
                        Name: z.string().describe("索引字段名"),
                        Direction: z
                          .string()
                          .describe("索引方向，通常 1 表示升序，-1 表示降序"),
                      }),
                    ).describe("索引字段列表，支持单字段或复合索引"),
                  }).describe("待创建索引的字段与约束配置"),
                }),
              )
              .optional()
              .describe("要添加的索引列表"),
            DropIndexes: z
              .array(
                z.object({
                  IndexName: z.string().describe("要删除的索引名称"),
                }),
              )
              .optional()
              .describe("要删除的索引列表"),
          })
          .optional()
          .describe(
            "更新选项(updateCollection 时使用)。CreateIndexes 用于添加索引，DropIndexes 用于删除索引。",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async ({ action, collectionName, updateOptions }) => {
      const cloudbase = await getManager();
      if (action === "createCollection") {
        const existsResult =
          await cloudbase.database.checkCollectionExists(collectionName);
        logCloudBaseResult(server.logger, existsResult);
        if (existsResult.Exists) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  withCollectionName(collectionName, {
                    success: true,
                    action,
                    requestId: existsResult.RequestId,
                    message: "集合已存在，无需重复创建",
                    exists: true,
                  }),
                  null,
                  2,
                ),
              },
            ],
          };
        }
        const result =
          await cloudbase.database.createCollection(collectionName);
        logCloudBaseResult(server.logger, result);
        await waitForCollectionReady({
          cloudbase,
          collectionName,
          logger: server.logger,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                withCollectionName(collectionName, {
                  success: true,
                  requestId: result.RequestId,
                  action,
                  message: "云开发数据库集合创建成功",
                }),
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === "updateCollection") {
        if (!updateOptions) {
          throw new Error("更新集合时必须提供 options");
        }
        const result = await cloudbase.database.updateCollection(
          collectionName,
          updateOptions,
        );
        logCloudBaseResult(server.logger, result);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                withCollectionName(collectionName, {
                  success: true,
                  requestId: result.RequestId,
                  action,
                  message: "云开发数据库集合更新成功",
                }),
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === "deleteCollection") {
        const result =
          await cloudbase.database.deleteCollection(collectionName);
        logCloudBaseResult(server.logger, result);
        const body: Record<string, unknown> = withCollectionName(
          collectionName,
          {
            success: true,
            requestId: result.RequestId,
            action,
            message:
              result.Exists === false ? "集合不存在" : "云开发数据库集合删除成功",
          },
        );
        if (result.Exists === false) {
          body.exists = false;
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(body, null, 2),
            },
          ],
        };
      }

      throw new Error(`不支持的操作类型: ${action}`);
    },
  );

  // readNoSqlDatabaseContent
  server.registerTool?.(
    "readNoSqlDatabaseContent",
    {
      title: "查询并获取 NoSQL 数据库数据记录",
      description: "查询并获取 NoSQL 数据库数据记录。⚠️ 本工具为服务端管理工具，用于管理端/运维端查询。当任务要求编写客户端应用代码时（例如「用 JS SDK 读取数据」），不应使用本工具，而应在项目代码中编写 @cloudbase/js-sdk 客户端代码（如 db.collection().where().get()）。",
      inputSchema: {
        collectionName: z.string().describe("集合名称"),
        instanceId: z
          .string()
          .optional()
          .describe("可选：显式指定数据库实例ID；未传时会自动解析并缓存"),
        query: z
          .union([z.object({}).passthrough(), z.string()])
          .optional()
          .describe("查询条件(对象或字符串,推荐对象)"),
        projection: z
          .union([z.object({}).passthrough(), z.string()])
          .optional()
          .describe("返回字段投影(对象或字符串,推荐对象)"),
        sort: z
          .union([
            z.array(
              z
                .object({
                  key: z.string().describe("sort 字段名"),
                  direction: z.number().describe("排序方向,1:升序,-1:降序"),
                })
                .passthrough(),
            ),
            z.string(),
          ])
          .optional()
          .describe(
            '排序条件，仅支持数组 [{"key":"createdAt","direction":-1}] 或对应 JSON 字符串。',
          ),
        limit: z.number().optional().describe("返回数量限制"),
        offset: z.number().optional().describe("跳过的记录数"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async ({ collectionName, instanceId, query, projection, sort, limit, offset }) => {
      const managerStartedAt = Date.now();
      const cloudbase = await getManager();
      logNoSqlLatency("readNoSqlDatabaseContent", "getManager", {
        collectionName,
        durationMs: Date.now() - managerStartedAt,
      });

      const normalizedSort = normalizeSortInput(sort);
      const result = await callNoSqlContentApi({
        toolName: "readNoSqlDatabaseContent",
        action: "QueryRecords",
        collectionName,
        cloudbase,
        cloudBaseOptions,
        instanceIdOverride: instanceId,
        param: {
          MgoQuery: toJSONString(query),
          MgoProjection: toJSONString(projection),
          MgoSort: normalizedSort,
          MgoLimit: limit ?? 100,
          MgoOffset: offset,
        },
      });
      logCloudBaseResult(server.logger, result);
      const parseStartedAt = Date.now();
      const documents = normalizeNoSqlDocuments(result.Data);
      logNoSqlLatency("readNoSqlDatabaseContent", "parseResult", {
        collectionName,
        durationMs: Date.now() - parseStartedAt,
        documentCount: documents.length,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              withCollectionName(collectionName, {
                success: true,
                requestId: result.RequestId,
                data: documents,
                total:
                  typeof result.Pager?.Total === "number"
                    ? result.Pager.Total
                    : documents.length,
                pager: result.Pager,
                message: "文档查询成功",
              }),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // writeNoSqlDatabaseContent
  server.registerTool?.(
    "writeNoSqlDatabaseContent",
    {
      title: "修改 NoSQL 数据库数据记录",
      description:
        "修改 NoSQL 数据库数据记录。⚠️ 本工具为服务端管理工具，用于管理端/运维端操作（如后台脚本、数据迁移、批量修改）。当任务要求编写客户端应用代码时（例如「用 JS SDK 登录并插入数据」、「在前端读写数据库」），不应使用本工具，而应在项目代码中编写 @cloudbase/js-sdk 客户端代码（如 app.database().collection().add()、db.collection().where().get() 等）。可按 MongoDB updateOne/updateMany 的心智模型理解：部分更新必须使用 `$set`、`$inc`、`$push` 等更新操作符；如果直接传「字段到值的普通对象」这类内容，底层会把它当作替换内容，存在覆盖整条文档的风险。更新嵌套对象中的某个字段时必须使用点号路径，例如把 `address.city` 设为 `shenzhen`；如果把整个 `address` 对象作为 `$set` 的值传入，则整个 `address` 对象会被替换，同级其他字段将丢失。若集合中的角色/档案文档会在前端通过 `db.collection(...).doc(uid)` 读取，请确保文档 `_id` 就是该 `uid`；不要用按 `uid` 条件查询再配合 `upsert=true` 的方式去更新 `users` / `profiles`，否则经常会生成一个不同的 `_id`，导致后续 `doc(uid)` 读取命中不到。",
      inputSchema: {
        action: z
          .enum(["insert", "update", "delete"])
          .describe(
            `insert: 插入数据（新增文档）\nupdate: 更新数据\ndelete: 删除数据`,
          ),
        collectionName: z.string().describe("集合名称"),
        instanceId: z
          .string()
          .optional()
          .describe("可选：显式指定数据库实例ID；未传时会自动解析并缓存"),
        documents: z
          .array(z.object({}).passthrough())
          .optional()
          .describe("要插入的文档对象数组,每个文档都是对象(insert 操作必填)"),
        query: z
          .union([z.object({}).passthrough(), z.string()])
          .optional()
          .describe("查询条件(对象或字符串,推荐对象)(update/delete 操作必填)"),
        update: z
          .union([z.object({}).passthrough(), z.string()])
          .optional()
          .describe(
            "更新内容(对象或字符串,推荐对象)(update 操作必填)。按 MongoDB 更新语义传入 MgoUpdate：部分更新请使用 `$set`、`$inc`、`$unset`、`$push` 等操作符，例如使用 `$set` 更新 `status`；不要直接传“字段到值的普通对象”，否则可能替换整条文档。更新嵌套字段时必须使用点号路径，例如通过 `$set` 更新 `address.city`；不要把整个 `address` 对象作为 `$set` 的值传入，否则会替换整个 `address` 对象。",
          ),
        isMulti: z
          .boolean()
          .optional()
          .describe("是否更新多条记录(update/delete 操作可选)"),
        upsert: z
          .boolean()
          .optional()
          .describe("是否在不存在时插入(update 操作可选)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async ({
      action,
      collectionName,
      instanceId,
      documents,
      query,
      update,
      isMulti,
      upsert,
    }) => {
      if (action === "insert") {
        if (!documents) {
          throw new Error("insert 操作时必须提供 documents");
        }
        const text = await insertDocuments({
          collectionName,
          instanceId,
          documents,
          getManager,
          logger,
          cloudBaseOptions,
        });
        return {
          content: [
            {
              type: "text",
              text,
            },
          ],
        };
      }
      if (action === "update") {
        if (!query) {
          throw new Error("update 操作时必须提供 query");
        }
        if (!update) {
          throw new Error("update 操作时必须提供 update");
        }
        const text = await updateDocuments({
          collectionName,
          instanceId,
          query,
          update,
          isMulti,
          upsert,
          getManager,
          logger,
          cloudBaseOptions,
        });
        return {
          content: [
            {
              type: "text",
              text,
            },
          ],
        };
      }
      if (action === "delete") {
        if (!query) {
          throw new Error("delete 操作时必须提供 query");
        }
        const text = await deleteDocuments({
          collectionName,
          instanceId,
          query,
          isMulti,
          getManager,
          logger,
          cloudBaseOptions,
        });
        return {
          content: [
            {
              type: "text",
              text,
            },
          ],
        };
      }

      throw new Error(`不支持的操作类型: ${action}`);
    },
  );
}

async function insertDocuments({
  collectionName,
  instanceId,
  documents,
  getManager,
  logger,
  cloudBaseOptions,
}: {
  collectionName: string;
  instanceId?: string;
  documents: object[];
  getManager: () => Promise<CloudBase>;
  logger?: Logger;
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"];
}) {
  const managerStartedAt = Date.now();
  const cloudbase = await getManager();
  logNoSqlLatency("writeNoSqlDatabaseContent", "getManager", {
    collectionName,
    action: "insert",
    durationMs: Date.now() - managerStartedAt,
  });

  const docsAsStrings = documents.map((doc) => JSON.stringify(doc));
  const result = await callNoSqlContentApi({
    toolName: "writeNoSqlDatabaseContent",
    action: "PutItem",
    collectionName,
    cloudbase,
    cloudBaseOptions,
    instanceIdOverride: instanceId,
    param: {
      MgoDocs: docsAsStrings,
    },
  });
  logCloudBaseResult(logger, result);
  return JSON.stringify(
    withCollectionName(collectionName, {
      success: true,
      requestId: result.RequestId,
      insertedIds: result.InsertedIds,
      insertedCount: Array.isArray(result.InsertedIds)
        ? result.InsertedIds.length
        : undefined,
      message: "文档插入成功",
    }),
    null,
    2,
  );
}

async function updateDocuments({
  collectionName,
  instanceId,
  query,
  update,
  isMulti,
  upsert,
  getManager,
  logger,
  cloudBaseOptions,
}: {
  collectionName: string;
  instanceId?: string;
  query: object | string;
  update: object | string;
  isMulti?: boolean;
  upsert?: boolean;
  getManager: () => Promise<CloudBase>;
  logger?: Logger;
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"];
}) {
  const managerStartedAt = Date.now();
  const cloudbase = await getManager();
  logNoSqlLatency("writeNoSqlDatabaseContent", "getManager", {
    collectionName,
    action: "update",
    durationMs: Date.now() - managerStartedAt,
  });

  const authLinkedDocWarning = buildAuthLinkedDocWarning({
    collectionName,
    query,
    upsert,
  });
  const result = await callNoSqlContentApi({
    toolName: "writeNoSqlDatabaseContent",
    action: "UpdateItem",
    collectionName,
    cloudbase,
    cloudBaseOptions,
    instanceIdOverride: instanceId,
    param: {
      MgoQuery: toJSONString(query),
      MgoUpdate: toJSONString(update),
      MgoIsMulti: isMulti,
      MgoUpsert: upsert,
    },
  });
  logCloudBaseResult(logger, result);
  return JSON.stringify(
    withCollectionName(collectionName, {
      success: true,
      requestId: result.RequestId,
      modifiedCount: result.ModifiedNum,
      matchedCount: result.MatchedNum,
      upsertedId: result.UpsertedId,
      ...(authLinkedDocWarning ? { warning: authLinkedDocWarning } : {}),
      message: authLinkedDocWarning ? `文档更新成功；${authLinkedDocWarning}` : "文档更新成功",
    }),
    null,
    2,
  );
}

function tryParseObjectLike(value: object | string): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildAuthLinkedDocWarning({
  collectionName,
  query,
  upsert,
}: {
  collectionName: string;
  query: object | string;
  upsert?: boolean;
}) {
  if (!upsert) return null;
  if (!["users", "profiles", "user_roles", "userProfiles"].includes(collectionName)) return null;
  const queryObject = tryParseObjectLike(query);
  if (!queryObject) return null;
  if (!("uid" in queryObject) && !("userId" in queryObject)) return null;
  return "若前端会用 doc(uid) 读取该集合，请改为直接创建 `_id = uid` 的文档；基于 uid 查询再 upsert 往往会生成不同的 `_id`，导致后续 doc(uid) 读取失败。";
}

async function deleteDocuments({
  collectionName,
  instanceId,
  query,
  isMulti,
  getManager,
  logger,
  cloudBaseOptions,
}: {
  collectionName: string;
  instanceId?: string;
  query: object | string;
  isMulti?: boolean;
  getManager: () => Promise<CloudBase>;
  logger?: Logger;
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"];
}) {
  const managerStartedAt = Date.now();
  const cloudbase = await getManager();
  logNoSqlLatency("writeNoSqlDatabaseContent", "getManager", {
    collectionName,
    action: "delete",
    durationMs: Date.now() - managerStartedAt,
  });

  const result = await callNoSqlContentApi({
    toolName: "writeNoSqlDatabaseContent",
    action: "DeleteItem",
    collectionName,
    cloudbase,
    cloudBaseOptions,
    instanceIdOverride: instanceId,
    param: {
      MgoQuery: toJSONString(query),
      MgoIsMulti: isMulti,
    },
  });
  logCloudBaseResult(logger, result);
  return JSON.stringify(
    withCollectionName(collectionName, {
      success: true,
      requestId: result.RequestId,
      deleted: result.Deleted,
      message: "文档删除成功",
    }),
    null,
    2,
  );
}
