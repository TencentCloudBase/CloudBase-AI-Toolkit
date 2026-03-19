import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { registerSQLDatabaseTools } from "./databaseSQL.js";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockLogCloudBaseResult,
  mockGetEnvInfo,
  mockCommonServiceCall,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockGetEnvInfo: vi.fn(),
  mockCommonServiceCall: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

function createMockServer() {
  const tools: Record<
    string,
    {
      meta: any;
      handler: (args: any) => Promise<any>;
    }
  > = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: {
      envId: "env-test",
      region: "ap-guangzhou",
    },
    logger: vi.fn(),
    registerTool: vi.fn(
      (name: string, meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { meta, handler };
      },
    ),
  } as unknown as ExtendedMcpServer;

  registerSQLDatabaseTools(server);

  return { tools };
}

describe("SQL database tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvId.mockResolvedValue("env-test");
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Databases: [
          {
            InstanceId: "default",
            Status: "ONLINE",
          },
        ],
      },
    });
    mockCommonServiceCall.mockResolvedValue({
      RequestId: "req-1",
      RowsAffected: 0,
      Items: ['{"id":1}'],
      Infos: ['{"Field":"id"}'],
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        getEnvInfo: mockGetEnvInfo,
      },
      commonService: vi.fn(() => ({
        call: mockCommonServiceCall,
      })),
    });
  });

  it("registers the new SQL tool names only", () => {
    const { tools } = createMockServer();

    expect(typeof tools.querySqlDatabase?.handler).toBe("function");
    expect(typeof tools.manageSqlDatabase?.handler).toBe("function");
    expect(tools.executeReadOnlySQL).toBeUndefined();
    expect(tools.executeWriteSQL).toBeUndefined();
  });

  it("querySqlDatabase(runQuery) rejects mutating SQL", async () => {
    const { tools } = createMockServer();

    const result = await tools.querySqlDatabase.handler({
      action: "runQuery",
      sql: "DELETE FROM users",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "READ_ONLY_SQL_REQUIRED",
    });
    expect(mockCommonServiceCall).not.toHaveBeenCalled();
  });

  it("manageSqlDatabase(provisionMySQL) requires explicit confirmation", async () => {
    const { tools } = createMockServer();

    const result = await tools.manageSqlDatabase.handler({
      action: "provisionMySQL",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
    });
  });

  it("querySqlDatabase(getInstanceInfo) suggests provisioning when instance is missing", async () => {
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Databases: [],
      },
    });

    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "getInstanceInfo",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      data: {
        exists: false,
        status: "NOT_CREATED",
      },
    });
    expect(payload.nextActions?.[0]).toMatchObject({
      tool: "manageSqlDatabase",
      action: "provisionMySQL",
    });
  });

  it("manageSqlDatabase(initializeSchema) blocks when MySQL is not ready", async () => {
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Databases: [
          {
            InstanceId: "default",
            Status: "PENDING",
          },
        ],
      },
    });

    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "initializeSchema",
      statements: ["CREATE TABLE users(id INT)"],
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "MYSQL_NOT_READY",
    });
  });
});
