import {
    ConfigParser,
    loadConfig,
    searchConfig,
    validateCloudBaseConfigBySchema,
} from "@cloudbase/toolbox";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getCloudBaseManager, getEnvId } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";
import { findDestructiveStatements } from "../utils/sql-risk.js";

// 声明式部署可编排的资源类型，与 DeployOrchestrator 的部署顺序一致：
// database → functions → app → hosting → gateway
const RESOURCE_TYPES = ["database", "functions", "app", "hosting", "gateway"] as const;
type ResourceType = (typeof RESOURCE_TYPES)[number];

// 工具统一返回信封：success 标识成败，data 承载结构化结果，message 供人读，
// errorCode 供 agent 程序化分支处理（成功时为 undefined / 省略）。
type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
  errorCode?: string;
};

/**
 * 声明式部署工具的稳定错误码。供 agent 程序化分支处理，不随文案调整而变化。
 * - CONFIG_NOT_FOUND：cwd 下未找到 cloudbaserc 配置文件
 * - CONFIG_INVALID：配置未通过 cloudbaserc schema 校验
 * - ENV_UNRESOLVED：无法确定目标环境 ID（配置/入参/登录态均缺失）
 * - INVALID_CONCURRENCY：并发数入参非法
 * - CONFIRM_REQUIRED：写操作未显式传 confirm=true
 * - DESTRUCTIVE_CONFIRM_REQUIRED：待执行的数据库迁移含破坏性语句，需额外传 confirmDestructive=true
 * - DEPLOY_FAILED：编排器执行失败或其它未分类错误（可能透传引擎 errorCode）
 */
export const DEPLOY_ERROR_CODES = {
  CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
  CONFIG_INVALID: "CONFIG_INVALID",
  ENV_UNRESOLVED: "ENV_UNRESOLVED",
  INVALID_CONCURRENCY: "INVALID_CONCURRENCY",
  CONFIRM_REQUIRED: "CONFIRM_REQUIRED",
  DESTRUCTIVE_CONFIRM_REQUIRED: "DESTRUCTIVE_CONFIRM_REQUIRED",
  DEPLOY_FAILED: "DEPLOY_FAILED",
} as const;

type DeployErrorCode = (typeof DEPLOY_ERROR_CODES)[keyof typeof DEPLOY_ERROR_CODES];

/**
 * 携带稳定错误码的部署错误。抛出后由 buildErrorEnvelope 归一为信封的 errorCode 字段。
 */
class DeployError extends Error {
  readonly code: DeployErrorCode;

  constructor(code: DeployErrorCode, message: string) {
    super(message);
    this.name = "DeployError";
    this.code = code;
  }
}

function buildEnvelope(data: Record<string, unknown>, message: string): ToolEnvelope {
  return { success: true, data, message };
}

