import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadProjectConfig } = vi.hoisted(() => ({
  mockReadProjectConfig: vi.fn(),
}));

vi.mock("./project-config.js", () => ({
  readProjectConfig: mockReadProjectConfig,
}));

import {
  SITE_REGION_MAP,
  TCB_QUERY_REGIONS,
  getSite,
  isSiteId,
  normalizeSite,
  resolveSite,
  resolveSiteAndRegion,
} from "./site-map.js";

describe("site-map mapping table", () => {
  it("should map domestic regions to domestic site", () => {
    expect(getSite("ap-shanghai")).toBe("domestic");
    expect(getSite("ap-guangzhou")).toBe("domestic");
  });

  it("should keep TCB_QUERY_REGIONS covering SITE_REGION_MAP regions", () => {
    const mapped = Object.values(SITE_REGION_MAP).flatMap((site) => site.regions);
    for (const region of mapped) {
      expect(TCB_QUERY_REGIONS).toContain(region);
    }
  });

  it("should return ambiguous for ap-singapore without explicit site", () => {
    expect(getSite("ap-singapore")).toBe("ambiguous");
  });

  it("should respect explicit site even for ap-singapore", () => {
    expect(getSite("ap-singapore", "domestic")).toBe("domestic");
    expect(getSite("ap-singapore", "intl")).toBe("intl");
  });

  it("should default to domestic for unknown or missing region", () => {
    expect(getSite(undefined)).toBe("domestic");
    expect(getSite("eu-frankfurt")).toBe("domestic");
  });

  it("resolveSite should default ambiguous to intl (backward compat)", () => {
    expect(resolveSite("ap-singapore")).toBe("intl");
    expect(resolveSite("ap-singapore", "domestic")).toBe("domestic");
    expect(resolveSite("ap-shanghai")).toBe("domestic");
  });

  it("normalizeSite should accept aliases", () => {
    expect(normalizeSite("intl")).toBe("intl");
    expect(normalizeSite("international")).toBe("intl");
    expect(normalizeSite("domestic")).toBe("domestic");
    expect(normalizeSite("cn")).toBe("domestic");
    expect(normalizeSite("unknown")).toBeUndefined();
    expect(isSiteId("domestic")).toBe(true);
    expect(isSiteId("intl")).toBe(true);
    expect(isSiteId("other")).toBe(false);
  });

  it("mapping table should declare expected defaults", () => {
    expect(SITE_REGION_MAP.domestic.capabilities.noSql).toBe(true);
    expect(SITE_REGION_MAP.intl.capabilities.noSql).toBe(false);
    expect(SITE_REGION_MAP.domestic.defaultRegion).toBe("ap-shanghai");
    expect(SITE_REGION_MAP.intl.defaultRegion).toBe("ap-singapore");
  });
});

describe("resolveSiteAndRegion priority chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TCB_SITE;
    delete process.env.TCB_REGION;
    mockReadProjectConfig.mockReturnValue(undefined);
  });

  it("should default to domestic/ap-shanghai with no configuration", () => {
    expect(resolveSiteAndRegion()).toEqual({
      site: "domestic",
      region: "ap-shanghai",
    });
  });

  it("should prefer explicit region over env and mark ambiguity", () => {
    expect(resolveSiteAndRegion({ region: "ap-singapore" })).toEqual({
      site: "intl",
      region: "ap-singapore",
      ambiguous: true,
    });
  });

  it("should honor explicit site=domestic with ap-singapore region", () => {
    expect(resolveSiteAndRegion({ region: "ap-singapore", site: "domestic" })).toEqual({
      site: "domestic",
      region: "ap-singapore",
    });
  });

  it("should honor explicit site=intl without region using intl default region", () => {
    expect(resolveSiteAndRegion({ site: "intl" })).toEqual({
      site: "intl",
      region: "ap-singapore",
    });
  });

  it("should read TCB_SITE/TCB_REGION env vars", () => {
    process.env.TCB_SITE = "intl";
    process.env.TCB_REGION = "ap-singapore";
    expect(resolveSiteAndRegion()).toEqual({
      site: "intl",
      region: "ap-singapore",
    });
  });

  it("should let explicit opts override env", () => {
    process.env.TCB_SITE = "intl";
    process.env.TCB_REGION = "ap-singapore";
    expect(resolveSiteAndRegion({ site: "domestic", region: "ap-shanghai" })).toEqual({
      site: "domestic",
      region: "ap-shanghai",
    });
  });

  it("should fall back to project config when no opts/env", () => {
    mockReadProjectConfig.mockReturnValue({
      site: "intl",
      region: "ap-singapore",
    });
    expect(resolveSiteAndRegion()).toEqual({
      site: "intl",
      region: "ap-singapore",
    });
  });

  it("should let env override project config", () => {
    mockReadProjectConfig.mockReturnValue({ site: "intl" });
    process.env.TCB_SITE = "domestic";
    expect(resolveSiteAndRegion()).toEqual({
      site: "domestic",
      region: "ap-shanghai",
    });
  });
});
