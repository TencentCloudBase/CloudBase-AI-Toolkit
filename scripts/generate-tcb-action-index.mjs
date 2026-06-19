import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadYamlModule } from "./lib/load-yaml-module.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INPUT = path.join(
  ROOT_DIR,
  "mcp",
  "assets",
  "control-plane",
  "tcb-openapi.yaml",
);
const DEFAULT_OUTPUT = path.join(
  ROOT_DIR,
  "mcp",
  "src",
  "generated",
  "tcb-action-index.ts",
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--output") {
      args.output = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  return args;
}

function cloneExample(value) {
  if (value === null || value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function mergeSchemaNodes(base, incoming) {
  if (!incoming || typeof incoming !== "object") {
    return base;
  }

  const merged = { ...base };

  for (const key of ["type", "description", "nullable", "format"]) {
    if (merged[key] === undefined && incoming[key] !== undefined) {
      merged[key] = incoming[key];
    }
  }

  if (Array.isArray(incoming.enum) && incoming.enum.length > 0) {
    merged.enum = Array.isArray(merged.enum)
      ? Array.from(new Set([...merged.enum, ...incoming.enum]))
      : [...incoming.enum];
  }

  if (Array.isArray(incoming.required) && incoming.required.length > 0) {
    merged.required = Array.isArray(merged.required)
      ? Array.from(new Set([...merged.required, ...incoming.required])).sort()
      : [...incoming.required].sort();
  }

  if (incoming.example !== undefined && merged.example === undefined) {
    merged.example = cloneExample(incoming.example);
  }

  if (incoming.properties && typeof incoming.properties === "object") {
    merged.properties = merged.properties ?? {};
    for (const [name, child] of Object.entries(incoming.properties)) {
      merged.properties[name] = child;
    }
  }

  if (incoming.items !== undefined && merged.items === undefined) {
    merged.items = incoming.items;
  }

  if (
    incoming.additionalProperties !== undefined &&
    merged.additionalProperties === undefined
  ) {
    merged.additionalProperties = incoming.additionalProperties;
  }

  return merged;
}

function compactValue(value) {
  if (Array.isArray(value)) {
    const next = value
      .map((item) => compactValue(item))
      .filter((item) => item !== undefined);
    return next.length > 0 ? next : undefined;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compactValue(item)])
      .filter(([, item]) => item !== undefined);
    if (entries.length === 0) {
      return undefined;
    }
    return Object.fromEntries(entries);
  }

  if (value === undefined) {
    return undefined;
  }

  return value;
}

function buildSchemaResolver(components) {
  function dereferenceSchema(schema, stack = []) {
    if (!schema || typeof schema !== "object") {
      return undefined;
    }

    if (schema.$ref) {
      const ref = schema.$ref;
      const prefix = "#/components/schemas/";
      if (!ref.startsWith(prefix)) {
        return undefined;
      }
      const schemaName = ref.slice(prefix.length);
      if (stack.includes(schemaName)) {
        return compactValue({
          type: "object",
          description: `Circular schema omitted for ${schemaName}`,
        });
      }
      const target = components[schemaName];
      return dereferenceSchema(target, [...stack, schemaName]);
    }

    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
      return compactValue(
        schema.allOf.reduce(
          (acc, item) => mergeSchemaNodes(acc, dereferenceSchema(item, stack)),
          {},
        ),
      );
    }

    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
      return compactValue(
        schema.oneOf.reduce(
          (acc, item) => mergeSchemaNodes(acc, dereferenceSchema(item, stack)),
          {},
        ),
      );
    }

    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
      return compactValue(
        schema.anyOf.reduce(
          (acc, item) => mergeSchemaNodes(acc, dereferenceSchema(item, stack)),
          {},
        ),
      );
    }

    const resolved = {
      type: schema.type,
      description: schema.description,
      nullable: schema.nullable,
      format: schema.format,
      enum: Array.isArray(schema.enum) ? [...schema.enum] : undefined,
      required: Array.isArray(schema.required)
        ? [...schema.required].sort()
        : undefined,
      example: cloneExample(schema.example),
    };

    if (schema.properties && typeof schema.properties === "object") {
      resolved.properties = Object.fromEntries(
        Object.entries(schema.properties)
          .map(([name, child]) => [name, dereferenceSchema(child, stack)])
          .filter(([, child]) => child !== undefined),
      );
    }

    if (schema.items) {
      resolved.items = dereferenceSchema(schema.items, stack);
    }

    if (schema.additionalProperties === true || schema.additionalProperties === false) {
      resolved.additionalProperties = schema.additionalProperties;
    } else if (schema.additionalProperties) {
      resolved.additionalProperties = dereferenceSchema(
        schema.additionalProperties,
        stack,
      );
    }

    return compactValue(resolved);
  }

  return dereferenceSchema;
}

