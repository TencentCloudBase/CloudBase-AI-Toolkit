#!/usr/bin/env node
// scripts/build-skill-manifest.mjs
// Scans plugin/cloudbase/skills/*/SKILL.md → parses frontmatter → compiles glob patterns → outputs generated/skill-manifest.json
// This manifest is loaded at runtime by skill-inject-core.mjs for fast skill matching.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const pluginRoot = join(projectRoot, "plugin", "cloudbase");
const skillsDir = join(pluginRoot, "skills");
const outputPath = join(pluginRoot, "generated", "skill-manifest.json");

// --- YAML frontmatter parser (using js-yaml for correctness) ---

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  return {
    frontmatter: yaml.load(match[1]) || {},
    body: match[2],
  };
}

// --- Glob to regex source ---

function globToRegexSource(glob) {
  let regex = glob;
  regex = regex.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  regex = regex.replace(/\*\*/g, "::DOUBLESTAR::");
  regex = regex.replace(/\*/g, "[^/]*");
  regex = regex.replace(/\?/g, ".");
  regex = regex.replace(/::DOUBLESTAR::/g, ".*");
  return `^${regex}$`;
}

// --- Build manifest ---

function buildManifest() {
  if (!existsSync(skillsDir)) {
    console.error(`Skills directory not found: ${skillsDir}`);
    process.exit(1);
  }

  const skills = {};
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
    const pathPatterns = Array.isArray(metadata.pathPatterns) ? metadata.pathPatterns : [];
    const bashPatterns = Array.isArray(metadata.bashPatterns) ? metadata.bashPatterns : [];

    skills[dir.name] = {
      name: frontmatter.name || dir.name,
      description: frontmatter.description || "",
      version: frontmatter.version,
      metadata: {
        priority: metadata.priority ?? 5,
        ...(metadata.docs ? { docs: metadata.docs } : {}),
      },
      promptSignals: frontmatter.promptSignals || { phrases: [], minScore: 6 },
      retrieval: frontmatter.retrieval || { aliases: [], intents: [], entities: [], examples: [] },
      pathRegexSources: pathPatterns.map(globToRegexSource),
      bashPatterns: bashPatterns,
    };
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
  console.log(`✓ Generated ${outputPath}`);
  console.log(`  Skills: ${skillCount}`);
  console.log(`  Size: ${(totalBytes / 1024).toFixed(1)} KB`);

  // Validation summary
  const withPromptSignals = Object.values(skills).filter((s) => s.promptSignals?.phrases?.length > 0).length;
  const withRetrieval = Object.values(skills).filter((s) => s.retrieval?.aliases?.length > 0).length;
  const withPathPatterns = Object.values(skills).filter((s) => s.pathRegexSources?.length > 0).length;
  console.log(`  With promptSignals: ${withPromptSignals}/${skillCount}`);
  console.log(`  With retrieval: ${withRetrieval}/${skillCount}`);
  console.log(`  With pathPatterns: ${withPathPatterns}/${skillCount}`);

  if (withPromptSignals < skillCount) {
    console.warn(`⚠ ${skillCount - withPromptSignals} skills missing promptSignals (skill-inject will not match them)`);
  }
}

buildManifest();
