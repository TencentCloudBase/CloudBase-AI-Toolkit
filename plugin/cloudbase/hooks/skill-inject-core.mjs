// hooks/skill-inject-core.mjs — Skill loading, index building, and injection core
// Loads skills from generated/skill-manifest.json (pre-compiled by build-skill-manifest.mjs).
// Manifest is the single source of truth — no runtime YAML parsing to avoid parser drift.
// Adapted from Vercel plugin.
import { join } from "path";
import { pluginRoot, safeReadJson } from "./hook-env.mjs";
import { compilePromptSignals } from "./prompt-patterns.mjs";
import { buildLexicalIndex } from "./lexical-index.mjs";
import { createLogger } from "./logger.mjs";

var log = createLogger();

var skillMap = null;
var compiledSkills = null;
var lexicalIndex = null;
var usedManifest = false;

// --- Load skills ---

export function loadSkills() {
  if (skillMap) return { skillMap, compiledSkills, lexicalIndex, usedManifest };

  const root = pluginRoot();
  const manifestPath = join(root, "generated", "skill-manifest.json");
  const manifest = safeReadJson(manifestPath);

  if (manifest && manifest.skills) {
    skillMap = manifest.skills;
    usedManifest = true;
    log.debug("skill-inject-core:loaded-manifest", {
      manifestPath,
      skillCount: Object.keys(skillMap).length,
    });
  } else {
    // No manifest — skill-inject is disabled (manifest must be pre-compiled via build:skill-manifest)
    skillMap = {};
    usedManifest = false;
    log.summary("skill-inject-core:no-manifest", {
      manifestPath,
      hint: "Run `npm run build:skill-manifest` to generate manifest",
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
    lines.push(`You must run the Skill(${skillName}) tool (or fetch via searchKnowledgeBase(mode=skill, skillName="${skillName}") if Skill tool is unavailable).`);
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
