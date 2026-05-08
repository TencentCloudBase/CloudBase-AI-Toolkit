import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEnvTools } from "./env.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockBuildAuthConfigSummary,
  mockBuildDeviceAuthChallengePayload,
  mockBuildVerificationUriComplete,
  mockGetAuthConfigValidationError,
  mockSupervisorLoginByWebAuth,
  mockEnsureLogin,
  mockPeekLoginState,
  mockGetAuthProgressState,
  mockLogout,
  mockEnvManagerSetEnvId,
  mockGetCachedEnvId,
  mockListAvailableEnvCandidates,
  mockGetCloudBaseManager,
  mockResetCloudBaseManagerCache,
  mockResolveAuthOptions,
  mockCheckAndInitTcbService,
  mockCheckAndCreateFreeEnv,
} = vi.hoisted(() => ({
  mockBuildAuthConfigSummary: vi.fn((options: any) => ({
    auth_mode: options.authMode,
    client_id: options.clientId ?? null,
    oauth_endpoint: options.oauthEndpoint ?? null,
    oauth_custom: options.oauthCustom ?? false,
    uses_toolbox_defaults: options.usesToolboxDefaults ?? false,
  })),
  mockBuildVerificationUriComplete: vi.fn((info: any) => {
    if (info?.verification_uri_complete) {
      return info.verification_uri_complete;
    }
    if (!info?.verification_uri || !info?.user_code) {
      return undefined;
    }
    return `${info.verification_uri}${info.verification_uri.includes("?") ? "&" : "?"}user_code=${encodeURIComponent(info.user_code)}`;
  }),
  mockBuildDeviceAuthChallengePayload: vi.fn((info: any) =>
    info
      ? {
          user_code: info.user_code,
          verification_uri: info.verification_uri,
          verification_uri_complete:
            info.verification_uri_complete ??
            `${info.verification_uri}${info.verification_uri?.includes("?") ? "&" : "?"}user_code=${encodeURIComponent(info.user_code)}`,
          expires_in: info.expires_in,
        }
      : undefined,
  ),
  mockGetAuthConfigValidationError: vi.fn((options: any) => {
    if (
      options.authMode === "web" &&
      (options.clientId !== undefined ||
        options.oauthEndpoint !== undefined ||
        options.oauthCustom)
    ) {
      return "自定义 device 登录参数仅支持 authMode=device。";
    }
    if (options.oauthCustom && !options.oauthEndpoint) {
      return "oauthCustom=true 时必须同时提供 oauthEndpoint。";
    }
    if (options.oauthEndpoint && !options.oauthCustom) {
      return "配置自定义 oauthEndpoint 时必须启用 oauthCustom=true。";
    }
    return null;
  }),
  mockSupervisorLoginByWebAuth: vi.fn(),
  mockEnsureLogin: vi.fn(),
  mockPeekLoginState: vi.fn(),
  mockGetAuthProgressState: vi.fn(),
  mockLogout: vi.fn(),
  mockEnvManagerSetEnvId: vi.fn(),
  mockGetCachedEnvId: vi.fn(),
  mockListAvailableEnvCandidates: vi.fn(),
  mockGetCloudBaseManager: vi.fn(),
  mockResetCloudBaseManagerCache: vi.fn(),
  mockCheckAndInitTcbService: vi.fn(),
  mockCheckAndCreateFreeEnv: vi.fn(),
  mockResolveAuthOptions: vi.fn((options: any = {}) => ({
    authMode: options.authMode ?? options.serverAuthOptions?.authMode ?? "device",
    clientId: options.clientId ?? options.serverAuthOptions?.clientId,
    oauthEndpoint:
      options.oauthEndpoint ?? options.serverAuthOptions?.oauthEndpoint,
    oauthCustom:
      options.oauthCustom ??
      options.serverAuthOptions?.oauthCustom ??
      ((options.oauthEndpoint ?? options.serverAuthOptions?.oauthEndpoint)
        ? true
        : false),
    usesToolboxDefaults:
      !options.authMode &&
      !options.clientId &&
      !options.oauthEndpoint &&
      !(options.oauthCustom ?? false) &&
      !options.serverAuthOptions?.authMode &&
      !options.serverAuthOptions?.clientId &&
      !options.serverAuthOptions?.oauthEndpoint &&
      !(options.serverAuthOptions?.oauthCustom ?? false),
  })),
}));

