import { config as loadEnv } from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = join(__dirname, "..");
[join(rootDir, ".env"), join(rootDir, "mcp", ".env"), join(rootDir, "mcp", ".env.local")].forEach(
  (filePath) => existsSync(filePath) && loadEnv({ path: filePath }),
);

const LAYER_FIXTURE_PATH = join(__dirname, "fixtures", "layer-integration-content");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createTestClient() {
  const client = new Client(
    {
      name: "test-client-function-tools",
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

function expectToolFailure(result, pattern) {
  const text = result.content?.[0]?.text ?? "";
  if (text.includes("AUTH_REQUIRED") || text.includes("当前未登录")) {
    expect(text).toMatch(/AUTH_REQUIRED|当前未登录/);
    return;
  }

  if (result.isError) {
    expect(text).toMatch(pattern);
    return;
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.success === "boolean") {
      expect(parsed.success).toBe(false);
      expect(parsed.message).toMatch(pattern);
      return;
    }
  } catch {
    // Fall through to raw text assertion.
  }

  expect(text).toMatch(pattern);
}

describe("Function and gateway tool schemas", () => {
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
      await testClient.close().catch((error) => {
        console.warn("Error closing test client:", error.message);
      });
    }
    if (testTransport) {
      await testTransport.close().catch((error) => {
        console.warn("Error closing test transport:", error.message);
      });
    }
  });

  test("primary function and gateway tools are registered without legacy aliases", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const toolsResult = await testClient.listTools();
    const allTools = toolsResult.tools.map((tool) => tool.name);

    expect(allTools).toContain("queryFunctions");
    expect(allTools).toContain("manageFunctions");
    expect(allTools).toContain("queryGateway");
    expect(allTools).toContain("manageGateway");

    expect(allTools).not.toContain("getFunctionList");
    expect(allTools).not.toContain("createFunction");
    expect(allTools).not.toContain("updateFunctionCode");
    expect(allTools).not.toContain("getFunctionLogs");
    expect(allTools).not.toContain("readFunctionLayers");
    expect(allTools).not.toContain("writeFunctionLayers");
    expect(allTools).not.toContain("createFunctionHTTPAccess");
  });

  test("queryFunctions schema is focused on function resources only", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const toolsResult = await testClient.listTools();
    const tool = toolsResult.tools.find((item) => item.name === "queryFunctions");

    expect(tool).toBeDefined();
    expect(tool.inputSchema.type).toBe("object");

    const properties = tool.inputSchema.properties;
    expect(properties.action.enum).toContain("listFunctions");
    expect(properties.action.enum).toContain("getFunctionDetail");
    expect(properties.action.enum).toContain("listFunctionLayers");
    expect(properties.action.enum).toContain("listFunctionTriggers");
    expect(properties.action.enum).toContain("getFunctionDownloadUrl");
    expect(properties.action.enum).not.toContain("getFunctionAccess");
    expect(properties.functionName).toBeDefined();
    expect(properties.layerName).toBeDefined();
    expect(properties.layerVersion).toBeDefined();
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.category).toBe("functions");
  });

  test("manageFunctions schema excludes gateway write actions", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const toolsResult = await testClient.listTools();
    const tool = toolsResult.tools.find((item) => item.name === "manageFunctions");

    expect(tool).toBeDefined();
    expect(tool.inputSchema.type).toBe("object");

    const properties = tool.inputSchema.properties;
    expect(properties.action.enum).toContain("createFunction");
    expect(properties.action.enum).toContain("updateFunctionCode");
    expect(properties.action.enum).toContain("createLayerVersion");
    expect(properties.action.enum).toContain("attachLayer");
    expect(properties.action.enum).not.toContain("createFunctionAccess");
    expect(properties.functionName).toBeDefined();
    expect(properties.layerName).toBeDefined();
    expect(properties.layerVersion).toBeDefined();
    expect(properties.confirm).toBeDefined();
    expect(properties.path).toBeUndefined();
    expect(tool.annotations.readOnlyHint).toBe(false);
    expect(tool.annotations.destructiveHint).toBe(true);
    expect(tool.annotations.category).toBe("functions");
  });

  test("gateway tools expose independent query/manage entrypoints", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const toolsResult = await testClient.listTools();
    const queryTool = toolsResult.tools.find((item) => item.name === "queryGateway");
    const manageTool = toolsResult.tools.find((item) => item.name === "manageGateway");

    expect(queryTool).toBeDefined();
    expect(queryTool.inputSchema.properties.action.enum).toContain("getAccess");
    expect(queryTool.inputSchema.properties.action.enum).toContain("listDomains");
    expect(queryTool.inputSchema.properties.targetType).toBeDefined();
    expect(queryTool.inputSchema.properties.targetName).toBeDefined();
    expect(queryTool.annotations.category).toBe("gateway");
    expect(queryTool.annotations.readOnlyHint).toBe(true);

    expect(manageTool).toBeDefined();
    expect(manageTool.inputSchema.properties.action.enum).toContain("createAccess");
    expect(manageTool.inputSchema.properties.targetType).toBeDefined();
    expect(manageTool.inputSchema.properties.targetName).toBeDefined();
    expect(manageTool.inputSchema.properties.path).toBeDefined();
    expect(manageTool.annotations.category).toBe("gateway");
    expect(manageTool.annotations.readOnlyHint).toBe(false);
    expect(manageTool.annotations.destructiveHint).toBe(true);
  });

  test("query and manage tools validate action-specific input", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    const functionDetailResult = await testClient.callTool({
      name: "queryFunctions",
      arguments: {
        action: "getFunctionDetail",
      },
    });
    expectToolFailure(functionDetailResult, /functionName 参数是必需的/);

    const attachLayerResult = await testClient.callTool({
      name: "manageFunctions",
      arguments: {
        action: "attachLayer",
      },
    });
    expectToolFailure(attachLayerResult, /functionName 参数是必需的/);

    const deleteLayerVersionResult = await testClient.callTool({
      name: "manageFunctions",
      arguments: {
        action: "deleteLayerVersion",
        layerName: "demo-layer",
        layerVersion: 1,
      },
    });
    expectToolFailure(deleteLayerVersionResult, /confirm=true/);

    const gatewayAccessResult = await testClient.callTool({
      name: "queryGateway",
      arguments: {
        action: "getAccess",
        targetType: "function",
      },
    });
    expectToolFailure(gatewayAccessResult, /targetName 参数是必需的/);
  });

  test("queryFunctions can call listLayers when credentials are available", async () => {
    if (!testClient) {
      console.log("Test client not available, skipping test");
      return;
    }

    if (!hasCloudBaseCredentials()) {
      console.log("No CloudBase credentials detected, skipping real call test");
      return;
    }

    const result = await testClient.callTool({
      name: "queryFunctions",
      arguments: {
        action: "listLayers",
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
  });
});

describe("Function layer real integration tests", () => {
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
      await testClient.close().catch((error) => {
        console.warn("Error closing test client:", error.message);
      });
    }
    if (testTransport) {
      await testTransport.close().catch((error) => {
        console.warn("Error closing test transport:", error.message);
      });
    }
  });

  async function cleanupDetach() {
    if (!testClient || !didAttach || !testFunctionName || !createdLayerVersion) {
      return;
    }
    try {
      await testClient.callTool({
        name: "manageFunctions",
        arguments: {
          action: "detachLayer",
          functionName: testFunctionName,
          layerName,
          layerVersion: createdLayerVersion,
          confirm: true,
        },
      });
    } catch (error) {
      console.warn(
        `[cleanup] detachLayer failed: ${error.message}. Layer may still be bound.`,
      );
    }
  }

  async function cleanupDelete() {
    if (!testClient || createdLayerVersion == null) {
      return;
    }
    try {
      await testClient.callTool({
        name: "manageFunctions",
        arguments: {
          action: "deleteLayerVersion",
          layerName,
          layerVersion: createdLayerVersion,
          confirm: true,
        },
      });
    } catch (error) {
      console.warn(
        `[cleanup] deleteLayerVersion failed: ${error.message}. Layer ${layerName} v${createdLayerVersion} may still exist.`,
      );
    }
  }

  test("create layer version, optionally attach and detach, then delete", async () => {
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
      const createRes = await testClient.callTool({
        name: "manageFunctions",
        arguments: {
          action: "createLayerVersion",
          layerName,
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
        name: "queryFunctions",
        arguments: {
          action: "listLayerVersions",
          layerName,
        },
      });
      const listParsed = parseToolJsonContent(listRes);
      const versions = listParsed.data?.layerVersions ?? [];
      expect(versions.some((item) => item.LayerVersion === createdLayerVersion)).toBe(
        true,
      );

      if (testFunctionName) {
        lastStep = "attachLayer";
        const attachRes = await testClient.callTool({
          name: "manageFunctions",
          arguments: {
            action: "attachLayer",
            functionName: testFunctionName,
            layerName,
            layerVersion: createdLayerVersion,
          },
        });
        parseToolJsonContent(attachRes);
        didAttach = true;

        await delay(6000);

        lastStep = "listFunctionLayers";
        const getLayersRes = await testClient.callTool({
          name: "queryFunctions",
          arguments: {
            action: "listFunctionLayers",
            functionName: testFunctionName,
          },
        });
        const getLayersParsed = parseToolJsonContent(getLayersRes);
        const bound = getLayersParsed.data?.layers ?? [];
        expect(
          bound.some(
            (item) =>
              (item.LayerName || item.name) === layerName &&
              (item.LayerVersion ?? item.version) === createdLayerVersion,
          ),
        ).toBe(true);

        lastStep = "detachLayer";
        const detachRes = await testClient.callTool({
          name: "manageFunctions",
          arguments: {
            action: "detachLayer",
            functionName: testFunctionName,
            layerName,
            layerVersion: createdLayerVersion,
            confirm: true,
          },
        });
        parseToolJsonContent(detachRes);
        didAttach = false;
      }

      lastStep = "deleteLayerVersion";
      const deleteRes = await testClient.callTool({
        name: "manageFunctions",
        arguments: {
          action: "deleteLayerVersion",
          layerName,
          layerVersion: createdLayerVersion,
          confirm: true,
        },
      });
      parseToolJsonContent(deleteRes);
      createdLayerVersion = null;
    } catch (error) {
      await cleanupDetach();
      await cleanupDelete();
      throw new Error(
        `[${lastStep}] layer=${layerName} version=${createdLayerVersion}: ${error.message}`,
      );
    }
  });
});
