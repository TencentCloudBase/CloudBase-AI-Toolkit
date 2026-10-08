import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthGetLoginState,
  mockAuthLoginByWebAuth,
  mockAuthLoginByApiKey,
  mockAuthLogout,
  mockAuthStore,
  authStoreData,
  cliConfigDir,
  mockCheckAndGetCredential,
  projectAuthDir,
} = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: joinPath } = require("node:path") as typeof import("node:path");
  return {
    mockAuthGetLoginState: vi.fn(),
    mockAuthLoginByWebAuth: vi.fn(),
    mockAuthLoginByApiKey: vi.fn(),
    mockAuthLogout: vi.fn(),
    authStoreData: {} as Record<string, any>,
    cliConfigDir: joinPath(tmpdir(), `cb-mcp-auth-flat-${process.pid}`),
    mockCheckAndGetCredential: vi.fn(),
    // 项目级凭据目录：默认不存在 ⇒ 探测一律落空、回落到全局登录态
    projectAuthDir: joinPath(tmpdir(), `cb-mcp-auth-project-${process.pid}`),
    mockAuthStore: {
      get: vi.fn(async (key: string) => authStoreData[key]),
      set: vi.fn(async (key: string, value: any) => {
        authStoreData[key] = value;
      }),
      delete: vi.fn(async (key: string) => {
        delete authStoreData[key];
      }),
    },
  };
});

vi.mock("@cloudbase/toolbox", () => ({
  AuthSupervisor: {
    getInstance: vi.fn(() => ({
      getLoginState: mockAuthGetLoginState,
      loginByWebAuth: mockAuthLoginByWebAuth,
      loginByApiKey: mockAuthLoginByApiKey,
      logout: mockAuthLogout,
    })),
  },
  authStore: mockAuthStore,
  cloudbaseConfigDir: cliConfigDir,
  resolveCredential: (data: any) => data,
  refreshTmpToken: vi.fn(),
  checkAndGetCredential: mockCheckAndGetCredential,
  getProjectDir: vi.fn(() => projectAuthDir),
}));

vi.mock("./utils/logger.js", () => ({
  debug: vi.fn(),
}));

vi.mock("./utils/site-map.js", () => {
  const normalizeSite = (v: unknown) =>
    v === "intl" ? "intl" : v === "domestic" ? "domestic" : undefined;
  const getSite = (region?: string, site?: string) => {
    const normalized = normalizeSite(site);
    if (normalized) {
      return normalized;
    }
    if (region === "ap-singapore") {
      return "ambiguous" as const;
    }
    return "domestic" as const;
  };
  return {
    normalizeSite,
    getSite,
    resolveSite: (region?: string, site?: string) => {
      const result = getSite(region, site);
      return result === "ambiguous" ? "intl" : result;
    },
    // 行为等价简化版：仅显式 intl 站点返回 ap-singapore，其余回落默认网关
    resolveApiKeyExchangeRegion: (opts?: { site?: string; region?: string }) => {
      const site = normalizeSite(opts?.site) ?? normalizeSite(process.env.TCB_SITE);
      return site === "intl" ? "ap-singapore" : undefined;
    },
    resolveSiteAndRegion: (opts?: { site?: string; region?: string }) => {
      const site = normalizeSite(opts?.site) ?? normalizeSite(process.env.TCB_SITE) ?? "domestic";
      return { site, region: opts?.region ?? "ap-shanghai" };
    },
    SITE_REGION_MAP: {
      domestic: {
        authHost: "tcb.cloud.tencent.com",
        oauthEndpoint: "https://tcb-api.cloud.tencent.com/qcloud-tcb/v1/oauth",
      },
      intl: {
        authHost: "tcb.tencentcloud.com",
        oauthEndpoint: "https://tcb-api.tencentcloud.com/qcloud-tcb/v1/oauth",
      },
    },
  };
});

vi.mock("./utils/tencent-cloud.js", () => ({
  isInternationalRegion: vi.fn(() => false),
}));

