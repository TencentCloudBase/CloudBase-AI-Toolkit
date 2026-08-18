import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.join(__dirname, "..", "config", "kimi-plugin");
const RUNNER = path.join(PLUGIN_DIR, "scripts", "run-tool.mjs");

const EXPECTED_TOOLS = [
  "query_database",
  "list_functions",
  "list_storage",
  "list_cloudrun",
];

function readJson(fileName) {
  return JSON.parse(
    fs.readFileSync(path.join(PLUGIN_DIR, fileName), "utf8"),
  );
}

describe("Kimi CloudBase plugin packaging", () => {
  test("kimi.plugin.json matches Kimi Code 0.34.0 native format", () => {
    const manifest = readJson("kimi.plugin.json");
    expect(manifest.$schema).toBe(
      "https://kimi.com/schemas/kimi.plugin.schema.json",
    );
    expect(manifest.name).toBe("cloudbase");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.interface.displayName).toBe("Tencent CloudBase");
    expect(manifest.mcpServers.cloudbase.command).toBe("npx");
    expect(manifest.mcpServers.cloudbase.args).toEqual([
      "-y",
      "@cloudbase/cloudbase-mcp@latest",
    ]);
    expect(manifest.tools).toBeUndefined();
    expect(manifest.inject).toBeUndefined();
    expect(
      fs.existsSync(path.join(PLUGIN_DIR, "skills", "cloudbase", "SKILL.md")),
    ).toBe(true);
  });

  test("plugin.json declares four tcb tools with command and JSON Schema", () => {
    const spec = readJson("plugin.json");
    expect(spec.name).toBe("cloudbase");
    expect(Array.isArray(spec.tools)).toBe(true);
    expect(spec.tools.map((tool) => tool.name)).toEqual(EXPECTED_TOOLS);

    for (const tool of spec.tools) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.command).toEqual([
        "node",
        "scripts/run-tool.mjs",
        tool.name,
      ]);
      expect(tool.parameters.type).toBe("object");
      expect(tool.parameters.properties).toBeTruthy();
    }

    const db = spec.tools.find((tool) => tool.name === "query_database");
    expect(db.parameters.properties.engine.enum).toEqual([
      "postgresql",
      "mysql",
      "nosql",
    ]);
  });

  test("run-tool.mjs rejects unknown tools with JSON on stdout", () => {
    const result = spawnSync(process.execPath, [RUNNER, "not_a_tool"], {
      encoding: "utf8",
      input: "{}",
    });
    expect(result.status).not.toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/unknown tool/);
  });

  test("run-tool.mjs invokes tcb with JSON stdin when tcb is on PATH", () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-plugin-tcb-"));
    const stubName = process.platform === "win32" ? "tcb.cmd" : "tcb";
    const stubPath = path.join(binDir, stubName);
    const script = `#!/usr/bin/env node
const fs = require("fs");
fs.writeFileSync(process.env.TCB_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
process.stdout.write(JSON.stringify({ functions: [{ name: "hello" }] }));
`;
    fs.writeFileSync(stubPath, script, { mode: 0o755 });

    const argvFile = path.join(binDir, "argv.json");
    const result = spawnSync(
      process.execPath,
      [RUNNER, "list_functions"],
      {
        encoding: "utf8",
        input: JSON.stringify({ envId: "env-test", limit: 5 }),
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          TCB_ARGV_FILE: argvFile,
        },
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.tool).toBe("list_functions");
    expect(payload.result).toEqual({ functions: [{ name: "hello" }] });
    expect(JSON.parse(fs.readFileSync(argvFile, "utf8"))).toEqual([
      "fn",
      "list",
      "--json",
      "-e",
      "env-test",
      "--limit",
      "5",
    ]);
  });
});
