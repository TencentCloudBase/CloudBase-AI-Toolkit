import { describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { registerDataModelTools } from "./dataModel.js";

const { mockGetCloudBaseManager, mockGetEnvId, mockLogCloudBaseResult } =
  vi.hoisted(() => ({
    mockGetCloudBaseManager: vi.fn(),
    mockGetEnvId: vi.fn(),
    mockLogCloudBaseResult: vi.fn(),
  }));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn((name, meta, handler) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerDataModelTools(server);

  return { tools };
}

describe("data model tools", () => {
  it("modifyDataModel schema should expose dbInstanceType as supported enum values", () => {
    const { tools } = createMockServer();
    const dbInstanceTypeSchema = tools.modifyDataModel.meta.inputSchema.dbInstanceType;

    expect(dbInstanceTypeSchema.safeParse("MYSQL").success).toBe(true);
    expect(dbInstanceTypeSchema.safeParse("FLEXDB").success).toBe(true);
    expect(dbInstanceTypeSchema.safeParse("postgres").success).toBe(false);
    expect(dbInstanceTypeSchema._def.innerType._def.innerType.options).toEqual([
      "MYSQL",
      "FLEXDB",
    ]);
  });
});
