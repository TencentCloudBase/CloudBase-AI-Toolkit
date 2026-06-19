import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseToolPayload(result) {
  const text = result.content?.[0]?.text;
  assert(typeof text === "string" && text.length > 0, "Tool result did not contain JSON text payload");
  return JSON.parse(text);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const contextPath = process.env.CLOUDBASE_PG_CONTEXT_PATH ?? path.join(
  os.tmpdir(),
  `cloudbase-pg-mcp-smoke-${Date.now()}.json`,
);

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(packageDir, "dist", "cli.cjs")],
    env: {
      ...process.env,
      NODE_ENV: "test",
      CLOUDBASE_PG_CONTEXT_PATH: contextPath,
    },
    stderr: "pipe",
  });
  const client = new Client(
    {
      name: "cloudbase-pg-cloud-smoke",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  const smokeTable = `public.pg_mcp_smoke_${Date.now()}`;

  try {
    await client.connect(transport);

    const toolList = await client.listTools();
    const toolNames = toolList.tools.map((tool) => tool.name);
    for (const toolName of ["queryPgDatabase", "managePgDatabase"]) {
      assert(toolNames.includes(toolName), `Missing expected tool: ${toolName}`);
    }

    const init = parseToolPayload(
      await client.callTool({
        name: "managePgDatabase",
        arguments: {
          action: "init",
        },
      }),
    );
    assert(init.success === true, `managePgDatabase(init) failed: ${init.message}`);

    const context = parseToolPayload(
      await client.callTool({
        name: "queryPgDatabase",
        arguments: { action: "context" },
      }),
    );
    assert(context.success === true, `queryPgDatabase(context) failed: ${context.message}`);
    assert(context.data?.context?.bootstrapMode === "cloud", "PG context did not persist cloud bootstrap mode");

    const objects = parseToolPayload(
      await client.callTool({
        name: "queryPgDatabase",
        arguments: {
          action: "objects",
          schema: "storage",
          limit: 20,
        },
      }),
    );
    assert(objects.success === true, `queryPgDatabase(objects) failed: ${objects.message}`);
    assert(
      objects.data?.objects?.some((object) => object.schemaTable === "storage.buckets"),
      "storage.buckets was not found in schema-qualified object list",
    );

    const metadata = parseToolPayload(
      await client.callTool({
        name: "queryPgDatabase",
        arguments: {
          action: "metadata",
          schema: "storage",
          limit: 20,
        },
      }),
    );
    assert(metadata.success === true, `queryPgDatabase(metadata) failed: ${metadata.message}`);
    assert(
      metadata.data?.tables?.some((table) => table.schemaTable === "storage.buckets"),
      "storage.buckets was not found in metadata summary",
    );

    const schema = parseToolPayload(
      await client.callTool({
        name: "queryPgDatabase",
        arguments: { action: "schema", objectName: "storage.buckets" },
      }),
    );
    assert(schema.success === true, `queryPgDatabase(schema, storage.buckets) failed: ${schema.message}`);
    assert(Array.isArray(schema.data?.columns) && schema.data.columns.length > 0, "storage.buckets schema did not return columns");

    const createTable = parseToolPayload(
      await client.callTool({
        name: "managePgDatabase",
        arguments: {
          action: "execute",
          sql: `CREATE TABLE ${smokeTable}(id serial PRIMARY KEY, note text NOT NULL)`,
          confirm: true,
        },
      }),
    );
    assert(createTable.success === true, `CREATE TABLE failed: ${createTable.message}`);

    const insert = parseToolPayload(
      await client.callTool({
        name: "managePgDatabase",
        arguments: {
          action: "execute",
          sql: `INSERT INTO ${smokeTable}(note) VALUES ('integration-smoke') RETURNING id, note`,
          confirm: true,
        },
      }),
    );
    assert(insert.success === true, `INSERT smoke row failed: ${insert.message}`);
    assert(insert.data?.rowCount === 1, "INSERT smoke row did not affect exactly one row");

    const verify = parseToolPayload(
      await client.callTool({
        name: "queryPgDatabase",
        arguments: {
          action: "sql",
          sql: `SELECT note FROM ${smokeTable} ORDER BY id DESC LIMIT 1`,
          limit: 5,
        },
      }),
    );
    assert(verify.success === true, `SELECT verification failed: ${verify.message}`);
    assert(verify.data?.rows?.[0]?.note === "integration-smoke", "Smoke row verification did not return expected payload");

    const drop = parseToolPayload(
      await client.callTool({
        name: "managePgDatabase",
        arguments: {
          action: "execute",
          sql: `DROP TABLE ${smokeTable}`,
          confirm: true,
        },
      }),
    );
    assert(drop.success === true, `DROP TABLE cleanup failed: ${drop.message}`);

    console.log(JSON.stringify({
      success: true,
      contextPath,
      verifiedFlow: [
        "managePgDatabase:init",
        "queryPgDatabase:context",
        "queryPgDatabase:objects",
        "queryPgDatabase:metadata",
        "queryPgDatabase:schema",
        "managePgDatabase:execute:create",
        "managePgDatabase:execute:insert",
        "queryPgDatabase:sql:verify",
        "managePgDatabase:execute:drop",
      ],
    }, null, 2));
  } finally {
    await transport.close().catch(() => undefined);
    if (!process.env.CLOUDBASE_PG_CONTEXT_PATH) {
      await fs.rm(contextPath, { force: true }).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
