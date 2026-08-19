import { describe, expect, it } from "vitest";
import {
  mapAppToEndpoint,
  mapVersionToDeployment,
  normalizeDeployStatus,
  normalizeUrl,
  sortDeploymentsNewestFirst,
} from "../src/services/apps-access.js";
import { isFeatureAvailable, EFeatureId } from "../src/core/features.js";
import { t } from "../src/i18n/index.js";

describe("apps-access", () => {
  it("normalizeUrl adds https scheme", () => {
    expect(normalizeUrl("demo.webapps.tcloudbase.com")).toBe("https://demo.webapps.tcloudbase.com");
    expect(normalizeUrl("https://x.com")).toBe("https://x.com");
  });

  it("mapAppToEndpoint maps Domain field", () => {
    const endpoint = mapAppToEndpoint("demo", { Domain: "demo-env.webapps.tcloudbase.com" });
    expect(endpoint?.url).toBe("https://demo-env.webapps.tcloudbase.com");
    expect(endpoint?.resourceType).toBe("app");
  });

  it("mapVersionToDeployment normalizes status", () => {
    const record = mapVersionToDeployment(
      "demo",
      { Status: "SUCCESS", BuildId: "b1", CreateTime: "2026-01-01T00:00:00Z" },
      "https://demo.webapps.tcloudbase.com",
    );
    expect(record?.status).toBe("success");
    expect(record?.previewUrl).toBe("https://demo.webapps.tcloudbase.com");
  });

  it("normalizeDeployStatus covers variants", () => {
    expect(normalizeDeployStatus("Failed")).toBe("failed");
    expect(normalizeDeployStatus("building")).toBe("building");
    expect(normalizeDeployStatus("READY")).toBe("success");
  });

  it("sortDeploymentsNewestFirst orders by deployedAt", () => {
    const sorted = sortDeploymentsNewestFirst([
      { id: "a", resourceType: "app", resourceName: "a", status: "success", deployedAt: "2026-01-01" },
      { id: "b", resourceType: "app", resourceName: "b", status: "success", deployedAt: "2026-02-01" },
    ]);
    expect(sorted[0]?.id).toBe("b");
  });
});

describe("features", () => {
  it("detects postgres env from runtimeMode", () => {
    expect(isFeatureAvailable(EFeatureId.POSTGRES_ENV, { runtimeMode: "postgresql" })).toBe(true);
    expect(isFeatureAvailable(EFeatureId.NON_POSTGRES_ENV, { runtimeMode: "postgresql" })).toBe(false);
  });
});

describe("i18n", () => {
  it("translates zh and en", () => {
    expect(t("zh", "menu.overview")).toBe("概览");
    expect(t("en", "menu.overview")).toBe("Overview");
  });
});
