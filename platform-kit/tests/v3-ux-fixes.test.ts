import { describe, expect, it } from "vitest";
import { zh } from "../src/i18n/zh.js";
import { en } from "../src/i18n/en.js";
import {
  sqlCreateStorageBucket,
  sqlDeleteStorageBucket,
  sqlListStorageBuckets,
} from "../src/pg/sql.js";

describe("i18n keys", () => {
  it("zh and en have identical keys", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});

describe("storage bucket SQL", () => {
  it("generates list/create/delete SQL for storage.buckets", () => {
    expect(sqlListStorageBuckets()).toContain("storage.buckets");
    expect(sqlCreateStorageBucket("avatars")).toContain("INSERT INTO storage.buckets");
    expect(sqlDeleteStorageBucket("avatars")).toContain("DELETE FROM storage.buckets");
  });

  it("rejects invalid bucket names", () => {
    expect(() => sqlCreateStorageBucket("bad name")).toThrow(/Invalid bucket name/);
  });
});

describe("ConfirmDialog contract", () => {
  it("exports ConfirmDialog component", async () => {
    const mod = await import("../src/components/ConfirmDialog.js");
    expect(typeof mod.ConfirmDialog).toBe("function");
  });
});

describe("auth pagination hook shape", () => {
  it("useAuthUsers module exports pagination helpers", async () => {
    const mod = await import("../src/hooks/use-auth-users.js");
    expect(typeof mod.useAuthUsers).toBe("function");
  });
});

describe("unattended UI hooks", () => {
  it("SidebarNav stamps data-testid per route", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src/components/SidebarNav.tsx"), "utf8");
    expect(src).toContain("data-testid={`cb-nav-${item.id}`}");
  });
});
