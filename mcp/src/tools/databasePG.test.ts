import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { __resetPgReadyCache } from "./databasePG.js";
import { registerPGDatabaseTools } from "./databasePG.js";

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

  it("managePgDatabase(execute) requires confirm for normal DDL/DML and then executes", async () => {
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

    const result = await tools.managePgDatabase.handler({
      action: "execute",
      sql: "CREATE TABLE public.users(id int)",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
      data: {
        classification: {
          risk: "schema_change",
        },
      },
    });

    const confirmedResult = await tools.managePgDatabase.handler({
      action: "execute",
      sql: "CREATE TABLE public.users(id int)",
      confirm: true,
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

  it("managePgDatabase(execute) reports the real table for CREATE TABLE IF NOT EXISTS", async () => {
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
});
