import type { ZodTypeAny } from "zod";
import { isMessageKey, t, type Lang } from "./index.js";

type ZodV4Def = Record<string, unknown>;
type ZodConstructor = new (definition: ZodV4Def) => ZodTypeAny;

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

  const def = {
    ...((schema as unknown as { _zod: { def: ZodV4Def } })._zod.def),
  };

  // 先在 def 上替换所有子 schema，再重建实例（zod v4 的 def.shape 是平面对象，不再是 getter）
  if (def.shape && typeof def.shape === "object") {
    def.shape = localizeZodSchemaShape(def.shape as Record<string, ZodTypeAny>, lang, seen);
  } else if (typeof def.shape === "function") {
    const shape = def.shape as () => Record<string, ZodTypeAny>;
    def.shape = () => localizeZodSchemaShape(shape(), lang, seen);
  }
  if (typeof def.getter === "function") {
    const getter = def.getter as () => ZodTypeAny;
    def.getter = () => localizeZodSchema(getter(), lang, seen);
  }

  for (const key of [
    "innerType",
    "element",
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
    if (key in def) {
      def[key] = localizeSchemaList(def[key], lang, seen);
    }
  }

  const Constructor = schema.constructor as ZodConstructor;
  let localized = new Constructor(def);
  seen.set(schema, localized);

  // zod v4 的 description 存在实例属性/注册表里，不在 def 上；用 .describe() 克隆覆盖
  const description = (schema as unknown as { description?: unknown }).description;
  if (isMessageKey(description)) {
    localized = localized.describe(t(description, undefined, lang));
    seen.set(schema, localized);
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
