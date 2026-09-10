import { z } from "zod";
import type { ExtendedMcpServer } from "../server.js";
import { t } from "../i18n/index.js";
import { isCloudMode } from "../utils/cloud-mode.js";
import { buildJsonToolResult, ToolNextStep } from "../utils/tool-result.js";
import { getGatewayBaseUrl } from "../utils/site-map.js";

const CATEGORY = "PostgreSQL storage";
const QUERY_PG_STORAGE = "queryPgStorage";

const STORAGE_ACTIONS = [
  "buckets",
  "config",
  "uploadPlan",
  "objectInfo",
  "signUpload",
  "signDownload",
  "createBucket",
] as const;

type StorageAction = (typeof STORAGE_ACTIONS)[number];

/**
 * hosted/云端模式下不可用的 action：依赖真实 bucket 名称与存储数据面，
 * MCP 只能返回实现方案，hosted 客户端无法基于其继续执行，需提前拦截。
 */
const CLOUD_MODE_UNAVAILABLE_ACTIONS: ReadonlySet<StorageAction> = new Set([
  "createBucket",
  "uploadPlan",
  "objectInfo",
]);

function ensureActionAllowedInCloudMode(args: QueryPgStorageArgs) {
  if (!isCloudMode()) {
    return undefined;
  }
  if (!CLOUD_MODE_UNAVAILABLE_ACTIONS.has(args.action)) {
    return undefined;
  }
  return buildPgStorageResult({
    success: false,
    errorCode: "CLOUD_MODE_ACTION_UNAVAILABLE",
    data: {
      action: args.action,
      cloudMode: true,
      availableActions: ["buckets", "config"],
      recommendation: t("storagePG.cloudModeRecommendation"),
    },
    message: t("storagePG.cloudModeUnavailable", { action: args.action }),
  });
}

type PgStorageObjectInput = {
  objectKey: string;
  contentType?: string;
  sizeBytes?: number;
};

type QueryPgStorageArgs = {
  action: StorageAction;
  bucket?: string;
  objectKey?: string;
  objectKeys?: string[];
  objects?: PgStorageObjectInput[];
  expiresIn?: number;
};

function buildPgStorageResult(payload: {
  success: boolean;
  data?: Record<string, unknown>;
  message: string;
  errorCode?: string;
  nextActions?: ToolNextStep[];
}) {
  return buildJsonToolResult(payload);
}

function requireBucket(args: QueryPgStorageArgs) {
  if (!args.bucket?.trim()) {
    return buildPgStorageResult({
      success: false,
      errorCode: "BUCKET_REQUIRED",
      message: t("storagePG.bucketRequired"),
    });
  }
  return undefined;
}

function normalizeObjects(args: QueryPgStorageArgs) {
  if (args.objects?.length) {
    return args.objects.map((object) => ({
      objectKey: object.objectKey,
      contentType: object.contentType ?? "application/octet-stream",
      sizeBytes: object.sizeBytes ?? null,
    }));
  }

  const objectKeys = args.objectKeys?.length
    ? args.objectKeys
    : args.objectKey
      ? [args.objectKey]
      : [];

  return objectKeys.map((objectKey) => ({
    objectKey,
    contentType: "application/octet-stream",
    sizeBytes: null,
  }));
}

function buildHttpApiPlan(server: ExtendedMcpServer, bucket: string) {
  const envId = server.cloudBaseOptions?.envId ?? "${envId}";
  const region = server.cloudBaseOptions?.region ?? "${region}";

  return {
    envId,
    region,
    bucket,
    auth: "accessToken",
    transport: "CloudBase HTTP API",
    endpointTemplate:
      "https://api.weixin.qq.com/tcb/{storageAction}?access_token={accessToken}",
    headersTemplate: {
      "content-type": "application/json",
    },
    bodyTemplate: {
      env: envId,
      bucket,
    },
  };
}

async function handleBuckets(server: ExtendedMcpServer) {
  return buildPgStorageResult({
    success: true,
    data: {
      capability: "storageManagerSdkOrHttpApi",
      envId: server.cloudBaseOptions?.envId ?? null,
      supportedActions: ["buckets", "config", "uploadPlan", "objectInfo", "createBucket"],
      note: t("storagePG.bucketsNote"),
    },
    message: t("storagePG.bucketsSuccess"),
  });
}

