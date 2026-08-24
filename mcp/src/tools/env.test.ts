import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENV_METRIC_NAME_VALUES,
  ENV_METRIC_PERIOD_VALUES,
  ENV_USAGE_MODULE_VALUES,
  GATEWAY_ENV_QPS_DEFAULT_RESOURCE_ID,
  extractAccountCircleDate,
  formatEnvMetricTime,
  isUsableNoSqlDatabaseEntry,
  registerEnvTools,
  resolveEnvMetricName,
  resolveEnvMetricPeriod,
  resolveEnvMetricResourceId,
  resolveEnvMetricTimeRange,
  resolveEnvUsageDateRange,
  resolveEnvUsageModules,
  summarizeEnvMetricCurve,
} from "./env.js";
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
  mockResolveEnvCandidateByEnvId,
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
  mockResolveEnvCandidateByEnvId: vi.fn(),
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
  getCloudBaseApiKeyFromEnv: () =>
    process.env.CLOUDBASE_API_KEY || process.env.CLOUDBASE_APIKEY || undefined,
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
  resolveEnvCandidateByEnvId: mockResolveEnvCandidateByEnvId,
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
      notification: vi.fn().mockResolvedValue(undefined),
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
  const originalTcbRegion = process.env.TCB_REGION;
  const originalApiKey = process.env.CLOUDBASE_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLOUDBASE_ENV_ID;
    mockGetCachedEnvId.mockReturnValue(null);
    mockListAvailableEnvCandidates.mockResolvedValue([]);
    mockResolveEnvCandidateByEnvId.mockResolvedValue(undefined);
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
    } else {
      process.env.CLOUDBASE_ENV_ID = originalCloudbaseEnvId;
    }
    if (originalTcbRegion === undefined) {
      delete process.env.TCB_REGION;
    } else {
      process.env.TCB_REGION = originalTcbRegion;
    }
    if (originalApiKey === undefined) {
      delete process.env.CLOUDBASE_API_KEY;
    } else {
      process.env.CLOUDBASE_API_KEY = originalApiKey;
    }
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
    expect(payload.credential_scope).toBe("account");
    expect(payload.current_region).toBeTruthy();
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
    mockResolveEnvCandidateByEnvId.mockResolvedValue(undefined);
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
    mockResolveEnvCandidateByEnvId.mockResolvedValue(undefined);
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
    mockResolveEnvCandidateByEnvId.mockResolvedValue(undefined);

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
    mockResolveEnvCandidateByEnvId.mockResolvedValue(undefined);
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

    const { server, tools: localTools } = createMockServer();
    const result = await localTools.auth.handler({
      action: "set_env",
      envId: "env-test",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("code", "ENV_READY");
    expect(payload).toHaveProperty("current_env_id", "env-test");
    expect(payload.next_step).toBeUndefined();
    expect(payload.env_candidates).toBeUndefined();
    expect(mockEnvManagerSetEnvId).toHaveBeenCalledWith("env-test");
    // set_env 成功时应推送跨客户端环境变更通知（替代客户端兜底轮询）
    expect(server.server.notification).toHaveBeenCalledWith({
      method: "notifications/cloudbase/env_changed",
      params: { envId: "env-test" },
    });
  });

  it("auth(action=set_env) should bind envId outside current-region candidates", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue([
      { envId: "env-shanghai", alias: "sh", region: "ap-shanghai" },
    ]);
    mockResolveEnvCandidateByEnvId.mockResolvedValue({
      envId: "alfred-test-sg-d7gxpjc7g94e84f6c",
      alias: "sg",
      region: "ap-singapore",
    });

    const { tools: localTools, server } = createMockServer();
    const result = await localTools.auth.handler({
      action: "set_env",
      envId: "alfred-test-sg-d7gxpjc7g94e84f6c",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      code: "ENV_READY",
      current_env_id: "alfred-test-sg-d7gxpjc7g94e84f6c",
      current_region: "ap-singapore",
    });
    expect(mockEnvManagerSetEnvId).toHaveBeenCalledWith("alfred-test-sg-d7gxpjc7g94e84f6c");
    expect(server.cloudBaseOptions?.region).toBe("ap-singapore");
    expect(process.env.TCB_REGION).toBe("ap-singapore");
  });

  it("auth(action=set_env) should reject other envIds in API Key mode", async () => {
    process.env.CLOUDBASE_API_KEY = "test-api-key";
    process.env.CLOUDBASE_ENV_ID = "env-pinned";
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockListAvailableEnvCandidates.mockResolvedValue([
      { envId: "env-pinned" },
    ]);

    const result = await tools.auth.handler({
      action: "set_env",
      envId: "env-other",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      ok: false,
      code: "CREDENTIAL_SCOPE_LIMITED",
      credential_scope: "single_env",
    });
    expect(payload.message).toContain("凭据权限边界");
    expect(mockEnvManagerSetEnvId).not.toHaveBeenCalled();
    delete process.env.CLOUDBASE_API_KEY;
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

  it("CodeBuddy should only expose status, set_env, and login_by_api_key actions", () => {
    const { tools: codeBuddyTools } = createMockServer("CodeBuddy");
    expect(codeBuddyTools.auth.meta.inputSchema.action.unwrap().options).toEqual([
      "status",
      "set_env",
      "login_by_api_key",
    ]);
    expect(codeBuddyTools.auth.meta.inputSchema.authMode).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.oauthEndpoint).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.clientId).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.oauthCustom).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.forceUpdate).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.confirm).toBeUndefined();
    expect(codeBuddyTools.auth.meta.inputSchema.reveal).toBeUndefined();
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

  it("auth(action=login_by_api_key) should validate required args", async () => {
    const result = await tools.auth.handler({ action: "login_by_api_key" });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("ok", false);
    expect(payload).toHaveProperty("code", "INVALID_ARGS");
    expect(payload.message).toContain("apiKey 和 envId");
  });

  it("auth(action=login_by_api_key) should succeed when peekLoginState returns credentials", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
      envId: "env-test",
    });
    mockGetCachedEnvId.mockReturnValue("env-test");

    const result = await tools.auth.handler({
      action: "login_by_api_key",
      apiKey: "test-api-key",
      apiKeyEnvId: "env-test",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("ok", true);
    expect(payload).toHaveProperty("code", "AUTH_READY");
    expect(payload).toHaveProperty("auth_mode", "api_key");
    expect(payload).toHaveProperty("current_env_id", "env-test");
    expect(process.env.CLOUDBASE_API_KEY).toBe("test-api-key");
    expect(process.env.CLOUDBASE_ENV_ID).toBe("env-test");
  });

  it("auth(action=login_by_api_key) should return error when peekLoginState returns null", async () => {
    mockPeekLoginState.mockResolvedValue(null);

    const result = await tools.auth.handler({
      action: "login_by_api_key",
      apiKey: "invalid-api-key",
      apiKeyEnvId: "env-test",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("ok", false);
    expect(payload).toHaveProperty("code", "API_KEY_AUTH_FAILED");

    // env vars should be cleaned up on failure
    expect(process.env.CLOUDBASE_API_KEY).toBeUndefined();
    expect(process.env.CLOUDBASE_ENV_ID).toBeUndefined();
  });

  it("auth(action=login_by_api_key) should return error when peekLoginState throws", async () => {
    mockPeekLoginState.mockRejectedValue(new Error("network error"));

    const result = await tools.auth.handler({
      action: "login_by_api_key",
      apiKey: "test-api-key",
      apiKeyEnvId: "env-test",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveProperty("ok", false);
    expect(payload).toHaveProperty("code", "API_KEY_AUTH_FAILED");
    expect(payload.message).toContain("network error");

    // env vars should be cleaned up on exception
    expect(process.env.CLOUDBASE_API_KEY).toBeUndefined();
    expect(process.env.CLOUDBASE_ENV_ID).toBeUndefined();
  });

  it("auth(action=status) should detect api_key mode from CLOUDBASE_APIKEY fallback", async () => {
    process.env.CLOUDBASE_APIKEY = "compat-api-key";
    process.env.CLOUDBASE_ENV_ID = "env-test";
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      envId: "env-test",
    });
    mockGetCachedEnvId.mockReturnValue("env-test");

    try {
      const result = await tools.auth.handler({ action: "status" });
      const payload = JSON.parse(result.content[0].text);

      expect(payload).toHaveProperty("ok", true);
      expect(payload).toHaveProperty("auth_mode", "api_key");
      expect(payload).toHaveProperty("auth_status", "READY");
    } finally {
      delete process.env.CLOUDBASE_APIKEY;
      delete process.env.CLOUDBASE_ENV_ID;
    }
  });

  it("auth(action=logout) should block when only CLOUDBASE_APIKEY is set", async () => {
    process.env.CLOUDBASE_APIKEY = "compat-api-key";
    process.env.CLOUDBASE_ENV_ID = "env-test";

    try {
      const result = await tools.auth.handler({
        action: "logout",
        confirm: "yes",
      });
      const payload = JSON.parse(result.content[0].text);

      expect(payload).toHaveProperty("ok", false);
      expect(payload).toHaveProperty("code", "LOGOUT_NOT_ALLOWED");
      expect(payload).toHaveProperty("auth_mode", "api_key");
    } finally {
      delete process.env.CLOUDBASE_APIKEY;
      delete process.env.CLOUDBASE_ENV_ID;
    }
  });
});

