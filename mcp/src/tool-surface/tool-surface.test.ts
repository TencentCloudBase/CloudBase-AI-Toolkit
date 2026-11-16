/**
 * Tool surface guards: contract, schema shape, payload budget, constraint sentences.
 *
 * Baselines live in `mcp/tool-surface/`. Refresh them in the same PR that
 * intentionally changes the surface:
 *
 *   UPDATE_TOOL_SURFACE=1   npx vitest run src/tool-surface   # contract, samples, lint, budget
 *   UPDATE_TOOL_SURFACE_CONSTRAINTS=1 ...                     # constraint sentence list (rare)
 *   UPDATE_TOOL_SURFACE_SAMPLES=1 ...                         # argument acceptance (contract change)
 *
 *   TOOL_SURFACE_DUMP=/tmp/surface ...                         # also write raw tools/list per language
 *
 * A structural change to an input schema must also be declared in
 * `mcp/tool-surface/contract-allowed-diff.json` before the contract is refreshed;
 * the contract check refuses undeclared changes even in update mode.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizeObjectSchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import {
  budgetOf,
  constraintSentences,
  contractOf,
  diffPaths,
  lintSurface,
  readToolSurface,
  type BudgetMetrics,
  type ContractEntry,
  type Lang,
  type LintFinding,
  type ToolSurface,
} from "./surface.js";
import { samplesFor } from "./samples.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = path.resolve(__dirname, "../../tool-surface");
const UPDATE = process.env.UPDATE_TOOL_SURFACE === "1";
const UPDATE_CONSTRAINTS = process.env.UPDATE_TOOL_SURFACE_CONSTRAINTS === "1";
const UPDATE_SAMPLES = process.env.UPDATE_TOOL_SURFACE_SAMPLES === "1";
const BUDGET_TOLERANCE = 0.03;
const LANGS: Lang[] = ["zh", "en"];

function readJson<T>(file: string, fallback: T): T {
  const full = path.join(BASELINE_DIR, file);
  return fs.existsSync(full) ? (JSON.parse(fs.readFileSync(full, "utf8")) as T) : fallback;
}
function writeJson(file: string, value: unknown) {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  fs.writeFileSync(path.join(BASELINE_DIR, file), `${JSON.stringify(value, null, 2)}\n`);
}

interface AllowedDiff {
  tool: string;
  path: string;
  reason: string;
}

const surfaces = {} as Record<Lang, ToolSurface>;

beforeAll(async () => {
  for (const lang of LANGS) surfaces[lang] = await readToolSurface(lang);
  // TOOL_SURFACE_DUMP=<dir> writes the raw tools/list per language for review.
  const dumpDir = process.env.TOOL_SURFACE_DUMP;
  if (dumpDir) {
    fs.mkdirSync(dumpDir, { recursive: true });
    for (const lang of LANGS) {
      fs.writeFileSync(path.join(dumpDir, `tools-${lang}.json`), `${JSON.stringify(surfaces[lang].tools, null, 2)}\n`);
    }
  }
}, 120_000);

describe("tool surface contract", () => {
  it("names, order, annotations and schema structure match the baseline", () => {
    const current = contractOf(surfaces.zh.tools);
    // Structure must not depend on the instance language.
    expect(contractOf(surfaces.en.tools)).toEqual(current);

    const baseline = readJson<ContractEntry[] | null>("contract.json", null);
    const allowed = readJson<AllowedDiff[]>("contract-allowed-diff.json", []);
    if (baseline) {
      expect(current.map((t) => t.name), "tool names / order changed").toEqual(baseline.map((t) => t.name));
      const byName = new Map(baseline.map((t) => [t.name, t]));
      const undeclared: string[] = [];
      for (const tool of current) {
        const before = byName.get(tool.name)!;
        for (const p of diffPaths(before.annotations, tool.annotations)) undeclared.push(`${tool.name} annotations${p}`);
        for (const p of diffPaths(before.inputSchema, tool.inputSchema)) {
          const ok = allowed.some((a) => a.tool === tool.name && (p === a.path || p.startsWith(`${a.path}/`)));
          if (!ok) undeclared.push(`${tool.name} inputSchema${p}`);
        }
      }
      expect(undeclared, "undeclared contract changes (declare them in contract-allowed-diff.json)").toEqual([]);
    }
    if (UPDATE || !baseline) writeJson("contract.json", current);
  });

  it("accepts and rejects the same argument samples as the baseline", () => {
    const outcomes: Record<string, Record<string, boolean>> = {};
    for (const tool of surfaces.zh.tools) {
      const zod = normalizeObjectSchema(surfaces.zh.zodSchemas.get(tool.name) as never) as
        | { safeParse: (v: unknown) => { success: boolean } }
        | undefined;
      expect(zod, `${tool.name} has no object input schema`).toBeDefined();
      outcomes[tool.name] = {};
      for (const sample of samplesFor(tool.inputSchema)) {
        outcomes[tool.name][sample.label] = zod!.safeParse(sample.args).success;
      }
    }
    const baseline = readJson<typeof outcomes | null>("samples.json", null);
    if (baseline && !UPDATE_SAMPLES) {
      const changed: string[] = [];
      for (const [tool, results] of Object.entries(baseline)) {
        for (const [label, accepted] of Object.entries(results)) {
          const now = outcomes[tool]?.[label];
          if (now === undefined) changed.push(`${tool} ${label}: sample disappeared`);
          else if (now !== accepted) changed.push(`${tool} ${label}: ${accepted ? "accepted" : "rejected"} -> ${now ? "accepted" : "rejected"}`);
        }
      }
      expect(changed, "argument acceptance changed").toEqual([]);
    }
    if (UPDATE || !baseline) writeJson("samples.json", outcomes);
  });
});

describe("tool schema lint", () => {
  it("every input schema root is a plain object (MCP Tool.inputSchema)", () => {
    for (const tool of surfaces.zh.tools) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
    }
  });

  it("findings only go down", () => {
    const findings = lintSurface(surfaces.zh.tools);
    const key = (f: LintFinding) => `${f.category} ${f.tool} ${f.path}`;
    const current = [...new Set(findings.map(key))].sort();
    const baseline = readJson<{ findings: string[] } | null>("lint.json", null);
    if (baseline && !UPDATE) {
      const known = new Set(baseline.findings);
      const added = findings.filter((f) => !known.has(key(f))).map((f) => `${key(f)} - ${f.detail}`);
      expect(added, "new schema lint findings").toEqual([]);
    }
    if (UPDATE || !baseline) {
      const counts: Record<string, number> = {};
      for (const k of current) counts[k[0]] = (counts[k[0]] ?? 0) + 1;
      writeJson("lint.json", { counts, findings: current });
    }
  });
});

describe("tool payload budget", () => {
  it(`does not grow more than ${BUDGET_TOLERANCE * 100}% over the baseline`, () => {
    const current = Object.fromEntries(LANGS.map((l) => [l, budgetOf(surfaces[l])])) as Record<Lang, BudgetMetrics>;
    const baseline = readJson<Record<Lang, BudgetMetrics> | null>("budget.json", null);
    if (baseline && !UPDATE) {
      const over: string[] = [];
      for (const lang of LANGS) {
        for (const metric of ["wireBytes", "toolDescriptionChars", "paramDescriptionChars"] as const) {
          const before = baseline[lang][metric];
          const now = current[lang][metric];
          if (now > before * (1 + BUDGET_TOLERANCE)) {
            const growth = Object.entries(current[lang].perTool)
              .map(([name, m]) => [name, m.bytes - (baseline[lang].perTool[name]?.bytes ?? 0)] as const)
              .filter(([, d]) => d > 0)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([name, d]) => `${name} +${d}B`)
              .join(", ");
            over.push(`${lang} ${metric}: ${before} -> ${now} (${growth})`);
          }
        }
      }
      expect(over, "tool payload grew; refresh with UPDATE_TOOL_SURFACE=1 if intended").toEqual([]);
    }
    if (UPDATE || !baseline) writeJson("budget.json", current);
  });
});

describe("tool description constraint sentences", () => {
  it("every recorded constraint sentence is still present verbatim in its tool description", () => {
    const current: Record<Lang, Record<string, string[]>> = { zh: {}, en: {} };
    for (const lang of LANGS) {
      for (const tool of surfaces[lang].tools) {
        const sentences = constraintSentences(tool.description ?? "");
        if (sentences.length) current[lang][tool.name] = sentences;
      }
    }
    const baseline = readJson<typeof current | null>("constraints.json", null);
    if (baseline && !UPDATE_CONSTRAINTS) {
      const missing: string[] = [];
      for (const lang of LANGS) {
        const byName = new Map(surfaces[lang].tools.map((t) => [t.name, t.description ?? ""]));
        for (const [tool, sentences] of Object.entries(baseline[lang] ?? {})) {
          const description = byName.get(tool);
          for (const sentence of sentences) {
            if (description === undefined || !description.includes(sentence)) missing.push(`${lang} ${tool}: ${sentence}`);
          }
        }
      }
      expect(missing, "constraint sentences removed or reworded").toEqual([]);
    }
    if (UPDATE_CONSTRAINTS || !baseline) writeJson("constraints.json", current);
  });
});
