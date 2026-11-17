/**
 * Deterministic argument samples derived from a tool's JSON input schema.
 *
 * For every tool we build one "filled required fields" sample, then for every
 * enum-constrained top-level field one sample per allowed value plus one with a
 * value outside the enum. The acceptance result of each sample under the zod
 * schema is recorded in the baseline; the surface test replays them so any
 * change to what a tool accepts shows up as a failing sample.
 */

type Schema = Record<string, unknown>;

export interface ArgSample {
  label: string;
  args: Record<string, unknown>;
}

function valueFor(schema: Schema | undefined, depth = 0): unknown {
  if (!schema || depth > 4) return "x";
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const branches = (schema.anyOf ?? schema.oneOf) as Schema[] | undefined;
  if (Array.isArray(branches) && branches.length > 0) return valueFor(branches[0], depth + 1);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case "string":
      return typeof schema.pattern === "string" && /\\d\{14\}/.test(schema.pattern) ? "20260101000000" : "sample";
    case "number":
    case "integer": {
      const min = typeof schema.minimum === "number" ? schema.minimum : typeof schema.exclusiveMinimum === "number" ? schema.exclusiveMinimum + 1 : 1;
      return min;
    }
    case "boolean":
      return true;
    case "array":
      return [valueFor(schema.items as Schema, depth + 1)];
    case "object":
      return fill(schema, depth + 1);
    default:
      return "sample";
  }
}

function fill(schema: Schema, depth = 0): Record<string, unknown> {
  const props = (schema.properties ?? {}) as Record<string, Schema>;
  const required = (schema.required ?? []) as string[];
  const out: Record<string, unknown> = {};
  for (const key of required) out[key] = valueFor(props[key], depth);
  return out;
}

export function samplesFor(inputSchema: Schema): ArgSample[] {
  const base = fill(inputSchema);
  const samples: ArgSample[] = [{ label: "required", args: base }];
  const props = (inputSchema.properties ?? {}) as Record<string, Schema>;
  for (const [key, prop] of Object.entries(props)) {
    // A closed value set may be written as `enum` or as `anyOf` of `const`s; both
    // produce the same labels so rewriting one form into the other is checked
    // as an equivalence, not reported as a new contract.
    const isArray = prop.type === "array";
    let values = (prop.enum ?? (prop.items as Schema | undefined)?.enum) as unknown[] | undefined;
    const branches = prop.anyOf as Schema[] | undefined;
    if (!values && Array.isArray(branches) && branches.length > 0 && branches.every((b) => b.const !== undefined)) {
      values = branches.map((b) => b.const);
    }
    if (Array.isArray(values)) {
      for (const v of values) samples.push({ label: `${key}=${String(v)}`, args: { ...base, [key]: isArray ? [v] : v } });
      const bogus = typeof values[0] === "number" ? 7 : "__not_allowed__";
      samples.push({ label: `${key}=<outside allowed>`, args: { ...base, [key]: isArray ? [bogus] : bogus } });
    }
    if (prop.type === "boolean") samples.push({ label: `${key}=<string>`, args: { ...base, [key]: "yes" } });
  }
  return samples;
}
