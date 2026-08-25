import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRegisterEnvTools,
  mockRegisterDatabaseTools,
  mockRegisterSqlDatabaseTools,
  mockRegisterPgDatabaseTools,
  mockRegisterPgStorageTools,
  mockRegisterDataModelTools,
  mockRegisterFunctionTools,
  mockRegisterHostingTools,
  mockRegisterRagTools,
  mockRegisterSetupTools,
  mockRegisterStorageTools,
  mockRegisterCapiTools,
  mockRegisterCloudRunTools,
  mockRegisterGatewayTools,
  mockRegisterAppAuthTools,
  mockRegisterPermissionTools,
  mockRegisterLogTools,
  mockRegisterAgentTools,
  mockRegisterAppTools,
  mockRegisterMsgPushTools,
  mockResolveSiteAndRegion,
} = vi.hoisted(() => ({
  mockRegisterEnvTools: vi.fn(),
  mockRegisterDatabaseTools: vi.fn(),
  mockRegisterSqlDatabaseTools: vi.fn(),
  mockRegisterPgDatabaseTools: vi.fn(),
  mockRegisterPgStorageTools: vi.fn(),
  mockRegisterDataModelTools: vi.fn(),
  mockRegisterFunctionTools: vi.fn(),
  mockRegisterHostingTools: vi.fn(),
  mockRegisterRagTools: vi.fn(),
  mockRegisterSetupTools: vi.fn(),
  mockRegisterStorageTools: vi.fn(),
  mockRegisterCapiTools: vi.fn(),
  mockRegisterCloudRunTools: vi.fn(),
  mockRegisterGatewayTools: vi.fn(),
  mockRegisterAppAuthTools: vi.fn(),
  mockRegisterPermissionTools: vi.fn(),
  mockRegisterLogTools: vi.fn(),
  mockRegisterAgentTools: vi.fn(),
  mockRegisterAppTools: vi.fn(),
  mockRegisterMsgPushTools: vi.fn(),
  mockResolveSiteAndRegion: vi.fn(() => ({ site: "domestic", region: "ap-shanghai" })),
}));

vi.mock("./tools/env.js", () => ({ registerEnvTools: mockRegisterEnvTools }));
vi.mock("./tools/databaseNoSQL.js", () => ({ registerDatabaseTools: mockRegisterDatabaseTools }));
vi.mock("./tools/databaseSQL.js", () => ({ registerSQLDatabaseTools: mockRegisterSqlDatabaseTools }));
vi.mock("./tools/databasePG.js", () => ({ registerPGDatabaseTools: mockRegisterPgDatabaseTools }));
vi.mock("./tools/storagePG.js", () => ({ registerPGStorageTools: mockRegisterPgStorageTools }));
vi.mock("./tools/dataModel.js", () => ({ registerDataModelTools: mockRegisterDataModelTools }));
vi.mock("./tools/functions.js", () => ({ registerFunctionTools: mockRegisterFunctionTools }));
vi.mock("./tools/hosting.js", () => ({ registerHostingTools: mockRegisterHostingTools }));
vi.mock("./tools/rag.js", () => ({ registerRagTools: mockRegisterRagTools }));
vi.mock("./tools/setup.js", () => ({ registerSetupTools: mockRegisterSetupTools }));
vi.mock("./tools/storage.js", () => ({ registerStorageTools: mockRegisterStorageTools }));
vi.mock("./tools/capi.js", () => ({ registerCapiTools: mockRegisterCapiTools }));
vi.mock("./tools/cloudrun.js", () => ({ registerCloudRunTools: mockRegisterCloudRunTools }));
vi.mock("./tools/gateway.js", () => ({ registerGatewayTools: mockRegisterGatewayTools }));
vi.mock("./tools/app-auth.js", () => ({ registerAppAuthTools: mockRegisterAppAuthTools }));
vi.mock("./tools/permissions.js", () => ({ registerPermissionTools: mockRegisterPermissionTools }));
vi.mock("./tools/logs.js", () => ({ registerLogTools: mockRegisterLogTools }));
vi.mock("./tools/agents.js", () => ({ registerAgentTools: mockRegisterAgentTools }));
vi.mock("./tools/apps.js", () => ({ registerAppTools: mockRegisterAppTools }));
vi.mock("./tools/msg-push.js", () => ({ registerMsgPushTools: mockRegisterMsgPushTools }));
vi.mock("./utils/tool-wrapper.js", () => ({
  wrapServerWithTelemetry: vi.fn(),
  applyCategoryAnnotationMeta: (config: unknown) => config,
}));
vi.mock("./utils/cloud-mode.js", () => ({
  enableCloudMode: vi.fn(),
  isCloudMode: vi.fn(() => false),
}));
vi.mock("./utils/site-map.js", () => ({
  resolveSiteAndRegion: mockResolveSiteAndRegion,
  SITE_REGION_MAP: {
    domestic: { capabilities: { noSql: true } },
    intl: { capabilities: { noSql: false } },
  },
}));
vi.mock("@modelcontextprotocol/sdk/types.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@modelcontextprotocol/sdk/types.js")>();
  return {
    ...actual,
    SetLevelRequestSchema: actual.SetLevelRequestSchema ?? {},
  };
});

