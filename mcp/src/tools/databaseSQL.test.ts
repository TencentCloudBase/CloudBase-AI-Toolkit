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

  it("querySqlDatabase(describeInstance) should behave as getInstanceInfo alias", async () => {
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
      action: "describeInstance",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      data: {
        exists: false,
        status: "NOT_CREATED",
      },
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
});
