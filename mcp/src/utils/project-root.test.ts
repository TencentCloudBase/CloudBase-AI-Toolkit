import { delimiter } from "node:path";
import { homedir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRootError, resolveProjectRoot } from "./project-config.js";

const ENV_KEYS = [
  "WORKSPACE_FOLDER_PATHS",
  "PROJECT_ROOT",
  "GITHUB_WORKSPACE",
  "CI_PROJECT_DIR",
  "BUILD_SOURCESDIRECTORY",
] as const;

const saved: Record<string, string | undefined> = {};

function saveEnv(): void {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

describe("resolveProjectRoot", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("prefers an explicit path over workspace env vars", () => {
    saveEnv();
    const explicit = mkdtempSync(join(tmpdir(), "project-root-explicit-"));
    process.env.WORKSPACE_FOLDER_PATHS = join(homedir(), ".dsh", "profiles", "desktop");
    try {
      expect(resolveProjectRoot(explicit)).toBe(explicit);
    } finally {
      rmSync(explicit, { recursive: true, force: true });
    }
  });

  it("uses the first segment of WORKSPACE_FOLDER_PATHS before later env vars", () => {
    saveEnv();
    const first = mkdtempSync(join(tmpdir(), "project-root-first-"));
    const second = mkdtempSync(join(tmpdir(), "project-root-second-"));
    const github = mkdtempSync(join(tmpdir(), "project-root-github-"));
    process.env.WORKSPACE_FOLDER_PATHS = `${first}${delimiter}${second}`;
    process.env.GITHUB_WORKSPACE = github;
    try {
      expect(resolveProjectRoot()).toBe(first);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
      rmSync(github, { recursive: true, force: true });
    }
  });

  it("falls through to GITHUB_WORKSPACE when earlier vars are empty", () => {
    saveEnv();
    const github = mkdtempSync(join(tmpdir(), "project-root-github-only-"));
    delete process.env.WORKSPACE_FOLDER_PATHS;
    delete process.env.PROJECT_ROOT;
    process.env.GITHUB_WORKSPACE = github;
    process.env.CI_PROJECT_DIR = join(tmpdir(), "ignored-ci");
    try {
      expect(resolveProjectRoot()).toBe(github);
    } finally {
      rmSync(github, { recursive: true, force: true });
    }
  });

  it("refuses the DSH profile directory", () => {
    saveEnv();
    const hostDir = join(homedir(), ".dsh", "profiles", "desktop");
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.WORKSPACE_FOLDER_PATHS = hostDir;
    expect(() => resolveProjectRoot()).toThrow(ProjectRootError);
    try {
      resolveProjectRoot();
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRootError);
      expect((error as ProjectRootError).dir).toBe(hostDir);
    }
  });
});
