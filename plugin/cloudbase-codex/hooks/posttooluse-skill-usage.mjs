// hooks/posttooluse-skill-usage.mjs — Record actual skill invocations for offline analysis.
//
// Observation only: never adds context, never blocks, never changes what the model sees.
// It exists to answer one question the injection hooks cannot: after a skill was injected,
// did the model actually load it? Without that number there is no way to tell whether the
// per-prompt injection is doing the work or just adding noise.
//
// Every event lands in the same JSONL audit log as the injection hooks
// (CLOUDBASE_PLUGIN_AUDIT_LOG_FILE=off disables all of it), so `npm run analyze:skill-usage`
// can join the two sides by session id.
import { readFileSync } from "fs";
import { normalizeInput, formatOutput } from "./compat.mjs";
import {
  appendAuditLog,
  getDedupScopeId,
  listSessionKeys,
  readSessionFile,
} from "./hook-env.mjs";
import { mergeSeenSkills, normalizeSkillId } from "./patterns.mjs";

var ENV_SEEN_SKILLS_KEY = "CLOUDBASE_PLUGIN_SEEN_SKILLS";
var SEARCH_TOOL_RE = /(^|__)searchKnowledgeBase$/i;

function readString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}

// The Skill tool is invoked with the frontmatter name; the knowledge-base fallback
// passes the same identifier as `skillName` with mode=skill. Both map to a skill.
function extractSkillName(toolName, toolInput) {
  if (SEARCH_TOOL_RE.test(toolName)) {
    if (readString(toolInput.mode).toLowerCase() !== "skill") return "";
    return readString(toolInput.skillName) || readString(toolInput.skill) || readString(toolInput.name);
  }
  return readString(toolInput.skill) || readString(toolInput.skillName) || readString(toolInput.name);
}

// A Skill() call may use a legacy short name while injection recorded the current one,
// so both sides go through the same alias table before comparing. A prefix match is the
// last resort for a name that drops or adds the plugin suffix.
function matchesInjected(calledName, injectedNames) {
  const called = normalizeSkillId(calledName).toLowerCase();
  for (const name of injectedNames) {
    const injected = normalizeSkillId(name).toLowerCase();
    if (injected === called) return name;
    if (injected.startsWith(`${called}-`) || called.startsWith(`${injected}-`)) return name;
  }
  return "";
}

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
  const sessionId = normalized.sessionId || "";
  const scopeId = getDedupScopeId(input);
  const toolName = normalized.toolName || "";
  const toolInput = normalized.toolInput || {};

  const skillName = toolName ? extractSkillName(toolName, toolInput) : "";
  if (!skillName) {
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  const injectedSkills = sessionId
    ? mergeSeenSkills(
        process.env[ENV_SEEN_SKILLS_KEY] || "",
        readSessionFile(sessionId, "seen-skills", scopeId),
        listSessionKeys(sessionId, "seen-skills", scopeId).join(","),
      )
    : mergeSeenSkills(process.env[ENV_SEEN_SKILLS_KEY] || "");

  const injectedAs = matchesInjected(skillName, injectedSkills);

  appendAuditLog(
    {
      event: "skill-usage",
      sessionId,
      tool: toolName,
      skill: skillName,
      injected: injectedAs !== "",
      injectedAs: injectedAs || undefined,
    },
    normalized.cwd,
  );

  process.stdout.write(JSON.stringify(formatOutput(platform, {})));
}

main();
