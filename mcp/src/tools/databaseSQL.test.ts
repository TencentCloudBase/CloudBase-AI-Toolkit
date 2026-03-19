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
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeCreateMySQLResult") {
        return {
          RequestId: "req-create",
          Status: "NOT_FOUND",
        };
      }
      throw Object.assign(new Error("not found"), {
        code: "FailedOperation.DataSourceNotExist",
      });
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
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeCreateMySQLResult") {
        return {
          RequestId: "req-create",
          Status: "PENDING",
        };
      }
      if (Action === "DescribeMySQLClusterDetail") {
        throw Object.assign(new Error("cluster not ready"), {
          code: "FailedOperation.DataSourceNotExist",
        });
      }
      return {
        RequestId: "req-1",
      };
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

  it("querySqlDatabase(getInstanceInfo) uses cluster detail after create result succeeds", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeCreateMySQLResult") {
        return {
          RequestId: "req-create",
          Status: "SUCCESS",
        };
      }
      if (Action === "DescribeMySQLClusterDetail") {
        return {
          RequestId: "req-cluster",
          ClusterDetail: {
            ClusterId: "cluster-1",
            ClusterStatus: "RUNNING",
          },
        };
      }
      return {
        RequestId: "req-1",
      };
    });

    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "getInstanceInfo",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      data: {
        exists: true,
        clusterId: "cluster-1",
        status: "READY",
      },
    });
  });
});
