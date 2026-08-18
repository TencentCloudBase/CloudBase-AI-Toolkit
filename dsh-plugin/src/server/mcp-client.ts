import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { DEFAULT_ENV_ID, MCP_PACKAGE, buildMcpPassthroughEnv } from "../shared/constants.js";

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number;
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

export const MCP_REQUEST_TIMEOUT_MS = 45_000;

interface Pending {
  resolve: (value: JsonRpcResponse) => void;
  reject: (error: Error) => void;
}

function encodeMessage(payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
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

export class CloudBaseMcpBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buf: Buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private ready: Promise<void> | null = null;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly command = "npx",
    private readonly args: string[] = ["-y", MCP_PACKAGE],
  ) {}

  async listTools(): Promise<string[]> {
    await this.ensureReady();
    const response = await this.request("tools/list", {});
    const result = asRecord(response.result);
    const tools = Array.isArray(result.tools) ? result.tools : [];
    return tools
      .map((tool) => asRecord(tool).name)
      .filter((name): name is string => typeof name === "string");
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureReady();
    const response = await this.request("tools/call", { name, arguments: args });
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
    const passthrough = buildMcpPassthroughEnv(this.env, DEFAULT_ENV_ID);
    const childEnv: NodeJS.ProcessEnv = {
      ...this.env,
      ...passthrough,
      CLOUDBASE_MCP_DISABLE_LOG_FILE: "true",
    };
    delete childEnv.CLOUDBASE_API_KEY;

    const child = spawn(this.command, this.args, {
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    child.stderr.on("data", () => undefined);
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
      if (typeof message.id !== "number") continue;
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
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
