import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPEN_WORLD_FILES = new Set(["rag.ts", "setup.ts"]);

function toolSources(): Array<{ file: string; source: string }> {
  return fs
    .readdirSync(TOOLS_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({
      file: name,
      source: fs.readFileSync(path.join(TOOLS_DIR, name), "utf8"),
    }));
}

function annotationBlocks(source: string): string[] {
  return source.match(/annotations:\s*\{[\s\S]*?\n\s*\}/g) ?? [];
}

describe("OpenAI hosted Scan tool annotations", () => {
  const sources = toolSources();

  it("openWorldHint: true 只出现在知识库检索和模板下载", () => {
    const offenders: string[] = [];
    for (const { file, source } of sources) {
      if (OPEN_WORLD_FILES.has(file)) {
        expect(source).toMatch(/openWorldHint:\s*true/);
        continue;
      }
      if (/openWorldHint:\s*true/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("每个字面 annotations 都带齐 readOnly / destructive / openWorld", () => {
    const missing: string[] = [];
    for (const { file, source } of sources) {
      for (const block of annotationBlocks(source)) {
        if (block.includes("...") && !/readOnlyHint:/.test(block)) {
          continue;
        }
        const hasRead = /readOnlyHint:\s*(true|false)/.test(block);
        const hasDestructive = /destructiveHint:\s*(true|false)/.test(block);
        const hasOpen = /openWorldHint:\s*(true|false)/.test(block);
        if (!hasRead || !hasDestructive || !hasOpen) {
          missing.push(`${file}: ${block.slice(0, 80).replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("readOnly 工具不得标 destructiveHint: true", () => {
    const bad: string[] = [];
    for (const { file, source } of sources) {
      for (const block of annotationBlocks(source)) {
        if (/readOnlyHint:\s*true/.test(block) && /destructiveHint:\s*true/.test(block)) {
          bad.push(file);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
