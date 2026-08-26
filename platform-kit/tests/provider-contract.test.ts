import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PlatformProvider } from "../src/core/provider.js";
import { createMockPlatformProvider } from "../src/examples/custom-provider.example.js";

const KIT_METHODS = [
  "listTables",
  "listTableColumns",
  "readRows",
  "runReadSql",
  "listStorage",
  "storageUrl",
  "authStatus",
  "startLogin",
  "authStateChange",
  "logout",
  "getAuthLoginConfig",
  "listEnvironments",
  "setEnvironment",
  "appAuthConfig",
  "listAppUsers",
  "listSecrets",
  "metrics",
  "usage",
  "recentErrors",
  "envInfo",
  "listAccessEndpoints",
  "listDeployments",
  "rollbackDeployment",
  "capi",
  "searchLogs",
  "checkLogService",
  "getTableSchema",
  "listSchemaPolicies",
  "runPgDDL",
  "listPgFunctions",
  "listPgExtensions",
  "listPgRoles",
  "listMigrations",
  "listPgMigrations",
  "listSchemas",
  "listTriggers",
  "listTypes",
  "listColumnPrivileges",
  "upsertPolicy",
  "dropPolicy",
  "toggleTableRls",
  "searchAppUsers",
  "setAppUserStatus",
  "listGatewayRoutes",
  "upsertGatewayRoute",
  "deleteGatewayRoute",
  "getGatewayPrivilege",
  "listCustomDomains",
  "bindCustomDomain",
  "deleteCustomDomain",
  "listSafetyDomains",
  "getStorageSecurityRules",
  "setStorageSecurityRules",
  "listCdnCacheConfig",
  "getStorageCustomDomains",
  "listGatewayDomains",
  "listFunctionNames",
  "setGatewayServiceEnabled",
  "setGatewayAuthEnabled",
  "fetchMetricSeries",
] as const satisfies ReadonlyArray<keyof PlatformProvider>;

function implementedMethodNames(source: string): Set<string> {
  const names = new Set<string>();
  const re = /(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    names.add(match[1]);
  }
  return names;
}

describe("PlatformProvider contract vs dsh-plugin data-service", () => {
  it("data-service implements every PlatformProvider method name", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(root, "../../dsh-plugin/src/server/data-service.ts"),
      "utf8",
    );
    const implemented = implementedMethodNames(source);
    const missing = KIT_METHODS.filter((name) => !implemented.has(name));
    expect(missing).toEqual([]);
  });
});

describe("mock provider login + capi", () => {
  it("host-injected signs in immediately", async () => {
    const provider = createMockPlatformProvider();
    const status = await provider.startLogin!("host-injected");
    expect(status.signedIn).toBe(true);
    expect(status.authMode).toBe("host-injected");
  });

  it("apikey rejects missing or invalid key and accepts mock-key", async () => {
    const provider = createMockPlatformProvider();
    const denied = await provider.startLogin!("apikey", { envId: "e1" });
    expect(denied.signedIn).toBe(false);
    const ok = await provider.startLogin!("apikey", { envId: "e1", apiKey: "mock-key" });
    expect(ok.signedIn).toBe(true);
    expect(ok.envId).toBe("e1");
  });

  it("device-code returns verificationUrl and userCode without signing in", async () => {
    const provider = createMockPlatformProvider();
    const status = await provider.startLogin!("device-code");
    expect(status.signedIn).toBe(false);
    expect(status.verificationUrl).toBe("https://example.com/device");
    expect(status.userCode).toBe("ABCD-1234");
  });

  it("logout clears the session", async () => {
    const provider = createMockPlatformProvider();
    await provider.startLogin!("host-injected");
    const status = await provider.logout!();
    expect(status.signedIn).toBe(false);
  });

  it("capi is an unbound data channel", async () => {
    const provider = createMockPlatformProvider();
    const payload = await provider.capi!("tcb", "DescribeEnvs", { EnvId: "mock" });
    expect(payload).toMatchObject({ service: "tcb", action: "DescribeEnvs", mock: true });
  });
});
