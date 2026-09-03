import path from "node:path";
import { z } from "zod";

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
    vpcId: z.string().min(1).describe("VPC ID。必须使用真实网络配置，禁止填写占位符。"),
    subnetId: z
      .string()
      .min(1)
      .describe("子网 ID。必须与 vpcId 属于同一 VPC，禁止填写占位符。"),
  })
  .strict();

const FUNCTION_LAYER_SCHEMA = z
  .object({
    name: z.string().min(1).describe("Layer 名称。"),
    version: z.number().int().positive().describe("Layer 版本号。"),
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
          .describe("WebSocket 空闲超时，单位秒，范围 10-7200。"),
      })
      .strict()
      .optional(),
  })
  .strict();

const FUNCTION_INSTANCE_CONCURRENCY_SCHEMA = z
  .object({
    dynamicEnabled: z.boolean().optional().describe("是否开启智能动态并发。"),
    maxConcurrency: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("单实例最大并发数，范围 1-100。"),
  })
  .strict();

const FUNCTION_HTTP_COMMON_FIELDS = {
  name: z
    .string()
    .regex(FUNCTION_NAME_PATTERN)
    .describe("函数名称：字母开头，仅允许字母、数字、下划线和中划线，长度 2-60。"),
  type: z.literal("HTTP").describe("MVP 镜像部署仅支持 HTTP 函数。"),
  runtime: z
    .literal(CUSTOM_IMAGE_RUNTIME)
    .optional()
    .describe(`镜像部署运行时。省略时由 SDK 自动规范化为 ${CUSTOM_IMAGE_RUNTIME}。`),
  description: z.string().optional().describe("函数描述。"),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(900)
    .optional()
    .describe("函数超时，单位秒，范围 1-900。"),
  memorySize: z
    .number()
    .int()
    .min(64)
    .max(3072)
    .optional()
    .describe("函数内存，单位 MB，范围 64-3072，建议使用 64 的整数倍。"),
  envVariables: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("函数运行时环境变量。"),
  vpc: FUNCTION_VPC_SCHEMA.optional().describe("函数 VPC 配置。"),
  layers: z.array(FUNCTION_LAYER_SCHEMA).optional().describe("函数绑定的 Layer。"),
  role: z.string().min(1).optional().describe("函数执行角色名称。"),
  codeSecret: z.string().min(1).optional().describe("函数代码加密密钥。"),
  public: z.boolean().optional().describe("是否允许匿名访问；省略表示不管理访问规则。"),
  path: z.string().min(1).optional().describe("兼容既有声明式部署的云接入路径。"),
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
      "gatewayPath 必须以 / 开头，且不能包含查询串、片段、反斜杠或相对路径段。",
    )
    .optional()
    .describe("HTTP 网关路径，例如 /api。"),
  protocolType: z
    .enum(FUNCTION_HTTP_PROTOCOL_TYPES)
    .optional()
    .describe("HTTP 函数协议类型：HTTP 或 WS。"),
  protocolParams: FUNCTION_PROTOCOL_PARAMS_SCHEMA.optional().describe("协议参数。"),
  instanceConcurrencyConfig: FUNCTION_INSTANCE_CONCURRENCY_SCHEMA.optional().describe(
    "HTTP 函数实例并发配置。",
  ),
};

// imageConfig 命名空间下的镜像运行时公共字段，对齐 cloudbaserc / toolbox 的嵌套形状。
// 仅做结构与格式校验；imageType/registryId 的业务组合约束交由 SDK checkConfig。
const FUNCTION_IMAGE_CONFIG_COMMON_FIELDS = {
  imageType: z
    .enum(FUNCTION_IMAGE_TYPES)
    .optional()
    .describe("镜像仓库类型：enterprise=企业版 TCR，personal=个人版 CCR；省略时由 SDK 推断。"),
  registryId: z
    .string()
    .min(1)
    .optional()
    .describe("企业版 TCR 实例 ID；个人版镜像不填。"),
  imagePort: z
    .literal(IMAGE_FUNCTION_PORT)
    .optional()
    .describe(`HTTP 镜像函数监听端口，当前固定为 ${IMAGE_FUNCTION_PORT}。`),
  entryPoint: z.string().min(1).optional().describe("覆盖镜像入口点。"),
  command: z.string().optional().describe("覆盖镜像启动命令。"),
  args: z.string().optional().describe("覆盖镜像启动参数。"),
  commandList: z.array(z.string()).optional().describe("镜像启动命令列表。"),
  argsList: z.array(z.string()).optional().describe("镜像启动参数列表。"),
  containerImageAccelerate: z.boolean().optional().describe("是否开启镜像加速。"),
};

