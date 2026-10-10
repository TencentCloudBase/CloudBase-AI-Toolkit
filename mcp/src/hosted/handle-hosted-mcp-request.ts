import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCloudBaseMcpServer } from "../server.js";
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
 * One stateless JSON MCP request: a new server and SDK 1.30 transport, then close both.
 * Protocol versions are not rewritten. SDK 1.30 accepts `2025-11-25`. Later or
 * malformed `mcp-protocol-version` headers are passed through and rejected by the transport.
 */
export async function handleHostedMcpRequest(input: HostedMcpRequestInput): Promise<void> {
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

  try {
    server = await createCloudBaseMcpServer({
      name: input.serverOptions.name,
      version: input.serverOptions.version,
      enableTelemetry: input.serverOptions.enableTelemetry,
      cloudBaseOptions: input.serverOptions.cloudBaseOptions,
      cloudMode: input.serverOptions.cloudMode ?? true,
      ide: input.serverOptions.ide,
      client: input.serverOptions.client,
      clientInfo,
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
    });
    input.res.on("close", closeBoth);
    input.req.on("aborted", closeBoth);

    await server.connect(transport);
    await transport.handleRequest(input.req, input.res, input.body);
  } catch (error) {
    await Promise.allSettled([transport?.close(), server?.close()]);
    input.logger?.({
      type: "cloudbase-mcp-create-server-error",
      message: error instanceof Error ? error.message : String(error),
    });
    writeJsonRpcError(input.res, input.body);
  }
}
