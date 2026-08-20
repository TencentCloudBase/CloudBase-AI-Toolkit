import { describe, expect, it } from "vitest";
import { friendlyError, parseDeploy, parseTable, toCsv, type ToolBlock } from "../src/client/lib/parse-tool-result.js";

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

  it("extracts accessUrls arrays from manageCloudRun / manageFunctions results", () => {
    const block: ToolBlock = {
      toolName: "manageCloudRun",
      args: { action: "deploy" },
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              accessUrls: ["https://svc-abc-123.tcloudbaseapp.com/"],
              defaultDomain: "svc-abc-123.tcloudbaseapp.com",
            }),
          },
        ],
      },
    };
    const deploy = parseDeploy(block);
    expect(deploy.url).toBe("https://svc-abc-123.tcloudbaseapp.com/");
    expect(deploy.domain).toBe("svc-abc-123.tcloudbaseapp.com");
  });

  it("falls back to defaultDomain when accessUrl is absent (functions HTTP trigger)", () => {
    const block: ToolBlock = {
      toolName: "manageFunctions",
      args: { action: "create" },
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              defaultDomain: "fn-hello-123.tcloudbaseapp.com",
              trigger: { path: "/hello" },
            }),
          },
        ],
      },
    };
    const deploy = parseDeploy(block);
    expect(deploy.url).toBe("https://fn-hello-123.tcloudbaseapp.com");
    expect(deploy.domain).toBe("fn-hello-123.tcloudbaseapp.com");
  });

  it("maps expired/arrears errors to friendly copy", () => {
    const raw = "[ListTables] Resource has expired. Please renewal fee... RequestId: xyz 📦 CloudBase MCP v2.28.1";
    expect(friendlyError(raw)).toBe("该环境资源已过期或欠费，续费后即可恢复使用。");
  });

  it("truncates long errors to the first line", () => {
    expect(friendlyError("line one\nline two\nline three")).toBe("line one");
  });
});