export const FUNCTION_IMAGE_BUILD_SCHEMA = z
  .object({
    cwd: z
      .string()
      .refine(isAbsolutePath, "build.cwd 必须是绝对路径。")
      .describe("镜像构建上下文的绝对目录。"),
    dockerfile: z
      .string()
      .refine(isSafeRelativePath, "build.dockerfile 必须是构建上下文内的安全相对路径。")
      .optional()
      .describe("Dockerfile 相对 build.cwd 的路径，默认 Dockerfile。"),
    registryId: z
      .string()
      .min(1)
      .optional()
      .describe("企业版 TCR 实例 ID；personal 镜像构建不填。"),
    namespace: z
      .string()
      .min(1)
      .optional()
      .describe("目标镜像命名空间；不传时默认使用当前环境 ID（envId）。"),
    repository: z
      .string()
      .min(1)
      .optional()
      .describe("不含 tag/digest 的目标仓库路径；不传时默认使用函数名。local personal 需填写完整 registry/namespace/repository。"),
    tag: z
      .string()
      .regex(IMAGE_TAG_PATTERN)
      .refine((value) => value.toLowerCase() !== "latest", "镜像 tag 禁止使用 latest。")
      .optional()
      .describe("local 策略的目标镜像 tag；cloud 策略由平台生成，不填。"),
    platform: z
      .literal(DEFAULT_IMAGE_PLATFORM)
      .optional()
      .describe(`目标镜像平台，当前仅支持 ${DEFAULT_IMAGE_PLATFORM}。`),
    buildArgs: z
      .record(z.string())
      .superRefine((buildArgs, context) => {
        for (const [key, value] of Object.entries(buildArgs)) {
          if (!BUILD_ARG_KEY_PATTERN.test(key)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message: "构建参数名需以字母或下划线开头，仅包含字母、数字和下划线。",
            });
          }
          if (SENSITIVE_BUILD_ARG_KEY_PATTERN.test(key)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message: "禁止通过 buildArgs 传递 secret、token、password、credential 或 key。",
            });
          }
          if (value.includes("\0")) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message: "构建参数值不能包含 NUL 字符。",
            });
          }
        }
      })
      .optional()
      .describe("Docker 构建参数。禁止传递密钥或凭证。"),
    registryCredential: z
      .object({
        username: z
          .string()
          .regex(/^\d{5,20}$/)
          .optional()
          .describe(
            "个人版 CCR 登录用户名，必须为腾讯云账号 UIN。" +
              "省略时回退读取 MCP 进程的 TCB_TCR_USERNAME 环境变量。",
          ),
        password: z
          .string()
          .min(1)
          .max(16 * 1024)
          .optional()
          .describe(
            "个人版 CCR 固定密码。**不要在此字段填写明文密码**：" +
              "请在 MCP 配置的 env 中设置 TCB_TCR_PASSWORD，本字段留空即可自动读取。" +
              "敏感字段，禁止写入日志或响应。",
          ),
      })
      .strict()
      .optional()
      .describe(
        "个人版 TCR 推送凭证（personal local/cloud 需要）。" +
          "推荐整体省略，改为在 MCP 配置的 env 中设置 TCB_TCR_USERNAME 与 TCB_TCR_PASSWORD，" +
          "与 TENCENTCLOUD_SECRETID 等密钥的配置方式一致；" +
          "已设置环境变量时不需要在请求参数中传递凭证。" +
          "字段级回退：显式传入的字段优先，未传字段读环境变量。",
      ),
    forceBuild: z.boolean().optional().describe("是否忽略同摘要复用并强制重新构建。"),
    retainedTags: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("个人版 TCR 构建完成后保留的最新镜像标签数量。"),
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
      }, "imageUri 必须是包含 registry 和不可变 tag 或 digest 的完整镜像地址，禁止 latest。")
      .describe("已有镜像地址，例如 ccr.ccs.tencentyun.com/ns/app:v1。"),
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
      .describe("本地构建不可用时的处理方式，默认 error，禁止静默改变构建环境。"),
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
