import path from "node:path";
import { z } from "zod";
import { t } from "../i18n/index.js";

const FUNCTION_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,59}$/;
const BUILD_ARG_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SENSITIVE_BUILD_ARG_KEY_PATTERN =
  /(secret|token|password|passwd|credential|private[_-]?key|access[_-]?key)/i;
const IMAGE_TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const IMAGE_DIGEST_PATTERN = /^[a-z0-9]+(?:[.+_-][a-z0-9]+)*:[a-fA-F0-9]{32,}$/;
const IMAGE_REPOSITORY_PATTERN =
  /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/;
const GATEWAY_PATH_PATTERN = /^[A-Za-z0-9\-._~%/:@]+$/;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;

const MAX_PATH_LENGTH = 512;
const CUSTOM_IMAGE_RUNTIME = "CustomImage" as const;
const IMAGE_FUNCTION_PORT = 9000 as const;
const DEFAULT_IMAGE_PLATFORM = "linux/amd64" as const;

export const FUNCTION_IMAGE_BUILD_STRATEGIES = [
  "image",
  "cloud",
  "local",
] as const;
export const FUNCTION_IMAGE_TYPES = ["enterprise", "personal"] as const;
export const FUNCTION_IMAGE_LOCAL_FALLBACKS = ["cloud", "error"] as const;
export const FUNCTION_HTTP_PROTOCOL_TYPES = ["HTTP", "WS"] as const;

function isAbsolutePath(value: string) {
  return path.isAbsolute(value) || WINDOWS_ABSOLUTE_PATH_PATTERN.test(value);
}

function isSafeRelativePath(value: string) {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_PATH_LENGTH ||
    isAbsolutePath(trimmed) ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return false;
  }

  return !trimmed.split(/[\\/]+/).some((segment) => segment === "..");
}

function parseImageReference(reference: string) {
  const ref = reference.trim();
  if (!ref || ref.length > MAX_PATH_LENGTH || /\s/.test(ref)) {
    return null;
  }

  let remain = ref;
  let digest: string | undefined;
  const atIndex = remain.lastIndexOf("@");
  if (atIndex > -1) {
    digest = remain.slice(atIndex + 1);
    remain = remain.slice(0, atIndex);
    if (!IMAGE_DIGEST_PATTERN.test(digest)) {
      return null;
    }
  }

  let tag: string | undefined;
  const lastSlashIndex = remain.lastIndexOf("/");
  const colonIndex = remain.indexOf(":", lastSlashIndex + 1);
  if (colonIndex > -1) {
    tag = remain.slice(colonIndex + 1);
    remain = remain.slice(0, colonIndex);
    if (!IMAGE_TAG_PATTERN.test(tag)) {
      return null;
    }
  }

  if (!remain) {
    return null;
  }

  let registry: string | undefined;
  let repository = remain;
  const firstSlashIndex = remain.indexOf("/");
  if (firstSlashIndex > -1) {
    const maybeRegistry = remain.slice(0, firstSlashIndex);
    if (
      maybeRegistry === "localhost" ||
      maybeRegistry.includes(".") ||
      maybeRegistry.includes(":")
    ) {
      registry = maybeRegistry;
      repository = remain.slice(firstSlashIndex + 1);
    }
  }

  if (!repository || !IMAGE_REPOSITORY_PATTERN.test(repository)) {
    return null;
  }

  return { registry, repository, tag, digest };
}

const FUNCTION_VPC_SCHEMA = z
  .object({
    vpcId: z.string().min(1).describe("functionDeploySchema.schema.vpc.id"),
    subnetId: z
      .string()
      .min(1)
      .describe("functionDeploySchema.schema.vpc.subnetId"),
  })
  .strict();

const FUNCTION_LAYER_SCHEMA = z
  .object({
    name: z.string().min(1).describe("functionDeploySchema.schema.layer.name"),
    version: z.number().int().positive().describe("functionDeploySchema.schema.layer.version"),
  })
  .strict();