vi.mock("@cloudbase/toolbox", () => ({
  AuthSupervisor: {
    getInstance: vi.fn(() => ({
      loginByWebAuth: mockSupervisorLoginByWebAuth,
    })),
  },
}));

vi.mock("../auth.js", () => ({
  buildAuthConfigSummary: mockBuildAuthConfigSummary,
  buildDeviceAuthChallengePayload: mockBuildDeviceAuthChallengePayload,
  buildVerificationUriComplete: mockBuildVerificationUriComplete,
  ensureLogin: mockEnsureLogin,
  getAuthConfigValidationError: mockGetAuthConfigValidationError,
  peekLoginState: mockPeekLoginState,
  getAuthProgressState: mockGetAuthProgressState,
  logout: mockLogout,
  rejectAuthProgressState: vi.fn(),
  resolveAuthOptions: mockResolveAuthOptions,
  resolveAuthProgressState: vi.fn(),
  setPendingAuthProgressState: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  envManager: {
    setEnvId: mockEnvManagerSetEnvId,
  },
  getCachedEnvId: mockGetCachedEnvId,
  getCloudBaseManager: mockGetCloudBaseManager,
  listAvailableEnvCandidates: mockListAvailableEnvCandidates,
  logCloudBaseResult: vi.fn(),
  resetCloudBaseManagerCache: mockResetCloudBaseManagerCache,
}));

vi.mock("./rag.js", () => ({
  getClaudePrompt: vi.fn().mockResolvedValue(""),
}));

vi.mock("./env-setup.js", () => ({
  checkAndInitTcbService: mockCheckAndInitTcbService,
  checkAndCreateFreeEnv: mockCheckAndCreateFreeEnv,
}));

function createMockServer(ide = "TestIDE", authOptions?: any) {
  const tools: Record<
    string,
    {
      meta: any;
      handler: (args: any) => Promise<any>;
    }
  > = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    authOptions,
    ide,
    server: {
      sendLoggingMessage: vi.fn(),
    },
    registerTool: vi.fn(
      (name: string, meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { meta, handler };
      },
    ),
  } as unknown as ExtendedMcpServer;

  registerEnvTools(server);

  return {
    server,
    tools,
  };
}

