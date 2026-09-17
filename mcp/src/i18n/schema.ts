import type { ZodTypeAny } from "zod";
import { isMessageKey, t, type Lang } from "./index.js";

type ZodConstructor = new (definition: Record<string, unknown>) => ZodTypeAny;

function isZodSchema(value: unknown): value is ZodTypeAny {
  return Boolean(
    value &&
      typeof value === "object" &&
      "_def" in value &&
      typeof (value as ZodTypeAny).safeParse === "function",
  );
}

function localizeSchemaList(value: unknown, lang: Lang | undefined, seen: WeakMap<object, ZodTypeAny>): unknown {
  if (isZodSchema(value)) {
    return localizeZodSchema(value, lang, seen);
  }
  if (Array.isArray(value)) {
    return value.map((item) => localizeSchemaList(item, lang, seen));
  }
  if (value instanceof Map) {
    return new Map(
      [...value.entries()].map(([key, item]) => [
        key,
        localizeSchemaList(item, lang, seen),
      ]),
    );
  }
  return value;
}

function localizeZodSchema(
  schema: ZodTypeAny,
  lang: Lang | undefined,
  seen: WeakMap<object, ZodTypeAny>,
): ZodTypeAny {
  const cached = seen.get(schema);
  if (cached) {
    return cached;
  }

  const definition = {
    ...(schema._def as Record<string, unknown>),
  };
  const description = definition.description;
  if (isMessageKey(description)) {
    definition.description = t(description, undefined, lang);
  }

  const Constructor = schema.constructor as ZodConstructor;
  const localized = new Constructor(definition);
  seen.set(schema, localized);

  if (typeof definition.shape === "function") {
    const shape = definition.shape as () => Record<string, ZodTypeAny>;
    definition.shape = () => localizeZodSchemaShape(shape(), lang, seen);
  }
  if (typeof definition.getter === "function") {
    const getter = definition.getter as () => ZodTypeAny;
    definition.getter = () => localizeZodSchema(getter(), lang, seen);
  }

  for (const key of [
    "innerType",
    "type",
    "schema",
    "in",
    "out",
    "keyType",
    "valueType",
    "rest",
    "items",
    "options",
    "optionsMap",
  ]) {
    if (key in definition) {
      definition[key] = localizeSchemaList(definition[key], lang, seen);
    }
  }

  return localized;
}

export function localizeZodSchemaShape(
  shape: Record<string, ZodTypeAny>,
  lang?: Lang,
  seen = new WeakMap<object, ZodTypeAny>(),
): Record<string, ZodTypeAny> {
  return Object.fromEntries(
    Object.entries(shape).map(([name, schema]) => [
      name,
      localizeZodSchema(schema, lang, seen),
    ]),
  );
}
