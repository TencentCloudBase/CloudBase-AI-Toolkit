import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readCloudbaseRcBinding,
  readProjectConfig,
  readProjectEnvId,
  writeProjectConfig as writeProjectConfigSource,
} from "./project-config.js";

function writeProjectConfig(dir: string, config: Record<string, unknown>) {
  mkdirSync(join(dir, ".cloudbase"), { recursive: true });
  writeFileSync(join(dir, ".cloudbase", "project.json"), JSON.stringify(config), "utf-8");
  return dir;
}

function writeCloudbaseRc(dir: string, config: Record<string, unknown>) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cloudbaserc.json"), JSON.stringify(config), "utf-8");
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

describe("readCloudbaseRcBinding", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cloudbase-rc-binding-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return undefined when cloudbaserc.json does not exist", () => {
    expect(readCloudbaseRcBinding(tempDir)).toBeUndefined();
  });

  it("should read literal envId and region", () => {
    const dir = writeCloudbaseRc(join(tempDir, "literal"), {
      envId: "env-rc-literal",
      region: "ap-shanghai",
    });

    expect(readCloudbaseRcBinding(dir)).toEqual({
      envId: "env-rc-literal",
      region: "ap-shanghai",
    });
  });

  it("should resolve {{env.X}} template from project .env", () => {
    const dir = writeCloudbaseRc(join(tempDir, "template"), { envId: "{{env.TCB_TEST_ENV_ID}}" });
    writeFileSync(join(dir, ".env"), "TCB_TEST_ENV_ID=env-from-dotenv\n", "utf-8");

    expect(readCloudbaseRcBinding(dir)?.envId).toBe("env-from-dotenv");
  });

  it("should prefer .env.local over .env for template resolution", () => {
    const dir = writeCloudbaseRc(join(tempDir, "local-overrides"), {
      envId: "{{env.TCB_TEST_ENV_ID}}",
    });
    writeFileSync(join(dir, ".env"), "TCB_TEST_ENV_ID=env-base\n", "utf-8");
    writeFileSync(join(dir, ".env.local"), "TCB_TEST_ENV_ID=env-local\n", "utf-8");

    expect(readCloudbaseRcBinding(dir)?.envId).toBe("env-local");
  });

  it("should skip {{private.X}} and unknown template syntax", () => {
    expect(
      readCloudbaseRcBinding(writeCloudbaseRc(join(tempDir, "private"), { envId: "{{private.ENV_ID}}" })),
    ).toBeUndefined();
    expect(
      readCloudbaseRcBinding(writeCloudbaseRc(join(tempDir, "unknown"), { envId: "{{deploy.envId}}" })),
    ).toBeUndefined();
  });

  it("should return undefined when the referenced .env key is missing", () => {
    const dir = writeCloudbaseRc(join(tempDir, "missing-key"), { envId: "{{env.NOT_PRESENT}}" });

    expect(readCloudbaseRcBinding(dir)?.envId).toBeUndefined();
  });

  it("should return undefined on malformed JSON without throwing", () => {
    const dir = join(tempDir, "broken");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cloudbaserc.json"), "{invalid", "utf-8");

    expect(readCloudbaseRcBinding(dir)).toBeUndefined();
  });

  it("should return raw site value for the MCP extension field", () => {
    const dir = writeCloudbaseRc(join(tempDir, "site"), { site: "intl" });

    expect(readCloudbaseRcBinding(dir)?.site).toBe("intl");
  });
});

describe("writeProjectConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cloudbase-write-config-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should merge patch into existing config without dropping fields", () => {
    const dir = join(tempDir, "merge");
    writeProjectConfig(dir, { envId: "env-keep", site: "intl", region: "ap-singapore" });

    expect(writeProjectConfigSource({ lang: "en" }, dir)).toBe(true);

    expect(readProjectConfig(dir)).toEqual({
      envId: "env-keep",
      site: "intl",
      region: "ap-singapore",
      lang: "en",
    });
  });

  it("should create the .cloudbase directory when missing", () => {
    const dir = join(tempDir, "no-dir");

    expect(writeProjectConfigSource({ envId: "env-fresh" }, dir)).toBe(true);
    expect(existsSync(join(dir, ".cloudbase", "project.json"))).toBe(true);
    expect(readProjectConfig(dir)?.envId).toBe("env-fresh");
  });

  it("should overwrite cleanly when existing JSON is malformed", () => {
    const dir = join(tempDir, "broken");
    mkdirSync(join(dir, ".cloudbase"), { recursive: true });
    writeFileSync(join(dir, ".cloudbase", "project.json"), "{invalid", "utf-8");

    expect(writeProjectConfigSource({ lang: "zh" }, dir)).toBe(true);
    expect(readProjectConfig(dir)).toEqual({ lang: "zh" });
  });

  it("should keep undefined patch fields from clobbering existing values", () => {
    const dir = join(tempDir, "undefined-patch");
    writeProjectConfig(dir, { envId: "env-keep" });

    expect(writeProjectConfigSource({ envId: undefined, lang: "en" }, dir)).toBe(true);

    const config = readProjectConfig(dir);
    expect(config?.envId).toBe("env-keep");
    expect(config?.lang).toBe("en");
  });

  it("should round-trip through readProjectConfig after writing", () => {
    const dir = join(tempDir, "round-trip");

    expect(writeProjectConfigSource({ site: "intl", region: "ap-singapore", lang: "en" }, dir)).toBe(true);

    expect(readProjectConfig(dir)).toEqual({
      site: "intl",
      region: "ap-singapore",
      lang: "en",
    });
  });
});

describe("readProjectEnvId fallback to cloudbaserc.json", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cloudbase-env-fallback-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should fall back to cloudbaserc.json envId when project.json is absent", () => {
    const dir = writeCloudbaseRc(join(tempDir, "rc-only"), { envId: "env-rc-only" });

    expect(readProjectEnvId(dir)).toBe("env-rc-only");
  });

  it("should let project.json envId win over cloudbaserc.json", () => {
    const dir = writeCloudbaseRc(join(tempDir, "both"), { envId: "env-rc" });
    writeProjectConfig(dir, { envId: "env-project" });

    expect(readProjectEnvId(dir)).toBe("env-project");
  });

  it("should fall back to cloudbaserc.json when project.json envId is blank", () => {
    const dir = writeCloudbaseRc(join(tempDir, "blank-project"), { envId: "env-rc" });
    writeProjectConfig(dir, { envId: "   " });

    expect(readProjectEnvId(dir)).toBe("env-rc");
  });

  it("should keep behavior unchanged when neither file defines envId", () => {
    const dir = writeCloudbaseRc(join(tempDir, "region-only"), { region: "ap-shanghai" });

    expect(readProjectEnvId(dir)).toBeUndefined();
  });
});
