import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolPayloadError } from "./utils/tool-result.js";

const mockCloudBaseCtor = vi.fn();
const mockAuthGetProgressState = vi.fn();
const mockBuildDeviceAuthChallengePayload = vi.fn((info: any) =>
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
);
const mockPeekLoginState = vi.fn();
const mockEnsureLogin = vi.fn();
const mockCommonServiceCall = vi.fn();
const mockListEnvs = vi.fn();

const { mockReadProjectConfig, mockReadProjectEnvId, mockReadCloudbaseRcBinding } = vi.hoisted(() => ({
  mockReadProjectConfig: vi.fn(),
  mockReadProjectEnvId: vi.fn(),
  mockReadCloudbaseRcBinding: vi.fn(),
}));

vi.mock("./utils/project-config.js", () => ({
  readProjectConfig: mockReadProjectConfig,
  readProjectEnvId: mockReadProjectEnvId,
  readCloudbaseRcBinding: mockReadCloudbaseRcBinding,
}));

vi.mock("./auth.js", () => ({
  buildDeviceAuthChallengePayload: mockBuildDeviceAuthChallengePayload,
  getAuthProgressState: mockAuthGetProgressState,
  peekLoginState: mockPeekLoginState,
  getLoginState: mockEnsureLogin,
}));

vi.mock("@cloudbase/manager-node", () => ({
  default: mockCloudBaseCtor.mockImplementation(() => ({
    commonService: vi.fn(() => ({
      call: mockCommonServiceCall,
    })),
    env: {
      listEnvs: mockListEnvs,
    },
  })),
}));

