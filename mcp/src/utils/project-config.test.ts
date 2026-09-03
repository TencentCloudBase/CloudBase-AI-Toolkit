import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readProjectConfig, readProjectEnvId } from "./project-config.js";

function writeProjectConfig(dir: string, config: Record<string, unknown>) {
  mkdirSync(join(dir, ".cloudbase"), { recursive: true });
  writeFileSync(join(dir, ".cloudbase", "project.json"), JSON.stringify(config), "utf-8");
  return dir;
}

describe("readProjectConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cloudbase-project-config-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return undefined when .cloudbase/project.json does not exist", () => {
    expect(readProjectConfig(tempDir)).toBeUndefined();
  });

  it("should parse valid project config", () => {
    const dir = join(tempDir, "demo");
    mkdirSync(join(dir, ".cloudbase"), { recursive: true });
    writeFileSync(
      join(dir, ".cloudbase", "project.json"),
      JSON.stringify({ site: "intl", region: "ap-singapore", envId: "booker-ai-i0gygeljs622ffd23" }),
      "utf-8",
    );

    expect(readProjectConfig(dir)).toEqual({
      site: "intl",
      region: "ap-singapore",
      envId: "booker-ai-i0gygeljs622ffd23",
    });
  });

  it("should return undefined on malformed JSON without throwing", () => {
    const dir = join(tempDir, "broken");
    mkdirSync(join(dir, ".cloudbase"), { recursive: true });
    writeFileSync(join(dir, ".cloudbase", "project.json"), "{invalid", "utf-8");

    expect(readProjectConfig(dir)).toBeUndefined();
  });
});

describe("readProjectEnvId", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cloudbase-project-env-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should read the pinned envId of a domestic ap-singapore project", () => {
    const dir = writeProjectConfig(join(tempDir, "repo-a"), {
      site: "domestic",
      region: "ap-singapore",
      envId: "env-project-a",
    });

    expect(readProjectEnvId(dir)).toBe("env-project-a");
  });

  it("should share the same binding across git worktrees of one repository", () => {
    // worktree 里 .cloudbase/project.json 是同一份已提交文件，绑定天然跟随仓库
    const config = { site: "domestic", region: "ap-singapore", envId: "env-project-a" };
    const main = writeProjectConfig(join(tempDir, "repo-a"), config);
    const worktree = writeProjectConfig(join(tempDir, "repo-a-worktree-feature"), config);

    expect(readProjectEnvId(worktree)).toBe(readProjectEnvId(main));
  });

  it("should not leak bindings between unrelated repositories", () => {
    const repoA = writeProjectConfig(join(tempDir, "repo-a"), { envId: "env-project-a" });
    const repoB = writeProjectConfig(join(tempDir, "repo-b"), { envId: "env-project-b" });

    expect(readProjectEnvId(repoA)).toBe("env-project-a");
    expect(readProjectEnvId(repoB)).toBe("env-project-b");
    expect(readProjectEnvId(join(tempDir, "repo-c"))).toBeUndefined();
  });

  it("should ignore blank or non-string envId", () => {
    expect(readProjectEnvId(writeProjectConfig(join(tempDir, "blank"), { envId: "   " }))).toBeUndefined();
    expect(readProjectEnvId(writeProjectConfig(join(tempDir, "typed"), { envId: 42 }))).toBeUndefined();
    expect(readProjectEnvId(writeProjectConfig(join(tempDir, "region-only"), { region: "ap-singapore" }))).toBeUndefined();
  });

  it("should trim surrounding whitespace", () => {
    const dir = writeProjectConfig(join(tempDir, "padded"), { envId: " env-project-a\n" });
    expect(readProjectEnvId(dir)).toBe("env-project-a");
  });
});
