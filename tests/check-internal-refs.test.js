import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, test } from "vitest";
import {
  TEXT_RULES,
  TITLE_RULES,
  collectCommits,
  collectTrackedFiles,
  isScannableFile,
  parseArgs,
  runCheck,
  scanFileText,
  scanText,
} from "../scripts/check-internal-refs.mjs";

// 内网串不能以字面量写在这个文件里 —— 仓库自己的文件内容扫描会命中它。
const INTERNAL_HOST = ["tst", "woa", "com"].join(".");
const INTERNAL_IP = ["9", "138", "237", "216"].join(".");

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function silentRun(options) {
  const lines = [];
  const result = runCheck({ ...options, log: (line) => lines.push(String(line)) });
  return { ...result, output: lines.join("\n") };
}

function createRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudbase-internal-refs-"));
  tempDirs.push(dir);
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });

  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  fs.writeFileSync(path.join(dir, "README.md"), "hello\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "docs: initial commit");

  return { dir, git };
}

function commit(dir, message) {
  fs.writeFileSync(path.join(dir, "README.md"), `${Math.random()}\n`);
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-F", "-"], { cwd: dir, input: message });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
}

describe("scanText", () => {
  test("flags an internal task marker", () => {
    const findings = scanText("see ato-task:07caf487-8d25-4558-8f9e-8d2ca5d00072", TEXT_RULES);
    expect(findings.map((f) => f.label)).toEqual(["internal task marker"]);
  });

  test("flags an internal task reference and review round", () => {
    expect(scanText("ATO task cfdcf61a", TEXT_RULES).map((f) => f.label)).toEqual([
      "internal task reference",
    ]);
    expect(scanText("GEL round39 was reverted", TEXT_RULES).map((f) => f.label)).toEqual([
      "internal review round",
    ]);
    expect(scanText("GEL r39", TEXT_RULES).map((f) => f.label)).toEqual([
      "internal review round",
    ]);
  });

  test("flags an internal worktree path", () => {
    const findings = scanText("merge worktree: /Users/x/.ato/worktrees/abc", TEXT_RULES);
    expect(findings.map((f) => f.label).sort()).toEqual([
      "internal worktree path",
      "local home path",
    ]);
  });

  test("flags a real home path", () => {
    const findings = scanText("see /Users/bookerzhao/Projects/demo/README.md", TEXT_RULES);
    expect(findings.map((f) => f.label)).toEqual(["local home path"]);
  });

  test("does not flag placeholder home paths", () => {
    for (const text of [
      "the path is /Users/.../.claude/skills/x/SKILL.md",
      "example: /Users/xxx/project",
      "example: /Users/user/project",
      "example: /Users/yourname/work",
    ]) {
      expect(scanText(text, TEXT_RULES), text).toEqual([]);
    }
  });

  test("returns nothing for empty input", () => {
    expect(scanText("", TEXT_RULES)).toEqual([]);
    expect(scanText(undefined, TEXT_RULES)).toEqual([]);
  });
});

describe("scanText title rules", () => {
  test("flags a bare 8-char id in parentheses", () => {
    expect(scanText("fix(x): y (07caf487)", TITLE_RULES).map((f) => f.label)).toEqual([
      "bare id in parentheses",
    ]);
  });

  test("flags a long sha in parentheses", () => {
    const sha = "a".repeat(40);
    expect(scanText(`feat: thing (${sha})`, TITLE_RULES)).toHaveLength(1);
  });

  test("ignores short words and prose in parentheses", () => {
    for (const text of ["feat: thing (wip)", "feat: thing (see #1234)", "feat: thing (0a1b2c)"]) {
      expect(scanText(text, TITLE_RULES), text).toEqual([]);
    }
  });

  test("does not treat a bare hex inside a word as a title id", () => {
    expect(scanText("prefix(deadbeef)suffix", TITLE_RULES)).toEqual([]);
  });
});

describe("runCheck over commits", () => {
  test("passes for a clean branch", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();
    commit(dir, "fix(cloudrun): accept absolute targetPath\n\nAbsolute paths pass through.\n");

    const result = silentRun({ base, cwd: dir });
    expect(result.status).toBe("ok");
    expect(result.output).toContain("OK: no internal references");
  });

  test("fails when a commit headline carries a task id", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();
    commit(dir, "fix(cloudrun): 🐛 accept absolute targetPath (cfdcf61a)\n");

    const result = silentRun({ base, cwd: dir });
    expect(result.status).toBe("failed");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].label).toBe("bare id in parentheses");
    expect(result.output).toContain("--amend");
  });

  test("fails when a commit body carries an ato-task line", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();
    commit(dir, "feat: add thing\n\nato-task:07caf487-8d25-4558-8f9e-8d2ca5d00072\n");

    const result = silentRun({ base, cwd: dir });
    expect(result.status).toBe("failed");
    expect(result.findings.map((f) => f.label)).toEqual(["internal task marker"]);
  });

  test("does not flag a bare hex reference in a commit body", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();
    commit(dir, "fix: thing\n\nMatches (d533948b) semantics from the earlier attempt.\n");

    const result = silentRun({ base, cwd: dir });
    expect(result.status).toBe("ok");
  });

  test("fails when the PR title carries a task id", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();

    const result = silentRun({
      base,
      cwd: dir,
      prTitle: "feat(mcp): expose createLogService (07caf487)",
    });
    expect(result.status).toBe("failed");
    expect(result.findings[0].source).toBe("PR title");
  });

  test("fails when the PR body cites the internal tracker", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();

    const result = silentRun({
      base,
      cwd: dir,
      prBody: "- ATO task `cfdcf61a`: GEL round39 — the fix was never merged.",
    });
    expect(result.status).toBe("failed");
    expect(result.findings.map((f) => f.label).sort()).toEqual([
      "internal review round",
      "internal task reference",
    ]);
    expect(result.findings.every((f) => f.source === "PR body")).toBe(true);
  });

  test("skips without failing when no base is available", () => {
    const { dir } = createRepo();
    const result = silentRun({ base: "", cwd: dir });
    expect(result.status).toBe("skipped");
    expect(result.output).toContain("does not apply");
  });

  test("skips when the base revision is the all-zero push placeholder", () => {
    const { dir } = createRepo();
    const result = silentRun({ base: "0".repeat(40), cwd: dir });
    expect(result.status).toBe("skipped");
  });

  test("skips when the base revision cannot be resolved", () => {
    const { dir } = createRepo();
    const result = silentRun({ base: "does-not-exist", cwd: dir });
    expect(result.status).toBe("skipped");
  });

  test("skips and exits 0 on an empty repository range", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();
    const result = silentRun({ base, cwd: dir });
    expect(result.status).toBe("ok");
    expect(collectCommits({ base, cwd: dir })).toEqual([]);
  });
});

