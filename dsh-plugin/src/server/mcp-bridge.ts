import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoundEnvEntry, ListBoundEnvsResult } from "../shared/types.js";

/**
 * 从编译产物位置向上定位包根（含 package.json 的目录）。
 * 源码布局是 src/server/（上两级），打包产物布局是 dist/（上一级），
 * 写死级数会在其中一种布局下指到包外，向上扫描对两种布局都成立。
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

const PACKAGE_ROOT = findPackageRoot(dirname(fileURLToPath(import.meta.url)));

export interface McpClientPatchConfig {
  serverName: string;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** In-memory session env binding (cleared on host restart). */
export class SessionEnvCache {
  private readonly entries = new Map<string, BoundEnvEntry>();

  get(sessionId: string): BoundEnvEntry | undefined {
    return this.entries.get(sessionId);
  }

  set(sessionId: string, envId: string, alias?: string): BoundEnvEntry {
    const entry: BoundEnvEntry = {
      sessionId,
      envId,
      alias,
      updatedAt: Date.now(),
    };
    this.entries.set(sessionId, entry);
    return entry;
  }

  clear(sessionId: string): void {
    this.entries.delete(sessionId);
  }

  list(): BoundEnvEntry[] {
    return [...this.entries.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  listForSession(sessionId: string): ListBoundEnvsResult {
    const current = this.entries.get(sessionId);
    return {
      bound: this.list(),
      current,
    };
  }
}

const ENV_HINT_FILENAME = "cloudbase-dsh-env-hint.json";

export function envHintFilePath(): string {
  const override = process.env.CLOUDBASE_DSH_ENV_HINT_FILE;
  if (override) return override;
  return join(tmpdir(), ENV_HINT_FILENAME);
}

export interface EnvHintPayload {
  activeEnvId?: string;
  activeSessionId?: string;
  bound: BoundEnvEntry[];
  updatedAt: number;
}

/** Sync host cache into a file the session MCP proxy reads before each tool call. */
export function writeEnvHint(cache: SessionEnvCache, sessionId?: string, activeEnvId?: string): void {
  const path = envHintFilePath();
  mkdirSync(dirname(path), { recursive: true });
  const payload: EnvHintPayload = {
    activeEnvId,
    activeSessionId: sessionId,
    bound: cache.list(),
    updatedAt: Date.now(),
  };
  writeFileSync(path, JSON.stringify(payload), "utf8");
}

export function readEnvHint(): EnvHintPayload | undefined {
  try {
    const raw = readFileSync(envHintFilePath(), "utf8");
    return JSON.parse(raw) as EnvHintPayload;
  } catch {
    return undefined;
  }
}

export function mcpEnvProxyScriptPath(): string {
  return join(PACKAGE_ROOT, "scripts", "mcp-env-proxy.mjs");
}

export function buildMcpClientConfig(
  _env: NodeJS.ProcessEnv = process.env,
): McpClientPatchConfig {
  const hintFile = envHintFilePath();
  return {
    serverName: "cloudbase",
    transport: "stdio",
    command: "node",
    args: [mcpEnvProxyScriptPath()],
    env: {
      CLOUDBASE_DSH_ENV_HINT_FILE: hintFile,
    },
  };
}

export function loginHint(signedIn: boolean): string {
  if (signedIn) {
    return "CloudBase 已复用本机登录态。可直接调用 mcp__cloudbase__* 工具。";
  }
  return [
    "CloudBase 尚未登录。请调用 mcp__cloudbase__auth，action=start_auth，authMode=device。",
    "打开返回的 verification URL，在浏览器完成授权后登录态会持久化，无需 API Key。",
    "不要设置无效的 CLOUDBASE_API_KEY，否则会挡住 device-code 流程。",
  ].join(" ");
}

const CLOUDBASE_PUBLIC_PREFIX = "mcp__cloudbase__";

export function isCloudbasePublicTool(toolName: string): boolean {
  return toolName.startsWith(CLOUDBASE_PUBLIC_PREFIX);
}

export function cloudbaseRawToolName(publicName: string): string {
  return publicName.startsWith(CLOUDBASE_PUBLIC_PREFIX)
    ? publicName.slice(CLOUDBASE_PUBLIC_PREFIX.length)
    : publicName;
}

const AUTH_SKIP_INJECT = new Set([
  "status",
  "start_auth",
  "logout",
  "login_by_api_key",
  "list_bound_envs",
  "set_env",
]);

/** Query/manage tools that require a bound env before execution. */
export function cloudbaseToolNeedsEnv(rawToolName: string, args: Record<string, unknown>): boolean {
  if (rawToolName === "auth") {
    const action = typeof args.action === "string" ? args.action : "";
    return !AUTH_SKIP_INJECT.has(action);
  }
  if (rawToolName === "downloadTemplate" || rawToolName === "searchKnowledgeBase") {
    return false;
  }
  return true;
}

export function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function buildListBoundEnvsPayload(result: ListBoundEnvsResult): Record<string, unknown> {
  return {
    ok: true,
    code: "ENV_BOUND_LIST",
    message: result.current
      ? `当前会话已绑定环境 ${result.current.envId}`
      : "当前会话尚未绑定环境",
    current_env_id: result.current?.envId,
    bound_envs: result.bound,
  };
}

export function resolveSessionId(session: unknown): string {
  if (typeof session === "object" && session !== null) {
    const row = session as { id?: string; sessionId?: string };
    const id = row.id ?? row.sessionId;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return "default";
}
