/**
 * Tool surface snapshot helpers.
 *
 * The tool surface is what every MCP client receives from `tools/list`: tool
 * names, descriptions and input schemas. These helpers read it exactly as it
 * goes over the wire (in-memory transport, default plugins) so the checks in
 * `tool-surface.test.ts` can guard four properties independently:
 *
 *   1. contract  - names, order, annotations and the structure of every input
 *                  schema (everything except `description` text) stay fixed
 *   2. lint      - schema shape rules (MCP root object, enums for fixed values,
 *                  no duplicated subtrees, ...) only improve over time
 *   3. budget    - payload size does not grow silently
 *   4. rules     - constraint sentences in tool descriptions are never dropped
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCloudBaseMcpServer } from "../server.js";

export type Lang = "zh" | "en";

export interface WireTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolSurface {
  tools: WireTool[];
  /** UTF-8 byte length of the `tools` array exactly as serialized on the wire. */
  wireBytes: number;
  /** Zod input schemas keyed by tool name (as registered on the server). */
  zodSchemas: Map<string, unknown>;
}

export async function readToolSurface(lang: Lang): Promise<ToolSurface> {
  const server = await createCloudBaseMcpServer({
    name: "cloudbase-mcp",
    lang,
    enableTelemetry: false,
    cloudBaseOptions: { envId: "surface-env", secretId: "surface-id", secretKey: "surface-key" },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  let rawTools: WireTool[] | undefined;
  const forward = clientTransport.onmessage;
  clientTransport.onmessage = (message) => {
    const result = (message as { result?: { tools?: WireTool[] } }).result;
    if (result && Array.isArray(result.tools)) rawTools = result.tools;
    forward?.(message);
  };
  const client = new Client({ name: "tool-surface", version: "1.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  // Re-hook after connect: Client.connect installs its own onmessage.
  const sdkHandler = clientTransport.onmessage;
  clientTransport.onmessage = (message, extra) => {
    const result = (message as { result?: { tools?: WireTool[] } }).result;
    if (result && Array.isArray(result.tools)) rawTools = result.tools;
    sdkHandler?.(message, extra);
  };
  try {
    await client.listTools();
  } finally {
    await client.close();
  }
  if (!rawTools) throw new Error("tools/list response was not observed on the wire");
  const registered = (server as unknown as { _registeredTools?: Record<string, { inputSchema?: unknown }> })
    ._registeredTools ?? {};
  const zodSchemas = new Map<string, unknown>();
  for (const [name, tool] of Object.entries(registered)) zodSchemas.set(name, tool.inputSchema);
  return { tools: rawTools, wireBytes: Buffer.byteLength(JSON.stringify(rawTools)), zodSchemas };
}

// ---------------------------------------------------------------------------
// contract
// ---------------------------------------------------------------------------

/** Deep copy of a JSON schema with every `description` key removed. */
export function structuralProjection(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(structuralProjection);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "description" && typeof value === "string") continue;
    out[key] = structuralProjection(value);
  }
  return out;
}

export interface ContractEntry {
  name: string;
  annotations: unknown;
  inputSchema: unknown;
}

export function contractOf(tools: WireTool[]): ContractEntry[] {
  return tools.map((tool) => ({
    name: tool.name,
    annotations: tool.annotations ?? null,
    inputSchema: structuralProjection(tool.inputSchema),
  }));
}

/** JSON-pointer-like paths where two values differ (objects compared key by key). */
export function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const isObj = (v: unknown) => v && typeof v === "object" && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    return [...keys].flatMap((k) =>
      diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}/${k}`),
    );
  }
  return [path || "/"];
}

// ---------------------------------------------------------------------------
// description metrics and constraint sentences
// ---------------------------------------------------------------------------

export function collectParamDescriptions(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectParamDescriptions(n, out));
  } else if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.description === "string") out.push(rec.description);
    for (const value of Object.values(rec)) collectParamDescriptions(value, out);
  }
  return out;
}

export interface BudgetMetrics {
  tools: number;
  wireBytes: number;
  toolDescriptionChars: number;
  paramDescriptionChars: number;
  perTool: Record<string, { bytes: number; toolDescriptionChars: number; paramDescriptionChars: number }>;
}

export function budgetOf(surface: ToolSurface): BudgetMetrics {
  const perTool: BudgetMetrics["perTool"] = {};
  let toolDescriptionChars = 0;
  let paramDescriptionChars = 0;
  for (const tool of surface.tools) {
    const t = (tool.description ?? "").length;
    const p = collectParamDescriptions(tool.inputSchema).reduce((n, d) => n + d.length, 0);
    toolDescriptionChars += t;
    paramDescriptionChars += p;
    perTool[tool.name] = { bytes: Buffer.byteLength(JSON.stringify(tool)), toolDescriptionChars: t, paramDescriptionChars: p };
  }
  return { tools: surface.tools.length, wireBytes: surface.wireBytes, toolDescriptionChars, paramDescriptionChars, perTool };
}

/**
 * Sentences that tell the model what it must / must not do. They are the part
 * of a description that model behaviour depends on most, so they are locked:
 * a description may be reorganised freely, but every one of these sentences
 * must stay verbatim in the tool-level description.
 */
const CONSTRAINT_PATTERN =
  /禁止|不要|不得|勿|必须|务必|不能|不可|不应|不支持|改用|请用|请改|优先|仅限|仅用于|只能|不适用|不涉及|拒绝|⚠️|confirm|危险|不可恢复|反复重试|轮询|\bdo not\b|\bdon't\b|\bnever\b|\bmust\b|\binstead\b|\bavoid\b|\bcannot\b|\bcan't\b|\bnot supported\b|\breject|\brefuse/i;

/**
 * Clause-level split: Chinese full stops and semicolons, English sentence ends
 * and semicolons, and line breaks. Locking at clause granularity keeps the
 * constraint itself fixed while leaving surrounding explanatory text editable.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。；！？\n])|(?<=[.;!?])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function constraintSentences(description: string): string[] {
  return splitSentences(description).filter((s) => CONSTRAINT_PATTERN.test(s));
}

// ---------------------------------------------------------------------------
// schema lint
// ---------------------------------------------------------------------------

export type LintCategory = "A" | "B" | "C" | "D" | "E" | "F";
export interface LintFinding {
  category: LintCategory;
  tool: string;
  path: string;
  detail: string;
}

export const LONG_PARAM_DESCRIPTION = 300;
const ROOT_FORBIDDEN = ["oneOf", "anyOf", "allOf", "not", "if", "then", "else"];
const DIALECT_SENSITIVE = ["$ref", "$defs", "definitions", "dependencies", "$recursiveRef", "$dynamicRef"];

function isStringType(node: Record<string, unknown>): boolean {
  return node.type === "string" || (Array.isArray(node.type) && node.type.includes("string"));
}

/** Values listed as `x=meaning` or `x/y/z` that belong to this field. */
function listsFixedValues(description: string): boolean {
  const assignments = description.match(/(?:^|[\s(（:：，,;；])([A-Za-z][\w-]*)\s*=(?!\s*\d)/g) ?? [];
  const lowerOrConst = assignments.filter((a) => !/[a-z][A-Z]/.test(a)); // skip camelCase param names (`action=list`)
  return lowerOrConst.length >= 2 && !/action\s*=|mode\s*=/.test(description);
}

export function lintTool(tool: WireTool): LintFinding[] {
  const findings: LintFinding[] = [];
  const root = tool.inputSchema as Record<string, unknown>;
  if (root.type !== "object") {
    findings.push({ category: "F", tool: tool.name, path: "/", detail: "root type is not object" });
  }
  for (const key of ROOT_FORBIDDEN) {
    if (key in root) findings.push({ category: "F", tool: tool.name, path: "/", detail: `root ${key}` });
  }

  const subtrees = new Map<string, string>();
  const walk = (node: unknown, path: string, siblings: string[] | null) => {
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${path}[${i}]`, null));
      return;
    }
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    for (const key of DIALECT_SENSITIVE) {
      if (key in rec) findings.push({ category: "F", tool: tool.name, path, detail: `uses ${key}` });
    }
    if (Array.isArray(rec.items)) findings.push({ category: "F", tool: tool.name, path, detail: "tuple-form items" });
    for (const unionKey of ["anyOf", "oneOf"] as const) {
      const branches = rec[unionKey];
      if (!Array.isArray(branches) || path === "") continue;
      const consts = branches.map((b) => (b as Record<string, unknown>)?.const);
      if (consts.length > 1 && consts.every((c) => c !== undefined)) {
        findings.push({ category: "F", tool: tool.name, path, detail: `${unionKey} of const values instead of enum` });
      }
      if (unionKey === "oneOf") {
        const types = branches.map((b) => JSON.stringify((b as Record<string, unknown>)?.type));
        const distinctTypes = new Set(types).size === types.length;
        const discriminated = branches.every((b) =>
          Object.values(((b as Record<string, unknown>)?.properties ?? {}) as Record<string, Record<string, unknown>>).some(
            (p) => p && p.const !== undefined,
          ),
        );
        if (!distinctTypes && !discriminated) {
          findings.push({ category: "F", tool: tool.name, path, detail: "oneOf branches are not discriminable" });
        }
      }
    }

    const description = typeof rec.description === "string" ? rec.description : "";
    if (description && path !== "") {
      const enumValues = (rec.enum as unknown[] | undefined) ??
        ((rec.items as Record<string, unknown> | undefined)?.enum as unknown[] | undefined);
      if (isStringType(rec) && !enumValues && rec.const === undefined && listsFixedValues(description)) {
        findings.push({ category: "A", tool: tool.name, path, detail: "description lists fixed values but schema has no enum" });
      }
      if (enumValues && enumValues.length >= 3) {
        const listed = enumValues.filter((v) => description.includes(String(v)));
        const explained = enumValues.filter((v) =>
          new RegExp(`${String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[=：:（(]`).test(description),
        );
        if (listed.length / enumValues.length >= 0.6 && explained.length / enumValues.length < 0.3) {
          findings.push({ category: "B", tool: tool.name, path, detail: `re-lists ${listed.length}/${enumValues.length} enum values` });
        }
      }
      if (description.length > LONG_PARAM_DESCRIPTION) {
        findings.push({ category: "C", tool: tool.name, path, detail: `${description.length} chars` });
      }
      if (siblings) {
        const own = path.split("/").pop();
        const mentioned = siblings.filter((s) => s !== own && s.length > 3 && new RegExp(`\\b${s}\\b`).test(description));
        if (mentioned.length >= 3) {
          findings.push({ category: "E", tool: tool.name, path, detail: `mentions ${mentioned.length} sibling params` });
        }
      }
    }
    if (rec.type === "object" && rec.properties && typeof rec.properties === "object") {
      const serialized = JSON.stringify(rec);
      if (serialized.length > 300) {
        const first = subtrees.get(serialized);
        if (first) findings.push({ category: "D", tool: tool.name, path, detail: `duplicates ${first}` });
        else subtrees.set(serialized, path || "/");
      }
      const names = Object.keys(rec.properties as object);
      for (const [key, value] of Object.entries(rec.properties as Record<string, unknown>)) {
        walk(value, path ? `${path}.${key}` : key, names);
      }
    }
    for (const key of ["items", "anyOf", "oneOf", "allOf", "additionalProperties"]) {
      const child = rec[key];
      if (child && typeof child === "object" && !(key === "items" && Array.isArray(child))) {
        walk(child, path ? `${path}.${key}` : key, null);
      }
    }
  };
  walk(root, "", null);
  return findings;
}

export function lintSurface(tools: WireTool[]): LintFinding[] {
  return tools.flatMap(lintTool);
}
