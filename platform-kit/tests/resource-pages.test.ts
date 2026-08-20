import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FunctionsTable, FunctionDetail } from "../src/components/functions/FunctionsParts.js";
import { FunctionsPage } from "../src/components/functions/FunctionsPage.js";
import { CloudRunTable, CloudRunDetail } from "../src/components/cloudrun/CloudRunParts.js";
import { CloudRunPage } from "../src/components/cloudrun/CloudRunPage.js";
import { HostingDomains, HostingFileBrowser, HostingVersions } from "../src/components/hosting/HostingParts.js";
import { HostingPage } from "../src/components/hosting/HostingPage.js";
import { StorageBucketTable, StorageFileBrowser, StorageRulesPanel } from "../src/components/storage/StorageParts.js";
import { StoragePage } from "../src/components/storage/StoragePage.js";
import { KitProvider } from "../src/hooks/use-menu.js";
import { SEARCH_DEBOUNCE_MS } from "../src/hooks/use-debounce.js";
import type { PlatformProvider } from "../src/core/provider.js";

const labels = {
  "fn.tab.config": "基本配置",
  "fn.tab.env": "环境变量",
  "fn.tab.triggers": "触发器",
  "fn.tab.logs": "最近调用",
  "fn.invoke.unsupported": "调用测试不可用",
  "common.empty": "暂无数据",
  "cr.tab.versions": "版本",
  "cr.tab.deploys": "部署记录",
  "cr.tab.logs": "日志",
};

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
    getHostingOverview: async () => ({ domains: [] }),
    listHostingVersions: empty,
    listStorageBuckets: empty,
    ...overrides,
  } as PlatformProvider;
}

function renderWithKit(node: React.ReactElement, provider?: PlatformProvider): string {
  return renderToStaticMarkup(
    React.createElement(
      KitProvider,
      { locale: "zh" as const, provider: provider ?? mockProvider(), children: node },
    ),
  );
}

