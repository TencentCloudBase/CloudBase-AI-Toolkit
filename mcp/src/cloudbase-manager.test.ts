import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolPayloadError } from "./utils/tool-result.js";

const mockCloudBaseCtor = vi.fn();
const mockAuthGetProgressState = vi.fn();
const mockPeekLoginState = vi.fn();
const mockEnsureLogin = vi.fn();
const mockCommonServiceCall = vi.fn();
const mockListEnvs = vi.fn();

vi.mock("./auth.js", () => ({
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

  it("should resolve actual env region when envId is provided without region", async () => {
    process.env.TCB_REGION = "ap-shanghai";
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
    });
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        {
          EnvId: "env-explicit",
          Alias: "prod",
          Region: "ap-guangzhou",
        },
      ],
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
        region: "ap-guangzhou",
      }),
    );
    expect(mockCommonServiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "DescribeEnvs",
      }),
    );
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

  it("should prefer actual env region over fallback region when login envId is already known", async () => {
    process.env.TCB_REGION = "ap-shanghai";
    mockPeekLoginState.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
      envId: "env-guangzhou",
    });
    mockCommonServiceCall.mockResolvedValue({
      EnvList: [
        {
          EnvId: "env-guangzhou",
          Alias: "prod",
          Region: "ap-guangzhou",
        },
      ],
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
        region: "ap-guangzhou",
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

describe("resolveNoSqlInstanceId", () => {
  const {
    mockGetCloudBaseManager: mgrMock,
    mockGetEnvInfo,
    mockCommonServiceCall: csMock,
  } = vi.hoisted(() => ({
    mockGetCloudBaseManager: vi.fn(),
    mockGetEnvInfo: vi.fn(),
    mockCommonServiceCall: vi.fn(),
  }));

  let getDatabaseInstanceId: typeof import("./cloudbase-manager.js")["getDatabaseInstanceId"];
  let resetDatabaseInstanceIdCache: typeof import("./cloudbase-manager.js")["resetDatabaseInstanceIdCache"];

  vi.mock("./auth.js", () => ({
    getAuthProgressState: vi.fn().mockResolvedValue({ status: "IDLE", updatedAt: Date.now() }),
    peekLoginState: vi.fn().mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
      envId: "env-test",
    }),
    getLoginState: vi.fn().mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
      token: "token",
      envId: "env-test",
    }),
  }));

  vi.mock("@cloudbase/manager-node", () => ({
    default: vi.fn().mockImplementation(() => ({
      commonService: vi.fn(() => ({ call: csMock })),
      env: { getEnvInfo: mockGetEnvInfo, listEnvs: vi.fn().mockResolvedValue({ EnvList: [] }) },
    })),
  }));

  vi.mock("./cloudbase-manager.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./cloudbase-manager.js")>();
    return {
      ...actual,
      getCloudBaseManager: mgrMock,
    };
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./cloudbase-manager.js");
    getDatabaseInstanceId = mod.getDatabaseInstanceId;
    resetDatabaseInstanceIdCache = mod.resetDatabaseInstanceIdCache;
    resetDatabaseInstanceIdCache();

    mgrMock.mockResolvedValue({
      env: { getEnvInfo: mockGetEnvInfo },
      commonService: vi.fn(() => ({ call: csMock })),
    });
  });

  it("should return the single NoSQL instance when Databases has one entry", async () => {
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Databases: [{ InstanceId: "tnt-nl7hjzasw" }],
      },
    });

    const result = await getDatabaseInstanceId();
    expect(result.instanceId).toBe("tnt-nl7hjzasw");
    expect(result.source).toBe("envInfo");
  });

  it("should pick the NoSQL instance over MySQL when Databases has multiple entries", async () => {
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Databases: [
          { InstanceId: "default", DbInstanceType: "MYSQL", Status: "ONLINE" },
          { InstanceId: "tnt-abc123" },
        ],
      },
    });

    const result = await getDatabaseInstanceId();
    expect(result.instanceId).toBe("tnt-abc123");
  });

  it("should skip MySQL entries identified by DbInstanceType", async () => {
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Databases: [
          { InstanceId: "tnt-mysql-instance", DbInstanceType: "MYSQL" },
          { InstanceId: "tnt-nosql-instance" },
        ],
      },
    });

    const result = await getDatabaseInstanceId();
    expect(result.instanceId).toBe("tnt-nosql-instance");
  });

  it("should fallback to first entry with InstanceId when all are MySQL", async () => {
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Databases: [
          { InstanceId: "default", DbInstanceType: "MYSQL" },
          { InstanceId: "another-mysql", DbInstanceType: "MYSQL" },
        ],
      },
    });

    const result = await getDatabaseInstanceId();
    expect(result.instanceId).toBe("default");
  });

  it("should throw when Databases array is empty", async () => {
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Databases: [],
      },
    });

    await expect(getDatabaseInstanceId()).rejects.toThrow("无法获取数据库实例ID");
  });

  it("should throw when Databases is undefined", async () => {
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {},
    });

    await expect(getDatabaseInstanceId()).rejects.toThrow("无法获取数据库实例ID");
  });
});
