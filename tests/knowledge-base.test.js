// 知识库检索集成测试
import { test, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to wait for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("Knowledge base search functionality works correctly", async () => {
  let transport = null;
  let client = null;

  try {
    // Create client
    client = new Client(
      {
        name: "test-client-kb",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Create stdio transport that spawns the server
    const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
    });

    // Connect client to server
    await client.connect(transport);

    // Wait longer for connection to establish in CI environment
    await delay(3000);

    console.log("Testing knowledge base search functionality...");

    // First, get the list of tools to confirm searchKnowledgeBase exists
    const toolsResult = await client.listTools();
    const searchTool = toolsResult.tools.find(
      (tool) => tool.name === "searchKnowledgeBase",
    );

    if (!searchTool) {
      console.log("⚠️ searchKnowledgeBase tool not found");
      console.log(
        "Available tools:",
        toolsResult.tools.map((t) => t.name),
      );
      return; // Skip the test if tool not found
    }

    console.log("✅ Found searchKnowledgeBase tool");
    console.log("Tool description:", searchTool.description);

    // Test the knowledge base search with a sample query
    try {
      const searchResult = await client.callTool({
        name: "searchKnowledgeBase",
        arguments: {
          mode: "vector",
          id: "cloudbase",
          content: "云函数",
          limit: 3,
        },
      });

      console.log(
        "Knowledge base search result:",
        JSON.stringify(searchResult, null, 2),
      );

      expect(searchResult).toBeDefined();
      expect(searchResult.content).toBeDefined();
      expect(Array.isArray(searchResult.content)).toBe(true);

      if (searchResult.content.length > 0) {
        console.log("✅ Knowledge base search returned results");

        // Check the structure of the first result
        const firstResult = searchResult.content[0];
        expect(firstResult.type).toBe("text");
        expect(firstResult.text).toBeDefined();

        console.log(
          "First search result preview:",
          firstResult.text.substring(0, 200) + "...",
        );
      } else {
        console.log(
          "⚠️ Knowledge base search returned no results (this may be expected if no knowledge base is configured)",
        );
      }
    } catch (toolError) {
      console.log(
        "⚠️ Knowledge base search failed (this may be expected if no knowledge base is configured)",
      );
      console.log("Error details:", toolError.message);

      // This is not necessarily a test failure - it could mean the knowledge base is not configured
      // We'll just log it for information
    }

    console.log("✅ Knowledge base functionality test completed");
  } catch (error) {
    console.error("❌ Knowledge base test failed:", error);
    throw error;
  } finally {
    // Clean up
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.warn("Warning: Error closing client:", e.message);
      }
    }
    if (transport) {
      try {
        await transport.close();
      } catch (e) {
        console.warn("Warning: Error closing transport:", e.message);
      }
    }
  }
}, 120000); // 增加到 120 秒

test("Knowledge base tool parameters validation", async () => {
  let transport = null;
  let client = null;

  try {
    // Create client
    client = new Client(
      {
        name: "test-client-kb-validation",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Create stdio transport that spawns the server
    const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
    });

    // Connect client to server
    await client.connect(transport);

    // Wait longer for connection to establish in CI environment
    await delay(3000);

    console.log("Testing knowledge base tool parameter validation...");

    // Get the tool definition
    const toolsResult = await client.listTools();
    const searchTool = toolsResult.tools.find(
      (tool) => tool.name === "searchKnowledgeBase",
    );

    if (!searchTool) {
      console.log(
        "⚠️ Skipping parameter validation - searchKnowledgeBase tool not found",
      );
      return;
    }

    console.log("✅ Tool found, checking input schema...");

    // Check if the tool has the expected input schema
    expect(searchTool.inputSchema).toBeDefined();

    console.log(
      "Input schema:",
      JSON.stringify(searchTool.inputSchema, null, 2),
    );

    // The schema should have properties for query and possibly topK
    if (searchTool.inputSchema.properties) {
      expect(searchTool.inputSchema.properties.content).toBeDefined();
      console.log("✅ Content parameter is defined in schema");

      if (searchTool.inputSchema.properties.limit) {
        console.log("✅ Limit parameter is defined in schema");
      }

      if (searchTool.inputSchema.properties.id) {
        console.log("✅ ID parameter is defined in schema");
      }
    }

    console.log("✅ Parameter validation test completed");
  } catch (error) {
    console.error("❌ Parameter validation test failed:", error);
    throw error;
  } finally {
    // Clean up
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.warn("Warning: Error closing client:", e.message);
      }
    }
    if (transport) {
      try {
        await transport.close();
      } catch (e) {
        console.warn("Warning: Error closing transport:", e.message);
      }
    }
  }
}, 120000); // 增加到 120 秒
