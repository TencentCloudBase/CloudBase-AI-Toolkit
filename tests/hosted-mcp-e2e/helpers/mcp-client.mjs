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

  const client = new Client(
    { name: opts.clientName || "hosted-mcp-e2e", version: "1.0.0" },
    { capabilities: {} },
  );

  if (opts.protocolVersion) {
    transport.setProtocolVersion(opts.protocolVersion);
  }

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