beforeEach(() => {
  Object.keys(authStoreData).forEach((key) => delete authStoreData[key]);
  mkdirSync(cliConfigDir, { recursive: true });
  rmSync(join(cliConfigDir, "config.json"), { force: true });
  rmSync(projectAuthDir, { recursive: true, force: true });
  vi.clearAllMocks();
  mockAuthGetLoginState.mockResolvedValue(null);
  mockCheckAndGetCredential.mockResolvedValue(null);
  mockAuthLoginByWebAuth.mockResolvedValue({
    secretId: "sid",
    secretKey: "skey",
  });
});

describe("auth config resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.TCB_AUTH_MODE;
    delete process.env.TCB_AUTH_CLIENT_ID;
    delete process.env.TCB_AUTH_OAUTH_ENDPOINT;
    delete process.env.TCB_AUTH_OAUTH_CUSTOM;
    delete process.env.TENCENTCLOUD_SECRETID;
    delete process.env.TENCENTCLOUD_SECRETKEY;
    delete process.env.TENCENTCLOUD_SESSIONTOKEN;
    delete process.env.CLOUDBASE_ENV_ID;
    delete process.env.CLOUDBASE_API_KEY;
    delete process.env.CLOUDBASE_APIKEY;
    mockAuthGetLoginState.mockResolvedValue(null);
    mockAuthLoginByWebAuth.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockAuthLoginByApiKey.mockResolvedValue({
      secretId: "api-sid",
      secretKey: "api-skey",
      envId: "env-from-api-key",
    });
    mockAuthLogout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.TCB_AUTH_MODE;
    delete process.env.TCB_AUTH_CLIENT_ID;
    delete process.env.TCB_AUTH_OAUTH_ENDPOINT;
    delete process.env.TCB_AUTH_OAUTH_CUSTOM;
    delete process.env.CLOUDBASE_API_KEY;
    delete process.env.CLOUDBASE_APIKEY;
    delete process.env.CLOUDBASE_ENV_ID;
  });

  it("should use toolbox defaults when no auth overrides are configured", async () => {
    const { resolveAuthOptions } = await import("./auth.js");

    expect(resolveAuthOptions()).toMatchObject({
      authMode: "device",
      clientId: undefined,
      oauthEndpoint: undefined,
      oauthCustom: false,
      usesToolboxDefaults: true,
    });
  });

  it("should resolve auth overrides from env, server, and tool with correct precedence", async () => {
    process.env.TCB_AUTH_MODE = "device";
    process.env.TCB_AUTH_CLIENT_ID = "env-client";
    process.env.TCB_AUTH_OAUTH_ENDPOINT = "https://env.example.com/oauth";
    process.env.TCB_AUTH_OAUTH_CUSTOM = "true";

    const { resolveAuthOptions } = await import("./auth.js");

    expect(
      resolveAuthOptions({
        serverAuthOptions: {
          clientId: "server-client",
          oauthEndpoint: "https://server.example.com/oauth",
        },
        clientId: "tool-client",
      }),
    ).toMatchObject({
      authMode: "device",
      clientId: "tool-client",
      oauthEndpoint: "https://server.example.com/oauth",
      oauthCustom: true,
      usesToolboxDefaults: false,
    });
  });

  it("should default oauthCustom to true when oauthEndpoint is configured", async () => {
    const { resolveAuthOptions } = await import("./auth.js");

    expect(
      resolveAuthOptions({
        oauthEndpoint: "https://custom.example.com/oauth",
      }),
    ).toMatchObject({
      oauthEndpoint: "https://custom.example.com/oauth",
      oauthCustom: true,
    });
  });

  it("should validate oauthCustom requires endpoint", async () => {
    const { getAuthConfigValidationError } = await import("./auth.js");

    expect(
      getAuthConfigValidationError({
        authMode: "device",
        oauthCustom: true,
        usesToolboxDefaults: false,
      }),
    ).toContain("oauthCustom=true");
  });

  it("should allow oauthEndpoint when oauthCustom is explicitly false (standard wrapped endpoint)", async () => {
    const { getAuthConfigValidationError } = await import("./auth.js");

    expect(
      getAuthConfigValidationError({
        authMode: "device",
        oauthEndpoint: "https://tcb-api.tencentcloud.com/qcloud-tcb/v1/oauth",
        oauthCustom: false,
        usesToolboxDefaults: false,
      }),
    ).toBeNull();
  });

  it("buildDeviceLoginOptions should apply intl endpoint override and auth URL rewrite", async () => {
    const { buildDeviceLoginOptions } = await import("./auth.js");

    const loginOptions = buildDeviceLoginOptions(
      {
        authMode: "device",
        oauthCustom: false,
        usesToolboxDefaults: true,
      },
      { site: "intl" },
    );

    expect(loginOptions.flow).toBe("device");
    expect((loginOptions.getOAuthEndpoint as (h: string) => string)("ignored")).toBe(
      "https://tcb-api.tencentcloud.com/qcloud-tcb/v1/oauth",
    );
    const rewritten = (loginOptions.getAuthUrl as (u: string) => string)(
      "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device",
    );
    expect(rewritten).toBe(
      "https://tcb.tencentcloud.com/dev#/cli-auth?from=cli&flow=device",
    );
    expect(loginOptions.custom).toBeUndefined();
  });

  it("buildDeviceLoginOptions should prefer explicit oauthEndpoint over intl override", async () => {
    const { buildDeviceLoginOptions } = await import("./auth.js");

    const loginOptions = buildDeviceLoginOptions(
      {
        authMode: "device",
        oauthEndpoint: "https://custom.example.com/oauth",
        oauthCustom: true,
        usesToolboxDefaults: false,
      },
      { site: "intl" },
    );

    expect((loginOptions.getOAuthEndpoint as (h: string) => string)("ignored")).toBe(
      "https://custom.example.com/oauth",
    );
    expect(loginOptions.custom).toBe(true);
  });

  it("buildDeviceLoginOptions should not rewrite anything for domestic site", async () => {
    const { buildDeviceLoginOptions } = await import("./auth.js");

    const loginOptions = buildDeviceLoginOptions(
      {
        authMode: "device",
        oauthCustom: false,
        usesToolboxDefaults: true,
      },
      { site: "domestic" },
    );

    expect(loginOptions.getOAuthEndpoint).toBeUndefined();
    expect(loginOptions.getAuthUrl).toBeUndefined();
  });

  it("should reject device-only overrides when authMode is web", async () => {
    const { ensureLogin } = await import("./auth.js");

    await expect(
      ensureLogin({
        authMode: "web",
        oauthEndpoint: "https://custom.example.com/oauth",
      }),
    ).rejects.toThrow("authMode=device");
  });

  it("should pass resolved device auth options to toolbox login", async () => {
    mockAuthGetLoginState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        secretId: "sid",
        secretKey: "skey",
      });

    const { ensureLogin } = await import("./auth.js");

    await ensureLogin({
      clientId: "tool-client",
      oauthEndpoint: "https://custom.example.com/oauth",
      oauthCustom: true,
    });

    expect(mockAuthLoginByWebAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "device",
        client_id: "tool-client",
        custom: true,
        getOAuthEndpoint: expect.any(Function),
      }),
    );

    const loginOptions = mockAuthLoginByWebAuth.mock.calls.at(-1)![0];
    expect(loginOptions.getOAuthEndpoint("ignored")).toBe(
      "https://custom.example.com/oauth",
    );
  });
});