function buildErrorEnvelope(error: unknown): ToolEnvelope {
  // DeployError 带显式错误码；引擎/SDK 抛出的错误若带 code 也透传；其余归为 DEPLOY_FAILED。
  let errorCode: string = DEPLOY_ERROR_CODES.DEPLOY_FAILED;
  if (error instanceof DeployError) {
    errorCode = error.code;
  } else if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    (error as { code: string }).code.length > 0
  ) {
    errorCode = (error as { code: string }).code;
  }
  return {
    success: false,
    data: {},
    message: error instanceof Error ? error.message : String(error),
    errorCode,
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
    throw new DeployError(
      DEPLOY_ERROR_CODES.CONFIG_NOT_FOUND,
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
    throw new DeployError(
      DEPLOY_ERROR_CODES.ENV_UNRESOLVED,
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
  throw new DeployError(
    DEPLOY_ERROR_CODES.CONFIG_INVALID,
    `cloudbaserc 配置校验未通过：${detail}`,
  );
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
    throw new DeployError(
      DEPLOY_ERROR_CODES.INVALID_CONCURRENCY,
      `无效的并发数 ${concurrency}，应为不小于 1 的整数`,
    );
  }
  return concurrency;
}

// 编排器返回的单条计划项形状（字段随资源类型不同，这里只约束需要读写的部分）
type PlanItem = {
  type: string;
  name: string;
  status: string;
  action?: string;
  declaredStatus?: string;
  [key: string]: unknown;
};

/**
 * 让 deployPlan 的预演结论与 deployApply 的实际执行语义对齐。
 *
 * 背景：编排器把「云端已存在的函数」标为 status='update'，但 deployApply 在 yes!==true
 * 且无交互确认回调时，会对 functions+update 保守跳过（reason='no-confirm'）。
 * 若 plan 原样返回 update，agent 预演看到「会更新」，实际执行却「跳过」——结论相反。
 *
 * 此函数按传入的 yes 复算 functions+update 的「有效动作」：
 * - yes===true：维持 update（执行时确实会覆盖）
 * - 否则：改标为 skip，并保留原始判定到 declaredStatus，action 说明为何跳过。
 * 其它资源类型与状态原样透传（database/app/hosting/gateway 的分类不受 yes 影响）。
 */
function reconcilePlanWithExecution(plan: unknown, yes: boolean): PlanItem[] {
  if (!Array.isArray(plan)) {
    return [];
  }
  return (plan as PlanItem[]).map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }
    if (item.type === "functions" && item.status === "update" && !yes) {
      return {
        ...item,
        status: "skip",
        declaredStatus: "update",
        action: `已存在函数 ${item.name}：未传 yes=true，执行时将保守跳过（不覆盖）。传 yes=true 才会覆盖更新。`,
      };
    }
    return item;
  });
}

/** 单条被判定为破坏性的待执行迁移 */
type DestructiveMigration = {
  migration: string;
  file: string;
  statements: string[];
};

/**
 * 解析 migrations 目录（与引擎 DatabaseDeployer.resolveMigrationsDir 同规则）：
 * 未配置默认 ./cloudbase/migrations；仅允许相对路径（禁止绝对路径 / 开头）。
 * 非法时返回 undefined（交由引擎在真正执行时抛出一致的错误，这里不抢报错）。
 */
function resolveMigrationsDir(cwd: string, migrations?: unknown): string | undefined {
  const raw = typeof migrations === "string" && migrations ? migrations : "./cloudbase/migrations";
  if (path.isAbsolute(raw) || raw.startsWith("/")) {
    return undefined;
  }
  return path.resolve(cwd, raw);
}

/**
 * 从 dry-run plan 中提取「待执行（pending）的数据库迁移标识」。
 *
 * 编排器把 database 计划聚合为单条 create 项，pending 迁移写在
 * changes[].to（field==='migration'），形如 "{version}_{name}"。
 * 只关注 pending：已 applied 的迁移不会被重复执行，不应触发破坏性确认门。
 */
function extractPendingMigrations(plan: PlanItem[]): string[] {
  const result: string[] = [];
  for (const item of plan) {
    if (!item || item.type !== "database" || item.status !== "create") {
      continue;
    }
    const changes = item.changes;
    if (!Array.isArray(changes)) {
      continue;
    }
    for (const change of changes as Array<Record<string, unknown>>) {
      if (change?.field === "migration" && typeof change.to === "string" && change.to) {
        result.push(change.to);
      }
    }
  }
  return result;
}

/**
 * 检测「本次将要执行的数据库迁移」中是否含破坏性语句（DROP/TRUNCATE/DELETE、
 * ALTER ... DROP/RENAME）。
 *
 * 仅扫描 pending 迁移对应的本地 .sql 文件；已 applied 的不扫描，避免误拦。
 * 读文件失败（缺文件/目录非法）视为无法确认破坏性，返回空——真正的存在性/
 * 格式校验交由引擎执行时处理，这里只在能确证破坏性时加门，避免与引擎报错重复。
 */
