// hooks/user-prompt-submit-skill-inject.mjs — Main UserPromptSubmit hook
// Analyzes user prompt, matches skills, injects best practices into additionalContext.
// Adapted from Vercel plugin.
import { readFileSync } from "fs";
import { createLogger } from "./logger.mjs";
import { normalizeInput, formatOutput, setSessionEnv } from "./compat.mjs";
import { loadSkills, buildSkillInjectionOutput } from "./skill-inject-core.mjs";
import { analyzePrompt } from "./prompt-analysis.mjs";
import { searchSkills } from "./lexical-index.mjs";
import { mergeExactAndLexical, rerankPromptAnalysisReport } from "./unified-ranker.mjs";
import {
  applyProjectContextBoost,
  applyDominantTopicSuppression,
} from "./prompt-patterns.mjs";
import { mergeSeenSkills } from "./patterns.mjs";
import { tryClaimSessionKey, readSessionFile, getDedupScopeId } from "./hook-env.mjs";

var log = createLogger();

var MAX_SKILLS = 2;
var DEFAULT_INJECTION_BUDGET_BYTES = 8000;
var MIN_PROMPT_LENGTH = 5;

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
  const prompt = normalized.prompt || "";
  const sessionId = normalized.sessionId || "";
  const scopeId = getDedupScopeId(input);

  // Short prompts — skip
  if (prompt.length < MIN_PROMPT_LENGTH) {
    log.debug("user-prompt-submit:skip-short-prompt", { length: prompt.length });
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  // Load skills
  const { skillMap, compiledSkills, lexicalIndex } = loadSkills();
  if (!skillMap || Object.keys(skillMap).length === 0) {
    log.debug("user-prompt-submit:no-skills", {});
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  // Analyze prompt (exact match)
  const report = analyzePrompt(prompt, skillMap, compiledSkills);

  // Lexical search
  const lexicalResults = searchSkills(prompt, lexicalIndex, { minScore: 4, maxResults: 10 });

  // Merge exact + lexical
  const mergedResults = mergeExactAndLexical(report.results, lexicalResults, skillMap);

  // Apply project context boost
  const likelySkills = new Set(
    (process.env.CLOUDBASE_PLUGIN_LIKELY_SKILLS || "").split(",").filter(Boolean)
  );
  const boostedResults = mergedResults.map((entry) => applyProjectContextBoost(entry, likelySkills));

  // Apply dominant topic suppression
  const topScore = boostedResults.length > 0 ? Math.max(...boostedResults.map((e) => e.score)) : 0;
  const finalResults = boostedResults.map((entry) => applyDominantTopicSuppression(entry, topScore));

  // Update report with merged results
  report.results = finalResults;

  // Rerank and truncate
  const reranked = rerankPromptAnalysisReport(report, skillMap, MAX_SKILLS, DEFAULT_INJECTION_BUDGET_BYTES);

  if (reranked.injectedSkills.length === 0) {
    log.debug("user-prompt-submit:no-injection", {
      promptLength: prompt.length,
      matchedCount: reranked.matchedSkills.length,
    });
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  // Seen-skills dedup
  const seenEnv = process.env[ENV_SEEN_SKILLS_KEY] || "";
  const seenFile = readSessionFile(sessionId, "seen-skills", scopeId);
  const seenSkills = new Set(mergeSeenSkills(seenEnv, seenFile));

  const dedupedInjected = reranked.injectedSkills.filter((skill) => {
    // Claim atomically; if already claimed, skip
    if (seenSkills.has(skill)) return false;
    if (sessionId) {
      return tryClaimSessionKey(sessionId, "seen-skills", skill, scopeId);
    }
    return true;
  });

  if (dedupedInjected.length === 0) {
    log.debug("user-prompt-submit:all-deduped", {
      matchedSkills: reranked.matchedSkills,
    });
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  // Build output
  const { additionalContext, meta } = buildSkillInjectionOutput(dedupedInjected, skillMap, "UserPromptSubmit");

  // Update seen-skills env var
  const updatedSeen = mergeSeenSkills(seenEnv, dedupedInjected.join(","));
  if (platform === "cursor") {
    setSessionEnv(platform, ENV_SEEN_SKILLS_KEY, updatedSeen);
  } else {
    // Claude Code: env var already in CLAUDE_ENV_FILE from profiler, update would need rewrite
    // For simplicity, rely on session file dedup
  }

  log.summary("user-prompt-submit:complete", {
    matchedSkills: reranked.matchedSkills,
    injectedSkills: dedupedInjected,
    droppedByCap: reranked.droppedByCap,
    droppedByBudget: reranked.droppedByBudget,
    promptLength: prompt.length,
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
