import {
    ConfigParser,
    loadConfig,
    searchConfig,
    validateCloudBaseConfigBySchema,
} from "@cloudbase/toolbox";
import { z } from "zod";
import { getCloudBaseManager, getEnvId } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";

// 声明式部署可编排的资源类型，与 DeployOrchestrator 的部署顺序一致：
// database → functions → app → hosting → gateway
const RESOURCE_TYPES = ["database", "functions", "app", "hosting", "gateway"] as const;
type ResourceType = (typeof RESOURCE_TYPES)[number];

// 工具统一返回信封：success 标识成败，data 承载结构化结果，message 供人读
type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
};

function buildEnvelope(data: Record<string, unknown>, message: string): ToolEnvelope {
  return { success: true, data, message };
}

function buildErrorEnvelope(error: unknown): ToolEnvelope {
  return {
    success: false,
    data: {},
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * 解析 cloudbaserc 声明式部署配置。
 *
 * 分两步完成：
 * 1. 定位并读取配置文件：searchConfig 从 cwd 探测 cloudbaserc.*（json/yaml/yml/js），
 *    loadConfig 读取原始内容。读取阶段不强制 envId，
 *    envId 由调用方按优先级单独确定，以支持用登录态环境部署未写死 envId 的配置。
 * 2. ConfigParser.parseRawConfig：按 mode 合并 envOverrides、下发 functionDefaultConfig
 *    到各函数、加载 .env / .env.local / .env.<mode> 并渲染 {{env.*}} / {{tcb.*}} 模板变量。
 */
async function resolveDeployConfig(options: {
  cwd: string;
  mode?: string;
}): Promise<Record<string, unknown>> {
  const found = await searchConfig(options.cwd);
  if (!found?.filepath) {
    throw new Error(
      `未在 ${options.cwd} 找到 cloudbaserc 配置文件（支持 json/yaml/yml/js）`,
    );
  }
  const rawConfig = await loadConfig({ configPath: found.filepath });
  return ConfigParser.parseRawConfig(rawConfig ?? {}, options.cwd, {
    mode: options.mode,
  });
}

/**
 * 确定部署使用的环境 ID。
 *
 * 优先级：显式传入的 envId > 解析后配置中的 envId > MCP 登录态 / 绑定环境。
 * 显式入参优先于配置文件，配置未写死 envId 时回退到当前会话绑定的环境。
 * 三者都无则抛出错误。
 */
async function resolveDeployEnvId(options: {
  envId?: string;
  config: Record<string, unknown>;
  cloudBaseOptions: ExtendedMcpServer["cloudBaseOptions"];
}): Promise<string> {
  if (options.envId && options.envId.length > 0) {
    return options.envId;
  }
  const configEnvId = options.config.envId;
  if (typeof configEnvId === "string" && configEnvId.length > 0) {
    return configEnvId;
  }
  const resolved = await getEnvId(options.cloudBaseOptions);
  if (!resolved) {
    throw new Error(
      "未能确定部署环境 ID：请在 cloudbaserc 配置 envId、通过 envId 参数指定，或先登录并绑定环境。",
    );
  }
  return resolved;
}

/**
 * 按 cloudbaserc schema 校验解析后的配置。
 *
 * 校验不通过时抛出错误，错误消息包含各字段的具体校验失败原因，供调用方定位问题。
 */
function assertConfigValid(config: Record<string, unknown>): void {
  const result = validateCloudBaseConfigBySchema(config);
  if (result.valid) {
    return;
  }
  const detail = result.errors
    .map((item) => `${item.dataPath || "<root>"} ${item.message}`)
    .join("; ");
  throw new Error(`cloudbaserc 配置校验未通过：${detail}`);
}

/**
 * 校验并发数取值，非法时抛出错误。
 *
 * 未指定时返回 undefined（由编排器使用默认串行）；指定时必须为不小于 1 的整数。
 */
function normalizeConcurrency(concurrency?: number): number | undefined {
  if (concurrency === undefined) {
    return undefined;
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`无效的并发数 ${concurrency}，应为不小于 1 的整数`);
  }
  return concurrency;
}

export function registerDeployTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // 工具一：deployPlan —— 只读，预演部署计划（dry-run）
  server.registerTool?.(
    "deployPlan",
    {
      title: "预演 CloudBase 声明式部署计划",
      description:
        "解析 cloudbaserc 并计算声明式部署计划（dry-run，不产生任何变更）。" +
        "返回每个资源的动作分类：create=新建，update=覆盖更新，skip=无变更，" +
        "conflict=检测到冲突需中断，deploy=直传覆盖。" +
        "\n- cwd：项目根目录，默认当前工作目录" +
        "\n- mode：环境名，命中 envOverrides.<mode> 时合并对应的多环境覆盖配置" +
        "\n- envId：目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境" +
        "\n- only：仅计算指定资源类型的计划" +
        "\n- skip：跳过指定资源类型",
      inputSchema: {
        cwd: z
          .string()
          .optional()
          .describe("项目根目录，从此目录向下搜索 cloudbaserc；默认当前工作目录"),
        mode: z
          .string()
          .optional()
          .describe("环境名（如 production/staging），命中 envOverrides.<mode> 时合并覆盖"),
        envId: z
          .string()
          .optional()
          .describe("目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境"),
        only: z
          .array(z.enum(RESOURCE_TYPES))
          .optional()
          .describe("仅计算指定资源类型的计划，可选值：database/functions/app/hosting/gateway"),
        skip: z
          .array(z.enum(RESOURCE_TYPES))
          .optional()
          .describe("跳过指定资源类型，可选值：database/functions/app/hosting/gateway"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "deploy",
      },
    },
    async ({
      cwd,
      mode,
      envId: envIdInput,
      only,
      skip,
    }: {
      cwd?: string;
      mode?: string;
      envId?: string;
      only?: ResourceType[];
      skip?: ResourceType[];
    }) => {
      try {
        const projectRoot = cwd ?? process.cwd();
        const config = await resolveDeployConfig({ cwd: projectRoot, mode });
        assertConfigValid(config);
        const envId = await resolveDeployEnvId({
          envId: envIdInput,
          config,
          cloudBaseOptions,
        });

        const manager = await getManager();
        const plan = await manager.getDeployOrchestrator().deployPlan({
          config,
          envId,
          cwd: projectRoot,
          only,
          skip,
          dryRun: true,
        });

        return jsonContent(
          buildEnvelope(
            { cwd: projectRoot, mode: mode ?? null, envId, plan },
            "已生成声明式部署计划",
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );

  // 工具二：deploy —— 写操作，执行声明式部署
  server.registerTool?.(
    "deploy",
    {
      title: "执行 CloudBase 声明式部署",
      description:
        "解析 cloudbaserc 并按 database→functions→app→hosting→gateway 顺序执行声明式部署。" +
        "这是会变更云端资源的写操作，必须显式传 confirm=true 才会执行。" +
        "建议先用 deployPlan 预演，确认计划无误后再执行。" +
        "\n- confirm：必须显式传 true 才执行部署，否则直接拒绝" +
        "\n- cwd：项目根目录，默认当前工作目录" +
        "\n- mode：环境名，命中 envOverrides.<mode> 时合并对应的多环境覆盖配置" +
        "\n- envId：目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境" +
        "\n- only：仅部署指定资源类型" +
        "\n- skip：跳过指定资源类型" +
        "\n- yes：遇到已存在资源时的处理方式。true=直接覆盖更新；false（默认）=保守跳过，" +
        "在无法交互确认的场景下已存在资源不会被覆盖" +
        "\n- concurrency：同类型资源最大并行数，默认 1（串行）" +
        "\n- continueOnError：某个资源失败后继续部署其余资源（database 失败仍强制中断）",
      inputSchema: {
        confirm: z
          .boolean()
          .optional()
          .describe("危险操作确认开关。部署会变更云端资源，必须显式传 confirm=true 才会执行"),
        cwd: z
          .string()
          .optional()
          .describe("项目根目录，从此目录向下搜索 cloudbaserc；默认当前工作目录"),
        mode: z
          .string()
          .optional()
          .describe("环境名（如 production/staging），命中 envOverrides.<mode> 时合并覆盖"),
        envId: z
          .string()
          .optional()
          .describe("目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境"),
        only: z
          .array(z.enum(RESOURCE_TYPES))
          .optional()
          .describe("仅部署指定资源类型，可选值：database/functions/app/hosting/gateway"),
        skip: z
          .array(z.enum(RESOURCE_TYPES))
          .optional()
          .describe("跳过指定资源类型，可选值：database/functions/app/hosting/gateway"),
        yes: z
          .boolean()
          .optional()
          .describe(
            "遇到已存在资源时是否直接覆盖更新。true=覆盖；false（默认）=保守跳过已存在资源",
          ),
        concurrency: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("同类型资源最大并行数，默认 1（串行）；仅作用于同类型资源，跨类型依赖顺序不变"),
        continueOnError: z
          .boolean()
          .optional()
          .describe("某个资源失败后是否继续部署其余资源；database 失败始终强制中断"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
        category: "deploy",
      },
    },
    async ({
      confirm,
      cwd,
      mode,
      envId: envIdInput,
      only,
      skip,
      yes,
      concurrency,
      continueOnError,
    }: {
      confirm?: boolean;
      cwd?: string;
      mode?: string;
      envId?: string;
      only?: ResourceType[];
      skip?: ResourceType[];
      yes?: boolean;
      concurrency?: number;
      continueOnError?: boolean;
    }) => {
      try {
        if (confirm !== true) {
          throw new Error(
            "部署会变更云端资源，必须显式传 confirm=true 才会执行。" +
              "建议先用 deployPlan 预演部署计划，确认无误后再执行。",
          );
        }

        const projectRoot = cwd ?? process.cwd();
        const config = await resolveDeployConfig({ cwd: projectRoot, mode });
        assertConfigValid(config);
        const envId = await resolveDeployEnvId({
          envId: envIdInput,
          config,
          cloudBaseOptions,
        });

        const manager = await getManager();
        const result = await manager.getDeployOrchestrator().deploy({
          config,
          envId,
          cwd: projectRoot,
          only,
          skip,
          yes: yes === true,
          concurrency: normalizeConcurrency(concurrency),
          continueOnError,
        });

        return jsonContent(
          buildEnvelope(
            { cwd: projectRoot, mode: mode ?? null, envId, result },
            "声明式部署已执行",
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );
}
