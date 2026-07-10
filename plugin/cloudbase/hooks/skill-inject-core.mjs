// hooks/skill-inject-core.mjs — Skill loading, index building, and injection core
// Loads skills from generated/skill-manifest.json (preferred) or scans SKILL.md at runtime.
// Adapted from Vercel plugin.
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { pluginRoot, safeReadJson, safeReadFile } from "./hook-env.mjs";
import { compilePromptSignals, compileSkillPatterns } from "./prompt-patterns.mjs";
import { buildLexicalIndex } from "./lexical-index.mjs";
import { createLogger, logCaughtError } from "./logger.mjs";

var log = createLogger();

var skillMap = null;
var compiledSkills = null;
var lexicalIndex = null;
var usedManifest = false;

// --- YAML frontmatter parser (lightweight, no dependency) ---

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  return {
    frontmatter: parseYaml(match[1]),
    body: match[2],
  };
}

function parseYaml(text) {
  // Lightweight YAML parser supporting nested objects + arrays
  const result = {};
  const lines = text.split("\n");
  const stack = [{ indent: -1, obj: result }];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Pop stack to current indent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1].obj;

    // Array item (starts with -)
    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim();
      const key = stack[stack.length - 1].currentKey;
      if (key) {
        if (!current[key]) current[key] = [];
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(parseScalar(value));
      }
      continue;
    }

    // Key: value or Key:
    const colonMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (colonMatch) {
      const key = colonMatch[1].trim();
      const value = colonMatch[2].trim();

      if (value === "") {
        // Nested object or array
        current[key] = {};
        stack.push({ indent, obj: current[key], currentKey: key });
      } else {
        current[key] = parseScalar(value);
      }
    }
  }

  return result;
}

function parseScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  // Quoted string
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  // Number
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  // Array inline [a, b, c]
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean).map(parseScalar);
  }
  return value;
}

// --- Load skills ---

export function loadSkills() {
  if (skillMap) return { skillMap, compiledSkills, lexicalIndex, usedManifest };

  const root = pluginRoot();
  const manifestPath = join(root, "generated", "skill-manifest.json");

  // Prefer pre-compiled manifest
  const manifest = safeReadJson(manifestPath);
  if (manifest && manifest.skills) {
    skillMap = manifest.skills;
    usedManifest = true;
    log.debug("skill-inject-core:loaded-manifest", {
      manifestPath,
      skillCount: Object.keys(skillMap).length,
    });
  } else {
    // Fallback: scan skills/*/SKILL.md at runtime
    const skillsDir = join(root, "skills");
    skillMap = buildSkillMapFromDir(skillsDir);
    usedManifest = false;
    log.debug("skill-inject-core:scanned-skills", {
      skillsDir,
      skillCount: Object.keys(skillMap).length,
    });
  }

  // Compile prompt signals
  compiledSkills = {};
  for (const [skillName, skill] of Object.entries(skillMap)) {
    compiledSkills[skillName] = compilePromptSignals(skill.promptSignals);
  }

  // Build lexical index
  lexicalIndex = buildLexicalIndex(skillMap);

  return { skillMap, compiledSkills, lexicalIndex, usedManifest };
}

function buildSkillMapFromDir(skillsDir) {
  const map = {};
  let entries;
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch (error) {
    logCaughtError(log, "skill-inject-core:scan-dir-failed", error, { skillsDir });
    return map;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    const content = safeReadFile(skillPath);
    if (!content) continue;

    const { frontmatter } = parseFrontmatter(content);
    map[entry.name] = {
      name: frontmatter.name || entry.name,
      description: frontmatter.description || "",
      version: frontmatter.version,
      metadata: frontmatter.metadata || { priority: 5 },
      promptSignals: frontmatter.promptSignals || { phrases: [], minScore: 6 },
      retrieval: frontmatter.retrieval || { aliases: [], intents: [], entities: [], examples: [] },
    };
  }

  return map;
}

// --- Inject skills into additionalContext ---

export function buildSkillInjectionOutput(injectedSkills, skillMap, hookEvent = "UserPromptSubmit") {
  if (injectedSkills.length === 0) {
    return {
      additionalContext: null,
      meta: {
        version: 1,
        hookEvent,
        matchedSkills: [],
        injectedSkills: [],
        contextChunks: [],
        summaryOnly: [],
        droppedByBudget: [],
      },
    };
  }

  const lines = [`[cloudbase-plugin] Best practices auto-suggested based on prompt analysis:`];
  for (const skillName of injectedSkills) {
    const skill = skillMap[skillName];
    if (!skill) continue;
    lines.push(`  - "${skillName}" matched`);
  }

  // Docs block
  const docsLines = [];
  for (const skillName of injectedSkills) {
    const skill = skillMap[skillName];
    if (!skill?.metadata?.docs) continue;
    const docs = Array.isArray(skill.metadata.docs) ? skill.metadata.docs : [skill.metadata.docs];
    docsLines.push(`  - **${skillName}**: ${docs.join(" , ")}`);
  }
  if (docsLines.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("**MANDATORY: CloudBase skills change frequently — verify via searchKnowledgeBase.**");
    lines.push("Official docs:");
    lines.push(docsLines.join("\n"));
    lines.push("---");
  }

  // Skill call instructions
  lines.push("");
  for (const skillName of injectedSkills) {
    lines.push(`You must run the Skill(${skillName}) tool.`);
  }

  // Meta comment
  const meta = {
    version: 1,
    hookEvent,
    matchedSkills: injectedSkills,
    injectedSkills,
    contextChunks: [],
    summaryOnly: [],
    droppedByBudget: [],
  };
  lines.push("");
  lines.push(`<!-- skillInjection: ${JSON.stringify(meta)} -->`);

  return {
    additionalContext: lines.join("\n"),
    meta,
  };
}
