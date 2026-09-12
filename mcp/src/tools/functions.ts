import { z } from "zod";
import {
  getCloudBaseManager,
  getEnvId,
  logCloudBaseResult,
  probeCamCapabilityForLogin,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { isCloudMode } from "../utils/cloud-mode.js";
import { resolveGatewayAccessUrls } from "../utils/gateway-access-urls.js";
import { jsonContent } from "../utils/json-content.js";
import { debug } from "../utils/logger.js";
import { isToolPayloadError, throwToolPayloadError } from "../utils/tool-result.js";
import {
  DEPLOY_TASK_NOT_FOUND_ERROR_CODE,
  describeFunctionDeployTask,
  executeFunctionDeployWithProgress,
  getFunctionDeployTask,
  resolveRegistryCredential,
  serializeFunctionDeployTask,
  startFunctionDeployTask,
  type FunctionDeployManager,
} from "./function-deploy.js";
import {
  FUNCTION_DEPLOY_CONFIG_SCHEMA,
  FUNCTION_IMAGE_BUILD_SCHEMA,
  FUNCTION_IMAGE_CONFIG_COMMON_FIELDS,
  FUNCTION_IMAGE_LOCAL_FALLBACKS,
  resolveEffectiveImageType,
} from "./function-deploy-schema.js";
import {
  buildFunctionUpdatingPayload,
  getErrorMessage,
  isFunctionUpdatingError,
  waitUntilFunctionActive,
} from "./function-updating.js";
import { t } from "../i18n/index.js";

import { IEnvVariable } from "@cloudbase/manager-node/types/function/types.js";
import { existsSync } from "fs";
import path from "path";

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

export const ALL_SUPPORTED_RUNTIMES = Object.values(SUPPORTED_RUNTIMES).flat();
export const DEFAULT_RUNTIME = "Nodejs18.15";

export const RECOMMENDED_RUNTIMES = {
  nodejs: "Nodejs18.15",
  python: "Python3.9",
  php: "Php7.4",
  java: "Java11",
  golang: "Golang1",
} as const;

export const SUPPORTED_NODEJS_RUNTIMES = SUPPORTED_RUNTIMES.nodejs;
export const DEFAULT_NODEJS_RUNTIME = DEFAULT_RUNTIME;

export function formatRuntimeList(): string {
  return Object.entries(SUPPORTED_RUNTIMES)
    .map(([lang, runtimes]) => {
      const capitalizedLang = lang.charAt(0).toUpperCase() + lang.slice(1);
      return `  ${capitalizedLang}: ${runtimes.join(", ")}`;
    })
    .join("\n");
}

export const SUPPORTED_TRIGGER_TYPES = [
  "timer",
] as const;

export type TriggerType = (typeof SUPPORTED_TRIGGER_TYPES)[number];

export const TRIGGER_CONFIG_EXAMPLES = {
  timer: {
    description:
      "Timer trigger configuration using cron expression format: second minute hour day month week year",
    examples: [
      "0 0 2 1 * * *",
      "0 30 9 * * * *",
      "0 0 12 * * * *",
      "0 0 0 1 1 * *",
    ],
  },
};

export const QUERY_FUNCTION_ACTIONS = [
  "listFunctions",
  "getFunctionDetail",
  "listFunctionLogs",
  "getFunctionLogDetail",
  "listFunctionLayers",
  "listLayers",
  "listLayerVersions",
  "getLayerVersionDetail",
  "listFunctionTriggers",
  "getFunctionDownloadUrl",
  "getFunctionDeployStatus",
] as const;

export const MANAGE_FUNCTION_ACTIONS = [
  "createFunction",
  "updateFunctionCode",
  "updateFunctionConfig",
  "invokeFunction",
  "deleteFunction",
  "createFunctionTrigger",
  "deleteFunctionTrigger",
  "createLayerVersion",
  "deleteLayerVersion",
  "attachLayer",
  "detachLayer",
  "updateFunctionLayers",
  "incrementalDeployFunction",  // 增量部署，需通过 pluginOptions.functions 注入实现
] as const;

type QueryFunctionsAction = (typeof QUERY_FUNCTION_ACTIONS)[number];
type ManageFunctionsAction = (typeof MANAGE_FUNCTION_ACTIONS)[number];

type FunctionLayerInput = {
  LayerName: string;
  LayerVersion: number;
};

type FunctionImageConfigInput = {
  imageType?: "enterprise" | "personal";
  imageUri: string;
  registryId?: string;
  command?: string;
  args?: string;
  entryPoint?: string;
  imagePort?: number;
  containerImageAccelerate?: boolean;
};

type FunctionToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
  errorCode?: string;
  retryAfterSeconds?: number;
  nextActions?: Array<{
    tool: string;
    action: string;
    reason: string;
    suggested_args?: Record<string, unknown>;
  }>;
  /** Soft advisory messages; never blocks the operation. */
  warnings?: string[];
};

/** Layer soft-warn copy — account-scoped SCF LayerName guidance (no hard fail). */
export const LAYER_SOFT_WARN = {
  createNameFormat: (envId: string) =>
    t("functions.layerWarn.createNameFormat", { envId }),
  get deleteVersion(): string {
    return t("functions.layerWarn.deleteVersion");
  },
  get bindShared(): string {
    return t("functions.layerWarn.bindShared");
  },
  get accountLevelView(): string {
    return t("functions.layerWarn.accountLevelView");
  },
};

export function layerNameIncludesEnvId(
  layerName: string,
  envId: string | undefined,
): boolean {
  if (!envId) return true;
  return layerName.includes(envId);
}

export function buildCreateLayerNameWarning(
  layerName: string,
  envId: string | undefined,
): string | undefined {
  if (!envId || layerNameIncludesEnvId(layerName, envId)) {
    return undefined;
  }
  return LAYER_SOFT_WARN.createNameFormat(envId);
}

type QueryFunctionsInput = {
  action: QueryFunctionsAction;
  functionName?: string;
  limit?: number;
  offset?: number;
  codeSecret?: string;
  revealEnvValues?: boolean;
  startTime?: string;
  endTime?: string;
  requestId?: string;
  qualifier?: string;
  runtime?: string;
  searchKey?: string;
  layerName?: string;
  layerVersion?: number;
  taskId?: string;
};

type ManageFunctionsInput = {
  action: ManageFunctionsAction;
  func?: Record<string, unknown>;
  functionRootPath?: string;
  force?: boolean;
  functionName?: string;
  zipFile?: string;
  handler?: string;
  timeout?: number;
  envVariables?: Record<string, string>;
  vpc?: {
    vpcId: string;
    subnetId: string;
  };
  params?: Record<string, unknown>;
  triggers?: Array<{
    name: string;
    type: TriggerType;
    config: string;
  }>;
  triggerName?: string;
  layerName?: string;
  layerVersion?: number;
  contentPath?: string;
  base64Content?: string;
  runtimes?: string[];
  description?: string;
  licenseInfo?: string;
  layers?: Array<{
    layerName?: string;
    layerVersion?: number;
    LayerName?: string;
    LayerVersion?: number;
  }>;
  codeSecret?: string;
  confirm?: boolean;
  incrementalFile?: string;
  imageConfig?: FunctionImageConfigInput;
  dryRun?: boolean;
  wait?: boolean;
  autoGrant?: boolean;
};

/** 环境变量脱敏后的占位值（不保留任何明文片段）。 */
export const MASKED_ENV_VALUE = "***";

/**
 * 对 getFunctionDetail 返回的 Environment.Variables 做脱敏：
 * 保留 Key 与原始值长度（ValueLength），Value 置为占位符。
 * 用于默认工具返回与日志落盘，避免明文进入模型上下文 / 持久化日志。
 */
export function maskFunctionDetailEnvValues<
  T extends { Environment?: { Variables?: IEnvVariable[] } | null },
>(detail: T): T {
  const variables = detail?.Environment?.Variables;
  if (!Array.isArray(variables) || variables.length === 0) {
    return detail;
  }
  return {
    ...detail,
    Environment: {
      ...detail.Environment,
      Variables: variables.map((item) => ({
        ...item,
        Value: MASKED_ENV_VALUE,
        ...(typeof item.Value === "string"
          ? { ValueLength: item.Value.length }
          : {}),
      })),
    },
  } as T;
}

const VPC_SCHEMA = z.object({  vpcId: z
    .string()
    .describe(
      "VPC ID from the real database/network console (e.g. vpc-xxxxxxxx). Required for non-native TCP DB access. Do NOT invent or use placeholders.",
    ),
  subnetId: z
    .string()
    .describe(
      "Subnet ID in the same VPC as the private DB endpoint (e.g. subnet-xxxxxxxx). Do NOT invent or use placeholders.",
    ),
});

// 镜像部署值，对应 SCF Runtime=CustomImage
export const CUSTOM_IMAGE_RUNTIME = "CustomImage";

// HTTP 函数镜像部署配置，对应 Manager SDK 的 IFunctionImageConfig（camelCase）。
// 用于 zip→COS→CloudApp custom 构建→TCR→SCF 镜像部署链路的「阶段 B」：基于已推送到 TCR 的镜像创建/更新函数。
/**
 * manageFunctions 对外暴露的 imageConfig 入参 schema。
 *
 * 公共字段直接展开 FUNCTION_IMAGE_CONFIG_COMMON_FIELDS（唯一定义处），这里只补三个
 * 按 buildStrategy 分叉的字段。曾经这里维护过一份独立的扁平副本，结果与部署侧的
 * strict 联合漂移：commandList/argsList 只存在于部署侧，工具入参收到后被 z.object
 * 默认的 strip 静默丢弃；imagePort 这边写成任意 number 且描述称 Job 型填 -1，部署侧
 * 却是 z.literal(9000)（SDK 契约同样注明「仅允许 9000」），照描述填就会撞上难懂的
 * 校验错误。共用同一份字段定义即可从根上消除这类漂移。
 *
 * strict：未知字段直接报错，而不是被静默丢弃后一路沉默到部署行为与预期不符。
 */
