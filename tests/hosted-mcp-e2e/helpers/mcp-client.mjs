/**
 * Official MCP SDK client helpers (Streamable HTTP).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getMcpEndpoint, getEnvId } from "./env.mjs";
import { createE2EFetch } from "./fetch.mjs";

/**
 * Build MCP endpoint URL, optionally appending env_id query.
 */
export function buildMcpUrl({ envId = getEnvId(), endpoint = getMcpEndpoint() } = {}) {
  const u = new URL(endpoint);
  if (envId && !u.searchParams.get("env_id")) {
    u.searchParams.set("env_id", envId);
  }
  return u;
}

/**
 * Default protocol version for initialize.
 *
 * The official SDK (1.30.x) hardcodes LATEST_PROTOCOL_VERSION (2025-11-25) in
 * the initialize request body; `transport.setProtocolVersion()` only affects
 * the MCP-Protocol-Version header of subsequent requests, so it cannot rescue
 * a server that rejects unknown versions. The hosted staging server currently
 * tops out at 2025-06-18 and returns "Bad Request: Unsupported protocol
 * version" for anything newer (observed 2026-09-02). We therefore patch the
 * outgoing initialize params to a server-supported version, defaulting to
 * 2025-06-18. Override per-connection via opts.protocolVersion or globally
 * via MCP_E2E_PROTOCOL_VERSION.
 */
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

/**
 * Connect an official MCP client over StreamableHTTP.
 * @param {{ headers?: Record<string,string>, envId?: string, protocolVersion?: string }} opts
 */
export async function connectHostedMcpClient(opts = {}) {
  const url = buildMcpUrl({ envId: opts.envId });
  const fetchFn = createE2EFetch();
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        ...(opts.headers || {}),
      },
    },
    fetch: fetchFn,
  });

  const requestedVersion =
    opts.protocolVersion || process.env.MCP_E2E_PROTOCOL_VERSION || DEFAULT_PROTOCOL_VERSION;
  const origSend = transport.send.bind(transport);
  transport.send = async (message) => {
    if (message?.method === "initialize" && message?.params) {
      message.params.protocolVersion = requestedVersion;
    }
    return origSend(message);
  };

  const client = new Client(
    { name: opts.clientName || "hosted-mcp-e2e", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  return { client, transport, url: url.toString() };
}

export async function closeMcp({ client, transport }) {
  try {
    await client?.close();
  } catch {
    // ignore
  }
  try {
    await transport?.close();
  } catch {
    // ignore
  }
}

/**
 * Parse tool call JSON text content.
 */
export function parseToolResult(result) {
  const text = result?.content?.[0]?.text;
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  return parseToolResult(result);
}