describe("cloudbase manager auth gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.CLOUDBASE_ENV_ID;
    mockReadProjectConfig.mockReturnValue(undefined);
    mockReadProjectEnvId.mockReturnValue(undefined);
    mockReadCloudbaseRcBinding.mockReturnValue(undefined);
    mockAuthGetProgressState.mockResolvedValue({
      status: "IDLE",
      updatedAt: Date.now(),
    });
    mockPeekLoginState.mockResolvedValue(null);
    mockEnsureLogin.mockResolvedValue(null);
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [],
    });
    mockListEnvs.mockResolvedValue({
      EnvList: [],
    });
  });

  it("should fail fast with AUTH_REQUIRED when login is missing", async () => {
    const { getCloudBaseManager } = await import("./cloudbase-manager.js");

    await expect(getCloudBaseManager()).rejects.toMatchObject({
      name: "ToolPayloadError",
      payload: expect.objectContaining({
        code: "AUTH_REQUIRED",
        next_step: expect.objectContaining({
          tool: "auth",
          action: "start_auth",
        }),
      }),
    });
  });

  it("should fail fast with AUTH_PENDING when device auth is in progress", async () => {
    mockAuthGetProgressState.mockResolvedValue({
      status: "PENDING",
      updatedAt: Date.now(),
      authChallenge: {
        user_code: "WDJB-MJHT",
        verification_uri: "https://example.com/device",
        device_code: "device-code",
        expires_in: 600,
      },
    });

    const { getCloudBaseManager } = await import("./cloudbase-manager.js");

    await expect(getCloudBaseManager()).rejects.toMatchObject({
      name: "ToolPayloadError",
      payload: expect.objectContaining({
        code: "AUTH_PENDING",
        auth_challenge: expect.objectContaining({
          user_code: "WDJB-MJHT",
          verification_uri_complete: "https://example.com/device?user_code=WDJB-MJHT",
        }),
        next_step: expect.objectContaining({
          tool: "auth",
          action: "status",
        }),
      }),
    });
  });

  it("should auto-bind single env when login exists but env is missing", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        {
          EnvId: "env-1",
          Alias: "prod",
          Region: "ap-shanghai",
        },
      ],
    });

    const { getCloudBaseManager, getEnvId } = await import("./cloudbase-manager.js");

    await expect(getCloudBaseManager()).resolves.toMatchObject({
      commonService: expect.any(Function),
      env: expect.any(Object),
    });
    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secretId: "sid",
        secretKey: "skey",
        token: "token",
        envId: "env-1",
      }),
    );
    await expect(getEnvId()).resolves.toBe("env-1");
  });

  it("should use fallback region when envId is provided without explicit region", async () => {
    process.env.TCB_REGION = "ap-shanghai";
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });

    const { getCloudBaseManager } = await import("./cloudbase-manager.js");

    await expect(
      getCloudBaseManager({
        cloudBaseOptions: {
          envId: "env-explicit",
        },
      }),
    ).resolves.toMatchObject({
      commonService: expect.any(Function),
      env: expect.any(Object),
    });

    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secretId: "sid",
        secretKey: "skey",
        token: "token",
        envId: "env-explicit",
        region: "ap-shanghai",
      }),
    );
    // Should NOT call DescribeEnvs for region detection (STS compatibility)
    expect(mockCommonServiceCall).not.toHaveBeenCalled();
  });

  it("should honor explicit region without resolving env candidates", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });

    const { getCloudBaseManager } = await import("./cloudbase-manager.js");

    await expect(
      getCloudBaseManager({
        cloudBaseOptions: {
          envId: "env-explicit",
          region: "ap-guangzhou",
        },
      }),
    ).resolves.toMatchObject({
      commonService: expect.any(Function),
      env: expect.any(Object),
    });

    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secretId: "sid",
        secretKey: "skey",
        token: "token",
        envId: "env-explicit",
        region: "ap-guangzhou",
      }),
    );
    expect(mockCommonServiceCall).not.toHaveBeenCalled();
  });

  it("should use fallback region even when login envId is already known", async () => {
    process.env.TCB_REGION = "ap-shanghai";
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
      envId: "env-guangzhou",
    });

    const { getCloudBaseManager } = await import("./cloudbase-manager.js");

    await expect(getCloudBaseManager()).resolves.toMatchObject({
      commonService: expect.any(Function),
      env: expect.any(Object),
    });

    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secretId: "sid",
        secretKey: "skey",
        token: "token",
        envId: "env-guangzhou",
        region: "ap-shanghai",
      }),
    );
  });

  it("should fail fast with ENV_REQUIRED when login exists but multiple envs", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        { EnvId: "env-1", Alias: "prod", Region: "ap-shanghai" },
        { EnvId: "env-2", Alias: "dev", Region: "ap-shanghai" },
      ],
    });

    const { getCloudBaseManager } = await import("./cloudbase-manager.js");

    await expect(getCloudBaseManager()).rejects.toMatchObject({
      name: "ToolPayloadError",
      payload: expect.objectContaining({
        code: "ENV_REQUIRED",
        env_candidates: [
          expect.objectContaining({ envId: "env-1" }),
          expect.objectContaining({ envId: "env-2" }),
        ],
        next_step: expect.objectContaining({
          tool: "auth",
          action: "set_env",
        }),
      }),
    });

    // 终止性引导：message 必须明确「重试无效」并给出无头环境 fallback
    try {
      await getCloudBaseManager();
      expect.unreachable("ENV_REQUIRED should be thrown");
    } catch (error: any) {
      const message = error?.payload?.message ?? "";
      expect(message).toContain("停止原样重试");
      expect(message).toContain('auth(action="set_env", envId=');
      expect(message).toContain("CLOUDBASE_ENV_ID");
    }
  });

  it("requireEnvId=false should exempt env binding and construct manager without envId", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        { EnvId: "env-1", Alias: "prod", Region: "ap-shanghai" },
        { EnvId: "env-2", Alias: "dev", Region: "ap-shanghai" },
      ],
    });

    const { getCloudBaseManager } = await import("./cloudbase-manager.js");

    // 已登录但多环境未绑定：callCloudApi 场景（commonService 不依赖 envId）应放行
    await expect(
      getCloudBaseManager({ requireEnvId: false }),
    ).resolves.toMatchObject({
      commonService: expect.any(Function),
      env: expect.any(Object),
    });
    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secretId: "sid",
        secretKey: "skey",
        token: "token",
        envId: undefined,
      }),
    );
  });

  it("getEnvId should fail fast with ENV_REQUIRED when login exists but multiple envs", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        { EnvId: "env-1", Alias: "prod", Region: "ap-shanghai" },
        { EnvId: "env-2", Alias: "dev", Region: "ap-shanghai" },
      ],
    });

    const { getEnvId } = await import("./cloudbase-manager.js");

    await expect(getEnvId()).rejects.toMatchObject({
      name: "ToolPayloadError",
      payload: expect.objectContaining({
        code: "ENV_REQUIRED",
        env_candidates: [
          expect.objectContaining({ envId: "env-1" }),
          expect.objectContaining({ envId: "env-2" }),
        ],
        next_step: expect.objectContaining({
          tool: "auth",
          action: "set_env",
        }),
      }),
    });
  });

  it("should reuse cached env for partial cloudBaseOptions after interactive selection", async () => {
    const { envManager, getCloudBaseManager } = await import(
      "./cloudbase-manager.js"
    );

    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });

    await envManager.setEnvId("env-picked");

    await expect(
      getCloudBaseManager({
        cloudBaseOptions: {
          region: "ap-shanghai",
        },
      }),
    ).resolves.toMatchObject({
      commonService: expect.any(Function),
      env: expect.any(Object),
    });

    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secretId: "sid",
        secretKey: "skey",
        token: "token",
        envId: "env-picked",
        region: "ap-shanghai",
      }),
    );
  });

  it("should prefer explicit cloudBaseOptions envId over cached env", async () => {
    const { envManager, getCloudBaseManager } = await import(
      "./cloudbase-manager.js"
    );

    await envManager.setEnvId("env-cached");

    await expect(
      getCloudBaseManager({
        cloudBaseOptions: {
          secretId: "explicit-sid",
          secretKey: "explicit-skey",
          envId: "env-explicit",
          region: "ap-shanghai",
        },
      }),
    ).resolves.toMatchObject({
      commonService: expect.any(Function),
      env: expect.any(Object),
    });

    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secretId: "explicit-sid",
        secretKey: "explicit-skey",
        envId: "env-explicit",
        region: "ap-shanghai",
      }),
    );
  });

  it("should auto-bind single env for explicit credentials", async () => {
    const { getCloudBaseManager } = await import("./cloudbase-manager.js");

    mockCommonServiceCall.mockResolvedValue({
      EnvList: [{ EnvId: "env-explicit-only", Alias: "prod", Region: "ap-shanghai" }],
    });

    await expect(
      getCloudBaseManager({
        cloudBaseOptions: {
          secretId: "explicit-sid",
          secretKey: "explicit-skey",
          region: "ap-shanghai",
        },
      }),
    ).resolves.toMatchObject({
      commonService: expect.any(Function),
      env: expect.any(Object),
    });

    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secretId: "explicit-sid",
        secretKey: "explicit-skey",
        envId: "env-explicit-only",
        region: "ap-shanghai",
      }),
    );
  });

  it("should not reuse cached env for explicit credentials with multiple envs", async () => {
    const { envManager, getCloudBaseManager } = await import(
      "./cloudbase-manager.js"
    );

    await envManager.setEnvId("env-cached");
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        { EnvId: "env-1", Alias: "prod", Region: "ap-shanghai" },
        { EnvId: "env-2", Alias: "dev", Region: "ap-shanghai" },
      ],
    });

    await expect(
      getCloudBaseManager({
        cloudBaseOptions: {
          secretId: "explicit-sid",
          secretKey: "explicit-skey",
          region: "ap-shanghai",
        },
      }),
    ).rejects.toMatchObject({
      name: "ToolPayloadError",
      payload: expect.objectContaining({
        code: "ENV_REQUIRED",
        env_candidates: [
          expect.objectContaining({ envId: "env-1" }),
          expect.objectContaining({ envId: "env-2" }),
        ],
      }),
    });
  });

  it("should let env-required tools reuse selected env after device auth flow completes", async () => {
    const { envManager, getCloudBaseManager, getEnvId } = await import(
      "./cloudbase-manager.js"
    );

    await expect(getCloudBaseManager()).rejects.toMatchObject({
      name: "ToolPayloadError",
      payload: expect.objectContaining({
        code: "AUTH_REQUIRED",
      }),
    });

    mockAuthGetProgressState.mockResolvedValue({
      status: "PENDING",
      updatedAt: Date.now(),
      authChallenge: {
        user_code: "WDJB-MJHT",
        verification_uri: "https://example.com/device",
        device_code: "device-code",
        expires_in: 600,
      },
    });

    await expect(getCloudBaseManager()).rejects.toMatchObject({
      name: "ToolPayloadError",
      payload: expect.objectContaining({
        code: "AUTH_PENDING",
      }),
    });

    mockAuthGetProgressState.mockResolvedValue({
      status: "READY",
      updatedAt: Date.now(),
    });
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        {
          EnvId: "env-picked",
          Alias: "picked",
          Region: "ap-shanghai",
        },
      ],
    });

    // Single env: getCloudBaseManager auto-binds, no ENV_REQUIRED
    await expect(getCloudBaseManager()).resolves.toMatchObject({
      commonService: expect.any(Function),
      env: expect.any(Object),
    });
    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secretId: "sid",
        secretKey: "skey",
        token: "token",
        envId: "env-picked",
      }),
    );
    await expect(getEnvId()).resolves.toBe("env-picked");
  });
});