const IMAGE_CONFIG_SCHEMA = z
  .object({
    ...FUNCTION_IMAGE_CONFIG_COMMON_FIELDS,
    imageUri: z
      .string()
      .optional()
      .describe(
        "完整镜像地址（必须含 tag），格式 {domain}/{namespace}/{image}:{tag}，" +
          "例如 ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001。不要使用 :latest。" +
          "buildStrategy=image（已有镜像）时必填；" +
          "buildStrategy=cloud/local 可以不填：镜像地址由构建流程产出并回传；" +
          "目标仓库由 build.repository/build.namespace 决定，显式提供时优先使用你提供的配置，" +
          "省略时由 manager-node 用默认值自动补齐并创建/复用（namespace 默认 envId、repository 默认函数名）。",
      ),
    build: FUNCTION_IMAGE_BUILD_SCHEMA.optional().describe(
      "镜像构建目标。buildStrategy=cloud（云端构建）或 local（本地 Docker 构建）时使用；" +
        "buildStrategy=image（已有镜像）不填。" +
        "cloud/local 下 build 非必填：缺省仓库坐标可自动补齐（namespace 默认 envId、repository 默认函数名），" +
        "仅需指定构建细节或个人版 build.registryCredential 等字段时才填。",
    ),
    localFallback: z
      .enum(FUNCTION_IMAGE_LOCAL_FALLBACKS)
      .optional()
      .describe("buildStrategy=local 时本地构建不可用的处理方式，默认 error。"),
  })
  .strict();

const SEVEN_FIELD_CRON_REGEX = /^\s*\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s*$/;

export function validateTimerCron(config: string): string {
  const trimmed = config.trim();
  const fields = trimmed.split(/\s+/);
  if (fields.length === 5) {
    throw new Error(t("functions.timerCron.5Fields", { cron: trimmed }));
  }
  if (fields.length < 7) {
    throw new Error(
      t("functions.timerCron.fewFields", { fieldCount: fields.length }),
    );
  }
  return trimmed;
}

const TRIGGER_SCHEMA = z.object({
  name: z.string().describe("触发器名称"),
  type: z.enum(SUPPORTED_TRIGGER_TYPES).describe("触发器类型"),
  config: z
    .string()
    .describe(
      "触发器配置。timer 必须使用 CloudBase 7 段 cron 格式：秒 分 时 日 月 星期 年。" +
        "⚠️ 不支持标准 5 段 cron（如 */5 * * * * 是错误的）。" +
        "正确示例：0 */5 * * * * *（每5分钟）、0 0 2 1 * * *（每月1号2点）、0 30 9 * * * *（每天9:30）",
    )
    .refine(
      (val) => SEVEN_FIELD_CRON_REGEX.test(val),
      {
        message: t("functions.timerCron.refine"),
      },
    ),
});

const CREATE_FUNCTION_SCHEMA = z.object({
  name: z.string().describe("函数名称"),
  type: z.enum(["Event", "HTTP"]).optional().describe("函数类型"),
  protocolType: z.enum(["WS"]).optional().describe(
    "HTTP 函数访问协议，当前仅支持 WebSockets，取值为 WS（配合 protocolParams.wsParams 使用）。普通 HTTP 函数不要传此字段；传其他值（如 HTTP）会报 InvalidParameterValue.ProtocolType。",
  ),
  protocolParams: z
    .object({
      wsParams: z
        .object({
          idleTimeOut: z.number().optional().describe("WebSocket 空闲超时时间（秒）"),
        })
        .optional(),
    })
    .optional(),
  instanceConcurrencyConfig: z
    .object({
      dynamicEnabled: z.boolean().optional(),
      maxConcurrency: z.number().optional(),
    })
    .optional(),
  timeout: z.number().optional().describe("函数超时时间"),
  envVariables: z
    .record(z.string())
    .optional()
    .describe(
      "环境变量。若包含 DATABASE_URL / MYSQL_* / POSTGRES_* / REDIS_* 等传统 TCP 连库变量，必须同时配置 vpc（vpcId+subnetId），且 ID 必须来自真实库/网络信息，禁止猜测。原生 app.rdb()/app.database() 不需要 VPC。",
    ),
  vpc: VPC_SCHEMA.optional().describe(
    "私有网络配置（出网）。非原生 SDK、用 TCP 访问 VPC 内 MySQL/PostgreSQL/Redis 时必填。vpcId/subnetId 必须与数据库内网 VPC 一致；未知时先查控制台或询问用户，禁止填占位符。",
  ),
  runtime: z
    .string()
    .optional()
    .describe(
      "运行时环境。Event 函数支持多种运行时:\n" +
        formatRuntimeList() +
        "\n\n推荐运行时:\n" +
        `  Node.js: ${RECOMMENDED_RUNTIMES.nodejs}\n` +
        `  Python: ${RECOMMENDED_RUNTIMES.python}\n` +
        `  PHP: ${RECOMMENDED_RUNTIMES.php}\n` +
        `  Java: ${RECOMMENDED_RUNTIMES.java}\n` +
        `  Go: ${RECOMMENDED_RUNTIMES.golang}\n\n` +
        `镜像部署（基于 TCR 镜像创建函数）时填 "${CUSTOM_IMAGE_RUNTIME}"，并提供 imageConfig；此时无需 functionRootPath/zipFile。`,
    ),
  buildStrategy: z
    .enum(["zip", "cloud", "local", "image"])
    .optional()
    .describe(
      "HTTP 函数部署策略：" +
        "zip=代码包部署（默认，缺省即 zip）；image=使用已有镜像（imageConfig.imageUri 必填）；" +
        "cloud=云端构建镜像；local=本地 Docker 构建镜像。cloud/local 走镜像构建部署编排，需要 imageConfig；" +
        "其中 build 非必填：目标仓库坐标（namespace 默认 envId、repository 默认函数名）等缺省可自动补齐，" +
        "仅在需要指定构建细节或个人版 build.registryCredential 等特定字段时才提供 build。",
    ),
  imageConfig: IMAGE_CONFIG_SCHEMA.optional().describe(
    "镜像配置（buildStrategy=image/cloud/local 或 runtime=CustomImage 时使用），镜像相关字段全部收敛在此命名空间下。" +
      "image：填 imageUri 使用已有镜像；cloud/local：可填 build 描述如何构建，省略时用默认仓库坐标自动补齐。" +
      "传入已有镜像（imageUri）即按镜像部署处理，函数无需打包本地代码、scf_bootstrap 或 Handler。",
  ),
  triggers: z.array(TRIGGER_SCHEMA).optional().describe("触发器配置数组"),
  handler: z.string().optional().describe("函数入口"),
  ignore: z.union([z.string(), z.array(z.string())]).optional().describe("忽略文件"),
  isWaitInstall: z.boolean().optional().describe("是否等待依赖安装"),
  layers: z
    .array(
      z.object({
        name: z.string(),
        version: z.number(),
      }),
    )
    .optional()
    .describe("Layer 配置"),
});

const MANAGE_LAYER_SCHEMA = z.object({
  layerName: z.string().describe("层名称"),
  layerVersion: z.number().describe("层版本号"),
});

/**
 * Prefer top-level functionName; fall back to func.name for the common
 * mistake of nesting the target name under func (createFunction shape).
 */
export function pickManageFunctionName(input: {
  functionName?: string;
  func?: { name?: unknown } | null;
}): string | undefined {
  if (typeof input.functionName === "string" && input.functionName.trim()) {
    return input.functionName.trim();
  }
  if (typeof input.func?.name === "string" && input.func.name.trim()) {
    return input.func.name.trim();
  }
  return undefined;
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

function processFunctionRootPath(
  functionRootPath: string | undefined,
  functionName: string,
): string | undefined {
  if (!functionRootPath) return functionRootPath;

  const normalizedPath = path.normalize(functionRootPath);
  const lastDir = path.basename(normalizedPath);
  if (lastDir === functionName) {
    const parentPath = path.dirname(normalizedPath);
    console.warn(
      t("functions.rootPathAdjustedWarn", { fnName: functionName, parentPath }),
    );
    return parentPath;
  }

  return functionRootPath;
}

function getExpectedFunctionPath(
  functionRootPath: string | undefined,
  functionName: string,
): string | undefined {
  if (!functionRootPath) return undefined;
  return path.join(path.normalize(functionRootPath), functionName);
}

export function shouldInstallDependencyForFunction(
  functionType: string | undefined,
  hasPackageJson: boolean,
): boolean {
  if (functionType === "HTTP") {
    return hasPackageJson;
  }

  return true;
}

export function resolveEventFunctionRuntime(runtime: unknown): string {
  if (typeof runtime !== "string" || !runtime.trim()) {
    return DEFAULT_RUNTIME;
  }

  const normalizedRuntime = runtime.replace(/\s+/g, "");
  if ((ALL_SUPPORTED_RUNTIMES as readonly string[]).includes(normalizedRuntime)) {
    return normalizedRuntime;
  }

  throw new Error(
    t("functions.unsupportedRuntime", {
      runtime: String(runtime),
      runtimes: formatRuntimeList(),
    }),
  );
}

export function buildFunctionOperationErrorMessage(
  operation: "createFunction" | "updateFunctionCode",
  functionName: string,
  functionRootPath: string | undefined,
  error: unknown,
): string {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];
  const expectedFunctionPath = getExpectedFunctionPath(functionRootPath, functionName);

  if (/GetFunction.*未找到指定的Function|未找到指定的Function/i.test(baseMessage)) {
    suggestions.push(
      t("functions.opErr.missingFn", { fnName: functionName }),
    );
  }

  if (/路径不存在/i.test(baseMessage) && expectedFunctionPath) {
    suggestions.push(
      t("functions.opErr.expectedPath", { expectedPath: expectedFunctionPath }),
    );
    suggestions.push(t("functions.opErr.passParentDir"));
    if (functionRootPath) {
      const lastDir = path.basename(path.normalize(functionRootPath));
      if (lastDir !== "cloudfunctions" && lastDir !== "functions") {
        suggestions.push(
          t("functions.opErr.rootPathFormat", {
            cloudPath: path.join(path.normalize(functionRootPath), "cloudfunctions"),
            functionsPath: path.join(path.normalize(functionRootPath), "functions"),
          }),
        );
      }
    }
  }

  if (/paths\[0\].*undefined/i.test(baseMessage)) {
    suggestions.push(t("functions.opErr.missingRootPath"));
  }

  if (/依赖安装失败|package\.json/i.test(baseMessage)) {
    suggestions.push(t("functions.opErr.nativeHttpHint"));
    suggestions.push(t("functions.opErr.addPackageJson"));
  }

  if (isFunctionUpdatingError(error)) {
    suggestions.push(t("functions.opErr.updatingBusy", { operation }));
  }

  // Handle invalid parameter value errors from CloudBase API
  if (/invalid parameter value/i.test(baseMessage)) {
    suggestions.push(t("functions.opErr.invalidParamHeader"));
    suggestions.push(t("functions.opErr.invalidParamRuntime"));
    suggestions.push(t("functions.opErr.invalidParamHandler"));
    suggestions.push(t("functions.opErr.invalidParamFunctionName"));
    suggestions.push(t("functions.opErr.invalidParamTimeout"));
    suggestions.push(t("functions.opErr.invalidParamEnvVariables"));
    suggestions.push(t("functions.opErr.invalidParamType"));
  }

  if (suggestions.length === 0) {
    suggestions.push(t("functions.opErr.default"));
  }

  return t("functions.opErr.prefix", {
    operation,
    message: baseMessage,
  }) + suggestions.join(" ");
}