const FUNCTION_PROTOCOL_PARAMS_SCHEMA = z
  .object({
    wsParams: z
      .object({
        idleTimeOut: z
          .number()
          .int()
          .min(10)
          .max(7200)
          .optional()
          .describe("functionDeploySchema.schema.protocol.wsIdleTimeout"),
      })
      .strict()
      .optional(),
  })
  .strict();

const FUNCTION_INSTANCE_CONCURRENCY_SCHEMA = z
  .object({
    dynamicEnabled: z.boolean().optional().describe("functionDeploySchema.schema.concurrency.dynamicEnabled"),
    maxConcurrency: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("functionDeploySchema.schema.concurrency.maxConcurrency"),
  })
  .strict();

const FUNCTION_HTTP_COMMON_FIELDS = {
  name: z
    .string()
    .regex(FUNCTION_NAME_PATTERN)
    .describe("functionDeploySchema.schema.http.name"),
  type: z.literal("HTTP").describe("functionDeploySchema.schema.http.type"),
  runtime: z
    .literal(CUSTOM_IMAGE_RUNTIME)
    .optional()
    .describe("functionDeploySchema.schema.http.runtime"),
  description: z.string().optional().describe("functionDeploySchema.schema.http.description"),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(900)
    .optional()
    .describe("functionDeploySchema.schema.http.timeout"),
  memorySize: z
    .number()
    .int()
    .min(64)
    .max(3072)
    .optional()
    .describe("functionDeploySchema.schema.http.memorySize"),
  envVariables: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("functionDeploySchema.schema.http.envVariables"),
  vpc: FUNCTION_VPC_SCHEMA.optional().describe("functionDeploySchema.schema.http.vpc"),
  layers: z.array(FUNCTION_LAYER_SCHEMA).optional().describe("functionDeploySchema.schema.http.layers"),
  role: z.string().min(1).optional().describe("functionDeploySchema.schema.http.role"),
  codeSecret: z.string().min(1).optional().describe("functionDeploySchema.schema.http.codeSecret"),
  public: z.boolean().optional().describe("functionDeploySchema.schema.http.public"),
  path: z.string().min(1).optional().describe("functionDeploySchema.schema.http.path"),
  gatewayPath: z
    .string()
    .refine(
      (value) => {
        const trimmed = value.trim();
        if (
          !trimmed ||
          trimmed.length > MAX_PATH_LENGTH ||
          !trimmed.startsWith("/") ||
          /[?#\\\u0000-\u001f\u007f]/.test(trimmed) ||
          !GATEWAY_PATH_PATTERN.test(trimmed)
        ) {
          return false;
        }
        return !trimmed.split("/").some((segment) => segment === "." || segment === "..");
      },
      { message: t("functionDeploySchema.gatewayPathInvalid") },
    )
    .optional()
    .describe("functionDeploySchema.schema.http.gatewayPath"),
  protocolType: z
    .enum(FUNCTION_HTTP_PROTOCOL_TYPES)
    .optional()
    .describe("functionDeploySchema.schema.http.protocolType"),
  protocolParams: FUNCTION_PROTOCOL_PARAMS_SCHEMA.optional().describe("functionDeploySchema.schema.http.protocolParams"),
  instanceConcurrencyConfig: FUNCTION_INSTANCE_CONCURRENCY_SCHEMA.optional().describe("functionDeploySchema.schema.http.instanceConcurrency"),
};

// imageConfig 命名空间下的镜像运行时公共字段，对齐 cloudbaserc / toolbox 的嵌套形状。
// 仅做结构与格式校验；imageType/registryId 的业务组合约束交由 SDK checkConfig。
//
// 这里是 imageConfig 公共字段的唯一定义处：manageFunctions 对外暴露的扁平入参
// schema 同样由本对象展开而来，避免两份 schema 各自演进后出现「工具入参接受、
// 部署校验拒绝」或字段被静默丢弃的漂移。新增字段只改这里。
export const FUNCTION_IMAGE_CONFIG_COMMON_FIELDS = {
  imageType: z
    .enum(FUNCTION_IMAGE_TYPES)
    .optional()
    .describe("functionDeploySchema.schema.image.type"),
  registryId: z
    .string()
    .min(1)
    .optional()
    .describe("functionDeploySchema.schema.image.registryId"),
  imagePort: z
    .literal(IMAGE_FUNCTION_PORT)
    .optional()
    .describe("functionDeploySchema.schema.image.port"),
  entryPoint: z
    .string()
    .min(1)
    .optional()
    .describe("functionDeploySchema.schema.image.entryPoint"),
  command: z
    .string()
    .optional()
    .describe("functionDeploySchema.schema.image.command"),
  args: z
    .string()
    .optional()
    .describe("functionDeploySchema.schema.image.args"),
  commandList: z
    .array(z.string())
    .optional()
    .describe("functionDeploySchema.schema.image.commandList"),
  argsList: z
    .array(z.string())
    .optional()
    .describe("functionDeploySchema.schema.image.argsList"),
  containerImageAccelerate: z
    .boolean()
    .optional()
    .describe("functionDeploySchema.schema.image.accelerate"),
};

export const FUNCTION_IMAGE_BUILD_SCHEMA = z
  .object({
    cwd: z
      .string()
      .refine(isAbsolutePath, () => ({ message: t("functionDeploySchema.buildCwdAbsolute") }))
      .describe("functionDeploySchema.schema.build.cwd"),
    dockerfile: z
      .string()
      .refine(isSafeRelativePath, () => ({ message: t("functionDeploySchema.buildDockerfileSafeRelative") }))
      .optional()
      .describe("functionDeploySchema.schema.build.dockerfile"),
    registryId: z
      .string()
      .min(1)
      .optional()
      .describe("functionDeploySchema.schema.build.registryId"),
    namespace: z
      .string()
      .min(1)
      .optional()
      .describe("functionDeploySchema.schema.build.namespace"),
    repository: z
      .string()
      .min(1)
      .optional()
      .describe("functionDeploySchema.schema.build.repository"),
    tag: z
      .string()
      .regex(IMAGE_TAG_PATTERN)
      .refine((value) => value.toLowerCase() !== "latest", () => ({ message: t("functionDeploySchema.tagNoLatest") }))
      .optional()
      .describe("functionDeploySchema.schema.build.tag"),
    platform: z
      .literal(DEFAULT_IMAGE_PLATFORM)
      .optional()
      .describe("functionDeploySchema.schema.build.platform"),
    buildArgs: z
      .record(z.string())
      .superRefine((buildArgs, context) => {
        for (const [key, value] of Object.entries(buildArgs)) {
          if (!BUILD_ARG_KEY_PATTERN.test(key)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message: t("functionDeploySchema.buildArgKeyInvalid"),
            });
          }
          if (SENSITIVE_BUILD_ARG_KEY_PATTERN.test(key)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message: t("functionDeploySchema.buildArgSensitive"),
            });
          }
          if (value.includes("\0")) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message: t("functionDeploySchema.buildArgNul"),
            });
          }
        }
      })
      .optional()
      .describe("functionDeploySchema.schema.build.args"),
    registryCredential: z
      .object({
        username: z
          .string()
          .regex(/^\d{5,20}$/)
          .optional()
          .describe("functionDeploySchema.schema.build.credentialUsername"),
        password: z
          .string()
          .min(1)
          .max(16 * 1024)
          .optional()
          .describe("functionDeploySchema.schema.build.credentialPassword"),
      })
      .strict()
      .optional()
      .describe("functionDeploySchema.schema.build.registryCredential"),
    forceBuild: z.boolean().optional().describe("functionDeploySchema.schema.build.force"),
    retainedTags: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("functionDeploySchema.schema.build.retainedTags"),
  })
  .strict();

