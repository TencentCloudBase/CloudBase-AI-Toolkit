import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.join(__dirname, "..", "config", "kimi-plugin");
const CLAUDE_SKILLS = path.join(
  __dirname,
  "..",
  "plugin",
  "cloudbase",
  "skills",
);
const BLOCK_HOOK = path.join(PLUGIN_DIR, "hooks", "block-dangerous-bash.mjs");
const INJECT_HOOK = path.join(
  PLUGIN_DIR,
  "hooks",
  "inject-cloudbase-context.mjs",
);

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, fileName), "utf8"));
}

function runHook(script, payload) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    input: JSON.stringify(payload),
  });
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
    expect(manifest.sessionStart.skill).toBe("cloudbase");
    expect(manifest.interface.displayName).toBe("Tencent CloudBase");
    expect(manifest.interface.iconUrl).toMatch(/^https:\/\//);
    expect(manifest.interface.iconUrl).toContain(
      "plugin/cloudbase/assets/logo.png",
    );
    expect(manifest.interface.shortDescription.toLowerCase()).toMatch(/auth/);
    expect(manifest.interface.shortDescription.toLowerCase()).toMatch(
      /hosting/,
    );
    expect(manifest.interface.longDescription).toMatch(/tcb login/);
    expect(manifest.interface.longDescription).toMatch(/登录云开发/);
    expect(manifest.mcpServers.cloudbase.command).toBe("npx");
    expect(manifest.mcpServers.cloudbase.args).toEqual([
      "-y",
      "@cloudbase/cloudbase-mcp@latest",
    ]);
    expect(manifest.tools).toBeUndefined();
    expect(manifest.inject).toBeUndefined();
    expect(Array.isArray(manifest.hooks)).toBe(true);
    expect(manifest.hooks.map((hook) => hook.event).sort()).toEqual([
      "PreToolUse",
      "UserPromptSubmit",
    ]);
    for (const hook of manifest.hooks) {
      expect(hook.command).toMatch(/^node \.\//);
      expect(hook.timeout).toBeGreaterThan(0);
      const rel = hook.command.replace(/^node \.\//, "");
      expect(fs.existsSync(path.join(PLUGIN_DIR, rel))).toBe(true);
    }
    expect(
      fs.existsSync(path.join(PLUGIN_DIR, "skills", "cloudbase", "SKILL.md")),
    ).toBe(true);
  });

  test("compat plugin.json and run-tool.mjs are not shipped", () => {
    expect(fs.existsSync(path.join(PLUGIN_DIR, "plugin.json"))).toBe(false);
    expect(
      fs.existsSync(path.join(PLUGIN_DIR, "scripts", "run-tool.mjs")),
    ).toBe(false);
  });

  test("skills stay a host-specific routing skill, not a third catalog copy", () => {
    const kimiSkillDirs = fs
      .readdirSync(path.join(PLUGIN_DIR, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(kimiSkillDirs).toEqual(["cloudbase"]);

    const kimiSkill = path.join(PLUGIN_DIR, "skills", "cloudbase");
    const claudeSkill = path.join(CLAUDE_SKILLS, "cloudbase");
    expect(fs.lstatSync(kimiSkill).isSymbolicLink()).toBe(false);
    expect(path.resolve(kimiSkill)).not.toBe(path.resolve(claudeSkill));

    const kimiBody = fs.readFileSync(
      path.join(kimiSkill, "SKILL.md"),
      "utf8",
    );
    expect(kimiBody).toMatch(/searchKnowledgeBase/);
    expect(kimiBody).not.toMatch(/plugin\.json/);
  });

  test("block-dangerous-bash.mjs denies rm -rf and allows safe commands", () => {
    const denied = runHook(BLOCK_HOOK, {
      hook_event_name: "PreToolUse",
      tool_input: { command: "rm -rf /tmp/app" },
    });
    expect(denied.status).toBe(2);
    expect(denied.stderr).toMatch(/rm -rf/);

    const envDestroy = runHook(BLOCK_HOOK, {
      hook_event_name: "PreToolUse",
      tool_input: { command: "tcb env:destroy prod-env --force" },
    });
    expect(envDestroy.status).toBe(2);

    const allowed = runHook(BLOCK_HOOK, {
      hook_event_name: "PreToolUse",
      tool_input: { command: "tcb fn list --json" },
    });
    expect(allowed.status).toBe(0);
  });

  test("inject-cloudbase-context.mjs appends routing text for CloudBase prompts", () => {
    const hit = runHook(INJECT_HOOK, {
      hook_event_name: "UserPromptSubmit",
      prompt: "登录云开发，列出当前环境的云函数",
    });
    expect(hit.status).toBe(0);
    expect(hit.stdout).toMatch(/envQuery/);
    expect(hit.stdout).toMatch(/searchKnowledgeBase/);

    const miss = runHook(INJECT_HOOK, {
      hook_event_name: "UserPromptSubmit",
      prompt: "rewrite this README in English",
    });
    expect(miss.status).toBe(0);
    expect(miss.stdout).toBe("");
  });
});
