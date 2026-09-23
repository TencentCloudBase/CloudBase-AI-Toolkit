#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const VERSION_LINE_RE = /^version:\s*.+$/m;
const VERSION_VALUE_RE = /^version:\s*(.+?)\s*$/m;
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/;
const SKILL_FILE_RE = /^skill\.md$/i;

/**
 * Skills ship with the published MCP package, so `mcp/package.json` is the
 * authoritative version. The monorepo root `package.json` keeps its own version
 * line and is only used as a fallback.
 */
function resolveVersion(rootDir, version) {
  if (version) {
    return version;
  }

  for (const relativePath of [path.join("mcp", "package.json"), "package.json"]) {
    const packageFile = path.join(rootDir, relativePath);
    if (!fs.existsSync(packageFile)) continue;
    const parsed = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    if (parsed.version) {
      return parsed.version;
    }
  }

  throw new Error("Unable to determine release version for skill sync");
}

/**
 * Recursively collect skill entrypoints.
 * Matches `SKILL.md` / `skill.md` case-insensitively so nested skills such as
 * `cloudbase-agent/{py,ts}/skill.md` are not silently skipped.
 */
function walkSkillFiles(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSkillFiles(fullPath, out);
      continue;
    }
    if (SKILL_FILE_RE.test(entry.name) && fs.existsSync(fullPath)) {
      out.push(fullPath);
    }
  }
}

export function collectSkillFiles(rootDir = ROOT_DIR) {
  const files = [];
  const skillsDir = path.join(rootDir, "config", "source", "skills");
  const guidelineFile = path.join(
    rootDir,
    "config",
    "source",
    "guideline",
    "cloudbase",
    "SKILL.md",
  );

  if (fs.existsSync(skillsDir)) {
    walkSkillFiles(skillsDir, files);
  }

  if (fs.existsSync(guidelineFile)) {
    files.push(guidelineFile);
  }

  return files;
}

function readVersion(raw) {
  const match = raw.match(VERSION_VALUE_RE);
  return match ? match[1] : null;
}

export function updateVersionInSkill(raw, version) {
  const nextLine = `version: ${version}`;
  if (VERSION_LINE_RE.test(raw)) {
    return raw.replace(VERSION_LINE_RE, nextLine);
  }

  const frontmatterMatch = raw.match(FRONTMATTER_RE);
  if (!frontmatterMatch) {
    throw new Error("SKILL.md is missing YAML frontmatter");
  }

  const lineEnding = raw.includes("\r\n") ? "\r\n" : "\n";
  const frontmatter = frontmatterMatch[0];
  const frontmatterBody = frontmatter.replace(/\r?\n---(?=\r?\n|$)$/, "");

  return `${frontmatterBody}${lineEnding}${nextLine}${frontmatter.slice(frontmatterBody.length)}${raw.slice(frontmatter.length)}`;
}

export function syncSkillVersions({ rootDir = ROOT_DIR, version } = {}) {
  const resolvedVersion = resolveVersion(rootDir, version);
  const updatedFiles = [];

  for (const file of collectSkillFiles(rootDir)) {
    const before = fs.readFileSync(file, "utf8");
    const after = updateVersionInSkill(before, resolvedVersion);
    if (after !== before) {
      fs.writeFileSync(file, after);
      updatedFiles.push(file);
    }
  }

  return { version: resolvedVersion, updatedFiles };
}

export function checkSkillVersions({ rootDir = ROOT_DIR, version } = {}) {
  const resolvedVersion = resolveVersion(rootDir, version);
  const stale = [];

  for (const file of collectSkillFiles(rootDir)) {
    const current = readVersion(fs.readFileSync(file, "utf8"));
    if (current !== resolvedVersion) {
      stale.push({ file, current });
    }
  }

  return { version: resolvedVersion, stale };
}

export function isDirectCliInvocation({
  argv = process.argv,
  moduleUrl = import.meta.url,
} = {}) {
  if (!argv[1] || !moduleUrl.startsWith("file:")) {
    return false;
  }

  return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(argv[1]);
}

/**
 * 刷新 compat baseline。
 *
 * bump 改的是每个入口的 `version:` 行，而这些入口都会进派生产物 ⇒ 所有文本面哈希都会变。
 * 也就是说 `update-compat-baseline` 是 bump 的自然后续步骤，而不是另一件要记住的事：
 * 漏掉它 baseline 会静默过期（文本面哈希只 report），报告里堆噪声，真正的兼容面变化被淹没。
 * 所以 bump 与刷新绑在一个动作里；没有版本变化时不写 baseline，避免无谓的生成物改动。
 */
export async function refreshCompatBaseline() {
  const { updateCompatBaseline } = await import("./update-compat-baseline.mjs");
  return updateCompatBaseline();
}

export async function syncSkillVersionsAndBaseline({
  rootDir = ROOT_DIR,
  version,
  refreshBaseline = refreshCompatBaseline,
} = {}) {
  const result = syncSkillVersions({ rootDir, version });

  if (result.updatedFiles.length === 0) {
    return { ...result, baseline: null };
  }

  return { ...result, baseline: await refreshBaseline() };
}

if (isDirectCliInvocation()) {
  const args = process.argv.slice(2);
  const argVersionIndex = args.indexOf("--version");
  const cliVersion =
    argVersionIndex >= 0 && args[argVersionIndex + 1]
      ? args[argVersionIndex + 1]
      : undefined;

  if (args.includes("--check")) {
    const { version, stale } = checkSkillVersions({ version: cliVersion });
    if (stale.length === 0) {
      console.log(`All skill versions match ${version}.`);
      process.exit(0);
    }

    console.error(`Skill version drift detected (expected ${version}):`);
    for (const { file, current } of stale) {
      console.error(
        `  ${path.relative(ROOT_DIR, file)} — ${current ?? "missing version field"}`,
      );
    }
    console.error(
      `\nFix with: node scripts/sync-skill-versions.mjs --version ${version}`,
    );
    process.exit(1);
  }

  const result = await syncSkillVersionsAndBaseline({ version: cliVersion });
  console.log(
    `Synced skill versions to ${result.version} across ${result.updatedFiles.length} files.`,
  );
  for (const file of result.updatedFiles) {
    console.log(`  ${path.relative(ROOT_DIR, file)}`);
  }

  if (result.baseline) {
    console.log(
      `Refreshed compat baseline: ${path.relative(ROOT_DIR, result.baseline.baselineFile)} (${result.baseline.totalFiles} files tracked).`,
    );
  } else {
    console.log("Skill versions already in sync; compat baseline left untouched.");
  }
}
