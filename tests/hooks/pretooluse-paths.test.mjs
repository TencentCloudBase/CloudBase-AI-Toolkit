// tests/hooks/pretooluse-paths.test.mjs — PreToolUse file-path / bash-command injection
// Covers: CloudBase-only file markers and CLIs match deterministically, unrelated
// repositories stay untouched, and the same skill is not re-injected in a session.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const plugins = ["cloudbase", "cloudbase-codex"];

function inspect(plugin, { sessionId, toolName, toolInput }) {
  const output = execFileSync(process.execPath, [
    join(root, "plugin", plugin, "hooks", "pretooluse-skill-inject.mjs"),
  ], {
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      session_id: sessionId,
      cwd: root,
      tool_name: toolName,
      tool_input: toolInput,
    }),
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      CLOUDBASE_PLUGIN_AUDIT_LOG_FILE: "off",
      CLOUDBASE_PLUGIN_SEEN_SKILLS: "",
    },
  });
  const result = JSON.parse(output);
  const context = result.hookSpecificOutput?.additionalContext || result.additional_context || "";
  const meta = context.match(/<!-- skillInjection: (.*?) -->/);
  return meta ? JSON.parse(meta[1]).injectedSkills : [];
}

let sessionCounter = 0;
function nextSession() {
  sessionCounter += 1;
  return `pretooluse-path-${process.pid}-${sessionCounter}`;
}

describe.each(plugins)("PreToolUse path and command matching (%s)", (plugin) => {
  it.each([
    ["cloud-function source", "Edit", { file_path: "/repo/cloudfunctions/api/index.js" }, "cloud-functions"],
    ["declarative config", "Write", { file_path: "/repo/cloudbaserc.json" }, "cloudbase-declarative-deploy"],
    ["mini program page", "Edit", { file_path: "/repo/miniprogram/pages/index/index.js" }, "miniprogram-development"],
    ["mini program project config", "Edit", { file_path: "project.config.json" }, "miniprogram-development"],
  ])("injects for %s", (_label, toolName, toolInput, expected) => {
    expect(inspect(plugin, { sessionId: nextSession(), toolName, toolInput })).toContain(expected);
  });

  it.each([
    ["react component", "Edit", { file_path: "/repo/src/App.tsx" }],
    ["plain source file", "Edit", { file_path: "/repo/src/utils.js" }],
    ["generic config", "Write", { file_path: "/repo/tsconfig.json" }],
    ["unrelated command", "Bash", { command: "npm test" }],
    ["unrelated docker build", "Bash", { command: "docker build -t app ." }],
  ])("stays silent for %s", (_label, toolName, toolInput) => {
    expect(inspect(plugin, { sessionId: nextSession(), toolName, toolInput })).toEqual([]);
  });

  it("matches CloudBase CLI commands", () => {
    const injected = inspect(plugin, {
      sessionId: nextSession(),
      toolName: "Bash",
      toolInput: { command: "tcb fn deploy api -e prod" },
    });
    expect(injected).toContain("cloud-functions");
  });

  it("injects a skill at most once per session", () => {
    const sessionId = nextSession();
    const toolInput = { file_path: "/repo/cloudfunctions/api/index.js" };
    expect(inspect(plugin, { sessionId, toolName: "Edit", toolInput })).toContain("cloud-functions");
    expect(inspect(plugin, { sessionId, toolName: "Edit", toolInput })).toEqual([]);
  });
});
