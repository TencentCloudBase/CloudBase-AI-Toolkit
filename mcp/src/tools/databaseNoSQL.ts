import CloudBase from "@cloudbase/manager-node";
import { z } from "zod";
import {
  getDatabaseInstanceId,
  getCloudBaseManager,
  getEnvId,
  invalidateDatabaseInstanceIdCache,
  logCloudBaseResult,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { Logger } from "../types.js";
import { debug } from "../utils/logger.js";
import { t } from "../i18n/index.js";

const CATEGORY = "NoSQL database";
const COLLECTION_READY_TIMEOUT_MS = 10000;
const COLLECTION_READY_POLL_INTERVAL_MS = 500;
/** Default page size for QueryRecords (unchanged; overrun tuning is a separate track). */
const QUERY_RECORDS_DEFAULT_LIMIT = 100;
/** Cloud API MgoLimit `lte` upper bound (aligned with ListTables / SDK limit docs). */
const QUERY_RECORDS_MAX_LIMIT = 1000;

const PROJECTION_EXAMPLE = '{"_id":1,"name":1,"createdAt":1}';
const PROJECTION_EXCLUDE_EXAMPLE = '{"password":0}';
const projectionGuidance = () =>
  t("databaseNoSQL.projection.guidance", {
    example: PROJECTION_EXAMPLE,
    excludeExample: PROJECTION_EXCLUDE_EXAMPLE,
  });

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
    t("databaseNoSQL.sort.directionInvalid", { value: String(value) }),
  );
}

function normalizeSortItem(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(t("databaseNoSQL.sort.itemInvalid"));
  }

  const { key, direction } = value as {
    key?: unknown;
    direction?: unknown;
  };

  if (typeof key !== "string" || key.trim() === "") {
    throw new Error(t("databaseNoSQL.sort.keyRequired"));
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
      throw new Error(t("databaseNoSQL.sort.jsonRequired"));
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error(t("databaseNoSQL.sort.arrayInvalid"));
  }

  if (parsed.length === 0) {
    return undefined;
  }

  return JSON.stringify(parsed.map((item) => normalizeSortItem(item)));
}

function isProjectionFlag(value: unknown): value is 0 | 1 | boolean {
  return value === 0 || value === 1 || value === true || value === false;
}

function normalizeProjectionInput(projection: unknown): string | undefined {
  if (projection === undefined || projection === null) {
    return undefined;
  }

  let parsed = projection;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(
        t("databaseNoSQL.projection.invalidJson", {
          guidance: projectionGuidance(),
        }),
      );
    }
  }

  if (Array.isArray(parsed)) {
    throw new Error(
      t("databaseNoSQL.projection.arrayUnsupported", {
        example: PROJECTION_EXAMPLE,
        guidance: projectionGuidance(),
      }),
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      t("databaseNoSQL.projection.objectRequired", {
        example: PROJECTION_EXAMPLE,
        guidance: projectionGuidance(),
      }),
    );
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    return undefined;
  }

  let hasInclude = false;
  let hasExclude = false;
  const normalized: Record<string, 0 | 1> = {};

  for (const [key, value] of entries) {
    if (typeof key !== "string" || key.trim() === "") {
      throw new Error(
        t("databaseNoSQL.projection.keyRequired", {
          guidance: projectionGuidance(),
        }),
      );
    }

    if (!isProjectionFlag(value)) {
      throw new Error(
        t("databaseNoSQL.projection.invalidFlag", {
          key,
          value: JSON.stringify(value),
          example: PROJECTION_EXAMPLE,
          guidance: projectionGuidance(),
        }),
      );
    }

    const flag = value === true || value === 1 ? 1 : 0;
    normalized[key] = flag;

    if (key === "_id") {
      continue;
    }
    if (flag === 1) {
      hasInclude = true;
    } else {
      hasExclude = true;
    }
  }

  if (hasInclude && hasExclude) {
    throw new Error(
      t("databaseNoSQL.projection.mixedModes", {
        example: PROJECTION_EXAMPLE,
        excludeExample: PROJECTION_EXCLUDE_EXAMPLE,
      }),
    );
  }

  return JSON.stringify(normalized);
}