describe("listAvailableEnvCandidates region scope", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.CLOUDBASE_ENV_ID;
    mockReadProjectConfig.mockReturnValue(undefined);
    mockReadProjectEnvId.mockReturnValue(undefined);
    mockReadCloudbaseRcBinding.mockReturnValue(undefined);
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        { EnvId: "env-sg", Alias: "sg", Region: "ap-singapore", Status: "NORMAL" },
      ],
    });
  });

  it("should pass region override into CloudBase manager", async () => {
    const { listAvailableEnvCandidates } = await import("./cloudbase-manager.js");
    const result = await listAvailableEnvCandidates({
      ignorePinnedEnvId: true,
      region: "ap-singapore",
    });

    expect(mockCloudBaseCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        region: "ap-singapore",
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        envId: "env-sg",
        region: "ap-singapore",
      }),
    ]);
  });

  it("should ignore pinned CLOUDBASE_ENV_ID when requested", async () => {
    process.env.CLOUDBASE_ENV_ID = "env-pinned";
    const { listAvailableEnvCandidates } = await import("./cloudbase-manager.js");
    const result = await listAvailableEnvCandidates({
      ignorePinnedEnvId: true,
      region: "ap-singapore",
    });
    expect(result.map((item) => item.envId)).toEqual(["env-sg"]);
  });
});

