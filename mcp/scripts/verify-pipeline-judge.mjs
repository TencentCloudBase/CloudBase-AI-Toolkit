#!/usr/bin/env node
/**
 * Mutation check for the tool pipeline judges.
 *
 * A gate that never goes red is decoration. Each mutant removes one property
 * the registration pipeline must keep; the matching judge must fail, and every
 * judge must be green again after the sources are restored.
 *
 * Run this in an isolated worktree: it temporarily rewrites two source files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const MCP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(MCP_DIR, "..");
const SERVER = path.join(MCP_DIR, "src/server.ts");
const WRAPPER = path.join(MCP_DIR, "src/utils/tool-wrapper.ts");
const AST_CHECK = path.join(MCP_DIR, "scripts/check-tool-pipeline-invariants.mjs");
const VITEST = path.join(ROOT, "node_modules/.bin/vitest");
const CONTRACT_TEST = "src/utils/tool-pipeline-contract.test.ts";

const original = {
  [SERVER]: fs.readFileSync(SERVER, "utf8"),
  [WRAPPER]: fs.readFileSync(WRAPPER, "utf8"),
};

function restore() {
  for (const [file, content] of Object.entries(original)) fs.writeFileSync(file, content);
}

function replace(file, from, to, label) {
  const text = original[file];
  const occurrences = text.split(from).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected 1 anchor, found ${occurrences}`);
  }
  fs.writeFileSync(file, text.replace(from, to));
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: MCP_DIR,
    encoding: "utf8",
    env: { ...process.env, CLOUDBASE_MCP_TELEMETRY_DISABLED: "true" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const summary = output
    .split("\n")
    .filter((line) => /invariants|FAILED|Test Files|Tests |FAIL|SEQUENCE_PROBE/.test(line))
    .slice(-4)
    .join(" | ")
    .trim();
  return { code: result.status, summary };
}

const ast = () => run(process.execPath, [AST_CHECK]);
const contract = () => run(VITEST, ["run", CONTRACT_TEST]);

const MUTANTS = [
  {
    id: "M1 pipeline install inside the telemetry branch",
    judge: "ast",
    apply: () =>
      replace(
        SERVER,
        "  wrapServerWithTelemetry(server, { telemetryEnabled: enableTelemetry });",
        "  if (enableTelemetry) {\n    wrapServerWithTelemetry(server, { telemetryEnabled: enableTelemetry });\n  }",
        "M1",
      ),
  },
  {
    id: "M2 registration gate removed from the install",
    judge: "ast",
    apply: () => {
      const text = original[WRAPPER];
      const pattern = /        if \(!shouldRegisterTool\(toolName\)\) \{[\s\S]*?\n        \}\n/;
      if (!pattern.test(text)) throw new Error("M2: gate block anchor not found");
      fs.writeFileSync(WRAPPER, text.replace(pattern, ""));
    },
  },
  {
    id: "M3 gate predicate controlled by the telemetry switch",
    judge: "ast",
    apply: () =>
      replace(
        WRAPPER,
        "if (!shouldRegisterTool(toolName)) {",
        "if (telemetryEnabled && !shouldRegisterTool(toolName)) {",
        "M3",
      ),
  },
  {
    id: "M4 cloud mode written to process state unconditionally",
    judge: "contract",
    apply: () =>
      replace(
        SERVER,
        "  if (cloudMode) {\n    enableCloudMode();\n  }",
        "  enableCloudMode();",
        "M4",
      ),
  },
];

const results = [];
const record = (id, expected, judge, result) =>
  results.push({ id, judge, expected, exit: result.code, summary: result.summary });

try {
  record("baseline ast", "green", "ast", ast());
  record("baseline contract", "green", "contract", contract());

  for (const mutant of MUTANTS) {
    restore();
    mutant.apply();
    const result = mutant.judge === "ast" ? ast() : contract();
    record(mutant.id, "red", mutant.judge, result);
  }
} catch (error) {
  record("harness error", "green", "harness", { code: -1, summary: String(error) });
} finally {
  restore();
}

const restoredClean = Object.entries(original).every(
  ([file, content]) => fs.readFileSync(file, "utf8") === content,
);
record("restored ast", "green", "ast", ast());
record("restored contract", "green", "contract", contract());

const verdict = results.map((row) => ({
  ...row,
  ok: row.expected === "green" ? row.exit === 0 : typeof row.exit === "number" && row.exit > 0,
}));

console.log("JUDGE_JSON:" + JSON.stringify({ restoredClean, verdict }, null, 2));

const passed = restoredClean && verdict.every((row) => row.ok);
process.exit(passed ? 0 : 1);
