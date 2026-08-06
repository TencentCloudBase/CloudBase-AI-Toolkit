import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations as SdkToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import {
  applyCategoryAnnotationMeta,
  type ToolAnnotations,
} from "./utils/tool-wrapper.js";

describe("MCP SDK tool annotations category", () => {
  it("keeps annotations.category on the wire and exposes _meta.category to SDK Client", async () => {
    const server = new McpServer({
      name: "category-probe-server",
      version: "0.0.1",
    });

    const annotations: ToolAnnotations = {
      readOnlyHint: true,
      openWorldHint: false,
      category: "env",
    };

    server.registerTool(
      "categoryProbe",
      applyCategoryAnnotationMeta({
        title: "Category probe",
        description: "Verifies CloudBase category annotation survives listTools",
        inputSchema: {},
        annotations: annotations as SdkToolAnnotations,
      }),
      async () => ({
        content: [{ type: "text", text: "ok" }],
      }),
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const wireMessages: Array<Record<string, unknown>> = [];
    const originalOnMessage = clientTransport.onmessage;
    clientTransport.onmessage = (message) => {
      wireMessages.push(message as Record<string, unknown>);
      originalOnMessage?.(message);
    };

    const client = new Client({ name: "category-test-client", version: "0.0.1" });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const listed = await client.listTools();
      const probe = listed.tools.find((tool) => tool.name === "categoryProbe");

      expect(probe).toBeDefined();
      expect(probe?.annotations?.readOnlyHint).toBe(true);
      // Official SDK Client >=1.26 strips unknown annotation keys on parse.
      expect((probe?.annotations as ToolAnnotations | undefined)?.category).toBeUndefined();
      expect(probe?._meta?.category).toBe("env");

      const listResult = wireMessages.find((message) => {
        const result = message.result as { tools?: Array<Record<string, unknown>> } | undefined;
        return Array.isArray(result?.tools);
      });
      const wireTool = (
        listResult?.result as { tools: Array<{ name: string; annotations?: ToolAnnotations }> }
      ).tools.find((tool) => tool.name === "categoryProbe");

      expect(wireTool?.annotations?.category).toBe("env");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
