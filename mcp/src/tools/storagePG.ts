import { z } from "zod";
import type { ExtendedMcpServer } from "../server.js";
import { buildJsonToolResult, ToolNextStep } from "../utils/tool-result.js";

const CATEGORY = "PostgreSQL storage";
const QUERY_PG_STORAGE = "queryPgStorage";

const STORAGE_ACTIONS = [
  "buckets",
  "config",
  "uploadPlan",
  "objectInfo",
  "signUpload",
  "signDownload",
] as const;

type StorageAction = (typeof STORAGE_ACTIONS)[number];

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
      message: "Provide bucket when querying PostgreSQL storage.",
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
      supportedActions: ["buckets", "config", "uploadPlan", "objectInfo"],
      note:
        "PG environment storage is exposed as metadata and implementation plans in MCP. Application data-plane upload/download should use SDK or HTTP API code.",
    },
    message:
      "Resolved PostgreSQL storage capability summary. Use uploadPlan for application-side upload implementation.",
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
        "Get an application-side or service-side access token.",
        "Call the CloudBase storage HTTP API or Manager SDK from application code.",
        "Upload file bytes outside MCP, then call objectInfo if metadata verification is needed.",
      ],
    },
    message:
      "Generated an HTTP API upload plan without signed URLs or file content. This keeps MCP token usage stable for multi-file uploads.",
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
    message:
      "Generated an object metadata query plan. Use application code or service code for actual storage data-plane calls.",
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
      recommendation: "Use queryPgStorage(action=uploadPlan) and HTTP API/SDK application code for multi-file flows.",
    },
    message:
      "Signed URL generation is intentionally not the default PG storage path because multi-file signed outputs waste tokens. Use uploadPlan unless a delegated one-off upload/download is explicitly required.",
  });
}

export function registerPGStorageTools(server: ExtendedMcpServer) {
  server.registerTool?.(
    QUERY_PG_STORAGE,
    {
      title: "查询 PostgreSQL 环境云存储能力和上传方案",
      description:
        "查询 CloudBase PostgreSQL 环境下的云存储能力。返回 bucket/config 能力摘要、对象信息查询方案，以及基于 HTTP API 或 SDK 的上传实现方案；不会读取本地文件，也不会默认输出大量签名 URL。",
      inputSchema: {
        action: z
          .enum(STORAGE_ACTIONS)
          .describe("操作类型：buckets/config=查询存储能力摘要；uploadPlan=生成 HTTP API/SDK 上传方案；objectInfo=生成对象元信息查询方案；signUpload/signDownload=显式的一次性签名 URL 请求占位"),
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
      switch (args.action) {
        case "buckets":
        case "config":
          return handleBuckets(server);
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
            message: `Unsupported PostgreSQL storage action: ${args.action}`,
          });
      }
    },
  );
}
