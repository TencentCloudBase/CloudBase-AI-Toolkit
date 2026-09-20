import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MCP_PACKAGE } from "../shared/constants.js";

export interface McpLaunchSpec {
  command: string;
  args: string[];
  /** How the command was resolved (for logs / tests). */
  source: "env" | "npx-cache" | "npx";
  /**
   * Whether the command must run through a shell. `npx` resolves to `npx.cmd`
   * on Windows, which `spawn` cannot execute directly → ENOENT. The env /
   * npx-cache branches already point at real executables and must NOT use a
   * shell (a shell would re-quote paths that already contain spaces, e.g. a
   * `CLOUDBASE_MCP_COMMAND` pointing at "C:\Program Files\nodejs\node.exe").
   */
  shell?: boolean;
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
 * Resolve the CLI entry of a cached `@cloudbase/cloudbase-mcp` install from its
 * `.bin` shim path.
 *
 * npm links `.bin/cloudbase-mcp` as an extension-less sh shim (cmd-shim also
 * writes `.cmd` / `.ps1`). Neither is spawnable on Windows: the sh shim is not
 * a PE image, and Node ≥18.20.2 rejects `.cmd` without `shell: true` (EINVAL,
 * CVE-2024-27980). Running the package's real JS entry through
 * `process.execPath` bypasses shims on every platform.
 */
export function findCachedCloudbaseMcpEntry(bin: string): string | undefined {
  const entry = join(
    dirname(dirname(bin)),
    "@cloudbase",
    "cloudbase-mcp",
    "dist",
    "cli.cjs",
  );
  return existsSync(entry) ? entry : undefined;
}

/**
 * Resolve MCP process launch: CLOUDBASE_MCP_COMMAND override → cached install → npx fallback.
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
    const entry = findCachedCloudbaseMcpEntry(cached);
    if (entry) {
      return { command: process.execPath, args: [entry], source: "npx-cache" };
    }
    // The sh shim is a POSIX script: spawnable on POSIX shells only. On win32
    // it would fail, so fall through to the npx fallback instead.
    if (process.platform !== "win32") {
      return { command: cached, args: [], source: "npx-cache" };
    }
  }
  return {
    command: "npx",
    args: ["-y", MCP_PACKAGE],
    source: "npx",
    shell: process.platform === "win32",
  };
}
