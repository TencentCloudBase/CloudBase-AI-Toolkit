import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadProjectConfig, mockReadCloudbaseRcBinding } = vi.hoisted(() => ({
  mockReadProjectConfig: vi.fn(),
  mockReadCloudbaseRcBinding: vi.fn(),
}));

vi.mock("./project-config.js", () => ({
  readProjectConfig: mockReadProjectConfig,
  readCloudbaseRcBinding: mockReadCloudbaseRcBinding,
}));

import {
  SITE_REGION_MAP,
  TCB_QUERY_REGIONS,
  getConsoleDevUrl,
  getGatewayBaseUrl,
  getSite,
  isSiteId,
  normalizeSite,
  resolveApiKeyExchangeRegion,
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

  it("should fall back to cloudbaserc.json when project config is absent", () => {
    mockReadCloudbaseRcBinding.mockReturnValue({
      site: "intl",
      region: "ap-singapore",
    });
    expect(resolveSiteAndRegion()).toEqual({
      site: "intl",
      region: "ap-singapore",
    });
  });

  it("should fall back to cloudbaserc.json per field when project config is partial", () => {
    // project.json 只写 site，cloudbaserc.json 只写 region：字段级互补，不是整文件二选一
    mockReadProjectConfig.mockReturnValue({ site: "domestic" });
    mockReadCloudbaseRcBinding.mockReturnValue({ region: "ap-singapore" });
    expect(resolveSiteAndRegion()).toEqual({
      site: "domestic",
      region: "ap-singapore",
    });
  });

  it("should let project config override cloudbaserc.json", () => {
    mockReadProjectConfig.mockReturnValue({ site: "domestic", region: "ap-shanghai" });
    mockReadCloudbaseRcBinding.mockReturnValue({ site: "intl", region: "ap-singapore" });
    expect(resolveSiteAndRegion()).toEqual({
      site: "domestic",
      region: "ap-shanghai",
    });
  });

  it("should let env override cloudbaserc.json", () => {
    mockReadCloudbaseRcBinding.mockReturnValue({ site: "intl" });
    process.env.TCB_SITE = "domestic";
    expect(resolveSiteAndRegion()).toEqual({
      site: "domestic",
      region: "ap-shanghai",
    });
  });
});

describe("resolveApiKeyExchangeRegion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TCB_SITE;
    delete process.env.TCB_REGION;
    mockReadProjectConfig.mockReturnValue(undefined);
    mockReadCloudbaseRcBinding.mockReturnValue(undefined);
  });

  it("should return intl region only for explicit intl site", () => {
    expect(resolveApiKeyExchangeRegion({ site: "intl" })).toBe("ap-singapore");
    process.env.TCB_SITE = "intl";
    expect(resolveApiKeyExchangeRegion()).toBe("ap-singapore");
    process.env.TCB_REGION = "ap-singapore";
    expect(resolveApiKeyExchangeRegion()).toBe("ap-singapore");
  });

  it("should return undefined for domestic site regardless of region", () => {
    expect(resolveApiKeyExchangeRegion()).toBeUndefined();
    expect(resolveApiKeyExchangeRegion({ site: "domestic" })).toBeUndefined();
    expect(resolveApiKeyExchangeRegion({ site: "domestic", region: "ap-guangzhou" })).toBeUndefined();
    expect(resolveApiKeyExchangeRegion({ site: "domestic", region: "ap-singapore" })).toBeUndefined();
  });

  it("should return undefined for ambiguous region without explicit site", () => {
    // 仅设 TCB_REGION=ap-singapore（歧义）时不得切到 sg 网关：
    // 国内站 ap-singapore 环境的 key 经默认 ap-shanghai 网关全局路由
    expect(resolveApiKeyExchangeRegion({ region: "ap-singapore" })).toBeUndefined();
    process.env.TCB_REGION = "ap-singapore";
    expect(resolveApiKeyExchangeRegion()).toBeUndefined();
  });

  it("should let explicit opts override intl env back to domestic", () => {
    process.env.TCB_SITE = "intl";
    expect(resolveApiKeyExchangeRegion({ site: "domestic" })).toBeUndefined();
  });
});

describe("getGatewayBaseUrl / getConsoleDevUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TCB_SITE;
    delete process.env.TCB_REGION;
    mockReadProjectConfig.mockReturnValue(undefined);
    mockReadCloudbaseRcBinding.mockReturnValue(undefined);
  });

  it("getGatewayBaseUrl should build domestic gateway host by default", () => {
    expect(getGatewayBaseUrl("env-abc")).toBe(
      "https://env-abc.api.tcloudbasegateway.com",
    );
  });

  it("getGatewayBaseUrl should build intl gateway host for explicit intl site", () => {
    expect(getGatewayBaseUrl("env-abc", "intl")).toBe(
      "https://env-abc.api.intl.tcloudbasegateway.com",
    );
  });

  it("getGatewayBaseUrl should follow the resolution chain when site is omitted", () => {
    // 环境变量 TCB_SITE=intl（调用方均不传 explicitSite，必须生效）
    process.env.TCB_SITE = "intl";
    expect(getGatewayBaseUrl("env-abc")).toBe(
      "https://env-abc.api.intl.tcloudbasegateway.com",
    );
    // 项目配置 .cloudbase/project.json site=intl
    delete process.env.TCB_SITE;
    mockReadProjectConfig.mockReturnValue({ site: "intl" });
    expect(getGatewayBaseUrl("env-abc")).toBe(
      "https://env-abc.api.intl.tcloudbasegateway.com",
    );
  });

  it("getConsoleDevUrl should build dev platform URLs for both sites", () => {
    expect(getConsoleDevUrl("env-abc", "static-hosting")).toBe(
      "https://tcb.cloud.tencent.com/dev?envId=env-abc#static-hosting",
    );
    expect(getConsoleDevUrl("env-abc", "static-hosting", "intl")).toBe(
      "https://tcb.tencentcloud.com/dev?envId=env-abc#static-hosting",
    );
  });

  it("getConsoleDevUrl should follow the resolution chain when site is omitted", () => {
    process.env.TCB_SITE = "intl";
    expect(getConsoleDevUrl("env-abc", "static-hosting")).toBe(
      "https://tcb.tencentcloud.com/dev?envId=env-abc#static-hosting",
    );
  });

  it("getConsoleDevUrl should encodeURIComponent the envId", () => {
    expect(getConsoleDevUrl("env a/b?c")).toBe(
      "https://tcb.cloud.tencent.com/dev?envId=env%20a%2Fb%3Fc",
    );
  });

  it("getConsoleDevUrl should dedupe leading # in hash", () => {
    expect(getConsoleDevUrl("env-abc", "#data-models")).toBe(
      "https://tcb.cloud.tencent.com/dev?envId=env-abc#data-models",
    );
  });

  it("getConsoleDevUrl should omit query when envId is missing", () => {
    expect(getConsoleDevUrl(undefined)).toBe("https://tcb.cloud.tencent.com/dev");
    expect(getConsoleDevUrl(undefined, "static-hosting", "intl")).toBe(
      "https://tcb.tencentcloud.com/dev#static-hosting",
    );
  });
});
