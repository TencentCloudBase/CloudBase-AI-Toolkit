import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { registerAppAuthTools } from "./app-auth.js";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockLogCloudBaseResult,
  mockTcbCall,
  mockCreateCustomLoginKeys,
  mockGetLoginConfig,
  mockModifyLoginConfig,
  mockGetProviders,
  mockDescribeClient,
  mockModifyClient,
  mockAddProvider,
  mockModifyProvider,
  mockDeleteProvider,
  mockCreateApiKey,
  mockDeleteApiKey,
  mockDescribeApiKeyList,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockTcbCall: vi.fn(),
  mockCreateCustomLoginKeys: vi.fn(),
  mockGetLoginConfig: vi.fn(),
  mockModifyLoginConfig: vi.fn(),
  mockGetProviders: vi.fn(),
  mockDescribeClient: vi.fn(),
  mockModifyClient: vi.fn(),
  mockAddProvider: vi.fn(),
  mockModifyProvider: vi.fn(),
  mockDeleteProvider: vi.fn(),
  mockCreateApiKey: vi.fn(),
  mockDeleteApiKey: vi.fn(),
  mockDescribeApiKeyList: vi.fn(),
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

  const expectedSdkHints = {
    phoneOtp: "auth.signInWithOtp({ phone })",
    emailOtp: "auth.signInWithOtp({ email })",
    password: "auth.signInWithPassword({ username|email|phone, password })",
    signup: "auth.signUp({ phone|email, ... })",
    verifyOtp: "verifyOtp({ token })",
    anonymous: "auth.signInAnonymously()",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetEnvId.mockResolvedValue("env-test");
    mockGetLoginConfig.mockResolvedValue({
      AnonymousLogin: true,
      UserNameLogin: true,
      PhoneNumberLogin: false,
      EmailLogin: true,
      SmsVerificationConfig: { Type: "default" },
      MfaConfig: null,
      PwdUpdateStrategy: null,
    });
    mockModifyLoginConfig.mockResolvedValue(true);
    mockGetProviders.mockResolvedValue({
      RequestId: "req-providers",
      Providers: [],
    });
    mockDescribeClient.mockResolvedValue({
      RequestId: "req-client",
      Id: "env-test",
      AccessTokenExpiresIn: 7200,
    });
    mockModifyClient.mockResolvedValue({
      RequestId: "req-update-client",
      Id: "env-test",
      AccessTokenExpiresIn: 3600,
    });
    mockAddProvider.mockResolvedValue({ RequestId: "req-add-provider" });
    mockModifyProvider.mockResolvedValue({ RequestId: "req-provider-update" });
    mockDeleteProvider.mockResolvedValue({ RequestId: "req-delete-provider" });
    mockCreateApiKey.mockResolvedValue({
      Name: "publish_key",
      KeyId: "publish-key-id",
      ApiKey: "publish-key-token",
      ExpireAt: "2099-03-16T15:48:48+08:00",
      CreateAt: "2026-03-16T15:48:48+08:00",
    });
    mockDeleteApiKey.mockResolvedValue({ RequestId: "req-delete-api-key" });
    mockDescribeApiKeyList.mockResolvedValue({
      RequestId: "req-api-key-list",
      ApiKeyList: [
        {
          Name: "publish_key",
          KeyId: "publish-key-id",
          ApiKey: "publish-key-token",
          ExpireAt: "2099-03-16T15:48:48+08:00",
          CreateAt: "2026-03-16T15:48:48+08:00",
        },
      ],
      Total: 1,
    });
    mockTcbCall.mockResolvedValue({
      RequestId: "req-static",
      Data: [
        {
          EnvId: "env-test",
          CdnDomain: "env-test.cdn.tcloudbaseapp.com",
          Status: "online",
        },
      ],
    });
    mockCreateCustomLoginKeys.mockResolvedValue({
      PrivateKey: "private-key",
      KeyID: "custom-login-key-id",
      RequestId: "req-auth-keys",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      commonService: vi.fn(() => ({
        call: mockTcbCall,
      })),
      env: {
        getLoginConfig: mockGetLoginConfig,
        modifyLoginConfig: mockModifyLoginConfig,
        getProviders: mockGetProviders,
        describeClient: mockDescribeClient,
        modifyClient: mockModifyClient,
        addProvider: mockAddProvider,
        modifyProvider: mockModifyProvider,
        deleteProvider: mockDeleteProvider,
        createApiKey: mockCreateApiKey,
        deleteApiKey: mockDeleteApiKey,
        describeApiKeyList: mockDescribeApiKeyList,
        createCustomLoginKeys: mockCreateCustomLoginKeys,
      },
    });
    ({ tools } = createMockServer());
  });

  it("appAuth should expose the compact action surface", () => {
    const queryActions = tools.queryAppAuth.meta.inputSchema.action.options;
    const manageActions = tools.manageAppAuth.meta.inputSchema.action.options;

    expect(queryActions).toEqual([
      "getLoginConfig",
      "listProviders",
      "getProvider",
      "getClientConfig",
      "getPublishableKey",
      "getStaticDomain",
      "listApiKeys",
    ]);
    expect(manageActions).toEqual([
      "patchLoginStrategy",
      "addProvider",
      "updateProvider",
      "deleteProvider",
      "updateClientConfig",
      "ensurePublishableKey",
      "createApiKey",
      "deleteApiKey",
      "createCustomLoginKeys",
    ]);
    expect(tools.manageAppAuth.meta.inputSchema.loginConfig).toBeUndefined();
  });

  it("queryAppAuth(action=getLoginConfig) should use manager sdk helper", async () => {
    const result = await tools.queryAppAuth.handler({ action: "getLoginConfig" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockGetLoginConfig).toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      sdkStyle: "supabase-like",
      sdkHints: expectedSdkHints,
      loginMethods: {
        usernamePassword: true,
        email: true,
        anonymous: true,
        phone: false,
      },
      webSdkHint: {
        blocked: false,
        register: "auth.signUp({ username, password })",
        login: "auth.signInWithPassword({ username, password })",
        accountInputType: "text",
        avoidEmailHelpers: true,
      },
    });
  });

  it("manageAppAuth(action=patchLoginStrategy) should use manager sdk helper", async () => {
    mockGetLoginConfig
      .mockResolvedValueOnce({
        AnonymousLogin: true,
        UserNameLogin: true,
        PhoneNumberLogin: false,
        EmailLogin: true,
        SmsVerificationConfig: { Type: "default" },
      })
      .mockResolvedValueOnce({
        AnonymousLogin: false,
        UserNameLogin: true,
        PhoneNumberLogin: false,
        EmailLogin: true,
        SmsVerificationConfig: { Type: "default" },
      });

    const result = await tools.manageAppAuth.handler({
      action: "patchLoginStrategy",
      patch: {
        usernamePassword: true,
        anonymous: false,
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockGetLoginConfig).toHaveBeenCalledTimes(2);
    expect(mockModifyLoginConfig).toHaveBeenCalledWith({
      PhoneNumberLogin: false,
      EmailLogin: true,
      AnonymousLogin: false,
      UserNameLogin: true,
      SmsVerificationConfig: { Type: "default" },
    });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      sdkStyle: "supabase-like",
      sdkHints: expectedSdkHints,
      loginMethods: {
        usernamePassword: true,
        email: true,
        anonymous: false,
        phone: false,
      },
      webSdkHint: {
        blocked: false,
        register: "auth.signUp({ username, password })",
        login: "auth.signInWithPassword({ username, password })",
        accountInputType: "text",
        avoidEmailHelpers: true,
      },
    });
  });

  it("queryAppAuth(action=getLoginConfig) should return next_step when username login is disabled", async () => {
    mockGetLoginConfig.mockResolvedValueOnce({
      AnonymousLogin: true,
      UserNameLogin: false,
      PhoneNumberLogin: false,
      EmailLogin: true,
    });

    const result = await tools.queryAppAuth.handler({ action: "getLoginConfig" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      loginMethods: {
        usernamePassword: false,
        email: true,
        anonymous: true,
        phone: false,
      },
      next_step: {
        tool: "manageAppAuth",
        action: "patchLoginStrategy",
        patch: {
          usernamePassword: true,
        },
      },
      sdkStyle: "supabase-like",
      sdkHints: expectedSdkHints,
      webSdkHint: {
        blocked: true,
        reason: "plain username-style identifiers require usernamePassword auth",
        nextStep:
          'manageAppAuth({ action: "patchLoginStrategy", patch: { usernamePassword: true } })',
        accountInputType: "text",
        avoidEmailHelpers: true,
      },
    });
  });

  it("queryAppAuth should return a short error when no active environment is selected", async () => {
    mockGetEnvId.mockRejectedValueOnce({
      name: "ToolPayloadError",
      payload: { code: "ENV_REQUIRED", message: "请选择环境" },
    });

    const result = await tools.queryAppAuth.handler({ action: "getLoginConfig" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toEqual({
      success: false,
      error: "no active environment selected",
      code: "ENV_REQUIRED",
    });
  });

  it("queryAppAuth should keep auth-required errors distinct from env-required errors", async () => {
    mockGetEnvId.mockRejectedValueOnce({
      name: "ToolPayloadError",
      payload: { code: "AUTH_REQUIRED", message: "请先登录" },
    });

    const result = await tools.queryAppAuth.handler({ action: "getLoginConfig" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toEqual({
      success: false,
      error: "authentication required",
      code: "AUTH_REQUIRED",
    });
  });

  it("queryAppAuth(action=listProviders) should call getProviders", async () => {
    mockGetProviders.mockResolvedValue({
      RequestId: "req-providers",
      Providers: [
        {
          Id: "email",
          PlatformLoginConfig: { On: "TRUE" },
        },
      ],
    });

    const result = await tools.queryAppAuth.handler({ action: "listProviders" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockGetProviders).toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      providers: expect.arrayContaining([
        expect.objectContaining({ Id: "email" }),
      ]),
    });
  });

  it("queryAppAuth(action=getProvider) should call getProviders and find provider", async () => {
    mockGetProviders.mockResolvedValue({
      RequestId: "req-providers",
      Providers: [
        {
          Id: "email",
          PlatformLoginConfig: { On: "TRUE" },
        },
      ],
    });

    const result = await tools.queryAppAuth.handler({
      action: "getProvider",
      providerId: "email",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockGetProviders).toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      providerId: "email",
      provider: expect.objectContaining({ Id: "email" }),
    });
  });

  it("manageAppAuth(action=addProvider) should call addProvider", async () => {
    mockAddProvider.mockResolvedValueOnce({ RequestId: "req-add-provider", Id: "github" });

    const result = await tools.manageAppAuth.handler({
      action: "addProvider",
      providerId: "github",
      providerType: "OAUTH",
      displayName: "GitHub Login",
      config: { ClientId: "cid", ClientSecret: "secret" },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockAddProvider).toHaveBeenCalledWith({
      Id: "github",
      Name: { Message: "GitHub Login" },
      ProviderType: "OAUTH",
      Config: { ClientId: "cid", ClientSecret: "secret" },
    });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      providerId: "github",
      providerType: "OAUTH",
    });
  });

  it("manageAppAuth(action=updateProvider) should call modifyProvider", async () => {
    const result = await tools.manageAppAuth.handler({
      action: "updateProvider",
      providerId: "email",
      config: {
        On: "TRUE",
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockModifyProvider).toHaveBeenCalledWith({
      Id: "email",
      On: "TRUE",
    });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      providerId: "email",
    });
  });

  it("manageAppAuth(action=deleteProvider) should call deleteProvider", async () => {
    mockDeleteProvider.mockResolvedValueOnce({ RequestId: "req-delete-provider" });

    const result = await tools.manageAppAuth.handler({
      action: "deleteProvider",
      providerId: "github",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDeleteProvider).toHaveBeenCalledWith("github");
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      providerId: "github",
      deleted: true,
    });
  });

  it("queryAppAuth(action=getClientConfig) should call describeClient with envId", async () => {
    mockDescribeClient.mockResolvedValue({
      RequestId: "req-client",
      Id: "env-test",
      AccessTokenExpiresIn: 7200,
    });

    const result = await tools.queryAppAuth.handler({ action: "getClientConfig" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeClient).toHaveBeenCalledWith("env-test");
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      clientId: "env-test",
      clientConfig: {
        Id: "env-test",
        AccessTokenExpiresIn: 7200,
      },
    });
  });

  it("queryAppAuth(action=getClientConfig) should pass clientId as describeClient Id", async () => {
    mockDescribeClient.mockResolvedValue({ RequestId: "req-client-2" });

    await tools.queryAppAuth.handler({
      action: "getClientConfig",
      clientId: "custom-client-id",
    });

    expect(mockDescribeClient).toHaveBeenCalledWith("custom-client-id");
  });

  it("manageAppAuth(action=updateClientConfig) should call modifyClient and describeClient", async () => {
    mockModifyClient.mockResolvedValueOnce({
      RequestId: "req-update-client",
      Id: "env-test",
      AccessTokenExpiresIn: 3600,
    });
    mockDescribeClient.mockResolvedValueOnce({
      RequestId: "req-describe-client",
      Id: "env-test",
      AccessTokenExpiresIn: 3600,
      RefreshTokenExpiresIn: 2592000,
      MaxDevice: 2,
    });

    const result = await tools.manageAppAuth.handler({
      action: "updateClientConfig",
      config: {
        AccessTokenExpiresIn: 3600,
        MaxDevice: 2,
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockModifyClient).toHaveBeenCalledWith({
      Id: "env-test",
      AccessTokenExpiresIn: 3600,
      MaxDevice: 2,
    });
    expect(mockDescribeClient).toHaveBeenCalledWith("env-test");
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      clientId: "env-test",
      clientConfig: {
        AccessTokenExpiresIn: 3600,
        RefreshTokenExpiresIn: 2592000,
        MaxDevice: 2,
      },
    });
  });

  it("queryAppAuth(action=getStaticDomain) should call DescribeStaticStore via commonService", async () => {
    const result = await tools.queryAppAuth.handler({ action: "getStaticDomain" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockTcbCall).toHaveBeenCalledWith({
      Action: "DescribeStaticStore",
      Param: { EnvId: "env-test" },
    });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      cdnDomain: "env-test.cdn.tcloudbaseapp.com",
      staticDomain: "env-test.cdn.tcloudbaseapp.com",
      staticStores: [
        expect.objectContaining({ CdnDomain: "env-test.cdn.tcloudbaseapp.com" }),
      ],
    });
  });

  it("queryAppAuth(action=getStaticDomain) should fall back to StaticDomain when CdnDomain is blank", async () => {
    mockTcbCall.mockResolvedValueOnce({
      RequestId: "req-static-fallback",
      Data: [
        {
          EnvId: "env-test",
          CdnDomain: "   ",
          StaticDomain: "env-test.static.tcloudbaseapp.com",
          Status: "online",
        },
      ],
    });

    const result = await tools.queryAppAuth.handler({ action: "getStaticDomain" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      cdnDomain: "env-test.static.tcloudbaseapp.com",
      staticDomain: "env-test.static.tcloudbaseapp.com",
      staticStores: [
        expect.objectContaining({
          CdnDomain: "   ",
          StaticDomain: "env-test.static.tcloudbaseapp.com",
        }),
      ],
    });
  });

  it("queryAppAuth(action=getPublishableKey) should force publish_key lookup and return a short payload", async () => {
    const result = await tools.queryAppAuth.handler({ action: "getPublishableKey" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeApiKeyList).toHaveBeenCalledWith({
      KeyType: "publish_key",
      PageNumber: 1,
      PageSize: 10,
    });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      sdkStyle: "supabase-like",
      sdkHints: expectedSdkHints,
      publishableKey: "publish-key-token",
      keyId: "publish-key-id",
      keyName: "publish_key",
      expireAt: "2099-03-16T15:48:48+08:00",
      createdAt: "2026-03-16T15:48:48+08:00",
    });
  });

  it("queryAppAuth(action=listApiKeys) should call describeApiKeyList with filters", async () => {
    mockDescribeApiKeyList.mockResolvedValueOnce({
      RequestId: "req-api-key-list-2",
      ApiKeyList: [
        {
          Name: "publish_key",
          KeyId: "publish-key-id",
          ApiKey: "publish-key-token",
          KeyType: "publish_key",
        },
      ],
      Total: 1,
    });

    const result = await tools.queryAppAuth.handler({
      action: "listApiKeys",
      keyType: "publish_key",
      pageNumber: 2,
      pageSize: 5,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeApiKeyList).toHaveBeenCalledWith({
      KeyType: "publish_key",
      PageNumber: 2,
      PageSize: 5,
    });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      total: 1,
      pageNumber: 2,
      pageSize: 5,
      apiKeys: [expect.objectContaining({ KeyId: "publish-key-id" })],
    });
  });

  it("manageAppAuth(action=createApiKey) should call createApiKey", async () => {
    mockCreateApiKey.mockResolvedValueOnce({
      Name: "server-key",
      KeyId: "api-key-id",
      ApiKey: "secret-api-key",
      ExpireAt: "2099-03-16T15:48:48+08:00",
      CreateAt: "2026-03-16T15:48:48+08:00",
    });

    const result = await tools.manageAppAuth.handler({
      action: "createApiKey",
      keyType: "api_key",
      keyName: "server-key",
      expireIn: 3600,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateApiKey).toHaveBeenCalledWith({
      KeyType: "api_key",
      KeyName: "server-key",
      ExpireIn: 3600,
    });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      keyId: "api-key-id",
      keyName: "server-key",
      keyType: "api_key",
      apiKey: "secret-api-key",
    });
  });

  it("manageAppAuth(action=deleteApiKey) should call deleteApiKey", async () => {
    mockDeleteApiKey.mockResolvedValueOnce({ RequestId: "req-delete-key" });

    const result = await tools.manageAppAuth.handler({
      action: "deleteApiKey",
      keyId: "api-key-id",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDeleteApiKey).toHaveBeenCalledWith("api-key-id");
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      keyId: "api-key-id",
      deleted: true,
    });
  });

  it("manageAppAuth(action=ensurePublishableKey) should reuse an existing publish_key", async () => {
    const result = await tools.manageAppAuth.handler({
      action: "ensurePublishableKey",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeApiKeyList).toHaveBeenCalledTimes(1);
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      sdkStyle: "supabase-like",
      sdkHints: expectedSdkHints,
      publishableKey: "publish-key-token",
      keyId: "publish-key-id",
      keyName: "publish_key",
      created: false,
    });
  });

  it("manageAppAuth(action=ensurePublishableKey) should create publish_key when missing", async () => {
    mockDescribeApiKeyList
      .mockResolvedValueOnce({
        RequestId: "req-api-key-list",
        ApiKeyList: [],
        Total: 0,
      })
      .mockResolvedValueOnce({
        RequestId: "req-create-api-key",
        Name: "publish_key",
        KeyId: "publish-key-id",
        ApiKey: "publish-key-token",
        ExpireAt: "2099-03-16T15:48:48+08:00",
        CreateAt: "2026-03-16T15:48:48+08:00",
      });

    const result = await tools.manageAppAuth.handler({
      action: "ensurePublishableKey",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeApiKeyList).toHaveBeenNthCalledWith(1, {
      KeyType: "publish_key",
      PageNumber: 1,
      PageSize: 10,
    });
    expect(mockCreateApiKey).toHaveBeenCalledWith({ KeyType: "publish_key" });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      sdkStyle: "supabase-like",
      sdkHints: expectedSdkHints,
      publishableKey: "publish-key-token",
      keyId: "publish-key-id",
      keyName: "publish_key",
      created: true,
    });
  });

  it("manageAppAuth(action=ensurePublishableKey) should re-read publish_key after ResourceInUse race", async () => {
    mockDescribeApiKeyList
      .mockResolvedValueOnce({
        RequestId: "req-api-key-list-empty",
        ApiKeyList: [],
        Total: 0,
      })
      .mockResolvedValueOnce({
        RequestId: "req-api-key-list-after-race",
        ApiKeyList: [
          {
            Name: "publish_key",
            KeyId: "publish-key-id",
            ApiKey: "publish-key-token",
          },
        ],
        Total: 1,
      });
    mockCreateApiKey.mockImplementationOnce(() => {
      const err = new Error("ResourceInUse");
      (err as any).code = "ResourceInUse";
      throw err;
    });

    const result = await tools.manageAppAuth.handler({
      action: "ensurePublishableKey",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeApiKeyList).toHaveBeenNthCalledWith(1, {
      KeyType: "publish_key",
      PageNumber: 1,
      PageSize: 10,
    });
    expect(mockCreateApiKey).toHaveBeenCalledWith({ KeyType: "publish_key" });
    expect(mockDescribeApiKeyList).toHaveBeenNthCalledWith(2, {
      KeyType: "publish_key",
      PageNumber: 1,
      PageSize: 10,
    });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      publishableKey: "publish-key-token",
      keyId: "publish-key-id",
      keyName: "publish_key",
      created: false,
    });
  });


  it("queryAppAuth(action=getStaticDomain) should call DescribeStaticStore", async () => {
    mockTcbCall.mockResolvedValue({
      RequestId: "req-static",
      Data: [
        {
          EnvId: "env-test",
          CdnDomain: "env-test.cdn.tcloudbaseapp.com",
          Status: "online",
        },
      ],
    });

    const result = await tools.queryAppAuth.handler({ action: "getStaticDomain" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockTcbCall).toHaveBeenCalledWith({
      Action: "DescribeStaticStore",
      Param: { EnvId: "env-test" },
    });
    expect(payload).toMatchObject({
      success: true,
      envId: "env-test",
      cdnDomain: "env-test.cdn.tcloudbaseapp.com",
      staticDomain: "env-test.cdn.tcloudbaseapp.com",
      staticStores: [
        expect.objectContaining({ CdnDomain: "env-test.cdn.tcloudbaseapp.com" }),
      ],
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
      envId: "env-test",
      privateKey: "private-key",
      keyId: "custom-login-key-id",
    });
  });
});
