import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { __resetPgReadyCache } from "./databasePG.js";
import { registerPGDatabaseTools } from "./databasePG.js";

const {
  mockGetCloudBaseManager,
  mockCommonServiceCall,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockCommonServiceCall: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: vi.fn(async () => "env-test"),
}));

function buildToolPayload(result: any) {
  return JSON.parse(result.content[0].text);
}

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

  return { server, tools };
}

function createFakeClient(
  queryImpl: (sql: string, values?: unknown[]) => Promise<any>,
) {
  return {
    connect: vi.fn(async () => undefined),
    query: vi.fn(queryImpl),
    end: vi.fn(async () => undefined),
  };
}

describe("PG database tools", () => {
  beforeEach(() => {
    __resetPgReadyCache();
    mockGetCloudBaseManager.mockReset();
    mockCommonServiceCall.mockReset();
  });

  it("registers PG tool names", () => {
    const { server, tools } = createMockServer();
    registerPGDatabaseTools(server);

    expect(typeof tools.queryPgDatabase?.handler).toBe("function");
    expect(typeof tools.managePgDatabase?.handler).toBe("function");
    expect(tools.getPgSchema).toBeUndefined();
  });

  it("managePgDatabase(action=init) is no longer supported", async () => {
    const { server, tools } = createMockServer();
    registerPGDatabaseTools(server, {
      createClient: vi.fn(),
    });

    const result = await tools.managePgDatabase.handler({
      action: "init",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "UNSUPPORTED_ACTION",
    });
  });

  it("queryPgDatabase(context) returns auto-derived context without init", async () => {
    const { server, tools } = createMockServer();
    registerPGDatabaseTools(server, {
      createClient: vi.fn(),
    });

    const result = await tools.queryPgDatabase.handler({
      action: "context",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: true,
      data: {
        context: {
          envId: "env-test",
          instanceId: "cloudbase-pg",
          defaultSchema: "public",
          runtimeMode: "cloudbase-manager",
          bootstrapMode: "cloud",
          role: "cloudbase_admin",
        },
      },
    });
  });

  it("queryPgDatabase(sql) rejects mutating SQL without init", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    const result = await tools.queryPgDatabase.handler({
      action: "sql",
      sql: "DELETE FROM public.users",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "READ_ONLY_SQL_REQUIRED",
    });
  });

  it("queryPgDatabase(objects) returns schema-qualified summaries without init", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (sql.includes("FROM pg_class c") && sql.includes("LIMIT $2")) {
        return {
          rows: [
            {
              schema: "public",
              name: "users",
              kind: "table",
              estimated_rows: 42,
            },
          ],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    const result = await tools.queryPgDatabase.handler({
      action: "objects",
      limit: 10,
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: true,
      data: {
        objects: [
          {
            schemaTable: "public.users",
            kind: "table",
          },
        ],
      },
    });
  });

  it("queryPgDatabase(metadata) returns row-count summaries without row samples", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (sql.includes("COALESCE(col_counts.column_count")) {
        return {
          rows: [
            {
              schema: "public",
              name: "users",
              kind: "table",
              estimated_rows: 12,
              rls_enabled: true,
              column_count: 4,
            },
          ],
          rowCount: 1,
        };
      }
      if (
        sql.includes(
          'SELECT COUNT(*)::bigint AS row_count FROM "public"."users"',
        )
      ) {
        return {
          rows: [{ row_count: 9 }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    const result = await tools.queryPgDatabase.handler({
      action: "metadata",
      limit: 10,
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: true,
      data: {
        tables: [
          {
            schemaTable: "public.users",
            rowCount: 12,
            rowCountSource: "estimated",
            rlsEnabled: true,
          },
        ],
      },
    });
    expect(payload.data.tables[0].rows).toBeUndefined();
  });

  it("queryPgDatabase(schema) rejects non schema-qualified object names", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    const result = await tools.queryPgDatabase.handler({
      action: "schema",
      objectName: "users",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "SCHEMA_QUALIFIED_NAME_REQUIRED",
    });
  });

  it("queryPgDatabase(schema) returns columns, keys, indexes, and security summary", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (
        sql.includes("FROM pg_class c") &&
        sql.includes("row_security_enabled")
      ) {
        return {
          rows: [
            {
              kind: "table",
              row_security_enabled: true,
              force_row_security: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM information_schema.columns")) {
        return {
          rows: [
            {
              column_name: "id",
              data_type: "integer",
              udt_name: "int4",
              is_nullable: "NO",
              column_default: "generated",
              character_maximum_length: null,
              numeric_precision: 32,
              numeric_scale: 0,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("constraint_type = 'PRIMARY KEY'")) {
        return {
          rows: [{ column_name: "id" }],
          rowCount: 1,
        };
      }
      if (sql.includes("constraint_type = 'FOREIGN KEY'")) {
        return {
          rows: [
            {
              constraint_name: "users_org_id_fkey",
              column_name: "org_id",
              foreign_table_schema: "public",
              foreign_table_name: "orgs",
              foreign_column_name: "id",
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM pg_indexes")) {
        return {
          rows: [
            {
              indexname: "users_pkey",
              indexdef:
                "CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)",
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM pg_policies")) {
        return {
          rows: [
            {
              policyname: "users_select",
              permissive: "PERMISSIVE",
              roles: ["authenticated"],
              cmd: "SELECT",
              qual: "(auth.uid() = id)",
              with_check: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (
        sql.includes(
          'SELECT COUNT(*)::bigint AS row_count FROM "public"."users"',
        )
      ) {
        return {
          rows: [{ row_count: 7 }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    const result = await tools.queryPgDatabase.handler({
      action: "schema",
      objectName: "public.users",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: true,
      data: {
        schemaTable: "public.users",
        primaryKey: ["id"],
        rowCount: 7,
        security: {
          rowLevelSecurityEnabled: true,
          policies: [
            {
              name: "users_select",
            },
          ],
        },
      },
    });
    expect(payload.data.columns[0]).toMatchObject({
      name: "id",
      dataType: "integer",
    });
    expect(payload.data.foreignKeys[0]).toMatchObject({
      references: "public.orgs",
    });
  });

  it("managePgDatabase(execute) soft-blocks schema DDL and guides applyMigration", async () => {
    const { server, tools } = createMockServer();
    registerPGDatabaseTools(server, {
      createClient: vi.fn(),
    });

    const result = await tools.managePgDatabase.handler({
      action: "execute",
      sql: "CREATE TABLE public.users(id int)",
      confirm: true,
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "DDL_USE_APPLY_MIGRATION",
      data: {
        classification: {
          risk: "schema_change",
        },
      },
      nextActions: [
        {
          tool: "managePgDatabase",
          action: "planMigration",
        },
        {
          tool: "managePgDatabase",
          action: "applyMigration",
          suggested_args: {
            action: "applyMigration",
            sql: "CREATE TABLE public.users(id int)",
            confirm: true,
          },
        },
      ],
    });
  });

  it("managePgDatabase(execute) allows schema DDL only with allowDdlViaExecute=true", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (sql === "CREATE TABLE public.users(id int)") {
        return {
          rows: [],
          rowCount: null,
          command: "CREATE",
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    const unconfirmed = buildToolPayload(
      await tools.managePgDatabase.handler({
        action: "execute",
        sql: "CREATE TABLE public.users(id int)",
        allowDdlViaExecute: true,
      }),
    );
    expect(unconfirmed).toMatchObject({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
    });

    const confirmedResult = await tools.managePgDatabase.handler({
      action: "execute",
      sql: "CREATE TABLE public.users(id int)",
      confirm: true,
      allowDdlViaExecute: true,
    });
    const confirmedPayload = buildToolPayload(confirmedResult);

    expect(confirmedPayload).toMatchObject({
      success: true,
      data: {
        command: "CREATE",
        targetTable: "public.users",
        classification: {
          risk: "schema_change",
        },
      },
      nextActions: [
        {
          tool: "queryPgDatabase",
          action: "schema",
          suggested_args: {
            action: "schema",
            objectName: "public.users",
          },
        },
      ],
    });
  });

  it("managePgDatabase(execute) reports the real table for CREATE TABLE IF NOT EXISTS with allowDdlViaExecute", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (sql === "CREATE TABLE IF NOT EXISTS public.articles(id int)") {
        return {
          rows: [],
          rowCount: null,
          command: "CREATE",
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    const result = await tools.managePgDatabase.handler({
      action: "execute",
      sql: "CREATE TABLE IF NOT EXISTS public.articles(id int)",
      confirm: true,
      allowDdlViaExecute: true,
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: true,
      data: {
        command: "CREATE",
        targetTable: "public.articles",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("public.IF");
  });

  it("queryPgDatabase(schema) warns when RLS is enabled without policies", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (
        sql.includes("FROM pg_class c") &&
        sql.includes("row_security_enabled")
      ) {
        return {
          rows: [
            {
              kind: "table",
              row_security_enabled: true,
              force_row_security: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM information_schema.columns")) {
        return {
          rows: [
            {
              column_name: "id",
              data_type: "text",
              is_nullable: "NO",
              column_default: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("constraint_type = 'PRIMARY KEY'")) {
        return { rows: [{ column_name: "id" }], rowCount: 1 };
      }
      if (
        sql.includes("constraint_type = 'FOREIGN KEY'") ||
        sql.includes("FROM pg_indexes") ||
        sql.includes("FROM pg_policies")
      ) {
        return { rows: [], rowCount: 0 };
      }
      if (
        sql.includes(
          'SELECT COUNT(*)::bigint AS row_count FROM "public"."articles"',
        )
      ) {
        return { rows: [{ row_count: 0 }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    const result = await tools.queryPgDatabase.handler({
      action: "schema",
      objectName: "public.articles",
    });
    const payload = buildToolPayload(result);

    expect(payload.message).toContain("RLS is enabled but no policies");
    expect(payload.nextActions[0]).toMatchObject({
      tool: "managePgDatabase",
      action: "execute",
    });
  });

  it("managePgDatabase(execute) requires confirm for destructive SQL", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    const result = await tools.managePgDatabase.handler({
      action: "execute",
      sql: "DELETE FROM public.users",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
    });
  });

  it("ensurePgReadyOnce caches readiness across calls", async () => {
    const { server, tools } = createMockServer();
    let probeCount = 0;
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        probeCount += 1;
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (sql.includes("FROM pg_class c")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() => fakeClient),
    });

    // First call triggers readiness probe
    await tools.queryPgDatabase.handler({ action: "objects", limit: 5 });
    const probesAfterFirst = probeCount;

    // Second call should reuse cached readiness (no additional SELECT 1)
    await tools.queryPgDatabase.handler({ action: "objects", limit: 5 });

    // Only 1 SELECT 1 probe expected across both calls
    expect(probeCount).toBe(probesAfterFirst);
  });

  it("ensurePgReadyOnce retries readiness checks until PostgreSQL accepts connections", async () => {
    const { server, tools } = createMockServer();
    let readyAttempts = 0;

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() =>
        createFakeClient(async (sql: string) => {
          if (sql === "SELECT 1") {
            readyAttempts += 1;
            if (readyAttempts < 3) {
              throw new Error("database is still starting");
            }
            return { rows: [{ "?column?": 1 }], rowCount: 1 };
          }
          if (sql.includes("FROM pg_class c")) {
            return { rows: [], rowCount: 0 };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        }),
      ),
      readyCheckOptions: {
        maxAttempts: 3,
        retryDelayMs: 1,
      },
    });

    const payload = buildToolPayload(
      await tools.queryPgDatabase.handler({
        action: "objects",
        limit: 5,
      }),
    );

    expect(payload.success).toBe(true);
    expect(readyAttempts).toBe(3);
  });

  it("returns PG_NOT_READY when PostgreSQL is not available", async () => {
    const { server, tools } = createMockServer();

    registerPGDatabaseTools(server, {
      createClient: vi.fn(() =>
        createFakeClient(async () => {
          throw new Error("database is not available");
        }),
      ),
      readyCheckOptions: {
        maxAttempts: 2,
        retryDelayMs: 1,
      },
    });

    const payload = buildToolPayload(
      await tools.queryPgDatabase.handler({
        action: "objects",
        limit: 5,
      }),
    );

    expect(payload).toMatchObject({
      success: false,
      errorCode: "PG_NOT_READY",
    });
  });

  it("managePgDatabase(dryRun) works without readiness probe", async () => {
    const { server, tools } = createMockServer();

    // createClient 不会被调用，因为 dryRun 不触发就绪探测
    registerPGDatabaseTools(server, {
      createClient: vi.fn(() =>
        createFakeClient(async () => {
          throw new Error("should not be called");
        }),
      ),
    });

    const payload = buildToolPayload(
      await tools.managePgDatabase.handler({
        action: "dryRun",
        sql: "SELECT 1",
      }),
    );

    expect(payload).toMatchObject({
      success: true,
      data: {
        wouldExecute: false,
      },
    });
  });

  describe("migration actions", () => {
    function setupMigrationMock() {
      mockGetCloudBaseManager.mockResolvedValue({
        commonService: vi.fn(() => ({
          call: mockCommonServiceCall,
        })),
      });
    }

    it("listMigrations returns migration list", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });
      setupMigrationMock();
      mockCommonServiceCall.mockResolvedValue({
        RequestId: "req-list",
        Migrations: [],
        Total: 0,
        LatestVersion: "",
      });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({ action: "listMigrations" }),
      );

      expect(payload).toMatchObject({
        success: true,
        data: { Total: 0 },
      });
      expect(mockCommonServiceCall).toHaveBeenCalledWith(
        expect.objectContaining({ Action: "ListPGUserMigrations" }),
      );
    });

    it("listMigrations passes limit and offset", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });
      setupMigrationMock();
      mockCommonServiceCall.mockResolvedValue({
        RequestId: "req-list-2",
        Migrations: [],
        Total: 0,
        LatestVersion: "",
      });

      await tools.managePgDatabase.handler({
        action: "listMigrations",
        limit: 10,
        offset: 20,
      });

      expect(mockCommonServiceCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Action: "ListPGUserMigrations",
          Param: expect.objectContaining({ Limit: 10, Offset: 20 }),
        }),
      );
    });

    it("planMigration requires migrationName", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "planMigration",
          sql: "CREATE TABLE public.test(id int)",
        }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "MIGRATION_NAME_REQUIRED",
      });
    });

    it("planMigration requires migrationVersion", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "planMigration",
          migrationName: "create_test_table",
          sql: "CREATE TABLE public.test(id int)",
        }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "MIGRATION_VERSION_REQUIRED",
      });
    });

    it("planMigration sends Migrations array and nextAction reuses migrationVersion", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });
      setupMigrationMock();
      mockCommonServiceCall.mockResolvedValue({
        RequestId: "req-plan",
        Pending: [],
        Applied: [],
        Conflicts: [],
        Executable: true,
      });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "planMigration",
          migrationName: "create_test_table",
          migrationVersion: "20260720160000",
          sql: "CREATE TABLE public.test(id int)",
          rollbackSql: "DROP TABLE public.test",
        }),
      );

      expect(payload).toMatchObject({
        success: true,
        data: {
          migrationVersion: "20260720160000",
          migrationName: "create_test_table",
          localFileHint: "migrations/20260720160000_create_test_table.sql",
        },
        nextActions: [
          {
            tool: "managePgDatabase",
            action: "applyMigration",
            suggested_args: {
              action: "applyMigration",
              migrationName: "create_test_table",
              migrationVersion: "20260720160000",
              sql: "CREATE TABLE public.test(id int)",
              confirm: true,
              rollbackSql: "DROP TABLE public.test",
            },
          },
        ],
      });
      expect(mockCommonServiceCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Action: "PreviewPGUserMigrations",
          Param: expect.objectContaining({
            Migrations: [
              expect.objectContaining({
                Name: "create_test_table",
                Query: "CREATE TABLE public.test(id int)",
                Rollback: "DROP TABLE public.test",
                Version: "20260720160000",
              }),
            ],
          }),
        }),
      );
    });

    it("applyMigration requires confirm=true", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "applyMigration",
          migrationName: "create_test_table",
          migrationVersion: "20260720160000",
          sql: "CREATE TABLE public.test(id int)",
        }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "CONFIRM_REQUIRED",
      });
    });

    it("applyMigration requires migrationVersion", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "applyMigration",
          migrationName: "create_test_table",
          sql: "CREATE TABLE public.test(id int)",
          confirm: true,
        }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "MIGRATION_VERSION_REQUIRED",
      });
    });

    it("applyMigration sends Migrations array and returns localFileHint", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });
      setupMigrationMock();
      mockCommonServiceCall.mockResolvedValue({
        RequestId: "req-apply",
        TaskId: "task-1",
      });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "applyMigration",
          migrationName: "create_test_table",
          migrationVersion: "20260720160000",
          sql: "CREATE TABLE public.test(id int)",
          confirm: true,
        }),
      );

      expect(payload).toMatchObject({
        success: true,
        data: {
          migrationVersion: "20260720160000",
          migrationName: "create_test_table",
          localFileHint: "migrations/20260720160000_create_test_table.sql",
          apiResult: { TaskId: "task-1" },
        },
      });
      expect(mockCommonServiceCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Action: "PushPGUserMigrations",
          Param: expect.objectContaining({
            Migrations: [
              expect.objectContaining({
                Name: "create_test_table",
                Query: "CREATE TABLE public.test(id int)",
                Version: "20260720160000",
              }),
            ],
          }),
        }),
      );
    });

    it("applyMigration passes lockTimeoutMs and statementTimeoutMs", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });
      setupMigrationMock();
      mockCommonServiceCall.mockResolvedValue({
        RequestId: "req-apply-2",
        TaskId: "task-2",
      });

      await tools.managePgDatabase.handler({
        action: "applyMigration",
        migrationName: "create_test_table",
        migrationVersion: "20260720160000",
        sql: "CREATE TABLE public.test(id int)",
        confirm: true,
        lockTimeoutMs: 10000,
        statementTimeoutMs: 600000,
      });

      expect(mockCommonServiceCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Action: "PushPGUserMigrations",
          Param: expect.objectContaining({
            LockTimeoutMs: 10000,
            StatementTimeoutMs: 600000,
          }),
        }),
      );
    });

    it("migrationDetail requires migrationVersion", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({ action: "migrationDetail" }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "MIGRATION_VERSION_REQUIRED",
      });
    });

    it("migrationDetail sends MigrationVersion", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });
      setupMigrationMock();
      mockCommonServiceCall.mockResolvedValue({
        RequestId: "req-detail",
        Version: "20260526000000",
        Name: "create_test_table",
        Query: "CREATE TABLE public.test(id int)",
      });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "migrationDetail",
          migrationVersion: "20260526000000",
        }),
      );

      expect(payload).toMatchObject({ success: true });
      expect(mockCommonServiceCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Action: "DescribePGUserMigration",
          Param: expect.objectContaining({
            MigrationVersion: "20260526000000",
          }),
        }),
      );
    });

    it("rollbackMigration requires lastN", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "rollbackMigration",
          confirm: true,
        }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "LAST_N_REQUIRED",
      });
    });

    it("rollbackMigration requires confirm=true", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "rollbackMigration",
          lastN: 1,
        }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "CONFIRM_REQUIRED",
      });
    });

    it("rollbackMigration sends LastN", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });
      setupMigrationMock();
      mockCommonServiceCall.mockResolvedValue({
        RequestId: "req-rollback",
      });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "rollbackMigration",
          lastN: 3,
          confirm: true,
        }),
      );

      expect(payload).toMatchObject({ success: true });
      expect(mockCommonServiceCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Action: "RollbackPGUserMigrations",
          Param: expect.objectContaining({ LastN: 3 }),
        }),
      );
    });

    it("repairMigration requires migrationVersion", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "repairMigration",
          migrationName: "test_init",
          repairStatus: "applied",
          repairReason: "manual fix",
        }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "MIGRATION_VERSION_REQUIRED",
      });
    });

    it("repairMigration requires repairStatus", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "repairMigration",
          migrationVersion: "20260526000000",
          migrationName: "test_init",
          repairReason: "manual fix",
        }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "REPAIR_STATUS_REQUIRED",
      });
    });

    it("repairMigration with applied status requires sql", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "repairMigration",
          migrationVersion: "20260526000000",
          migrationName: "test_init",
          repairStatus: "applied",
          repairReason: "manual fix",
        }),
      );

      expect(payload).toMatchObject({
        success: false,
        errorCode: "SQL_REQUIRED",
      });
    });

    it("repairMigration with applied status sends Query when sql provided", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });
      setupMigrationMock();
      mockCommonServiceCall.mockResolvedValue({ RequestId: "req-repair-1" });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "repairMigration",
          migrationVersion: "20260526000000",
          migrationName: "test_init",
          repairStatus: "applied",
          repairReason: "manual fix",
          sql: "CREATE TABLE public.test(id int)",
        }),
      );

      expect(payload).toMatchObject({ success: true });
      expect(mockCommonServiceCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Action: "RepairPGUserMigrationHistory",
          Param: expect.objectContaining({
            MigrationVersion: "20260526000000",
            Name: "test_init",
            Status: "applied",
            Reason: "manual fix",
            Query: "CREATE TABLE public.test(id int)",
          }),
        }),
      );
    });

    it("repairMigration with reverted status does not send Query", async () => {
      const { server, tools } = createMockServer();
      registerPGDatabaseTools(server, { createClient: vi.fn() });
      setupMigrationMock();
      mockCommonServiceCall.mockResolvedValue({ RequestId: "req-repair-2" });

      const payload = buildToolPayload(
        await tools.managePgDatabase.handler({
          action: "repairMigration",
          migrationVersion: "20260526000000",
          migrationName: "test_init",
          repairStatus: "reverted",
          repairReason: "remove bad record",
        }),
      );

      expect(payload).toMatchObject({ success: true });
      const callArg = mockCommonServiceCall.mock.calls[0][0];
      expect(callArg.Param).not.toHaveProperty("Query");
      expect(callArg.Param).toMatchObject({
        Status: "reverted",
        Reason: "remove bad record",
      });
    });
  });
});
