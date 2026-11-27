import { beforeEach, describe, expect, it, vi } from "vitest";

const { authStoreData } = vi.hoisted(() => ({
  authStoreData: {} as Record<string, any>,
}));

vi.mock("@cloudbase/toolbox", () => ({
  AuthSupervisor: {
    getInstance: vi.fn(() => ({
      getLoginState: vi.fn(),
      loginByWebAuth: vi.fn(),
      loginByApiKey: vi.fn(),
      logout: vi.fn(),
    })),
  },
  authStore: {
    get: vi.fn(async (key: string) => authStoreData[key]),
    set: vi.fn(async (key: string, value: any) => {
      authStoreData[key] = value;
    }),
    delete: vi.fn(async (key: string) => {
      delete authStoreData[key];
    }),
  },
  cloudbaseConfigDir: "/tmp/cb-capi-scope-test-config",
  resolveCredential: (data: any) => data,
  refreshTmpToken: vi.fn(),
  exchangeApiKeyForCredential: vi.fn(),
  checkAndGetCredential: vi.fn(async () => null),
  getProjectDir: vi.fn(() => "/tmp/cb-capi-scope-test-project"),
}));

import { peekLoginState } from "../auth.js";
import { getCredentialScope } from "./env.js";
import { buildCapiFailureResult } from "./capi.js";

/**
 * 跨模块回归：callCloudApi 的失败分类必须取「本轮真正生效的凭据」的范围，
 * 而不是调用方随手传的一个字符串。全局槽里的 API Key 凭据没有进程环境变量，
 * 旧版范围判定会把它当成账号级，把「权限边界」误报成「凭据无效」。
 */
describe("callCloudApi credential scope comes from the resolved credential", () => {
  beforeEach(() => {
    for (const key of Object.keys(authStoreData)) delete authStoreData[key];
    delete process.env.CLOUDBASE_API_KEY;
    delete process.env.CLOUDBASE_ENV_ID;
    delete process.env.TENCENTCLOUD_SECRETID;
    delete process.env.TENCENTCLOUD_SECRETKEY;
  });

  it("全局槽 api_key 凭据：invalid token 判为 credential_scope_limited", async () => {
    authStoreData.credential = {
      secretId: "sid",
      secretKey: "skey",
      authSource: "api_key",
      apiKey: "k",
      envId: "env-a",
    };

    await peekLoginState();
    const scope = getCredentialScope({});
    expect(scope).toBe("single_env");

    const result = buildCapiFailureResult(
      "tcb",
      "DescribeEnvs",
      new Error("invalid token"),
      scope,
    );
    const payload = JSON.parse(result.content[0].text);
    expect(payload.credential_scope).toBe("single_env");
    expect(payload.error_category).toBe("credential_scope_limited");
  });

  // 账号级凭据调用管控面接口被 CAM 拒绝时，网关同样返回 invalid token；
  // 不能因为 scope 是 account 就把它说成「凭据无效，去重新登录」。
  it("device 登录态：同样的 invalid token 仍判为权限边界", async () => {
    authStoreData.credential = {
      secretId: "sid",
      secretKey: "skey",
      refreshToken: "rt",
      envId: "env-a",
    };

    await peekLoginState();
    const scope = getCredentialScope({});
    expect(scope).toBe("account");

    const result = buildCapiFailureResult(
      "tcb",
      "DescribeEnvs",
      new Error("invalid token"),
      scope,
    );
    const payload = JSON.parse(result.content[0].text);
    expect(payload.credential_scope).toBe("account");
    expect(payload.error_category).toBe("credential_scope_limited");
  });
});
