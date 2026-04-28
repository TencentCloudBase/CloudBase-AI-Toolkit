/**
 * JSON Schema sanitization for model API compatibility.
 *
 * Some model APIs (e.g., Kimi/Moonshot) reject tool definitions that contain:
 * - `additionalProperties: {}` (empty object without a `type` field)
 * - `anyOf: [{"not": {}}, X]` (optional-field pattern produced by zod `.optional()`)
 * - `$schema` fields in nested schemas
 *
 * This module provides a recursive `sanitizeToolSchema` function that rewrites
 * these patterns into universally-accepted equivalents so that MCP tool
 * definitions work across all major model providers.
 */

type JsonSchema = Record<string, unknown>;

/**
 * Recursively sanitize a JSON Schema object for maximum model API compatibility.
 */
export function sanitizeToolSchema(schema: JsonSchema): JsonSchema {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  const result: JsonSchema = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip $schema fields — model APIs don't need them and some reject them
    if (key === "$schema") {
      continue;
    }

    if (key === "additionalProperties") {
      // Replace empty object {} with { type: "string" }
      // This is the JSON Schema output of z.record(z.any()) / z.any()
      if (
        typeof value === "object" &&
        value !== null &&
        Object.keys(value as object).length === 0
      ) {
        result[key] = { type: "string" };
        continue;
      }
      // `true` is valid (means any value allowed) but some APIs don't accept it
      if (value === true) {
        result[key] = { type: "string" };
        continue;
      }
      // Recursively sanitize non-trivial additionalProperties schemas
      result[key] = sanitizeJsonSchemaValue(value);
      continue;
    }

    if (key === "anyOf") {
      // Handle the zod .optional() pattern: anyOf: [{"not": {}}, X]
      // Rewrite to just X (the actual schema), since optional fields are
      // already indicated by the absence from `required`.
      if (Array.isArray(value)) {
        const nonNegated = value.filter(
          (item) =>
            !(typeof item === "object" && item !== null && "not" in item),
        );
        if (nonNegated.length === 1) {
          // Single non-negated alternative — flatten it into the parent.
          // Sanitize the alternative first so nested patterns are handled.
          const alt = sanitizeToolSchema(nonNegated[0] as JsonSchema);
          for (const [altKey, altVal] of Object.entries(alt)) {
            result[altKey] = altVal;
          }
          continue;
        }
        if (nonNegated.length > 1) {
          // Multiple non-negated alternatives — keep anyOf but sanitize each
          result[key] = nonNegated.map((item) =>
            sanitizeJsonSchemaValue(item),
          ) as unknown as JsonSchema[];
          continue;
        }
        // All negated (shouldn't happen) — fall through
      }
      result[key] = sanitizeJsonSchemaValue(value);
      continue;
    }

    result[key] = sanitizeJsonSchemaValue(value);
  }

  return result;
}

function sanitizeJsonSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonSchemaValue);
  }
  if (typeof value === "object" && value !== null) {
    return sanitizeToolSchema(value as JsonSchema);
  }
  return value;
}