describe("env tools - auth", () => {
  let tools: ReturnType<typeof createMockServer>["tools"];
  const originalCloudbaseEnvId = process.env.CLOUDBASE_ENV_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLOUDBASE_ENV_ID;
    mockGetCachedEnvId.mockReturnValue(null);
    mockListAvailableEnvCandidates.mockResolvedValue([]);
    mockGetAuthProgressState.mockResolvedValue({
      status: "IDLE",
      updatedAt: Date.now(),
    });
    mockCheckAndInitTcbService.mockImplementation(async (_manager: any, context: any) => ({
      ...context,
      checkTcbServiceAttempted: true,
      tcbServiceChecked: true,
      tcbServiceInitialized: true,
    }));
    mockCheckAndCreateFreeEnv.mockImplementation(async (_manager: any, context: any) => ({
      success: false,
      context: {
        ...context,
        promotionalActivitiesChecked: true,
        createEnvError: {
          code: "NoPromotionalActivity",
          message: "当前账号不符合免费环境创建条件，请手动创建环境",
          helpUrl: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp",
        },
      },
    }));
    mockPeekLoginState.mockResolvedValue(null);
    mockEnsureLogin.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      envId: "env-test",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      commonService: vi.fn(() => ({
        call: vi.fn(),
      })),
      env: {
        listEnvs: vi.fn(),
      },
    });
    ({ tools } = createMockServer());
  });

  afterEach(() => {
    if (originalCloudbaseEnvId === undefined) {
      delete process.env.CLOUDBASE_ENV_ID;
      return;
    }

    process.env.CLOUDBASE_ENV_ID = originalCloudbaseEnvId;
  });

  it("should expose auth tool and remove standalone logout tool", () => {
    expect(typeof tools.auth?.handler).toBe("function");
    expect(tools.logout).toBeUndefined();
  });

  it("auth(action=status) should return structured status payload", async () => {
    const result = await tools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("ok", true);
    expect(payload).toHaveProperty("code", "STATUS");
    expect(payload).toHaveProperty("auth_status", "REQUIRED");
    expect(payload).toHaveProperty("env_status");
    expect(payload).toHaveProperty("current_env_id");
    expect(payload.auth_config).toMatchObject({
      auth_mode: "device",
      client_id: null,
      oauth_endpoint: null,
      oauth_custom: false,
      uses_toolbox_defaults: true,
    });
    expect(payload.next_step).toMatchObject({
      tool: "auth",
      action: "start_auth",
    });
  });

  it("auth(action=get_temp_credentials) should require explicit confirmation", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
      refreshToken: "refresh-token",
      accessTokenExpired: Date.now() + 60_000,
      envId: "env-login",
    });

    const result = await tools.auth.handler({ action: "get_temp_credentials" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      ok: false,
      code: "INVALID_ARGS",
    });
    expect(payload.message).toContain("confirm");
  });

  it("auth(action=get_temp_credentials) should reject permanent credentials", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      envId: "env-login",
    });

    const result = await tools.auth.handler({
      action: "get_temp_credentials",
      confirm: "yes",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_CREDENTIAL_TYPE",
    });
  });

  it("auth(action=get_temp_credentials) should return masked credentials by default", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid-123456",
      secretKey: "skey-abcdef",
      token: "token-xyz",
      refreshToken: "refresh-token",
      accessTokenExpired: Date.now() + 60_000,
      envId: "env-login",
    });

    const result = await tools.auth.handler({
      action: "get_temp_credentials",
      confirm: "yes",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      ok: true,
      code: "TEMP_CREDENTIALS_READY",
      env_id: "env-login",
      credentials: {
        secretId: "si******56",
        secretKey: "sk******ef",
        token: "to******yz",
        masked: true,
      },
    });
  });

  it("auth(action=status) should surface pending auth challenge", async () => {
    mockGetAuthProgressState.mockResolvedValue({
      status: "PENDING",
      updatedAt: Date.now(),
      authChallenge: {
        user_code: "WDJB-MJHT",
        verification_uri: "https://example.com/device",
        device_code: "device-code",
        expires_in: 600,
      },
    });

    const result = await tools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("auth_status", "PENDING");
    expect(payload.auth_challenge).toMatchObject({
      user_code: "WDJB-MJHT",
      verification_uri: "https://example.com/device",
      verification_uri_complete: "https://example.com/device?user_code=WDJB-MJHT",
      expires_in: 600,
    });
    expect(payload.next_step).toMatchObject({
      tool: "auth",
      action: "status",
    });
  });

  it("auth(action=status) should report NOT_NEEDED when login already has envId", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      envId: "env-login",
    });

    const result = await tools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      auth_status: "READY",
      env_status: "READY",
      current_env_id: "env-login",
      env_setup_status: "NOT_NEEDED",
      env_setup_actions: [],
    });
  });

  it("auth(action=status) should auto-bind a single available env", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue([
      {
        envId: "env-single",
        alias: "single",
      },
    ]);

    const result = await tools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      auth_status: "READY",
      env_status: "READY",
      current_env_id: "env-single",
      env_setup_status: "AUTO_BOUND",
    });
    expect(payload.env_setup_actions).toContain("list_envs");
    expect(payload.next_step).toMatchObject({
      tool: "auth",
      action: "status",
    });
    expect(mockEnvManagerSetEnvId).toHaveBeenCalledWith("env-single");
  });

  it("auth(action=status) should return selection_required when multiple envs exist", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue([
      {
        envId: "env-a",
        alias: "a",
      },
      {
        envId: "env-b",
        alias: "b",
      },
    ]);

    const result = await tools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      auth_status: "READY",
      env_status: "MULTIPLE",
      current_env_id: null,
      env_setup_status: "SELECTION_REQUIRED",
    });
    expect(payload.env_candidates).toEqual([
      expect.objectContaining({ envId: "env-a" }),
      expect.objectContaining({ envId: "env-b" }),
    ]);
    expect(payload.next_step).toMatchObject({
      tool: "auth",
      action: "set_env",
    });
  });

  it("auth(action=status) should auto-create and bind env when possible", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue([]);
    mockCheckAndCreateFreeEnv.mockImplementation(async (_manager: any, context: any) => ({
      success: true,
      envId: "env-created",
      context: {
        ...context,
        promotionalActivitiesChecked: true,
        createFreeEnvAttempted: true,
      },
    }));

    const result = await tools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      auth_status: "READY",
      env_status: "READY",
      current_env_id: "env-created",
      env_setup_status: "AUTO_CREATED",
    });
    expect(payload.env_setup_actions).toEqual(
      expect.arrayContaining([
        "list_envs",
        "check_tcb_service",
        "check_promotional_activity",
        "create_free_env",
      ]),
    );
    expect(mockEnvManagerSetEnvId).toHaveBeenCalledWith("env-created");
  });

  it("auth(action=status) should expose real-name action_required state", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue([]);
    mockCheckAndInitTcbService.mockImplementation(async (_manager: any, context: any) => ({
      ...context,
      checkTcbServiceAttempted: true,
      initTcbAttempted: true,
      tcbServiceChecked: true,
      tcbServiceInitialized: false,
      initTcbError: {
        code: "RealNameAuthRequired",
        message: "当前账号需要先完成实名认证",
        helpUrl: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp",
        needRealNameAuth: true,
      },
    }));

    const result = await tools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      auth_status: "READY",
      env_status: "NONE",
      env_setup_status: "ACTION_REQUIRED",
      env_setup_failure: {
        reason: "tcb_init_failed",
        error_code: "RealNameAuthRequired",
        need_real_name_auth: true,
        help_url: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp",
      },
    });
    expect(payload.env_setup_actions).toEqual(
      expect.arrayContaining(["list_envs", "check_tcb_service", "init_tcb"]),
    );
  });

  it("auth(action=status) should expose manual creation guidance when free env is unavailable", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue([]);

    const result = await tools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      auth_status: "READY",
      env_status: "NONE",
      env_setup_status: "ACTION_REQUIRED",
      env_setup_failure: {
        reason: "env_creation_failed",
        error_code: "NoPromotionalActivity",
        help_url: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp",
      },
    });
  });

  it("auth(action=start_auth, authMode=device) should return AUTH_PENDING immediately", async () => {
    mockSupervisorLoginByWebAuth.mockImplementation(
      async ({ onDeviceCode }: { onDeviceCode: (info: any) => void }) => {
        onDeviceCode({
          user_code: "WDJB-MJHT",
          verification_uri: "https://example.com/device",
          device_code: "device-code",
          expires_in: 600,
        });
        return new Promise(() => {});
      },
    );

    const result = await tools.auth.handler({
      action: "start_auth",
      authMode: "device",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("code", "AUTH_PENDING");
    expect(payload.auth_challenge).toMatchObject({
      user_code: "WDJB-MJHT",
      verification_uri: "https://example.com/device",
      verification_uri_complete: "https://example.com/device?user_code=WDJB-MJHT",
      expires_in: 600,
    });
    expect(payload.next_step).toMatchObject({
      tool: "auth",
      action: "status",
    });
  });

  it("auth(action=start_auth) should pass custom device auth options to toolbox", async () => {
    mockSupervisorLoginByWebAuth.mockImplementation(
      async ({ onDeviceCode }: { onDeviceCode: (info: any) => void }) => {
        onDeviceCode({
          user_code: "WDJB-MJHT",
          verification_uri: "https://example.com/device",
          device_code: "device-code",
          expires_in: 600,
        });
        return new Promise(() => {});
      },
    );

    await tools.auth.handler({
      action: "start_auth",
      oauthEndpoint: "https://custom.example.com/oauth",
      clientId: "custom-client",
      oauthCustom: true,
    });

    expect(mockSupervisorLoginByWebAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "device",
        client_id: "custom-client",
        custom: true,
        getOAuthEndpoint: expect.any(Function),
      }),
    );
    const callArgs = mockSupervisorLoginByWebAuth.mock.calls[0][0];
    expect(callArgs.getOAuthEndpoint("ignored")).toBe(
      "https://custom.example.com/oauth",
    );
    expect(callArgs.custom).toBe(true);
  });

  it("auth(action=start_auth) should surface complete hash-route verification URL", async () => {
    mockSupervisorLoginByWebAuth.mockImplementation(
      async ({ onDeviceCode }: { onDeviceCode: (info: any) => void }) => {
        onDeviceCode({
          user_code: "48NK-MSUK",
          verification_uri:
            "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device",
          verification_uri_complete:
            "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device&user_code=48NK-MSUK",
          device_code: "device-code",
          expires_in: 600,
        });
        return new Promise(() => {});
      },
    );

    const result = await tools.auth.handler({
      action: "start_auth",
      authMode: "device",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.auth_challenge).toMatchObject({
      verification_uri:
        "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device",
      verification_uri_complete:
        "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device&user_code=48NK-MSUK",
    });
  });

  it("auth(action=start_auth) should reject oauthCustom without endpoint", async () => {
    const result = await tools.auth.handler({
      action: "start_auth",
      oauthCustom: true,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("code", "INVALID_ARGS");
    expect(payload.message).toContain("oauthCustom=true");
  });

  it("auth(action=start_auth) should reject oauthEndpoint when oauthCustom is explicitly false", async () => {
    const result = await tools.auth.handler({
      action: "start_auth",
      oauthEndpoint: "https://custom.example.com/oauth",
      oauthCustom: false,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("code", "INVALID_ARGS");
    expect(payload.message).toContain("oauthEndpoint");
  });

  it("auth(action=start_auth, authMode=web) should continue environment preparation after login", async () => {
    mockPeekLoginState.mockResolvedValue(null);
    mockEnsureLogin.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue([]);
    mockCheckAndCreateFreeEnv.mockImplementation(async (_manager: any, context: any) => ({
      success: true,
      envId: "env-web-created",
      context: {
        ...context,
        promotionalActivitiesChecked: true,
        createFreeEnvAttempted: true,
      },
    }));

    const result = await tools.auth.handler({
      action: "start_auth",
      authMode: "web",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      code: "AUTH_READY",
      current_env_id: "env-web-created",
      env_setup_status: "AUTO_CREATED",
    });
    expect(mockEnvManagerSetEnvId).toHaveBeenCalledWith("env-web-created");
  });

  it("auth(action=set_env, envId) should accept direct env binding", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue([
      {
        envId: "env-test",
        alias: "test",
      },
    ]);

    const result = await tools.auth.handler({
      action: "set_env",
      envId: "env-test",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("code", "ENV_READY");
    expect(payload).toHaveProperty("current_env_id", "env-test");
    expect(payload.next_step).toBeUndefined();
    expect(payload.env_candidates).toBeUndefined();
    expect(mockEnvManagerSetEnvId).toHaveBeenCalledWith("env-test");
  });

  it("auth(action=logout) should clear session state", async () => {
    const result = await tools.auth.handler({
      action: "logout",
      confirm: "yes",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("code", "LOGGED_OUT");
    expect(payload.next_step).toBeUndefined();
    expect(mockLogout).toHaveBeenCalled();
    expect(mockResetCloudBaseManagerCache).toHaveBeenCalled();
  });

  it("CodeBuddy should only expose status and set_env actions", () => {
    const { tools: codeBuddyTools } = createMockServer("CodeBuddy");
    expect(codeBuddyTools.auth.meta.inputSchema.action.unwrap().options).toEqual([
      "status",
      "set_env",
    ]);
    expect(codeBuddyTools.auth.meta.inputSchema.authMode).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.oauthEndpoint).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.clientId).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.oauthCustom).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.forceUpdate).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.confirm).toBeUndefined();
  });

  it("auth(action=status) should reflect explicit server auth config", async () => {
    const { tools: serverConfiguredTools } = createMockServer("TestIDE", {
      oauthEndpoint: "https://server.example.com/oauth",
      oauthCustom: true,
    });

    const result = await serverConfiguredTools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.auth_config).toMatchObject({
      oauth_endpoint: "https://server.example.com/oauth",
      oauth_custom: true,
      uses_toolbox_defaults: false,
    });
  });

  it("CodeBuddy status should not recommend start_auth", async () => {
    const { tools: codeBuddyTools } = createMockServer("CodeBuddy");
    const result = await codeBuddyTools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.next_step).toMatchObject({
      tool: "auth",
      action: "status",
    });
  });

  it("auth(action=status) should truncate env candidates and expose summary", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({
        envId: `env-${index + 1}`,
        alias: `alias-${index + 1}`,
      })),
    );

    const result = await tools.auth.handler({ action: "status" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.env_candidates).toHaveLength(20);
    expect(payload.env_candidates_summary).toMatchObject({
      total: 25,
      returned: 20,
      truncated: true,
    });
  });
});