// image 策略：imageConfig 携带已有镜像地址 imageUri。
const FUNCTION_IMAGE_IMAGE_CONFIG_SCHEMA = z
  .object({
    ...FUNCTION_IMAGE_CONFIG_COMMON_FIELDS,
    imageUri: z
      .string()
      .refine((value) => {
        const parsed = parseImageReference(value);
        return Boolean(
          parsed &&
            parsed.registry &&
            (parsed.digest || (parsed.tag && parsed.tag.toLowerCase() !== "latest")),
        );
      }, () => ({ message: t("functionDeploySchema.imageUriImmutable") }))
      .describe("functionDeploySchema.schema.image.uri"),
  })
  .strict();

// cloud 策略：imageConfig 携带构建目标 build。
const FUNCTION_CLOUD_IMAGE_CONFIG_SCHEMA = z
  .object({
    ...FUNCTION_IMAGE_CONFIG_COMMON_FIELDS,
    build: FUNCTION_IMAGE_BUILD_SCHEMA,
  })
  .strict();

// local 策略：imageConfig 携带构建目标 build 与本地构建回退策略 localFallback。
const FUNCTION_LOCAL_IMAGE_CONFIG_SCHEMA = z
  .object({
    ...FUNCTION_IMAGE_CONFIG_COMMON_FIELDS,
    build: FUNCTION_IMAGE_BUILD_SCHEMA,
    localFallback: z
      .enum(FUNCTION_IMAGE_LOCAL_FALLBACKS)
      .optional()
      .describe("functionDeploySchema.schema.image.localFallback"),
  })
  .strict();