function wrapFunctionOperationError(
  operation: "createFunction" | "updateFunctionCode",
  functionName: string,
  functionRootPath: string | undefined,
  error: unknown,
): Error {
  const wrappedError = new Error(
    buildFunctionOperationErrorMessage(
      operation,
      functionName,
      functionRootPath,
      error,
    ),
  );

  if (error && typeof error === "object") {
    Object.assign(wrappedError, error);
  }

  if (error instanceof Error) {
    wrappedError.name = error.name;
    wrappedError.stack = error.stack;
    (wrappedError as Error & { cause?: unknown }).cause = error;
  }

  return wrappedError;
}

async function waitForManageWriteOrGuide(
  action: "updateFunctionCode" | "updateFunctionConfig",
  functionName: string,
  getFunctionDetail: (
    name: string,
  ) => Promise<{ Status?: string } | null | undefined>,
  initialDetail?: { Status?: string } | null,
): Promise<ReturnType<typeof buildFunctionUpdatingPayload> | undefined> {
  const waitResult = await waitUntilFunctionActive(
    async () => {
      const latest = await getFunctionDetail(functionName);
      return typeof latest?.Status === "string" ? latest.Status : undefined;
    },
    {
      initialStatus:
        typeof initialDetail?.Status === "string" ? initialDetail.Status : undefined,
    },
  );

  if (waitResult.ready) {
    return undefined;
  }

  return buildFunctionUpdatingPayload({
    action,
    functionName,
    status: waitResult.status,
    waitedAttempts: waitResult.attempts,
    timedOut: waitResult.timedOut,
  });
}

