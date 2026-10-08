import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

const closeServer = vi.fn(async () => undefined);

vi.mock("../server.js", () => ({
  createCloudBaseMcpServer: vi.fn(async () => ({
    close: closeServer,
    connect: async () => {
      throw new Error("create exploded secretId=AKIDsecret");
    },
  })),
}));

import { handleHostedMcpRequest } from "./handle-hosted-mcp-request.js";

describe("hosted create failure", () => {
  it("returns HTTP 500 JSON-RPC and closes the server it created", async () => {
    const server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      await handleHostedMcpRequest({
        req,
        res,
        body: raw ? JSON.parse(raw) : undefined,
        serverOptions: {
          cloudMode: true,
          pluginsEnabled: ["env"],
          cloudBaseOptions: { secretId: "AKIDsecret", secretKey: "secret-key" },
        },
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }),
      });
      const text = await response.text();
      expect(response.status).toBe(500);
      expect(text).not.toContain("AKIDsecret");
      const body = JSON.parse(text) as { jsonrpc: string; id: number; error: { code: number; message: string } };
      expect(body).toMatchObject({
        jsonrpc: "2.0",
        id: 7,
        error: { code: -32603, message: "Failed to create MCP server" },
      });
      expect(closeServer).toHaveBeenCalled();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
