import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { MCP_PACKAGE } from "../shared/constants.js";
import {
  cloudbaseToolNeedsEnv,
  type SessionEnvCache,
} from "./mcp-bridge.js";

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export interface McpToolContent {
  type?: string;
  text?: string;
}

export interface McpCallResult {
  content?: McpToolContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

export const MCP_REQUEST_TIMEOUT_MS = 90_000;

export type EnvChangeListener = (envId: string) => void;

/**
 * MCP server 主动推送的环境变更 notification method
 * （mcp/src/tools/env.ts 的 auth set_env 成功处发送）。
 * 无 id 的 JSON-RPC notification，任何连上 MCP server 的客户端都能收到，
 * 跨客户端通用，替代客户端本地推断 + 兜底轮询。
 */
export const ENV_CHANGED_NOTIFICATION_METHOD = "notifications/cloudbase/env_changed";

/**
 * 从服务端推送的 notification 消息中提取环境变更事件。
 * 非环境变更 notification 或缺少 envId 时返回 undefined。
 */
export function extractEnvChangedNotification(
  message: JsonRpcResponse,
): string | undefined {
  if (message.method !== ENV_CHANGED_NOTIFICATION_METHOD) return undefined;
  const params = asRecord(message.params);
  return typeof params.envId === "string" && params.envId.length > 0
    ? params.envId
    : undefined;
}

interface Pending {
  resolve: (value: JsonRpcResponse) => void;
  reject: (error: Error) => void;
}

function encodeMessage(payload: unknown): Buffer {
  const json = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
  const header = Buffer.from(`Content-Length: ${json.length}\r\n\r\n`, "utf8");
  return Buffer.concat([header, json]);
}

export function parseMcpFrames(
  buffer: Buffer,
): { messages: JsonRpcResponse[]; rest: Buffer } {
  const messages: JsonRpcResponse[] = [];
  let rest = buffer;
  while (rest.length > 0) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      const nl = rest.indexOf(0x0a);
      if (nl === -1) break;
      const line = rest.subarray(0, nl).toString("utf8").trim();
      rest = rest.subarray(nl + 1);
      if (!line) continue;
      try {
        messages.push(JSON.parse(line) as JsonRpcResponse);
      } catch {
        break;
      }
      continue;
    }
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
    messages.push(JSON.parse(body) as JsonRpcResponse);
  }
  return { messages, rest };
}

export function extractToolPayload(result: McpCallResult | undefined): unknown {
  if (!result) return undefined;
  if (result.structuredContent !== undefined) return result.structuredContent;
  const texts = (result.content ?? [])
    .map((item) => item.text)
    .filter((text): text is string => typeof text === "string" && text.length > 0);
  if (texts.length === 0) return result;
  const joined = texts.join("\n");
  try {
    return JSON.parse(joined);
  } catch {
    return joined;
  }
}

export interface CloudBaseMcpBridgeOptions {
  env?: NodeJS.ProcessEnv;
  command?: string;
  args?: string[];
  sessionEnvCache?: SessionEnvCache;
  getSessionId?: () => string | undefined;
}

