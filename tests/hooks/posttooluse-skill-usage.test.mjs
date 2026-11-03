// tests/hooks/posttooluse-skill-usage.test.mjs — actual skill-load recording
// Covers: a call is attributed to a prior injection, an unprompted call is recorded as such,
// unrelated tools and non-skill knowledge-base lookups stay out of the log, and the hook
// never emits context (it is observation only).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const plugins = ["cloudbase", "cloudbase-codex"];
const tempDirs = [];

afterAll(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function makeLogPath() {
  const dir = mkdtempSync(join(tmpdir(), "skill-usage-"));
  tempDirs.push(dir);
  return join(dir, "audit.jsonl");
}

let sessionCounter = 0;
function nextSession() {
  sessionCounter += 1;
  return `usage-test-${process.pid}-${sessionCounter}`;
}

function runHook(plugin, script, payload, logPath) {
  return execFileSync(process.execPath, [join(root, "plugin", plugin, "hooks", script)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      CLOUDBASE_PLUGIN_AUDIT_LOG_FILE: logPath,
      CLOUDBASE_PLUGIN_SEEN_SKILLS: "",
      CLOUDBASE_PLUGIN_LIKELY_SKILLS: "",
    },
  });
}

function skillCall(plugin, sessionId, skill, logPath) {
  return runHook(
    plugin,
    "posttooluse-skill-usage.mjs",
    {
      hook_event_name: "PostToolUse",
      session_id: sessionId,
      cwd: root,
      tool_name: "Skill",
      tool_input: { skill },
    },
    logPath,
  );
}