function normalizeQueryLimit(limit: unknown): number {
  if (limit === undefined || limit === null) {
    return QUERY_RECORDS_DEFAULT_LIMIT;
  }

  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    throw new Error(
      t("databaseNoSQL.limit.notNumber", {
        max: QUERY_RECORDS_MAX_LIMIT,
        fallback: QUERY_RECORDS_DEFAULT_LIMIT,
      }),
    );
  }

  if (!Number.isInteger(limit)) {
    throw new Error(
      t("databaseNoSQL.limit.notInteger", {
        max: QUERY_RECORDS_MAX_LIMIT,
        value: limit,
      }),
    );
  }

  if (limit < 1 || limit > QUERY_RECORDS_MAX_LIMIT) {
    throw new Error(
      t("databaseNoSQL.limit.outOfRange", {
        value: limit,
        max: QUERY_RECORDS_MAX_LIMIT,
      }),
    );
  }

  return limit;
}

function enhanceQueryRecordsError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (/Query projection.*illegal|projection entered in the request is illegal/i.test(message)) {
    throw new Error(
      t("databaseNoSQL.queryError.illegalProjection", {
        message,
        guidance: projectionGuidance(),
      }),
    );
  }

  if (/MgoLimit.*lte|Field validation for 'MgoLimit' failed on the 'lte'/i.test(message)) {
    throw new Error(
      t("databaseNoSQL.queryError.mgoLimitExceeded", {
        message,
        max: QUERY_RECORDS_MAX_LIMIT,
      }),
    );
  }

  throw error instanceof Error ? error : new Error(message);
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
  // 直接使用 EnvId 替代 Tag，无需通过 DescribeEnvs 获取 instanceId
  const envId = await getEnvId(options.cloudBaseOptions);

  const startedAt = Date.now();

  try {
    const result = await options.cloudbase
      .commonService("tcb", "2018-06-08")
      .call({
        Action: options.action,
        Param: {
          ...options.param,
          TableName: options.collectionName,
          EnvId: envId,
        },
      });

    logNoSqlLatency(options.toolName, "cloudApiCall", {
      collectionName: options.collectionName,
      action: options.action,
      durationMs: Date.now() - startedAt,
      instanceIdSource: "envId",
      requestId: result?.RequestId,
    });

    // 检查 API 层返回的业务错误（如集合不存在）并抛出
    if (result?.Error) {
      const err = new Error(`${result.Error.Code}: ${result.Error.Message}`);
      (err as any).code = result.Error.Code;
      (err as any).requestId = result.RequestId;
      throw err;
    }

    return result;
  } catch (error) {
    logNoSqlLatency(options.toolName, "cloudApiError", {
      collectionName: options.collectionName,
      action: options.action,
      durationMs: Date.now() - startedAt,
      instanceIdSource: "envId",
      message: error instanceof Error ? error.message : String(error),
    });

    // 错误指引与 RequestId 归一统一在 utils/tool-wrapper 的工具错误出口处理，
    // 这里不再单独翻译，避免每个工具各做一份、且只覆盖本文件。
    throw error;
  }
}

