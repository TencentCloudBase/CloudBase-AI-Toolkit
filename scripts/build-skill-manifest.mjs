#!/usr/bin/env node
// scripts/build-skill-manifest.mjs
// Scans plugin/cloudbase/skills/*/SKILL.md → merges skill-metadata.json →
// compiles glob patterns → outputs generated/skill-manifest.json
// This manifest is loaded at runtime by skill-inject-core.mjs for fast skill matching.
//
// Matching-data precedence (promptSignals / retrieval / priority):
//   1. plugin/cloudbase/skill-metadata.json  (hand-maintained; not touched by skill sync)
//   2. SKILL.md frontmatter                  (usually absent after upstream sync)
//   3. previous generated/skill-manifest.json (last-resort)
// When adding a skill, copy plugin/cloudbase/skill-metadata.template.json into
// skill-metadata.json using the skills/<dir> name as the key.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { SKILL_ID_ALIASES } from "../plugin/cloudbase/hooks/patterns.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const pluginRoot = join(projectRoot, "plugin", "cloudbase");
const defaultSkillsDir = join(pluginRoot, "skills");
const defaultOutputPath = join(pluginRoot, "generated", "skill-manifest.json");
const defaultMetadataPath = join(pluginRoot, "skill-metadata.json");

export const SKILL_METADATA_PATH = defaultMetadataPath;
export const SKILL_MANIFEST_PATH = defaultOutputPath;

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  return {
    frontmatter: yaml.load(match[1]) || {},
    body: match[2],
  };
}

function globToRegexSource(glob) {
  let regex = glob;
  regex = regex.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  regex = regex.replace(/\*\*/g, "::DOUBLESTAR::");
  regex = regex.replace(/\*/g, "[^/]*");
  regex = regex.replace(/\?/g, ".");
  regex = regex.replace(/::DOUBLESTAR::/g, ".*");
  return `^${regex}$`;
}

function loadJsonObject(filePath, key) {
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    return parsed?.[key] && typeof parsed[key] === "object" ? parsed[key] : {};
  } catch {
    return {};
  }
}

function loadPreviousSkills(outputPath) {
  return loadJsonObject(outputPath, "skills");
}

export function loadSkillMetadata(metadataPath = defaultMetadataPath) {
  return loadJsonObject(metadataPath, "skills");
}

function findNamedEntry(table, dirName, skillName) {
  if (!table || typeof table !== "object") return null;
  const candidates = [];
  if (table[dirName]) candidates.push(table[dirName]);
  for (const [legacy, current] of Object.entries(SKILL_ID_ALIASES)) {
    if (current === dirName && table[legacy]) {
      candidates.push(table[legacy]);
    }
  }
  if (skillName && table[skillName]) {
    candidates.push(table[skillName]);
  }
  return candidates[0] || null;
}

function findPreviousSkill(previousSkills, dirName, skillName) {
  const candidates = [];
  if (previousSkills[dirName]) candidates.push(previousSkills[dirName]);
  for (const [legacy, current] of Object.entries(SKILL_ID_ALIASES)) {
    if (current === dirName && previousSkills[legacy]) {
      candidates.push(previousSkills[legacy]);
    }
  }
  if (skillName && previousSkills[skillName]) {
    candidates.push(previousSkills[skillName]);
  }
  return (
    candidates.find((entry) => hasPromptPhrases(entry?.promptSignals) || hasRetrievalData(entry?.retrieval)) ||
    candidates[0] ||
    null
  );
}

export function hasPromptPhrases(signals) {
  return Array.isArray(signals?.phrases) && signals.phrases.length > 0;
}

export function hasRetrievalData(retrieval) {
  if (!retrieval || typeof retrieval !== "object") return false;
  return ["aliases", "intents", "entities", "examples"].some(
    (key) => Array.isArray(retrieval[key]) && retrieval[key].length > 0
  );
}

function pickPromptSignals(metaEntry, frontmatter, previous) {
  if (hasPromptPhrases(metaEntry?.promptSignals)) return metaEntry.promptSignals;
  if (hasPromptPhrases(frontmatter.promptSignals)) return frontmatter.promptSignals;
  if (hasPromptPhrases(previous?.promptSignals)) return previous.promptSignals;
  return { phrases: [], minScore: 6 };
}

function pickRetrieval(metaEntry, frontmatter, previous) {
  if (hasRetrievalData(metaEntry?.retrieval)) return metaEntry.retrieval;
  if (hasRetrievalData(frontmatter.retrieval)) return frontmatter.retrieval;
  if (hasRetrievalData(previous?.retrieval)) return previous.retrieval;
  return { aliases: [], intents: [], entities: [], examples: [] };
}

function pickPriority(metaEntry, metadata, previous) {
  const raw = metaEntry?.priority ?? metadata.priority ?? previous?.metadata?.priority ?? 5;
  const priority = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(priority) ? priority : 5;
}

function isDeprecated(metadata) {
  return (
    metadata.deprecated === true ||
    metadata.deprecated === "true" ||
    metadata.deprecated === 1 ||
    metadata.deprecated === "1"
  );
}

function isCliEntry() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(entry);
  } catch {
    return false;
  }
}