describe("CloudBase API Key env resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.CLOUDBASE_API_KEY;
    delete process.env.CLOUDBASE_APIKEY;
    delete process.env.CLOUDBASE_ENV_ID;
    delete process.env.TENCENTCLOUD_SECRETID;
    delete process.env.TENCENTCLOUD_SECRETKEY;
    mockAuthGetLoginState.mockResolvedValue(null);
    mockAuthLoginByApiKey.mockResolvedValue({
      secretId: "api-sid",
      secretKey: "api-skey",
      envId: "env-test",
    });
  });

  afterEach(() => {
    delete process.env.CLOUDBASE_API_KEY;
    delete process.env.CLOUDBASE_APIKEY;
    delete process.env.CLOUDBASE_ENV_ID;
  });

  it("should prefer CLOUDBASE_API_KEY over CLOUDBASE_APIKEY", async () => {
    process.env.CLOUDBASE_API_KEY = "primary-key";
    process.env.CLOUDBASE_APIKEY = "fallback-key";

    const { getCloudBaseApiKeyFromEnv } = await import("./auth.js");

    expect(getCloudBaseApiKeyFromEnv()).toBe("primary-key");
  });

  it("should fall back to CLOUDBASE_APIKEY when CLOUDBASE_API_KEY is unset", async () => {
    process.env.CLOUDBASE_APIKEY = "fallback-key";

    const { getCloudBaseApiKeyFromEnv } = await import("./auth.js");

    expect(getCloudBaseApiKeyFromEnv()).toBe("fallback-key");
  });

  it("peekLoginState should use CLOUDBASE_APIKEY fallback for API Key mode", async () => {
    process.env.CLOUDBASE_APIKEY = "compat-api-key";
    process.env.CLOUDBASE_ENV_ID = "env-test";

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(mockAuthLoginByApiKey).toHaveBeenCalledWith(
      "compat-api-key",
      "env-test",
      expect.objectContaining({ cwd: expect.any(String) }),
    );
    expect(loginState).toMatchObject({
      secretId: "api-sid",
      secretKey: "api-skey",
      envId: "env-test",
    });
  });

  it("peekLoginState should prefer CLOUDBASE_API_KEY when both are set", async () => {
    process.env.CLOUDBASE_API_KEY = "primary-key";
    process.env.CLOUDBASE_APIKEY = "fallback-key";
    process.env.CLOUDBASE_ENV_ID = "env-test";

    const { peekLoginState } = await import("./auth.js");
    await peekLoginState();

    expect(mockAuthLoginByApiKey).toHaveBeenCalledWith(
      "primary-key",
      "env-test",
      expect.objectContaining({ cwd: expect.any(String) }),
    );
  });

  it("peekLoginState should pass ap-singapore region when TCB_SITE=intl", async () => {
    process.env.CLOUDBASE_API_KEY = "intl-key";
    process.env.CLOUDBASE_ENV_ID = "env-intl";
    process.env.TCB_SITE = "intl";

    const { peekLoginState } = await import("./auth.js");
    await peekLoginState();

    expect(mockAuthLoginByApiKey).toHaveBeenCalledWith(
      "intl-key",
      "env-intl",
      expect.objectContaining({ cwd: expect.any(String), region: "ap-singapore" }),
    );
  });

  it("peekLoginState should pass through TENCENTCLOUD_SECRETID/SECRETKEY directly under TCB_SITE=intl", async () => {
    // 国际站腾讯云密钥直登：密钥凭据与站点无关，原样透传，不触发 API Key 换取或 device flow
    process.env.TENCENTCLOUD_SECRETID = "intl-secret-id";
    process.env.TENCENTCLOUD_SECRETKEY = "intl-secret-key";
    process.env.CLOUDBASE_ENV_ID = "soroli-i2gzw04ic6518ac3a";
    process.env.TCB_SITE = "intl";

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(mockAuthLoginByApiKey).not.toHaveBeenCalled();
    expect(mockAuthLoginByWebAuth).not.toHaveBeenCalled();
    expect(loginState).toMatchObject({
      secretId: "intl-secret-id",
      secretKey: "intl-secret-key",
      envId: "soroli-i2gzw04ic6518ac3a",
    });
  });

  it("peekLoginState should not pass region for domestic default gateway", async () => {
    process.env.CLOUDBASE_API_KEY = "cn-key";
    process.env.CLOUDBASE_ENV_ID = "env-cn";
    delete process.env.TCB_SITE;
    delete process.env.TCB_REGION;

    const { peekLoginState } = await import("./auth.js");
    await peekLoginState();

    const opts = mockAuthLoginByApiKey.mock.calls.at(-1)?.[2];
    expect(opts).toEqual(expect.objectContaining({ cwd: expect.any(String) }));
    expect(opts?.region).toBeUndefined();
  });
});

