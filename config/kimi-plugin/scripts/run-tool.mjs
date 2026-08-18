#!/usr/bin/env node
/**
 * Kimi-cli plugin tool runner (official plugin.json tools[] format).
 *
 * Spec snapshot: moonshotai.github.io/kimi-cli/en/customization/plugins.html
 * (Beta, captured 2026-08-18). Tools receive JSON on stdin and print JSON
 * to stdout. Kimi Code 0.34.0 ignores this file and uses kimi.plugin.json
 * mcpServers instead.
 */

import { spawnSync } from "node:child_process";
import process from "node:process";

const TOOLS = new Set([
  "query_database",
  "list_functions",
  "list_storage",
  "list_cloudrun",
]);

function fail(message, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ok: false, error: message, ...extra }, null, 2) + "\n",
  );
  process.exit(1);
}

function succeed(payload) {
  process.stdout.write(JSON.stringify({ ok: true, ...payload }, null, 2) + "\n");
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail("stdin must be a JSON object", { parseError: String(error) });
  }
}

function findTcb() {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, ["tcb"], { encoding: "utf8" });
  if (result.status === 0) {
    const first = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) {
      return first;
    }
  }
  return null;
}

function runTcb(tcbBin, args) {
  const result = spawnSync(tcbBin, args, {
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error.message) : undefined,
  };
}

function parseTcbOutput(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { text: "" };
  }
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { text };
  }
}

function envArgs(params) {
  const envId = params.envId || process.env.CLOUDBASE_ENV_ID;
  return envId ? ["-e", String(envId)] : [];
}

function handleQueryDatabase(tcbBin, params) {
  const engine = params.engine;
  if (!["postgresql", "mysql", "nosql"].includes(engine)) {
    fail("engine must be postgresql, mysql, or nosql");
  }

  if (engine === "nosql") {
    return runTcb(tcbBin, ["db", "model", "list", "--json", ...envArgs(params)]);
  }

  if (!params.sql || typeof params.sql !== "string") {
    fail("sql is required for postgresql and mysql");
  }

  const args = ["db", "execute", "--sql", params.sql, "--json", ...envArgs(params)];
  if (engine === "mysql" && params.readOnly === true) {
    args.push("--read-only");
  }
  return runTcb(tcbBin, args);
}

function handleListFunctions(tcbBin, params) {
  const args = ["fn", "list", "--json", ...envArgs(params)];
  if (params.limit != null) {
    args.push("--limit", String(params.limit));
  }
  if (params.offset != null) {
    args.push("--offset", String(params.offset));
  }
  return runTcb(tcbBin, args);
}

function handleListStorage(tcbBin, params) {
  const args = ["storage", "list", ...envArgs(params)];
  if (params.cloudPath) {
    args.push(String(params.cloudPath));
  }
  args.push("--json");
  return runTcb(tcbBin, args);
}

function handleListCloudrun(tcbBin, params) {
  return runTcb(tcbBin, ["cloudrun", "list", "--json", ...envArgs(params)]);
}

const HANDLERS = {
  query_database: handleQueryDatabase,
  list_functions: handleListFunctions,
  list_storage: handleListStorage,
  list_cloudrun: handleListCloudrun,
};

async function main() {
  const tool = process.argv[2];
  if (!TOOLS.has(tool)) {
    fail("unknown tool", { tool, supported: [...TOOLS] });
  }

  const params = await readStdinJson();
  const tcbBin = findTcb();
  if (!tcbBin) {
    fail("tcb CLI not found on PATH. Install with: npm i -g @cloudbase/cli", {
      hint: "Then run: tcb login",
    });
  }

  const result = HANDLERS[tool](tcbBin, params);
  const parsed = parseTcbOutput(result.stdout);
  const payload = {
    tool,
    command: "tcb",
    status: result.status,
    result: parsed.json ?? parsed.text,
  };
  if (result.stderr) {
    payload.stderr = result.stderr.trim();
  }
  if (result.error) {
    payload.spawnError = result.error;
  }

  if (result.status !== 0) {
    fail("tcb command failed", payload);
  }
  succeed(payload);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
