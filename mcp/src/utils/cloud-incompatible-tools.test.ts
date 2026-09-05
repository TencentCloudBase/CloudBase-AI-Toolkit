import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS,
  CLOUD_INCOMPATIBLE_TOOLS,
} from "./cloud-mode.js";

/**
 * Guard against the cloud-mode gate list rotting when tools are renamed or turned
 * into sub-actions. Every entry in CLOUD_INCOMPATIBLE_TOOLS must be either:
 *   1. a currently registered top-level tool (present in scripts/tools.json), or
 *   2. a documented action-level exception whose cloud gating lives inside the
 *      owning tool (functions.ts / storage / setup flows).
 *
 * Rationale: historically the IDE tool whitelist and this gate list accumulated
 * dead entries (createFunction/updateFunctionCode became manageFunctions actions)
 * that silently gated nothing. tools.json is the canonical registered-tool list.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// mcp/src/utils -> repo root
const TOOLS_JSON_PATH = path.resolve(__dirname, "../../../scripts/tools.json");

function loadRegisteredToolNames(): Set<string> {
  const raw = fs.readFileSync(TOOLS_JSON_PATH, "utf-8");
  const parsed = JSON.parse(raw) as { tools?: Array<{ name?: string }> };
  const names = (parsed.tools ?? [])
    .map((t) => t.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  return new Set(names);
}

describe("cloud-incompatible tools gate stays in sync with registered tools", () => {
  const registered = loadRegisteredToolNames();
  const exceptions = new Set<string>(CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS);

  it("has a non-trivial registered tool list to validate against", () => {
    expect(registered.size).toBeGreaterThan(0);
  });

  it("every gated tool is either a registered top-level tool or a documented exception", () => {
    const orphans = CLOUD_INCOMPATIBLE_TOOLS.filter(
      (name) => !registered.has(name) && !exceptions.has(name),
    );
    expect(
      orphans,
      `These gated tools no longer match a registered tool name and are not documented ` +
        `action-level exceptions. Either remove them from CLOUD_INCOMPATIBLE_TOOLS or add ` +
        `them to CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  it("declared action-level exceptions are genuinely not top-level tools", () => {
    // If an "exception" is actually a registered top-level tool, it should be
    // validated as such, not hidden behind the exception allowlist.
    const misclassified = CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS.filter((name) =>
      registered.has(name),
    );
    expect(
      misclassified,
      `These names are declared as action-level exceptions but ARE registered top-level ` +
        `tools; drop them from CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS: ${misclassified.join(", ")}`,
    ).toEqual([]);
  });

  it("gates the declarative deploy tools in cloud mode", () => {
    // deployApply/deployPlan read a local cloudbaserc from cwd; they must be gated.
    expect(CLOUD_INCOMPATIBLE_TOOLS).toContain("deployApply");
    expect(CLOUD_INCOMPATIBLE_TOOLS).toContain("deployPlan");
  });
});
