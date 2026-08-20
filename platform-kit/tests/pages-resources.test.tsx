import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KitProvider } from "../src/hooks/use-menu.js";
import { FunctionsPage } from "../src/components/resources/FunctionsPage.js";
import { CloudRunPage } from "../src/components/resources/CloudRunPage.js";
import { HostingPage } from "../src/components/resources/HostingPage.js";
import { StoragePage } from "../src/components/resources/StoragePage.js";
import { KvList, SimpleTable } from "../src/components/resources/ResourceParts.js";
import { filterFunctions, mapFunctionSummary, mapStorageBucket } from "../src/services/resource-map.js";
import { t } from "../src/i18n/index.js";
import type { PlatformProvider } from "../src/core/provider.js";

function mockProvider(overrides: Partial<PlatformProvider> = {}): PlatformProvider {
  const empty = async () => [];
  return {
    listTables: empty,
    listTableColumns: empty,
    readRows: async () => ({ columns: [], rows: [] }),
    runReadSql: async () => ({ columns: [], rows: [] }),
    listStorage: empty,
    storageUrl: async () => ({ url: "https://example.com/f", expiresInSec: 3600 }),
    authStatus: async () => ({ signedIn: true, message: "ok" }),
    listEnvironments: empty,
    setEnvironment: async () => ({ signedIn: true, message: "ok" }),
    appAuthConfig: async () => ({ providers: [] }),
    listAppUsers: empty,
    listSecrets: empty,
    metrics: empty,
    usage: empty,
    recentErrors: empty,
    envInfo: async () => ({
      envId: "env",
      regionLabel: "上海",
      functionCount: 0,
      hostingDomainCount: 0,
      timezone: "Asia/Shanghai",
    }),
    listAccessEndpoints: empty,
    listDeployments: empty,
    searchLogs: async () => ({ entries: [] }),
    getTableSchema: async () => {
      throw new Error("unused");
    },
    listSchemaPolicies: empty,
    runPgDDL: async () => ({ ok: true, message: "ok" }),
    searchAppUsers: async () => ({ users: [] }),
    setAppUserStatus: async () => undefined,
    listGatewayRoutes: empty,
    upsertGatewayRoute: async () => undefined,
    deleteGatewayRoute: async () => undefined,
    getGatewayPrivilege: async () => ({}),
    fetchMetricSeries: async (name) => ({ name, label: name, valueLabel: "—", points: [] }),
    listFunctions: empty,
    listCloudRunServices: empty,
    listHostingDomains: empty,
    listHostingVersions: empty,
    listStorageBuckets: empty,
    ...overrides,
  } as PlatformProvider;
}

function renderWithKit(node: React.ReactElement, provider?: PlatformProvider): string {
  return renderToStaticMarkup(
    React.createElement(KitProvider, { locale: "zh", provider: provider ?? mockProvider(), children: node }),
  );
}

describe("resource mappers", () => {
  it("maps function list rows and filters by keyword", () => {
    const mapped = mapFunctionSummary({
      FunctionName: "hello",
      Runtime: "Nodejs18.15",
      Status: "Active",
      ModTime: "2026-01-01",
    });
    expect(mapped?.name).toBe("hello");
    expect(filterFunctions([mapped!], "hel")).toHaveLength(1);
    expect(filterFunctions([mapped!], "python")).toHaveLength(0);
  });

  it("maps storage buckets from DescribeEnvs Storages", () => {
    const bucket = mapStorageBucket({ Bucket: "636c-env-1", Region: "ap-shanghai" });
    expect(bucket?.name).toBe("636c-env-1");
  });
});

describe("resource pages", () => {
  it("renders functions page chrome, list, empty, and detail", () => {
    const chrome = renderWithKit(React.createElement(FunctionsPage));
    expect(chrome).toContain(t("zh", "fn.title"));

    const list = renderToStaticMarkup(
      React.createElement(SimpleTable, {
        columns: ["名称", "运行时"],
        empty: t("zh", "fn.empty"),
        rows: [{ key: "hello", cells: ["hello", "Nodejs18.15"] }],
      }),
    );
    expect(list).toContain("hello");
    expect(list).toContain("Nodejs18.15");

    const empty = renderToStaticMarkup(
      React.createElement(SimpleTable, {
        columns: ["名称"],
        empty: t("zh", "fn.empty"),
        rows: [],
      }),
    );
    expect(empty).toContain(t("zh", "fn.empty"));

    const detail = renderToStaticMarkup(
      React.createElement(KvList, {
        rows: [
          { k: "Runtime", v: "Nodejs18.15" },
          { k: "Handler", v: "index.main" },
        ],
      }),
    );
    expect(detail).toContain("index.main");
  });

  it("renders cloudrun page chrome and empty/list", () => {
    const chrome = renderWithKit(React.createElement(CloudRunPage));
    expect(chrome).toContain(t("zh", "run.title"));
    const empty = renderToStaticMarkup(
      React.createElement(SimpleTable, { columns: ["Service"], empty: t("zh", "run.empty"), rows: [] }),
    );
    expect(empty).toContain(t("zh", "run.empty"));
    const list = renderToStaticMarkup(
      React.createElement(SimpleTable, {
        columns: ["Service", "Status"],
        empty: t("zh", "run.empty"),
        rows: [{ key: "api", cells: ["api", "normal"] }],
      }),
    );
    expect(list).toContain("api");
  });

  it("renders hosting page chrome and domain list", () => {
    const chrome = renderWithKit(React.createElement(HostingPage));
    expect(chrome).toContain(t("zh", "hosting.title"));
    expect(chrome).toContain(t("zh", "hosting.domains"));
    const list = renderToStaticMarkup(
      React.createElement(SimpleTable, {
        columns: ["Domain"],
        empty: t("zh", "hosting.empty"),
        rows: [{ key: "d", cells: ["demo.tcloudbaseapp.com"] }],
      }),
    );
    expect(list).toContain("demo.tcloudbaseapp.com");
  });

  it("renders storage page chrome, bucket list, and empty", () => {
    const chrome = renderWithKit(React.createElement(StoragePage));
    expect(chrome).toContain(t("zh", "storage.title"));
    expect(chrome).toContain(t("zh", "storage.bucketCreateUnsupported"));
    const list = renderToStaticMarkup(
      React.createElement(SimpleTable, {
        columns: ["Bucket"],
        empty: t("zh", "storage.empty"),
        rows: [{ key: "b", cells: ["636c-env-1"] }],
      }),
    );
    expect(list).toContain("636c-env-1");
    const empty = renderToStaticMarkup(
      React.createElement(SimpleTable, { columns: ["Bucket"], empty: t("zh", "storage.empty"), rows: [] }),
    );
    expect(empty).toContain(t("zh", "storage.empty"));
  });
});