describe("env tools - envQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedEnvId.mockReturnValue(null);
    mockListAvailableEnvCandidates.mockResolvedValue([]);
    mockGetAuthProgressState.mockResolvedValue({
      status: "IDLE",
      updatedAt: Date.now(),
    });
    mockPeekLoginState.mockResolvedValue(null);
    mockEnsureLogin.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      envId: "env-test",
    });
  });

  it("envQuery(list) should support alias filters, pagination and field selection", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      commonService: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({
          EnvList: [
            {
              EnvId: "env-test",
              Alias: "alpha",
              Status: "NORMAL",
              EnvType: "baas",
              Region: "ap-guangzhou",
              PackageId: "pkg-id-a",
              PackageName: "pkg-a",
              IsDefault: true,
            },
            {
              EnvId: "env-extra",
              Alias: "alpha-beta",
              Status: "NORMAL",
              EnvType: "baas",
              Region: "ap-shanghai",
              PackageId: "pkg-id-b",
              PackageName: "pkg-b",
              IsDefault: false,
            },
            {
              EnvId: "env-other",
              Alias: "gamma",
              Status: "SUSPENDED",
              EnvType: "weda",
              Region: "ap-beijing",
            },
          ],
        }),
      })),
      env: {
        listEnvs: vi.fn(),
      },
    });

    const { tools } = createMockServer();
    const result = await tools.envQuery.handler({
      action: "list",
      alias: "alpha",
      offset: 1,
      limit: 1,
      fields: ["EnvId", "Alias"],
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.EnvList).toEqual([
      {
        EnvId: "env-extra",
        Alias: "alpha-beta",
      },
    ]);
    expect(payload.TotalCount).toBe(2);
    expect(payload.Offset).toBe(1);
    expect(payload.Limit).toBe(1);
    expect(payload.HasMore).toBe(false);
    expect(payload.AppliedFilters).toMatchObject({
      alias: "alpha",
      aliasExact: null,
      envId: null,
      fields: ["EnvId", "Alias"],
      currentEnvOnly: false,
    });
  });

  it("envQuery(list) should support exact alias filtering when requested", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      commonService: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({
          EnvList: [
            {
              EnvId: "env-test",
              Alias: "alpha",
              Status: "NORMAL",
              EnvType: "baas",
              Region: "ap-guangzhou",
            },
            {
              EnvId: "env-extra",
              Alias: "alpha-beta",
              Status: "NORMAL",
              EnvType: "baas",
              Region: "ap-shanghai",
            },
          ],
        }),
      })),
      env: {
        listEnvs: vi.fn(),
      },
    });

    const { tools } = createMockServer();
    const result = await tools.envQuery.handler({
      action: "list",
      alias: "alpha",
      aliasExact: true,
      fields: ["EnvId", "Alias"],
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.EnvList).toEqual([
      {
        EnvId: "env-test",
        Alias: "alpha",
      },
    ]);
    expect(payload.TotalCount).toBe(1);
    expect(payload.AppliedFilters).toMatchObject({
      alias: "alpha",
      aliasExact: true,
      envId: null,
      fields: ["EnvId", "Alias"],
      currentEnvOnly: false,
    });
  });

  it("envQuery(list) should keep current-env restriction only when no explicit filter is provided", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      commonService: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({
          EnvList: [
            { EnvId: "env-test", Alias: "bound", PackageId: "baas_personal" },
            { EnvId: "env-other", Alias: "other", PackageId: "baas_free" },
          ],
        }),
      })),
      env: {
        listEnvs: vi.fn(),
      },
    });

    const { tools } = createMockServer();
    const unfiltered = JSON.parse((await tools.envQuery.handler({ action: "list" })).content[0].text);
    const filtered = JSON.parse(
      (await tools.envQuery.handler({ action: "list", envId: "env-other" })).content[0].text,
    );

    expect(unfiltered.EnvList).toEqual([{ EnvId: "env-test", Alias: "bound", PackageId: "baas_personal" }]);
    expect(unfiltered.AppliedFilters.currentEnvOnly).toBe(true);
    expect(filtered.EnvList).toEqual([{ EnvId: "env-other", Alias: "other", PackageId: "baas_free" }]);
    expect(filtered.AppliedFilters.currentEnvOnly).toBe(false);
    expect(filtered.RecommendedNextAction).toMatchObject({
      tool: "envQuery",
      action: "info",
    });
  });

  it("envQuery(info) should preserve detailed fields such as PackageId", async () => {
    const getEnvInfo = vi.fn().mockResolvedValue({
      EnvInfo: {
        EnvId: "env-test",
        Alias: "bound",
        PackageId: "baas_personal",
        PackageName: "个人版",
        Storages: [{ Bucket: "bucket-1" }],
      },
    });
    const commonServiceCall = vi.fn().mockResolvedValue({
      EnvBillingInfoList: [
        {
          EnvId: "env-test",
          ExpireTime: "2026-12-31 00:00:00",
          PayMode: "PREPAYMENT",
          IsAutoRenew: true,
        },
      ],
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        getEnvInfo,
      },
      commonService: vi.fn(() => ({
        call: commonServiceCall,
      })),
    });

    const { tools } = createMockServer();
    const payload = JSON.parse((await tools.envQuery.handler({ action: "info" })).content[0].text);

    expect(payload).toMatchObject({
      EnvInfo: {
        EnvId: "env-test",
        PackageId: "baas_personal",
        PackageName: "个人版",
        BillingInfo: {
          ExpireTime: "2026-12-31 00:00:00",
          PayMode: "PREPAYMENT",
          IsAutoRenew: true,
        },
      },
    });
    expect(payload.EnvInfo.Storages).toEqual([{ Bucket: "bucket-1" }]);
    expect(commonServiceCall).toHaveBeenCalledWith({
      Action: "DescribeBillingInfo",
      Param: {
        EnvId: "env-test",
      },
    });
  });

  it("envQuery(info) should prefer explicit envId over cached binding", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        getEnvInfo: vi.fn().mockResolvedValue({
          EnvInfo: {
            EnvId: "env-override",
          },
        }),
      },
      commonService: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({
          EnvBillingInfoList: [{ EnvId: "env-override" }],
        }),
      })),
    });

    const { tools } = createMockServer();
    await tools.envQuery.handler({ action: "info", envId: "env-override" });

    expect(mockGetCloudBaseManager).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudBaseOptions: expect.objectContaining({
          envId: "env-override",
        }),
      }),
    );
  });

  it("envQuery(hosting) should read CdnDomain and Bucket from StaticStorages", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      hosting: {
        getWebsiteConfig: vi.fn().mockResolvedValue({
          IndexDocument: "index.html",
          ErrorDocument: "404.html",
        }),
      },
      env: {
        getEnvInfo: vi.fn().mockResolvedValue({
          EnvInfo: {
            StaticStorages: [
              {
                StaticDomain: "static.example.com",
                Bucket: "hosting-bucket",
              },
            ],
            Storages: [
              {
                Bucket: "storage-bucket",
              },
            ],
          },
        }),
      },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse((await tools.envQuery.handler({ action: "hosting" })).content[0].text);

    expect(payload).toMatchObject({
      IndexDocument: "index.html",
      ErrorDocument: "404.html",
      CdnDomain: "static.example.com",
      Bucket: "hosting-bucket",
    });
    expect(payload.Bucket).not.toBe("storage-bucket");
  });

  it("envQuery(domains) should include local development host:port guidance", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        getEnvAuthDomains: vi.fn().mockResolvedValue({
          Domains: [
            {
              Id: "domain-1",
              Domain: "localhost:5173",
              Status: "ENABLE",
              Type: "USER",
              CreateTime: "2026-04-08 10:00:00",
            },
          ],
        }),
      },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse((await tools.envQuery.handler({ action: "domains" })).content[0].text);

    expect(payload).toMatchObject({
      Domains: [{ Id: "domain-1", Domain: "localhost:5173", CreateTime: "2026-04-08 10:00:00", Status: "ENABLE", Type: "USER" }],
      localDevHint: {
        format: "host:port",
        useActualOrigin: true,
        requiredValue: "当前浏览器实际访问 origin 对应的 host:port",
        deriveFrom: ["浏览器地址栏中的当前 origin", "本地 dev server 实际启动输出"],
      },
      localDevStatus: {
        requiresExactCurrentOrigin: true,
        browserUploadReady: false,
        coverageConfirmed: false,
        doNotAssumeConfiguredEntriesAreSufficient: true,
        canAutoDetermineCurrentOrigin: false,
        hasAnyConfiguredLocalEntry: true,
        configuredEntries: ["localhost:5173"],
      },
      next_step_template: {
        tool: "envDomainManagement",
        action: "create",
        domains: ["<actual-browser-host>:<actual-browser-port>"],
      },
    });
    expect(payload.Domains[0]).toHaveProperty("Id");
    expect(payload.Domains[0]).toHaveProperty("CreateTime");
  });

  it("envQuery(domains) should report configured local entries without inferring completeness", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        getEnvAuthDomains: vi.fn().mockResolvedValue({
          Domains: [
            { Domain: "127.0.0.1:4173", Status: "ENABLE" },
            { Domain: "localhost:4173", Status: "ENABLE" },
            { Domain: "example.com", Status: "ENABLE" },
          ],
        }),
      },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse((await tools.envQuery.handler({ action: "domains" })).content[0].text);

    expect(payload.localDevStatus).toMatchObject({
      requiresExactCurrentOrigin: true,
      browserUploadReady: false,
      coverageConfirmed: false,
      doNotAssumeConfiguredEntriesAreSufficient: true,
      canAutoDetermineCurrentOrigin: false,
      hasAnyConfiguredLocalEntry: true,
      configuredEntries: ["127.0.0.1:4173", "localhost:4173"],
    });
    expect(payload.next_step_template).toMatchObject({
      tool: "envDomainManagement",
      action: "create",
      domains: ["<actual-browser-host>:<actual-browser-port>"],
    });
  });

  it("envQuery(hosting) should keep website config when env enrichment fails", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      hosting: {
        getWebsiteConfig: vi.fn().mockResolvedValue({
          IndexDocument: "index.html",
          ErrorDocument: "404.html",
        }),
      },
      env: {
        getEnvInfo: vi.fn().mockRejectedValue(new Error("env info timeout")),
      },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse((await tools.envQuery.handler({ action: "hosting" })).content[0].text);

    expect(payload).toMatchObject({
      IndexDocument: "index.html",
      ErrorDocument: "404.html",
      CdnDomain: null,
      Bucket: null,
    });
  });

  it("envDomainManagement(create) should return structured polling guidance", async () => {
    const createEnvDomain = vi.fn().mockResolvedValue({
      RequestId: "req-create-domain",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        createEnvDomain,
      },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.envDomainManagement.handler({
          action: "create",
          domains: ["integration.example.com"],
        })
      ).content[0].text,
    );

    expect(createEnvDomain).toHaveBeenCalledWith(["integration.example.com"]);
    expect(payload).toMatchObject({
      ok: true,
      code: "DOMAIN_UPDATE_PENDING",
      operation: "create",
      targetDomains: ["integration.example.com"],
      asyncState: "PENDING",
      propagation: {
        requiresPolling: true,
        pollTool: "envQuery",
        pollAction: "domains",
        pollIntervalSuggestionSeconds: 10,
        timeoutSuggestionSeconds: 600,
      },
      next_step: {
        tool: "envQuery",
        action: "domains",
        suggested_args: {
          action: "domains",
        },
      },
    });
    expect(payload.message).toContain("继续轮询 envQuery(action=\"domains\")");
  });

  it("envDomainManagement(delete) should return structured polling guidance", async () => {
    const deleteEnvDomain = vi.fn().mockResolvedValue({
      RequestId: "req-delete-domain",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        deleteEnvDomain,
      },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.envDomainManagement.handler({
          action: "delete",
          domains: ["integration.example.com"],
        })
      ).content[0].text,
    );

    expect(deleteEnvDomain).toHaveBeenCalledWith(["integration.example.com"]);
    expect(payload).toMatchObject({
      ok: true,
      code: "DOMAIN_DELETE_PENDING",
      operation: "delete",
      targetDomains: ["integration.example.com"],
      asyncState: "PENDING",
      propagation: {
        requiresPolling: true,
        pollTool: "envQuery",
        pollAction: "domains",
      },
      next_step: {
        tool: "envQuery",
        action: "domains",
      },
    });
    expect(payload.message).toContain("直到目标域名不再出现");
  });
});
