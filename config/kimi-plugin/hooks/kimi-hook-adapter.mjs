#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

function parseArgs(argv) {
  const args = { script: "" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--script") {
      args.script = argv[++i] || "";
    }
  }
  if (!args.script) {
    process.stderr.write("Missing --script argument\n");
    process.exit(2);
  }
  return args;
}

function extractAdditionalContext(rawStdout) {
  if (!rawStdout) return "";
  let parsed;
  try {
    parsed = JSON.parse(rawStdout);
  } catch {
    return rawStdout;
  }

  if (typeof parsed?.hookSpecificOutput?.additionalContext === "string") {
    return parsed.hookSpecificOutput.additionalContext;
  }
  if (typeof parsed?.additional_context === "string") {
    return parsed.additional_context;
  }
  return rawStdout;
}

const { script } = parseArgs(process.argv);
const scriptPath = path.resolve(process.cwd(), script);

let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  const child = spawnSync(process.execPath, [scriptPath], {
    input: stdin,
    encoding: "utf8",
    cwd: process.cwd(),
    env: process.env,
  });

  if (child.stderr) {
    process.stderr.write(child.stderr);
  }

  const output = extractAdditionalContext(child.stdout || "");
  if (output) {
    process.stdout.write(output);
  }

  process.exit(child.status ?? 1);
});
