import { config as loadEnv } from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from repo root or mcp/ so integration tests can use .env without exporting vars
const rootDir = join(__dirname, "..");
[join(rootDir, ".env"), join(rootDir, "mcp", ".env"), join(rootDir, "mcp", ".env.local")].forEach(
  (p) => existsSync(p) && loadEnv({ path: p }),
);

const LAYER_FIXTURE_PATH = join(__dirname, "fixtures", "layer-integration-content");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createTestClient() {
  const client = new Client(
    {
      name: "test-client-function-layers",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    env: { ...process.env },
  });

  await client.connect(transport);
  await delay(2000);

  return { client, transport };
}

function hasCloudBaseCredentials() {
  const secretId =
    process.env.TENCENTCLOUD_SECRETID || process.env.CLOUDBASE_SECRET_ID;
  const secretKey =
    process.env.TENCENTCLOUD_SECRETKEY || process.env.CLOUDBASE_SECRET_KEY;
  const envId = process.env.CLOUDBASE_ENV_ID;
  return Boolean(secretId && secretKey && envId);
}

function shouldRunLayerIntegrationTests() {
  return (
    process.env.CLOUDBASE_RUN_LAYER_INTEGRATION_TESTS === "1" &&
    hasCloudBaseCredentials()
  );
}

function parseToolJsonContent(callResult) {
  if (callResult.isError || !callResult.content?.[0]?.text) {
    const errText = callResult.content?.[0]?.text ?? "Unknown error";
    throw new Error(`Tool call failed: ${errText}`);
  }
  const parsed = JSON.parse(callResult.content[0].text);
  if (!parsed.success || parsed.data === undefined) {
    throw new Error(`Tool returned error: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

describe("Function layer tools tests", () => {
  let testClient = null;
  let testTransport = null;

  beforeAll(async () => {
    try {
      const { client, transport } = await createTestClient();
      testClient = client;
      testTransport = transport;
    } catch (error) {
      console.warn("Failed to setup test client:", error.message);
    }
  }, 60000);

  afterAll(async () => {
    if (testClient) {
      try {
        await testClient.close();
      } catch (error) {
        console.warn("Error closing test client:", error.message);
      }
    }
    if (testTransport) {
      try {
        await testTransport.close();
      } catch (error) {
        console.warn("Error closing test transport:", error.message);
      }
    }
  });

  test("Function layer tools are registered", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const toolsResult = await testClient.listTools();
    const allTools = toolsResult.tools.map((tool) => tool.name);

    expect(allTools).toContain("readFunctionLayers");
    expect(allTools).toContain("writeFunctionLayers");

    // New tool names (after renaming)
    expect(allTools).toContain("manageFunctions");
    expect(allTools).toContain("queryFunctions");
    expect(allTools).toContain("invokeFunctions");
  });

  test("readFunctionLayers schema is correct", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const toolsResult = await testClient.listTools();
    const tool = toolsResult.tools.find(
      (item) => item.name === "readFunctionLayers",
    );

    expect(tool).toBeDefined();
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema.type).toBe("object");

    const properties = tool.inputSchema.properties;
    expect(properties.action).toBeDefined();
    expect(properties.action.enum).toContain("listLayers");
    expect(properties.action.enum).toContain("listLayerVersions");
    expect(properties.action.enum).toContain("getLayerVersion");
    expect(properties.action.enum).toContain("getFunctionLayers");
    expect(properties.name).toBeDefined();
    expect(properties.version).toBeDefined();
    expect(properties.functionName).toBeDefined();
  });

  test("writeFunctionLayers schema is correct", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const toolsResult = await testClient.listTools();
    const tool = toolsResult.tools.find(
      (item) => item.name === "writeFunctionLayers",
    );

    expect(tool).toBeDefined();
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema.type).toBe("object");

    const properties = tool.inputSchema.properties;
    expect(properties.action).toBeDefined();
    expect(properties.action.enum).toContain("createLayerVersion");
    expect(properties.action.enum).toContain("deleteLayerVersion");
    expect(properties.action.enum).toContain("attachLayer");
    expect(properties.action.enum).toContain("detachLayer");
    expect(properties.action.enum).toContain("updateFunctionLayers");
    expect(properties.layers).toBeDefined();
    expect(properties.functionName).toBeDefined();
    expect(properties.layerName).toBeDefined();
    expect(properties.layerVersion).toBeDefined();
  });

  test("Function layer tools annotations are correct", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const toolsResult = await testClient.listTools();
    const readTool = toolsResult.tools.find(
      (item) => item.name === "readFunctionLayers",
    );
    const writeTool = toolsResult.tools.find(
      (item) => item.name === "writeFunctionLayers",
    );

    expect(readTool.annotations.readOnlyHint).toBe(true);
    expect(readTool.annotations.category).toBe("functions");

    expect(writeTool.annotations.readOnlyHint).toBe(false);
    expect(writeTool.annotations.destructiveHint).toBe(true);
    expect(writeTool.annotations.category).toBe("functions");
  });

  test("readFunctionLayers validates action-specific parameters without credentials", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const missingVersionResult = await testClient.callTool({
      name: "readFunctionLayers",
      arguments: {
        action: "getLayerVersion",
        name: "demo-layer",
      },
    });

    expect(missingVersionResult.isError).toBe(true);
    expect(missingVersionResult.content[0].text).toMatch(/version 参数是必需的/);

    const missingFunctionNameResult = await testClient.callTool({
      name: "readFunctionLayers",
      arguments: {
        action: "getFunctionLayers",
      },
    });

    expect(missingFunctionNameResult.isError).toBe(true);
    expect(missingFunctionNameResult.content[0].text).toMatch(
      /functionName 参数是必需的/,
    );
  });

  test("writeFunctionLayers validates action-specific parameters without credentials", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const missingRuntimesResult = await testClient.callTool({
      name: "writeFunctionLayers",
      arguments: {
        action: "createLayerVersion",
        name: "demo-layer",
      },
    });

    expect(missingRuntimesResult.isError).toBe(true);
    expect(missingRuntimesResult.content[0].text).toMatch(
      /runtimes 参数是必需的/,
    );

    const missingFunctionNameResult = await testClient.callTool({
      name: "writeFunctionLayers",
      arguments: {
        action: "attachLayer",
      },
    });

    expect(missingFunctionNameResult.isError).toBe(true);
    expect(missingFunctionNameResult.content[0].text).toMatch(
      /functionName 参数是必需的/,
    );
  });

  test("Function layer tools can be called with valid actions when credentials are available", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    if (!hasCloudBaseCredentials()) {
      console.log("No CloudBase credentials detected, skipping real call test");
      return;
    }

    const readResult = await testClient.callTool({
      name: "readFunctionLayers",
      arguments: {
        action: "listLayers",
      },
    });

    expect(readResult).toBeDefined();
    expect(readResult.content).toBeDefined();
    expect(Array.isArray(readResult.content)).toBe(true);
  });
});

describe("Function layer tools real integration tests", () => {
  let testClient = null;
  let testTransport = null;
  const layerName = `mcp-layer-integration-${Date.now()}`;
  let createdLayerVersion = null;
  let didAttach = false;
  const testFunctionName = process.env.CLOUDBASE_LAYER_TEST_FUNCTION_NAME;

  beforeAll(async () => {
    if (!shouldRunLayerIntegrationTests()) {
      console.log(
        "Skipping real integration tests: set CLOUDBASE_RUN_LAYER_INTEGRATION_TESTS=1 and provide CloudBase credentials",
      );
      return;
    }
    if (!existsSync(LAYER_FIXTURE_PATH)) {
      console.warn(
        `Layer fixture not found at ${LAYER_FIXTURE_PATH}, real integration tests will skip`,
      );
      return;
    }
    try {
      const { client, transport } = await createTestClient();
      testClient = client;
      testTransport = transport;
    } catch (error) {
      console.warn("Failed to setup test client:", error.message);
    }
  }, 60000);

  afterAll(async () => {
    if (testClient) {
      try {
        await testClient.close();
      } catch (e) {
        console.warn("Error closing test client:", e.message);
      }
    }
    if (testTransport) {
      try {
        await testTransport.close();
      } catch (e) {
        console.warn("Error closing test transport:", e.message);
      }
    }
  });

  async function cleanupDetach() {
    if (!testClient || !didAttach || !testFunctionName || !createdLayerVersion)
      return;
    try {
      await testClient.callTool({
        name: "writeFunctionLayers",
        arguments: {
          action: "detachLayer",
          functionName: testFunctionName,
          layerName,
          layerVersion: createdLayerVersion,
        },
      });
    } catch (e) {
      console.warn(
        `[cleanup] detachLayer failed: ${e.message}. Layer may still be bound.`,
      );
    }
  }

  async function cleanupDelete() {
    if (!testClient || createdLayerVersion == null) return;
    try {
      await testClient.callTool({
        name: "writeFunctionLayers",
        arguments: {
          action: "deleteLayerVersion",
          name: layerName,
          version: createdLayerVersion,
        },
      });
    } catch (e) {
      console.warn(
        `[cleanup] deleteLayerVersion failed: ${e.message}. Layer ${layerName} v${createdLayerVersion} may still exist.`,
      );
    }
  }

  test("create layer version, optionally attach/detach, then delete", async () => {
    if (!shouldRunLayerIntegrationTests() || !testClient) {
      console.log(
        "Skipping: CLOUDBASE_RUN_LAYER_INTEGRATION_TESTS=1 and credentials required",
      );
      return;
    }
    if (!existsSync(LAYER_FIXTURE_PATH)) {
      console.log("Skipping: layer fixture path not found");
      return;
    }

    let lastStep = "createLayerVersion";
    try {
      // Step 1: createLayerVersion (use multiple runtimes so layer can be attached to Nodejs18/20 functions)
      lastStep = "createLayerVersion";
      const createRes = await testClient.callTool({
        name: "writeFunctionLayers",
        arguments: {
          action: "createLayerVersion",
          name: layerName,
          contentPath: LAYER_FIXTURE_PATH,
          runtimes: ["Nodejs16.13", "Nodejs18.15", "Nodejs20.19"],
        },
      });
      const createParsed = parseToolJsonContent(createRes);
      createdLayerVersion = createParsed.data?.layerVersion;
      expect(createdLayerVersion).toBeDefined();
      expect(typeof createdLayerVersion).toBe("number");

      lastStep = "listLayerVersions";
      const listRes = await testClient.callTool({
        name: "readFunctionLayers",
        arguments: { action: "listLayerVersions", name: layerName },
      });
      const listParsed = parseToolJsonContent(listRes);
      const versions = listParsed.data?.layerVersions ?? [];
      expect(versions.some((v) => v.LayerVersion === createdLayerVersion)).toBe(
        true,
      );

      if (testFunctionName) {
        lastStep = "attachLayer";
        const attachRes = await testClient.callTool({
          name: "writeFunctionLayers",
          arguments: {
            action: "attachLayer",
            functionName: testFunctionName,
            layerName,
            layerVersion: createdLayerVersion,
          },
        });
        parseToolJsonContent(attachRes);
        didAttach = true;
        // Wait for function to leave Updating state before getFunctionLayers/detach (backend may return "当前函数处于Updating状态" otherwise)
        await delay(6000);
        lastStep = "getFunctionLayers";
        const getLayersRes = await testClient.callTool({
          name: "readFunctionLayers",
          arguments: {
            action: "getFunctionLayers",
            functionName: testFunctionName,
          },
        });
        const getLayersParsed = parseToolJsonContent(getLayersRes);
        const bound = getLayersParsed.data?.layers ?? [];
        expect(
          bound.some(
            (l) =>
              (l.LayerName || l.name) === layerName &&
              (l.LayerVersion ?? l.version) === createdLayerVersion,
          ),
        ).toBe(true);
        lastStep = "detachLayer";
        const detachRes = await testClient.callTool({
          name: "writeFunctionLayers",
          arguments: {
            action: "detachLayer",
            functionName: testFunctionName,
            layerName,
            layerVersion: createdLayerVersion,
          },
        });
        parseToolJsonContent(detachRes);
        didAttach = false;
      }

      lastStep = "deleteLayerVersion";
      const deleteRes = await testClient.callTool({
        name: "writeFunctionLayers",
        arguments: {
          action: "deleteLayerVersion",
          name: layerName,
          version: createdLayerVersion,
        },
      });
      parseToolJsonContent(deleteRes);
      createdLayerVersion = null;
    } catch (err) {
      await cleanupDetach();
      await cleanupDelete();
      throw new Error(
        `[${lastStep}] layer=${layerName} version=${createdLayerVersion}: ${err.message}`,
      );
    }
  });
});