export function formatMissingMetadataError(missingDirs, metadataPath = defaultMetadataPath) {
  const listed = missingDirs.map((name) => `  - ${name}`).join("\n");
  return (
    `✗ ${missingDirs.length} skill(s) missing promptSignals in skill-metadata.json (${metadataPath}):\n` +
      `${listed}\n` +
      `When landing a new plugin skill, copy plugin/cloudbase/skill-metadata.template.json ` +
      `into skill-metadata.json using the skills/<dir> name as the key, then re-run ` +
      `npm run build:skill-manifest.`
  );
}

/**
 * Build skill-manifest.json.
 *
 * @param {object} [options]
 * @param {boolean} [options.requireMetadata] When true (CLI default), fail if any
 *   non-deprecated skill lacks a skill-metadata.json entry with promptSignals.phrases.
 *   Pass false for unit tests that intentionally exercise frontmatter/previous fallbacks.
 */
export function buildManifest(options = {}) {
  const skillsDir = options.skillsDir || defaultSkillsDir;
  const outputPath = options.outputPath || defaultOutputPath;
  const metadataPath = options.metadataPath || defaultMetadataPath;
  const quiet = options.quiet === true;
  const requireMetadata = options.requireMetadata === true;

  if (!existsSync(skillsDir)) {
    console.error(`Skills directory not found: ${skillsDir}`);
    process.exit(1);
  }

  const metadataTable = loadSkillMetadata(metadataPath);
  if (!quiet && Object.keys(metadataTable).length === 0) {
    console.warn(
      `⚠ skill-metadata.json missing or empty (${metadataPath}); ` +
        `falling back to SKILL.md frontmatter / previous manifest`
    );
  }

  const previousSkills =
    options.previousSkills !== undefined
      ? options.previousSkills
      : loadPreviousSkills(outputPath);
  const skills = {};
  const missingMetadataDirs = [];
  let skippedDeprecated = 0;
  let entry;
  try {
    entry = readdirSync(skillsDir, { withFileTypes: true });
  } catch (error) {
    console.error(`Failed to read skills directory: ${error.message}`);
    process.exit(1);
  }

  for (const dir of entry) {
    if (!dir.isDirectory()) continue;
    const skillPath = join(skillsDir, dir.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    const content = readFileSync(skillPath, "utf-8");
    const { frontmatter } = parseFrontmatter(content);

    const metadata = frontmatter.metadata || {};
    if (isDeprecated(metadata)) {
      skippedDeprecated++;
      continue;
    }
    const pathPatterns = Array.isArray(metadata.pathPatterns) ? metadata.pathPatterns : [];
    const bashPatterns = Array.isArray(metadata.bashPatterns) ? metadata.bashPatterns : [];
    const skillName = frontmatter.name || dir.name;
    const metaEntry = findNamedEntry(metadataTable, dir.name, skillName);
    const previous = findPreviousSkill(previousSkills, dir.name, skillName);

    if (!hasPromptPhrases(metaEntry?.promptSignals)) {
      missingMetadataDirs.push(dir.name);
    }

    const promptSignals = pickPromptSignals(metaEntry, frontmatter, previous);
    const retrieval = pickRetrieval(metaEntry, frontmatter, previous);
    const priority = pickPriority(metaEntry, metadata, previous);

    skills[dir.name] = {
      name: skillName,
      description: frontmatter.description || "",
      version: frontmatter.version,
      metadata: {
        priority,
        ...(metadata.docs ? { docs: metadata.docs } : {}),
      },
      promptSignals,
      retrieval,
      pathRegexSources: pathPatterns.map(globToRegexSource),
      bashPatterns: bashPatterns,
    };
  }

  if (requireMetadata && missingMetadataDirs.length > 0) {
    const message = formatMissingMetadataError(missingMetadataDirs.sort(), metadataPath);
    if (!quiet) {
      console.error(message);
    }
    const err = new Error(message);
    err.code = "MISSING_SKILL_METADATA";
    err.missingDirs = missingMetadataDirs;
    throw err;
  }

  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    skills,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  const skillCount = Object.keys(skills).length;
  const totalBytes = Buffer.byteLength(JSON.stringify(manifest), "utf-8");
  if (!quiet) {
    console.log(`✓ Generated ${outputPath}`);
    console.log(`  Skills: ${skillCount}`);
    console.log(`  Size: ${(totalBytes / 1024).toFixed(1)} KB`);

    const withPromptSignals = Object.values(skills).filter((s) => s.promptSignals?.phrases?.length > 0).length;
    const withRetrieval = Object.values(skills).filter((s) => s.retrieval?.aliases?.length > 0).length;
    const withPathPatterns = Object.values(skills).filter((s) => s.pathRegexSources?.length > 0).length;
    console.log(`  With promptSignals: ${withPromptSignals}/${skillCount}`);
    console.log(`  With retrieval: ${withRetrieval}/${skillCount}`);
    console.log(`  With pathPatterns: ${withPathPatterns}/${skillCount}`);
    if (skippedDeprecated > 0) {
      console.log(`  Skipped deprecated: ${skippedDeprecated}`);
    }

    if (withPromptSignals < skillCount) {
      console.warn(`⚠ ${skillCount - withPromptSignals} skills missing promptSignals (skill-inject will not match them)`);
    }
  }

  return manifest;
}

if (isCliEntry()) {
  try {
    buildManifest({ requireMetadata: true });
  } catch (error) {
    if (error?.code === "MISSING_SKILL_METADATA") {
      process.exit(1);
    }
    throw error;
  }
}
