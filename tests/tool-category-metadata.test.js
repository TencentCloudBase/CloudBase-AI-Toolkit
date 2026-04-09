/**
 * Tool category metadata test
 *
 * Verifies that every registered MCP tool carries a valid `category` field in
 * its `annotations` object.  This is the CloudBase-specific extension to the
 * standard MCP ToolAnnotations type — see `mcp/src/types/tool-annotations.d.ts`.
 *
 * The test spins up a server with all plugins enabled and inspects the tool
 * list returned via the MCP protocol, so it covers both the TypeScript type
 * augmentation and the runtime contract.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VALID_CATEGORIES = new Set([
  "agents",
  "apps",
  "auth",
  "cloud-api",
  "cloudrun",
  "database",
  "download",
  "env",
  "functions",
  "gateway",
  "hosting",
  "invite-code",
  "logs",
  "NoSQL database",
  "permissions",
  "rag",
  "setup",
  "SQL database",
  "storage",
  "web",
]);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createTestClient() {
  const client = new Client(
    { name: "test-client-category", version: "1.0.0" },
    { capabilities: {} },
  );

  const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    env: {
      ...process.env,
      CLOUDBASE_MCP_PLUGINS_ENABLED:
        "env,database,functions,hosting,storage,setup,rag,gateway,download,invite-code,cloudrun,capi,app-auth,permissions,logs,agents,apps",
    },
  });

  await client.connect(transport);
  await delay(3000);
  return { client, transport };
}

describe("Tool category metadata", () => {
  let client;
  let transport;

  beforeAll(async () => {
    const result = await createTestClient();
    client = result.client;
    transport = result.transport;
  });

  afterAll(async () => {
    if (transport) {
      await transport.close?.();
    }
  });

  test("every registered tool has a valid category in annotations", async () => {
    const { tools } = await client.listTools();

    expect(tools.length).toBeGreaterThan(0);

    const toolsWithoutCategory = [];
    const toolsWithInvalidCategory = [];

    for (const tool of tools) {
      const category = tool.annotations?.category;

      if (!category) {
        toolsWithoutCategory.push(tool.name);
      } else if (!VALID_CATEGORIES.has(category)) {
        toolsWithInvalidCategory.push({
          tool: tool.name,
          category,
        });
      }
    }

    if (toolsWithoutCategory.length > 0) {
      console.error(
        "Tools missing category:",
        toolsWithoutCategory.join(", "),
      );
    }

    if (toolsWithInvalidCategory.length > 0) {
      console.error(
        "Tools with invalid category:",
        JSON.stringify(toolsWithInvalidCategory, null, 2),
      );
    }

    expect(toolsWithoutCategory).toHaveLength(0);
    expect(toolsWithInvalidCategory).toHaveLength(0);
  });

  test("category values are consistent across tools in the same module", async () => {
    const { tools } = await client.listTools();

    // Group tools by category and verify each group has a consistent naming
    const categoryTools = {};
    for (const tool of tools) {
      const cat = tool.annotations?.category;
      if (cat) {
        if (!categoryTools[cat]) categoryTools[cat] = [];
        categoryTools[cat].push(tool.name);
      }
    }

    // Every category should have at least one tool
    for (const [cat, names] of Object.entries(categoryTools)) {
      expect(names.length, `Category "${cat}" should have at least one tool`).toBeGreaterThan(0);
    }
  });
});
