import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAppAuthTools } from "./app-auth.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockLogCloudBaseResult,
  mockTcbCall,
  mockCreateCustomLoginKeys,
  mockGetLoginConfigListV2,
  mockUpdateLoginConfigV2,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockTcbCall: vi.fn(),
  mockCreateCustomLoginKeys: vi.fn(),
  mockGetLoginConfigListV2: vi.fn(),
  mockUpdateLoginConfigV2: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn((name, meta, handler) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerAppAuthTools(server);

  return { tools };
}

describe("app auth tools", () => {
  let tools: ReturnType<typeof createMockServer>["tools"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvId.mockResolvedValue("env-test");
    mockGetLoginConfigListV2.mockResolvedValue({
      AnonymousLogin: true,
      UserNameLogin: true,
      PhoneNumberLogin: false,
      EmailLogin: true,
      SmsVerificationConfig: { Type: "default" },
      MfaConfig: null,
      PwdUpdateStrategy: null,
    });
    mockUpdateLoginConfigV2.mockResolvedValue(true);
    mockTcbCall.mockResolvedValue({
      AnonymousLogin: true,
      UserNameLogin: true,
      PhoneNumberLogin: false,
      EmailLogin: true,
      SmsVerificationConfig: { Type: "default" },
      MfaConfig: null,
      PwdUpdateStrategy: null,
    });
    mockCreateCustomLoginKeys.mockResolvedValue({
      PrivateKey: "private-key",
      PublicKey: "public-key",
      RequestId: "req-auth-keys",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      commonService: vi.fn(() => ({
        call: mockTcbCall,
      })),
      env: {
        getLoginConfigListV2: mockGetLoginConfigListV2,
        updateLoginConfigV2: mockUpdateLoginConfigV2,
        createCustomLoginKeys: mockCreateCustomLoginKeys,
      },
    });
    ({ tools } = createMockServer());
  });

  it("queryAppAuth(action=getLoginConfig) should use manager sdk helper", async () => {
    const result = await tools.queryAppAuth.handler({ action: "getLoginConfig" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockGetLoginConfigListV2).toHaveBeenCalled();
    expect(mockTcbCall).not.toHaveBeenCalledWith({
      Action: "DescribeLoginConfig",
      Param: { EnvId: "env-test" },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getLoginConfig",
        envId: "env-test",
        loginConfig: {
          AnonymousLogin: true,
          UserNameLogin: true,
          EmailLogin: true,
        },
      },
    });
  });

  it("manageAppAuth(action=updateLoginConfig) should use manager sdk helper", async () => {
    const result = await tools.manageAppAuth.handler({
      action: "updateLoginConfig",
      loginConfig: {
        AnonymousLogin: false,
        UserNameLogin: true,
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockGetLoginConfigListV2).toHaveBeenCalled();
    expect(mockUpdateLoginConfigV2).toHaveBeenCalledWith({
      EnvId: "env-test",
      PhoneNumberLogin: false,
      EmailLogin: true,
      AnonymousLogin: false,
      UserNameLogin: true,
      SmsVerificationConfig: { Type: "default" },
    });
    expect(mockTcbCall).not.toHaveBeenCalledWith({
      Action: "ModifyLoginConfig",
      Param: {
        EnvId: "env-test",
        AnonymousLogin: false,
        UserNameLogin: true,
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "updateLoginConfig",
        envId: "env-test",
        appliedLoginConfig: {
          EnvId: "env-test",
          PhoneNumberLogin: false,
          EmailLogin: true,
          AnonymousLogin: false,
          UserNameLogin: true,
        },
      },
    });
  });

  it("manageAppAuth(action=updateProvider) should call ModifyProvider", async () => {
    mockTcbCall.mockResolvedValue({
      RequestId: "req-provider-update",
    });

    const result = await tools.manageAppAuth.handler({
      action: "updateProvider",
      providerId: "email",
      config: {
        On: "TRUE",
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockTcbCall).toHaveBeenCalledWith({
      Action: "ModifyProvider",
      Param: {
        EnvId: "env-test",
        Id: "email",
        On: "TRUE",
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "updateProvider",
        envId: "env-test",
        providerId: "email",
      },
    });
  });

  it("manageAppAuth(action=createCustomLoginKeys) should use manager sdk helper", async () => {
    const result = await tools.manageAppAuth.handler({
      action: "createCustomLoginKeys",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateCustomLoginKeys).toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createCustomLoginKeys",
        envId: "env-test",
      },
    });
  });
});
