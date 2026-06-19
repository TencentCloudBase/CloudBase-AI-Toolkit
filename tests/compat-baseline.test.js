import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, test } from "vitest";
import { buildCompatConfig } from "../scripts/build-compat-config.mjs";
import {
  buildCompatBaselineManifest,
  compareCompatBaseline,
} from "../scripts/compat-baseline-lib.mjs";

const tempDirs = [];

function createCompatDir() {
  const compatDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "cloudbase-compat-baseline-"),
  );
  tempDirs.push(compatDir);
  buildCompatConfig({ outputDir: compatDir });
  return compatDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("compat baseline tiers", () => {
  test("machine config drift remains blocking", () => {
    const compatDir = createCompatDir();
    const manifest = buildCompatBaselineManifest(compatDir);

    const machineFile = path.join(compatDir, ".vscode", "settings.json");
    const original = fs.readFileSync(machineFile, "utf8");
    fs.writeFileSync(machineFile, `${original}\n// test drift\n`, "utf8");

    const result = compareCompatBaseline(manifest, compatDir);

    expect(result.hasBlockingDiff).toBe(true);
    expect(result.groups.machine.blockingChanged).toContain(
      ".vscode/settings.json",
    );
    expect(result.groups.textSurface.advisoryChanged).toHaveLength(0);
  });

  test("text surface content drift is advisory only", () => {
    const compatDir = createCompatDir();
    const manifest = buildCompatBaselineManifest(compatDir);

    const textFile = path.join(compatDir, ".cursor", "rules", "auth-web", "rule.mdc");
    fs.appendFileSync(textFile, "\n<!-- advisory drift -->\n", "utf8");

    const result = compareCompatBaseline(manifest, compatDir);

    expect(result.hasBlockingDiff).toBe(false);
    expect(result.hasAdvisoryDiff).toBe(true);
    expect(result.groups.textSurface.advisoryChanged).toContain(
      ".cursor/rules/auth-web/rule.mdc",
    );
  });

  test("text surface file loss is still blocking", () => {
    const compatDir = createCompatDir();
    const manifest = buildCompatBaselineManifest(compatDir);

    const textFile = path.join(compatDir, ".codebuddy", "skills", "auth-web", "SKILL.md");
    fs.rmSync(textFile);

    const result = compareCompatBaseline(manifest, compatDir);

    expect(result.hasBlockingDiff).toBe(true);
    expect(result.groups.textSurface.blockingMissing).toContain(
      ".codebuddy/skills/auth-web/SKILL.md",
    );
  });
});
