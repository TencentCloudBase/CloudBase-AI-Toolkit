// tests/hooks/build-skill-manifest.test.mjs — Unit tests for build-skill-manifest.mjs
// Covers: manifest generation, YAML parsing correctness, glob compilation
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..", "..");
const MANIFEST_PATH = join(ROOT_DIR, "plugin", "cloudbase", "generated", "skill-manifest.json");

describe("skill-manifest.json", () => {
  it("manifest file exists", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it("has version 2", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    expect(manifest.version).toBe(2);
  });

  it("has 28 skills", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    // 3 deprecated skills (relational-database-tool, relational-database-web, data-model-creation)
    // are excluded from the manifest. Total: 28 - 3 = 25.
    expect(Object.keys(manifest.skills).length).toBe(25);
  });

  it("all skills have promptSignals with phrases", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const [name, skill] of Object.entries(manifest.skills)) {
      expect(skill.promptSignals, `${name} should have promptSignals`).toBeDefined();
      expect(
        Array.isArray(skill.promptSignals.phrases),
        `${name} phrases should be array`
      ).toBe(true);
      expect(
        skill.promptSignals.phrases.length,
        `${name} should have at least 1 phrase`
      ).toBeGreaterThan(0);
    }
  });

  it("all skills have retrieval metadata", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const [name, skill] of Object.entries(manifest.skills)) {
      expect(skill.retrieval, `${name} should have retrieval`).toBeDefined();
      expect(
        Array.isArray(skill.retrieval.aliases),
        `${name} aliases should be array`
      ).toBe(true);
    }
  });

  it("all skills have metadata with priority", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const [name, skill] of Object.entries(manifest.skills)) {
      expect(skill.metadata, `${name} should have metadata`).toBeDefined();
      expect(
        typeof skill.metadata.priority,
        `${name} priority should be number`
      ).toBe("number");
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
    // data-model-creation and relational-database-tool are deprecated and excluded from manifest.
    // postgresql-development replaces relational-database-tool as the core relational DB skill.
    const coreSkills = [
      "web-development",
      "miniprogram-development",
      "auth-tool",
      "cloudbase-platform",
      "cloud-functions",
      "cloudrun-development",
      "no-sql-web-sdk",
      "postgresql-development",
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

describe("build-skill-manifest.mjs script", () => {
  it("can be executed successfully", () => {
    const scriptPath = join(ROOT_DIR, "scripts", "build-skill-manifest.mjs");
    expect(existsSync(scriptPath)).toBe(true);
    expect(() => {
      execFileSync("node", [scriptPath], { cwd: ROOT_DIR, encoding: "utf-8" });
    }).not.toThrow();
  });
});
