import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MCP_PACKAGE } from "../shared/constants.js";

export interface McpLaunchSpec {
  command: string;
  args: string[];
  /** How the command was resolved (for logs / tests). */
  source: "env" | "npx-cache" | "npx";
}

/**
 * Prefer a locally cached npx bin over live `npx -y …@latest`.
 * On slow networks `npx` version checks can hang and block the MCP bridge.
 */
export function findCachedCloudbaseMcpBin(
  npxRoot: string = join(homedir(), ".npm", "_npx"),
): string | undefined {
  if (!existsSync(npxRoot)) return undefined;
  let best: { path: string; mtime: number } | undefined;
  let entries: string[];
  try {
    entries = readdirSync(npxRoot);
  } catch {
    return undefined;
  }
  for (const name of entries) {
    const bin = join(npxRoot, name, "node_modules", ".bin", "cloudbase-mcp");
    if (!existsSync(bin)) continue;
    let mtime = 0;
    try {
      mtime = statSync(bin).mtimeMs;
    } catch {
      continue;
    }
    if (!best || mtime > best.mtime) best = { path: bin, mtime };
  }
  return best?.path;
}

/**
 * Resolve MCP process launch: CLOUDBASE_MCP_COMMAND override → cached bin → npx fallback.
 */
export function resolveMcpLaunch(
  env: NodeJS.ProcessEnv = process.env,
  options: { npxRoot?: string } = {},
): McpLaunchSpec {
  const envCmd = env.CLOUDBASE_MCP_COMMAND?.trim();
  if (envCmd) {
    const args = env.CLOUDBASE_MCP_ARGS
      ? env.CLOUDBASE_MCP_ARGS.split(",").map((s) => s.trim()).filter(Boolean)
      : ["-y", MCP_PACKAGE];
    return { command: envCmd, args, source: "env" };
  }
  const cached = findCachedCloudbaseMcpBin(options.npxRoot);
  if (cached) {
    return { command: cached, args: [], source: "npx-cache" };
  }
  return { command: "npx", args: ["-y", MCP_PACKAGE], source: "npx" };
}
