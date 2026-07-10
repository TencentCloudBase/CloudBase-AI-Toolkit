// hooks/lexical-index.mjs — Lightweight lexical index for skill retrieval
// Instead of MiniSearch dependency, uses a simple inverted index with fuzzy matching.
// Supports Chinese + English synonyms. Adapted from Vercel plugin concept.

// --- Synonym map (Chinese + English) ---
var SYNONYM_MAP = {
  // Scenario
  web: ["前端", "frontend", "浏览器", "browser", "spa", "ssr"],
  小程序: ["miniprogram", "wechat", "微信", "wxmp", "wx"],
  云托管: ["cloudrun", "container", "容器", "docker"],
  // Deploy
  部署: ["deploy", "ship", "release", "publish", "上线"],
  预览: ["preview", "查看"],
  // Database
  数据库: ["database", "db", "数据存储"],
  云函数: ["function", "serverless", "lambda", "scf", "无服务器"],
  文档数据库: ["nosql", "mongodb", "firestore", "collection"],
  关系型: ["mysql", "postgresql", "postgres", "sql", "prisma", "drizzle"],
  // Auth
  登录: ["login", "signin", "auth", "认证", "身份验证"],
  认证: ["auth", "authentication", "身份"],
  // Storage
  云存储: ["storage", "upload", "上传", "下载", "download", "文件"],
  // AI
  ai: ["人工智能", "llm", "gpt", "hunyuan", "混元", "deepseek", "glm", "kimi"],
  模型: ["model", "llm", "gpt"],
  // Ops
  巡检: ["inspect", "diagnose", "诊断", "health", "健康检查"],
  代码审查: ["review", "lint", "审查", "code review"],
  // General
  环境: ["env", "environment", "配置"],
  模板: ["template", "boilerplate", "脚手架", "scaffold"],
  // Skills by name
  ui: ["界面", "interface", "设计", "design", "prototype", "原型"],
};

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
  const { minScore = 4, maxResults = 10 } = options;
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
  const expandedQueryTerms = expandQueryTerms(queryTerms);

  const scores = new Map();
  for (const doc of index.documents) {
    let score = 0;
    for (const field of index.fields) {
      const fieldTerms = doc[field] || [];
      for (const queryTerm of expandedQueryTerms) {
        for (const fieldTerm of fieldTerms) {
          if (fieldTerm.includes(queryTerm) || queryTerm.includes(fieldTerm)) {
            score += FIELD_BOOSTS[field] || 1;
            break; // Only count once per field
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
  // Expand synonyms in query
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    if (q.includes(key.toLowerCase())) continue; // Already in query
    for (const syn of synonyms) {
      if (q.includes(syn.toLowerCase())) {
        q = q + " " + key.toLowerCase();
        break;
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
