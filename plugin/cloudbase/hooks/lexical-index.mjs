// hooks/lexical-index.mjs — Lightweight lexical index for skill retrieval
// Instead of MiniSearch dependency, uses a simple inverted index with fuzzy matching.
// Supports Chinese + English synonyms. Adapted from Vercel plugin concept.
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pluginRoot, safeReadJson } from "./hook-env.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load synonyms from generated/synonyms.json (external config)
function loadSynonymMap() {
  const root = pluginRoot();
  const synonymsPath = join(root, "generated", "synonyms.json");
  const data = safeReadJson(synonymsPath);
  if (data && data.synonyms && typeof data.synonyms === "object") {
    return data.synonyms;
  }
  // Fallback: empty synonym map (lexical index will still work, just without synonym expansion)
  return {};
}

var SYNONYM_MAP = loadSynonymMap();

// --- Build inverted index ---

var FIELDS = ["aliases", "intents", "entities", "examples"];
var FIELD_BOOSTS = { intents: 3, aliases: 2, entities: 1.5, examples: 1 };

export function buildLexicalIndex(skillMap) {
  const documents = [];
  for (const [skillName, skill] of Object.entries(skillMap)) {
    const retrieval = skill.retrieval || {};
    const doc = {
      id: skillName,
      aliases: expandTerms(retrieval.aliases || []),
      intents: expandTerms(retrieval.intents || []),
      entities: expandTerms(retrieval.entities || []),
      examples: expandTerms(retrieval.examples || []),
    };
    documents.push(doc);
  }
  return { documents, fields: FIELDS };
}

function expandTerms(terms) {
  const expanded = new Set();
  for (const term of terms) {
    const lower = String(term).toLowerCase();
    expanded.add(lower);
    // Add synonyms
    for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
        for (const syn of synonyms) {
          expanded.add(syn.toLowerCase());
        }
      }
    }
  }
  return Array.from(expanded);
}

// --- Search ---

export function searchSkills(query, index, options = {}) {
  const { minScore = 6, maxResults = 10 } = options;
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
  const expandedQueryTerms = expandQueryTerms(queryTerms);

  // Minimum overlap length to avoid short-term false positives.
  // Terms shorter than this must match exactly (equality, not substring).
  const MIN_SUBSTRING_LEN = 4;

  const scores = new Map();
  for (const doc of index.documents) {
    let score = 0;
    for (const field of index.fields) {
      const fieldTerms = doc[field] || [];
      for (const queryTerm of expandedQueryTerms) {
        for (const fieldTerm of fieldTerms) {
          // Short terms (<=3 chars) require exact equality to prevent
          // "ai" matching "design" or "设计" matching "API设计".
          if (queryTerm.length <= MIN_SUBSTRING_LEN || fieldTerm.length <= MIN_SUBSTRING_LEN) {
            if (queryTerm === fieldTerm) {
              score += FIELD_BOOSTS[field] || 1;
              break;
            }
          } else {
            // Longer terms: substring match is OK
            if (fieldTerm.includes(queryTerm) || queryTerm.includes(fieldTerm)) {
              score += FIELD_BOOSTS[field] || 1;
              break; // Only count once per field
            }
          }
        }
      }
    }
    if (score >= minScore) {
      scores.set(doc.id, score);
    }
  }

  return Array.from(scores.entries())
    .map(([skill, score]) => ({ skill, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

function normalizeQuery(query) {
  if (typeof query !== "string") return "";
  let q = query.toLowerCase().trim();
  // Expand synonyms in query — add all matching synonym groups (not just first)
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    if (q.includes(key.toLowerCase())) continue; // Key already in query
    for (const syn of synonyms) {
      if (q.includes(syn.toLowerCase())) {
        q = q + " " + key.toLowerCase();
        break; // This synonym group matched, move to next group
      }
    }
  }
  return q;
}

function expandQueryTerms(terms) {
  const expanded = new Set(terms);
  for (const term of terms) {
    for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (term.includes(key.toLowerCase()) || key.toLowerCase().includes(term)) {
        for (const syn of synonyms) {
          expanded.add(syn.toLowerCase());
        }
      }
      // Check if term matches a synonym
      for (const syn of synonyms) {
        if (term.includes(syn.toLowerCase()) || syn.toLowerCase().includes(term)) {
          expanded.add(key.toLowerCase());
          for (const s of synonyms) {
            expanded.add(s.toLowerCase());
          }
        }
      }
    }
  }
  return Array.from(expanded);
}

// --- Adaptive boost tier ---

export function adaptiveBoostTier(exactScore, minScore) {
  if (exactScore <= 0) return { multiplier: 1.5, tier: "high" }; // No exact match, strong boost
  if (exactScore < minScore / 2) return { multiplier: 1.35, tier: "mid" }; // Partial match
  return { multiplier: 1.1, tier: "low" }; // Near threshold, weak boost
}

export var LEXICAL_RESULT_MIN_SCORE = 4;
