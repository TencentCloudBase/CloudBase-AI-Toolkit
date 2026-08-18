// tests/hooks/build-skill-manifest.test.mjs — Unit tests for build-skill-manifest.mjs
// Covers: manifest generation, YAML parsing correctness, glob compilation,
// skill-metadata.json persistence (independent of SKILL.md sync / previous manifest)
import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "child_process";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
} from "fs";
import { join, dirname, relative } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import {
  buildManifest,
  formatMissingMetadataError,
  loadSkillMetadata,
  SKILL_METADATA_PATH,
} from "../../scripts/build-skill-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..", "..");
const MANIFEST_PATH = join(ROOT_DIR, "plugin", "cloudbase", "generated", "skill-manifest.json");
const SKILLS_DIR = join(ROOT_DIR, "plugin", "cloudbase", "skills");
const TEMPLATE_PATH = join(ROOT_DIR, "plugin", "cloudbase", "skill-metadata.template.json");
const EXPECTED_MANIFEST_SKILL_COUNT = 26;

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "skill-manifest-"));
  tempDirs.push(dir);
  return dir;
}

function writeSkill(skillsDir, dirName, frontmatterYaml) {
  const skillDir = join(skillsDir, dirName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\n${frontmatterYaml}\n---\n\n# ${dirName}\n`,
    "utf-8",
  );
}

function writeMetadata(metadataPath, skills) {
  writeFileSync(
    metadataPath,
    JSON.stringify({ version: 1, skills }, null, 2) + "\n",
    "utf-8",
  );
}

function listNonDeprecatedSkillDirs() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(SKILLS_DIR, entry.name, "SKILL.md")))
    .filter((entry) => {
      const content = readFileSync(join(SKILLS_DIR, entry.name, "SKILL.md"), "utf-8");
      return !/deprecated:\s*"?true"?/i.test(content);
    })
    .map((entry) => entry.name)
    .sort();
}

describe("skill-manifest.json", () => {
  it("manifest file exists", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it("has version 2", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    expect(manifest.version).toBe(2);
  });

  it("has 26 non-deprecated skills including minimal-web-baas-demo", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    expect(Object.keys(manifest.skills).length).toBe(EXPECTED_MANIFEST_SKILL_COUNT);
    expect(manifest.skills["minimal-web-baas-demo"]).toBeDefined();
  });

  it("all skills have promptSignals with phrases", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const [name, skill] of Object.entries(manifest.skills)) {
      expect(skill.promptSignals, `${name} should have promptSignals`).toBeDefined();
      expect(Array.isArray(skill.promptSignals.phrases), `${name} phrases should be array`).toBe(true);
      expect(skill.promptSignals.phrases.length, `${name} should have at least 1 phrase`).toBeGreaterThan(0);
    }
  });

  it("all skills have retrieval metadata", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const [name, skill] of Object.entries(manifest.skills)) {
      expect(skill.retrieval, `${name} should have retrieval`).toBeDefined();
      expect(Array.isArray(skill.retrieval.aliases), `${name} aliases should be array`).toBe(true);
    }
  });

  it("all skills have metadata with priority", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const [name, skill] of Object.entries(manifest.skills)) {
      expect(skill.metadata, `${name} should have metadata`).toBeDefined();
      expect(typeof skill.metadata.priority, `${name} priority should be number`).toBe("number");
      expect(skill.metadata.priority).toBeGreaterThanOrEqual(1);
      expect(skill.metadata.priority).toBeLessThanOrEqual(10);
    }
  });

  it("ui-design has highest priority (9)", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    expect(manifest.skills["ui-design"].metadata.priority).toBe(9);
  });

  it("core skills have priority >= 7", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    const coreSkills = [
      "web-development",
      "miniprogram-development",
      "auth-tool-cloudbase",
      "cloudbase-platform",
      "cloud-functions",
      "cloudrun-development",
      "cloudbase-document-database-web-sdk",
      "postgresql-development-cloudbase",
    ];
    for (const name of coreSkills) {
      expect(manifest.skills[name].metadata.priority, `${name}`).toBeGreaterThanOrEqual(7);
    }
  });

  it("pathRegexSources are valid regex strings", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const [name, skill] of Object.entries(manifest.skills)) {
      const patterns = skill.pathRegexSources || [];
      for (const pattern of patterns) {
        expect(() => new RegExp(pattern), `${name} has invalid regex: ${pattern}`).not.toThrow();
      }
    }
  });
});

