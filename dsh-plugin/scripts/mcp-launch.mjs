#!/usr/bin/env node
/**
 * Launch cloudbase-mcp with stdio inherited by the caller.
 *
 * dsh-mcp-client owns the MCP framing. This process only resolves the binary,
 * drops credentials and proxy variables, and execs. It does not parse JSON-RPC.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MCP_PACKAGE = "@cloudbase/cloudbase-mcp@latest";

function findCachedBin() {
  const npxRoot = join(homedir(), ".npm", "_npx");
  if (!existsSync(npxRoot)) return undefined;
  let best;
  let entries;
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

function findCachedEntry(bin) {
  const entry = join(dirname(dirname(bin)), "@cloudbase", "cloudbase-mcp", "dist", "cli.cjs");
  return existsSync(entry) ? entry : undefined;
}

function resolveLaunch() {
  if (process.env.CLOUDBASE_MCP_COMMAND) {
    return {
      command: process.env.CLOUDBASE_MCP_COMMAND,
      args: process.env.CLOUDBASE_MCP_ARGS
        ? process.env.CLOUDBASE_MCP_ARGS.split(",").map((part) => part.trim()).filter(Boolean)
        : ["-y", MCP_PACKAGE],
      shell: false,
    };
  }
  const cached = findCachedBin();
  if (cached) {
    const entry = findCachedEntry(cached);
    if (entry) return { command: process.execPath, args: [entry], shell: false };
    if (process.platform !== "win32") return { command: cached, args: [], shell: false };
  }
  return { command: "npx", args: ["-y", MCP_PACKAGE], shell: process.platform === "win32" };
}

function childEnv() {
  const env = { ...process.env, CLOUDBASE_MCP_DISABLE_LOG_FILE: "true" };
  delete env.CLOUDBASE_API_KEY;
  for (const key of Object.keys(env)) {
    if (/^https?_proxy$/i.test(key) || key.toLowerCase() === "all_proxy") delete env[key];
  }
  return env;
}

const { command, args, shell } = resolveLaunch();
const child = spawn(command, args, { env: childEnv(), stdio: "inherit", shell });
child.on("error", (error) => {
  process.stderr.write(`[cloudbase-mcp-launch] ${error.message}\n`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
