import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const KIMI_PLUGIN_DIR = path.join(ROOT_DIR, "config", "kimi-plugin");
const SHARED_PLUGIN_DIR = path.join(ROOT_DIR, "plugin", "cloudbase");
const ADAPTER_HOOK = path.join(
  KIMI_PLUGIN_DIR,
  "hooks",
  "kimi-hook-adapter.mjs",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listSubDirs(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function flattenHookDeclarations(hooksJson) {
  const hooks = [];
  for (const [event, entries] of Object.entries(hooksJson.hooks || {})) {
    for (const entry of entries) {
      for (const hook of entry.hooks || []) {
        if (hook.type !== "command") continue;
        hooks.push({
          event,
          matcher: entry.matcher || ".*",
          command: hook.command,
        });
      }
    }
  }
  return hooks;
}

describe("Kimi CloudBase plugin packaging", () => {
  test("manifest keeps Kimi shape and reuses shared hook declarations", () => {
    const manifest = readJson(path.join(KIMI_PLUGIN_DIR, "kimi.plugin.json"));
    const sharedHooks = readJson(
      path.join(SHARED_PLUGIN_DIR, "hooks", "hooks.json"),
    );

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
    expect(manifest.mcpServers.cloudbase.command).toBe("npx");
    expect(manifest.mcpServers.cloudbase.args).toEqual([
      "-y",
      "@cloudbase/cloudbase-mcp@latest",
    ]);

    const flattened = flattenHookDeclarations(sharedHooks);
    expect(manifest.hooks.length).toBe(flattened.length);
    expect(manifest.hooks.every((hook) => hook.timeout > 0)).toBe(true);
    expect(
      manifest.hooks.every((hook) =>
        hook.command.startsWith("node ./hooks/kimi-hook-adapter.mjs --script "),
      ),
    ).toBe(true);
    const manifestEvents = new Set(manifest.hooks.map((hook) => hook.event));
    expect(Array.from(manifestEvents).sort()).toEqual([
      "PreToolUse",
      "SessionEnd",
      "SessionStart",
      "UserPromptSubmit",
    ]);
  });

  test("skills/hooks/commands/agents/assets are shared-content copies", () => {
    const kimiSkillDirs = listSubDirs(path.join(KIMI_PLUGIN_DIR, "skills"));
    const sharedSkillDirs = listSubDirs(path.join(SHARED_PLUGIN_DIR, "skills"));
    expect(kimiSkillDirs).toEqual(sharedSkillDirs);
    expect(kimiSkillDirs.length).toBeGreaterThan(20);

    for (const required of ["hooks", "commands", "agents", "assets"]) {
      expect(fs.existsSync(path.join(KIMI_PLUGIN_DIR, required))).toBe(true);
    }
    expect(fs.existsSync(path.join(KIMI_PLUGIN_DIR, "mcp.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(KIMI_PLUGIN_DIR, "hooks", "patterns.mjs")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(KIMI_PLUGIN_DIR, "commands", "cloudbase-init.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(KIMI_PLUGIN_DIR, "agents", "cloudbase-architect.md"),
      ),
    ).toBe(true);
  });

  test("adapter hook extracts additionalContext from shared hook runtime", () => {
    const result = spawnSync(
      process.execPath,
      [
        ADAPTER_HOOK,
        "--script",
        "./hooks/inject-session-context.mjs",
      ],
      {
        cwd: KIMI_PLUGIN_DIR,
        encoding: "utf8",
        input: JSON.stringify({ hook_event_name: "SessionStart" }),
        env: {
          ...process.env,
          CLOUDBASE_PLUGIN_GREENFIELD: "true",
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("CloudBase Plugin");
  });

  test("legacy handcrafted kimi-only hooks are removed", () => {
    expect(
      fs.existsSync(path.join(KIMI_PLUGIN_DIR, "hooks", "block-dangerous-bash.mjs")),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(KIMI_PLUGIN_DIR, "hooks", "inject-cloudbase-context.mjs"),
      ),
    ).toBe(false);
  });
});