describe("skill-metadata.json", () => {
  it("lives outside the synced skills directory", () => {
    expect(existsSync(SKILL_METADATA_PATH)).toBe(true);
    const rel = relative(SKILLS_DIR, SKILL_METADATA_PATH);
    expect(rel.startsWith("..")).toBe(true);
  });

  it("covers every non-deprecated plugin skill with non-empty promptSignals", () => {
    const metadataSkills = loadSkillMetadata(SKILL_METADATA_PATH);
    const dirs = listNonDeprecatedSkillDirs();
    expect(dirs.length).toBe(EXPECTED_MANIFEST_SKILL_COUNT);
    for (const dirName of dirs) {
      const entry = metadataSkills[dirName];
      expect(entry, `${dirName} must exist in skill-metadata.json`).toBeDefined();
      expect(
        Array.isArray(entry.promptSignals?.phrases) && entry.promptSignals.phrases.length > 0,
        `${dirName} must have non-empty promptSignals.phrases`,
      ).toBe(true);
      expect(entry.retrieval && typeof entry.retrieval === "object", `${dirName} must have retrieval`).toBe(true);
    }
  });

  it("provides a template for new skills", () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true);
    const template = JSON.parse(readFileSync(TEMPLATE_PATH, "utf-8"));
    const sample = template.skills["your-skill-dir-name"];
    expect(sample).toBeDefined();
    expect(sample.promptSignals.phrases.length).toBeGreaterThan(0);
    expect(Array.isArray(sample.retrieval.aliases)).toBe(true);
    expect(typeof sample.priority).toBe("number");
  });

  it("fails closed when a newly landed skill has no skill-metadata entry", () => {
    const tmp = makeTempDir();
    const skillsDir = join(tmp, "skills");
    const metadataPath = join(tmp, "skill-metadata.json");
    const outputPath = join(tmp, "generated", "skill-manifest.json");

    writeSkill(skillsDir, "existing-skill", [
      "name: existing-skill",
      "description: already registered",
    ].join("\n"));
    writeSkill(skillsDir, "cloudbase-perf-review", [
      "name: cloudbase-perf-review",
      "description: new skill without metadata yet",
    ].join("\n"));
    writeMetadata(metadataPath, {
      "existing-skill": {
        priority: 5,
        promptSignals: { phrases: ["existing"], minScore: 6 },
        retrieval: { aliases: ["existing"], intents: [], entities: [], examples: [] },
      },
    });

    expect(() =>
      buildManifest({
        skillsDir,
        metadataPath,
        outputPath,
        previousSkills: {},
        requireMetadata: true,
        quiet: true,
      }),
    ).toThrow(/cloudbase-perf-review/);

    let caught;
    try {
      buildManifest({
        skillsDir,
        metadataPath,
        outputPath,
        previousSkills: {},
        requireMetadata: true,
        quiet: true,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(caught.code).toBe("MISSING_SKILL_METADATA");
    expect(caught.missingDirs).toEqual(["cloudbase-perf-review"]);
    expect(caught.message).toBe(
      formatMissingMetadataError(["cloudbase-perf-review"], metadataPath),
    );
    expect(existsSync(outputPath)).toBe(false);
  });
});

describe("build-skill-manifest.mjs script", () => {
  it("can be executed successfully", () => {
    const scriptPath = join(ROOT_DIR, "scripts", "build-skill-manifest.mjs");
    expect(existsSync(scriptPath)).toBe(true);
    expect(() => {
      execFileSync("node", [scriptPath], { cwd: ROOT_DIR, encoding: "utf-8" });
    }).not.toThrow();
  });

  it("rebuilds promptSignals from skill-metadata.json without a previous manifest", () => {
    const tmp = makeTempDir();
    const outputPath = join(tmp, "skill-manifest.json");
    const manifest = buildManifest({
      outputPath,
      previousSkills: {},
      requireMetadata: true,
      quiet: true,
    });

    expect(Object.keys(manifest.skills).length).toBe(EXPECTED_MANIFEST_SKILL_COUNT);
    for (const [name, skill] of Object.entries(manifest.skills)) {
      expect(
        skill.promptSignals.phrases.length,
        `${name} lost phrases without previous-manifest fallback`,
      ).toBeGreaterThan(0);
    }
    expect(manifest.skills["minimal-web-baas-demo"].promptSignals.phrases).toContain("最小前后端");
    expect(manifest.skills["web-development"].promptSignals.phrases).toContain("前端 react");
    expect(manifest.skills["web-development"].promptSignals.phrases).toContain("全栈应用");
    expect(manifest.skills["ui-design"].metadata.priority).toBe(9);
  });

  it("prefers skill-metadata.json over SKILL.md frontmatter and previous manifest", () => {
    const tmp = makeTempDir();
    const skillsDir = join(tmp, "skills");
    const metadataPath = join(tmp, "skill-metadata.json");
    const outputPath = join(tmp, "generated", "skill-manifest.json");

    writeSkill(
      skillsDir,
      "demo-skill",
      [
        "name: demo-skill",
        "description: frontmatter description",
        "version: 1.0.0",
        "promptSignals:",
        "  phrases:",
        "    - from-frontmatter",
        "retrieval:",
        "  aliases:",
        "    - from-frontmatter-alias",
      ].join("\n"),
    );
    writeMetadata(metadataPath, {
      "demo-skill": {
        priority: 8,
        promptSignals: { phrases: ["from-metadata"], minScore: 6 },
        retrieval: { aliases: ["from-metadata-alias"], intents: [], entities: [], examples: [] },
      },
    });

    const manifest = buildManifest({
      skillsDir,
      metadataPath,
      outputPath,
      previousSkills: {
        "demo-skill": {
          promptSignals: { phrases: ["from-previous"] },
          retrieval: { aliases: ["from-previous-alias"] },
          metadata: { priority: 3 },
        },
      },
      quiet: true,
    });

    expect(manifest.skills["demo-skill"].promptSignals.phrases).toEqual(["from-metadata"]);
    expect(manifest.skills["demo-skill"].retrieval.aliases).toEqual(["from-metadata-alias"]);
    expect(manifest.skills["demo-skill"].metadata.priority).toBe(8);
  });

  it("falls back to frontmatter then previous when metadata has no phrases", () => {
    const tmp = makeTempDir();
    const skillsDir = join(tmp, "skills");
    const metadataPath = join(tmp, "skill-metadata.json");
    const outputPath = join(tmp, "generated", "skill-manifest.json");

    writeSkill(
      skillsDir,
      "frontmatter-skill",
      [
        "name: frontmatter-skill",
        "description: from frontmatter",
        "promptSignals:",
        "  phrases:",
        "    - from-frontmatter",
      ].join("\n"),
    );
    writeSkill(
      skillsDir,
      "previous-skill",
      ["name: previous-skill", "description: empty frontmatter"].join("\n"),
    );
    writeMetadata(metadataPath, {});

    const manifest = buildManifest({
      skillsDir,
      metadataPath,
      outputPath,
      previousSkills: {
        "previous-skill": {
          promptSignals: { phrases: ["from-previous"], minScore: 6 },
          retrieval: { aliases: ["from-previous-alias"] },
          metadata: { priority: 4 },
        },
      },
      quiet: true,
    });

    expect(manifest.skills["frontmatter-skill"].promptSignals.phrases).toEqual(["from-frontmatter"]);
    expect(manifest.skills["previous-skill"].promptSignals.phrases).toEqual(["from-previous"]);
    expect(manifest.skills["previous-skill"].metadata.priority).toBe(4);
  });
});
