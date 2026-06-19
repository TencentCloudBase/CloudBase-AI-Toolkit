import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after mocks
const { publishToSkillhub } = await import("../scripts/publish-to-skillhub.mjs");

function createTempManifest(targets) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-test-"));
  const outputDir = path.join(tmpDir, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  const manifestTargets = targets.map((t) => {
    const artifactRootDir = path.join(outputDir, t.key);
    const artifactDir = path.join(artifactRootDir, "skills", t.slug);
    fs.mkdirSync(artifactDir, { recursive: true });

    // Create SKILL.md
    const skillContent = [
      "---",
      `name: ${t.name || t.slug}`,
      `description: ${t.description || "Test description"}`,
      `version: ${t.version || "1.0.0"}`,
      "---",
      "",
      `# ${t.name || t.slug}`,
      "",
      "Test content",
    ].join("\n");
    fs.writeFileSync(path.join(artifactDir, "SKILL.md"), skillContent, "utf8");

    // Create an extra file
    if (t.extraFiles) {
      for (const extraFile of t.extraFiles) {
        const filePath = path.join(artifactDir, extraFile);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `content for ${extraFile}`, "utf8");
      }
    }

    return {
      targetKey: t.key,
      registrySlug: t.slug,
      artifactRootDir,
      artifactDir,
    };
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    outputDir,
    targets: manifestTargets,
  };

  const manifestPath = path.join(tmpDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return { tmpDir, manifestPath, manifest };
}

describe("publishToSkillhub", () => {
  let envBackup;

  beforeEach(() => {
    envBackup = { ...process.env };
    process.env.SKILLHUB_ORG_ID = "17";
    process.env.SKILLHUB_API_TOKEN = "skt-ent-test-token";
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = envBackup;
    vi.restoreAllMocks();
  });

  it("should throw if manifest file does not exist", async () => {
    await expect(
      publishToSkillhub({ manifestPath: "/nonexistent/manifest.json" }),
    ).rejects.toThrow("未找到 manifest 文件");
  });

  it("should throw if SKILLHUB_API_TOKEN is missing in non-dry-run mode", async () => {
    delete process.env.SKILLHUB_API_TOKEN;
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "test-skill", slug: "test-skill", version: "1.0.0" },
    ]);

    await expect(
      publishToSkillhub({ manifestPath }),
    ).rejects.toThrow("SKILLHUB_API_TOKEN");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should throw if SKILLHUB_ORG_ID is missing in non-dry-run mode", async () => {
    delete process.env.SKILLHUB_ORG_ID;
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "test-skill", slug: "test-skill", version: "1.0.0" },
    ]);

    await expect(
      publishToSkillhub({ manifestPath }),
    ).rejects.toThrow("SKILLHUB_ORG_ID");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return dry-run results without calling fetch", async () => {
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "test-skill", slug: "test-skill", version: "1.0.0" },
    ]);

    const results = await publishToSkillhub({ manifestPath, dryRun: true });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("dry-run");
    expect(results[0].version).toBe("1.1.0");
    expect(results[0].slug).toBe("test-skill");
    expect(results[0].fileCount).toBe(1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should compute correct version with minor bump", async () => {
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "test-skill", slug: "test-skill", version: "2.3.1" },
    ]);

    const results = await publishToSkillhub({ manifestPath, dryRun: true });
    expect(results[0].version).toBe("2.4.0");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should compute correct version with major bump", async () => {
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "test-skill", slug: "test-skill", version: "2.3.1" },
    ]);

    const results = await publishToSkillhub({
      manifestPath,
      dryRun: true,
      bump: "major",
    });
    expect(results[0].version).toBe("3.0.0");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should compute correct version with patch bump", async () => {
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "test-skill", slug: "test-skill", version: "2.3.1" },
    ]);

    const results = await publishToSkillhub({
      manifestPath,
      dryRun: true,
      bump: "patch",
    });
    expect(results[0].version).toBe("2.3.2");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should start from 1.0.0 if SKILL.md has no version", async () => {
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "test-skill", slug: "test-skill", version: "invalid" },
    ]);

    const results = await publishToSkillhub({ manifestPath, dryRun: true });
    expect(results[0].version).toBe("1.0.0");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should collect all files from artifact directory", async () => {
    const { manifestPath, tmpDir } = createTempManifest([
      {
        key: "test-skill",
        slug: "test-skill",
        version: "1.0.0",
        extraFiles: ["extra.md", "references/sub.md"],
      },
    ]);

    const results = await publishToSkillhub({ manifestPath, dryRun: true });
    expect(results[0].fileCount).toBe(3); // SKILL.md + extra.md + references/sub.md

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should call SkillHub API and return published result", async () => {
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "test-skill", slug: "test-skill", version: "1.0.0" },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          ok: true,
          version: "1.1.0",
          versionId: 123,
          slug: "test-skill",
          reviewStatus: "pending",
        }),
    });

    const results = await publishToSkillhub({ manifestPath });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("published");
    expect(results[0].version).toBe("1.1.0");
    expect(results[0].versionId).toBe(123);

    // Verify fetch was called correctly
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.skillhub.cn/api/v1/orgs/17/skills/test-skill/versions");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer skt-ent-test-token");
    expect(options.headers["Content-Type"]).toContain("multipart/form-data");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should handle 409 conflict gracefully (skip without error)", async () => {
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "test-skill", slug: "test-skill", version: "1.0.0" },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: "Conflict",
      text: async () => JSON.stringify({ error: "已有版本审核中" }),
    });

    const results = await publishToSkillhub({ manifestPath });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("skipped");
    expect(results[0].reason).toContain("版本审核中");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should publish multiple targets", async () => {
    const { manifestPath, tmpDir } = createTempManifest([
      { key: "skill-a", slug: "skill-a", version: "1.0.0" },
      { key: "skill-b", slug: "skill-b", version: "2.0.0" },
    ]);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          ok: true,
          version: "1.1.0",
          versionId: 999,
          reviewStatus: "pending",
        }),
    });

    const results = await publishToSkillhub({ manifestPath });

    expect(results).toHaveLength(2);
    expect(results[0].slug).toBe("skill-a");
    expect(results[1].slug).toBe("skill-b");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
