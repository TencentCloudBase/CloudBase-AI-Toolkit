import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthGetLoginState,
  mockAuthLoginByWebAuth,
  mockAuthLoginByApiKey,
  mockAuthLogout,
  mockAuthStore,
  authStoreData,
} = vi.hoisted(() => ({
  mockAuthGetLoginState: vi.fn(),
  mockAuthLoginByWebAuth: vi.fn(),
  mockAuthLoginByApiKey: vi.fn(),
  mockAuthLogout: vi.fn(),
  authStoreData: {} as Record<string, any>,
  mockAuthStore: {
    get: vi.fn(async (key: string) => authStoreData[key]),
    set: vi.fn(async (key: string, value: any) => {
      authStoreData[key] = value;
    }),
    delete: vi.fn(async (key: string) => {
      delete authStoreData[key];
    }),
  },
}));

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
  resolveCredential: (data: any) => data,
  refreshTmpToken: vi.fn(),
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
    SITE_REGION_MAP: {
      domestic: { authHost: "tcb.cloud.tencent.com" },
      intl: { authHost: "tcb.tencentcloud.com" },
    },
  };
});

vi.mock("./utils/tencent-cloud.js", () => ({
  isInternationalRegion: vi.fn(() => false),
}));

beforeEach(() => {
  Object.keys(authStoreData).forEach((key) => delete authStoreData[key]);
  vi.clearAllMocks();
  mockAuthGetLoginState.mockResolvedValue(null);
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

  it("should reject oauthEndpoint when oauthCustom is explicitly false", async () => {
    const { getAuthConfigValidationError } = await import("./auth.js");

    expect(
      getAuthConfigValidationError({
        authMode: "device",
        oauthEndpoint: "https://custom.example.com/oauth",
        oauthCustom: false,
        usesToolboxDefaults: false,
      }),
    ).toContain("oauthEndpoint");
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

describe("multi-site credential slots", () => {
  it("should read credential from the intl slot when site=intl", async () => {
    authStoreData.credential = {
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
      intl: {
        secretId: "intl-sid",
        secretKey: "intl-skey",
        envId: "booker-ai-i0gygeljs622ffd23",
      },
    };

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState({ site: "intl" });

    expect(loginState).toMatchObject({
      secretId: "intl-sid",
      secretKey: "intl-skey",
      envId: "booker-ai-i0gygeljs622ffd23",
    });
  });

  it("should treat legacy flat credential as domestic slot", async () => {
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

  it("should fall back to the only usable slot for ambiguous region without explicit site (issue #960)", async () => {
    // 国内站账号 device 登录后凭证为 flat（等价 domestic 槽），绑定 ap-singapore 环境
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

  it("should fall back to domestic slotted credential for ambiguous region (issue #960)", async () => {
    authStoreData.credential = {
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
    };

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState({ region: "ap-singapore" });

    expect(loginState).toMatchObject({
      secretId: "dom-sid",
      secretKey: "dom-skey",
    });
  });

  it("should keep resolved intl slot when both slots have credentials", async () => {
    authStoreData.credential = {
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
      intl: { secretId: "intl-sid", secretKey: "intl-skey" },
    };

    const { peekLoginState } = await import("./auth.js");
    const loginState = await peekLoginState({ region: "ap-singapore" });

    expect(loginState).toMatchObject({ secretId: "intl-sid" });
  });

  it("should not fall back across slots when site is explicit (issue #960)", async () => {
    authStoreData.credential = {
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
    };

    const { peekLoginState } = await import("./auth.js");
    await expect(
      peekLoginState({ region: "ap-singapore", site: "intl" }),
    ).resolves.toBeNull();
  });

  it("should not fall back across slots when TCB_SITE is set", async () => {
    process.env.TCB_SITE = "intl";
    try {
      authStoreData.credential = {
        domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
      };

      const { peekLoginState } = await import("./auth.js");
      await expect(peekLoginState({ region: "ap-singapore" })).resolves.toBeNull();
    } finally {
      delete process.env.TCB_SITE;
    }
  });

  it("should list only sites with usable credentials", async () => {
    authStoreData.credential = {
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
      intl: {},
    };

    const { listUsableCredentialSites } = await import("./auth.js");
    await expect(listUsableCredentialSites()).resolves.toEqual(["domestic"]);
  });

  it("should not fall back to intl credential when reading default domestic", async () => {
    authStoreData.credential = {
      intl: { secretId: "intl-sid", secretKey: "intl-skey" },
    };
    mockAuthGetLoginState.mockResolvedValue(null);

    const { peekLoginState } = await import("./auth.js");
    await expect(peekLoginState()).resolves.toBeNull();
  });

  it("should write login credential into resolved site slot preserving other slots", async () => {
    mockAuthGetLoginState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        secretId: "intl-sid",
        secretKey: "intl-skey",
      });
    mockAuthLoginByWebAuth.mockImplementation(async () => {
      authStoreData.credential = {
        secretId: "new-intl-sid",
        secretKey: "new-intl-skey",
        refreshToken: "rt",
      };
      return {
        secretId: "new-intl-sid",
        secretKey: "new-intl-skey",
        refreshToken: "rt",
      };
    });
    authStoreData.credential = {
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
    };

    const { ensureLogin } = await import("./auth.js");
    await ensureLogin({ site: "intl" });

    expect(authStoreData.credential).toEqual({
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
      intl: {
        secretId: "new-intl-sid",
        secretKey: "new-intl-skey",
        refreshToken: "rt",
      },
    });
  });

  it("should delete only the intl slot on logout and keep domestic", async () => {
    authStoreData.credential = {
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
      intl: { secretId: "intl-sid", secretKey: "intl-skey" },
    };

    const { logout } = await import("./auth.js");
    await logout({ site: "intl" });

    expect(authStoreData.credential).toEqual({
      domestic: { secretId: "dom-sid", secretKey: "dom-skey" },
    });
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