async function handleCreateBucket(args: QueryPgStorageArgs, server: ExtendedMcpServer) {
  if (!args.bucket?.trim()) {
    return buildPgStorageResult({
      success: false,
      errorCode: "BUCKET_REQUIRED",
      message: t("storagePG.createBucketRequired"),
    });
  }

  const bucket = args.bucket.trim();
  const envId = server.cloudBaseOptions?.envId ?? "${envId}";

  return buildPgStorageResult({
    success: true,
    data: {
      action: "createBucket",
      bucket,
      description: t("storagePG.createBucketDescription", { bucket }),
      plans: {
        sql: `INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket}', '${bucket}', false);`,
        httpApi: {
          method: "POST",
          url: `${getGatewayBaseUrl(envId)}/v1/storages/bucket/`,
          headers: {
            "Authorization": "Bearer {service_role_token}",
            "Content-Type": "application/json",
          },
          body: { name: bucket, public: false },
        },
        cli: `tcb db execute -e ${envId} --sql "INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket}', '${bucket}', false);"`,
      },
      tokenRequired: "service_role",
      tokenGuide: t("storagePG.createBucketTokenGuide"),
      nextSteps: [
        t("storagePG.createBucketNextStepA"),
        t("storagePG.createBucketNextStepB"),
        t("storagePG.createBucketNextStepC"),
      ],
    },
    message: t("storagePG.createBucketSuccess", { bucket }),
  });
}

async function handleUploadPlan(args: QueryPgStorageArgs, server: ExtendedMcpServer) {
  const missingBucket = requireBucket(args);
  if (missingBucket) return missingBucket;

  const objects = normalizeObjects(args);
  const bucket = args.bucket!;
  return buildPgStorageResult({
    success: true,
    data: {
      action: "uploadPlan",
      uploadMode: "directHttpApi",
      implementation: "use_sdk_or_http_api_in_app_code",
      ...buildHttpApiPlan(server, bucket),
      objectCount: objects.length,
      objects,
      constraints: {
        mcpDoesNotReadLocalFiles: true,
        mcpDoesNotStreamFileContent: true,
        noSignedUrlByDefault: true,
        multiFileOutputIsMetadataOnly: true,
      },
      steps: [
        t("storagePG.uploadPlanStep1"),
        t("storagePG.uploadPlanStep2"),
        t("storagePG.uploadPlanStep3"),
      ],
    },
    message: t("storagePG.uploadPlanSuccess"),
  });
}

async function handleObjectInfo(args: QueryPgStorageArgs, server: ExtendedMcpServer) {
  const missingBucket = requireBucket(args);
  if (missingBucket) return missingBucket;

  const objectKeys = normalizeObjects(args).map((object) => object.objectKey);
  return buildPgStorageResult({
    success: true,
    data: {
      action: "objectInfo",
      ...buildHttpApiPlan(server, args.bucket!),
      objectKeys,
      implementation: "use_sdk_or_http_api_in_app_code",
      mcpFileIo: false,
    },
    message: t("storagePG.objectInfoSuccess"),
  });
}

async function handleSignedUrl(args: QueryPgStorageArgs) {
  const missingBucket = requireBucket(args);
  if (missingBucket) return missingBucket;

  return buildPgStorageResult({
    success: false,
    errorCode: "SIGNED_URL_NOT_DEFAULT",
    data: {
      action: args.action,
      bucket: args.bucket,
      expiresIn: args.expiresIn ?? 900,
      recommendation: t("storagePG.signedUrlRecommendation"),
    },
    message: t("storagePG.signedUrlNotDefault"),
  });
}

export function registerPGStorageTools(server: ExtendedMcpServer) {
  server.registerTool?.(
    QUERY_PG_STORAGE,
    {
      title: "storagePG.title",
      description: "storagePG.description",
      inputSchema: {
        action: z
          .enum(STORAGE_ACTIONS)
          .describe("操作类型：buckets/config=查询存储能力摘要；createBucket=生成 bucket 创建方案（SQL/HTTP API/CLI）；uploadPlan=生成 HTTP API/SDK 上传方案；objectInfo=生成对象元信息查询方案；signUpload/signDownload=显式的一次性签名 URL 请求占位"),
        bucket: z.string().optional().describe("云存储 bucket 名称"),
        objectKey: z.string().optional().describe("单个对象 key"),
        objectKeys: z.array(z.string()).optional().describe("多个对象 key，用于对象元信息查询规划"),
        objects: z
          .array(
            z.object({
              objectKey: z.string(),
              contentType: z.string().optional(),
              sizeBytes: z.number().int().nonnegative().optional(),
            }),
          )
          .optional()
          .describe("待上传对象的元信息。文件字节内容不会通过 MCP 传递。"),
        expiresIn: z.number().int().min(60).max(86400).optional().describe("签名 URL 有效期，单位秒，范围 60 到 86400。"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async (args: QueryPgStorageArgs) => {
      const cloudModeBlock = ensureActionAllowedInCloudMode(args);
      if (cloudModeBlock) {
        return cloudModeBlock;
      }

      switch (args.action) {
        case "buckets":
        case "config":
          return handleBuckets(server);
        case "createBucket":
          return handleCreateBucket(args, server);
        case "uploadPlan":
          return handleUploadPlan(args, server);
        case "objectInfo":
          return handleObjectInfo(args, server);
        case "signUpload":
        case "signDownload":
          return handleSignedUrl(args);
        default:
          return buildPgStorageResult({
            success: false,
            errorCode: "UNSUPPORTED_ACTION",
            message: t("storagePG.unsupportedAction", { action: args.action }),
          });
      }
    },
  );
}
