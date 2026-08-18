#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const SOURCE_PLUGIN_DIR = path.join(ROOT_DIR, "plugin", "cloudbase");
const TARGET_PLUGIN_DIR = path.join(ROOT_DIR, "config", "kimi-plugin");

const COPY_DIRS = ["skills", "hooks", "commands", "agents", "assets"];
const COPY_FILES = ["mcp.json"];
const TIMEOUT_SECONDS = 5;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyDir(sourcePath, targetPath) {
  removePathIfExists(targetPath);
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function copyFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function normalizeHookCommand(command) {
  const normalized = String(command || "").trim();
  const fromEnv = normalized.match(
    /^node\s+"?\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([^"\s]+)"?$/,
  );
  if (fromEnv) return `./hooks/${fromEnv[1]}`;
  const fromRelative = normalized.match(/^node\s+"?\.\/hooks\/([^"\s]+)"?$/);
  if (fromRelative) return `./hooks/${fromRelative[1]}`;
  throw new Error(`Unsupported hook command format: ${normalized}`);
}

function flattenHookDeclarations(hooksJson) {
  const result = [];
  for (const [event, entries] of Object.entries(hooksJson.hooks || {})) {
    for (const entry of entries) {
      const matcher = entry.matcher || ".*";
      for (const hook of entry.hooks || []) {
        if (hook.type !== "command") continue;
        const scriptPath = normalizeHookCommand(hook.command);
        result.push({
          event,
          matcher,
          command: `node ./hooks/kimi-hook-adapter.mjs --script ${scriptPath}`,
          timeout: TIMEOUT_SECONDS,
        });
      }
    }
  }
  return result;
}

function createKimiManifest() {
  const claudeManifest = readJson(
    path.join(SOURCE_PLUGIN_DIR, ".claude-plugin", "plugin.json"),
  );
  const sourceMcp = readJson(path.join(SOURCE_PLUGIN_DIR, "mcp.json"));
  const sourceHooks = readJson(path.join(SOURCE_PLUGIN_DIR, "hooks", "hooks.json"));

  const firstServer = Object.values(sourceMcp.mcpServers || {})[0];
  if (!firstServer) {
    throw new Error("plugin/cloudbase/mcp.json has no mcpServers entries");
  }

  const keywords = Array.isArray(claudeManifest.keywords)
    ? [...claudeManifest.keywords]
    : [];
  for (const extra of ["kimi-code", "kimi-work"]) {
    if (!keywords.includes(extra)) keywords.push(extra);
  }

  return {
    $schema: "https://kimi.com/schemas/kimi.plugin.schema.json",
    name: claudeManifest.name,
    version: claudeManifest.version,
    description:
      "Tencent CloudBase for Kimi Code / Kimi Work — generated from plugin/cloudbase shared assets (skills/hooks/mcp/assets/commands/agents) with a Kimi-specific manifest adapter.",
    keywords,
    author: claudeManifest.author?.name || "Tencent CloudBase",
    homepage: claudeManifest.homepage,
    license: claudeManifest.license || "MIT",
    skills: "./skills/",
    sessionStart: { skill: "cloudbase" },
    skillInstructions:
      "Use CloudBase MCP tools first. Run envQuery(action=info) before CloudBase operations. When login/auth is involved, configure provider capabilities first, then platform-specific auth flows.",
    interface: {
      displayName: "Tencent CloudBase",
      shortDescription:
        "CloudBase MCP + shared skills/hooks for database, functions, auth, storage, CloudRun, and hosting",
      longDescription:
        "Kimi native plugin generated from the shared CloudBase plugin assets. It reuses the same skills, hooks, MCP config, commands, agents, and logo as Claude/Codex/Cursor packaging, while keeping only the manifest format as Kimi-specific adaptation.",
      developerName: claudeManifest.author?.name || "Tencent CloudBase",
      websiteURL: claudeManifest.author?.url || "https://cloudbase.net",
      category: "DEVELOPER_TOOLS",
      hostKind: "local",
      iconUrl:
        "https://raw.githubusercontent.com/TencentCloudBase/CloudBase-MCP/main/plugin/cloudbase/assets/logo.png",
    },
    mcpServers: {
      cloudbase: {
        command: firstServer.command,
        args: firstServer.args,
        env: {
          ...(firstServer.env || {}),
          INTEGRATION_IDE: "Kimi Code",
        },
      },
    },
    hooks: flattenHookDeclarations(sourceHooks),
  };
}

function createAdapterScript() {
  return `#!/usr/bin/env node
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
    process.stderr.write("Missing --script argument\\n");
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
`;
}

