import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthGetLoginState,
  mockAuthLoginByWebAuth,
  mockAuthLogout,
} = vi.hoisted(() => ({
  mockAuthGetLoginState: vi.fn(),
  mockAuthLoginByWebAuth: vi.fn(),
  mockAuthLogout: vi.fn(),
}));

vi.mock("@cloudbase/toolbox", () => ({
  AuthSupervisor: {
    getInstance: vi.fn(() => ({
      getLoginState: mockAuthGetLoginState,
      loginByWebAuth: mockAuthLoginByWebAuth,
      logout: mockAuthLogout,
    })),
  },
}));

vi.mock("./utils/logger.js", () => ({
  debug: vi.fn(),
}));

vi.mock("./utils/tencent-cloud.js", () => ({
  isInternationalRegion: vi.fn(() => false),
}));

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
    mockAuthGetLoginState.mockResolvedValue(null);
    mockAuthLoginByWebAuth.mockResolvedValue({
      secretId: "sid",
      secretKey: "skey",
    });
    mockAuthLogout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.TCB_AUTH_MODE;
    delete process.env.TCB_AUTH_CLIENT_ID;
    delete process.env.TCB_AUTH_OAUTH_ENDPOINT;
    delete process.env.TCB_AUTH_OAUTH_CUSTOM;
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

    const loginOptions = mockAuthLoginByWebAuth.mock.calls[0][0];
    expect(loginOptions.getOAuthEndpoint("ignored")).toBe(
      "https://custom.example.com/oauth",
    );
  });
});