describe("device auth challenge helpers", () => {
  it("should append user_code to standard verification_uri", async () => {
    const { buildVerificationUriComplete } = await import("./auth.js");

    expect(
      buildVerificationUriComplete({
        user_code: "WDJB-MJHT",
        verification_uri: "https://example.com/device",
      }),
    ).toBe("https://example.com/device?user_code=WDJB-MJHT");
  });

  it("should append user_code inside hash route query", async () => {
    const { buildVerificationUriComplete } = await import("./auth.js");

    expect(
      buildVerificationUriComplete({
        user_code: "48NK-MSUK",
        verification_uri:
          "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device",
      }),
    ).toBe(
      "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device&user_code=48NK-MSUK",
    );
  });

  it("should prefer explicit verification_uri_complete without modification", async () => {
    const { buildVerificationUriComplete } = await import("./auth.js");

    expect(
      buildVerificationUriComplete({
        user_code: "48NK-MSUK",
        verification_uri:
          "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device",
        verification_uri_complete:
          "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device&user_code=48NK-MSUK",
      }),
    ).toBe(
      "https://tcb.cloud.tencent.com/dev#/cli-auth?from=cli&flow=device&user_code=48NK-MSUK",
    );
  });

  it("should build challenge payload with complete URL", async () => {
    const { buildDeviceAuthChallengePayload } = await import("./auth.js");

    expect(
      buildDeviceAuthChallengePayload({
        user_code: "WDJB-MJHT",
        verification_uri: "https://example.com/device",
        device_code: "device-code",
        expires_in: 600,
      }),
    ).toEqual({
      user_code: "WDJB-MJHT",
      verification_uri: "https://example.com/device",
      verification_uri_complete: "https://example.com/device?user_code=WDJB-MJHT",
      expires_in: 600,
    });
  });
});

