import { describe, expect, it } from "vitest";
import path from "path";
import os from "os";
import { validateAndNormalizePath } from "./cloudrun.js";
import { requireProjectRoot } from "../utils/project-config.js";

describe("validateAndNormalizePath", () => {
  it("accepts absolute paths outside MCP process cwd (CloudRun deploy/download)", () => {
    const outside = path.join(os.tmpdir(), "cloudrun-project-outside-cwd");
    // Absolute project path must not be rejected just because cwd differs
    // (lighthouse: MCP cwd ~/.codex vs targetPath ~/Desktop/... or /private/tmp/...).
    expect(validateAndNormalizePath(outside)).toBe(path.resolve(outside));
  });

  it("accepts absolute paths under cwd", () => {
    const inside = path.join(process.cwd(), "subdir-for-path-test");
    expect(validateAndNormalizePath(inside)).toBe(path.resolve(inside));
  });

  it("accepts relative paths that stay within the project root", () => {
    const root = requireProjectRoot();
    expect(validateAndNormalizePath(".")).toBe(path.resolve(root, "."));
    expect(validateAndNormalizePath("./local-cloudrun")).toBe(
      path.resolve(root, "./local-cloudrun"),
    );
  });

  it("rejects relative path-traversal escapes with absolute-path guidance", () => {
    expect(() => validateAndNormalizePath("../outside-project")).toThrow(
      /Path must be within current working directory|路径必须在当前工作目录内/,
    );
    expect(() => validateAndNormalizePath("../outside-project")).toThrow(
      /Allowed:|允许：/,
    );
    expect(() => validateAndNormalizePath("../outside-project")).toThrow(
      /absolute path to the project directory|项目目录的绝对路径/,
    );
  });
});
