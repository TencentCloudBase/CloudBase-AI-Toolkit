import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCloudBaseMcpServer } from "../server.js";
import { reportToolCall } from "../utils/telemetry.js";
import { __resetHostedClientInfoCacheForTests } from "./client-info-cache.js";
import { handleHostedMcpRequest } from "./handle-hosted-mcp-request.js";
import { __resetResourceDownloadStateForTests, __setResourceDownloadTimeoutForTests } from "../tools/rag.js";
import { FEEDBACK_TOOL_NAME } from "../tools/feedback.js";

vi.mock("../utils/telemetry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/telemetry.js")>();
  return {
    ...actual,
    reportToolCall: vi.fn(async () => undefined),
  };
});

const reportToolCallMock = vi.mocked(reportToolCall);

type JsonRpc = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: { tools?: Array<{ name: string }> };
  error?: { code?: number; message?: string };
};

async function listen(handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function mcpHandler(options?: {
  secretId?: string;
  clientInfoHint?: { name: string; version?: string };
  pluginsEnabled?: string[];
  enableTelemetry?: boolean;
  logger?: (event: { type: string; message?: string; timeCost?: number }) => void;
}) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : undefined;
    await handleHostedMcpRequest({
      req,
      res,
      body,
      clientInfoHint: options?.clientInfoHint,
      logger: options?.logger,
      serverOptions: {
        name: "cloudbase-mcp",
        enableTelemetry: options?.enableTelemetry ?? false,
        cloudMode: true,
        cloudBaseOptions: {
          envId: "env-test",
          secretId: options?.secretId ?? "secret-test",
          secretKey: "secret-key",
          token: "token-test",
          site: "domestic",
        },
        ...(options?.pluginsEnabled ? { pluginsEnabled: options.pluginsEnabled } : {}),
      },
    });
  };
}

async function postJson(
  port: number,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; contentType: string; json: JsonRpc; text: string }> {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: JsonRpc = {};
  try {
    json = JSON.parse(text) as JsonRpc;
  } catch {
    json = {};
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    json,
    text,
  };
}