const FUNCTION_IMAGE_DEPLOY_SCHEMA = z
  .object({
    ...FUNCTION_HTTP_COMMON_FIELDS,
    buildStrategy: z.literal("image"),
    imageConfig: FUNCTION_IMAGE_IMAGE_CONFIG_SCHEMA,
  })
  .strict();

const FUNCTION_CLOUD_DEPLOY_SCHEMA = z
  .object({
    ...FUNCTION_HTTP_COMMON_FIELDS,
    buildStrategy: z.literal("cloud"),
    imageConfig: FUNCTION_CLOUD_IMAGE_CONFIG_SCHEMA,
  })
  .strict();

const FUNCTION_LOCAL_DEPLOY_SCHEMA = z
  .object({
    ...FUNCTION_HTTP_COMMON_FIELDS,
    buildStrategy: z.literal("local"),
    imageConfig: FUNCTION_LOCAL_IMAGE_CONFIG_SCHEMA,
  })
  .strict();

// 结构化入参契约：仅做结构与格式校验，镜像字段全部收敛在 imageConfig 命名空间下，
// 直接对齐 cloudbaserc / toolbox 的嵌套形状，原样传给 SDK。
// imageType/registryId/凭证/仓库地址等跨字段业务组合约束交由 SDK 的 checkConfig 统一裁决。
export const FUNCTION_DEPLOY_CONFIG_INPUT_SCHEMA = z.discriminatedUnion("buildStrategy", [
  FUNCTION_IMAGE_DEPLOY_SCHEMA,
  FUNCTION_CLOUD_DEPLOY_SCHEMA,
  FUNCTION_LOCAL_DEPLOY_SCHEMA,
]);

export const FUNCTION_DEPLOY_CONFIG_SCHEMA = FUNCTION_DEPLOY_CONFIG_INPUT_SCHEMA;

export type FunctionDeployConfigInput = z.infer<typeof FUNCTION_DEPLOY_CONFIG_SCHEMA>;

/**
 * 推断本次部署实际生效的镜像仓库类型。
 *
 * 对齐 SDK 契约（IHttpImageRuntimeCommon.imageType：「省略时由 registryId 推断为
 * enterprise，否则推断为 personal」）：显式声明优先，缺省按 registryId 是否存在推断。
 *
 * 两者的差别不只是仓库形态——企业版要经 CAM 铸造临时令牌，个人版走静态密码直接
 * docker login，登录态要求完全不同，因此调用方需要在真正构建前拿到这个结论。
 */
export function resolveEffectiveImageType(
  config: FunctionDeployConfigInput,
): (typeof FUNCTION_IMAGE_TYPES)[number] {
  const { imageType, registryId } = config.imageConfig;
  if (imageType) {
    return imageType;
  }
  return registryId ? "enterprise" : "personal";
}