function createKimiReadme() {
  return `# CloudBase plugin for Kimi Code / Kimi Work

Native CloudBase plugin package for Kimi hosts.

## Source model

\`config/kimi-plugin/\` is generated from shared plugin assets:

- **Shared content layer:** \`plugin/cloudbase/\`
  - \`skills/\`, \`hooks/\`, \`mcp.json\`, \`commands/\`, \`agents/\`, \`assets/\`
- **Kimi adaptation layer:** generated \`kimi.plugin.json\` and \`hooks/kimi-hook-adapter.mjs\`

Do not hand-maintain copied content in this directory. Edit shared assets in
\`plugin/cloudbase/\` and regenerate.

## Build and check

\`\`\`bash
node scripts/build-kimi-plugin.mjs
node scripts/build-kimi-plugin.mjs --check
\`\`\`

## Install

\`\`\`text
/plugins install /absolute/path/to/CloudBase-MCP/config/kimi-plugin
\`\`\`

Then run \`/reload\` or start a new session.
`;
}

function syncKimiPlugin() {
  fs.mkdirSync(TARGET_PLUGIN_DIR, { recursive: true });

  for (const dirName of COPY_DIRS) {
    copyDir(
      path.join(SOURCE_PLUGIN_DIR, dirName),
      path.join(TARGET_PLUGIN_DIR, dirName),
    );
  }

  for (const fileName of COPY_FILES) {
    copyFile(
      path.join(SOURCE_PLUGIN_DIR, fileName),
      path.join(TARGET_PLUGIN_DIR, fileName),
    );
  }

  removePathIfExists(path.join(TARGET_PLUGIN_DIR, "hooks", "block-dangerous-bash.mjs"));
  removePathIfExists(path.join(TARGET_PLUGIN_DIR, "hooks", "inject-cloudbase-context.mjs"));

  const adapterPath = path.join(TARGET_PLUGIN_DIR, "hooks", "kimi-hook-adapter.mjs");
  fs.writeFileSync(adapterPath, createAdapterScript(), "utf-8");

  writeJson(path.join(TARGET_PLUGIN_DIR, "kimi.plugin.json"), createKimiManifest());
  fs.writeFileSync(path.join(TARGET_PLUGIN_DIR, "README.md"), createKimiReadme(), "utf-8");
}

function collectFiles(rootDir, relativePath = "") {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) return [];
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) return [relativePath];

  const result = [];
  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    const nextRelative = relativePath
      ? path.join(relativePath, entry.name)
      : entry.name;
    if (entry.isDirectory()) {
      result.push(...collectFiles(rootDir, nextRelative));
    } else if (entry.isFile()) {
      result.push(nextRelative);
    }
  }
  return result.sort();
}

function assertUpToDate() {
  const tempDir = fs.mkdtempSync(path.join(ROOT_DIR, ".tmp-kimi-plugin-"));
  try {
    const currentFiles = collectFiles(TARGET_PLUGIN_DIR);

    // Manual generation into tempDir.
    fs.mkdirSync(tempDir, { recursive: true });
    for (const dirName of COPY_DIRS) {
      copyDir(path.join(SOURCE_PLUGIN_DIR, dirName), path.join(tempDir, dirName));
    }
    for (const fileName of COPY_FILES) {
      copyFile(path.join(SOURCE_PLUGIN_DIR, fileName), path.join(tempDir, fileName));
    }
    removePathIfExists(path.join(tempDir, "hooks", "block-dangerous-bash.mjs"));
    removePathIfExists(path.join(tempDir, "hooks", "inject-cloudbase-context.mjs"));
    fs.writeFileSync(
      path.join(tempDir, "hooks", "kimi-hook-adapter.mjs"),
      createAdapterScript(),
      "utf-8",
    );
    writeJson(path.join(tempDir, "kimi.plugin.json"), createKimiManifest());
    fs.writeFileSync(path.join(tempDir, "README.md"), createKimiReadme(), "utf-8");

    const expectedFiles = collectFiles(tempDir);
    const currentSet = new Set(currentFiles);
    const expectedSet = new Set(expectedFiles);

    const missing = expectedFiles.filter((f) => !currentSet.has(f));
    const extra = currentFiles.filter((f) => !expectedSet.has(f));
    const changed = expectedFiles.filter((f) => {
      if (!currentSet.has(f)) return false;
      const a = fs.readFileSync(path.join(tempDir, f));
      const b = fs.readFileSync(path.join(TARGET_PLUGIN_DIR, f));
      return Buffer.compare(a, b) !== 0;
    });

    if (missing.length || extra.length || changed.length) {
      if (missing.length) {
        console.error("Missing files:");
        for (const file of missing) console.error(`  - ${file}`);
      }
      if (extra.length) {
        console.error("Extra files:");
        for (const file of extra) console.error(`  - ${file}`);
      }
      if (changed.length) {
        console.error("Changed files:");
        for (const file of changed) console.error(`  - ${file}`);
      }
      throw new Error(
        "config/kimi-plugin is outdated. Run: node scripts/build-kimi-plugin.mjs",
      );
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const checkOnly = process.argv.includes("--check");
  if (checkOnly) {
    assertUpToDate();
    console.log("Kimi plugin artifacts are up to date.");
    return;
  }

  syncKimiPlugin();
  console.log("Kimi plugin artifacts generated from plugin/cloudbase.");
}

main();