// 覆盖 .cloudbase/project.json 的 envId 绑定：新起的 MCP 进程 / 每个 Git worktree
// 都只能靠这个仓库内文件恢复绑定（进程内存缓存必然是空的）。
describe("project-pinned envId (.cloudbase/project.json)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.CLOUDBASE_ENV_ID;
    delete process.env.TCB_REGION;
    delete process.env.TCB_SITE;
    mockReadProjectConfig.mockReturnValue(undefined);
    mockReadProjectEnvId.mockReturnValue(undefined);
    mockReadCloudbaseRcBinding.mockReturnValue(undefined);
    mockAuthGetProgressState.mockResolvedValue({
      status: "IDLE",
      updatedAt: Date.now(),
    });
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });
    // 账号可访问多个环境：这是修复前每个 worktree 都被要求重新 set_env 的场景
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        { EnvId: "env-project-a", Alias: "a", Region: "ap-singapore" },
        { EnvId: "env-project-b", Alias: "b", Region: "ap-singapore" },
      ],
    });
  });

  afterEach(() => {
    mockReadProjectEnvId.mockReturnValue(undefined);
    mockReadCloudbaseRcBinding.mockReturnValue(undefined);
    delete process.env.CLOUDBASE_ENV_ID;
  });

  it("should pin project envId in a fresh process without asking for set_env", async () => {
    mockReadProjectEnvId.mockReturnValue("env-project-a");

    const { getCloudBaseManager, getEnvId } = await import("./cloudbase-manager.js");

    await expect(getEnvId()).resolves.toBe("env-project-a");
    await expect(getCloudBaseManager()).resolves.toMatchObject({
      commonService: expect.any(Function),
    });
    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({ envId: "env-project-a" }),
    );
  });

  it("should keep repositories isolated: each project file pins its own env", async () => {
    mockReadProjectEnvId.mockReturnValue("env-project-b");

    const { getEnvId } = await import("./cloudbase-manager.js");

    await expect(getEnvId()).resolves.toBe("env-project-b");
  });

  it("should prefer project envId over account-level loginState envId", async () => {
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
      envId: "env-project-a",
    });
    mockReadProjectEnvId.mockReturnValue("env-project-b");

    const { getCloudBaseManager } = await import("./cloudbase-manager.js");

    await expect(getCloudBaseManager()).resolves.toMatchObject({
      commonService: expect.any(Function),
    });
    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({ envId: "env-project-b" }),
    );
  });

  it("should prefer CLOUDBASE_ENV_ID over project envId", async () => {
    process.env.CLOUDBASE_ENV_ID = "env-from-host";
    mockReadProjectEnvId.mockReturnValue("env-project-a");

    const { getEnvId } = await import("./cloudbase-manager.js");

    await expect(getEnvId()).resolves.toBe("env-from-host");
  });

  it("should prefer explicit envId and runtime set_env over project envId", async () => {
    mockReadProjectEnvId.mockReturnValue("env-project-a");

    const { envManager, getEnvId } = await import("./cloudbase-manager.js");

    await expect(getEnvId({ envId: "env-explicit" })).resolves.toBe("env-explicit");

    await envManager.setEnvId("env-switched");
    await expect(getEnvId()).resolves.toBe("env-switched");
  });

  it("should still surface ENV_REQUIRED when project file has no envId", async () => {
    const { getEnvId } = await import("./cloudbase-manager.js");

    await expect(getEnvId()).rejects.toMatchObject({
      name: "ToolPayloadError",
      payload: expect.objectContaining({ code: "ENV_REQUIRED" }),
    });
  });
});
