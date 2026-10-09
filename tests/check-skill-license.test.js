import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  findLicenseFile,
  findMissingLicense,
  readLicense,
} from "../scripts/check-skill-license.mjs";

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

describe("findLicenseFile", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-license-file-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("finds a LICENSE file next to SKILL.md", () => {
    fs.writeFileSync(path.join(dir, "LICENSE"), "MIT License\n");
    expect(findLicenseFile(dir)).toBe("LICENSE");
  });

  test("accepts LICENCE.md and lowercase spellings", () => {
    fs.writeFileSync(path.join(dir, "licence.md"), "MIT\n");
    expect(findLicenseFile(dir)).toBe("licence.md");
  });

  test("does not accept a directory named LICENSE", () => {
    fs.mkdirSync(path.join(dir, "LICENSE"));
    expect(findLicenseFile(dir)).toBeNull();
  });

  test("returns null when the directory has no license file", () => {
    fs.writeFileSync(path.join(dir, "SKILL.md"), "# Demo\n");
    expect(findLicenseFile(dir)).toBeNull();
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

  function writeSkill(relativeDir, frontmatterLines, { licenseFile = true } = {}) {
    const dir = path.join(root, relativeDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      ["---", ...frontmatterLines, "---", "", "# Demo", ""].join("\n"),
    );
    if (licenseFile) {
      fs.writeFileSync(path.join(dir, "LICENSE"), "MIT License\n");
    }
  }

  test("passes when frontmatter and LICENSE file are both present", () => {
    writeSkill("config/source/skills/ok", ["name: ok", "version: 1.0.0", "license: MIT"]);
    expect(findMissingLicense(root)).toEqual([]);
  });

  test("reports an entry whose package root has no LICENSE file", () => {
    writeSkill(
      "config/source/skills/no-file",
      ["name: no-file", "version: 1.0.0", "license: MIT"],
      { licenseFile: false },
    );

    const problems = findMissingLicense(root);
    expect(problems).toHaveLength(1);
    expect(problems[0].file).toBe(path.join("config", "source", "skills", "no-file", "SKILL.md"));
    expect(problems[0].missing.join(" ")).toContain("LICENSE");
  });

  test("reports an entry whose frontmatter omits license", () => {
    writeSkill("config/source/skills/no-field", ["name: no-field", "version: 1.0.0"]);

    const problems = findMissingLicense(root);
    expect(problems).toHaveLength(1);
    expect(problems[0].missing.join(" ")).toContain("frontmatter");
  });

  test("reports both problems at once", () => {
    writeSkill(
      "config/source/skills/bare",
      ["name: bare", "version: 1.0.0"],
      { licenseFile: false },
    );

    const problems = findMissingLicense(root);
    expect(problems).toHaveLength(1);
    expect(problems[0].missing).toHaveLength(2);
  });

  test("covers nested entrypoints and the guideline entry", () => {
    writeSkill("config/source/skills/parent", ["name: parent", "version: 1.0.0", "license: MIT"]);
    writeSkill(
      "config/source/skills/parent/py",
      ["name: parent-py", "version: 1.0.0", "license: MIT"],
      { licenseFile: false },
    );
    writeSkill(
      "config/source/guideline/cloudbase",
      ["name: cloudbase", "version: 1.0.0", "license: MIT"],
    );

    const problems = findMissingLicense(root);
    expect(problems.map((problem) => problem.file)).toEqual([
      path.join("config", "source", "skills", "parent", "py", "SKILL.md"),
    ]);
  });
});
