import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { registerDatabaseTools } from "./databaseNoSQL.js";
import { resetDatabaseInstanceIdCache } from "../cloudbase-manager.js";

const {
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockCheckCollectionExists,
  mockDescribeCollection,
  mockCreateCollection,
  mockCommonServiceCall,
  mockGetEnvInfo,
  mockGetEnvId,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockCheckCollectionExists: vi.fn(),
  mockDescribeCollection: vi.fn(),
  mockCreateCollection: vi.fn(),
  mockCommonServiceCall: vi.fn(),
  mockGetEnvInfo: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../cloudbase-manager.js")>();
  return {
    ...actual,
    getCloudBaseManager: mockGetCloudBaseManager,
    getEnvId: mockGetEnvId,
    logCloudBaseResult: mockLogCloudBaseResult,
  };
});

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

  registerDatabaseTools(server);

  return { tools };
}

describe("NoSQL database tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDatabaseInstanceIdCache();

    mockGetEnvId.mockResolvedValue("env-test");

    mockCheckCollectionExists.mockResolvedValue({
      RequestId: "req-check",
      Exists: false,
    });
    mockDescribeCollection.mockResolvedValue({
      RequestId: "req-describe",
      IndexNum: 2,
      Indexes: [],
    });
    mockCreateCollection.mockResolvedValue({
      RequestId: "req-create",
    });
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Databases: [
          {
            InstanceId: "instance-test",
          },
        ],
      },
    });
    mockCommonServiceCall.mockImplementation(async ({ Action }) => {
      if (Action === "QueryRecords") {
        return {
          RequestId: "req-query",
          Data: [
            "{\"_id\":\"doc-1\",\"name\":\"chain_nosql_probe_001\",\"status\":\"active\"}",
          ],
          Pager: {
            Total: 1,
            Limit: 100,
            Offset: 0,
          },
        };
      }

      if (Action === "PutItem") {
        return {
          RequestId: "req-insert",
          InsertedIds: ["doc-1"],
        };
      }

      if (Action === "UpdateItem") {
        return {
          RequestId: "req-update",
          ModifiedNum: 1,
          MatchedNum: 1,
          UpsertedId: "doc-users-1",
        };
      }

      if (Action === "CreateTable") {
        return { RequestId: "req-create" };
      }

      if (Action === "DeleteTable") {
        return { RequestId: "req-delete" };
      }

      if (Action === "DescribeTable") {
        return {
          RequestId: "req-describe",
          IndexNum: 2,
          Indexes: [],
        };
      }

      if (Action === "ListTables") {
        return {
          RequestId: "req-list",
          Tables: [{ TableName: "t_nosql_products" }],
          Pager: { Total: 1, Limit: 100, Offset: 0 },
        };
      }

      throw new Error(`Unexpected action: ${Action}`);
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        getEnvInfo: mockGetEnvInfo,
      },
      database: {
        checkCollectionExists: mockCheckCollectionExists,
        describeCollection: mockDescribeCollection,
        createCollection: mockCreateCollection,
      },
      commonService: vi.fn(() => ({
        call: mockCommonServiceCall,
      })),
    });
  });

  it("readNoSqlDatabaseContent should normalize stringified query records", async () => {
    const { tools } = createMockServer();

    const result = await tools.readNoSqlDatabaseContent.handler({
      collectionName: "t_nosql_orders",
      query: { name: "chain_nosql_probe_001" },
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "QueryRecords",
        Param: expect.objectContaining({
          TableName: "t_nosql_orders",
          MgoQuery: JSON.stringify({ name: "chain_nosql_probe_001" }),
        }),
      }),
    );
    expect(payload).toMatchObject({
      success: true,
      collection: "t_nosql_orders",
      collectionName: "t_nosql_orders",
      requestId: "req-query",
      total: 1,
      data: [
        {
          _id: "doc-1",
          name: "chain_nosql_probe_001",
          status: "active",
        },
      ],
      pager: {
        Total: 1,
        Limit: 100,
        Offset: 0,
      },
    });
    expect(payload).not.toHaveProperty("nextActions");
  });

  it("readNoSqlDatabaseContent should reject object sort to match backend contract", async () => {
    const { tools } = createMockServer();

    await expect(
      tools.readNoSqlDatabaseContent.handler({
        collectionName: "t_nosql_orders",
        sort: { createdAt: -1, openid: 1 },
      }),
    ).rejects.toThrow("sort 仅支持数组");

    expect(mockCommonServiceCall).not.toHaveBeenCalled();
  });

  it("readNoSqlDatabaseContent should reject stringified object sort to match backend contract", async () => {
    const { tools } = createMockServer();

    await expect(
      tools.readNoSqlDatabaseContent.handler({
        collectionName: "t_nosql_orders",
        sort: "{\"createdAt\":-1}",
      }),
    ).rejects.toThrow("sort 仅支持数组");

    expect(mockCommonServiceCall).not.toHaveBeenCalled();
  });

  it("readNoSqlDatabaseContent should keep stringified array sort in backend format", async () => {
    const { tools } = createMockServer();

    await tools.readNoSqlDatabaseContent.handler({
      collectionName: "t_nosql_orders",
      sort: JSON.stringify([{ key: "createdAt", direction: -1 }]),
    });

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "QueryRecords",
        Param: expect.objectContaining({
          MgoSort: JSON.stringify([{ key: "createdAt", direction: -1 }]),
        }),
      }),
    );
  });

  it("readNoSqlDatabaseContent should reject invalid sort directions early", async () => {
    const { tools } = createMockServer();

    await expect(
      tools.readNoSqlDatabaseContent.handler({
        collectionName: "t_nosql_orders",
        sort: [{ key: "createdAt", direction: 0 }],
      }),
    ).rejects.toThrow("非法 sort direction");

    expect(mockCommonServiceCall).not.toHaveBeenCalled();
  });

  it("readNoSqlDatabaseContent should reject non-numeric directions in stringified sort arrays", async () => {
    const { tools } = createMockServer();

    await expect(
      tools.readNoSqlDatabaseContent.handler({
        collectionName: "t_nosql_orders",
        sort: JSON.stringify([{ key: "createdAt", direction: "desc" }]),
      }),
    ).rejects.toThrow("非法 sort direction");

    expect(mockCommonServiceCall).not.toHaveBeenCalled();
  });

  it("writeNoSqlDatabaseContent should describe partial updates using MongoDB operators", () => {
    const { tools } = createMockServer();
    const meta = tools.writeNoSqlDatabaseContent.meta;

    expect(meta.description).toContain("MongoDB updateOne/updateMany");
    expect(meta.description).toContain("`$set`、`$inc`、`$push`");
    expect(meta.description).toContain("`_id` 就是该 `uid`");
    expect(meta.description).toContain("`shipping.city`");
    expect(meta.inputSchema.update.description).toContain("MgoUpdate");
    expect(meta.inputSchema.update.description).toContain("`$set`");
    expect(meta.inputSchema.update.description).toContain("`status`");
    expect(meta.inputSchema.update.description).toContain("`shipping.city`");
  });

  it("writeNoSqlDatabaseContent should warn when auth-linked role docs are upserted by uid query", async () => {
    const { tools } = createMockServer();

    const result = await tools.writeNoSqlDatabaseContent.handler({
      action: "update",
      collectionName: "users",
      query: { uid: "user-123" },
      update: { $set: { role: "admin" } },
      upsert: true,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.warning).toContain("doc(uid)");
    expect(payload.message).toContain("doc(uid)");
  });

  it("NoSQL structure tools should describe index management entry points explicitly", () => {
    const { tools } = createMockServer();
    const readMeta = tools.readNoSqlDatabaseStructure.meta;
    const writeMeta = tools.writeNoSqlDatabaseStructure.meta;

    expect(readMeta.description).toContain("集合与索引");
    expect(readMeta.inputSchema.action.description).toContain("listIndexes");
    expect(readMeta.inputSchema.action.description).toContain("checkIndex");

    expect(writeMeta.description).toContain("添加索引");
    expect(writeMeta.description).toContain("删除索引");
    expect(writeMeta.inputSchema.action.description).toContain("CreateIndexes");
    expect(writeMeta.inputSchema.action.description).toContain("DropIndexes");
    expect(writeMeta.inputSchema.updateOptions.description).toContain(
      "CreateIndexes",
    );
    expect(writeMeta.inputSchema.updateOptions.description).toContain(
      "DropIndexes",
    );
  });

  it("collection-scoped responses should echo the requested collection name", async () => {
    const { tools } = createMockServer();

    const checkResult = await tools.readNoSqlDatabaseStructure.handler({
      action: "checkCollection",
      collectionName: "t_nosql_products",
    });
    const checkPayload = JSON.parse(checkResult.content[0].text);
    expect(checkPayload.collection).toBe("t_nosql_products");
    expect(checkPayload.collectionName).toBe("t_nosql_products");

    const describeResult = await tools.readNoSqlDatabaseStructure.handler({
      action: "describeCollection",
      collectionName: "t_nosql_products",
    });
    const describePayload = JSON.parse(describeResult.content[0].text);
    expect(describePayload.collection).toBe("t_nosql_products");
    expect(describePayload.collectionName).toBe("t_nosql_products");
    expect(describePayload.message).toBe("获取云开发数据库集合信息成功");

    // For createCollection: DescribeTable fails (not exist) → CreateTable → DescribeTable succeeds (ready)
    let describeTableCallCount = 0;
    mockCommonServiceCall.mockImplementation(async ({ Action }) => {
      if (Action === "DescribeTable") {
        describeTableCallCount++;
        if (describeTableCallCount === 1) throw new Error("not exist");
        return { RequestId: "req-check-ready", IndexNum: 0, Indexes: [] };
      }
      if (Action === "CreateTable") return { RequestId: "req-create" };
      if (Action === "PutItem") return { RequestId: "req-insert", InsertedIds: ["doc-1"] };
      throw new Error(`Unexpected: ${Action}`);
    });

    const createResult = await tools.writeNoSqlDatabaseStructure.handler({
      action: "createCollection",
      collectionName: "t_nosql_products",
    });
    const createPayload = JSON.parse(createResult.content[0].text);
    expect(createPayload.collection).toBe("t_nosql_products");
    expect(createPayload.collectionName).toBe("t_nosql_products");
    expect(createPayload.action).toBe("createCollection");
    expect(createPayload.message).toBe("云开发数据库集合创建成功");

    const insertResult = await tools.writeNoSqlDatabaseContent.handler({
      action: "insert",
      collectionName: "t_nosql_products",
      documents: [{ name: "chain_nosql_probe_001", status: "active" }],
    });
    const insertPayload = JSON.parse(insertResult.content[0].text);
    expect(insertPayload.collection).toBe("t_nosql_products");
    expect(insertPayload.collectionName).toBe("t_nosql_products");
    expect(insertPayload.insertedIds).toEqual(["doc-1"]);
    expect(insertPayload.insertedCount).toBe(1);
    expect(insertPayload.message).toBe("文档插入成功");
    expect(insertPayload).not.toHaveProperty("nextActions");
  });

  it("createCollection should return friendly message when collection already exists", async () => {
    const { tools } = createMockServer();

    // DescribeTable 成功 = 集合存在
    mockCommonServiceCall.mockImplementation(async ({ Action }) => {
      if (Action === "DescribeTable") {
        return { RequestId: "req-check-exists", IndexNum: 0, Indexes: [] };
      }
      throw new Error(`Unexpected action: ${Action}`);
    });

    const result = await tools.writeNoSqlDatabaseStructure.handler({
      action: "createCollection",
      collectionName: "users",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      action: "createCollection",
      collection: "users",
      collectionName: "users",
      requestId: "req-check-exists",
      message: "集合已存在，无需重复创建",
      exists: true,
    });
  });

  it("readNoSqlDatabaseContent should keep non-document strings untouched", async () => {
    mockCommonServiceCall.mockImplementationOnce(async () => ({
      RequestId: "req-query-raw",
      Data: ["raw-value"],
      Pager: {
        Total: 1,
        Limit: 100,
        Offset: 0,
      },
    }));

    const { tools } = createMockServer();
    const result = await tools.readNoSqlDatabaseContent.handler({
      collectionName: "t_nosql_products",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.data).toEqual(["raw-value"]);
  });

  it("readNoSqlDatabaseContent should pass EnvId instead of Tag", async () => {
    const { tools } = createMockServer();

    await tools.readNoSqlDatabaseContent.handler({
      collectionName: "t_nosql_products",
    });

    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "QueryRecords",
        Param: expect.objectContaining({
          EnvId: "env-test",
          TableName: "t_nosql_products",
        }),
      }),
    );
    // Should NOT call getEnvInfo (no longer needed for instanceId)
    expect(mockGetEnvInfo).not.toHaveBeenCalled();
  });

  it("writeNoSqlDatabaseContent should pass EnvId in Param", async () => {
    const { tools } = createMockServer();

    await tools.writeNoSqlDatabaseContent.handler({
      action: "insert",
      collectionName: "t_nosql_products",
      documents: [{ name: "chain_nosql_probe_001", status: "active" }],
    });

    expect(mockGetEnvInfo).not.toHaveBeenCalled();
    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "PutItem",
        Param: expect.objectContaining({
          EnvId: "env-test",
        }),
      }),
    );
  });

  it("readNoSqlDatabaseContent should not call getEnvInfo for concurrent calls", async () => {
    const { tools } = createMockServer();

    await Promise.all([
      tools.readNoSqlDatabaseContent.handler({
        collectionName: "t_nosql_products",
      }),
      tools.readNoSqlDatabaseContent.handler({
        collectionName: "t_nosql_products",
      }),
    ]);

    expect(mockGetEnvInfo).not.toHaveBeenCalled();
  });
});