describe("hosted MCP adapter", () => {
  afterEach(() => {
    __resetHostedClientInfoCacheForTests();
    __resetResourceDownloadStateForTests();
    reportToolCallMock.mockClear();
  });

  it("returns a stateless JSON response and accepts overlapping requests", async () => {
    const creates: string[] = [];
    const endpoint = await listen(mcpHandler({
      pluginsEnabled: ["env"],
      logger: (event) => {
        if (event.type === "cloudbase-mcp-server-create") {
          creates.push(event.type);
        }
      },
    }));
    try {
      const one = await postJson(endpoint.port, { jsonrpc: "2.0", id: 1, method: "tools/list" });
      expect(one.status).toBe(200);
      expect(one.contentType).toContain("application/json");
      expect(one.text.startsWith("event:")).toBe(false);
      expect(one.json.jsonrpc).toBe("2.0");
      expect(one.json.result?.tools?.some((tool) => tool.name === "queryEnv")).toBe(true);

      const batch = await Promise.all([
        ...Array.from({ length: 10 }, (_item, index) =>
          postJson(endpoint.port, { jsonrpc: "2.0", id: index + 2, method: "tools/list" }),
        ),
        postJson(endpoint.port, { jsonrpc: "2.0", id: 99, method: "ping" }),
      ]);
      expect(batch.every((item) => item.status === 200)).toBe(true);
      expect(batch.every((item) => !item.text.includes("Already connected"))).toBe(true);
      expect(creates).toHaveLength(12);
    } finally {
      await endpoint.close();
    }
  });

  it("accepts notifications/initialized and tools/list in parallel after initialize", async () => {
    const endpoint = await listen(mcpHandler({ pluginsEnabled: ["env"] }));
    try {
      const initialized = await postJson(endpoint.port, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "TestClient", version: "1.0.0" },
        },
      });
      expect(initialized.status).toBeGreaterThanOrEqual(200);
      expect(initialized.status).toBeLessThan(300);

      const [note, listed, ping] = await Promise.all([
        postJson(endpoint.port, { jsonrpc: "2.0", method: "notifications/initialized" }),
        postJson(endpoint.port, { jsonrpc: "2.0", id: 2, method: "tools/list" }),
        postJson(endpoint.port, { jsonrpc: "2.0", id: 3, method: "ping" }),
      ]);
      for (const item of [note, listed, ping]) {
        expect(item.status).toBeGreaterThanOrEqual(200);
        expect(item.status).toBeLessThan(300);
        expect(item.text).not.toContain("Already connected");
      }
    } finally {
      await endpoint.close();
    }
  });

  it("passes protocol versions through to the transport", async () => {
    const endpoint = await listen(mcpHandler({ pluginsEnabled: ["env"] }));
    try {
      const current = await postJson(
        endpoint.port,
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { "mcp-protocol-version": "2025-11-25" },
      );
      const future = await postJson(
        endpoint.port,
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
        { "mcp-protocol-version": "2026-07-28" },
      );
      const malformed = await postJson(
        endpoint.port,
        { jsonrpc: "2.0", id: 3, method: "tools/list" },
        { "mcp-protocol-version": "not-a-version" },
      );
      const missing = await postJson(endpoint.port, { jsonrpc: "2.0", id: 4, method: "tools/list" });

      expect(current.status).toBe(200);
      expect(future.status).toBe(400);
      expect(future.json.error?.message).toContain("2026-07-28");
      expect(malformed.status).toBe(400);
      expect(missing.status).toBe(200);
    } finally {
      await endpoint.close();
    }
  });

  it("uses the clientInfo hint when the handshake is empty, and keeps credentials apart", async () => {
    const previousVitest = process.env.VITEST;
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.VITEST;
    delete process.env.NODE_ENV;
    const endpoint = await listen(mcpHandler({
      pluginsEnabled: ["pg_database"],
      enableTelemetry: true,
      clientInfoHint: { name: "cursor-vscode", version: "9.9.9" },
      secretId: "secret-a",
    }));
    try {
      const hinted = await postJson(endpoint.port, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "managePgDatabase",
          arguments: { action: "dryRun", sql: "SELECT 1" },
        },
      });
      expect(hinted.status).toBe(200);
      expect(reportToolCallMock).toHaveBeenCalled();
      const hintedInfo = reportToolCallMock.mock.calls.at(-1)?.[0].mcpClientInfo;
      expect(hintedInfo).toEqual({ name: "cursor-vscode", version: "9.9.9" });
    } finally {
      await endpoint.close();
      if (previousVitest === undefined) {
        delete process.env.VITEST;
      } else {
        process.env.VITEST = previousVitest;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }

    reportToolCallMock.mockClear();
    delete process.env.VITEST;
    delete process.env.NODE_ENV;
    const other = await listen(mcpHandler({
      pluginsEnabled: ["pg_database"],
      enableTelemetry: true,
      secretId: "secret-b",
    }));
    try {
      await postJson(other.port, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "managePgDatabase",
          arguments: { action: "dryRun", sql: "SELECT 1" },
        },
      });
      const otherInfo = reportToolCallMock.mock.calls.at(-1)?.[0].mcpClientInfo;
      expect(otherInfo).toEqual({});
    } finally {
      await other.close();
      if (previousVitest === undefined) {
        delete process.env.VITEST;
      } else {
        process.env.VITEST = previousVitest;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("remembers handshake clientInfo for a later tools/call on the same credential", async () => {
    const previousVitest = process.env.VITEST;
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.VITEST;
    delete process.env.NODE_ENV;
    const endpoint = await listen(mcpHandler({
      pluginsEnabled: ["env"],
      enableTelemetry: true,
      secretId: "secret-handshake",
    }));
    try {
      const initialized = await postJson(endpoint.port, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "TestClient", version: "1.2.3" },
        },
      });
      expect(initialized.status).toBe(200);

      const endpointB = await listen(mcpHandler({
        pluginsEnabled: ["pg_database"],
        enableTelemetry: true,
        secretId: "secret-handshake",
      }));
      try {
        await postJson(endpointB.port, {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "managePgDatabase",
            arguments: { action: "dryRun", sql: "SELECT 1" },
          },
        });
        expect(reportToolCallMock.mock.calls.at(-1)?.[0].mcpClientInfo).toEqual({
          name: "TestClient",
          version: "1.2.3",
        });
      } finally {
        await endpointB.close();
      }
    } finally {
      await endpoint.close();
      if (previousVitest === undefined) {
        delete process.env.VITEST;
      } else {
        process.env.VITEST = previousVitest;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("exposes feedback on the hosted default tools/list, same as local", async () => {
    __setResourceDownloadTimeoutForTests(20);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
        return originalFetch(input, init);
      }
      throw new Error("offline");
    }) as typeof fetch;
    const endpoint = await listen(mcpHandler());
    try {
      const listed = await postJson(endpoint.port, { jsonrpc: "2.0", id: 1, method: "tools/list" });
      expect(listed.status).toBe(200);
      const names = listed.json.result?.tools?.map((tool) => tool.name) ?? [];
      expect(names).toContain("queryEnv");
      expect(names).toContain(FEEDBACK_TOOL_NAME);
    } finally {
      globalThis.fetch = originalFetch;
      await endpoint.close();
    }
  });

  it("fails when one server instance is shared across two transports", async () => {
    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["env"],
      enableTelemetry: false,
      cloudMode: true,
    });
    const first = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const second = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(first);
      await expect(server.connect(second)).rejects.toThrow(/Already connected to a transport/);
    } finally {
      await Promise.allSettled([first.close(), second.close(), server.close()]);
    }
  });

  it("does not accumulate request listeners across repeated create and close", async () => {
    const endpoint = await listen(mcpHandler({ pluginsEnabled: ["env"] }));
    const handles = () => {
      const getter = (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles;
      return getter ? getter.call(process).length : 0;
    };
    try {
      const before = handles();
      for (let i = 0; i < 500; i += 1) {
        const listed = await postJson(endpoint.port, { jsonrpc: "2.0", id: i, method: "tools/list" });
        expect(listed.status).toBe(200);
      }
      await new Promise((resolve) => setImmediate(resolve));
      expect(handles() - before).toBeLessThanOrEqual(8);
    } finally {
      await endpoint.close();
    }
  });

  it("closes the server when the client disconnects", async () => {
    const endpoint = await listen(mcpHandler({ pluginsEnabled: ["env"] }));
    try {
      const closed = await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port: endpoint.port,
            path: "/mcp",
            method: "POST",
            headers: { "content-type": "application/json" },
          },
          () => reject(new Error("response arrived before abort")),
        );
        req.on("error", () => resolve());
        req.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
        req.end();
        req.destroy();
      });
      expect(closed).toBeUndefined();
      const again = await postJson(endpoint.port, { jsonrpc: "2.0", id: 2, method: "tools/list" });
      expect(again.status).toBe(200);
    } finally {
      await endpoint.close();
    }
  });
});