describe("runCheck over tracked files", () => {
  test("fails when a committed file names an internal host", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();
    fs.writeFileSync(path.join(dir, "NOTES.md"), `- see http://${INTERNAL_HOST}/flag.html\n`);
    git("add", "NOTES.md");
    git("commit", "-q", "-m", "docs: add integration notes");

    const result = silentRun({ base, cwd: dir });
    expect(result.status).toBe("failed");
    expect(result.findings.map((f) => f.label)).toEqual(["internal hostname"]);
    expect(result.findings[0].source).toBe("NOTES.md:1");
  });

  test("points at the right line of a multi-line file", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();
    fs.writeFileSync(
      path.join(dir, "NOTES.md"),
      `# Notes\n\nNothing to see.\n\nhttp://${INTERNAL_IP}/flag.html\n`,
    );
    git("add", "NOTES.md");
    git("commit", "-q", "-m", "docs: add notes");

    const result = silentRun({ base, cwd: dir });
    expect(result.findings[0].source).toBe("NOTES.md:5");
    expect(result.output).toContain("NOTES.md:5");
  });

  test("passes when neither metadata nor files carry internal references", () => {
    const { dir, git } = createRepo();
    const base = git("rev-parse", "HEAD").trim();
    commit(dir, "fix(cloudrun): 🐛 accept absolute targetPath\n");

    const result = silentRun({ base, cwd: dir });
    expect(result.status).toBe("ok");
    expect(result.output).toContain("tracked files");
  });
});

describe("scanFileText", () => {
  test("flags an internal hostname", () => {
    const findings = scanFileText(`- Test domains: \`http://${INTERNAL_HOST}/flag.html\``);
    expect(findings).toHaveLength(1);
    expect(findings[0].label).toBe("internal hostname");
    expect(findings[0].line).toBe(1);
  });

  test("flags an internal network address", () => {
    const findings = scanFileText(`- Test IPs: \`http://${INTERNAL_IP}/flag.html\``);
    expect(findings.map((f) => f.label)).toEqual(["internal network address"]);
  });

  test("reports the line number of the offending line", () => {
    const findings = scanFileText(`first\nsecond\nsee http://${INTERNAL_HOST}/\n`);
    expect(findings.map((f) => f.line)).toEqual([3]);
  });

  test("leaves public hosts, private ranges and version strings alone", () => {
    for (const text of [
      "https://cloud.tencent.com/document/api/243/",
      "http://localhost:3000/dev",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.1/flag.html",
      "http://192.168.1.1/flag.html",
      "bumped to v9.1.2.3",
    ]) {
      expect(scanFileText(text), text).toEqual([]);
    }
  });
});

describe("file selection", () => {
  test("skips dependency and generated directories at any depth", () => {
    for (const rel of [
      "node_modules/pkg/README.md",
      "mcp/dist/cli.cjs",
      "coverage/lcov.info",
      ".generated/compat/x.json",
      ".git/config",
    ]) {
      expect(isScannableFile(rel), rel).toBe(false);
    }
  });

  test("keeps ordinary tracked files", () => {
    for (const rel of ["README.md", "skills/a/SKILL.md", "mcp/src/server.ts"]) {
      expect(isScannableFile(rel), rel).toBe(true);
    }
  });

  test("lists tracked files and drops the excluded ones", () => {
    const { dir, git } = createRepo();
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "README.md"), "vendored\n");
    fs.writeFileSync(path.join(dir, "NOTES.md"), "notes\n");
    git("add", "-f", "NOTES.md", "node_modules/pkg/README.md");
    git("commit", "-q", "-m", "docs: add notes");

    const files = collectTrackedFiles({ cwd: dir });
    expect(files).toContain("NOTES.md");
    expect(files).toContain("README.md");
    expect(files).not.toContain("node_modules/pkg/README.md");
  });
});

describe("parseArgs", () => {
  test("parses base and cwd", () => {
    expect(parseArgs(["--base", "origin/main", "--cwd", "/tmp/x"])).toEqual({
      base: "origin/main",
      cwd: "/tmp/x",
    });
  });

  test("ignores unrelated arguments", () => {
    expect(parseArgs(["--verbose"])).toEqual({});
  });

  test("throws when a value is missing", () => {
    expect(() => parseArgs(["--base"])).toThrow(/requires a value/);
    expect(() => parseArgs(["--base", "--cwd"])).toThrow(/requires a value/);
  });
});