describe("flat credential storage", () => {
  it("should read the same flat credential for an explicit intl site", async () => {
    authStoreData.credential = {
      secretId: "flat-sid",
      secretKey: "flat-skey",
      refreshToken: "rt",
    };

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState({ site: "intl" });

    expect(loginState).toMatchObject({
      secretId: "flat-sid",
      secretKey: "flat-skey",
    });
    expect(authStoreData.credential).not.toHaveProperty("domestic");
    expect(authStoreData.credential).not.toHaveProperty("intl");
  });

  it("should read a flat credential when no site is requested", async () => {
    authStoreData.credential = {
      secretId: "legacy-sid",
      secretKey: "legacy-skey",
    };

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(loginState).toMatchObject({
      secretId: "legacy-sid",
      secretKey: "legacy-skey",
    });
  });

  it("should keep uin when refreshing an expired temp credential", async () => {
    authStoreData.credential = {
      secretId: "old-sid",
      secretKey: "old-skey",
      refreshToken: "rt",
      uin: 123811017,
      accessTokenExpired: Date.now() - 60_000,
      expired: Date.now() + 10 * 60_000,
    };
    const toolbox = await import("@cloudbase/toolbox");
    vi.mocked(toolbox.refreshTmpToken).mockResolvedValueOnce({
      secretId: "new-sid",
      secretKey: "new-skey",
      accessTokenExpired: Date.now() + 60 * 60_000,
    } as any);

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(loginState?.secretId).toBe("new-sid");
    expect(loginState?.uin).toBe(123811017);
    expect(authStoreData.credential).toMatchObject({
      secretId: "new-sid",
      uin: 123811017,
    });
    expect(authStoreData.credential).not.toHaveProperty("domestic");
  });

  it("should return the flat credential for an ambiguous region", async () => {
    authStoreData.credential = {
      secretId: "flat-sid",
      secretKey: "flat-skey",
    };

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState({ region: "ap-singapore" });

    expect(loginState).toMatchObject({
      secretId: "flat-sid",
      secretKey: "flat-skey",
    });
  });

  it("should keep the flat credential when site is explicit", async () => {
    authStoreData.credential = {
      secretId: "flat-sid",
      secretKey: "flat-skey",
    };

    const { peekLoginState } = await import("./auth.js");
    await expect(
      peekLoginState({ region: "ap-singapore", site: "intl" }),
    ).resolves.toMatchObject({ secretId: "flat-sid" });
  });

  it("should collapse a slotted credential to the domestic slot by default", async () => {
    authStoreData.credential = {
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
      intl: { secretId: "intl-sid", secretKey: "intl-skey" },
    };

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(loginState).toMatchObject({ secretId: "dom-sid", secretKey: "dom-skey" });
    expect(authStoreData.credential).toEqual({
      secretId: "dom-sid",
      secretKey: "dom-skey",
    });
  });

  it("should collapse a slotted credential to the site selected by TCB_SITE", async () => {
    process.env.TCB_SITE = "intl";
    try {
      authStoreData.credential = {
        domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
        intl: { secretId: "intl-sid", secretKey: "intl-skey" },
      };

      const { peekLoginState } = await import("./auth.js");
      const loginState = await peekLoginState();

      expect(loginState).toMatchObject({ secretId: "intl-sid", secretKey: "intl-skey" });
      expect(authStoreData.credential).toEqual({
        secretId: "intl-sid",
        secretKey: "intl-skey",
      });
    } finally {
      delete process.env.TCB_SITE;
    }
  });

  it("should prefer the intl slot when config.json isIntl is true", async () => {
    writeFileSync(join(cliConfigDir, "config.json"), JSON.stringify({ isIntl: true, lang: "zh" }));
    process.env.TCB_SITE = "domestic";
    try {
      authStoreData.credential = {
        domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
        intl: { secretId: "intl-sid", secretKey: "intl-skey" },
      };

      const { peekLoginState } = await import("./auth.js");
      const loginState = await peekLoginState();

      expect(loginState).toMatchObject({ secretId: "intl-sid" });
      expect(authStoreData.credential).toEqual({
        secretId: "intl-sid",
        secretKey: "intl-skey",
      });
    } finally {
      delete process.env.TCB_SITE;
    }
  });

  it("should keep the only usable slot when the preferred slot is empty", async () => {
    authStoreData.credential = {
      domestic: {},
      intl: { secretId: "intl-sid", secretKey: "intl-skey" },
    };

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(loginState).toMatchObject({ secretId: "intl-sid", secretKey: "intl-skey" });
    expect(authStoreData.credential).toEqual({
      secretId: "intl-sid",
      secretKey: "intl-skey",
    });
  });

  it("should leave the toolbox flat credential in place after login", async () => {
    mockAuthLoginByWebAuth.mockImplementation(async () => {
      authStoreData.credential = {
        tmpSecretId: "new-intl-sid",
        tmpSecretKey: "new-intl-skey",
        refreshToken: "rt",
      };
      return {
        secretId: "new-intl-sid",
        secretKey: "new-intl-skey",
        refreshToken: "rt",
      };
    });

    const { ensureLogin } = await import("./auth.js");
    await ensureLogin({ site: "intl" });

    expect(authStoreData.credential).toEqual({
      tmpSecretId: "new-intl-sid",
      tmpSecretKey: "new-intl-skey",
      refreshToken: "rt",
    });
    const { resolveCredential } = await import("@cloudbase/toolbox");
    expect(resolveCredential(authStoreData.credential)).toMatchObject({
      tmpSecretId: "new-intl-sid",
      tmpSecretKey: "new-intl-skey",
    });
  });

  it("resolveDeviceLoginSite should prefer explicit site over TCB_SITE and region", async () => {
    const { resolveDeviceLoginSite } = await import("./auth.js");

    process.env.TCB_SITE = "intl";
    try {
      // 显式 site 优先
      expect(
        resolveDeviceLoginSite({ site: "domestic", region: "ap-singapore" }),
      ).toBe("domestic");
      // 无显式 site 时回落 TCB_SITE
      expect(resolveDeviceLoginSite({ region: "ap-shanghai" })).toBe("intl");
    } finally {
      delete process.env.TCB_SITE;
    }
    // 均未提供时按 region 映射（ap-singapore 歧义默认 intl），缺省 domestic
    expect(resolveDeviceLoginSite({ region: "ap-singapore" })).toBe("intl");
    expect(resolveDeviceLoginSite({ region: "ap-shanghai" })).toBe("domestic");
    expect(resolveDeviceLoginSite()).toBe("domestic");
  });

  it("should log out the single credential instead of deleting one slot", async () => {
    authStoreData.credential = {
      secretId: "flat-sid",
      secretKey: "flat-skey",
      refreshToken: "rt",
    };

    const { logout } = await import("./auth.js");
    await logout({ site: "intl" });

    expect(mockAuthLogout).toHaveBeenCalledWith({ cwd: expect.any(String) });
    expect(mockAuthStore.set).not.toHaveBeenCalled();
  });

  it("should keep domestic auth host for domestic site with ap-singapore region", async () => {
    mockAuthGetLoginState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ secretId: "sid", secretKey: "skey" });

    const { ensureLogin } = await import("./auth.js");
    await ensureLogin({ authMode: "web", region: "ap-singapore", site: "domestic" });

    const getAuthUrl = mockAuthLoginByWebAuth.mock.calls.at(-1)![0].getAuthUrl;
    const url = getAuthUrl("https://tcb.cloud.tencent.com/oauth/authorize?client_id=x");
    expect(url).toContain("cloud.tencent.com");
    expect(url).not.toContain("tencentcloud.com");
    expect(url).toContain("allowNoEnv=true");
  });

  it("should rewrite auth host to intl for intl site", async () => {
    mockAuthGetLoginState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ secretId: "sid", secretKey: "skey" });

    const { ensureLogin } = await import("./auth.js");
    await ensureLogin({ authMode: "web", region: "ap-singapore", site: "intl" });

    const getAuthUrl = mockAuthLoginByWebAuth.mock.calls.at(-1)![0].getAuthUrl;
    const url = getAuthUrl("https://tcb.cloud.tencent.com/oauth/authorize?client_id=x");
    expect(url).toContain("tencentcloud.com");
  });

  it("should use intl OAuth endpoint and rewrite device verification URL for intl site", async () => {
    mockAuthGetLoginState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ secretId: "sid", secretKey: "skey" });

    const { ensureLogin } = await import("./auth.js");
    await ensureLogin({ authMode: "device", region: "ap-singapore", site: "intl" });

    const loginOptions = mockAuthLoginByWebAuth.mock.calls.at(-1)![0];
    expect(loginOptions.getOAuthEndpoint()).toBe(
      "https://tcb-api.tencentcloud.com/qcloud-tcb/v1/oauth",
    );
    const rewritten = loginOptions.getAuthUrl(
      "https://tcb.cloud.tencent.com/dev#/cli-auth?user_code=ABCD-1234&from=cli&flow=device",
    );
    expect(rewritten).toContain("tcb.tencentcloud.com/dev#/cli-auth");
    expect(rewritten).not.toContain("tcb.cloud.tencent.com");
    expect(rewritten).toContain("user_code=ABCD-1234");
  });

  it("should keep toolbox default OAuth endpoint for domestic device login", async () => {
    mockAuthGetLoginState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ secretId: "sid", secretKey: "skey" });

    const { ensureLogin } = await import("./auth.js");
    await ensureLogin({ authMode: "device", site: "domestic" });

    const loginOptions = mockAuthLoginByWebAuth.mock.calls.at(-1)![0];
    expect(loginOptions.getOAuthEndpoint).toBeUndefined();
    expect(loginOptions.getAuthUrl).toBeUndefined();
  });

  it("should let explicit oauthEndpoint override the intl default in device mode", async () => {
    mockAuthGetLoginState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ secretId: "sid", secretKey: "skey" });

    const { ensureLogin } = await import("./auth.js");
    await ensureLogin({
      authMode: "device",
      region: "ap-singapore",
      site: "intl",
      oauthEndpoint: "https://custom.example.com/oauth",
    });

    const loginOptions = mockAuthLoginByWebAuth.mock.calls.at(-1)![0];
    expect(loginOptions.getOAuthEndpoint()).toBe("https://custom.example.com/oauth");
  });

  it("should use domestic login page URL fromCloudBaseLoginPage on domestic site", async () => {
    mockAuthGetLoginState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ secretId: "sid", secretKey: "skey" });

    const { ensureLogin } = await import("./auth.js");
    await ensureLogin({
      authMode: "web",
      region: "ap-singapore",
      site: "domestic",
      fromCloudBaseLoginPage: true,
    });

    const getAuthUrl = mockAuthLoginByWebAuth.mock.calls.at(-1)![0].getAuthUrl;
    const url = getAuthUrl("https://tcb.cloud.tencent.com/oauth/authorize?client_id=x");
    expect(url).toContain("https://tcb.cloud.tencent.com/login?_redirect_uri=");
  });
});