describe("resource page rendering", () => {
  it("uses 200ms search debounce", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(200);
  });

  it("renders function list and empty state", () => {
    const empty = renderToStaticMarkup(
      React.createElement(FunctionsTable, {
        functions: [],
        empty: "暂无云函数",
        columns: ["名称", "运行时", "状态", "触发次数", "最近更新"],
        onSelect: () => undefined,
      }),
    );
    expect(empty).toContain("暂无云函数");

    const list = renderToStaticMarkup(
      React.createElement(FunctionsTable, {
        functions: [
          { name: "hello", runtime: "Nodejs18.15", status: "Active", invokeCount: 3, updatedAt: "2026-08-01" },
        ],
        empty: "暂无云函数",
        columns: ["名称", "运行时", "状态", "触发次数", "最近更新"],
        onSelect: () => undefined,
      }),
    );
    expect(list).toContain("hello");
    expect(list).toContain("Nodejs18.15");
  });

  it("renders function detail tabs", () => {
    const html = renderToStaticMarkup(
      React.createElement(FunctionDetail, {
        detail: {
          name: "hello",
          runtime: "Nodejs18.15",
          status: "Active",
          handler: "index.main",
          timeout: 20,
          memorySize: 256,
          environment: [{ key: "FOO", value: "bar" }],
          triggers: [{ name: "timer", type: "timer" }],
        },
        logs: [{ requestId: "req-1", startTime: "12:00", status: "ok", log: "done" }],
        labels,
      }),
    );
    expect(html).toContain("index.main");
    expect(html).toContain("调用测试不可用");
  });

  it("renders FunctionsPage title with mock provider", () => {
    const html = renderWithKit(React.createElement(FunctionsPage));
    expect(html).toContain("云函数");
  });

  it("renders CloudRun list, empty state, and version tab", () => {
    const empty = renderToStaticMarkup(
      React.createElement(CloudRunTable, {
        services: [],
        empty: "暂无云托管服务",
        columns: ["服务名", "状态", "运行版本", "流量", "CPU", "内存", "实例数"],
        onSelect: () => undefined,
      }),
    );
    expect(empty).toContain("暂无云托管服务");

    const list = renderToStaticMarkup(
      React.createElement(CloudRunTable, {
        services: [{ name: "api", status: "running", version: "v1", cpu: "0.5", memory: "256Mi" }],
        empty: "暂无云托管服务",
        columns: ["服务名", "状态", "运行版本", "流量", "CPU", "内存", "实例数"],
        onSelect: () => undefined,
      }),
    );
    expect(list).toContain("api");

    const detail = renderToStaticMarkup(
      React.createElement(CloudRunDetail, {
        versions: [{ versionName: "rev-1", status: "ready", deployedAt: "2026-08-01" }],
        deploys: [],
        logLines: [],
        labels,
        logKind: "process",
        onLogKind: () => undefined,
      }),
    );
    expect(detail).toContain("rev-1");
  });

  it("renders CloudRunPage title with mock provider", () => {
    const html = renderWithKit(React.createElement(CloudRunPage));
    expect(html).toContain("云托管");
  });

  it("renders hosting domains and file empty state", () => {
    const html = renderToStaticMarkup(
      React.createElement(HostingDomains, {
        info: { domains: [{ domain: "app.tcloudbaseapp.com", status: "ONLINE" }] },
        empty: "暂无静态托管资源",
        title: "访问地址",
      }),
    );
    expect(html).toContain("app.tcloudbaseapp.com");

    const files = renderToStaticMarkup(
      React.createElement(HostingFileBrowser, {
        files: [],
        prefix: "",
        empty: "暂无数据",
        hint: "宿主 COS",
        onOpenDir: () => undefined,
      }),
    );
    expect(files).toContain("暂无数据");
    expect(files).toContain("宿主 COS");
  });

  it("renders hosting defaultUrl fallback and versions", () => {
    const html = renderToStaticMarkup(
      React.createElement(HostingDomains, {
        info: { domains: [], defaultUrl: "https://static.example.com" },
        empty: "暂无静态托管资源",
        title: "访问地址",
      }),
    );
    expect(html).toContain("https://static.example.com");

    const versions = renderToStaticMarkup(
      React.createElement(HostingVersions, {
        records: [
          {
            id: "1",
            resourceType: "hosting",
            resourceName: "hosting",
            status: "success",
            deployedAt: "2026-08-01",
          },
        ],
        empty: "暂无数据",
        title: "部署记录",
      }),
    );
    expect(versions).toContain("hosting");
  });

  it("renders HostingPage title with mock provider", () => {
    const html = renderWithKit(
      React.createElement(HostingPage),
      mockProvider({
        getHostingOverview: async () => ({
          domains: [],
          defaultUrl: "https://cloudbase-d5gkhkdneb895f9d0-1409864723.tcloudbaseapp.com",
        }),
      }),
    );
    expect(html).toContain("静态托管");
  });

  it("renders storage bucket list, empty state, and file browser", () => {
    const empty = renderToStaticMarkup(
      React.createElement(StorageBucketTable, {
        buckets: [],
        empty: "暂无存储桶",
        columns: ["名称", "地域", "创建时间", "存储量"],
        onSelect: () => undefined,
      }),
    );
    expect(empty).toContain("暂无存储桶");

    const list = renderToStaticMarkup(
      React.createElement(StorageBucketTable, {
        buckets: [{ name: "a-123", region: "ap-shanghai", createdAt: "2026-01-01", sizeLabel: "2.0 kB" }],
        empty: "暂无存储桶",
        columns: ["名称", "地域", "创建时间", "存储量"],
        onSelect: () => undefined,
      }),
    );
    expect(list).toContain("a-123");

    const files = renderToStaticMarkup(
      React.createElement(StorageFileBrowser, {
        files: [{ name: "logo.png", cloudPath: "logo.png", size: 1, sizeLabel: "1 B", isDirectory: false }],
        prefix: "",
        empty: "暂无数据",
        uploadHint: "宿主 COS",
        onOpenDir: () => undefined,
      }),
    );
    expect(files).toContain("logo.png");
  });

  it("renders storage rules panel", () => {
    const html = renderToStaticMarkup(
      React.createElement(StorageRulesPanel, {
        aclTag: "READONLY",
        rule: "",
        saveLabel: "保存规则",
      }),
    );
    expect(html).toContain("READONLY");
  });

  it("renders StoragePage title with mock provider", () => {
    const html = renderWithKit(
      React.createElement(StoragePage),
      mockProvider({
        listStorageBuckets: async () => [
          { name: "636c-cloudbase-d5gkhkdneb895f9d0-1409864723", region: "ap-shanghai" },
        ],
        describeBucketWriteSupport: async () => ({
          supported: false,
          reason: "no control-plane",
        }),
      }),
    );
    expect(html).toContain("云存储");
  });
});
