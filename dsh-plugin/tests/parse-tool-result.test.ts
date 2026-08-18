import { describe, expect, it } from "vitest";
import { parseDeploy, parseTable, toCsv, type ToolBlock } from "../src/client/lib/parse-tool-result.js";

describe("tool result parsing", () => {
  it("renders queryPgDatabase rows as a table model", () => {
    const block: ToolBlock = {
      toolName: "queryPgDatabase",
      durationMs: 800,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              rows: [
                { id: "u1", email: "a@example.com" },
                { id: "u2", email: "b@example.com" },
              ],
            }),
          },
        ],
      },
    };
    const table = parseTable(block, "queryPgDatabase");
    expect(table.columns).toEqual(["id", "email"]);
    expect(table.rows).toHaveLength(2);
    expect(toCsv(table.columns, table.rows)).toContain("a@example.com");
  });

  it("extracts a real hosting domain without inventing rollback state", () => {
    const block: ToolBlock = {
      toolName: "manageHosting",
      args: { action: "upload" },
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              accessUrl: "https://todo-app.tcloudbaseapp.com/",
              files: ["dist/index.html"],
            }),
          },
        ],
      },
    };
    const deploy = parseDeploy(block);
    expect(deploy.domain).toBe("todo-app.tcloudbaseapp.com");
    expect(deploy.url).toContain("https://");
    expect(JSON.stringify(deploy).toLowerCase()).not.toContain("rollback");
    expect(deploy.deployedAt).toBeUndefined();
  });
});