function normalizeDescription(description) {
  if (!description) {
    return "";
  }

  return String(description)
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function truncateText(text, maxLength = 180) {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function renderDocComment(schema, indent) {
  const lines = [];
  const description = truncateText(normalizeDescription(schema?.description));
  if (description) {
    lines.push(...description.split("\n"));
  }
  if (Array.isArray(schema?.enum) && schema.enum.length > 0) {
    lines.push(
      `Allowed values: ${schema.enum
        .map((item) =>
          typeof item === "string" ? JSON.stringify(item) : String(item),
        )
        .join(" | ")}`,
    );
  }

  if (lines.length === 0) {
    return "";
  }

  const commentBody = lines
    .map((line) => `${indent} * ${line}`.trimEnd())
    .join("\n");

  return `${indent}/**\n${commentBody}\n${indent} */\n`;
}

function renderTsTypeFromSchema(schema, depth = 0) {
  if (!schema || typeof schema !== "object") {
    return "unknown";
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const union = schema.enum
      .map((item) =>
        typeof item === "string" ? JSON.stringify(item) : String(item),
      )
      .join(" | ");
    return schema.nullable ? `${union} | null` : union;
  }

  const nullableSuffix = schema.nullable ? " | null" : "";

  if (schema.type === "object" || schema.properties) {
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const indent = "  ".repeat(depth);
    const childIndent = "  ".repeat(depth + 1);
    const lines = Object.entries(properties).map(([key, value]) => {
      const optional = required.has(key) ? "" : "?";
      const comment = renderDocComment(value, childIndent);
      return `${comment}${childIndent}${JSON.stringify(key)}${optional}: ${renderTsTypeFromSchema(value, depth + 1)};`;
    });

    if (lines.length === 0) {
      return schema.additionalProperties
        ? `{ [key: string]: ${renderTsTypeFromSchema(schema.additionalProperties, depth + 1)} }${nullableSuffix}`
        : `Record<string, unknown>${nullableSuffix}`;
    }

    return `{\n${lines.join("\n")}\n${indent}}${nullableSuffix}`;
  }

  if (schema.type === "array") {
    const itemType = renderTsTypeFromSchema(schema.items, depth);
    return `(${itemType})[]${nullableSuffix}`;
  }

  const primitiveMap = {
    string: "string",
    integer: "number",
    number: "number",
    boolean: "boolean",
  };

  return `${primitiveMap[schema.type] ?? "unknown"}${nullableSuffix}`;
}

function buildParamsType(action, actionDescription, requestShape) {
  const typeBody = renderTsTypeFromSchema(requestShape ?? { type: "object" });
  const comment = renderDocComment({ description: actionDescription }, "");
  return `${comment}type ${action}Params = ${typeBody};`;
}

function getRequestSchema(operation) {
  const requestBody = operation?.requestBody?.content;
  if (!requestBody || typeof requestBody !== "object") {
    return undefined;
  }

  return (
    requestBody["application/json"]?.schema ??
    Object.values(requestBody)[0]?.schema
  );
}

function createActionEntries(openapi) {
  const components = openapi?.components?.schemas ?? {};
  const dereferenceSchema = buildSchemaResolver(components);
  const entries = [];

  for (const [apiPath, methods] of Object.entries(openapi?.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods ?? {})) {
      if (!operation?.operationId) {
        continue;
      }

      const requestSchema = getRequestSchema(operation);
      const requestShape = dereferenceSchema(requestSchema) ?? null;
      const paramKeys = Object.keys(requestShape?.properties ?? {});
      const requiredKeys = Array.isArray(requestShape?.required)
        ? requestShape.required
        : [];

      entries.push({
        action: operation.operationId,
        path: apiPath,
        method: method.toUpperCase(),
        description:
          operation["x-tcapi-action-name"] ??
          operation.summary ??
          operation.description ??
          "",
        paramKeys,
        requiredKeys,
        exampleParams:
          requestShape && requestShape.example && typeof requestShape.example === "object"
            ? requestShape.example
            : undefined,
        paramsType: buildParamsType(
          operation.operationId,
          operation["x-tcapi-action-name"] ??
            operation.summary ??
            operation.description ??
            "",
          requestShape,
        ),
      });
    }
  }

  return entries.sort((a, b) => a.action.localeCompare(b.action));
}

function renderTypeScript(entries, inputPath) {
  const sourcePath = path.relative(ROOT_DIR, inputPath).replaceAll(path.sep, "/");
  const mapObject = Object.fromEntries(entries.map((entry) => [entry.action, entry]));
  const serializedMap = JSON.stringify(mapObject, null, 2);

return `/* eslint-disable */
/**
 * Generated by scripts/generate-tcb-action-index.mjs from ${sourcePath}.
 * Do not edit this file manually.
 */

export type TcbActionIndexEntry = {
  action: string;
  path: string;
  method: string;
  description: string;
  paramKeys: string[];
  requiredKeys: string[];
  exampleParams?: Record<string, unknown>;
  paramsType: string;
};

export const TCB_ACTION_INDEX_MAP: Record<string, TcbActionIndexEntry> = ${serializedMap};

export const TCB_ACTION_INDEX = Object.values(TCB_ACTION_INDEX_MAP);
`;
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const YAML = await loadYamlModule(ROOT_DIR);
  const openapi = YAML.load(fs.readFileSync(input, "utf8"));
  const entries = createActionEntries(openapi);
  const content = renderTypeScript(entries, input);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, content, "utf8");

  console.log(
    `Generated ${path.relative(ROOT_DIR, output)} with ${entries.length} actions from ${path.relative(ROOT_DIR, input)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
