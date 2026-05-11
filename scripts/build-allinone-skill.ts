#!/usr/bin/env npx tsx
/**
 * Build All-in-One CloudBase Skill
 *
 * Usage:
 *   npx tsx scripts/build-allinone-skill.ts --dir <target-directory> [--no-sub-skill]
 *
 * Options:
 *   --dir <path>      Target directory (required)
 *   --no-sub-skill    Rename sub-skill SKILL.md to README.md for better spec compliance
 *
 * Example:
 *   npx tsx scripts/build-allinone-skill.ts --dir ~/my-project
 *   npx tsx scripts/build-allinone-skill.ts --dir ./my-app/.cursor/skills --no-sub-skill
 *
 * This will create:
 *   <target-directory>/cloudbase/
 *   ├── SKILL.md                    # Main skill entry (from skills-repo-template)
 *   └── references/                 # All sub-skills (copied)
 *       ├── auth-web/SKILL.md       # or README.md with --no-sub-skill
 *       ├── no-sql-web-sdk/
 *       │   ├── SKILL.md            # or README.md with --no-sub-skill
 *       │   └── *.md
 *       └── ...
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOLKIT_ROOT = path.resolve(__dirname, "..");

// Source of truth paths (relative to toolkit root)
const SOURCES = {
  mainRules: 'config/source/guideline/cloudbase/SKILL.md',
  skillsDir: 'config/source/skills',
  guidelineReferences: 'config/source/guideline/cloudbase/references',
};

// Skills to exclude from the bundle
const EXCLUDE_SKILLS = ["cloudbase"];

// Sub-skill entry filename based on mode
const SUB_SKILL_FILENAME = {
  default: "SKILL.md",
  noSubSkill: "README.md",
};

// Parse command line arguments
function parseArgs(): { targetDir: string; noSubSkill: boolean } {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf("--dir");
  const noSubSkill = args.includes("--no-sub-skill");

  if (dirIndex === -1 || !args[dirIndex + 1]) {
    console.error("❌ Error: --dir argument is required\n");
    console.error(
      "Usage: npx tsx scripts/build-allinone-skill.ts --dir <target-directory> [--no-sub-skill]\n",
    );
    console.error("Options:");
    console.error("  --dir <path>      Target directory (required)");
    console.error(
      "  --no-sub-skill    Rename sub-skill SKILL.md to README.md for better spec compliance\n",
    );
    console.error("Example:");
    console.error(
      "  npx tsx scripts/build-allinone-skill.ts --dir ~/my-project",
    );
    console.error(
      "  npx tsx scripts/build-allinone-skill.ts --dir ./my-app/.cursor/skills --no-sub-skill",
    );
    process.exit(1);
  }

  return { targetDir: path.resolve(args[dirIndex + 1]), noSubSkill };
}

// Simplified reference guide to replace the "Path Resolution Strategy" section
const SIMPLIFIED_REFERENCE_GUIDE = `## 📁 Reference Files Location

All reference documentation files are located in the \`references/\` directory relative to this file.

**File Structure:**
\`\`\`
cloudbase/
├── SKILL.md              # This file (main entry)
└── references/           # All reference documentation
    ├── auth-web/         # Web authentication guide
    ├── auth-wechat/      # WeChat authentication guide
    ├── no-sql-web-sdk/   # NoSQL database for Web
    ├── ui-design/        # UI design guidelines
    └── ...               # Other reference docs
\`\`\`

**How to use:** When this document mentions reading a reference file like \`references/auth-web/README.md\`, simply read that file from the \`references/\` subdirectory.

---

`;

// Convert SKILL.md content to allinone SKILL.md format
function convertMdcToSkill(skillContent: string, noSubSkill: boolean): string {
  let content = skillContent;

  // Determine the sub-skill entry filename
  const subSkillFile = noSubSkill
    ? SUB_SKILL_FILENAME.noSubSkill
    : SUB_SKILL_FILENAME.default;

  // Insert the reference guide after the first heading
  content = content.replace(
    /(# CloudBase Development Guidelines\n)/,
    `$1\n${SIMPLIFIED_REFERENCE_GUIDE}`,
  );

  // Replace inline `skill-name` skill references with references/ paths
  // Match backtick-quoted skill names that correspond to known skill directories
  content = content.replace(/the `([a-z][a-z0-9-]+)` skill/g, (match, name) => {
    return `the \`references/${name}/${subSkillFile}\` skill`;
  });

  return content;
}

// Escape a literal string for safe use inside a RegExp.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Generate routing table markdown from activation-map.yaml
function generateRoutingTableFromYaml(): string {
  const yamlPath = path.join(TOOLKIT_ROOT, SOURCES.guidelineReferences, 'activation-map.yaml');
  if (!fs.existsSync(yamlPath)) return '';
  const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
  const data = yaml.load(yamlContent) as { scenarios?: Record<string, any>[] };
  const scenarios = data.scenarios || [];

  const tick = (x: string) => `\`${x}\``;
  const joinSkills = (arr: string[] | undefined) =>
    (arr && arr.length > 0) ? arr.map(tick).join(', ') : '-';

  let table = '| Scenario | Read first | Then read | Do NOT route to first | Must check before action |\n';
  table += '|----------|------------|-----------|------------------------|--------------------------|\n';

  for (const s of scenarios) {
    const scenario = s.label || s.id || '';
    const first = s.firstRead ? tick(s.firstRead) : '';
    const then = joinSkills(s.thenRead);
    const donot = joinSkills(s.doNotUse);
    const mustCheck = (s.mustCheckBeforeAction || []).join(', ') || '-';
    table += `| ${scenario} | ${first} | ${then} | ${donot} | ${mustCheck} |\n`;
  }

  // Emit a trigger vocabulary block so activation-critical keywords
  // (Chinese + English phrases from activation-map.yaml `signals`) stay
  // visible in the published SKILL.md — not just in the YAML reference.
  const triggerLines: string[] = [];
  for (const s of scenarios) {
    const label = s.label || s.id || '';
    const signals: string[] = Array.isArray(s.signals) ? s.signals : [];
    if (!label || signals.length === 0) continue;
    triggerLines.push(`- **${label}** — ${signals.join(', ')}`);
  }

  if (triggerLines.length > 0) {
    table += '\n#### Activation triggers (derived from `references/activation-map.yaml`)\n\n';
    table += triggerLines.join('\n') + '\n';
  }

  return table;
}


// Inject auto-generated routing table into SKILL.md content
function injectRoutingTable(skillContent: string): string {
  const table = generateRoutingTableFromYaml();
  if (!table) return skillContent;

  const marker = '<!-- DO NOT EDIT: auto-generated from references/activation-map.yaml -->';
  const fallbackMarker = 'See `references/activation-map.yaml` for the canonical routing contract';

  if (skillContent.includes(marker)) {
    // Replace from marker up to the next ### heading
    return skillContent.replace(
      new RegExp(`${escapeRegExp(marker)}\\n(?:.*\\n)*?(?=\\n### )`),
      `${marker}\n\n${table}\n`
    );
  } else if (skillContent.includes(fallbackMarker)) {
    // Fallback: replace the "See references/..." paragraph with the
    // marker + generated table. Use a properly-constructed RegExp with
    // the dotall flag so `.` crosses newlines.
    return skillContent.replace(
      new RegExp(`${escapeRegExp(fallbackMarker)}.*?(?=\\n### )`, 's'),
      `${marker}\n\n${table}\n`
    );
  }

  return skillContent;
}

// Recursively copy directory with optional SKILL.md rename
function copyDir(src: string, dest: string, renameSkillMd: boolean): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    let destName = entry.name;

    // Rename SKILL.md to README.md if requested
    if (renameSkillMd && entry.name === "SKILL.md") {
      destName = SUB_SKILL_FILENAME.noSubSkill;
    }

    const destPath = path.join(dest, destName);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, renameSkillMd);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function buildAllInOneSkill(
  targetDir: string,
  noSubSkill = false,
): { outputDir: string; skillCount: number } {
  const outputDir = path.join(targetDir, 'cloudbase');
  const referencesDir = path.join(outputDir, 'references');

  console.log("🔧 Building All-in-One CloudBase Skill...\n");
  console.log(`📂 Source: ${TOOLKIT_ROOT}`);
  console.log(`📂 Target: ${outputDir}`);
  if (noSubSkill) {
    console.log(`🔄 Mode: --no-sub-skill (SKILL.md → README.md)`);
  }
  console.log("");

  // 1. Find all available skills
  const skillsSourceDir = path.join(TOOLKIT_ROOT, SOURCES.skillsDir);
  const allSkills = fs.readdirSync(skillsSourceDir).filter((name) => {
    const skillPath = path.join(skillsSourceDir, name);
    return (
      fs.statSync(skillPath).isDirectory() &&
      !EXCLUDE_SKILLS.includes(name) &&
      fs.existsSync(path.join(skillPath, "SKILL.md"))
    );
  });

  console.log(`📦 Found ${allSkills.length} skills to bundle\n`);

  // 2. Create output directory (clean if exists)
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(referencesDir, { recursive: true });

  // 3. Generate and write main SKILL.md
  const sourcePath = path.join(TOOLKIT_ROOT, SOURCES.mainRules);
  const mdcContent = fs.readFileSync(sourcePath, "utf-8");
  let skillContent = convertMdcToSkill(mdcContent, noSubSkill);

  // Auto-inject routing table from activation-map.yaml
  skillContent = injectRoutingTable(skillContent);

  fs.writeFileSync(path.join(outputDir, "SKILL.md"), skillContent);
  console.log("✅ Created: cloudbase/SKILL.md");

  // 4. Copy all sub-skills to references/
  const subSkillFile = noSubSkill
    ? SUB_SKILL_FILENAME.noSubSkill
    : SUB_SKILL_FILENAME.default;
  for (const skillName of allSkills) {
    const srcPath = path.join(skillsSourceDir, skillName);
    const destPath = path.join(referencesDir, skillName);
    copyDir(srcPath, destPath, noSubSkill);
    console.log(`📋 Copied: references/${skillName}/ (entry: ${subSkillFile})`);
  }

  // 5. Copy guideline references (e.g. activation-map.yaml) to references/
  const guidelineRefsSource = path.join(TOOLKIT_ROOT, SOURCES.guidelineReferences);
  if (fs.existsSync(guidelineRefsSource)) {
    for (const entry of fs.readdirSync(guidelineRefsSource, { withFileTypes: true })) {
      const srcPath = path.join(guidelineRefsSource, entry.name);
      const destPath = path.join(referencesDir, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath, noSubSkill);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      console.log(`📋 Copied: references/${entry.name}`);
    }
  }

  console.log(`\n✨ Done! All-in-One skill created at: ${outputDir}`);
  console.log(`   Total: 1 main SKILL.md + ${allSkills.length} reference docs`);
  if (noSubSkill) {
    console.log(
      `   Note: Sub-skill SKILL.md files renamed to README.md for spec compliance`,
    );
  }

  return {
    outputDir,
    skillCount: allSkills.length,
  };
}

// Main function
async function main() {
  const { targetDir, noSubSkill } = parseArgs();
  buildAllInOneSkill(targetDir, noSubSkill);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}