function readEvents(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

describe.each(plugins)("posttooluse-skill-usage (%s)", (plugin) => {
  it("records a skill call that an injection preceded", () => {
    const logPath = makeLogPath();
    const sessionId = nextSession();

    runHook(
      plugin,
      "user-prompt-submit-skill-inject.mjs",
      { hook_event_name: "UserPromptSubmit", session_id: sessionId, cwd: root, prompt: "帮我看看 db.collection('todos').get() 为什么返回空" },
      logPath,
    );
    skillCall(plugin, sessionId, "cloudbase-document-database-web-sdk", logPath);

    const usage = readEvents(logPath).filter((event) => event.event === "skill-usage");
    expect(usage).toHaveLength(1);
    expect(usage[0].skill).toBe("cloudbase-document-database-web-sdk");
    expect(usage[0].injected).toBe(true);
    expect(usage[0].injectedAs).toBe("cloudbase-document-database-web-sdk");
  });

  it("records a call that no injection preceded", () => {
    const logPath = makeLogPath();
    skillCall(plugin, nextSession(), "cloudbase-cli", logPath);

    const usage = readEvents(logPath).filter((event) => event.event === "skill-usage");
    expect(usage).toHaveLength(1);
    expect(usage[0].injected).toBe(false);
  });

  it("attributes a legacy short name to the injected skill", () => {
    const logPath = makeLogPath();
    const sessionId = nextSession();

    runHook(
      plugin,
      "user-prompt-submit-skill-inject.mjs",
      { hook_event_name: "UserPromptSubmit", session_id: sessionId, cwd: root, prompt: "用 CloudBase 的 pgsql 连接串" },
      logPath,
    );
    skillCall(plugin, sessionId, "postgresql-development", logPath);

    const usage = readEvents(logPath).filter((event) => event.event === "skill-usage");
    expect(usage[0].injected).toBe(true);
    expect(usage[0].injectedAs).toBe("postgresql-development-cloudbase");
  });

  it("ignores tools that are not skill loads", () => {
    const logPath = makeLogPath();
    runHook(
      plugin,
      "posttooluse-skill-usage.mjs",
      { hook_event_name: "PostToolUse", session_id: nextSession(), cwd: root, tool_name: "Read", tool_input: { file_path: "/tmp/a.js" } },
      logPath,
    );
    expect(readEvents(logPath)).toEqual([]);
  });

  it("ignores knowledge base lookups that do not load a skill", () => {
    const logPath = makeLogPath();
    runHook(
      plugin,
      "posttooluse-skill-usage.mjs",
      {
        hook_event_name: "PostToolUse",
        session_id: nextSession(),
        cwd: root,
        tool_name: "mcp__cloudbase__searchKnowledgeBase",
        tool_input: { mode: "docs", query: "云函数部署" },
      },
      logPath,
    );
    expect(readEvents(logPath)).toEqual([]);
  });

  it("counts a skill load that goes through the knowledge base fallback", () => {
    const logPath = makeLogPath();
    const sessionId = nextSession();

    runHook(
      plugin,
      "user-prompt-submit-skill-inject.mjs",
      { hook_event_name: "UserPromptSubmit", session_id: sessionId, cwd: root, prompt: "云函数部署失败，报 scf_bootstrap 找不到" },
      logPath,
    );
    runHook(
      plugin,
      "posttooluse-skill-usage.mjs",
      {
        hook_event_name: "PostToolUse",
        session_id: sessionId,
        cwd: root,
        tool_name: "mcp__cloudbase__searchKnowledgeBase",
        tool_input: { mode: "skill", skillName: "cloud-functions" },
      },
      logPath,
    );

    const usage = readEvents(logPath).filter((event) => event.event === "skill-usage");
    expect(usage).toHaveLength(1);
    expect(usage[0].injected).toBe(true);
  });

  it("never emits context", () => {
    const logPath = makeLogPath();
    const output = JSON.parse(skillCall(plugin, nextSession(), "cloudbase-cli", logPath));
    const context = output.hookSpecificOutput?.additionalContext ?? output.additional_context;
    expect(context).toBeUndefined();
  });
});

describe("hook registration", () => {
  it.each(plugins)("registers the usage recorder for the %s plugin", (plugin) => {
    const hooks = JSON.parse(
      readFileSync(join(root, "plugin", plugin, "hooks", "hooks.json"), "utf-8"),
    );
    const commands = (hooks.hooks.PostToolUse || []).flatMap((entry) =>
      (entry.hooks || []).map((hook) => hook.command || ""),
    );
    expect(commands.join("\n")).toContain("posttooluse-skill-usage.mjs");
  });
});

describe("analyze:skill-usage summary", () => {
  it("separates hits, misses and unprompted calls by channel", () => {
    const dir = mkdtempSync(join(tmpdir(), "usage-report-"));
    tempDirs.push(dir);
    const logPath = join(dir, "audit.jsonl");
    const events = [
      { event: "user-prompt-submit", sessionId: "s1", channel: "UserPromptSubmit", injectedSkills: ["skill-a"] },
      { event: "skill-usage", sessionId: "s1", tool: "Skill", skill: "skill-a", injected: true, injectedAs: "skill-a" },
      { event: "pretooluse-skill-inject", sessionId: "s2", channel: "PreToolUse", injectedSkills: ["skill-b"] },
      { event: "skill-usage", sessionId: "s3", tool: "Skill", skill: "skill-c", injected: false },
    ];
    writeFileSync(logPath, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf-8");

    const output = execFileSync(process.execPath, [join(root, "scripts", "analyze-skill-usage.mjs"), "--file", logPath, "--json"], {
      encoding: "utf8",
      timeout: 10000,
    });
    const summary = JSON.parse(output);

    expect(summary.injections).toBe(2);
    expect(summary.hits).toBe(1);
    expect(summary.misses).toBe(1);
    expect(summary.unpromptedCalls).toBe(1);
    expect(summary.sessions).toBe(3);

    const byChannel = Object.fromEntries(summary.perChannel.map((row) => [row.channel, row]));
    expect(byChannel.UserPromptSubmit).toMatchObject({ injected: 1, hit: 1 });
    expect(byChannel.PreToolUse).toMatchObject({ injected: 1, hit: 0 });
  });
});
