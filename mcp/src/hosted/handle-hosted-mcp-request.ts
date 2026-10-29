import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  requestBodyTooLargeMessage,
} from "@modelcontextprotocol/sdk/server/requestBody.js";
import { createCloudBaseMcpServer } from "../server.js";
import { runWithEnvSlot, type EnvSlot } from "../utils/env-binding.js";
import { hashCredentialParts } from "../utils/feedback-session.js";
import {
  readHostedClientInfo,
  rememberHostedClientInfo,
  type HostedClientInfoRecord,
} from "./client-info-cache.js";

/**
 * Plain options for a hosted request. No SDK types, so a TypeScript 4.9 host
 * can pass this object without compiling against the MCP SDK.
 */
export type HostedCloudBaseOptions = {
  envId?: string;
  secretId?: string;
  secretKey?: string;
  token?: string;
  useInternalEndpoint?: boolean;
  region?: string;
  site?: string;
  credentialScope?: "env" | "account";
  uin?: string;
};

export type CloudBaseServerOptions = {
  name?: string;
  version?: string;
  enableTelemetry?: boolean;
  cloudBaseOptions?: HostedCloudBaseOptions;
  cloudMode?: boolean;
  ide?: string;
  client?: string;
  clientInfo?: HostedClientInfoRecord;
  lang?: string;
  pluginsEnabled?: string[];
  pluginsDisabled?: string[];
};

export type HostedMcpLogEvent = {
  type: string;
  message?: string;
  timeCost?: number;
};

export type HostedMcpRequestInput = {
  req: IncomingMessage;
  res: ServerResponse;
  body: unknown;
  serverOptions: CloudBaseServerOptions;
  clientInfoHint?: HostedClientInfoRecord;
  logger?: (event: HostedMcpLogEvent) => void;
};

function readInitializeClientInfo(body: unknown): HostedClientInfoRecord | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const record = body as {
    method?: unknown;
    params?: { clientInfo?: { name?: unknown; version?: unknown } };
  };
  if (record.method !== "initialize") {
    return undefined;
  }
  const name = typeof record.params?.clientInfo?.name === "string"
    ? record.params.clientInfo.name.trim()
    : "";
  if (!name) {
    return undefined;
  }
  const version = typeof record.params?.clientInfo?.version === "string"
    ? record.params.clientInfo.version.trim()
    : "";
  return version ? { name, version } : { name };
}

function normalizeHint(hint: HostedClientInfoRecord | undefined): HostedClientInfoRecord | undefined {
  const name = typeof hint?.name === "string" ? hint.name.trim() : "";
  if (!name) {
    return undefined;
  }
  const version = typeof hint?.version === "string" ? hint.version.trim() : "";
  return version ? { name, version } : { name };
}

function requestId(body: unknown): string | number | null {
  if (!body || typeof body !== "object" || !("id" in body)) {
    return null;
  }
  const id = (body as { id?: unknown }).id;
  if (typeof id === "string" || typeof id === "number") {
    return id;
  }
  return null;
}

function writeJsonRpcError(res: ServerResponse, body: unknown): void {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  res.statusCode = 500;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32603,
      message: "Failed to create MCP server",
    },
    id: requestId(body),
  }));
}

/**
 * 托管入口的请求体上限。调用方已经把 body 解析成对象再传进来（见
 * `HostedMcpRequestInput.body`），SDK 只在它自己读流时才检查大小，所以必须在这里
 * 按声明的 content-length 补一道。真正的上限还得由解析方设置（托管网关、
 * express.json、Fastify 之类），否则分配已经发生在那一层。
 */
const MAX_HOSTED_REQUEST_BODY_BYTES = DEFAULT_MAX_REQUEST_BODY_SIZE;

function declaredBodyBytes(req: IncomingMessage): number | undefined {
  const raw = req.headers["content-length"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return undefined;
  }
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : undefined;
}

function writeBodyTooLarge(res: ServerResponse, body: unknown): void {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  res.statusCode = 413;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: requestBodyTooLargeMessage(MAX_HOSTED_REQUEST_BODY_BYTES),
    },
    id: requestId(body),
  }));
}

/**
 * One stateless JSON MCP request: a new server and transport, then close both.
 * Protocol versions are not rewritten. The SDK accepts `2025-11-25`. Later or
 * malformed `mcp-protocol-version` headers are passed through and rejected by the transport.
 */
export async function handleHostedMcpRequest(input: HostedMcpRequestInput): Promise<void> {
  const declaredBytes = declaredBodyBytes(input.req);
  if (declaredBytes !== undefined && declaredBytes > MAX_HOSTED_REQUEST_BODY_BYTES) {
    input.logger?.({
      type: "cloudbase-mcp-request-body-too-large",
      message: `declared ${declaredBytes} bytes`,
    });
    writeBodyTooLarge(input.res, input.body);
    return;
  }

  const credentialHash = hashCredentialParts({
    secretId: input.serverOptions.cloudBaseOptions?.secretId,
    token: input.serverOptions.cloudBaseOptions?.token,
    site: input.serverOptions.cloudBaseOptions?.site,
  });
  const fromInitialize = readInitializeClientInfo(input.body);
  if (credentialHash && fromInitialize) {
    rememberHostedClientInfo(credentialHash, fromInitialize);
  }
  const remembered = credentialHash ? readHostedClientInfo(credentialHash) : undefined;
  const clientInfo = fromInitialize ?? remembered ?? normalizeHint(input.clientInfoHint);

  let server: Awaited<ReturnType<typeof createCloudBaseMcpServer>> | undefined;
  let transport: StreamableHTTPServerTransport | undefined;
  const startedAt = Date.now();

  const closeBoth = () => {
    void Promise.allSettled([transport?.close(), server?.close()]);
  };

  const injectedEnvId = input.serverOptions.cloudBaseOptions?.envId;
  const requestSlot: EnvSlot = {
    binding: injectedEnvId
      ? { envId: injectedEnvId, source: "cloudBaseOptions" }
      : null,
  };

  try {
    await runWithEnvSlot(requestSlot, async () => {
      server = await createCloudBaseMcpServer({
        name: input.serverOptions.name,
        version: input.serverOptions.version,
        enableTelemetry: input.serverOptions.enableTelemetry,
        cloudBaseOptions: input.serverOptions.cloudBaseOptions,
        cloudMode: input.serverOptions.cloudMode ?? true,
        ide: input.serverOptions.ide,
        client: input.serverOptions.client,
        clientInfo,
        // Session id comes from this transport. Stateless mode leaves it undefined.
        getSessionId: () => transport?.sessionId,
        lang: input.serverOptions.lang,
        pluginsEnabled: input.serverOptions.pluginsEnabled,
        pluginsDisabled: input.serverOptions.pluginsDisabled,
      });
      input.logger?.({
        type: "cloudbase-mcp-server-create",
        timeCost: Date.now() - startedAt,
      });

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        // 只有在 handler 没拿到已解析 body、由 transport 自己读流时才生效；
        // 当前调用方总会传 input.body，所以真正起作用的是上面那道 content-length 检查。
        maxRequestBodySize: MAX_HOSTED_REQUEST_BODY_BYTES,
      });
      input.res.on("close", closeBoth);
      input.req.on("aborted", closeBoth);

      await server.connect(transport);
      await transport.handleRequest(input.req, input.res, input.body);
    });
  } catch (error) {
    await Promise.allSettled([transport?.close(), server?.close()]);
    input.logger?.({
      type: "cloudbase-mcp-create-server-error",
      message: error instanceof Error ? error.message : String(error),
    });
    writeJsonRpcError(input.res, input.body);
  }
}