describe("server plugin registration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.npm_package_version = "0.0.0-test";
  });

  it("should register default plugins", async () => {
    const { createCloudBaseMcpServer } = await import("./server.js");

    await createCloudBaseMcpServer({ enableTelemetry: false });

    expect(mockRegisterAppAuthTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterPermissionTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterLogTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterAgentTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterAppTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterPgDatabaseTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterPgStorageTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterSqlDatabaseTools).toHaveBeenCalledTimes(1);
  });

  it("should allow MySQL tools to be explicitly enabled with PG plugins", async () => {
    const { createCloudBaseMcpServer } = await import("./server.js");

    await createCloudBaseMcpServer({
      enableTelemetry: false,
      pluginsEnabled: ["database", "pg_database", "pg_storage", "mysql_database"],
    });

    expect(mockRegisterPgDatabaseTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterPgStorageTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterSqlDatabaseTools).toHaveBeenCalledTimes(1);
  });

  it("should support legacy plugin aliases", async () => {
    const { createCloudBaseMcpServer } = await import("./server.js");

    await createCloudBaseMcpServer({
      enableTelemetry: false,
      pluginsEnabled: ["access-control", "security-rules", "secret-rules", "app-auth", "apps"],
    });

    expect(mockRegisterPermissionTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterAppAuthTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterAppTools).toHaveBeenCalledTimes(1);
  });

  it("should register NoSQL database tools for domestic site even with ap-singapore region", async () => {
    mockResolveSiteAndRegion.mockReturnValue({ site: "domestic", region: "ap-singapore" });

    const { createCloudBaseMcpServer } = await import("./server.js");
    await createCloudBaseMcpServer({
      enableTelemetry: false,
      pluginsEnabled: ["database"],
    });

    expect(mockRegisterDatabaseTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterDataModelTools).toHaveBeenCalledTimes(1);
  });

  it("should skip NoSQL database tools for intl site", async () => {
    mockResolveSiteAndRegion.mockReturnValue({ site: "intl", region: "ap-singapore" });

    const { createCloudBaseMcpServer } = await import("./server.js");
    await createCloudBaseMcpServer({
      enableTelemetry: false,
      pluginsEnabled: ["database"],
    });

    expect(mockRegisterDatabaseTools).not.toHaveBeenCalled();
    expect(mockRegisterDataModelTools).toHaveBeenCalledTimes(1);
  });

  it("should skip NoSQL tools for database-nosql plugin on intl site", async () => {
    mockResolveSiteAndRegion.mockReturnValue({ site: "intl", region: "ap-singapore" });

    const { createCloudBaseMcpServer } = await import("./server.js");
    await createCloudBaseMcpServer({
      enableTelemetry: false,
      pluginsEnabled: ["database-nosql"],
    });

    expect(mockRegisterDatabaseTools).not.toHaveBeenCalled();
  });

  it("should NOT register msg-push tools by default (opt-in plugin)", async () => {
    const { createCloudBaseMcpServer } = await import("./server.js");

    await createCloudBaseMcpServer({ enableTelemetry: false });

    expect(mockRegisterMsgPushTools).not.toHaveBeenCalled();
  });

  it("should register msg-push tools when explicitly enabled", async () => {
    const { createCloudBaseMcpServer } = await import("./server.js");

    await createCloudBaseMcpServer({
      enableTelemetry: false,
      pluginsEnabled: ["msg-push"],
    });

    expect(mockRegisterMsgPushTools).toHaveBeenCalledTimes(1);
  });
});
