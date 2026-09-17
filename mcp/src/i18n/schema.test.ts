import { describe, expect, it } from "vitest";
import { z } from "zod";
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
