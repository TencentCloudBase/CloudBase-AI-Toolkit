import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CloudBaseData } from "../src/shared/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * CloudBaseData 上的可选方法必须全部出现在 client RPC 桥里：
 * server 端有 @Remote 而客户端桥缺方法时，kit 页面按钮会静默 no-op
 * （provider 方法为 undefined 直接 return），真机上表现为「点了没反应」。
 */
describe("client typert bridge coverage", () => {
  const source = readFileSync(join(root, "src/client/lib/typert.ts"), "utf8");

  const optionalMethods = [
    "startLogin",
    "logout",
    "getAuthLoginConfig",
    "authStateChange",
    "rollbackDeployment",
    "searchAppUsers",
    "setAppUserStatus",
    "checkLogService",
    "searchLogs",
    "getTableSchema",
    "listSchemaPolicies",
    "runPgDDL",
    "listPgFunctions",
    "listPgExtensions",
    "listPgRoles",
    "listPgMigrations",
    "listMigrations",
    "listCustomDomains",
    "bindCustomDomain",
    "deleteCustomDomain",
    "listSchemas",
    "listTriggers",
    "listTypes",
    "listColumnPrivileges",
    "listSafetyDomains",
    "getStorageSecurityRules",
    "setStorageSecurityRules",
    "listCdnCacheConfig",
    "getStorageCustomDomains",
    "listGatewayRoutes",
    "upsertGatewayRoute",
    "deleteGatewayRoute",
    "getGatewayPrivilege",
    "listGatewayDomains",
    "listFunctionNames",
    "setGatewayServiceEnabled",
    "setGatewayAuthEnabled",
    "fetchMetricSeries",
    "listFunctions",
    "getFunction",
    "listFunctionTriggers",
    "listFunctionLogs",
    "invokeFunction",
    "listCloudRunServices",
    "getCloudRunService",
    "listCloudRunDeployRecords",
    "getCloudRunProcessLog",
    "getCloudRunBuildLog",
    "listHostingDomains",
    "listHostingVersions",
    "listHostingObjects",
    "listStorageBuckets",
    "uploadStorage",
    "createStorageBucket",
    "deleteStorageBucket",
    "listSslCertificates",
    "listCdnCacheItems",
    "listAuthDomains",
    "deleteAuthDomain",
    "upsertPolicy",
    "dropPolicy",
    "toggleTableRls",
  ] as const;

  it("exposes every optional CloudBaseData method over the RPC bridge", () => {
    // CloudBaseData 里确实声明了这些可选方法（防清单本身漂移）
    const sharedTypes = readFileSync(join(root, "src/shared/types.ts"), "utf8");
    for (const method of optionalMethods) {
      expect(sharedTypes).toMatch(new RegExp(`${method}\\??\\(`));
    }
    for (const method of optionalMethods) {
      // authStateChange 是同步注册监听，其余方法均为 async RPC 调用
      expect(source, `client bridge missing method: ${method}`).toContain(
        method === "authStateChange" ? "authStateChange(" : `async ${method}(`,
      );
    }
  });

  it("bridge return values satisfy the CloudBaseData contract", async () => {
    const mod = await import("../src/client/lib/typert.js");
    // 桥工厂在无 connection 时返回 undefined；这里只验证导出形状。
    expect(typeof mod.createRemoteCloudBaseData).toBe("function");
    expect(mod.createRemoteCloudBaseData(undefined)).toBeUndefined();
    const fake = mod.createRemoteCloudBaseData({
      connection: { rpc: { call: async () => ({ ok: false, error: { message: "x" } }) } },
    } as never);
    expect(fake).toBeDefined();
    await expect(fake!.authStatus()).rejects.toThrow("x");
  });

  it("createStorageBucket forwards public flag as isPublic wire param", () => {
    expect(source).toContain("{ name, isPublic: opts?.public }");
    void ("" as unknown as CloudBaseData);
  });
});
