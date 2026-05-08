import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRegisterEnvTools,
  mockRegisterDatabaseTools,
  mockRegisterSqlDatabaseTools,
  mockRegisterDataModelTools,
  mockRegisterDownloadTools,
  mockRegisterFunctionTools,
  mockRegisterHostingTools,
  mockRegisterRagTools,
  mockRegisterSetupTools,
  mockRegisterStorageTools,
  mockRegisterCapiTools,
  mockRegisterCloudRunTools,
  mockRegisterGatewayTools,
  mockRegisterInviteCodeTools,
  mockRegisterAppAuthTools,
  mockRegisterPermissionTools,
  mockRegisterLogTools,
  mockRegisterAgentTools,
  mockRegisterAppTools,
} = vi.hoisted(() => ({
  mockRegisterEnvTools: vi.fn(),
  mockRegisterDatabaseTools: vi.fn(),
  mockRegisterSqlDatabaseTools: vi.fn(),
  mockRegisterDataModelTools: vi.fn(),
  mockRegisterDownloadTools: vi.fn(),
  mockRegisterFunctionTools: vi.fn(),
  mockRegisterHostingTools: vi.fn(),
  mockRegisterRagTools: vi.fn(),
  mockRegisterSetupTools: vi.fn(),
  mockRegisterStorageTools: vi.fn(),
  mockRegisterCapiTools: vi.fn(),
  mockRegisterCloudRunTools: vi.fn(),
  mockRegisterGatewayTools: vi.fn(),
  mockRegisterInviteCodeTools: vi.fn(),
  mockRegisterAppAuthTools: vi.fn(),
  mockRegisterPermissionTools: vi.fn(),
  mockRegisterLogTools: vi.fn(),
  mockRegisterAgentTools: vi.fn(),
  mockRegisterAppTools: vi.fn(),
}));

vi.mock("./tools/env.js", () => ({ registerEnvTools: mockRegisterEnvTools }));
vi.mock("./tools/databaseNoSQL.js", () => ({ registerDatabaseTools: mockRegisterDatabaseTools }));
vi.mock("./tools/databaseSQL.js", () => ({ registerSQLDatabaseTools: mockRegisterSqlDatabaseTools }));
vi.mock("./tools/dataModel.js", () => ({ registerDataModelTools: mockRegisterDataModelTools }));
vi.mock("./tools/download.js", () => ({ registerDownloadTools: mockRegisterDownloadTools }));
vi.mock("./tools/functions.js", () => ({ registerFunctionTools: mockRegisterFunctionTools }));
vi.mock("./tools/hosting.js", () => ({ registerHostingTools: mockRegisterHostingTools }));
vi.mock("./tools/rag.js", () => ({ registerRagTools: mockRegisterRagTools }));
vi.mock("./tools/setup.js", () => ({ registerSetupTools: mockRegisterSetupTools }));
vi.mock("./tools/storage.js", () => ({ registerStorageTools: mockRegisterStorageTools }));
vi.mock("./tools/capi.js", () => ({ registerCapiTools: mockRegisterCapiTools }));
vi.mock("./tools/cloudrun.js", () => ({ registerCloudRunTools: mockRegisterCloudRunTools }));
vi.mock("./tools/gateway.js", () => ({ registerGatewayTools: mockRegisterGatewayTools }));
vi.mock("./tools/invite-code.js", () => ({ registerInviteCodeTools: mockRegisterInviteCodeTools }));
vi.mock("./tools/app-auth.js", () => ({ registerAppAuthTools: mockRegisterAppAuthTools }));
vi.mock("./tools/permissions.js", () => ({ registerPermissionTools: mockRegisterPermissionTools }));
vi.mock("./tools/logs.js", () => ({ registerLogTools: mockRegisterLogTools }));
vi.mock("./tools/agents.js", () => ({ registerAgentTools: mockRegisterAgentTools }));
vi.mock("./tools/apps.js", () => ({ registerAppTools: mockRegisterAppTools }));
vi.mock("./utils/tool-wrapper.js", () => ({ wrapServerWithTelemetry: vi.fn() }));
vi.mock("./utils/cloud-mode.js", () => ({
  enableCloudMode: vi.fn(),
  isCloudMode: vi.fn(() => false),
}));
vi.mock("./utils/tencent-cloud.js", () => ({ isInternationalRegion: vi.fn(() => false) }));
vi.mock("@modelcontextprotocol/sdk/types.js", () => ({ SetLevelRequestSchema: {} }));

describe("server plugin registration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("should register app tools in the default plugin set", async () => {
    const { createCloudBaseMcpServer } = await import("./server.js");

    await createCloudBaseMcpServer({ enableTelemetry: false });

    expect(mockRegisterAppAuthTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterPermissionTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterLogTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterAgentTools).toHaveBeenCalledTimes(1);
    expect(mockRegisterAppTools).toHaveBeenCalledTimes(1);
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
});