async function waitForCollectionReady({
  cloudbase,
  collectionName,
  logger,
  cloudBaseOptions,
  timeoutMs = COLLECTION_READY_TIMEOUT_MS,
  pollIntervalMs = COLLECTION_READY_POLL_INTERVAL_MS,
}: {
  cloudbase: CloudBase;
  collectionName: string;
  logger?: Logger;
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"];
  timeoutMs?: number;
  pollIntervalMs?: number;
}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastError: unknown;

  logger?.({
    type: "toolInfo",
    toolName: "writeNoSqlDatabaseStructure",
    message: t("databaseNoSQL.collectionReady.waiting"),
    collectionName,
    timeoutMs,
    pollIntervalMs,
  });

  while (Date.now() <= deadline) {
    try {
      // 用 PutItem 探测集合是否真正就绪（DescribeTable 可能误报），插入一个空占位文档
      // 如果成功，立即删除该文档；如果仍 ResourceNotFound，继续等待
      const envId = await getEnvId(cloudBaseOptions);
      const probeDoc = JSON.stringify({ _readyProbe: true, _ts: Date.now() });
      const probeResult = await cloudbase.commonService("tcb", "2018-06-08").call({
        Action: "PutItem",
        Param: {
          EnvId: envId,
          TableName: collectionName,
          MgoDocs: [probeDoc],
        },
      });
      logCloudBaseResult(logger, probeResult);
      if (probeResult?.Error) {
        // 集合还未就绪，继续轮询
        throw new Error(probeResult.Error.Message);
      }
      // 集合就绪，清理探测文档
      if (Array.isArray(probeResult?.InsertedIds) && probeResult.InsertedIds.length > 0) {
        try {
          await cloudbase.commonService("tcb", "2018-06-08").call({
            Action: "DeleteItem",
            Param: {
              EnvId: envId,
              TableName: collectionName,
              MgoQuery: JSON.stringify({ _readyProbe: true }),
              MgoIsMulti: true,
            },
          });
        } catch {
          // 清理失败不影响主流程
        }
      }
      logger?.({
        type: "toolInfo",
        toolName: "writeNoSqlDatabaseStructure",
        message: t("databaseNoSQL.collectionReady.ready"),
        collectionName,
        waitedMs: Date.now() - startedAt,
      });
      return;
    } catch (error) {
      lastError = error;
    }

    if (Date.now() + pollIntervalMs > deadline) {
      break;
    }
    await delay(pollIntervalMs);
  }

  const errorMessage =
    lastError instanceof Error
      ? t("databaseNoSQL.collectionReady.timeoutWithLastError", {
          collection: collectionName,
          timeoutMs,
          reason: lastError.message,
        })
      : t("databaseNoSQL.collectionReady.timeoutStillUnavailable", {
          collection: collectionName,
          timeoutMs,
        });

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
      title: "databaseNoSQL.readStructure.title",
      description: "databaseNoSQL.readStructure.description",
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
        const envId = await getEnvId(server.cloudBaseOptions);
        const result = await cloudbase.commonService("tcb", "2018-06-08").call({
          Action: "ListTables",
          Param: {
            EnvId: envId,
            MgoOffset: offset ?? 0,
            MgoLimit: limit ?? 100,
          },
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
                  collections: result.Tables,
                  pager: result.Pager,
                  message: t("databaseNoSQL.readStructure.listed"),
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
          throw new Error(t("databaseNoSQL.readStructure.collectionRequiredCheck"));
        }
        const envId = await getEnvId(server.cloudBaseOptions);
        let exists = false;
        let requestId = "";
        try {
          const result = await cloudbase.commonService("tcb", "2018-06-08").call({
            Action: "DescribeTable",
            Param: { EnvId: envId, TableName: collectionName },
          });
          exists = true;
          requestId = result?.RequestId ?? "";
        } catch (e: any) {
          // DescribeTable 失败即集合不存在
          requestId = e?.requestId ?? "";
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                withCollectionName(collectionName, {
                  success: true,
                  exists,
                  requestId,
                  message: exists
                    ? t("databaseNoSQL.readStructure.collectionExists")
                    : t("databaseNoSQL.readStructure.collectionNotExists"),
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
          throw new Error(t("databaseNoSQL.readStructure.collectionRequiredDescribe"));
        }
        const envId = await getEnvId(server.cloudBaseOptions);
        const result = await cloudbase.commonService("tcb", "2018-06-08").call({
          Action: "DescribeTable",
          Param: { EnvId: envId, TableName: collectionName },
        });
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
                  message: t("databaseNoSQL.readStructure.described"),
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
          throw new Error(t("databaseNoSQL.readStructure.collectionRequiredIndexes"));
        }
        const envId = await getEnvId(server.cloudBaseOptions);
        const result = await cloudbase.commonService("tcb", "2018-06-08").call({
          Action: "DescribeTable",
          Param: { EnvId: envId, TableName: collectionName },
        });
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
                  message: t("databaseNoSQL.readStructure.indexesListed"),
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
          throw new Error(t("databaseNoSQL.readStructure.indexRequired"));
        }
        const envId = await getEnvId(server.cloudBaseOptions);
        let exists = false;
        let requestId = "";
        try {
          const result = await cloudbase.commonService("tcb", "2018-06-08").call({
            Action: "DescribeTable",
            Param: { EnvId: envId, TableName: collectionName },
          });
          requestId = result?.RequestId ?? "";
          const indexes = result?.Indexes ?? result?.IndexNum ? result?.Indexes : [];
          exists = Array.isArray(indexes) && indexes.some((idx: any) => idx.IndexName === indexName);
        } catch (e: any) {
          requestId = e?.requestId ?? "";
        }
        logCloudBaseResult(server.logger, { RequestId: requestId });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                withCollectionName(collectionName, {
                  success: true,
                  indexName,
                  exists,
                  requestId,
                  message: exists
                    ? t("databaseNoSQL.readStructure.indexExists")
                    : t("databaseNoSQL.readStructure.indexNotExists"),
                }),
                null,
                2,
              ),
            },
          ],
        };
      }

      throw new Error(t("databaseNoSQL.unsupportedAction", { action }));
    },
  );

  // writeNoSqlDatabaseStructure
  server.registerTool?.(
    "writeNoSqlDatabaseStructure",
    {
      title: "databaseNoSQL.writeStructure.title",
      description: "databaseNoSQL.writeStructure.description",
      inputSchema: {
        action: z.enum([
          "createCollection",
          "updateCollection",
          "deleteCollection",
        ]).describe(`createCollection: 创建集合
updateCollection: 更新集合配置；添加索引请传 updateOptions.CreateIndexes，删除索引请传 updateOptions.DropIndexes
deleteCollection: 删除集合`),
        collectionName: z
          .string()
          .trim()
          .min(1, "collectionName 不能为空")
          .describe("集合名称"),
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
        // 检查集合是否存在 - 使用 commonService 避免 SDK lazyInit → DescribeEnvs
        const envId = await getEnvId(server.cloudBaseOptions);
        let collectionExists = false;
        let existsRequestId = "";
        try {
          const descResult = await cloudbase.commonService("tcb", "2018-06-08").call({
            Action: "DescribeTable",
            Param: { EnvId: envId, TableName: collectionName },
          });
          if (descResult?.Error) {
            // 集合不存在（ResourceNotFound）或其他错误，继续创建
            existsRequestId = descResult.RequestId ?? "";
          } else {
            collectionExists = true;
            existsRequestId = descResult?.RequestId ?? "";
          }
        } catch (e: any) {
          existsRequestId = e?.requestId ?? "";
        }
        if (collectionExists) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  withCollectionName(collectionName, {
                    success: true,
                    action,
                    requestId: existsRequestId,
                    message: t("databaseNoSQL.writeStructure.alreadyExists"),
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
          await cloudbase.commonService("tcb", "2018-06-08").call({
            Action: "CreateTable",
            Param: {
              EnvId: await getEnvId(server.cloudBaseOptions),
              TableName: collectionName,
            },
          });
        logCloudBaseResult(server.logger, result);
        await waitForCollectionReady({
          cloudbase,
          collectionName,
          logger: server.logger,
          cloudBaseOptions: server.cloudBaseOptions,
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
                  message: t("databaseNoSQL.writeStructure.created"),
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
          throw new Error(t("databaseNoSQL.writeStructure.optionsRequired"));
        }
        const result = await cloudbase.commonService("tcb", "2018-06-08").call({
          Action: "UpdateTable",
          Param: {
            EnvId: await getEnvId(server.cloudBaseOptions),
            TableName: collectionName,
            ...updateOptions,
          },
        });
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
                  message: t("databaseNoSQL.writeStructure.updated"),
                }),
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === "deleteCollection") {
        try {
          const result =
            await cloudbase.commonService("tcb", "2018-06-08").call({
              Action: "DeleteTable",
              Param: {
                EnvId: await getEnvId(server.cloudBaseOptions),
                TableName: collectionName,
              },
            });
          logCloudBaseResult(server.logger, result);
          const body: Record<string, unknown> = withCollectionName(
            collectionName,
            {
              success: true,
              requestId: result.RequestId,
              action,
              message:
                result.Exists === false
                  ? t("databaseNoSQL.writeStructure.notExists")
                  : t("databaseNoSQL.writeStructure.deleted"),
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
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/parameter invalid|invalid parameter|param(eter)?\s+invalid/i.test(message)) {
            throw new Error(
              t("databaseNoSQL.writeStructure.deleteInvalidParam", {
                collectionName,
                message,
              }),
            );
          }
          throw error;
        }
      }

      throw new Error(t("databaseNoSQL.unsupportedAction", { action }));
    },
  );

  // readNoSqlDatabaseContent
  server.registerTool?.(
    "readNoSqlDatabaseContent",
    {
      title: "databaseNoSQL.readContent.title",
      description: "databaseNoSQL.readContent.description",
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
          .describe(
            `返回字段投影，仅支持对象或对应 JSON 字符串，值只能是 1/0/true/false。` +
              `合法示例：${PROJECTION_EXAMPLE}（包含）或 ${PROJECTION_EXCLUDE_EXAMPLE}（排除）。` +
              `不要传 ["name","age"] 这类字段数组，也不要混用包含与排除（_id 除外）。`,
          ),
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
        limit: z
          .number()
          .optional()
          .describe(
            `返回数量限制，整数，范围 1-${QUERY_RECORDS_MAX_LIMIT}，默认 ${QUERY_RECORDS_DEFAULT_LIMIT}。` +
              `超过 ${QUERY_RECORDS_MAX_LIMIT} 会被 Cloud API MgoLimit lte 校验拒绝；请用 offset 分页。`,
          ),
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
      const normalizedProjection = normalizeProjectionInput(projection);
      const normalizedLimit = normalizeQueryLimit(limit);

      try {
        const result = await callNoSqlContentApi({
          toolName: "readNoSqlDatabaseContent",
          action: "QueryRecords",
          collectionName,
          cloudbase,
          cloudBaseOptions,
          instanceIdOverride: instanceId,
          param: {
            MgoQuery: toJSONString(query),
            MgoProjection: normalizedProjection,
            MgoSort: normalizedSort,
            MgoLimit: normalizedLimit,
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
                  message: t("databaseNoSQL.readContent.success"),
                }),
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        enhanceQueryRecordsError(error);
      }
    },
  );

  // writeNoSqlDatabaseContent
  server.registerTool?.(
    "writeNoSqlDatabaseContent",
    {
      title: "databaseNoSQL.writeContent.title",
      description: "databaseNoSQL.writeContent.description",
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
            `更新内容(对象或字符串,推荐对象)(update 操作必填)。按 MongoDB 更新语义传入 MgoUpdate：部分更新请使用 \`$set\`、\`$inc\`、\`$unset\`、\`$push\` 等操作符，例如使用 \`$set\` 更新 \`status\`；不要直接传"字段到值的普通对象"，否则可能替换整条文档。

⚠️ 嵌套字段必须用点号路径（如 \`shipping.city\`），禁止整对象替换：
- ❌ 错误：{ "$set": { "shipping": { "city": "guangzhou" } } } — shipping 被整块替换，原有 address/province 等字段全部丢失
- ✅ 正确：{ "$set": { "shipping.city": "guangzhou" } } — 仅更新 city，shipping 下其他字段保留`,
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
          throw new Error(t("databaseNoSQL.writeContent.documentsRequired"));
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
          throw new Error(t("databaseNoSQL.writeContent.queryRequiredUpdate"));
        }
        if (!update) {
          throw new Error(t("databaseNoSQL.writeContent.updateRequired"));
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
          throw new Error(t("databaseNoSQL.writeContent.queryRequiredDelete"));
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

      throw new Error(t("databaseNoSQL.unsupportedAction", { action }));
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
      message: t("databaseNoSQL.writeContent.inserted"),
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
      message: authLinkedDocWarning
        ? t("databaseNoSQL.writeContent.updatedWithWarning", {
            warning: authLinkedDocWarning,
          })
        : t("databaseNoSQL.writeContent.updated"),
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
  return t("databaseNoSQL.writeContent.authLinkedDocWarning");
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
      message: t("databaseNoSQL.writeContent.deleted"),
    }),
    null,
    2,
  );
}
