import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvVariables } from "@cloudbase/toolbox";
import type { ProjectConfig } from "./site-map.js";

const CLOUDBASE_RC_FILENAME = "cloudbaserc.json";

/**
 * `cloudbaserc.json` 中对绑定有效的字段。
 *
 * MCP 对该文件**只读不写**：它是 CLI 维护的人工部署配置（CLI 部署成功后会自动回写），
 * 绑定语义的持久化由 `.cloudbase/project.json`（机器管理）承担。
 */
export interface CloudBaseRcBinding {
  envId?: string;
  region?: string;
  /** MCP 扩展字段（官方 schema 尚未收录，additionalProperties: true），原样返回由调用方 normalize */
  site?: string;
}

/**
 * 解析 cloudbaserc.json 字段值用于绑定（fail-safe：解析不出一律返回 undefined 回落下一级）：
 * - 字面量 → trim 后直接返回
 * - `{{env.KEY}}` → 从项目根 `.env` / `.env.local` 解析（复用 @cloudbase/toolbox 的
 *   loadEnvVariables，与 CLI 解析 `{{env.X}}` 同源）；key 缺失/值为空 → undefined
 * - `{{private.X}}` / 其他模板语法 → undefined（私密配置与未知语法不进绑定链）
 *
 * 注意：loadEnvVariables 的 mode 取自 CLI 语境的 yargs.argv.mode，MCP 进程内为 undefined，
 * 即只读 `.env` 与 `.env.local`——MCP 没有"部署模式"概念，该语义是安全的。
 */
function resolveBindingValue(raw: string, projectRoot: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const template = /^\{\{([^{}]+)\}\}$/.exec(trimmed);
  if (!template) {
    return trimmed;
  }
  const templatePath = template[1].trim();
  if (templatePath.startsWith("private.") || !templatePath.startsWith("env.")) {
    return undefined;
  }
  const key = templatePath.slice("env.".length).trim();
  if (!key) {
    return undefined;
  }
  try {
    const envVars = loadEnvVariables(projectRoot) as Record<string, unknown>;
    let value: unknown = envVars;
    for (const part of key.split(".")) {
      if (!value || typeof value !== "object") {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 读取 `cloudbaserc.json` 中绑定相关的字段（envId / region / site）。
 *
 * CLI 项目往往已有该文件（官方契约含 envId + region）；按**字段级**回退与
 * `.cloudbase/project.json` 互补，而不是整文件二选一。只处理 `cloudbaserc.json`
 * （JSON）；`cloudbaserc.js` / `.ts` 需要执行代码，出于安全考虑不读取。
 * 读失败/文件不存在/无有效字段返回 undefined，不阻塞调用方。
 */
export function readCloudbaseRcBinding(cwd?: string): CloudBaseRcBinding | undefined {
  try {
    const projectRoot = cwd ?? process.env.WORKSPACE_FOLDER_PATHS ?? process.cwd();
    const configPath = join(projectRoot, CLOUDBASE_RC_FILENAME);
    if (!existsSync(configPath)) {
      return undefined;
    }
    const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const binding: CloudBaseRcBinding = {};
    if (typeof parsed.envId === "string") {
      binding.envId = resolveBindingValue(parsed.envId, projectRoot);
    }
    if (typeof parsed.region === "string") {
      binding.region = resolveBindingValue(parsed.region, projectRoot);
    }
    if (typeof parsed.site === "string" && parsed.site.trim().length > 0) {
      binding.site = parsed.site.trim();
    }
    return binding.envId || binding.region || binding.site ? binding : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 读取项目级配置 `.cloudbase/project.json`。
 *
 * 该文件是 site/region/envId 的可选持久化来源，让"打开项目即连对服务"
 * （对齐 Vercel `.vercel/project.json` 的三级回退）。读取失败/文件不存在
 * 返回 undefined，不阻塞调用方。
 */
export function readProjectConfig(cwd?: string): ProjectConfig | undefined {
  try {
    const projectRoot = cwd ?? process.env.WORKSPACE_FOLDER_PATHS ?? process.cwd();
    const configPath = join(projectRoot, ".cloudbase", "project.json");
    if (!existsSync(configPath)) {
      return undefined;
    }
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as ProjectConfig;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * 读取项目级绑定的环境 ID。
 *
 * 来源与优先级：
 * 1. `.cloudbase/project.json` 的 `envId`（MCP 机器管理的绑定文件）
 * 2. `cloudbaserc.json` 的 `envId`（CLI 项目已有配置，字面量或 `{{env.X}}` 模板）
 *
 * 该绑定让环境跟随仓库工作区，而不是跟随单个 MCP 进程：
 * 新起的 stdio 进程、以及同一仓库的每个 Git worktree 都能直接命中同一环境，
 * 无需重复 `auth(set_env)`；不同仓库各读自己的文件，绑定不会互相串。
 */
export function readProjectEnvId(cwd?: string): string | undefined {
  const envId = readProjectConfig(cwd)?.envId;
  if (typeof envId === "string") {
    const trimmed = envId.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return readCloudbaseRcBinding(cwd)?.envId;
}