describe("env tools - envQuery", () => {
  const originalCloudbaseEnvId_envQuery = process.env.CLOUDBASE_ENV_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLOUDBASE_ENV_ID;
    mockGetCachedEnvId.mockReturnValue(null);
    mockListAvailableEnvCandidates.mockResolvedValue([]);
    mockResolveEnvCandidateByEnvId.mockResolvedValue(undefined);
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

  afterEach(() => {
    if (originalCloudbaseEnvId_envQuery !== undefined) {
      process.env.CLOUDBASE_ENV_ID = originalCloudbaseEnvId_envQuery;
    } else {
      delete process.env.CLOUDBASE_ENV_ID;
    }
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
    const result = await tools.queryEnv.handler({
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
    expect(payload.credential_scope).toBe("account");
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
    const result = await tools.queryEnv.handler({
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
    const unfiltered = JSON.parse((await tools.queryEnv.handler({ action: "list" })).content[0].text);
    const filtered = JSON.parse(
      (await tools.queryEnv.handler({ action: "list", envId: "env-other" })).content[0].text,
    );

    expect(unfiltered.EnvList).toEqual([{ EnvId: "env-test", Alias: "bound", PackageId: "baas_personal" }]);
    expect(unfiltered.AppliedFilters.currentEnvOnly).toBe(true);
    expect(filtered.EnvList).toEqual([{ EnvId: "env-other", Alias: "other", PackageId: "baas_free" }]);
    expect(filtered.AppliedFilters.currentEnvOnly).toBe(false);
    expect(filtered.RecommendedNextAction).toMatchObject({
      tool: "queryEnv",
      action: "info",
    });
  });

  it("envQuery(list) should pass region through to CloudBase manager", async () => {
    const commonServiceCall = vi.fn().mockResolvedValue({
      EnvList: [
        {
          EnvId: "alfred-test-sg-d7gxpjc7g94e84f6c",
          Alias: "sg",
          Region: "ap-singapore",
          Status: "NORMAL",
        },
      ],
    });
    mockGetCloudBaseManager.mockResolvedValue({
      commonService: vi.fn(() => ({
        call: commonServiceCall,
      })),
      env: {
        listEnvs: vi.fn(),
      },
    });

    const { tools } = createMockServer();
    const result = await tools.queryEnv.handler({
      action: "list",
      region: "ap-singapore",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockGetCloudBaseManager).toHaveBeenCalledWith(
      expect.objectContaining({
        requireEnvId: false,
        cloudBaseOptions: expect.objectContaining({
          region: "ap-singapore",
        }),
      }),
    );
    expect(payload.EnvList[0].EnvId).toBe("alfred-test-sg-d7gxpjc7g94e84f6c");
    expect(payload.AppliedFilters.region).toBe("ap-singapore");
    expect(payload.AppliedFilters.currentEnvOnly).toBe(false);
    expect(payload.query_region).toBe("ap-singapore");
  });

  it("queryEnv schema should expose region enum for list", async () => {
    const { tools } = createMockServer();
    expect(tools.queryEnv.meta.inputSchema.region.unwrap().options).toEqual([
      "ap-shanghai",
      "ap-guangzhou",
      "ap-singapore",
    ]);
  });

  it("envQuery(list) should use DescribeEnvInfo when CLOUDBASE_ENV_ID is set", async () => {
    process.env.CLOUDBASE_ENV_ID = "env-test";

    const describeEnvInfo = vi.fn().mockResolvedValue({
      EnvInfo: {
        EnvId: "env-test",
        Alias: "apikey-env",
        Status: "NORMAL",
      },
    });

    mockGetCloudBaseManager.mockResolvedValue({
      commonService: vi.fn(),
      env: {
        listEnvs: vi.fn(),
        describeEnvInfo,
      },
    });

    const { tools } = createMockServer();
    const result = await tools.queryEnv.handler({ action: "list" });
    const payload = JSON.parse(result.content[0].text);

    expect(describeEnvInfo).toHaveBeenCalledWith({ EnvId: "env-test" });
    expect(payload.EnvList).toEqual([
      { EnvId: "env-test", Alias: "apikey-env", Status: "NORMAL" },
    ]);
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
    const payload = JSON.parse((await tools.queryEnv.handler({ action: "info" })).content[0].text);

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
    // Storages alone must NOT imply NoSQL (flexdb); CreateEnv treats them separately.
    expect(payload.EnvInfo.RuntimeBackends).toEqual({
      postgresql: false,
      nosql: false,
      mysql: false,
    });
    expect(commonServiceCall).toHaveBeenCalledWith({
      Action: "DescribeBillingInfo",
      Param: {
        EnvId: "env-test",
      },
    });
  });

  it("envQuery(info) should project staticDomainRouteEnabled without rewriting StaticDomain", async () => {
    const describeHttpServiceRoute = vi.fn().mockResolvedValue({
      Domains: [
        {
          Domain: "env-test.tcloudbaseapp.com",
          IsDefault: true,
          Routes: [
            {
              Path: "/",
              Enable: false,
              UpstreamResourceType: "STATIC_STORE",
              UpstreamResourceName: "staticstore",
            },
          ],
        },
      ],
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        getEnvInfo: vi.fn().mockResolvedValue({
          EnvInfo: {
            EnvId: "env-test",
            StaticStorages: [
              {
                StaticDomain: "env-test.tcloudbaseapp.com",
                Bucket: "hosting-bucket",
              },
            ],
          },
        }),
        describeHttpServiceRoute,
      },
      commonService: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({}),
      })),
    });

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.queryEnv.handler({ action: "info", envId: "env-test" })
      ).content[0].text,
    );

    expect(payload.EnvInfo.StaticStorages[0].StaticDomain).toBe(
      "env-test.tcloudbaseapp.com",
    );
    expect(payload.EnvInfo.StaticStorages[0].staticDomainRouteEnabled).toBe(
      false,
    );
    expect(payload.EnvInfo.staticDomainRouteEnabled).toBe(false);
    expect(payload.EnvInfo.accessUrlReachable).toBe(false);
    expect(payload.EnvInfo.routeDisabled).toBe(true);
    expect(payload.EnvInfo.disabledAccessUrls).toEqual([
      "https://env-test.tcloudbaseapp.com/",
    ]);
    expect(describeHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Limit: 1000,
    });
  });

  it("envQuery(info) should set staticDomainRouteEnabled=true when default hosting route is enabled", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        getEnvInfo: vi.fn().mockResolvedValue({
          EnvInfo: {
            EnvId: "env-test",
            StaticStorages: [
              {
                StaticDomain: "env-test.tcloudbaseapp.com",
                Bucket: "hosting-bucket",
              },
            ],
          },
        }),
        describeHttpServiceRoute: vi.fn().mockResolvedValue({
          Domains: [
            {
              Domain: "env-test.tcloudbaseapp.com",
              IsDefault: true,
              Routes: [
                {
                  Path: "/",
                  Enable: true,
                  UpstreamResourceType: "STATIC_STORE",
                  UpstreamResourceName: "staticstore",
                },
              ],
            },
          ],
        }),
      },
      commonService: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({}),
      })),
    });

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.queryEnv.handler({ action: "info", envId: "env-test" })
      ).content[0].text,
    );

    expect(payload.EnvInfo.StaticStorages[0]).toMatchObject({
      StaticDomain: "env-test.tcloudbaseapp.com",
      staticDomainRouteEnabled: true,
    });
    expect(payload.EnvInfo.staticDomainRouteEnabled).toBe(true);
    expect(payload.EnvInfo.accessUrlReachable).toBe(true);
    expect(payload.EnvInfo.routeDisabled).toBeUndefined();
  });

  it("envQuery(info) RuntimeBackends.nosql should require usable Databases InstanceId", async () => {
    const cases: Array<{
      name: string;
      envInfo: Record<string, unknown>;
      expected: { postgresql: boolean; nosql: boolean; mysql: boolean };
      runtimeMode: "postgresql" | "nosql";
    }> = [
      {
        name: "running flexdb",
        envInfo: {
          EnvId: "env-test",
          Databases: [{ InstanceId: "tnt-1", Status: "RUNNING" }],
        },
        expected: { postgresql: false, nosql: true, mysql: false },
        runtimeMode: "nosql",
      },
      {
        name: "storages-only must not set nosql",
        envInfo: {
          EnvId: "env-test",
          Storages: [{ Bucket: "bucket-only" }],
        },
        expected: { postgresql: false, nosql: false, mysql: false },
        runtimeMode: "nosql",
      },
      {
        name: "empty InstanceId ignored",
        envInfo: {
          EnvId: "env-test",
          Databases: [{ InstanceId: "", Status: "RUNNING" }],
          Storages: [{ Bucket: "bucket-1" }],
        },
        expected: { postgresql: false, nosql: false, mysql: false },
        runtimeMode: "nosql",
      },
      {
        name: "non-RUNNING Databases ignored",
        envInfo: {
          EnvId: "env-test",
          Databases: [{ InstanceId: "tnt-pending", Status: "CREATING" }],
        },
        expected: { postgresql: false, nosql: false, mysql: false },
        runtimeMode: "nosql",
      },
      {
        name: "PG + flexdb coexist",
        envInfo: {
          EnvId: "env-test",
          PostgreSQL: [{ InstanceId: "pg-1" }],
          Databases: [{ InstanceId: "tnt-1", Status: "RUNNING" }],
          Storages: [{ Bucket: "legacy-bucket" }],
        },
        expected: { postgresql: true, nosql: true, mysql: false },
        runtimeMode: "postgresql",
      },
      {
        name: "PG + storage without flexdb",
        envInfo: {
          EnvId: "env-test",
          PostgreSQL: [{ InstanceId: "pg-1" }],
          Storages: [{ Bucket: "legacy-bucket" }],
        },
        expected: { postgresql: true, nosql: false, mysql: false },
        runtimeMode: "postgresql",
      },
      {
        name: "empty Databases array is nosql=false",
        envInfo: {
          EnvId: "env-test",
          Databases: [],
        },
        expected: { postgresql: false, nosql: false, mysql: false },
        runtimeMode: "nosql",
      },
    ];

    for (const testCase of cases) {
      mockGetCloudBaseManager.mockResolvedValue({
        env: {
          getEnvInfo: vi.fn().mockResolvedValue({ EnvInfo: testCase.envInfo }),
        },
        commonService: vi.fn(() => ({
          call: vi.fn().mockResolvedValue({}),
        })),
      });

      const { tools } = createMockServer();
      const payload = JSON.parse(
        (await tools.queryEnv.handler({ action: "info" })).content[0].text,
      );

      expect(payload.EnvInfo.RuntimeBackends, testCase.name).toEqual(
        testCase.expected,
      );
      expect(payload.EnvInfo.RuntimeMode, testCase.name).toBe(
        testCase.runtimeMode,
      );
    }
  });

  it("isUsableNoSqlDatabaseEntry accepts live DescribeEnvs flexdb tnt InstanceIds", () => {
    // Captured 2026-08-05 via tcb DescribeEnvs for this account.
    // ListTables(Tag=<InstanceId>) succeeded for each of these tnt values.
    const liveDatabases = [
      {
        envId: "ai-9gra12b5b6a3c966",
        entry: {
          InstanceId: "tnt-88yexwqcw",
          Status: "RUNNING",
          Region: "ap-shanghai",
        },
      },
      {
        envId: "ai-native-d1ggefhgb8c27e3e8",
        entry: {
          InstanceId: "tnt-n8pjn7tiu",
          Status: "RUNNING",
          Region: "ap-shanghai",
        },
      },
      {
        envId: "ai-share-d2guukyxybb63b206",
        entry: {
          InstanceId: "tnt-0svnxv8c6",
          Status: "RUNNING",
          Region: "ap-shanghai",
        },
      },
    ];

    for (const { envId, entry } of liveDatabases) {
      expect(isUsableNoSqlDatabaseEntry(entry), envId).toBe(true);
    }

    // Negative: stripping Databases (CreateEnv without flexdb) must not count
    // as NoSQL even when Storages remains — storage is unrelated to flexdb.
    expect(isUsableNoSqlDatabaseEntry(undefined)).toBe(false);
    expect(isUsableNoSqlDatabaseEntry({ InstanceId: "", Status: "RUNNING" })).toBe(
      false,
    );
    expect(
      [{}, { Bucket: "6169-ai-native-d1ggefhgb8c27e3e8-1251119057" }].some(
        isUsableNoSqlDatabaseEntry,
      ),
    ).toBe(false);
    expect(
      ([] as unknown[]).some(isUsableNoSqlDatabaseEntry),
    ).toBe(false);
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
    await tools.queryEnv.handler({ action: "info", envId: "env-override" });

    expect(mockGetCloudBaseManager).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudBaseOptions: expect.objectContaining({
          envId: "env-override",
        }),
      }),
    );
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
    const payload = JSON.parse((await tools.queryEnv.handler({ action: "domains" })).content[0].text);

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
    const payload = JSON.parse((await tools.queryEnv.handler({ action: "domains" })).content[0].text);

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
        pollTool: "queryEnv",
        pollAction: "domains",
        pollIntervalSuggestionSeconds: 10,
        timeoutSuggestionSeconds: 300,
      },
      next_step: {
        tool: "queryEnv",
        action: "domains",
        suggested_args: {
          action: "domains",
        },
      },
    });
    expect(payload.message).toContain('轮询 queryEnv(action="domains")');
    expect(payload.message).toContain("勿一次 sleep 满 10 分钟");
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
        pollTool: "queryEnv",
        pollAction: "domains",
      },
      next_step: {
        tool: "queryEnv",
        action: "domains",
      },
    });
    expect(payload.message).toContain("直到目标域名不再出现");
  });

  it("queryEnv schema should expose usage action and module enum", async () => {
    const { tools } = createMockServer();
    expect(tools.queryEnv.meta.inputSchema.action.options).toEqual([
      "list",
      "info",
      "domains",
      "usage",
      "metrics",
    ]);
    expect(tools.queryEnv.meta.inputSchema.type.unwrap().element.options).toEqual([
      ...ENV_USAGE_MODULE_VALUES,
    ]);
    expect(tools.envQuery.meta.inputSchema.action.options).toContain("usage");
  });

  it("queryEnv schema should expose metrics action and metric enum", async () => {
    const { tools } = createMockServer();
    expect(tools.queryEnv.meta.inputSchema.action.options).toContain("metrics");
    expect(tools.queryEnv.meta.inputSchema.metricName.unwrap().options).toEqual([
      ...ENV_METRIC_NAME_VALUES,
    ]);
    expect(
      tools.queryEnv.meta.inputSchema.period.unwrap().options.map((item: { value: number }) => item.value),
    ).toEqual([...ENV_METRIC_PERIOD_VALUES]);
    expect(tools.envQuery.meta.inputSchema.action.options).toContain("metrics");
    expect(tools.queryEnv.meta.description).toContain("action=metrics");
    expect(tools.queryEnv.meta.description).toContain("DescribeCurveData");
  });

  it("envQuery(usage) should require envId", async () => {
    const { tools } = createMockServer();
    const result = await tools.queryEnv.handler({ action: "usage" });
    expect(result.content[0].text).toContain("envId 为必填参数");
    expect(result.content[0].text).toContain("queryEnv");
  });

  it("envQuery(usage) should call account circle + credits usage APIs", async () => {
    const describeEnvAccountCircle = vi.fn().mockResolvedValue({
      StartTime: "2026-08-01 00:00:00",
      EndTime: "2026-08-31 23:59:59",
      HistoryTime: [],
      RequestId: "req-circle",
    });
    const describeCreditsUsageDetail = vi.fn().mockResolvedValue({
      Usages: [
        {
          EnvId: "ai-native-d1ggefhgb8c27e3e8",
          Module: "SCF",
          CreditsValue: 12,
          MetricUsageDetail: [{ MetricName: "Invocations", Value: 3 }],
        },
      ],
      RequestId: "req-usage",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        describeEnvAccountCircle,
        describeCreditsUsageDetail,
      },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.queryEnv.handler({
          action: "usage",
          envId: "ai-native-d1ggefhgb8c27e3e8",
          type: ["SCF", "COS"],
        })
      ).content[0].text,
    );

    expect(describeEnvAccountCircle).toHaveBeenCalledWith({
      EnvId: "ai-native-d1ggefhgb8c27e3e8",
    });
    expect(describeCreditsUsageDetail).toHaveBeenCalledWith({
      EnvId: "ai-native-d1ggefhgb8c27e3e8",
      Modules: ["SCF", "COS"],
      StartDate: "2026-08-01",
      EndDate: "2026-08-31",
      NeedUsageDetails: true,
    });
    expect(payload).toMatchObject({
      EnvId: "ai-native-d1ggefhgb8c27e3e8",
      Modules: ["SCF", "COS"],
      StartDate: "2026-08-01",
      EndDate: "2026-08-31",
      DateSource: "accountCircle",
      NeedUsageDetails: true,
      Usages: [
        {
          Module: "SCF",
          CreditsValue: 12,
        },
      ],
    });
  });

  it("envQuery(usage) should honor explicit date range", async () => {
    const describeEnvAccountCircle = vi.fn().mockResolvedValue({
      StartTime: "2026-08-01 00:00:00",
      EndTime: "2026-08-31 23:59:59",
    });
    const describeCreditsUsageDetail = vi.fn().mockResolvedValue({
      Usages: [],
      RequestId: "req-usage-2",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        describeEnvAccountCircle,
        describeCreditsUsageDetail,
      },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.queryEnv.handler({
          action: "usage",
          envId: "env-test",
          startDate: "2026-07-01",
          endDate: "2026-07-15",
          needUsageDetails: false,
        })
      ).content[0].text,
    );

    expect(describeCreditsUsageDetail).toHaveBeenCalledWith({
      EnvId: "env-test",
      Modules: [...ENV_USAGE_MODULE_VALUES],
      StartDate: "2026-07-01",
      EndDate: "2026-07-15",
      NeedUsageDetails: false,
    });
    expect(payload.DateSource).toBe("params");
    expect(payload.Modules).toEqual([...ENV_USAGE_MODULE_VALUES]);
  });

  it("envQuery(metrics) should require envId and metricName", async () => {
    const { tools } = createMockServer();
    const missingEnv = await tools.queryEnv.handler({ action: "metrics" });
    expect(missingEnv.content[0].text).toContain("envId 为必填参数");
    expect(missingEnv.content[0].text).toContain("queryEnv");

    const missingMetric = await tools.queryEnv.handler({
      action: "metrics",
      envId: "env-test",
    });
    expect(missingMetric.content[0].text).toContain("metricName 为必填参数");
  });

  it("envQuery(metrics) should call monitor.describeCurveData and summarize the curve", async () => {
    const describeCurveData = vi.fn().mockResolvedValue({
      StartTime: "2026-08-16 16:00:00",
      EndTime: "2026-08-17 16:00:00",
      MetricName: "FunctionInvocation",
      Period: 300,
      Values: [0, 12, 3],
      Time: [1786900000, 1786900300, 1786900600],
      NewValues: [0, 12, 3],
      Statistics: "sum",
      RequestId: "req-metrics",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      monitor: { describeCurveData },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.queryEnv.handler({
          action: "metrics",
          envId: "ai-native-d1ggefhgb8c27e3e8",
          metricName: "FunctionInvocation",
          startTime: "2026-08-16 16:00:00",
          endTime: "2026-08-17 16:00:00",
          period: 300,
          resourceID: "hello-word-test",
        })
      ).content[0].text,
    );

    expect(describeCurveData).toHaveBeenCalledWith({
      MetricName: "FunctionInvocation",
      StartTime: "2026-08-16 16:00:00",
      EndTime: "2026-08-17 16:00:00",
      Period: 300,
      ResourceID: "hello-word-test",
    });
    expect(payload).toMatchObject({
      EnvId: "ai-native-d1ggefhgb8c27e3e8",
      MetricName: "FunctionInvocation",
      TimeSource: "params",
      Period: 300,
      ResourceID: "hello-word-test",
      Summary: {
        sampleCount: 3,
        max: 12,
        min: 0,
        latest: 3,
        peakTimestamp: 1786900300,
        allZero: false,
      },
    });
    expect(payload.Curve.RequestId).toBe("req-metrics");
  });

  it("envQuery(metrics) should default GatewayTraceEnvQPS resourceID and last 24h range", async () => {
    const describeCurveData = vi.fn().mockResolvedValue({
      MetricName: "GatewayTraceEnvQPS",
      Period: 300,
      Values: [8, 42, 10],
      Time: [1, 2, 3],
      NewValues: [8, 42, 10],
      RequestId: "req-qps",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      monitor: { describeCurveData },
    });

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.queryEnv.handler({
          action: "metrics",
          envId: "env-test",
          metricName: "GatewayTraceEnvQPS",
        })
      ).content[0].text,
    );

    expect(describeCurveData).toHaveBeenCalledWith(
      expect.objectContaining({
        MetricName: "GatewayTraceEnvQPS",
        ResourceID: GATEWAY_ENV_QPS_DEFAULT_RESOURCE_ID,
      }),
    );
    expect(payload.TimeSource).toBe("defaultLast24h");
    expect(payload.Summary.max).toBe(42);
    expect(payload.Summary.allZero).toBe(false);
  });

  it("envQuery(metrics) should require resourceID for CloudRun metrics", async () => {
    const { tools } = createMockServer();
    const result = await tools.queryEnv.handler({
      action: "metrics",
      envId: "env-test",
      metricName: "TkeCpuUsedService",
    });
    expect(result.content[0].text).toContain("resourceID 为必填");
    expect(result.content[0].text).toContain("TkeCpuUsedService");
  });
});