export class CloudBaseMcpBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buf: Buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private ready: Promise<void> | null = null;
  private lastInjectedEnvId: string | undefined;
  private envListeners = new Set<EnvChangeListener>();

  private readonly env: NodeJS.ProcessEnv;
  private readonly command: string;
  private readonly args: string[];
  private readonly sessionEnvCache?: SessionEnvCache;
  private readonly getSessionId?: () => string | undefined;

  constructor(options: CloudBaseMcpBridgeOptions = {}) {
    this.env = options.env ?? process.env;
    this.command = options.command ?? "npx";
    this.args = options.args ?? ["-y", MCP_PACKAGE];
    this.sessionEnvCache = options.sessionEnvCache;
    this.getSessionId = options.getSessionId;
  }

  async listTools(): Promise<string[]> {
    await this.ensureReady();
    const response = await this.request("tools/list", {});
    const result = asRecord(response.result);
    const tools = Array.isArray(result.tools) ? result.tools : [];
    return tools
      .map((tool) => asRecord(tool).name)
      .filter((name): name is string => typeof name === "string");
  }

  /**
   * 订阅环境变更事件。触发点：会话 AI 调 auth set_env 成功（显式或
   * ensureSessionEnv 隐式重绑）。面板用它做事件驱动状态同步，替代云端轮询。
   */
  onEnvChanged(listener: EnvChangeListener): () => void {
    this.envListeners.add(listener);
    return () => {
      this.envListeners.delete(listener);
    };
  }

  private notifyEnvChanged(envId: string): void {
    for (const listener of this.envListeners) {
      listener(envId);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureReady();
    if (name === "auth" && args.action === "set_env" && typeof args.envId === "string") {
      const response = await this.request("tools/call", { name, arguments: args });
      const payload = this.unwrapResponse(response, name);
      // 成功后才记录注入态并广播：失败时保留旧绑定，避免观察者误同步
      this.lastInjectedEnvId = args.envId;
      this.notifyEnvChanged(args.envId);
      return payload;
    }
    const rebound = await this.ensureSessionEnv(name, args);
    if (rebound) this.notifyEnvChanged(rebound);
    const response = await this.request("tools/call", { name, arguments: args });
    return this.unwrapResponse(response, name);
  }

  dispose(): void {
    for (const item of this.pending.values()) {
      item.reject(new Error("MCP bridge disposed"));
    }
    this.pending.clear();
    this.child?.kill();
    this.child = null;
    this.ready = null;
  }

  private ensureReady(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this.start();
    return this.ready;
  }

  private async start(): Promise<void> {
    // 不注入任何 CloudBase env：登录走 cloudbase-mcp 自身的 device-code 流程
    // （auth 工具 start_auth device），环境由用户登录后通过 auth set_env 选择。
    // 透传 CLOUDBASE_API_KEY 会挡掉 device-code（无效 key 走 Key 模式）。
    const childEnv: NodeJS.ProcessEnv = {
      ...this.env,
      CLOUDBASE_MCP_DISABLE_LOG_FILE: "true",
    };
    delete childEnv.CLOUDBASE_API_KEY;
    // 清除代理变量：cloudbase-mcp 内部用 process.env.http_proxy 连 CloudBase API 与
    // PG（TDSQL 内网），继承 IDE/沙箱代理（如 WorkBuddy sandbox-c 57514）会让连接
    // 卡死/超时（2026-08-19 实测 queryPgDatabase 无响应）。auth 与 API 走公网，
    // 不依赖本地代理。
    for (const key of Object.keys(childEnv)) {
      if (/^https?_proxy$/i.test(key) || key.toLowerCase() === "all_proxy") {
        delete childEnv[key];
      }
    }

    const child = spawn(this.command, this.args, {
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      if (this.env.CLOUDBASE_MCP_DEBUG === "1") {
        process.stderr.write(`[cloudbase-mcp] ${chunk.toString("utf8")}`);
      }
    });
    child.on("exit", () => {
      this.child = null;
      this.ready = null;
      for (const item of this.pending.values()) {
        item.reject(new Error("MCP server exited"));
      }
      this.pending.clear();
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "@cloudbase/dsh-plugin", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
  }

  private onData(chunk: Buffer): void {
    const parsed = parseMcpFrames(Buffer.concat([this.buf, chunk]));
    this.buf = Buffer.from(parsed.rest);
    for (const message of parsed.messages) {
      if (typeof message.id !== "number") {
        // 服务端主动推送的 notification（无 id）：识别环境变更事件并广播。
        // 跨客户端通用 —— 无论 set_env 由哪个会话/客户端发起，只要连的是
        // 同一个 MCP server 进程，本 bridge 都能收到并同步面板状态。
        const envId = extractEnvChangedNotification(message);
        if (envId) {
          this.lastInjectedEnvId = envId;
          this.notifyEnvChanged(envId);
        }
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      pending.resolve(message);
    }
  }

  private request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, MCP_REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.child?.stdin.write(encodeMessage({ jsonrpc: "2.0", id, method, params }));
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.child?.stdin.write(encodeMessage({ jsonrpc: "2.0", method, params }));
  }

  private unwrapResponse(response: JsonRpcResponse, name: string): unknown {
    if (response.error) {
      throw new Error(response.error.message || `MCP ${name} failed`);
    }
    const result = (response.result ?? {}) as McpCallResult;
    if (result.isError) {
      const payload = extractToolPayload(result);
      const message =
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload ?? { message: `MCP ${name} returned isError` });
      throw new Error(message);
    }
    return extractToolPayload(result);
  }

  private async ensureSessionEnv(name: string, args: Record<string, unknown>): Promise<string | undefined> {
    if (!this.sessionEnvCache || !cloudbaseToolNeedsEnv(name, args)) return undefined;
    const sessionId = this.getSessionId?.();
    if (!sessionId) return undefined;
    const bound = this.sessionEnvCache.get(sessionId);
    if (!bound?.envId || bound.envId === this.lastInjectedEnvId) return undefined;
    await this.request("tools/call", {
      name: "auth",
      arguments: { action: "set_env", envId: bound.envId },
    });
    this.lastInjectedEnvId = bound.envId;
    return bound.envId;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
