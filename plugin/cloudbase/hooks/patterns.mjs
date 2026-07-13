// hooks/patterns.mjs — Seen-skills dedup patterns and compaction reset logic
// Adapted from Vercel plugin
import { readFileSync, writeFileSync } from "fs";
import { createLogger, logCaughtError } from "./logger.mjs";

var log = createLogger();

// Priority threshold for compaction reset (skills with priority >= 7 are re-injected after compaction)
export var COMPACTION_REINJECT_MIN_PRIORITY = 7;

// --- Seen skills parsing/merging/filtering ---

export function parseSeenSkills(value) {
  if (typeof value !== "string" || value.trim() === "") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export function mergeSeenSkills(...values) {
  const set = new Set();
  for (const value of values) {
    for (const skill of parseSeenSkills(value)) {
      set.add(skill);
    }
  }
  return Array.from(set).sort();
}

export function filterSeenSkillState(value, skillsToClear) {
  const parsed = parseSeenSkills(value);
  const filtered = parsed.filter((s) => !skillsToClear.has(s));
  return filtered.join(",");
}

export function isHighPrioritySkill(skillName, skillMap) {
  const skill = skillMap[skillName];
  if (!skill) return false;
  const priority = skill.metadata?.priority ?? 0;
  return priority >= COMPACTION_REINJECT_MIN_PRIORITY;
}

// --- Compaction reset ---

export function mergeSeenSkillStates(envValue, fileValue, claimValue) {
  return mergeSeenSkills(envValue, fileValue, claimValue);
}

export function mergeSeenSkillStatesWithCompactionReset(
  envValue,
  fileValue,
  claimValue,
  options = {}
) {
  const { skillMap = {}, compactionTriggered = false } = options;

  if (!compactionTriggered) {
    return {
      seenState: mergeSeenSkillStates(envValue, fileValue, claimValue),
      compactionResetApplied: false,
      clearedSkills: [],
    };
  }

  // Compaction triggered: find high-priority skills to re-inject
  const compactionState = mergeSeenSkillStates(envValue, fileValue, claimValue);
  const skillsToClear = new Set();

  // compactionState is an array (from mergeSeenSkills), iterate directly
  for (const skill of compactionState) {
    if (isHighPrioritySkill(skill, skillMap)) {
      skillsToClear.add(skill);
    }
  }

  const seenEnv = filterSeenSkillState(envValue, skillsToClear);
  const seenFile = filterSeenSkillState(fileValue, skillsToClear);
  const seenClaims = filterSeenSkillState(claimValue, skillsToClear);

  return {
    seenState: mergeSeenSkillStates(seenEnv, seenFile, seenClaims),
    compactionResetApplied: skillsToClear.size > 0,
    clearedSkills: Array.from(skillsToClear).sort(),
    seenEnv,
    seenFile,
    seenClaims,
  };
}

// --- Skill size estimation (for token budget) ---

export function estimateSkillSize(skill) {
  if (!skill) return 500;
  const summary = skill.description || "";
  return Math.max(summary.length * 10, 500);
}

// --- Prompt skill score state ---

export function sortPromptScoreStates(ranked) {
  return ranked.sort((a, b) => {
    // Higher score first
    if (b.score !== a.score) return b.score - a.score;
    // Higher priority first
    const aPriority = a.skill_metadata?.priority ?? 0;
    const bPriority = b.skill_metadata?.priority ?? 0;
    if (bPriority !== aPriority) return bPriority - aPriority;
    // Alphabetical for stability
    return a.skill.localeCompare(b.skill);
  });
}

// --- Docs block builder ---

export function buildDocsBlock(matchedSkills, skillMap) {
  const docsLines = [];
  for (const skillName of matchedSkills) {
    const skill = skillMap[skillName];
    if (!skill) continue;
    const docs = skill.metadata?.docs;
    if (Array.isArray(docs) && docs.length > 0) {
      docsLines.push(`  - **${skillName}**: ${docs.join(" , ")}`);
    }
  }
  if (docsLines.length === 0) return null;
  return `---\n**MANDATORY: CloudBase skills change frequently — verify via searchKnowledgeBase.**\nOfficial docs:\n${docsLines.join("\n")}\n---`;
}

// --- Seen skills state persistence ---

export function persistCompactionResetEnv(seenEnv) {
  // Update CLAUDE_ENV_FILE with new seen-skills env var
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (!envFile) return;
  try {
    let content = "";
    try {
      content = readFileSync(envFile, "utf-8");
    } catch {
      // File may not exist yet
    }
    // Remove existing CLOUDBASE_PLUGIN_SEEN_SKILLS line and append new one
    const lines = content.split("\n").filter((line) => !line.startsWith("export CLOUDBASE_PLUGIN_SEEN_SKILLS="));
    lines.push(`export CLOUDBASE_PLUGIN_SEEN_SKILLS="${seenEnv}"`);
    writeFileSync(envFile, lines.join("\n") + "\n", "utf-8");
  } catch (error) {
    logCaughtError(log, "patterns:persist-compaction-reset-env-failed", error, { envFile });
  }
}