export function registerFunctionTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const deployOverrides = server.pluginOptions?.functions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  const buildEnvelope = (
    data: Record<string, unknown>,
    message: string,
    nextActions?: FunctionToolEnvelope["nextActions"],
    warnings?: string[],
  ): FunctionToolEnvelope => ({
    success: true,
    data,
    message,
    ...(nextActions?.length ? { nextActions } : {}),
    ...(warnings?.length ? { warnings } : {}),
  });

  const buildErrorEnvelope = (
    error: unknown,
    errorCode?: string,
  ): Record<string, unknown> => ({
    success: false,
    data: {},
    message: error instanceof Error ? error.message : String(error),
    ...(errorCode ? { errorCode } : {}),
  });

  const withEnvelope = async (handler: () => Promise<FunctionToolEnvelope>) => {
    try {
      return jsonContent(await handler());
    } catch (error) {
      if (isToolPayloadError(error)) {
        return jsonContent(error.payload);
      }
      if (isFunctionUpdatingError(error)) {
        return jsonContent(
          buildFunctionUpdatingPayload({
            action: "manageFunctions",
            rawMessage: getErrorMessage(error),
          }),
        );
      }
      return jsonContent(buildErrorEnvelope(error));
    }
  };

  const requireConfirm = (action: string, confirm?: boolean) => {
    if (!confirm) {
      throw new Error(t("functions.confirmRequired", { action }));
    }
  };

  const ensureActionAllowedInCloudMode = (input: ManageFunctionsInput) => {
    if (!isCloudMode()) {
      return;
    }

    if (input.action === "createFunction" || input.action === "updateFunctionCode") {
      // 镜像部署不依赖本地代码目录（image 已在 TCR；cloud 云端构建）；
      // local 构建虽依赖本地，其 cloud mode 拦截在 runFunctionImageDeploy 内按 buildStrategy 处理。
      const buildStrategy = input.func?.buildStrategy as string | undefined;
      const hasImageDeploy = Boolean(
        input.imageConfig ??
          input.func?.imageConfig ??
          (buildStrategy && buildStrategy !== "zip"),
      );
      if (hasImageDeploy) {
        return;
      }
      throw new Error(
        t("functions.cloudMode.localOnly", { action: input.action }),
      );
    }

    if (input.action === "createLayerVersion" && input.contentPath) {
      throw new Error(
        t("functions.cloudMode.contentPathUnsupported"),
      );
    }
  };

  const TIME_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/;

  const validateLogRange = (
    startTime?: string,
    endTime?: string,
    offset?: number,
    limit?: number,
  ) => {
    if ((offset || 0) + (limit || 0) > 10000) {
      throw new Error(t("functions.offsetLimitTooLarge"));
    }

    if (startTime && !TIME_FORMAT_REGEX.test(startTime)) {
      throw new Error(t("functions.startTimeInvalid", { value: startTime }));
    }
    if (endTime && !TIME_FORMAT_REGEX.test(endTime)) {
      throw new Error(t("functions.endTimeInvalid", { value: endTime }));
    }

    if (startTime && endTime) {
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(t("functions.logRangeInvalidDatetime"));
      }
      if (end - start > 24 * 60 * 60 * 1000) {
        throw new Error(t("functions.logRangeTooLong"));
      }
    }
  };

  const normalizeManageLayers = (
    layers: ManageFunctionsInput["layers"],
  ): FunctionLayerInput[] =>
    normalizeFunctionLayers(
      (layers ?? []).map((layer) => ({
        LayerName: layer.layerName ?? layer.LayerName,
        LayerVersion: layer.layerVersion ?? layer.LayerVersion,
      })),
    );

  const handleQueryFunctions = async (
    input: QueryFunctionsInput,
  ): Promise<FunctionToolEnvelope> => {
    switch (input.action) {
    case "getFunctionDeployStatus": {
      if (!input.taskId) {
        throw new Error(t("functions.paramRequired", { action: "getFunctionDeployStatus", param: "taskId" }));
      }
      // cloud mode 下这个 action 不可能命中任何任务：异步任务只由 buildStrategy=cloud/local
      // 的真实部署创建，而这两条路径在 cloud mode 下都被拦（image 策略走同步的
      // createFunction(deployMode="image")，根本不产生 taskId）。给出明确原因，
      // 而不是让 hosted 用户对着通用的「任务不存在」反复重试。
      if (isCloudMode()) {
        throwToolPayloadError({
          success: false,
          errorCode: DEPLOY_TASK_NOT_FOUND_ERROR_CODE,
          data: { action: input.action, taskId: input.taskId, cloudMode: true },
          message:
            t("functions.deployStatus.cloudMode", { action: input.action }),
        });
      }
      // 任务按 envId 隔离：同一进程可能先后服务多个环境，仅凭 taskId 不足以授权
      const taskEnvId =
        cloudBaseOptions?.envId ?? (await getEnvId(cloudBaseOptions));
      const task = getFunctionDeployTask(input.taskId, taskEnvId);
      if (!task) {
        // 任务只保存在 MCP 进程内存中：过期、清理或 MCP Server 重启后都会丢失
        throwToolPayloadError({
          success: false,
          errorCode: DEPLOY_TASK_NOT_FOUND_ERROR_CODE,
          data: { action: input.action, taskId: input.taskId, expired: true },
          message: t("functions.deployTaskNotFound", { taskId: input.taskId, envId: taskEnvId }),
        });
      }
      return {
        success: task.status !== "failed" && task.status !== "expired",
        data: {
          action: input.action,
          ...serializeFunctionDeployTask(task),
        },
        message: describeFunctionDeployTask(task),
        ...(task.status === "running"
          ? {
              nextActions: [
                {
                  tool: "queryFunctions",
                  action: "getFunctionDeployStatus",
                  reason: t("functions.reason.continuePolling"),
                  suggested_args: { taskId: task.taskId },
                },
              ],
            }
          : {}),
      };
    }
    case "listFunctions": {
      const cloudbase = await getManager();
      const result = await cloudbase.functions.getFunctionList(
        input.limit,
        input.offset,
      );
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          functions: result.Functions || [],
          totalCount: result.TotalCount || 0,
          requestId: result.RequestId,
          raw: result,
        },
        t("functions.listedFunctions", { count: result.Functions?.length || 0 }),
        [
          {
            tool: "queryFunctions",
            action: "getFunctionDetail",
            reason: t("functions.reason.getDetail"),
          },
          {
            tool: "manageFunctions",
            action: "createFunction",
            reason: t("functions.reason.createFn"),
          },
        ],
      );
    }
    case "getFunctionDetail": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: input.action, param: "functionName" }));
      }
      const cloudbase = await getManager();
      const result = await cloudbase.functions.getFunctionDetail(
        input.functionName,
        input.codeSecret,
      );
      // 日志侧一律脱敏（持久化，不提供明文口子）；工具返回侧按 revealEnvValues 决定
      logCloudBaseResult(server.logger, maskFunctionDetailEnvValues(result));
      const functionDetail =
        input.revealEnvValues === true
          ? result
          : maskFunctionDetailEnvValues(result);
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          functionDetail,
          layers: normalizeFunctionLayers(result.Layers),
          triggers: result.Triggers || [],
          requestId: result.RequestId,
          raw: functionDetail,
        },
        t("functions.gotFunctionDetail", { fnName: input.functionName }),
        [
          {
            tool: "queryFunctions",
            action: "listFunctionLogs",
            reason: t("functions.reason.viewLogs"),
          },
          {
            tool: "manageFunctions",
            action: "updateFunctionConfig",
            reason: t("functions.reason.updateConfig"),
          },
          {
            tool: "queryGateway",
            action: "getRoute",
            reason: t("functions.reason.checkGateway"),
          },
        ],
      );
    }
    case "listFunctionLogs": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: "listFunctionLogs", param: "functionName" }));
      }
      validateLogRange(
        input.startTime,
        input.endTime,
        input.offset,
        input.limit,
      );
      const cloudbase = await getManager();
      let result;
      try {
        result = await cloudbase.functions.getFunctionLogsV2({
          name: input.functionName,
          offset: input.offset,
          limit: input.limit,
          startTime: input.startTime,
          endTime: input.endTime,
          requestId: input.requestId,
          qualifier: input.qualifier,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (/invalid parameter/i.test(errMsg)) {
          throw new Error(
            `${errMsg}\n\n${t("functions.logsInvalidParamTips")}`,
          );
        }
        throw error;
      }
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          logs: result.LogList || [],
          requestId: result.RequestId,
          raw: result,
        },
        t("functions.gotFunctionLogs", { fnName: input.functionName }),
        [
          {
            tool: "queryFunctions",
            action: "getFunctionLogDetail",
            reason: t("functions.reason.logDetail"),
          },
        ],
      );
    }
    case "getFunctionLogDetail": {
      if (!input.requestId) {
        throw new Error(t("functions.paramRequired", { action: input.action, param: "requestId" }));
      }
      validateLogRange(input.startTime, input.endTime);
      const cloudbase = await getManager();
      let result;
      try {
        result = await cloudbase.functions.getFunctionLogDetail({
          startTime: input.startTime,
          endTime: input.endTime,
          logRequestId: input.requestId,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (/invalid parameter/i.test(errMsg)) {
          throw new Error(
            `${errMsg}\n\n${t("functions.logDetailInvalidParamTips")}`,
          );
        }
        throw error;
      }
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          requestId: input.requestId,
          logDetail: result,
          raw: result,
        },
        t("functions.gotLogDetail", { requestId: input.requestId }),
      );
    }
    case "listFunctionLayers": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: "listFunctionLayers", param: "functionName" }));
      }
      const cloudbase = await getManager();
      const result = await cloudbase.functions.getFunctionDetail(
        input.functionName,
        input.codeSecret,
      );
      logCloudBaseResult(server.logger, result);
      const layers = normalizeFunctionLayers(result.Layers);
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          layers,
          count: layers.length,
          requestId: result.RequestId,
          raw: result,
        },
        t("functions.gotFunctionLayers", { fnName: input.functionName }),
        [
          {
            tool: "manageFunctions",
            action: "attachLayer",
            reason: t("functions.reason.attachLayer"),
          },
          {
            tool: "manageFunctions",
            action: "updateFunctionLayers",
            reason: t("functions.reason.reorderLayers"),
          },
        ],
      );
    }
    case "listLayers": {
      const cloudbase = await getManager();
      const result = await cloudbase.functions.listLayers({
        offset: input.offset,
        limit: input.limit,
        runtime: input.runtime,
        searchKey: input.searchKey,
      });
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          layers: result.Layers || [],
          totalCount: result.TotalCount || 0,
          requestId: result.RequestId,
          raw: result,
        },
        t("functions.gotLayers", { count: result.Layers?.length || 0 }),
        [
          {
            tool: "queryFunctions",
            action: "listLayerVersions",
            reason: t("functions.reason.layerVersions"),
          },
          {
            tool: "manageFunctions",
            action: "createLayerVersion",
            reason: t("functions.reason.publishLayer"),
          },
        ],
        [LAYER_SOFT_WARN.accountLevelView],
      );
    }
    case "listLayerVersions": {
      if (!input.layerName) {
        throw new Error(t("functions.paramRequired", { action: "listLayerVersions", param: "layerName" }));
      }
      const cloudbase = await getManager();
      const result = await cloudbase.functions.listLayerVersions({
        name: input.layerName,
      });
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          layerName: input.layerName,
          layerVersions: result.LayerVersions || [],
          requestId: result.RequestId,
          raw: result,
        },
        t("functions.gotLayerVersions", { layerName: input.layerName }),
        [
          {
            tool: "queryFunctions",
            action: "getLayerVersionDetail",
            reason: t("functions.reason.layerVersionDetail"),
          },
          {
            tool: "manageFunctions",
            action: "attachLayer",
            reason: t("functions.reason.bindLayerVersion"),
          },
        ],
        [LAYER_SOFT_WARN.accountLevelView],
      );
    }
    case "getLayerVersionDetail": {
      if (!input.layerName) {
        throw new Error(t("functions.paramRequired", { action: "getLayerVersionDetail", param: "layerName" }));
      }
      if (typeof input.layerVersion !== "number") {
        throw new Error(t("functions.paramRequired", { action: "getLayerVersionDetail", param: "layerVersion" }));
      }
      const cloudbase = await getManager();
      const result = await cloudbase.functions.getLayerVersion({
        name: input.layerName,
        version: input.layerVersion,
      });
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          layerName: input.layerName,
          layerVersion: input.layerVersion,
          layerVersionDetail: result,
          requestId: result.RequestId,
          raw: result,
        },
        t("functions.gotLayerVersionDetail", { layerName: input.layerName, layerVersion: input.layerVersion }),
        [
          {
            tool: "manageFunctions",
            action: "attachLayer",
            reason: t("functions.reason.bindThisLayerVersion"),
          },
          {
            tool: "manageFunctions",
            action: "deleteLayerVersion",
            reason: t("functions.reason.deleteLayerVersion"),
          },
        ],
        [LAYER_SOFT_WARN.accountLevelView],
      );
    }
    case "listFunctionTriggers": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: input.action, param: "functionName" }));
      }
      const cloudbase = await getManager();
      const result = await cloudbase.functions.getFunctionDetail(
        input.functionName,
        input.codeSecret,
      );
      logCloudBaseResult(server.logger, maskFunctionDetailEnvValues(result));
      const detail =
        input.revealEnvValues === true
          ? result
          : maskFunctionDetailEnvValues(result);
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          triggers: detail.Triggers || [],
          requestId: detail.RequestId,
          raw: detail,
        },
        t("functions.gotFunctionTriggers", { fnName: input.functionName }),
        [
          {
            tool: "manageFunctions",
            action: "createFunctionTrigger",
            reason: t("functions.reason.createTrigger"),
          },
          {
            tool: "manageFunctions",
            action: "deleteFunctionTrigger",
            reason: t("functions.reason.deleteTrigger"),
          },
        ],
      );
    }
    case "getFunctionDownloadUrl": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: input.action, param: "functionName" }));
      }
      const cloudbase = await getManager();
      const result = await cloudbase.functions.getFunctionDownloadUrl(
        input.functionName,
        input.codeSecret,
      );
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          downloadUrl: result.Url,
          codeSha256: result.CodeSha256,
          requestId: result.RequestId,
          raw: result,
        },
        t("functions.gotDownloadUrl", { fnName: input.functionName }),
      );
    }
    default:
      throw new Error(t("functions.unsupportedAction", { action: input.action }));
    }
  };

  const handleManageFunctions = async (
    rawInput: ManageFunctionsInput,
  ): Promise<FunctionToolEnvelope> => {
    // Accept func.name as a fallback for top-level functionName (common agent mistake).
    const pickedName = pickManageFunctionName(rawInput);
    const input: ManageFunctionsInput =
      pickedName && rawInput.functionName !== pickedName
        ? { ...rawInput, functionName: pickedName }
        : rawInput;
    ensureActionAllowedInCloudMode(input);

    /**
     * 用 TCB_TCR_USERNAME / TCB_TCR_PASSWORD 补齐个人版 TCR 推送凭证。
     *
     * 目的是让调用方不必把密码写进 Tool 入参（入参会进入模型上下文与调用历史）。
     * 只在 imageType=personal 时生效：enterprise 用实例临时令牌，不需要固定密码。
     *
     * cloud mode 下不读进程环境变量：Hosted 是多租户共享进程，
     * 读到的会是部署方的凭证而非调用方的，属于越权。
     */
    const applyRegistryCredentialFromEnv = (
      imageConfig: unknown,
    ): unknown => {
      if (!imageConfig || typeof imageConfig !== "object") {
        return imageConfig;
      }
      const config = imageConfig as Record<string, unknown>;
      const build = config.build;
      // 只有 local/cloud 才有 build；image 策略无需推送凭证
      if (!build || typeof build !== "object") {
        return imageConfig;
      }
      // imageType 缺省为 enterprise，与 schema 描述保持一致
      if (config.imageType !== "personal") {
        return imageConfig;
      }

      const buildConfig = build as Record<string, unknown>;
      const { credential } = resolveRegistryCredential(
        buildConfig.registryCredential as
          | { username?: string; password?: string }
          | undefined,
        { allowEnv: !isCloudMode() },
      );

      if (!credential) {
        return imageConfig;
      }

      return {
        ...config,
        build: { ...buildConfig, registryCredential: credential },
      };
    };

    // HTTP 云函数镜像构建部署（func.buildStrategy=cloud/local）走 manager-node functionDeployer 编排。
    // 由 createFunction / updateFunctionCode 在 func.buildStrategy=cloud/local 时复用：
    // local=本地 Docker 构建推送，cloud=CloudApp 云端构建。image=已有镜像走扁平分支，不进入此函数。
    // 部署配置对齐 toolbox：从 func 组装（buildStrategy 与 imageConfig 均为函数级字段）。
    const runFunctionImageDeploy = async (): Promise<FunctionToolEnvelope> => {
      const func = (input.func ?? {}) as Record<string, unknown>;
      const strategy = func.buildStrategy as "cloud" | "local" | undefined;
      const functionName = String(input.functionName ?? func.name ?? "");
      if (!functionName) {
        throw new Error(
          t("functions.imageDeployFnNameRequired", { action: input.action }),
        );
      }
      const deployConfig: Record<string, unknown> = {
        name: functionName,
        type: "HTTP",
        buildStrategy: strategy,
        imageConfig: applyRegistryCredentialFromEnv(func.imageConfig),
      };
      for (const key of [
        "runtime",
        "description",
        "timeout",
        "memorySize",
        "envVariables",
        "vpc",
        "layers",
        "role",
        "codeSecret",
        "public",
        "path",
        "gatewayPath",
        "protocolType",
        "protocolParams",
        "instanceConcurrencyConfig",
      ]) {
        if (func[key] !== undefined) {
          deployConfig[key] = func[key];
        }
      }
      if (input.dryRun === false && input.confirm !== true) {
        throw new Error(
          t("functions.imageDeployConfirmRequired", { action: input.action }),
        );
      }
      if (strategy === "local" && isCloudMode()) {
        throw new Error(
          t("functions.imageDeployLocalCloudMode", { action: input.action }),
        );
      }
      // 只拦真实执行；cloud dry-run 在 cloud mode 下放行。
      //
      // 放行的前提是 dry-run 全程不碰本地文件系统——hosted 环境里 build.cwd 是调用方
      // 本机的绝对路径，一旦 SDK 在这条路径上 stat 或读取 Dockerfile / 构建上下文，
      // 用户就会收到难以理解的 ENOENT。已按 @cloudbase/manager-node 5.8.3 源码逐段核对：
      // deployFunction 的 dry-run 分支在 validate（config-guard）+ plan（planner）之后
      // 直接 buildResult 返回，两个模块都没有任何 fs 调用；唯一读文件的 preflight 位于
      // 该 return 之后，dry-run 到不了。MCP 这侧同样只做字符串校验：isAbsolutePath 就是
      // path.isAbsolute，不做 stat。升级 manager-node 时需要重新确认这个前提。
      if (
        strategy === "cloud" &&
        input.dryRun === false &&
        isCloudMode()
      ) {
        throw new Error(
          t("functions.imageDeployCloudCloudMode", { action: input.action }),
        );
      }

      const parsedDeployConfig = FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse(deployConfig);
      if (!parsedDeployConfig.success) {
        throw new Error(
          t("functions.imageDeployValidationFailed", {
            action: input.action,
            detail: parsedDeployConfig.error.issues
              .map((issue) => `${issue.path.join(".") || "func"}: ${issue.message}`)
              .join("；"),
          }),
        );
      }

      // 企业版 TCR 的云端/本地构建要靠 CAM 铸造临时令牌（autoGrant 授权同理）。
      // 环境级 API Key 与 OAuth 换出的 STS 都不带 CAM 策略，会在构建跑到一半时抛
      // UnauthorizedOperation；这里前置探测，把中途失败提前成开始前的明确报错。
      // 个人版走静态密码直接 docker login，不经过 CAM，因此不做拦截。
      if (
        input.dryRun === false &&
        (strategy === "cloud" || strategy === "local") &&
        resolveEffectiveImageType(parsedDeployConfig.data) === "enterprise"
      ) {
        // unknown（超时/网络/拿不到登录态）一律放行，只拦 CAM 明确拒绝的情况
        if ((await probeCamCapabilityForLogin(cloudBaseOptions)) === "limited") {
          throw new Error(
            t("functions.imageDeployCamLimited", { action: input.action, strategy }),
          );
        }
      }

      const cloudbase = await getManager();
      const deployEnvId =
        cloudBaseOptions?.envId ?? (await getEnvId(cloudBaseOptions));
      if (input.dryRun === false && input.wait === false) {
        const task = startFunctionDeployTask(
          cloudbase as unknown as FunctionDeployManager,
          parsedDeployConfig.data,
          deployEnvId,
          {
            dryRun: false,
            autoGrant: input.autoGrant === true,
          },
        );
        return buildEnvelope(
          {
            action: input.action,
            taskId: task.taskId,
            functionName: task.functionName,
            requestedStrategy: task.requestedStrategy,
            status: task.status,
            createdAt: task.createdAt,
            build: task.build,
            deploy: task.deploy,
          },
          t("functions.imageDeployAsyncAccepted", {
            fnName: task.functionName,
            taskId: task.taskId,
          }),
          [
            {
              tool: "queryFunctions",
              action: "getFunctionDeployStatus",
              reason: t("functions.reason.checkDeployStatus"),
              suggested_args: { taskId: task.taskId },
            },
          ],
        );
      }
      const syncResult = await executeFunctionDeployWithProgress(
        cloudbase as unknown as FunctionDeployManager,
        parsedDeployConfig.data,
        {
          dryRun: input.dryRun !== false,
          autoGrant: input.autoGrant === true,
        },
      );
      // wait 默认 true 是为兼容既有调用方保留的，但同步等待最长可达约 15 分钟，
      // 很容易先撞上 MCP Client 的请求超时——超时只断开这次请求，云端部署仍在继续，
      // 调用方却没有 taskId 可追踪。这里在返回里提示下次改用异步路径。
      if (input.dryRun === false && input.wait !== false) {
        return {
          ...syncResult,
          message:
            `${syncResult.message}` +
            "\n" +
            t("functions.imageDeploySyncWaitHint"),
        };
      }
      return syncResult;
    };

    switch (input.action) {
    case "createFunction": {
      if (deployOverrides?.createFunction) {
        const result = await deployOverrides.createFunction({
          functionName: String(input.func?.name ?? input.functionName ?? ''),
          functionRootPath: input.functionRootPath ?? '',
          runtime: input.func?.runtime as string | undefined,
          force: input.force,
          installDependency: input.func?.installDependency as boolean | undefined,
        });
        return buildEnvelope({ action: input.action, result }, t("functions.overrideDeployOk"));
      }

      // func.buildStrategy=cloud/local 的 HTTP 镜像构建部署走 functionDeployer 编排；
      // image=已有镜像与代码包（zip/缺省）保持既有分支。
      const createStrategy = input.func?.buildStrategy as
        | "zip"
        | "cloud"
        | "local"
        | "image"
        | undefined;
      if (createStrategy === "cloud" || createStrategy === "local") {
        return runFunctionImageDeploy();
      }

      if (!input.func?.name || typeof input.func.name !== "string") {
        throw new Error(t("functions.paramRequired", { action: "createFunction", param: "func.name" }));
      }
      const cloudbase = await getManager();

      const func = { ...input.func };
      const functionName = String(func.name);
      debug(
        `[createFunction] name=${functionName}, type=${String(func.type || "Event")}`,
      );

      // 镜像部署分支（buildStrategy=image / Runtime=CustomImage / 传入 imageConfig）：
      // 基于已推送到 TCR 的镜像创建 HTTP 函数，对应 zip→COS→CloudApp custom 构建→TCR→SCF 链路的「阶段 B」。
      const createImageConfig =
        input.imageConfig ??
        (func.imageConfig as FunctionImageConfigInput | undefined);
      const isImageRuntime =
        typeof func.runtime === "string" &&
        func.runtime.replace(/\s+/g, "").toLowerCase() ===
          CUSTOM_IMAGE_RUNTIME.toLowerCase();

      if (createStrategy === "image" || createImageConfig || isImageRuntime) {
        if (!createImageConfig?.imageUri) {
          throw new Error(t("functions.imageUriRequired"));
        }
        if (
          (createImageConfig.imageType ?? "enterprise") === "enterprise" &&
          !createImageConfig.registryId
        ) {
          throw new Error(t("functions.registryIdRequired"));
        }

        // 镜像函数即 HTTP 函数；Manager SDK 会自动补 ImageType=enterprise、ImagePort=9000，
        // 并在镜像部署时剥离 Handler / InstallDependency，故此处不需要 functionRootPath。
        const imageFunc: Record<string, unknown> = {
          ...func,
          type: func.type ?? "HTTP",
          runtime: CUSTOM_IMAGE_RUNTIME,
          imageConfig: createImageConfig,
        };
        delete (imageFunc as { installDependency?: unknown }).installDependency;

        let imageResult: unknown;
        try {
          imageResult = await cloudbase.functions.createFunction({
            func: imageFunc,
            deployMode: "image",
            force: Boolean(input.force),
          } as any);
        } catch (error) {
          throw wrapFunctionOperationError(
            "createFunction",
            functionName,
            undefined,
            error,
          );
        }

        logCloudBaseResult(server.logger, imageResult);
        return buildEnvelope(
          {
            action: input.action,
            functionName,
            deployMode: "image",
            imageUri: createImageConfig.imageUri,
            raw: imageResult as Record<string, unknown>,
          },
          t("functions.imageCreatedMessage", {
            imageUri: createImageConfig.imageUri,
            fnName: functionName,
          }),
          [
            {
              tool: "queryFunctions",
              action: "getFunctionDetail",
              reason: t("functions.reason.imageFnReady"),
            },
            {
              tool: "manageFunctions",
              action: "updateFunctionCode",
              reason: t("functions.reason.imageNextIteration"),
            },
            {
              tool: "manageGateway",
              action: "createRoute",
              reason: t("functions.reason.imageGatewayRoute"),
            },
          ],
        );
      }

      if (func.type !== "HTTP") {
        const originalRuntime = typeof func.runtime === "string" ? func.runtime : undefined;
        func.runtime = resolveEventFunctionRuntime(func.runtime);

        if (
          typeof originalRuntime === "string" &&
          originalRuntime.includes(" ") &&
          originalRuntime.replace(/\s+/g, "") === func.runtime
        ) {
          console.warn(
            t("functions.runtimeSpacesRemovedWarn", { runtime: originalRuntime }),
          );
        }
      }

      const processedRootPath = processFunctionRootPath(
        input.functionRootPath,
        functionName,
      );
      const functionType =
        typeof func.type === "string" ? func.type : undefined;
      const expectedFunctionPath = getExpectedFunctionPath(
        processedRootPath,
        functionName,
      );

      if (functionType === "HTTP" && !processedRootPath && !input.zipFile) {
        throw new Error(t("functions.httpFunctionNeedsRootPath"));
      }

      const hasPackageJson =
        expectedFunctionPath !== undefined
          ? existsSync(path.join(expectedFunctionPath, "package.json"))
          : false;
      func.installDependency = input.zipFile
        ? true
        : shouldInstallDependencyForFunction(functionType, hasPackageJson);

      if (functionType === "HTTP" && processedRootPath && !hasPackageJson) {
        console.warn(
          t("functions.noPackageJsonWarn", { fnName: functionName }),
        );
      }

      let result: unknown;
      try {
        result = await cloudbase.functions.createFunction({
          func,
          functionRootPath: processedRootPath,
          force: Boolean(input.force),
        } as any);
      } catch (error) {
        throw wrapFunctionOperationError(
          "createFunction",
          functionName,
          processedRootPath,
          error,
        );
      }

      logCloudBaseResult(server.logger, result);

      const nextActions = [
        {
          tool: "queryFunctions",
          action: "getFunctionDetail",
          reason: t("functions.reason.confirmConfig"),
        },
        {
          tool: "queryFunctions",
          action: "listFunctionTriggers",
          reason: t("functions.reason.checkTriggers"),
        },
      ];

      if (func.type === "HTTP") {
        nextActions.push({
          tool: "manageGateway",
          action: "createRoute",
          reason: t("functions.reason.gatewayRouteForHttp"),
        });
        nextActions.push({
          tool: "queryGateway",
          action: "getRoute",
          reason: t("functions.reason.confirmAccessPath"),
        });
        nextActions.push({
          tool: "queryPermissions",
          action: "getResourcePermission",
          reason: t("functions.reason.checkPermission"),
        });
        nextActions.push({
          tool: "managePermissions",
          action: "updateResourcePermission",
          reason: t("functions.reason.adjustPermission"),
        });
      }

      const message =
        func.type === "HTTP"
          ? t("functions.createdHttpFunctionMessage", { fnName: functionName })
          : t("functions.createdFunction", { fnName: functionName });

      let accessUrl: string | undefined;
      let accessUrls: string[] = [];
      let accessUrlSource: string | undefined;
      if (func.type === "HTTP") {
        const envId = cloudBaseOptions?.envId ?? await getEnvId(cloudBaseOptions);
        const gateway = await resolveGatewayAccessUrls({
          envId,
          upstreamResourceName: functionName,
          upstreamResourceTypes: ["WEB_SCF", "SCF"],
          getManager: async () => {
            const manager = await getManager();
            if (!manager) {
              throw new Error("cloudbase manager unavailable");
            }
            return manager as any;
          },
        });
        accessUrl = gateway.accessUrl;
        accessUrls = gateway.accessUrls;
        accessUrlSource = gateway.accessUrlSource;
      }

      return buildEnvelope(
        {
          action: input.action,
          functionName,
          ...(accessUrl ? { accessUrl } : {}),
          ...(accessUrls.length > 0 ? { accessUrls } : {}),
          ...(accessUrlSource ? { accessUrlSource } : {}),
          raw: result as Record<string, unknown>,
        },
        message,
        nextActions,
      );
    }
    case "updateFunctionCode": {
      if (deployOverrides?.updateFunctionCode) {
        const result = await deployOverrides.updateFunctionCode({
          functionName: input.functionName ?? '',
          functionRootPath: input.functionRootPath ?? '',
          force: input.force,
          installDependency: input.func?.installDependency as boolean | undefined,
        });
        return buildEnvelope({ action: input.action, result }, t("functions.overrideUpdateOk"));
      }
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: "updateFunctionCode", param: "functionName" }));
      }
      const cloudbase = await getManager();

      if (typeof cloudbase.functions.getFunctionDetail === "function") {
        try {
          const currentDetail = await cloudbase.functions.getFunctionDetail(
            input.functionName,
          );
          const waited = await waitForManageWriteOrGuide(
            "updateFunctionCode",
            input.functionName,
            (name) => cloudbase.functions.getFunctionDetail(name),
            currentDetail,
          );
          if (waited) {
            return waited;
          }
        } catch (error) {
          if (isFunctionUpdatingError(error)) {
            return buildFunctionUpdatingPayload({
              action: "updateFunctionCode",
              functionName: input.functionName,
              rawMessage: getErrorMessage(error),
            });
          }
        }
      }

      // func.buildStrategy=cloud/local 的 HTTP 镜像构建部署走 functionDeployer 编排；
      // 函数存在性与「更新中」忙碌检测已在上方完成，保持 updateFunctionCode 既有语义。
      const updateStrategy = input.func?.buildStrategy as
        | "zip"
        | "cloud"
        | "local"
        | "image"
        | undefined;
      if (updateStrategy === "cloud" || updateStrategy === "local") {
        return runFunctionImageDeploy();
      }

      // 镜像更新分支（buildStrategy=image / 传入 imageConfig）：后续迭代只需用新镜像 tag 更新函数。
      const updateImageConfig =
        input.imageConfig ??
        (input.func?.imageConfig as FunctionImageConfigInput | undefined);
      if (updateStrategy === "image" || updateImageConfig) {
        if (!updateImageConfig?.imageUri) {
          throw new Error(t("functions.imageUpdateUriRequired"));
        }
        let imageResult: unknown;
        try {
          imageResult = await cloudbase.functions.updateFunctionCode({
            func: {
              name: input.functionName,
              imageConfig: updateImageConfig,
            },
            deployMode: "image",
          } as any);
        } catch (error) {
          if (isFunctionUpdatingError(error)) {
            return buildFunctionUpdatingPayload({
              action: "updateFunctionCode",
              functionName: input.functionName,
              rawMessage: getErrorMessage(error),
            });
          }
          throw wrapFunctionOperationError(
            "updateFunctionCode",
            input.functionName,
            undefined,
            error,
          );
        }
        logCloudBaseResult(server.logger, imageResult);
        const envId = cloudBaseOptions?.envId ?? await getEnvId(cloudBaseOptions);
        const imageGatewayAccess = await resolveGatewayAccessUrls({
          envId,
          upstreamResourceName: input.functionName,
          upstreamResourceTypes: ["WEB_SCF", "SCF"],
          getManager: async () => {
            const manager = await getManager();
            if (!manager) {
              throw new Error("cloudbase manager unavailable");
            }
            return manager as any;
          },
        });
        return buildEnvelope(
          {
            action: input.action,
            functionName: input.functionName,
            deployMode: "image",
            imageUri: updateImageConfig.imageUri,
            ...(imageGatewayAccess.accessUrl
              ? { accessUrl: imageGatewayAccess.accessUrl }
              : {}),
            ...(imageGatewayAccess.accessUrls.length > 0
              ? { accessUrls: imageGatewayAccess.accessUrls }
              : {}),
            ...(imageGatewayAccess.accessUrlSource
              ? { accessUrlSource: imageGatewayAccess.accessUrlSource }
              : {}),
            raw: imageResult as Record<string, unknown>,
          },
          t("functions.imageUpdatedMessage", {
            fnName: input.functionName,
            imageUri: updateImageConfig.imageUri,
          }),
          [
            {
              tool: "queryFunctions",
              action: "getFunctionDetail",
              reason: t("functions.reason.imageUpdateReady"),
            },
          ],
        );
      }

      const processedRootPath = processFunctionRootPath(
        input.functionRootPath,
        input.functionName,
      );
      const updateParams: Record<string, unknown> = {
        func: {
          name: input.functionName,
          installDependency: true,
          ...(input.handler ? { handler: input.handler } : {}),
        },
        functionRootPath: processedRootPath,
      };

      if (input.zipFile) {
        updateParams.zipFile = input.zipFile;
      }

      let result: unknown;
      try {
        result = await cloudbase.functions.updateFunctionCode(updateParams as any);
      } catch (error) {
        if (isFunctionUpdatingError(error)) {
          return buildFunctionUpdatingPayload({
            action: "updateFunctionCode",
            functionName: input.functionName,
            rawMessage: getErrorMessage(error),
          });
        }
        throw wrapFunctionOperationError(
          "updateFunctionCode",
          input.functionName,
          processedRootPath,
          error,
        );
      }

      logCloudBaseResult(server.logger, result);
      const envId = cloudBaseOptions?.envId ?? await getEnvId(cloudBaseOptions);
      const gatewayAccess = await resolveGatewayAccessUrls({
        envId,
        upstreamResourceName: input.functionName,
        upstreamResourceTypes: ["WEB_SCF", "SCF"],
        getManager: async () => {
          const manager = await getManager();
          if (!manager) {
            throw new Error("cloudbase manager unavailable");
          }
          return manager as any;
        },
      });
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          ...(gatewayAccess.accessUrl ? { accessUrl: gatewayAccess.accessUrl } : {}),
          ...(gatewayAccess.accessUrls.length > 0
            ? { accessUrls: gatewayAccess.accessUrls }
            : {}),
          ...(gatewayAccess.accessUrlSource
            ? { accessUrlSource: gatewayAccess.accessUrlSource }
            : {}),
          raw: result as Record<string, unknown>,
        },
        t("functions.updatedCode", { fnName: input.functionName }),
        [
          {
            tool: "queryFunctions",
            action: "getFunctionDetail",
            reason: t("functions.reason.latestConfig"),
          },
        ],
      );
    }
    case "updateFunctionConfig": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: input.action, param: "functionName" }));
      }
      const cloudbase = await getManager();

      const functionDetail = await cloudbase.functions.getFunctionDetail(
        input.functionName,
      );

      if (!functionDetail) {
        throw new Error(t("functions.functionMissing", { fnName: input.functionName }));
      }

      const configBusy = await waitForManageWriteOrGuide(
        "updateFunctionConfig",
        input.functionName,
        (name) => cloudbase.functions.getFunctionDetail(name),
        functionDetail,
      );
      if (configBusy) {
        return configBusy;
      }

      const currentVpc =
        typeof functionDetail.VpcConfig === "object" &&
        functionDetail.VpcConfig !== null &&
        functionDetail.VpcConfig.SubnetId &&
        functionDetail.VpcConfig.VpcId
          ? {
              subnetId: functionDetail.VpcConfig.SubnetId,
              vpcId: functionDetail.VpcConfig.VpcId,
            }
          : undefined;

      try {
        const result = await cloudbase.functions.updateFunctionConfig({
          name: input.functionName,
          envVariables: Object.assign(
            {},
            (functionDetail.Environment?.Variables || []).reduce(
              (
                acc: Record<string, string | number | boolean>,
                curr: IEnvVariable,
              ) => {
                acc[curr.Key] = curr.Value;
                return acc;
              },
              {},
            ),
            input.envVariables ?? {},
          ),
          timeout: input.timeout ?? functionDetail.Timeout,
          vpc: Object.assign({}, currentVpc, input.vpc ?? {}),
        });

        logCloudBaseResult(server.logger, result);
        return buildEnvelope(
          {
            action: input.action,
            functionName: input.functionName,
            raw: result,
          },
          t("functions.updatedConfig", { fnName: input.functionName }),
          [
            {
              tool: "queryFunctions",
              action: "getFunctionDetail",
              reason: t("functions.reason.confirmConfigChange"),
            },
          ],
        );
      } catch (error) {
        if (isFunctionUpdatingError(error)) {
          return buildFunctionUpdatingPayload({
            action: "updateFunctionConfig",
            functionName: input.functionName,
            rawMessage: getErrorMessage(error),
          });
        }
        throw error;
      }
    }
    case "invokeFunction": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: "invokeFunction", param: "functionName" }));
      }
      const cloudbase = await getManager();
      try {
        const result = await cloudbase.functions.invokeFunction(
          input.functionName,
          input.params,
        );
        logCloudBaseResult(server.logger, result);
        return buildEnvelope(
          {
            action: input.action,
            functionName: input.functionName,
            invokeResult: result,
            raw: result,
          },
          t("functions.invokedFunction", { fnName: input.functionName }),
          [
            {
              tool: "queryFunctions",
              action: "listFunctionLogs",
              reason: t("functions.reason.viewCallLogs"),
            },
          ],
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("Function not found") ||
          errorMessage.includes("函数不存在")
        ) {
          throw new Error(
            t("functions.invokeNotFoundTip", { message: errorMessage }),
          );
        }
        throw error;
      }
    }
    case "deleteFunction": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: input.action, param: "functionName" }));
      }
      requireConfirm(input.action, input.confirm);
      const cloudbase = await getManager();
      const result = await cloudbase.functions.deleteFunction(input.functionName);
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          raw: result,
        },
        t("functions.deletedFunction", { fnName: input.functionName }),
        [
          {
            tool: "queryFunctions",
            action: "listFunctions",
            reason: t("functions.reason.confirmDeleted"),
          },
        ],
      );
    }
    case "createFunctionTrigger": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: "createFunctionTrigger", param: "functionName" }));
      }
      if (!input.triggers?.length) {
        throw new Error(t("functions.paramRequired", { action: "createFunctionTrigger", param: "triggers" }));
      }
      // Validate timer cron format before sending to CloudBase
      for (const trigger of input.triggers) {
        if (trigger.type === "timer") {
          validateTimerCron(trigger.config);
        }
      }
      const cloudbase = await getManager();
      const result = await cloudbase.functions.createFunctionTriggers(
        input.functionName,
        input.triggers,
      );
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          raw: result,
        },
        t("functions.createdTriggers", { fnName: input.functionName }),
        [
          {
            tool: "queryFunctions",
            action: "listFunctionTriggers",
            reason: t("functions.reason.confirmTriggers"),
          },
        ],
      );
    }
    case "deleteFunctionTrigger": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: "deleteFunctionTrigger", param: "functionName" }));
      }
      if (!input.triggerName) {
        throw new Error(t("functions.paramRequired", { action: "deleteFunctionTrigger", param: "triggerName" }));
      }
      requireConfirm(input.action, input.confirm);
      const cloudbase = await getManager();
      await cloudbase.functions.deleteFunctionTrigger(
        input.functionName,
        input.triggerName,
      );
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          triggerName: input.triggerName,
          raw: {},
        },
        t("functions.deletedTrigger", { fnName: input.functionName, triggerName: input.triggerName }),
        [
          {
            tool: "queryFunctions",
            action: "listFunctionTriggers",
            reason: t("functions.reason.remainingTriggers"),
          },
        ],
      );
    }
    case "createLayerVersion": {
      if (!input.layerName) {
        throw new Error(t("functions.paramRequired", { action: input.action, param: "layerName" }));
      }
      if (!input.runtimes?.length) {
        throw new Error(t("functions.paramRequired", { action: input.action, param: "runtimes" }));
      }
      if (!input.contentPath && !input.base64Content) {
        throw new Error(t("functions.contentPathRequired"));
      }
      const envId = await getEnvId(cloudBaseOptions);
      const nameWarning = buildCreateLayerNameWarning(input.layerName, envId);
      const cloudbase = await getManager();
      const result = await cloudbase.functions.createLayer({
        name: input.layerName,
        contentPath: input.contentPath,
        base64Content: input.base64Content,
        runtimes: input.runtimes,
        description: input.description,
        licenseInfo: input.licenseInfo,
      });
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          layerName: input.layerName,
          layerVersion: result.LayerVersion,
          requestId: result.RequestId,
          raw: result,
        },
        t("functions.createdLayerVersion", { layerName: input.layerName }),
        [
          {
            tool: "queryFunctions",
            action: "listLayerVersions",
            reason: t("functions.reason.allLayerVersions"),
          },
        ],
        nameWarning ? [nameWarning] : undefined,
      );
    }
    case "deleteLayerVersion": {
      if (!input.layerName) {
        throw new Error(t("functions.paramRequired", { action: "deleteLayerVersion", param: "layerName" }));
      }
      if (typeof input.layerVersion !== "number") {
        throw new Error(t("functions.paramRequired", { action: "deleteLayerVersion", param: "layerVersion" }));
      }
      requireConfirm(input.action, input.confirm);
      const cloudbase = await getManager();
      const result = await cloudbase.functions.deleteLayerVersion({
        name: input.layerName,
        version: input.layerVersion,
      });
      logCloudBaseResult(server.logger, result);
      return buildEnvelope(
        {
          action: input.action,
          layerName: input.layerName,
          layerVersion: input.layerVersion,
          raw: result,
        },
        t("functions.deletedLayerVersion", { layerName: input.layerName, layerVersion: input.layerVersion }),
        [
          {
            tool: "queryFunctions",
            action: "listLayerVersions",
            reason: t("functions.reason.remainingLayerVersions"),
          },
        ],
        [LAYER_SOFT_WARN.deleteVersion],
      );
    }
    case "attachLayer":
    case "detachLayer":
    case "updateFunctionLayers": {
      if (!input.functionName) {
        throw new Error(t("functions.paramRequired", { action: input.action, param: "functionName" }));
      }
      const cloudbase = await getManager();
      const envId = await getEnvId(cloudBaseOptions);
      const bindWarnings = [LAYER_SOFT_WARN.bindShared];

      if (input.action === "attachLayer") {
        if (!input.layerName) {
          throw new Error(t("functions.paramRequired", { action: input.action, param: "layerName" }));
        }
        if (typeof input.layerVersion !== "number") {
          throw new Error(t("functions.paramRequired", { action: input.action, param: "layerVersion" }));
        }
        const result = await cloudbase.functions.attachLayer({
          envId,
          functionName: input.functionName,
          layerName: input.layerName,
          layerVersion: input.layerVersion,
          codeSecret: input.codeSecret,
        });
        logCloudBaseResult(server.logger, result);
        const detail = await cloudbase.functions.getFunctionDetail(
          input.functionName,
          input.codeSecret,
        );
        return buildEnvelope(
          {
            action: input.action,
            functionName: input.functionName,
            layers: normalizeFunctionLayers(detail.Layers),
            requestId: result.RequestId,
            raw: result,
          },
          t("functions.attachedLayer", { layerName: input.layerName, layerVersion: input.layerVersion, fnName: input.functionName }),
          [
            {
              tool: "queryFunctions",
              action: "listFunctionLayers",
              reason: t("functions.reason.currentLayers"),
            },
          ],
          bindWarnings,
        );
      }

      if (input.action === "detachLayer") {
        if (!input.layerName) {
          throw new Error(t("functions.paramRequired", { action: "detachLayer", param: "layerName" }));
        }
        if (typeof input.layerVersion !== "number") {
          throw new Error(t("functions.paramRequired", { action: "detachLayer", param: "layerVersion" }));
        }
        requireConfirm(input.action, input.confirm);
        const result = await cloudbase.functions.unAttachLayer({
          envId,
          functionName: input.functionName,
          layerName: input.layerName,
          layerVersion: input.layerVersion,
          codeSecret: input.codeSecret,
        });
        logCloudBaseResult(server.logger, result);
        const detail = await cloudbase.functions.getFunctionDetail(
          input.functionName,
          input.codeSecret,
        );
        return buildEnvelope(
          {
            action: input.action,
            functionName: input.functionName,
            layers: normalizeFunctionLayers(detail.Layers),
            requestId: result.RequestId,
            raw: result,
          },
          t("functions.detachedLayer", { layerName: input.layerName, layerVersion: input.layerVersion, fnName: input.functionName }),
          [
            {
              tool: "queryFunctions",
              action: "listFunctionLayers",
              reason: t("functions.reason.detachedLayers"),
            },
          ],
          bindWarnings,
        );
      }

      const normalizedLayers = normalizeManageLayers(input.layers);
      if (!normalizedLayers.length) {
        throw new Error(t("functions.layersInvalid"));
      }
      const result = await cloudbase.functions.updateFunctionLayer({
        envId,
        functionName: input.functionName,
        layers: normalizedLayers,
      });
      logCloudBaseResult(server.logger, result);
      const detail = await cloudbase.functions.getFunctionDetail(
        input.functionName,
      );
      return buildEnvelope(
        {
          action: input.action,
          functionName: input.functionName,
          layers: normalizeFunctionLayers(detail.Layers),
          requestId: result.RequestId,
          raw: result,
        },
        t("functions.updatedLayers", { fnName: input.functionName }),
        [
          {
            tool: "queryFunctions",
            action: "listFunctionLayers",
            reason: t("functions.reason.latestLayerOrder"),
          },
        ],
        bindWarnings,
      );
    }
    default:
      // incrementalDeployFunction：无默认实现，必须通过 pluginOptions 注入
      if (input.action === 'incrementalDeployFunction') {
        const fn = deployOverrides?.incrementalDeployFunction;
        if (!fn) {
          throw new Error(
            t("functions.incrementalNotInjected")
          );
        }
        const result = await fn({
          functionName: input.functionName ?? '',
          functionRootPath: input.functionRootPath ?? '',
          incrementalFile: input.incrementalFile ?? '',
        });
        return buildEnvelope({ action: input.action, result }, t("functions.incrementalDeployOk"));
      }
      throw new Error(t("functions.unsupportedAction", { action: input.action }));
    }
  };

  server.registerTool?.(
    "queryFunctions",
    {
      title: "functions.queryTitle",
      description: "functions.queryDescription",
      inputSchema: {
        action: z
          .enum(QUERY_FUNCTION_ACTIONS)
          .describe(
            "只读操作类型：" +
            "\n- `listFunctions`: 列出所有 CloudBase 云函数" +
            "\n- `getFunctionDetail`: 获取 CloudBase 云函数详情（需要 functionName）" +
            "\n- `listFunctionLogs`: 查询 CloudBase 云函数执行日志（需要 functionName）" +
            "\n- `getFunctionLogDetail`: 获取日志详情（需要 requestId）" +
            "\n- `listFunctionLayers`: 列出函数绑定的层" +
            "\n- `listLayers`: 列出所有层（账号级视图，含其他环境创建的层）" +
            "\n- `listLayerVersions`: 列出层的版本（注意：是 Versions 不是 Version；账号级视图）" +
            "\n- `getLayerVersionDetail`: 获取层版本详情（账号级视图）" +
            "\n- `listFunctionTriggers`: 列出函数触发器（用于查看定时任务 / cron / timer 配置）" +
            "\n- `getFunctionDownloadUrl`: 获取函数代码下载地址" +
            "\n- `getFunctionDeployStatus`: 按 taskId 查询异步部署状态、阶段进度和最终结果。返回 data.build（构建子状态）、data.deploy（部署子状态）、data.progress（阶段事件）；status=running 时 data.result 与 data.error 一律为 null，不得报告部署完成。调用方必须持续轮询直到 status=succeeded/failed；status=expired 表示任务超过最长保留时间（2 小时）被终结，云端可能仍在部署，需用 getFunctionDetail 确认。任务只保存在 MCP 进程内存中，过期或 MCP Server 重启后返回 errorCode=DEPLOY_TASK_NOT_FOUND；任务按环境隔离，只能查到当前环境自己发起的部署。cloud mode 下本 action 不可用：异步任务只由 buildStrategy=cloud/local 的真实部署创建，而这两种策略在 cloud mode 下都不支持真实执行，image 策略则走同步部署不产生 taskId。"
          ),
        functionName: z
          .string()
          .optional()
          .describe("CloudBase 云函数名称。`getFunctionDetail`、`listFunctionLogs`、`listFunctionLayers`、`listFunctionTriggers`、`getFunctionDownloadUrl` 时必填"),
        limit: z.number().optional().describe("分页数量（limit）。列表类 action 可选，默认值由后端决定"),
        offset: z.number().optional().describe("分页偏移（offset）。列表类 action 可选，默认 0"),
        codeSecret: z.string().optional().describe("代码保护密钥，用于解密函数代码"),
        revealEnvValues: z
          .boolean()
          .optional()
          .describe(
            "getFunctionDetail / listFunctionTriggers 时是否返回环境变量明文值。默认 false：Value 脱敏为 ***，仅保留 Key 与 ValueLength，足以确认配置了哪些变量及变更是否生效；true 时返回明文，敏感变量会进入模型上下文，谨慎使用。如需查看明文，建议优先使用控制台或 CLI",
          ),
        startTime: z
          .string()
          .optional()
          .describe(
            "日志查询开始时间，格式必须为 YYYY-MM-DD HH:mm:ss（如 2024-01-01 00:00:00）。" +
            "与 endTime 间隔不能超过一天。不传时默认查询最近一天"
          ),
        endTime: z
          .string()
          .optional()
          .describe(
            "日志查询结束时间，格式必须为 YYYY-MM-DD HH:mm:ss（如 2024-01-01 23:59:59）。" +
            "与 startTime 间隔不能超过一天。不传时默认为当前时间"
          ),
        requestId: z
          .string()
          .optional()
          .describe("日志请求 ID。`getFunctionLogDetail` 操作必填，可从 `listFunctionLogs` 结果中获取"),
        qualifier: z.string().optional().describe("函数版本别名，如 $LATEST、$DEFAULT。日志查询时可选"),
        runtime: z.string().optional().describe("层查询的运行时筛选，如 Nodejs18.15"),
        searchKey: z.string().optional().describe("层名称搜索关键字"),
        layerName: z
          .string()
          .optional()
          .describe(
            "层名称。`listLayerVersions`、`getLayerVersionDetail` 操作必填。" +
            "层为账号级共享命名空间；推荐固定格式 `{layerName}_{当前envId}`（如 common_cloud1-d9ghadgak3edf6b36）",
          ),
        layerVersion: z.number().optional().describe("层版本号。`getLayerVersionDetail` 操作必填"),
        taskId: z
          .string()
          .optional()
          .describe(
            "`getFunctionDeployStatus` 操作时的异步部署任务 ID（由 manageFunctions 的 wait=false 返回）。任务仅保存在当前 MCP 进程内存中：终态任务保留约 30 分钟，运行中任务最长保留 2 小时。",
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "functions",
      },
    },
    async (input: QueryFunctionsInput) => withEnvelope(() => handleQueryFunctions(input)),
  );

  server.registerTool?.(
    "manageFunctions",
    {
      title: "functions.manageTitle",
      description: "functions.manageDescription",
      inputSchema: {
        action: z
          .enum(MANAGE_FUNCTION_ACTIONS)
          .describe(
            "写操作类型，例如 createFunction、updateFunctionCode、incrementalDeployFunction、invokeFunction、deleteFunction、" +
            "createFunctionTrigger（定时任务 / cron / timer）、deleteFunctionTrigger、" +
            "createLayerVersion、deleteLayerVersion、attachLayer、detachLayer、updateFunctionLayers。" +
            "层名推荐固定格式 `{layerName}_{当前envId}`（如 common_cloud1-d9ghadgak3edf6b36）"
          ),
        func: CREATE_FUNCTION_SCHEMA.optional().describe(
          "createFunction / updateFunctionCode 的函数配置。镜像/构建部署通过 func.buildStrategy（zip/cloud/local/image）区分，" +
            "镜像相关字段收敛在 func.imageConfig 命名空间下。",
        ),
        functionRootPath: z.string().optional().describe(
          "创建或更新函数代码时默认推荐的本地目录方式。" +
          "必须是直接包含函数文件夹的目录绝对路径（如 /abs/path/cloudfunctions 或 /abs/path/functions），" +
          "不要传项目根目录（如 /abs/path），也不要传到函数名子目录（如 /abs/path/cloudfunctions/hello）。" +
          "本地应按 cloudfunctions/<functionName>/index.js 或 functions/<functionName>/index.js 布局，" +
          "此参数传 cloudfunctions 或 functions 目录的绝对路径。" +
          "SDK 会自动拼接函数名子目录，无需预先压缩 zip 或 base64 编码。",
        ),
        force: z.boolean().optional().describe("createFunction 时是否覆盖"),
        functionName: z
          .string()
          .optional()
          .describe(
            "目标函数名称（顶层）。updateFunctionCode / updateFunctionConfig / invokeFunction 等 action 使用此字段。" +
              "不要只写在 func.name：createFunction 用 func.name，其它 action 用顶层 functionName。" +
              "若误传 func.name，也会被识别为 functionName。",
          ),
        zipFile: z.string().optional().describe(
          "仅兼容特殊场景：预先准备好的代码包 base64 编码。普通 createFunction/updateFunctionCode 默认不要先压缩 zip，优先使用 functionRootPath。",
        ),
        handler: z.string().optional().describe("函数入口"),
        timeout: z.number().optional().describe("配置更新时的超时时间"),
        envVariables: z
          .record(z.string())
          .optional()
          .describe(
            "配置更新时要合并的环境变量。若含 DATABASE_URL / MYSQL_* / POSTGRES_* / REDIS_* 等 TCP 连库变量，必须同时提供真实 vpc（或函数已绑定完整 VPC）。禁止猜测 vpcId/subnetId。",
          ),
        vpc: VPC_SCHEMA.optional().describe(
          "配置更新时的 VPC 信息。非原生 TCP 连库场景必填真实 vpcId+subnetId；不要用占位符。",
        ),
        params: z.record(z.any()).optional().describe("invokeFunction 的调用参数"),
        triggers: z
          .array(TRIGGER_SCHEMA)
          .optional()
          .describe(
            "createFunctionTrigger 的触发器列表，用于定时跑 / 定时任务 / scheduled job。timer 触发器使用7段 cron 表达式（秒 分 时 日 月 星期 年），" +
            '如 "0 */5 * * * * *" 表示每5分钟执行一次'
          ),
        triggerName: z.string().optional().describe("deleteFunctionTrigger 的目标触发器名称"),
        layerName: z
          .string()
          .optional()
          .describe(
            "层名称。创建层推荐固定格式 `{layerName}_{当前envId}`（如 common_cloud1-d9ghadgak3edf6b36）；" +
            "不要跨环境复用裸层名。层为账号级共享命名空间",
          ),
        layerVersion: z.number().optional().describe("层版本号"),
        contentPath: z.string().optional().describe("层内容路径，可为目录或 ZIP 文件"),
        base64Content: z.string().optional().describe("层内容的 base64 编码"),
        runtimes: z.array(z.string()).optional().describe("层适用的运行时列表"),
        description: z.string().optional().describe("层版本描述"),
        licenseInfo: z.string().optional().describe("层许可证信息"),
        layers: z
          .array(MANAGE_LAYER_SCHEMA)
          .optional()
          .describe("updateFunctionLayers 的目标层列表，顺序即最终顺序"),
        codeSecret: z.string().optional().describe("层绑定时的代码保护密钥"),
        dryRun: z
          .boolean()
          .optional()
          .default(true)
          .describe("镜像构建部署（func.buildStrategy=cloud/local）是否只生成部署计划。默认 true；传 false 时必须同时传 confirm=true。"),
        wait: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "真实镜像部署是否等待完整部署；设为 false 立即返回 taskId 并后台执行。" +
              "默认 true 是为了兼容既有调用方，但同步等待最长可达约 15 分钟，很容易先撞上 MCP Client 的请求超时——" +
              "客户端超时只是断开这次请求，云端部署仍在继续，却拿不到 taskId 追踪。" +
              "因此执行真实构建部署（buildStrategy=cloud/local，dryRun=false）时建议显式传 wait=false。",
          ),
        autoGrant: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "镜像部署是否允许 manager-node 自动补齐固定白名单 CAM 策略。默认 false；仅在明确确认权限变更时设为 true。",
          ),
        confirm: z.boolean().optional().describe("危险操作确认开关。deleteFunction、deleteFunctionTrigger、deleteLayerVersion、detachLayer 等删除类操作以及镜像构建部署（func.buildStrategy=cloud/local）真实执行需要显式传入 confirm=true"),
        incrementalFile: z.string().optional().describe("incrementalDeployFunction 增量部署时的变更文件路径"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "functions",
      },
    },
    async (input: ManageFunctionsInput) => withEnvelope(() => handleManageFunctions(input)),
  );
}
