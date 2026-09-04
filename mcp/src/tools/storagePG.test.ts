import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { registerPGStorageTools } from "./storagePG.js";

const ENV_KEYS = ["CLOUDBASE_MCP_CLOUD_MODE", "MCP_CLOUD_MODE"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

function buildToolPayload(result: any) {
  return JSON.parse(result.content[0].text);
}

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: {
      envId: "env-test",
      region: "ap-guangzhou",
    },
    logger: vi.fn(),
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerPGStorageTools(server);

  return { tools };
}

describe("PG storage tools", () => {
  it("registers queryPgStorage only", () => {
    const { tools } = createMockServer();

    expect(typeof tools.queryPgStorage?.handler).toBe("function");
    expect(tools.managePgStorage).toBeUndefined();
  });

  it("queryPgStorage(uploadPlan) returns SDK/HTTP API plan without signed URLs", async () => {
    const { tools } = createMockServer();

    const result = await tools.queryPgStorage.handler({
      action: "uploadPlan",
      bucket: "avatars",
      objects: [
        {
          objectKey: "mcp-test/a.png",
          contentType: "image/png",
          sizeBytes: 1024,
        },
        {
          objectKey: "mcp-test/b.json",
          contentType: "application/json",
          sizeBytes: 256,
        },
      ],
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: true,
      data: {
        uploadMode: "directHttpApi",
        implementation: "use_sdk_or_http_api_in_app_code",
        bucket: "avatars",
        objectCount: 2,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("signedUrl");
    expect(JSON.stringify(payload)).not.toContain("uploadUrl");
  });

  it("queryPgStorage(objectInfo) returns a code-oriented plan instead of reading files", async () => {
    const { tools } = createMockServer();

    const result = await tools.queryPgStorage.handler({
      action: "objectInfo",
      bucket: "avatars",
      objectKeys: ["mcp-test/a.png"],
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "objectInfo",
        bucket: "avatars",
        objectKeys: ["mcp-test/a.png"],
      },
    });
  });

  it("blocks bucket-dependent actions in cloud mode with friendly guidance", async () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    const { tools } = createMockServer();

    for (const action of ["createBucket", "uploadPlan", "objectInfo"] as const) {
      const result = await tools.queryPgStorage.handler({
        action,
        bucket: "avatars",
      });
      const payload = buildToolPayload(result);

      expect(payload).toMatchObject({
        success: false,
        errorCode: "CLOUD_MODE_ACTION_UNAVAILABLE",
        data: { action, availableActions: ["buckets", "config"] },
      });
      expect(payload.message).toContain("SDK 或 HTTP API");
    }
  });

  it("keeps capability summary actions available in cloud mode", async () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    const { tools } = createMockServer();

    const result = await tools.queryPgStorage.handler({ action: "buckets" });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({ success: true });
  });

  it("keeps bucket-dependent actions available in local mode", async () => {
    const { tools } = createMockServer();

    const result = await tools.queryPgStorage.handler({
      action: "uploadPlan",
      bucket: "avatars",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({ success: true, data: { bucket: "avatars" } });
  });
});
