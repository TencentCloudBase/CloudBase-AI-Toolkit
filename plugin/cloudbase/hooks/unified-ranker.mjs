// hooks/unified-ranker.mjs — Unified ranker merging exact + lexical scores
// Adapted from Vercel plugin
import { adaptiveBoostTier } from "./lexical-index.mjs";
import { sortPromptScoreStates, estimateSkillSize } from "./patterns.mjs";

export function rerankPromptAnalysisReport(report, skillMap, maxSkills, budgetBytes) {
  // 1. Filter matched skills
  const ranked = report.results.filter((r) => r.matched);

  // 2. Sort by score > priority > name
  sortPromptScoreStates(ranked);

  // 3. Dedup filter (seen skills)
  // (seen filtering happens in caller)
  const afterDedup = ranked;

  // 4. MAX_SKILLS truncation
  const droppedByCap = afterDedup.slice(maxSkills).map((e) => e.skill);
  const selected = afterDedup.slice(0, maxSkills);

  // 5. Budget estimation
  const droppedByBudget = [];
  let usedBytes = 0;
  const finalSkills = [];

  for (const entry of selected) {
    const estimatedSize = estimateSkillSize(skillMap[entry.skill]);
    if (usedBytes + estimatedSize > budgetBytes && finalSkills.length > 0) {
      droppedByBudget.push(entry.skill);
      continue;
    }
    usedBytes += estimatedSize;
    finalSkills.push(entry.skill);
  }

  return {
    matchedSkills: ranked.map((e) => e.skill),
    injectedSkills: finalSkills,
    droppedByCap,
    droppedByBudget,
    usedBytes,
  };
}

export function mergeExactAndLexical(exactResults, lexicalResults, skillMap) {
  const merged = new Map();

  // Add exact match scores
  for (const entry of exactResults) {
    merged.set(entry.skill, {
      skill: entry.skill,
      exactScore: entry.score,
      lexicalScore: 0,
      matched: entry.matched,
      reason: entry.reason,
      minScore: entry.minScore,
      skill_metadata: skillMap[entry.skill],
    });
  }

  // Add lexical scores (with adaptive boost)
  for (const lexicalEntry of lexicalResults) {
    const existing = merged.get(lexicalEntry.skill);
    const exactScore = existing?.exactScore ?? 0;
    const tier = adaptiveBoostTier(exactScore, existing?.minScore ?? 6);
    const boostedLexicalScore = lexicalEntry.score * tier.multiplier;

    if (existing) {
      existing.lexicalScore = boostedLexicalScore;
    } else {
      merged.set(lexicalEntry.skill, {
        skill: lexicalEntry.skill,
        exactScore: 0,
        lexicalScore: boostedLexicalScore,
        matched: false,
        reason: `lexical: ${lexicalEntry.score} * ${tier.multiplier} (${tier.tier})`,
        minScore: 6,
        skill_metadata: skillMap[lexicalEntry.skill],
      });
    }
  }

  // Combine scores: exact + lexical (lexical capped)
  const results = [];
  for (const entry of merged.values()) {
    const combinedScore = entry.exactScore + Math.min(entry.lexicalScore, 10);
    results.push({
      ...entry,
      score: combinedScore,
      matched: combinedScore >= entry.minScore,
    });
  }

  return results;
}
