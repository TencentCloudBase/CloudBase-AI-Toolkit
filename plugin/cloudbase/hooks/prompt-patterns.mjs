// hooks/prompt-patterns.mjs — Prompt matching and scoring algorithm
// Adapted from Vercel plugin. Supports Chinese + English keywords.

// --- Text normalization ---

var CONTRACTION_MAP = {
  "it's": "it is",
  "don't": "do not",
  "can't": "cannot",
  "won't": "will not",
  "i'm": "i am",
  "you're": "you are",
  "they're": "they are",
  "we're": "we are",
  "isn't": "is not",
  "aren't": "are not",
  "doesn't": "does not",
  "didn't": "did not",
  "haven't": "have not",
  "hasn't": "has not",
  "wouldn't": "would not",
  "couldn't": "could not",
  "shouldn't": "should not",
};

export function normalizePromptText(text) {
  if (typeof text !== "string") return "";
  let t = text.toLowerCase();
  // Expand English contractions
  for (const [contraction, expansion] of Object.entries(CONTRACTION_MAP)) {
    t = t.replace(new RegExp(contraction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), expansion);
  }
  // Normalize whitespace (preserve Chinese chars)
  return t.replace(/\s+/g, " ").trim();
}

// --- Scoring ---

export function compilePromptSignals(promptSignals) {
  if (!promptSignals) return null;
  const phrases = Array.isArray(promptSignals.phrases) ? promptSignals.phrases : [];
  const allOf = Array.isArray(promptSignals.allOf) ? promptSignals.allOf : [];
  const anyOf = Array.isArray(promptSignals.anyOf) ? promptSignals.anyOf : [];
  const noneOf = Array.isArray(promptSignals.noneOf) ? promptSignals.noneOf : [];
  const minScore = typeof promptSignals.minScore === "number" ? promptSignals.minScore : 6;

  return {
    phrases: phrases.map((p) => String(p).toLowerCase()),
    allOf: allOf.map((group) => (Array.isArray(group) ? group.map((s) => String(s).toLowerCase()) : [])),
    anyOf: anyOf.map((s) => String(s).toLowerCase()),
    noneOf: noneOf.map((s) => String(s).toLowerCase()),
    minScore,
  };
}

export function matchPromptWithReason(normalizedPrompt, compiled) {
  if (!compiled) return { matched: false, score: 0, reason: "no promptSignals" };

  const reasons = [];

  // 1. noneOf check → hard suppress
  for (const term of compiled.noneOf) {
    if (normalizedPrompt.includes(term)) {
      return { matched: false, score: -Infinity, reason: `suppressed by noneOf "${term}"` };
    }
  }

  let score = 0;

  // 2. phrases match → +6 each
  for (const phrase of compiled.phrases) {
    if (normalizedPrompt.includes(phrase)) {
      score += 6;
      reasons.push(`phrase "${phrase}" +6`);
    }
  }

  // 3. allOf match → +4 per group (all terms must match)
  for (const group of compiled.allOf) {
    if (group.length > 0 && group.every((term) => normalizedPrompt.includes(term))) {
      score += 4;
      reasons.push(`allOf [${group.join(", ")}] +4`);
    }
  }

  // 4. anyOf match → +1 each, capped at +2
  let anyOfScore = 0;
  for (const term of compiled.anyOf) {
    if (normalizedPrompt.includes(term)) {
      anyOfScore += 1;
    }
  }
  anyOfScore = Math.min(anyOfScore, 2);
  if (anyOfScore > 0) {
    score += anyOfScore;
    reasons.push(`anyOf +${anyOfScore}`);
  }

  const matched = score >= compiled.minScore;
  return { matched, score, reason: reasons.join("; ") };
}

// --- Score adjustments ---

export var PROJECT_CONTEXT_PROMPT_SCORE_BOOST = 3;
export var DOMINANT_TOPIC_SCORE_THRESHOLD = 15;
export var DOMINANT_TOPIC_MIN_SCORE = 8;

export function applyProjectContextBoost(entry, likelySkills) {
  if (!likelySkills.has(entry.skill) || entry.score === -Infinity) return entry;
  const boostedScore = entry.score + PROJECT_CONTEXT_PROMPT_SCORE_BOOST;
  return { ...entry, score: boostedScore, matched: boostedScore >= entry.minScore };
}

export function applyDominantTopicSuppression(entry, topScore) {
  if (!entry.matched || entry.score >= DOMINANT_TOPIC_MIN_SCORE || topScore < DOMINANT_TOPIC_SCORE_THRESHOLD) {
    return entry;
  }
  return { ...entry, matched: false, suppressed: true };
}

// --- Compile skill patterns (for PreToolUse file/bash matching) ---

export function compileSkillPatterns(skillMap) {
  const compiled = {};
  for (const [skillName, skill] of Object.entries(skillMap)) {
    const pathPatterns = skill.metadata?.pathPatterns || [];
    const bashPatterns = skill.metadata?.bashPatterns || [];
    compiled[skillName] = {
      pathRegexes: pathPatterns.map((p) => globToRegex(p)),
      bashRegexes: bashPatterns.map((p) => new RegExp(p, "i")),
    };
  }
  return compiled;
}

// --- Glob to regex ---

function globToRegex(glob) {
  // Convert glob pattern to regex
  // Supports: * (any chars except /), ** (any chars including /), ? (single char),
  // [abc] character class, [!abc] negated class, . (literal)
  let result = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        result += ".*";
        i += 2;
        // Skip trailing / after ** (e.g. src/** → match src/anything)
        if (glob[i] === "/") i++;
      } else {
        result += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      result += ".";
      i++;
    } else if (c === "[") {
      // Character class — pass through to regex
      let cls = "[";
      i++;
      if (glob[i] === "!") {
        cls += "^";
        i++;
      }
      while (i < glob.length && glob[i] !== "]") {
        cls += glob[i];
        i++;
      }
      if (glob[i] === "]") {
        cls += "]";
        i++;
      }
      result += cls;
    } else if ("+^${}()|.\\".includes(c)) {
      result += "\\" + c;
      i++;
    } else {
      result += c;
      i++;
    }
  }
  return new RegExp(`^${result}$`, "i");
}

export { globToRegex };
