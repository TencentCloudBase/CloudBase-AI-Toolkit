import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { registerPGDatabaseTools } from "./databasePG.js";

function buildToolPayload(result: any) {
  return JSON.parse(result.content[0].text);
}

function createTempContextPath() {
  return path.join(
    os.tmpdir(),
    `cloudbase-pg-mcp-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
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

function createFakeClient(queryImpl: (sql: string, values?: unknown[]) => Promise<any>) {
  return {
    connect: vi.fn(async () => undefined),
    query: vi.fn(queryImpl),
    end: vi.fn(async () => undefined),
  };
}

function createBootstrapResult() {
  return {
    instanceId: "cloudbase-pg-local",
    connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
    defaultSchema: "public",
    status: "ready" as const,
    bootstrapMode: "manual" as const,
  };
}

describe("PG database tools", () => {
  let contextPath: string;

  beforeEach(() => {
    contextPath = createTempContextPath();
    process.env.CLOUDBASE_PG_CONTEXT_PATH = contextPath;
  });

  afterEach(async () => {
    delete process.env.CLOUDBASE_PG_CONTEXT_PATH;
    await fs.rm(contextPath, { force: true });
  });

  it("registers PG tool names", () => {
    const { server, tools } = createMockServer();
    registerPGDatabaseTools(server);

    expect(typeof tools.queryPgDatabase?.handler).toBe("function");
    expect(typeof tools.managePgDatabase?.handler).toBe("function");
    expect(typeof tools.getPgSchema?.handler).toBe("function");
  });

  it("managePgDatabase(init) stores PG context", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      bootstrapProvider: {
        bootstrap: vi.fn(async () => createBootstrapResult()),
      },
      createClient: vi.fn(() => fakeClient),
    });

    const initResult = await tools.managePgDatabase.handler({
      action: "init",
      connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
    });
    const payload = buildToolPayload(initResult);
    const saved = JSON.parse(await fs.readFile(contextPath, "utf8"));

    expect(payload).toMatchObject({
      success: true,
      data: {
        context: {
          instanceId: "cloudbase-pg-local",
          defaultSchema: "public",
          runtimeMode: "local",
        },
      },
    });
    expect(saved).toMatchObject({
      envId: "env-test",
      instanceId: "cloudbase-pg-local",
      defaultSchema: "public",
    });
  });

  it("managePgDatabase(init) retries readiness checks until PostgreSQL accepts connections", async () => {
    const { server, tools } = createMockServer();
    let readyAttempts = 0;

    registerPGDatabaseTools(server, {
      bootstrapProvider: {
        bootstrap: vi.fn(async () => createBootstrapResult()),
      },
      createClient: vi.fn(() =>
        createFakeClient(async (sql: string) => {
          if (sql !== "SELECT 1") {
            throw new Error(`Unexpected SQL: ${sql}`);
          }

          readyAttempts += 1;
          if (readyAttempts < 3) {
            throw new Error("database is still starting");
          }

          return { rows: [{ "?column?": 1 }], rowCount: 1 };
        })
      ),
      readyCheckOptions: {
        maxAttempts: 3,
        retryDelayMs: 1,
      },
    });

    const payload = buildToolPayload(
      await tools.managePgDatabase.handler({
        action: "init",
        connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
      }),
    );

    expect(payload).toMatchObject({
      success: true,
    });
    expect(readyAttempts).toBe(3);
  });

  it("queryPgDatabase(sql) rejects mutating SQL", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      bootstrapProvider: {
        bootstrap: vi.fn(async () => createBootstrapResult()),
      },
      createClient: vi.fn(() => fakeClient),
    });

    await tools.managePgDatabase.handler({
      action: "init",
      connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
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

  it("queryPgDatabase(objects) returns schema-qualified summaries", async () => {
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
      bootstrapProvider: {
        bootstrap: vi.fn(async () => createBootstrapResult()),
      },
      createClient: vi.fn(() => fakeClient),
    });

    await tools.managePgDatabase.handler({
      action: "init",
      connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
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
      if (sql.includes('SELECT COUNT(*)::bigint AS row_count FROM "public"."users"')) {
        return {
          rows: [{ row_count: 9 }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      bootstrapProvider: {
        bootstrap: vi.fn(async () => createBootstrapResult()),
      },
      createClient: vi.fn(() => fakeClient),
    });

    await tools.managePgDatabase.handler({
      action: "init",
      connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
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
            rowCount: 9,
            rowCountSource: "actual",
            rlsEnabled: true,
          },
        ],
      },
    });
    expect(payload.data.tables[0].rows).toBeUndefined();
  });

  it("getPgSchema rejects non schema-qualified object names", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      bootstrapProvider: {
        bootstrap: vi.fn(async () => createBootstrapResult()),
      },
      createClient: vi.fn(() => fakeClient),
    });

    await tools.managePgDatabase.handler({
      action: "init",
      connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
    });

    const result = await tools.getPgSchema.handler({
      objectName: "users",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: false,
      errorCode: "SCHEMA_QUALIFIED_NAME_REQUIRED",
    });
  });

  it("getPgSchema returns columns, keys, indexes, and security summary", async () => {
    const { server, tools } = createMockServer();
    const fakeClient = createFakeClient(async (sql: string) => {
      if (sql === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (sql.includes("FROM pg_class c") && sql.includes("row_security_enabled")) {
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
              indexdef: "CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)",
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
      if (sql.includes('SELECT COUNT(*)::bigint AS row_count FROM "public"."users"')) {
        return {
          rows: [{ row_count: 7 }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    registerPGDatabaseTools(server, {
      bootstrapProvider: {
        bootstrap: vi.fn(async () => createBootstrapResult()),
      },
      createClient: vi.fn(() => fakeClient),
    });

    await tools.managePgDatabase.handler({
      action: "init",
      connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
    });

    const result = await tools.getPgSchema.handler({
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

  it("managePgDatabase(execute) allows normal DDL/DML", async () => {
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
      bootstrapProvider: {
        bootstrap: vi.fn(async () => createBootstrapResult()),
      },
      createClient: vi.fn(() => fakeClient),
    });

    await tools.managePgDatabase.handler({
      action: "init",
      connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
    });

    const result = await tools.managePgDatabase.handler({
      action: "execute",
      sql: "CREATE TABLE public.users(id int)",
    });
    const payload = buildToolPayload(result);

    expect(payload).toMatchObject({
      success: true,
      data: {
        command: "CREATE",
      },
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
      bootstrapProvider: {
        bootstrap: vi.fn(async () => createBootstrapResult()),
      },
      createClient: vi.fn(() => fakeClient),
    });

    await tools.managePgDatabase.handler({
      action: "init",
      connectionUri: "postgresql://cloudbase_admin:secret@localhost:5432/postgres",
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

  it("all PG tools return actionable error before init", async () => {
    const { server, tools } = createMockServer();
    registerPGDatabaseTools(server, {
      bootstrapProvider: {
        bootstrap: vi.fn(),
      },
      createClient: vi.fn(),
    });

    const queryResult = buildToolPayload(
      await tools.queryPgDatabase.handler({ action: "objects" }),
    );
    const executeResult = buildToolPayload(
      await tools.managePgDatabase.handler({
        action: "execute",
        sql: "CREATE TABLE public.users(id int)",
      }),
    );
    const schemaResult = buildToolPayload(
      await tools.getPgSchema.handler({ objectName: "public.users" }),
    );

    for (const payload of [queryResult, executeResult, schemaResult]) {
      expect(payload).toMatchObject({
        success: false,
        errorCode: "PG_CONTEXT_NOT_INITIALIZED",
      });
      expect(payload.nextActions?.[0]).toMatchObject({
        tool: "managePgDatabase",
        action: "init",
      });
    }
  });
});