function detectDestructiveMigrations(options: {
  plan: PlanItem[];
  cwd: string;
  databaseConfig: unknown;
}): DestructiveMigration[] {
  const pending = extractPendingMigrations(options.plan);
  if (pending.length === 0) {
    return [];
  }
  const dbConfig =
    options.databaseConfig && typeof options.databaseConfig === "object"
      ? (options.databaseConfig as Record<string, unknown>)
      : undefined;
  const migrationsDir = resolveMigrationsDir(options.cwd, dbConfig?.migrations);
  if (!migrationsDir) {
    return [];
  }

  const hits: DestructiveMigration[] = [];
  for (const migration of pending) {
    const file = path.join(migrationsDir, `${migration}.sql`);
    let sqlText: string;
    try {
      sqlText = fs.readFileSync(file, "utf-8");
    } catch {
      // 文件读不到：不在此处报错，交给引擎执行时给出一致错误
      continue;
    }
    const statements = findDestructiveStatements(sqlText);
    if (statements.length > 0) {
      hits.push({ migration, file, statements });
    }
  }
  return hits;
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
        "这是 deployApply 的预演对仗工具：plan 计算、deployApply 执行同一份 cloudbaserc。" +
        "返回每个资源的动作分类：create=新建，update=覆盖更新，skip=无变更/不会执行，" +
        "conflict=检测到冲突需中断，deploy=直传覆盖。" +
        "计划已按 yes 复算为「实际会发生的动作」：不传 yes=true 时，云端已存在的函数会标为 skip" +
        "（并在 declaredStatus 保留 update），与 deployApply 的实际执行结果一致，避免预演与执行相反。" +
        "\n适用边界：本工具用于项目级声明式编排（一份 cloudbaserc 统一 plan/apply）；" +
        "单资源临时直传请用 manageFunctions/manageHosting/manageApps。" +
        "\n- cwd：项目根目录，默认当前工作目录" +
        "\n- mode：环境名，命中 envOverrides.<mode> 时合并对应的多环境覆盖配置" +
        "\n- envId：目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境" +
        "\n- only：仅计算指定资源类型的计划" +
        "\n- skip：跳过指定资源类型" +
        "\n- yes：与 deployApply 的 yes 对齐，用于复算已存在函数的有效动作。" +
        "true=预演为覆盖更新(update)；false（默认）=预演为保守跳过(skip)",
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
        yes: z
          .boolean()
          .optional()
          .describe(
            "与 deployApply 的 yes 对齐，用于复算已存在函数的有效动作。" +
              "true=预演为覆盖更新；false（默认）=预演为保守跳过",
          ),
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
      yes,
    }: {
      cwd?: string;
      mode?: string;
      envId?: string;
      only?: ResourceType[];
      skip?: ResourceType[];
      yes?: boolean;
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
        const rawPlan = await manager.getDeployOrchestrator().deployPlan({
          config,
          envId,
          cwd: projectRoot,
          only,
          skip,
          dryRun: true,
        });

        // 按 yes 复算为「实际会发生的动作」，使预演与 deployApply 的执行结果一致
        const plan = reconcilePlanWithExecution(rawPlan, yes === true);

        return jsonContent(
          buildEnvelope(
            { cwd: projectRoot, mode: mode ?? null, envId, yes: yes === true, plan },
            "已生成声明式部署计划",
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );

  // 工具二：deployApply —— 写操作，执行声明式部署（本地形态的 apply，与 deployPlan 对仗）
  server.registerTool?.(
    "deployApply",
    {
      title: "执行 CloudBase 声明式部署（本地 apply）",
      description:
        "解析 cloudbaserc 并按 database→functions→app→hosting→gateway 顺序执行声明式部署。" +
        "这是 deployPlan 的执行对仗工具（plan 预演 / deployApply 执行同一份 cloudbaserc），" +
        "属于本地形态的 apply（读本地 cloudbaserc 并在本地构建上传），" +
        "是会变更云端资源的写操作，必须显式传 confirm=true 才会执行。" +
        "建议先用 deployPlan 预演，确认计划无误后再执行。" +
        "\n适用边界：本工具用于项目级声明式编排（一份 cloudbaserc 统一 plan/apply）；" +
        "单资源临时直传请用 manageFunctions/manageHosting/manageApps。" +
        "\n- confirm：必须显式传 true 才执行部署，否则直接拒绝" +
        "\n- confirmDestructive：当本次待执行的数据库迁移含破坏性语句（DROP/TRUNCATE/DELETE、" +
        "ALTER…DROP/RENAME）时，除 confirm 外还必须显式传 confirmDestructive=true 才会执行；" +
        "否则拒绝并列出命中的迁移与语句。无破坏性迁移时该参数不生效" +
        "\n- cwd：项目根目录，默认当前工作目录" +
        "\n- mode：环境名，命中 envOverrides.<mode> 时合并对应的多环境覆盖配置" +
        "\n- envId：目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境" +
        "\n- only：仅部署指定资源类型" +
        "\n- skip：跳过指定资源类型" +
        "\n- yes：遇到已存在资源时的处理方式。true=直接覆盖更新；false（默认）=保守跳过，" +
        "在无法交互确认的场景下已存在资源不会被覆盖（与 deployPlan 的 yes 语义一致）" +
        "\n- concurrency：同类型资源最大并行数，默认 1（串行）" +
        "\n- continueOnError：某个资源失败后继续部署其余资源（database 失败仍强制中断）",
      inputSchema: {
        confirm: z
          .boolean()
          .optional()
          .describe("危险操作确认开关。部署会变更云端资源，必须显式传 confirm=true 才会执行"),
        confirmDestructive: z
          .boolean()
          .optional()
          .describe(
            "破坏性数据库变更确认开关。当待执行迁移含 DROP/TRUNCATE/DELETE 或 ALTER…DROP/RENAME 时，" +
              "必须在 confirm=true 之外额外显式传 confirmDestructive=true；无破坏性迁移时不生效",
          ),
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
      confirmDestructive,
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
      confirmDestructive?: boolean;
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
          throw new DeployError(
            DEPLOY_ERROR_CODES.CONFIRM_REQUIRED,
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
        const orchestrator = manager.getDeployOrchestrator();

        // 破坏性数据库变更门：仅当 database 参与本次部署时，先 dry-run 取 pending 迁移，
        // 检测破坏性语句；命中且未额外确认则拒绝，独立于总 confirm 之外多一道门。
        const databaseParticipates =
          !!config.database &&
          (!only || only.includes("database")) &&
          !(skip ?? []).includes("database");
        if (databaseParticipates && confirmDestructive !== true) {
          const dryRunPlan = await orchestrator.deployPlan({
            config,
            envId,
            cwd: projectRoot,
            only,
            skip,
            dryRun: true,
          });
          const destructive = detectDestructiveMigrations({
            plan: Array.isArray(dryRunPlan) ? (dryRunPlan as PlanItem[]) : [],
            cwd: projectRoot,
            databaseConfig: config.database,
          });
          if (destructive.length > 0) {
            throw new DeployError(
              DEPLOY_ERROR_CODES.DESTRUCTIVE_CONFIRM_REQUIRED,
              "本次待执行的数据库迁移包含破坏性语句（DROP/TRUNCATE/DELETE 或 ALTER…DROP/RENAME），" +
                "可能造成数据/结构不可逆丢失。请先备份或复核，确认后额外传 confirmDestructive=true 再执行。" +
                "命中迁移：" +
                destructive
                  .map((d) => `${d.migration}（${d.statements.length} 条破坏性语句）`)
                  .join("；"),
            );
          }
        }

        const result = await orchestrator.deploy({
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
