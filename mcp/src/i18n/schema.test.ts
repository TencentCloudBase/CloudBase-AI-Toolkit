import { describe, expect, it } from "vitest";
import { z } from "zod";
import { t } from "./index.js";
import { en } from "./locales/en.js";
import { zh } from "./locales/zh.js";
import { localizeZodSchemaShape } from "./schema.js";

describe("localizeZodSchemaShape", () => {
  const shape = {
    action: z.string().describe("storage.queryTitle"),
    nested: z
      .object({
        path: z.string().describe("storage.manageTitle"),
      })
      .optional()
      .describe("storage.queryDescription"),
    entries: z.array(
      z.object({
        value: z.string().describe("storage.manageDescription"),
      }),
    ),
  };

  it("localizes descriptions recursively without changing the source schema", () => {
    const localized = localizeZodSchemaShape(shape, "en");

    expect(localized.action.description).toBe(en.storage.queryTitle);
    expect(localized.nested.description).toBe(en.storage.queryDescription);
    expect(shape.action.description).toBe("storage.queryTitle");

    const nestedObject = (localized.nested as typeof shape.nested).unwrap();
    expect(nestedObject.shape.path.description).toBe(en.storage.manageTitle);

    const entryObject = (localized.entries as typeof shape.entries).element;
    expect(entryObject.shape.value.description).toBe(en.storage.manageDescription);
  });

  it("uses the requested language and preserves validation behavior", () => {
    const localized = localizeZodSchemaShape(shape, "zh");

    expect(localized.action.description).toBe(zh.storage.queryTitle);
    expect(localized.action.safeParse("list").success).toBe(true);
    expect(localized.action.safeParse(1).success).toBe(false);
  });
});

/**
 * localizeZodSchema rebuilds a Zod instance from its def. Zod v4 keeps
 * `description` on the instance, not in the def, so every string description
 * must be attached again after the rebuild — including text the caller already
 * resolved with t() interpolation. A dictionary key is not the only valid form.
 */
describe("localizeZodSchemaShape keeps non-key descriptions", () => {
  it("keeps already-resolved text with interpolation in both languages", () => {
    for (const lang of ["zh", "en"] as const) {
      const resolved = t("capi.schema.service", { count: 58 }, lang);
      const localized = localizeZodSchemaShape(
        { service: z.string().describe(resolved) },
        lang,
      );
      expect(localized.service.description, lang).toBe(resolved);
    }
  });

  it("keeps an intentionally empty description empty", () => {
    const localized = localizeZodSchemaShape({ note: z.string().describe("") }, "zh");
    expect(localized.note.description).toBe("");
  });

  it("emits the resolved description into the JSON Schema", () => {
    const resolved = t("capi.schema.version", { services: "tke、mongodb" }, "zh");
    const json = z.toJSONSchema(
      z.object(localizeZodSchemaShape({ version: z.string().describe(resolved) }, "zh")),
    ) as { properties?: Record<string, { description?: string }> };
    expect(json.properties?.version.description).toBe(resolved);
  });
});