describe("env usage helpers", () => {
  it("resolveEnvUsageModules should default to all CLI modules and reject unknowns", () => {
    expect(resolveEnvUsageModules(undefined)).toEqual([...ENV_USAGE_MODULE_VALUES]);
    expect(resolveEnvUsageModules(["FLEXDB", "SCF"])).toEqual(["FLEXDB", "SCF"]);
    expect(() => resolveEnvUsageModules(["NOT_A_MODULE"])).toThrow(/无效的用量模块/);
  });

  it("resolveEnvUsageDateRange should derive dates from account circle", () => {
    expect(extractAccountCircleDate("2026-08-01 00:00:00")).toBe("2026-08-01");
    expect(
      resolveEnvUsageDateRange({
        accountCircle: {
          StartTime: "2026-08-01 00:00:00",
          EndTime: "2026-08-31 23:59:59",
        },
      }),
    ).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      dateSource: "accountCircle",
    });
  });
});

describe("env metrics helpers", () => {
  it("resolveEnvMetricName should accept catalog names and reject unknowns", () => {
    expect(resolveEnvMetricName("FunctionInvocation")).toBe("FunctionInvocation");
    expect(() => resolveEnvMetricName(undefined)).toThrow(/metricName 为必填/);
    expect(() => resolveEnvMetricName("GetMonitorData")).toThrow(/无效的 metricName/);
  });

  it("resolveEnvMetricPeriod should allow SDK periods only", () => {
    expect(resolveEnvMetricPeriod(undefined)).toBeUndefined();
    expect(resolveEnvMetricPeriod(300)).toBe(300);
    expect(resolveEnvMetricPeriod("3600")).toBe(3600);
    expect(() => resolveEnvMetricPeriod(60)).toThrow(/period 仅支持/);
  });

  it("resolveEnvMetricTimeRange should default to last 24h and validate pairs", () => {
    const now = new Date("2026-08-17T16:00:00");
    expect(resolveEnvMetricTimeRange({ now })).toEqual({
      startTime: formatEnvMetricTime(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      endTime: formatEnvMetricTime(now),
      timeSource: "defaultLast24h",
    });
    expect(
      resolveEnvMetricTimeRange({
        startTime: "2026-08-16 10:00:00",
        endTime: "2026-08-16 12:00:00",
      }),
    ).toEqual({
      startTime: "2026-08-16 10:00:00",
      endTime: "2026-08-16 12:00:00",
      timeSource: "params",
    });
    expect(() =>
      resolveEnvMetricTimeRange({ startTime: "2026-08-16 10:00:00" }),
    ).toThrow(/必须同时提供/);
    expect(() =>
      resolveEnvMetricTimeRange({
        startTime: "2026-08-16",
        endTime: "2026-08-17",
      }),
    ).toThrow(/YYYY-MM-DD HH:mm:ss/);
    expect(() =>
      resolveEnvMetricTimeRange({
        startTime: "2026-08-16 10:00:00",
        endTime: "2026-08-16 10:03:00",
      }),
    ).toThrow(/至少五分钟/);
  });

  it("resolveEnvMetricResourceId should fill gateway QPS and require CloudRun service name", () => {
    expect(resolveEnvMetricResourceId("GatewayTraceEnvQPS")).toBe(
      GATEWAY_ENV_QPS_DEFAULT_RESOURCE_ID,
    );
    expect(resolveEnvMetricResourceId("FunctionInvocation")).toBeUndefined();
    expect(resolveEnvMetricResourceId("FunctionInvocation", "hello")).toBe("hello");
    expect(() => resolveEnvMetricResourceId("TkeQPSService")).toThrow(/resourceID 为必填/);
  });

  it("summarizeEnvMetricCurve should report peak and all-zero invocation", () => {
    expect(
      summarizeEnvMetricCurve({
        Values: [0, 0, 0],
        NewValues: [0, 0, 0],
        Time: [1, 2, 3],
      }),
    ).toMatchObject({
      sampleCount: 3,
      max: 0,
      allZero: true,
    });
    expect(
      summarizeEnvMetricCurve({
        Values: [1, 9, 4],
        NewValues: [1.5, 9.2, 4.1],
        Time: [10, 20, 30],
      }),
    ).toMatchObject({
      max: 9.2,
      peakTimestamp: 20,
      allZero: false,
    });
  });
});

describe("manageEnv", () => {
  beforeEach(() => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      envId: "env-test",
      token: "token",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listPackages should return package list", async () => {
    const describeBaasPackageList = vi.fn().mockResolvedValue({
      PackageList: [
        { PackageId: "baas_personal", PackageName: "个人版", Region: "ap-shanghai" },
        { PackageId: "baas_pf_standard", PackageName: "标准版", Region: "ap-shanghai" },
      ],
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: { describeBaasPackageList },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (await tools.manageEnv.handler({ action: "listPackages" })).content[0].text,
    );

    expect(describeBaasPackageList).toHaveBeenCalledWith({
      TargetAction: "new",
      Source: "qcloud",
    });
    expect(payload).toMatchObject({
      ok: true,
      code: "PACKAGE_LIST",
      packages: expect.any(Array),
    });
  });

  it("listPackages should surface BillTags failures clearly", async () => {
    const describeBaasPackageList = vi.fn().mockRejectedValue(new Error("find billTags error"));
    mockGetCloudBaseManager.mockResolvedValue({
      env: { describeBaasPackageList },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (await tools.manageEnv.handler({ action: "listPackages" })).content[0].text,
    );

    expect(payload).toMatchObject({
      ok: false,
      code: "PACKAGE_LIST_FAILED",
    });
    expect(payload.message).toContain("BillTags");
    expect(payload.message).toContain("baas_personal");
  });

  it("create should require confirm before execution", async () => {
    const createEnv = vi.fn();
    mockGetCloudBaseManager.mockResolvedValue({
      env: { createEnv },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "create",
          alias: "my-env",
          packageId: "baas_personal",
        })
      ).content[0].text,
    );

    expect(createEnv).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      ok: false,
      code: "CONFIRM_REQUIRED",
    });
    expect(payload.message).toContain("确认");
    expect(payload.message).toContain("flexdb, storage, function, postgresql");
    expect(payload.message).not.toContain("地域:");
    expect(payload.message).toContain("CreateEnv 不接受 Region");
    // 询价失败时应降级，仍返回 confirm 并暴露 pricing.inquiryFailed
    expect(payload.pricing?.inquiryFailed).toBe(true);
    expect(payload.release_method?.method).toBe("手动销毁");
    // 对照控制台购买页的多段披露
    expect(payload.message).toContain("资源清单");
    expect(payload.message).toContain("云数据库 / 云函数 / 云存储 / 静态托管 / 身份认证");
    expect(payload.message).toContain("计费项");
    expect(payload.message).toContain("数据库容量/调用");
    expect(payload.message).toContain("计费方式");
    expect(payload.message).toContain("资源释放方式");
    expect(payload.message).toContain("我已知晓");
    expect(payload.message).toContain(
      "https://cloud.tencent.com/document/product/876/39093",
    );
    expect(payload.message).toContain(
      "https://cloud.tencent.com/document/product/876/120713",
    );
    expect(payload.message).toContain(
      "https://cloud.tencent.com/document/product/876/127357",
    );
    expect(payload.message).toContain(
      "https://cloud.tencent.com/document/product/555/9618",
    );
    expect(payload.doc_links).toMatchObject({
      package: expect.stringContaining("cloud.tencent.com"),
      billingItems: expect.stringContaining("cloud.tencent.com"),
      resourcePointPrice: expect.stringContaining("cloud.tencent.com"),
      prepayExpiry: expect.stringContaining("cloud.tencent.com"),
    });
    expect(payload.confirmation_acknowledgement).toMatchObject({
      required: true,
      text: expect.stringContaining("我已知晓"),
    });
    expect(payload.release_method?.detail).toContain("资源释放方式");
  });

  it("create should show free-experience disclosure when packageId hints free tier", async () => {
    const createEnv = vi.fn();
    const describeBaasPackageList = vi.fn().mockResolvedValue({
      PackageList: [
        {
          BillTags: "baas_free_trial",
          PackageName: "baas_free_trial",
          PackageTitle: "免费体验版",
        },
      ],
    });
    const calculatePackageCreatePrice = vi.fn().mockResolvedValue({
      RealTotalCost: 0,
      TotalCost: 0,
      TimeSpan: 1,
      TimeUnit: "mon",
      Currency: "CNY",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        createEnv,
        describeBaasPackageList,
        calculatePackageCreatePrice,
      },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "create",
          alias: "trial-env",
          packageId: "baas_free_trial",
        })
      ).content[0].text,
    );

    expect(payload.code).toBe("CONFIRM_REQUIRED");
    // 免费版披露：3000 资源点 + 1 个月有效期 + 免费续期
    expect(payload.message).toContain("3000 资源点");
    expect(payload.message).toContain("免费体验版");
    expect(payload.message).toContain("有效期 1 个月");
    expect(payload.message).toContain("免费续期");
    expect(payload.package_info).toEqual({
      packageId: "baas_free_trial",
      packageTitle: "免费体验版",
    });
  });

  it("create should enrich confirm with package title and price when inquiry succeeds", async () => {
    const createEnv = vi.fn();
    const describeBaasPackageList = vi.fn().mockResolvedValue({
      PackageList: [
        {
          BillTags: "baas_personal",
          PackageName: "baas_personal",
          PackageTitle: "个人版",
        },
      ],
    });
    const calculatePackageCreatePrice = vi.fn().mockResolvedValue({
      RealTotalCost: 19.9,
      TotalCost: 29.9,
      Price: 19.9,
      TimeSpan: 1,
      TimeUnit: "mon",
      Currency: "CNY",
      Formula: "price=19.9",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        createEnv,
        describeBaasPackageList,
        calculatePackageCreatePrice,
      },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "create",
          alias: "my-env",
          packageId: "baas_personal",
        })
      ).content[0].text,
    );

    expect(createEnv).not.toHaveBeenCalled();
    expect(payload.code).toBe("CONFIRM_REQUIRED");
    expect(payload.message).toContain("个人版");
    expect(payload.message).toContain("￥19.9");
    expect(payload.message).toContain("释放方式");
    expect(payload.package_info).toEqual({
      packageId: "baas_personal",
      packageTitle: "个人版",
    });
    expect(payload.pricing).toMatchObject({
      realTotalCost: 19.9,
      totalCost: 29.9,
      inquiryRegion: expect.any(String),
    });
    expect(calculatePackageCreatePrice).toHaveBeenCalledWith(
      expect.objectContaining({
        packageId: "baas_personal",
        period: 1,
      }),
    );
  });

  it("create should succeed with confirm=yes and never send Region", async () => {
    const createEnv = vi.fn().mockResolvedValue({
      EnvId: "env-new-123",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: { createEnv },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "create",
          alias: "my-env",
          packageId: "baas_personal",
          resources: ["flexdb", "storage", "function", "postgresql"],
          duration: 1,
          confirm: "yes",
        })
      ).content[0].text,
    );

    expect(mockGetCloudBaseManager).toHaveBeenCalledWith(
      expect.objectContaining({ requireEnvId: false }),
    );
    expect(createEnv).toHaveBeenCalledWith({
      Alias: "my-env",
      PackageId: "baas_personal",
      Period: 1,
      Resources: ["flexdb", "storage", "function", "postgresql"],
    });
    expect(createEnv.mock.calls[0][0]).not.toHaveProperty("Region");
    expect(payload).toMatchObject({
      ok: true,
      code: "ENV_CREATED",
      envId: "env-new-123",
      resources: ["flexdb", "storage", "function", "postgresql"],
    });
  });

  it("listPackages should not require a bound envId", async () => {
    const describeBaasPackageList = vi.fn().mockResolvedValue({ PackageList: [] });
    mockGetCloudBaseManager.mockResolvedValue({
      env: { describeBaasPackageList },
    } as any);

    const { tools } = createMockServer();
    await tools.manageEnv.handler({ action: "listPackages" });

    expect(mockGetCloudBaseManager).toHaveBeenCalledWith(
      expect.objectContaining({ requireEnvId: false }),
    );
  });

  it("create should default Resources when omitted", async () => {
    const createEnv = vi.fn().mockResolvedValue({
      EnvId: "env-default-resources",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: { createEnv },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "create",
          alias: "default-res",
          packageId: "baas_personal",
          confirm: "yes",
        })
      ).content[0].text,
    );

    expect(createEnv).toHaveBeenCalledWith({
      Alias: "default-res",
      PackageId: "baas_personal",
      Period: 1,
      Resources: ["flexdb", "storage", "function", "postgresql"],
    });
    expect(payload).toMatchObject({
      ok: true,
      code: "ENV_CREATED",
      envId: "env-default-resources",
    });
  });

  it("modifyPlan should require confirm before execution", async () => {
    const modifyEnvPlan = vi.fn();
    mockGetCloudBaseManager.mockResolvedValue({
      env: { modifyEnvPlan },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "modifyPlan",
          envId: "env-test",
          packageId: "baas_pf_standard",
        })
      ).content[0].text,
    );

    expect(modifyEnvPlan).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      ok: false,
      code: "CONFIRM_REQUIRED",
    });
    // 询价失败降级：仍暴露 inquiryFailed + release_method
    expect(payload.pricing?.inquiryFailed).toBe(true);
    expect(payload.release_method?.method).toBe("手动销毁");
    expect(payload.new_package).toEqual({
      packageId: "baas_pf_standard",
      packageTitle: null,
    });
    // 多段披露：资源释放方式、文档链接、已知晓声明
    expect(payload.message).toContain("资源释放方式");
    expect(payload.message).toContain("参考文档");
    expect(payload.message).toContain(
      "https://cloud.tencent.com/document/product/876/39093",
    );
    expect(payload.message).toContain(
      "https://cloud.tencent.com/document/product/555/9618",
    );
    expect(payload.message).toContain("我已知晓");
    expect(payload.doc_links).toMatchObject({
      package: expect.stringContaining("cloud.tencent.com"),
      prepayExpiry: expect.stringContaining("cloud.tencent.com"),
    });
    expect(payload.confirmation_acknowledgement?.required).toBe(true);
    expect(payload.release_method?.detail).toContain("资源释放方式");
  });

  it("modifyPlan should enrich confirm with current/new package and price when inquiry succeeds", async () => {
    const modifyEnvPlan = vi.fn();
    const describeBaasPackageList = vi.fn().mockResolvedValue({
      PackageList: [
        {
          BillTags: "baas_pf_standard",
          PackageName: "baas_pf_standard",
          PackageTitle: "标准版",
        },
      ],
    });
    const describeBillingInfo = vi.fn().mockResolvedValue({
      EnvBillingInfoList: [
        {
          EnvId: "env-test",
          PackageName: "个人版",
          PackageId: "baas_personal",
          ExpireTime: "2027-01-01 00:00:00",
          PayMode: "prepay",
        },
      ],
    });
    const calculatePackageModifyPrice = vi.fn().mockResolvedValue({
      RealTotalCost: 50,
      TotalCost: 80,
      Refund: 0,
      Currency: "CNY",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        modifyEnvPlan,
        describeBaasPackageList,
        describeBillingInfo,
        calculatePackageModifyPrice,
      },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "modifyPlan",
          envId: "env-test",
          packageId: "baas_pf_standard",
        })
      ).content[0].text,
    );

    expect(modifyEnvPlan).not.toHaveBeenCalled();
    expect(payload.code).toBe("CONFIRM_REQUIRED");
    expect(payload.message).toContain("当前套餐: 个人版");
    expect(payload.message).toContain("新套餐: baas_pf_standard（标准版）");
    expect(payload.message).toContain("￥50");
    expect(payload.message).toContain("释放方式");
    // 多段披露：资源释放方式详细说明、文档链接、已知晓
    expect(payload.message).toContain("资源释放方式");
    expect(payload.message).toContain("参考文档");
    expect(payload.message).toContain("我已知晓");
    expect(payload.current_package).toMatchObject({
      packageName: "个人版",
      packageId: "baas_personal",
    });
    expect(payload.new_package).toEqual({
      packageId: "baas_pf_standard",
      packageTitle: "标准版",
    });
    expect(payload.pricing).toMatchObject({
      realTotalCost: 50,
      totalCost: 80,
    });
  });

  it("modifyPlan should succeed with confirm=yes", async () => {
    const modifyEnvPlan = vi.fn().mockResolvedValue({
      RequestId: "req-modify",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: { modifyEnvPlan },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "modifyPlan",
          envId: "env-test",
          packageId: "baas_pf_enterprise",
          confirm: "yes",
        })
      ).content[0].text,
    );

    expect(modifyEnvPlan).toHaveBeenCalledWith({
      EnvId: "env-test",
      PackageId: "baas_pf_enterprise",
    });
    expect(payload).toMatchObject({
      ok: true,
      code: "PLAN_MODIFIED",
      envId: "env-test",
      packageId: "baas_pf_enterprise",
    });
  });

  it("renew should require confirm before execution", async () => {
    const renewEnv = vi.fn();
    mockGetCloudBaseManager.mockResolvedValue({
      env: { renewEnv },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "renew",
          envId: "env-test",
        })
      ).content[0].text,
    );

    expect(renewEnv).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      ok: false,
      code: "CONFIRM_REQUIRED",
    });
    // 询价失败降级：仍暴露 inquiryFailed + release_method
    expect(payload.pricing?.inquiryFailed).toBe(true);
    expect(payload.release_method?.method).toBe("手动销毁");
    // 多段披露：资源释放方式、文档链接、已知晓声明
    expect(payload.message).toContain("资源释放方式");
    expect(payload.message).toContain("参考文档");
    expect(payload.message).toContain(
      "https://cloud.tencent.com/document/product/555/9618",
    );
    expect(payload.message).toContain("我已知晓");
    expect(payload.doc_links?.prepayExpiry).toContain("cloud.tencent.com");
    expect(payload.confirmation_acknowledgement?.required).toBe(true);
  });

  it("renew should enrich confirm with current package and price when inquiry succeeds", async () => {
    const renewEnv = vi.fn();
    const describeBillingInfo = vi.fn().mockResolvedValue({
      EnvBillingInfoList: [
        {
          EnvId: "env-test",
          PackageName: "个人版",
          PackageId: "baas_personal",
          ExpireTime: "2027-01-01 00:00:00",
          PayMode: "prepay",
          IsAutoRenew: false,
        },
      ],
    });
    const calculatePackageRenewPrice = vi.fn().mockResolvedValue({
      RealTotalCost: 19.9,
      TotalCost: 29.9,
      TimeSpan: 3,
      TimeUnit: "mon",
      Currency: "CNY",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        renewEnv,
        describeBillingInfo,
        calculatePackageRenewPrice,
      },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "renew",
          envId: "env-test",
          duration: 3,
        })
      ).content[0].text,
    );

    expect(renewEnv).not.toHaveBeenCalled();
    expect(payload.code).toBe("CONFIRM_REQUIRED");
    expect(payload.message).toContain("当前套餐: 个人版");
    expect(payload.message).toContain("当前到期时间: 2027-01-01 00:00:00");
    expect(payload.message).toContain("续费时长: 3 个月");
    expect(payload.message).toContain("￥19.9");
    expect(payload.message).toContain("释放方式");
    // 多段披露：资源释放方式、文档链接、已知晓
    expect(payload.message).toContain("资源释放方式");
    expect(payload.message).toContain("参考文档");
    expect(payload.message).toContain("我已知晓");
    expect(payload.current_package).toMatchObject({
      packageName: "个人版",
      expireTime: "2027-01-01 00:00:00",
      isAutoRenew: false,
    });
    expect(payload.pricing).toMatchObject({
      realTotalCost: 19.9,
      timeSpan: 3,
      timeUnit: "mon",
    });
    expect(calculatePackageRenewPrice).toHaveBeenCalledWith({
      envId: "env-test",
      period: 3,
    });
  });

  it("renew should succeed with confirm=yes", async () => {
    const renewEnv = vi.fn().mockResolvedValue({
      RequestId: "req-renew",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: { renewEnv },
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (
        await tools.manageEnv.handler({
          action: "renew",
          envId: "env-test",
          duration: 3,
          confirm: "yes",
        })
      ).content[0].text,
    );

    expect(renewEnv).toHaveBeenCalledWith({ EnvId: "env-test", Period: 3 });
    expect(payload).toMatchObject({
      ok: true,
      code: "ENV_RENEWED",
      envId: "env-test",
    });
  });

  it("should return INVALID_ACTION for unknown action", async () => {
    mockGetCloudBaseManager.mockResolvedValue({
      env: {},
    } as any);

    const { tools } = createMockServer();
    const payload = JSON.parse(
      (await tools.manageEnv.handler({ action: "unknown" })).content[0].text,
    );

    expect(payload).toMatchObject({
      ok: false,
      code: "INVALID_ACTION",
    });
  });

  it("create should fail when alias is missing with confirm=yes", async () => {
    const createEnv = vi.fn();
    mockGetCloudBaseManager.mockResolvedValue({
      env: { createEnv },
    } as any);

    const { tools } = createMockServer();
    const result = await tools.manageEnv.handler({
      action: "create",
      packageId: "baas_personal",
      confirm: "yes",
    });

    expect(createEnv).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("alias");
  });
});
