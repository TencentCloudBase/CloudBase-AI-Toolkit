// hooks/pretooluse-skill-inject.mjs — PreToolUse skill injection (file path / bash command matching)
// Matches tool inputs (file paths, bash commands) against skill patterns.
// Adapted from Vercel plugin.
import { readFileSync } from "fs";
import { createLogger } from "./logger.mjs";
import { normalizeInput, formatOutput } from "./compat.mjs";
import { loadSkills, buildSkillInjectionOutput } from "./skill-inject-core.mjs";
import { compileSkillPatterns } from "./prompt-patterns.mjs";
import { tryClaimSessionKey, readSessionFile, getDedupScopeId } from "./hook-env.mjs";
import { mergeSeenSkills } from "./patterns.mjs";

var log = createLogger();

var MAX_SKILLS = 3;
var ENV_SEEN_SKILLS_KEY = "CLOUDBASE_PLUGIN_SEEN_SKILLS";

function main() {
  const raw = readFileSync(0, "utf-8");
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    input = {};
  }
  const normalized = normalizeInput(input);
  const platform = normalized.platform;
  const toolName = normalized.toolName || "";
  const toolInput = normalized.toolInput || {};
  const sessionId = normalized.sessionId || "";
  const scopeId = getDedupScopeId(input);

  // Only process Edit/Write/MultiEdit/apply_patch/Bash
  if (!["Edit", "Write", "MultiEdit", "apply_patch", "Bash"].includes(toolName)) {
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  const { skillMap } = loadSkills();
  if (!skillMap || Object.keys(skillMap).length === 0) {
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  // Extract file path or command from tool input
  const filePath = toolInput.file_path || toolInput.path || "";
  const command = toolInput.command || "";

  if (!filePath && !command) {
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  // Compile skill patterns
  const compiled = compileSkillPatterns(skillMap);

  // Match skills against file path / command
  const matchedSkills = [];
  for (const [skillName, patterns] of Object.entries(compiled)) {
    let matched = false;
    if (filePath) {
      for (const regex of patterns.pathRegexes) {
        if (regex.test(filePath)) {
          matched = true;
          break;
        }
      }
    }
    if (!matched && command) {
      for (const regex of patterns.bashRegexes) {
        if (regex.test(command)) {
          matched = true;
          break;
        }
      }
    }
    if (matched) {
      matchedSkills.push(skillName);
    }
  }

  if (matchedSkills.length === 0) {
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  // Sort by priority
  matchedSkills.sort((a, b) => {
    const aPriority = skillMap[a]?.metadata?.priority ?? 0;
    const bPriority = skillMap[b]?.metadata?.priority ?? 0;
    return bPriority - aPriority;
  });

  // Truncate to MAX_SKILLS
  const selected = matchedSkills.slice(0, MAX_SKILLS);

  // Seen-skills dedup
  const seenEnv = process.env[ENV_SEEN_SKILLS_KEY] || "";
  const seenFile = readSessionFile(sessionId, "seen-skills", scopeId);
  const seenSkills = new Set(mergeSeenSkills(seenEnv, seenFile));

  const dedupedInjected = selected.filter((skill) => {
    if (seenSkills.has(skill)) return false;
    if (sessionId) {
      return tryClaimSessionKey(sessionId, "seen-skills", skill, scopeId);
    }
    return true;
  });

  if (dedupedInjected.length === 0) {
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  // Build output
  const { additionalContext } = buildSkillInjectionOutput(dedupedInjected, skillMap, "PreToolUse");

  log.summary("pretooluse-skill-inject:complete", {
    toolName,
    filePath,
    matchedSkills: selected,
    injectedSkills: dedupedInjected,
  });

  process.stdout.write(
    JSON.stringify(
      formatOutput(platform, {
        additionalContext,
      })
    )
  );
}

main();
