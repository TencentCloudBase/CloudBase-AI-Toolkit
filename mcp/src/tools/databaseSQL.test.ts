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

  it("querySqlDatabase(runQuery) sends ReadOnly to RunSql", async () => {
    const { tools } = createMockServer();

    await tools.querySqlDatabase.handler({
      action: "runQuery",
      sql: "SELECT 1",
    });

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "RunSql",
        Param: expect.objectContaining({
          EnvId: "env-test",
          Sql: "SELECT 1",
          ReadOnly: true,
          DbInstance: expect.objectContaining({
            EnvId: "env-test",
            InstanceId: "default",
            Schema: "env-test",
          }),
        }),
      }),
    );
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

  it("manageSqlDatabase(destroyMySQL) requires explicit confirmation", async () => {
    const { tools } = createMockServer();

    const result = await tools.manageSqlDatabase.handler({
      action: "destroyMySQL",
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

  it("querySqlDatabase(describeTaskStatus) maps success to READY", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeMySQLTaskStatus") {
        return {
          RequestId: "req-task",
          Data: {
            Status: "success",
          },
        };
      }
      return {
        RequestId: "req-1",
      };
    });

    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "describeTaskStatus",
      request: { TaskId: "38654" },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      data: {
        status: "READY",
        rawStatus: "success",
      },
    });
    expect(payload.nextActions?.[0]).toMatchObject({
      tool: "manageSqlDatabase",
      action: "initializeSchema",
    });
  });

  it("querySqlDatabase(describeCreateResult) suggests polling the create result again", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeCreateMySQLResult") {
        return {
          RequestId: "req-create",
          Data: {
            Status: "doing",
            TaskId: "38661",
          },
        };
      }
      return {
        RequestId: "req-1",
      };
    });

    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "describeCreateResult",
      request: { TaskId: "38661" },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      data: {
        status: "PENDING",
        rawStatus: "doing",
        task: {
          request: {
            TaskId: "38661",
          },
        },
      },
    });
    expect(payload.nextActions?.[0]).toMatchObject({
      tool: "querySqlDatabase",
      action: "describeCreateResult",
      suggested_args: {
        action: "describeCreateResult",
        request: {
          TaskId: "38661",
        },
      },
    });
  });

  it("querySqlDatabase(describeTaskStatus) suggests getInstanceInfo for destroy tasks", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeMySQLTaskStatus") {
        return {
          RequestId: "req-task",
          Data: {
            Status: "SUCCESS",
          },
        };
      }
      return {
        RequestId: "req-1",
      };
    });

    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "describeTaskStatus",
      request: {
        TaskId: "16710",
        TaskName: "DeleteDataHub",
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      data: {
        status: "READY",
      },
    });
    expect(payload.nextActions?.[0]).toMatchObject({
      tool: "querySqlDatabase",
      action: "getInstanceInfo",
    });
  });

  it("querySqlDatabase(describeTaskStatus) returns failed destroy tasks without next actions", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeMySQLTaskStatus") {
        return {
          RequestId: "req-task",
          Data: {
            Status: "FAILED",
          },
        };
      }
      return {
        RequestId: "req-1",
      };
    });

    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "describeTaskStatus",
      request: {
        TaskId: "16710",
        TaskName: "DeleteDataHub",
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "MYSQL_TASK_FAILED",
      data: {
        status: "FAILED",
      },
    });
    expect(payload.nextActions).toEqual([]);
  });

  it("manageSqlDatabase(provisionMySQL) sends DbInstanceType and carries TaskId forward", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeCreateMySQLResult") {
        return {
          RequestId: "req-create",
          Data: {
            Status: "notexist",
          },
        };
      }
      if (Action === "CreateMySQL") {
        return {
          RequestId: "req-provision",
          Data: {
            TaskId: "38661",
          },
        };
      }
      throw new Error(`unexpected action: ${Action}`);
    });

    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "provisionMySQL",
      confirm: true,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "CreateMySQL",
        Param: expect.objectContaining({
          EnvId: "env-test",
          DbInstanceType: "MYSQL",
        }),
      }),
    );
    expect(payload).toMatchObject({
      success: true,
      data: {
        task: {
          request: {
            TaskId: "38661",
          },
        },
      },
    });
    expect(payload.nextActions?.[0]).toMatchObject({
      tool: "querySqlDatabase",
      action: "describeCreateResult",
      suggested_args: {
        action: "describeCreateResult",
        request: {
          TaskId: "38661",
        },
      },
    });
  });

  it("manageSqlDatabase(destroyMySQL) blocks when no instance exists", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeCreateMySQLResult") {
        return {
          RequestId: "req-create",
          Data: {
            Status: "notexist",
          },
        };
      }
      throw new Error(`unexpected action: ${Action}`);
    });

    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "destroyMySQL",
      confirm: true,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "MYSQL_NOT_CREATED",
    });
  });

  it("manageSqlDatabase(destroyMySQL) sends DestroyMySQL and carries task request forward", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeCreateMySQLResult") {
        return {
          RequestId: "req-create",
          Data: {
            Status: "success",
          },
        };
      }
      if (Action === "DescribeMySQLClusterDetail") {
        return {
          RequestId: "req-cluster",
          Data: {
            DbClusterId: "cluster-1",
            DbInfo: {
              ClusterStatus: "running",
            },
          },
        };
      }
      if (Action === "DestroyMySQL") {
        return {
          RequestId: "req-destroy",
          Data: {
            IsSuccess: true,
            TaskId: "16710",
            TaskName: "DeleteDataHub",
          },
        };
      }
      throw new Error(`unexpected action: ${Action}`);
    });

    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "destroyMySQL",
      confirm: true,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "DestroyMySQL",
        Param: expect.objectContaining({
          EnvId: "env-test",
        }),
      }),
    );
    expect(payload).toMatchObject({
      success: true,
      data: {
        status: "RUNNING",
        task: {
          request: {
            TaskId: "16710",
            TaskName: "DeleteDataHub",
          },
        },
      },
    });
    expect(payload.nextActions?.[0]).toMatchObject({
      tool: "querySqlDatabase",
      action: "describeTaskStatus",
      suggested_args: {
        action: "describeTaskStatus",
        request: {
          TaskId: "16710",
          TaskName: "DeleteDataHub",
        },
      },
    });
  });

  it("querySqlDatabase(getInstanceInfo) uses cluster detail after create result succeeds", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeCreateMySQLResult") {
        return {
          RequestId: "req-create",
          Data: {
            Status: "success",
          },
        };
      }
      if (Action === "DescribeMySQLClusterDetail") {
        return {
          RequestId: "req-cluster",
          Data: {
            DbClusterId: "cluster-1",
            DbInfo: {
              ClusterStatus: "running",
            },
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
        instanceId: "default",
        status: "READY",
      },
    });
  });

  // ── MySQL connector tests ──────────────────────────────────────────────

  it("querySqlDatabase(runQuery) routes SQL through connector when connectorName is provided", async () => {
    const { tools } = createMockServer();

    await tools.querySqlDatabase.handler({
      action: "runQuery",
      sql: "SELECT 1",
      connectorName: "my-external-db",
    });

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "RunSql",
        Param: expect.objectContaining({
          EnvId: "env-test",
          Sql: "SELECT 1",
          ReadOnly: true,
          DbInstance: {
            EnvId: "env-test",
            InstanceId: "my-external-db",
            Schema: "my-external-db",
          },
        }),
      }),
    );
  });

  it("querySqlDatabase(runQuery) returns CONNECTOR_NOT_FOUND when connector does not exist", async () => {
    mockCommonServiceCall.mockImplementation(async () => {
      throw Object.assign(new Error("Database instance not found"), {
        code: "FailedOperation.DataSourceNotExist",
      });
    });

    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "runQuery",
      sql: "SELECT 1",
      connectorName: "nonexistent",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONNECTOR_NOT_FOUND",
    });
  });

  it("querySqlDatabase(listConnectors) calls lowcode service with QueryConnector=1", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeDataSourceList") {
        return {
          Data: {
            Rows: [
              { Name: "my-db", Title: "My DB", Description: "Test", DbInstanceType: "mysql-connector", UpdatedAt: "2025-01-01" },
            ],
          },
        };
      }
      return { RequestId: "req-1" };
    });

    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "listConnectors",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "DescribeDataSourceList",
        Param: expect.objectContaining({
          EnvId: "env-test",
          QueryConnector: 1,
        }),
      }),
    );
    expect(payload).toMatchObject({
      success: true,
      data: {
        connectors: [{ name: "my-db", title: "My DB" }],
        count: 1,
      },
    });
  });

  it("querySqlDatabase(listConnectors) suggests createConnector when no connectors exist", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "DescribeDataSourceList") {
        return { Data: { Rows: [] } };
      }
      return { RequestId: "req-1" };
    });

    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "listConnectors",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({ success: true, data: { count: 0 } });
    expect(payload.nextActions?.[0]).toMatchObject({
      tool: "manageSqlDatabase",
      action: "createConnector",
    });
  });

  it("querySqlDatabase(getConnector) requires connectorName", async () => {
    const { tools } = createMockServer();
    const result = await tools.querySqlDatabase.handler({
      action: "getConnector",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONNECTOR_NAME_REQUIRED",
    });
  });

  it("manageSqlDatabase(createConnector) requires connectorName and connectorConfig", async () => {
    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "createConnector",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONNECTOR_NAME_REQUIRED",
    });
  });

  it("manageSqlDatabase(createConnector) requires connectorConfig", async () => {
    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "createConnector",
      connectorName: "my-db",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONNECTOR_CONFIG_REQUIRED",
    });
  });

  it("manageSqlDatabase(createConnector) creates a connector via lowcode service", async () => {
    mockCommonServiceCall.mockImplementation(async ({ Action }: { Action: string }) => {
      if (Action === "CreateDataSource") {
        return { Data: { Name: "my-db" } };
      }
      return { RequestId: "req-1" };
    });

    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "createConnector",
      connectorName: "my-db",
      connectorConfig: {
        host: "10.0.0.1",
        port: 3306,
        user: "admin",
        password: "secret",
        database: "my_app",
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "CreateDataSource",
        Param: expect.objectContaining({
          EnvId: "env-test",
          Name: "my-db",
          DbInstanceType: "mysql-connector",
        }),
      }),
    );
    expect(payload).toMatchObject({
      success: true,
      data: { name: "my-db" },
    });
    expect(payload.nextActions?.[0]).toMatchObject({
      tool: "manageSqlDatabase",
      action: "testConnection",
    });
  });

  it("manageSqlDatabase(deleteConnector) requires confirm", async () => {
    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "deleteConnector",
      connectorName: "my-db",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
    });
  });

  it("manageSqlDatabase(testConnection) tests connectivity via SELECT 1", async () => {
    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "testConnection",
      connectorName: "my-db",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "RunSql",
        Param: expect.objectContaining({
          Sql: "SELECT 1",
          ReadOnly: true,
          DbInstance: {
            EnvId: "env-test",
            InstanceId: "my-db",
            Schema: "my-db",
          },
        }),
      }),
    );
    expect(payload).toMatchObject({
      success: true,
      data: { name: "my-db", connected: true },
    });
  });

  it("manageSqlDatabase(testConnection) reports failure when connector is unreachable", async () => {
    mockCommonServiceCall.mockImplementation(async () => {
      throw Object.assign(new Error("Database instance not found"), {
        code: "FailedOperation.DataSourceNotExist",
      });
    });

    const { tools } = createMockServer();
    const result = await tools.manageSqlDatabase.handler({
      action: "testConnection",
      connectorName: "bad-db",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONNECTION_FAILED",
    });
  });

  it("manageSqlDatabase(runStatement) routes SQL through connector when connectorName is provided", async () => {
    const { tools } = createMockServer();
    await tools.manageSqlDatabase.handler({
      action: "runStatement",
      sql: "INSERT INTO users (name) VALUES ('test')",
      connectorName: "my-external-db",
    });

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "RunSql",
        Param: expect.objectContaining({
          EnvId: "env-test",
          Sql: "INSERT INTO users (name) VALUES ('test')",
          DbInstance: {
            EnvId: "env-test",
            InstanceId: "my-external-db",
            Schema: "my-external-db",
          },
        }),
      }),
    );
  });
});