describe("project-level credential priority", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.CLOUDBASE_API_KEY;
    delete process.env.CLOUDBASE_APIKEY;
    delete process.env.CLOUDBASE_ENV_ID;
    mockAuthGetLoginState.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.CLOUDBASE_API_KEY;
    delete process.env.CLOUDBASE_APIKEY;
    delete process.env.CLOUDBASE_ENV_ID;
  });

  function writeProjectCredential(credential: Record<string, unknown>) {
    mkdirSync(projectAuthDir, { recursive: true });
    writeFileSync(join(projectAuthDir, "auth.json"), JSON.stringify({ credential }));
  }

  it("should prefer the project credential over the global login state", async () => {
    writeProjectCredential({
      secretId: "proj-sid",
      secretKey: "proj-skey",
      token: "proj-token",
      envId: "env-project",
      authSource: "api_key",
      apiKey: "proj-key",
    });
    mockCheckAndGetCredential.mockResolvedValue({
      secretId: "proj-sid",
      secretKey: "proj-skey",
      token: "proj-token",
      envId: "env-project",
      authSource: "api_key",
      apiKey: "proj-key",
    });
    // 全局登录态指向另一个环境：项目级必须压过它
    authStoreData.credential = {
      secretId: "global-sid",
      secretKey: "global-skey",
      envId: "env-global",
    };

    const { peekLoginState, getCredentialSource } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(loginState?.envId).toBe("env-project");
    expect(getCredentialSource()).toBe("project");
    // 回填进进程 env，下游 credential_scope / auth_mode 才会跟着变成环境级
    expect(process.env.CLOUDBASE_API_KEY).toBe("proj-key");
    expect(process.env.CLOUDBASE_ENV_ID).toBe("env-project");
  });

  it("should keep reporting project after the env backfill is re-read", async () => {
    writeProjectCredential({
      secretId: "proj-sid",
      secretKey: "proj-skey",
      envId: "env-project",
      authSource: "api_key",
      apiKey: "proj-key",
    });
    mockCheckAndGetCredential.mockResolvedValue({
      secretId: "proj-sid",
      secretKey: "proj-skey",
      envId: "env-project",
      authSource: "api_key",
      apiKey: "proj-key",
    });
    mockAuthLoginByApiKey.mockResolvedValue({
      secretId: "proj-sid",
      secretKey: "proj-skey",
      envId: "env-project",
    });

    const { peekLoginState, getCredentialSource } = await import("./auth.js");
    await peekLoginState();
    // 第二次调用会走 env 分支（env 已被回填），来源不能说成 env
    await peekLoginState();

    expect(getCredentialSource()).toBe("project");
  });

  it("should fall back to the global credential when no project file exists", async () => {
    authStoreData.credential = {
      secretId: "global-sid",
      secretKey: "global-skey",
      envId: "env-global",
    };

    const { peekLoginState, getCredentialSource } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(loginState?.envId).toBe("env-global");
    expect(getCredentialSource()).toBe("global");
    expect(mockCheckAndGetCredential).not.toHaveBeenCalled();
  });

  it("should fall back to the global credential when the project credential is unusable", async () => {
    writeProjectCredential({
      secretId: "proj-sid",
      secretKey: "proj-skey",
      envId: "env-project",
      authSource: "api_key",
      apiKey: "proj-key",
    });
    // 换取失败：toolbox 返回 null
    mockCheckAndGetCredential.mockResolvedValue(null);
    authStoreData.credential = {
      secretId: "global-sid",
      secretKey: "global-skey",
      envId: "env-global",
    };

    const { peekLoginState, getCredentialSource } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(loginState?.envId).toBe("env-global");
    expect(getCredentialSource()).toBe("global");
    expect(process.env.CLOUDBASE_API_KEY).toBeUndefined();
  });

  it("should ignore a project file without authSource (web/device credential)", async () => {
    writeProjectCredential({
      secretId: "proj-sid",
      secretKey: "proj-skey",
      envId: "env-project",
      refreshToken: "rt",
    });
    authStoreData.credential = {
      secretId: "global-sid",
      secretKey: "global-skey",
      envId: "env-global",
    };

    const { peekLoginState, getCredentialSource } = await import("./auth.js");
    const loginState = await peekLoginState();

    expect(loginState?.envId).toBe("env-global");
    expect(getCredentialSource()).toBe("global");
    expect(mockCheckAndGetCredential).not.toHaveBeenCalled();
  });
});
