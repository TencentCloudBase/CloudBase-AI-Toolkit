import { beforeEach, describe, expect, it, vi } from "vitest";
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
