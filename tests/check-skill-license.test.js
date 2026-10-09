import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { findMissingLicense, readLicense } from "../scripts/check-skill-license.mjs";

describe("readLicense", () => {
  test("reads the license value from frontmatter", () => {
    const raw = ["---", "name: demo", "version: 1.0.0", "license: MIT", "---", ""].join("\n");
    expect(readLicense(raw)).toBe("MIT");
  });

  test("returns null when the frontmatter omits license", () => {
    const raw = ["---", "name: demo", "version: 1.0.0", "---", ""].join("\n");
    expect(readLicense(raw)).toBeNull();
  });

  test("ignores a license-looking line outside the frontmatter", () => {
    const raw = [
      "---",
      "name: demo",
      "version: 1.0.0",
      "---",
      "",
      "license: MIT",
      "",
    ].join("\n");
    expect(readLicense(raw)).toBeNull();
  });

  test("returns null when there is no frontmatter at all", () => {
    expect(readLicense("# Demo\n\nlicense: MIT\n")).toBeNull();
  });

  test("tolerates CRLF frontmatter", () => {
    const raw = "---\r\nname: demo\r\nversion: 1.0.0\r\nlicense: Apache-2.0\r\n---\r\n";
    expect(readLicense(raw)).toBe("Apache-2.0");
  });
});

describe("findMissingLicense", () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-license-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeSkill(relativePath, frontmatterLines) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, ["---", ...frontmatterLines, "---", "", "# Demo", ""].join("\n"));
  }

  test("reports only the entries that omit license", () => {
    writeSkill(
      "config/source/skills/with-license/SKILL.md",
      ["name: with-license", "version: 1.0.0", "license: MIT"],
    );
    writeSkill(
      "config/source/skills/without-license/SKILL.md",
      ["name: without-license", "version: 1.0.0"],
    );
    // Nested entrypoints count too (cloudbase-agent/{py,ts}/skill.md).
    writeSkill(
      "config/source/skills/parent/py/skill.md",
      ["name: parent-py", "version: 1.0.0", "license: MIT"],
    );
    writeSkill(
      "config/source/guideline/cloudbase/SKILL.md",
      ["name: cloudbase", "version: 1.0.0", "license: MIT"],
    );

    expect(findMissingLicense(root)).toEqual([
      path.join("config", "source", "skills", "without-license", "SKILL.md"),
    ]);
  });

  test("flags the guideline entry as well", () => {
    writeSkill(
      "config/source/skills/only-skill/SKILL.md",
      ["name: only-skill", "version: 1.0.0", "license: MIT"],
    );
    writeSkill(
      "config/source/guideline/cloudbase/SKILL.md",
      ["name: cloudbase", "version: 1.0.0"],
    );

    expect(findMissingLicense(root)).toEqual([
      path.join("config", "source", "guideline", "cloudbase", "SKILL.md"),
    ]);
  });

  test("returns an empty list when every entry declares a license", () => {
    writeSkill(
      "config/source/skills/only-skill/SKILL.md",
      ["name: only-skill", "version: 1.0.0", "license: MIT"],
    );

    expect(findMissingLicense(root)).toEqual([]);
  });
});
