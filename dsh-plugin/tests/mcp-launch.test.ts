import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const launchPath = join(root, "scripts/mcp-launch.mjs");

describe("mcp launch", () => {
  it("does not implement an MCP frame parser", () => {
    const source = readFileSync(launchPath, "utf8");
    expect(source).toContain('stdio: "inherit"');
    expect(source).not.toContain("Content-Length");
    expect(source).not.toContain("list_bound_envs");
  });

  it("execs the configured command and forwards stdio", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-launch-"));
    const stub = join(dir, "stub.mjs");
    writeFileSync(
      stub,
      [
        "let buf = '';",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (chunk) => {",
        "  buf += chunk;",
        "  if (buf.includes('\\n')) {",
        "    process.stdout.write(buf);",
        "    process.exit(0);",
        "  }",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );
    const child = spawn(process.execPath, [launchPath], {
      env: {
        ...process.env,
        CLOUDBASE_MCP_COMMAND: process.execPath,
        CLOUDBASE_MCP_ARGS: stub,
        CLOUDBASE_API_KEY: "should-not-pass",
        http_proxy: "http://127.0.0.1:9",
      },
    });
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stdin.write('{"jsonrpc":"2.0","id":1}\n');
    const code = await new Promise<number | null>((resolve) => {
      child.on("exit", resolve);
    });
    expect(code).toBe(0);
    expect(Buffer.concat(stdout).toString("utf8")).toContain('"id":1');
  });
});
