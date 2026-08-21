#!/usr/bin/env node
/**
 * Stdio MCP proxy for cloudbase-mcp: reads host env-hint file and auto-injects
 * auth(set_env) before env-bound tools. Handles auth action=list_bound_envs locally.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MCP_CMD = process.env.CLOUDBASE_MCP_COMMAND ?? "npx";
const MCP_ARGS = process.env.CLOUDBASE_MCP_ARGS
  ? process.env.CLOUDBASE_MCP_ARGS.split(",")
  : ["-y", "@cloudbase/cloudbase-mcp@latest"];
const HINT_FILE =
  process.env.CLOUDBASE_DSH_ENV_HINT_FILE ?? join(tmpdir(), "cloudbase-dsh-env-hint.json");

let hostBuf = Buffer.alloc(0);
let childBuf = Buffer.alloc(0);
let nextId = 1;
const pending = new Map();
let child = null;
let readyPromise = null;
let lastInjectedEnvId = undefined;

function encodeMessage(payload) {
  const json = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
  const header = Buffer.from(`Content-Length: ${json.length}\r\n\r\n`, "utf8");
  return Buffer.concat([header, json]);
}

function parseFrames(buffer) {
  const messages = [];
  let rest = buffer;
  while (rest.length > 0) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = rest.subarray(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      rest = rest.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (rest.length < bodyStart + length) break;
    const body = rest.subarray(bodyStart, bodyStart + length).toString("utf8");
    rest = rest.subarray(bodyStart + length);
    messages.push(JSON.parse(body));
  }
  return { messages, rest };
}

function readHint() {
  try {
    return JSON.parse(readFileSync(HINT_FILE, "utf8"));
  } catch {
    return undefined;
  }
}

function needsEnv(rawName, args) {
  if (rawName === "auth") {
    const action = typeof args.action === "string" ? args.action : "";
    return !["status", "start_auth", "logout", "login_by_api_key", "list_bound_envs", "set_env"].includes(
      action,
    );
  }
  if (rawName === "downloadTemplate" || rawName === "searchKnowledgeBase") return false;
  return true;
}

function buildListBoundEnvsResult(hint) {
  const bound = Array.isArray(hint?.bound) ? hint.bound : [];
  const activeEnvId = hint?.activeEnvId;
  return {
    ok: true,
    code: "ENV_BOUND_LIST",
    message: activeEnvId ? `当前会话已绑定环境 ${activeEnvId}` : "当前会话尚未绑定环境",
    current_env_id: activeEnvId,
    bound_envs: bound,
  };
}

function sendToChild(message) {
  child.stdin.write(encodeMessage(message));
}

function respond(id, result) {
  process.stdout.write(encodeMessage({ jsonrpc: "2.0", id, result }));
}

function respondError(id, message) {
  process.stdout.write(
    encodeMessage({ jsonrpc: "2.0", id, error: { code: -32000, message } }),
  );
}

function requestChild(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    sendToChild({ jsonrpc: "2.0", id, method, params });
  });
}

function startChild() {
  const childEnv = { ...process.env, CLOUDBASE_MCP_DISABLE_LOG_FILE: "true" };
  delete childEnv.CLOUDBASE_API_KEY;
  for (const key of Object.keys(childEnv)) {
    if (/^https?_proxy$/i.test(key) || key.toLowerCase() === "all_proxy") {
      delete childEnv[key];
    }
  }
  child = spawn(MCP_CMD, MCP_ARGS, { env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => {
    const parsed = parseFrames(Buffer.concat([childBuf, chunk]));
    childBuf = Buffer.from(parsed.rest);
    for (const message of parsed.messages) {
      if (typeof message.id !== "number") continue;
      const item = pending.get(message.id);
      if (!item) continue;
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message ?? "MCP error"));
      else item.resolve(message);
    }
  });
  child.stderr.on("data", (chunk) => {
    if (process.env.CLOUDBASE_MCP_DEBUG === "1") {
      process.stderr.write(`[cloudbase-mcp-proxy] ${chunk.toString("utf8")}`);
    }
  });
  child.on("exit", () => {
    child = null;
    readyPromise = null;
    for (const item of pending.values()) item.reject(new Error("MCP child exited"));
    pending.clear();
  });
}

async function ensureChildReady() {
  if (!child) startChild();
  if (!readyPromise) {
    readyPromise = (async () => {
      await requestChild("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "@cloudbase/dsh-plugin-proxy", version: "0.1.0" },
      });
      sendToChild({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    })();
  }
  await readyPromise;
}

async function injectEnvIfNeeded(rawName, args) {
  const hint = readHint();
  const envId = hint?.activeEnvId;
  if (!envId || !needsEnv(rawName, args)) return;
  if (lastInjectedEnvId === envId) return;
  await requestChild("tools/call", {
    name: "auth",
    arguments: { action: "set_env", envId },
  });
  lastInjectedEnvId = envId;
}

async function handleToolsCall(id, params) {
  const rawName = params?.name;
  const args = params?.arguments ?? {};
  if (typeof rawName !== "string") {
    respondError(id, "tools/call missing name");
    return;
  }
  if (rawName === "auth" && args.action === "list_bound_envs") {
    const payload = buildListBoundEnvsResult(readHint());
    respond(id, {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    });
    return;
  }
  if (rawName === "auth" && args.action === "set_env" && typeof args.envId === "string") {
    lastInjectedEnvId = args.envId;
  }
  await injectEnvIfNeeded(rawName, args);
  const response = await requestChild("tools/call", params);
  respond(id, response.result);
}

process.stdin.on("data", async (chunk) => {
  const parsed = parseFrames(Buffer.concat([hostBuf, chunk]));
  hostBuf = Buffer.from(parsed.rest);
  for (const message of parsed.messages) {
    try {
      await ensureChildReady();
      if (message.method === "tools/call") {
        await handleToolsCall(message.id, message.params);
        continue;
      }
      if (typeof message.id === "number") {
        const response = await requestChild(message.method, message.params ?? {});
        respond(message.id, response.result);
        continue;
      }
      sendToChild(message);
    } catch (error) {
      if (typeof message.id === "number") {
        respondError(message.id, error instanceof Error ? error.message : String(error));
      }
    }
  }
});
