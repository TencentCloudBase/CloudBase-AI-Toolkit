// IDE过滤功能测试
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to wait for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("downloadTemplate tool supports IDE filtering", async () => {
  let transport = null;
  let client = null;

  try {
    console.log("Testing downloadTemplate IDE filtering functionality...");

    // Create client
    client = new Client(
      {
        name: "test-client-ide-filtering",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    // Use the CJS CLI for integration testing
    const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      // Only enable the minimal plugin set to speed up server startup in tests
      env: { ...process.env, CLOUDBASE_MCP_PLUGINS_ENABLED: "setup" },
    });

    // Connect client to server
    await client.connect(transport);
    await delay(500);

    console.log("Testing downloadTemplate tool availability...");

    // List tools to find downloadTemplate
    const toolsResult = await client.listTools();
    expect(toolsResult.tools).toBeDefined();
    expect(Array.isArray(toolsResult.tools)).toBe(true);

    const downloadTemplateTool = toolsResult.tools.find(
      (t) => t.name === "downloadTemplate"
    );
    expect(downloadTemplateTool).toBeDefined();
    console.log("✅ downloadTemplate tool found");

    // Check if the tool has IDE parameter
    const toolSchema = downloadTemplateTool.inputSchema;
    expect(toolSchema).toBeDefined();

    // Check if ide parameter exists
    const ideParam = toolSchema.properties?.ide;
    expect(ideParam).toBeDefined();
    expect(ideParam.description).toContain("指定要下载的IDE类型");
    console.log("✅ IDE parameter found in tool schema");

    // Check if ide parameter has correct enum values
    expect(ideParam.enum).toBeDefined();
    expect(Array.isArray(ideParam.enum)).toBe(true);
    expect(ideParam.enum).toContain("all");
    expect(ideParam.enum).toContain("cursor");
    expect(ideParam.enum).toContain("windsurf");
    expect(ideParam.enum).toContain("codebuddy");
    expect(ideParam.enum).toContain("claude-code");
    expect(ideParam.enum).toContain("cline");
    expect(ideParam.enum).toContain("gemini-cli");
    expect(ideParam.enum).toContain("opencode");
    expect(ideParam.enum).toContain("qwen-code");
    expect(ideParam.enum).toContain("baidu-comate");
    expect(ideParam.enum).toContain("openai-codex-cli");
    expect(ideParam.enum).toContain("augment-code");
    expect(ideParam.enum).toContain("github-copilot");
    expect(ideParam.enum).toContain("roocode");
    expect(ideParam.enum).toContain("tongyi-lingma");
    expect(ideParam.enum).toContain("trae");
    expect(ideParam.enum).toContain("vscode");
    console.log("✅ All supported IDE types found in enum");

    console.log("✅ downloadTemplate IDE filtering test passed");
  } catch (error) {
    console.error("❌ downloadTemplate IDE filtering test failed:", error);
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
    if (transport) {
      await transport.close();
    }
  }
}, 90000);

test("downloadTemplate tool requires IDE parameter when not detected", async () => {
  let transport = null;
  let client = null;

  try {
    console.log("Creating client...");
    // Create client
    client = new Client(
      {
        name: "test-client-ide-required",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    // Use the CJS CLI for integration testing
    const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
    const env = { ...process.env };
    delete env.INTEGRATION_IDE; // Ensure INTEGRATION_IDE is not set
    env.CLOUDBASE_MCP_PLUGINS_ENABLED = "setup";
    env.NODE_ENV = "test";
    env.VITEST = "true";

    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env,
    });

    console.log("Connecting to MCP server...");
    // Connect client to server
    await client.connect(transport);
    console.log("Connected. Waiting 500ms...");
    await delay(500);

    // Verify tool is available
    const toolsResult = await client.listTools();
    const downloadTemplateTool = toolsResult.tools.find(
      (t) => t.name === "downloadTemplate"
    );
    if (!downloadTemplateTool) {
      throw new Error("downloadTemplate tool not found");
    }
    console.log("✅ downloadTemplate tool found");

    // Verify that ide parameter is required in schema
    const ideParam = downloadTemplateTool.inputSchema.properties?.ide;
    expect(ideParam).toBeDefined();
    const requiredFields = downloadTemplateTool.inputSchema.required || [];
    expect(requiredFields).toContain("ide");
    console.log("✅ IDE parameter is required in schema");

    console.log("Calling downloadTemplate (missing ide)...");

    // Call downloadTemplate without ide parameter - should fail at schema validation
    try {
      await Promise.race([
        client.callTool({
          name: "downloadTemplate",
          arguments: {
            template: "rules",
            overwrite: false,
          },
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("callTool timeout after 10s")),
            10000
          )
        ),
      ]);

      // Should not reach here
      throw new Error("Expected schema validation error but call succeeded");
    } catch (error) {
      // Verify that we got a schema validation error
      expect(error).toBeDefined();
      expect(error.message || error.toString()).toContain("ide");
      expect(error.message || error.toString()).toContain("Required");
      console.log(
        "✅ Schema validation error received as expected:",
        error.message || error.toString()
      );
    }
  } catch (error) {
    console.error("Test failed:", error.message);
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
    if (transport) {
      await transport.close();
    }
  }
}, 60000);
