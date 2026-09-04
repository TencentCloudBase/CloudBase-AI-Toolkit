import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resolveRegistryCredential,
  TCR_CREDENTIAL_ENV_VARS,
} from "./function-deploy.js";

/**
 * 个人版 TCR 凭证的环境变量回退。
 *
 * 用例统一走 resolveRegistryCredential 纯函数，通过 allowEnv 显式表达
 * 「是否允许读进程环境变量」，不依赖 cloud-mode mock。
 */
describe("registry credential env fallback", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env[TCR_CREDENTIAL_ENV_VARS.username];
    delete process.env[TCR_CREDENTIAL_ENV_VARS.password];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses the same variable names as the cloudbaserc convention", () => {
    // CLI 侧 cloudbaserc 用 {{env.TCB_TCR_USERNAME}} / {{env.TCB_TCR_PASSWORD}}，
    // manager-node 与 toolbox 的报错也指向这两个名字，MCP 必须保持一致
    expect(TCR_CREDENTIAL_ENV_VARS).toEqual({
      username: "TCB_TCR_USERNAME",
      password: "TCB_TCR_PASSWORD",
    });
  });

  it("does not collide with the build container variable names", () => {
    // TCR_USERNAME / TCR_PASSWORD_B64 是 manager-node 注入构建容器的变量，语义不同
    expect(Object.values(TCR_CREDENTIAL_ENV_VARS)).not.toContain("TCR_USERNAME");
    expect(Object.values(TCR_CREDENTIAL_ENV_VARS)).not.toContain("TCR_PASSWORD");
  });

  it("fills both fields from the environment when no credential is passed", () => {
    process.env[TCR_CREDENTIAL_ENV_VARS.username] = "100012345678";
    process.env[TCR_CREDENTIAL_ENV_VARS.password] = "env-secret";

    const result = resolveRegistryCredential(undefined, { allowEnv: true });

    expect(result.credential).toEqual({
      username: "100012345678",
      password: "env-secret",
    });
    expect(result.source).toEqual({ username: "env", password: "env" });
  });

  it("prefers explicit arguments over the environment", () => {
    process.env[TCR_CREDENTIAL_ENV_VARS.username] = "100000000000";
    process.env[TCR_CREDENTIAL_ENV_VARS.password] = "env-secret";

    const result = resolveRegistryCredential(
      { username: "100099999999", password: "arg-secret" },
      { allowEnv: true },
    );

    expect(result.credential).toEqual({
      username: "100099999999",
      password: "arg-secret",
    });
    expect(result.source).toEqual({ username: "argument", password: "argument" });
  });

  it("supports a mixed source: username in args, password from env", () => {
    process.env[TCR_CREDENTIAL_ENV_VARS.password] = "env-secret";

    const result = resolveRegistryCredential(
      { username: "100012345678" },
      { allowEnv: true },
    );

    expect(result.credential).toEqual({
      username: "100012345678",
      password: "env-secret",
    });
    expect(result.source).toEqual({ username: "argument", password: "env" });
  });

  it("never reads the environment when env access is disabled", () => {
    process.env[TCR_CREDENTIAL_ENV_VARS.username] = "100012345678";
    process.env[TCR_CREDENTIAL_ENV_VARS.password] = "env-secret";

    const result = resolveRegistryCredential(undefined, { allowEnv: false });

    expect(result.credential).toBeUndefined();
    expect(result.source).toEqual({});
  });

  it("keeps explicit arguments usable when env access is disabled", () => {
    const result = resolveRegistryCredential(
      { username: "100012345678", password: "arg-secret" },
      { allowEnv: false },
    );

    expect(result.credential).toEqual({
      username: "100012345678",
      password: "arg-secret",
    });
    expect(result.source).toEqual({ username: "argument", password: "argument" });
  });

  it("returns no credential when neither source provides anything", () => {
    const result = resolveRegistryCredential(undefined, { allowEnv: true });

    expect(result.credential).toBeUndefined();
    expect(result.source).toEqual({});
  });

  it("treats blank or whitespace-only environment values as unset", () => {
    process.env[TCR_CREDENTIAL_ENV_VARS.username] = "   ";
    process.env[TCR_CREDENTIAL_ENV_VARS.password] = "";

    const result = resolveRegistryCredential(undefined, { allowEnv: true });

    expect(result.credential).toBeUndefined();
    expect(result.source).toEqual({});
  });

  it("trims surrounding whitespace from the environment username", () => {
    // 复制粘贴 UIN 时容易带换行，会让 SDK 的 ^\d{5,20}$ 校验失败
    process.env[TCR_CREDENTIAL_ENV_VARS.username] = "  100012345678\n";
    process.env[TCR_CREDENTIAL_ENV_VARS.password] = "env-secret";

    const result = resolveRegistryCredential(undefined, { allowEnv: true });

    expect(result.credential?.username).toBe("100012345678");
  });

  it("preserves inner characters of the password verbatim", () => {
    // 密码可能含空格、引号、反斜杠等，除首尾空白外不得做任何规整
    const raw = 'a b"c\\d$e';
    process.env[TCR_CREDENTIAL_ENV_VARS.password] = raw;

    const result = resolveRegistryCredential(
      { username: "100012345678" },
      { allowEnv: true },
    );

    expect(result.credential?.password).toBe(raw);
  });

  it("reports only the source, never the credential values", () => {
    process.env[TCR_CREDENTIAL_ENV_VARS.username] = "100012345678";
    process.env[TCR_CREDENTIAL_ENV_VARS.password] = "top-secret";

    const { source } = resolveRegistryCredential(undefined, { allowEnv: true });

    expect(JSON.stringify(source)).not.toContain("top-secret");
    expect(JSON.stringify(source)).not.toContain("100012345678");
  });
});
