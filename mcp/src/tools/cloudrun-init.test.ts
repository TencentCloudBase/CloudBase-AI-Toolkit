import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCloudBaseManager, mockGetEnvId } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
}));

import {
  ensureCloudRunEnvInitialized,
  queryCloudRunEnvStatus,
} from "./cloudrun.js";

function makeManager(callImpl: (options: unknown) => Promise<unknown>) {
  return {
    commonService: vi.fn().mockReturnValue({ call: callImpl }),
  };
}

describe("ensureCloudRunEnvInitialized", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when DescribeEnvBaseInfo reports IsExist=true (initialized)", async () => {
    // 2026-08-13 真实凭据实测（ai-share-d2guukyxybb63b206 已开通云托管）：
    // DescribeEnvBaseInfo 返回 IsExist=true + 完整 EnvBaseInfo（Status="normal"，
    // PackageType/Region/EnvType/CreateTime 等均已填充），与未开通分支（IsExist=false +
    // 空结构）可明确区分。
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => ({
        EnvBaseInfo: {
          EnvId: "ai-share-d2guukyxybb63b206",
          Alias: "ai-share-d2guukyxybb63b206",
          Status: "normal",
          Region: "ap-shanghai",
          EnvType: "baas",
          PackageType: "Trial",
          VpcId: "",
          CreateTime: "2026-08-13 23:33:19",
          SubnetIds: "",
          Recycle: "",
        },
        IsExist: true,
        RequestId: "req",
      })),
    );
    await expect(
      ensureCloudRunEnvInitialized({
        cloudBaseOptions: {},
        envId: "env-test",
        serverName: "demo",
      }),
    ).resolves.toBe(true);
    expect(mockGetCloudBaseManager).toHaveBeenCalledTimes(1);
  });

  it("blocks when DescribeEnvBaseInfo reports IsExist=false (uninitialized, real API behavior)", async () => {
    // 2026-08-13 真实凭据实测：未开通云托管的环境 DescribeEnvBaseInfo 返回
    // IsExist=false 且 EnvBaseInfo 为空结构（不抛错），不是错误码。
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => ({
        EnvBaseInfo: {
          EnvId: "env-test",
          Alias: "",
          Status: "",
          Region: "",
          EnvType: "",
          PackageType: "",
          VpcId: "",
          CreateTime: "",
          SubnetIds: "",
          Recycle: "",
        },
        IsExist: false,
        RequestId: "req",
      })),
    );
    const promise = ensureCloudRunEnvInitialized({
      cloudBaseOptions: {},
      envId: "env-test",
      serverName: "demo",
    });
    await expect(promise).rejects.toThrow(/尚未初始化云托管/);
    await expect(promise).rejects.toThrow(/initEnv/);
    await expect(promise).rejects.toThrow(/env-test/);
  });

  it("blocks when DescribeEnvBaseInfo throws ResourceNotFound (uninitialized)", async () => {
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => {
        throw new Error("ResourceNotFound.CloudRunEnv: cloudrun env not opened");
      }),
    );
    await expect(
      ensureCloudRunEnvInitialized({
        cloudBaseOptions: {},
        envId: "env-test",
        serverName: "demo",
      }),
    ).rejects.toThrow(/尚未初始化云托管/);
  });

  it("blocks on InvalidParameter with env/cloudrun context", async () => {
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => {
        throw new Error("InvalidParameter.EnvironmentIdNotFound: env not found");
      }),
    );
    await expect(
      ensureCloudRunEnvInitialized({
        cloudBaseOptions: {},
        envId: "env-test",
        serverName: "demo",
      }),
    ).rejects.toThrow(/尚未初始化云托管/);
  });

  it("does not block on bare InvalidParameter (transient parameter error)", async () => {
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => {
        throw new Error("InvalidParameter: bad request");
      }),
    );
    await expect(
      ensureCloudRunEnvInitialized({
        cloudBaseOptions: {},
        envId: "env-test",
        serverName: "demo",
      }),
    ).resolves.toBe(true);
  });

  it("does not block on network/permission errors (lets the caller handle them)", async () => {
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => {
        throw new Error("socket hang up");
      }),
    );
    await expect(
      ensureCloudRunEnvInitialized({
        cloudBaseOptions: {},
        envId: "env-test",
        serverName: "demo",
      }),
    ).resolves.toBe(true);
  });

  it("does not block on InvalidAction-like errors (no bare not.?found matching)", async () => {
    // 实测：tcbr 不存在 DescribeCloudRunEnv 单数 Action，若误用会返回 InvalidAction
    // 且消息含 "not found in service"；不应把这种 Action 不存在误判为未初始化。
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => {
        throw new Error(
          "[DescribeCloudRunEnv] The request action=`DescribeCloudRunEnv` is invalid or not found in service=`tcbr` and version=`2022-02-17`.",
        );
      }),
    );
    await expect(
      ensureCloudRunEnvInitialized({
        cloudBaseOptions: {},
        envId: "env-test",
        serverName: "demo",
      }),
    ).resolves.toBe(true);
  });

  it("degrades to allowed when the SDK has no commonService", async () => {
    mockGetCloudBaseManager.mockReturnValue({});
    await expect(
      ensureCloudRunEnvInitialized({
        cloudBaseOptions: {},
        envId: "env-test",
        serverName: "demo",
      }),
    ).resolves.toBe(true);
  });

  it("guides initEnv (not callCloudApi) when the env is not initialized", async () => {
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => ({
        EnvBaseInfo: {
          EnvId: "env-test",
          Alias: "",
          Status: "",
          Region: "",
          EnvType: "",
          PackageType: "",
          VpcId: "",
          CreateTime: "",
          SubnetIds: "",
          Recycle: "",
        },
        IsExist: false,
        RequestId: "req",
      })),
    );
    await expect(
      ensureCloudRunEnvInitialized({
        cloudBaseOptions: {},
        envId: "env-test",
        serverName: "demo",
      }),
    ).rejects.toThrow(/manageCloudRun\(action="initEnv"/);
    await expect(
      ensureCloudRunEnvInitialized({
        cloudBaseOptions: {},
        envId: "env-test",
        serverName: "demo",
      }),
    ).rejects.toThrow(/queryCloudRun\(action="envStatus"/);
  });
});

describe("queryCloudRunEnvStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns normal for an opened env (IsExist=true, Status=normal)", async () => {
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => ({
        EnvBaseInfo: {
          EnvId: "env-test",
          Status: "normal",
          PackageType: "Trial",
          Region: "ap-shanghai",
          EnvType: "baas",
        },
        IsExist: true,
      })),
    );
    const status = await queryCloudRunEnvStatus({
      cloudBaseOptions: {},
      envId: "env-test",
    });
    expect(status.isExist).toBe(true);
    expect(status.status).toBe("normal");
    expect(status.baseInfo.PackageType).toBe("Trial");
  });

  it("returns creating for an env that is being provisioned", async () => {
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => ({
        EnvBaseInfo: {
          EnvId: "env-test",
          Status: "creating",
          PackageType: "",
          Region: "",
          EnvType: "",
        },
        IsExist: true,
      })),
    );
    const status = await queryCloudRunEnvStatus({
      cloudBaseOptions: {},
      envId: "env-test",
    });
    expect(status.isExist).toBe(true);
    expect(status.status).toBe("creating");
  });

  it("returns unopened for IsExist=false", async () => {
    mockGetCloudBaseManager.mockReturnValue(
      makeManager(async () => ({
        EnvBaseInfo: {
          EnvId: "env-test",
          Status: "",
          PackageType: "",
          Region: "",
          EnvType: "",
        },
        IsExist: false,
      })),
    );
    const status = await queryCloudRunEnvStatus({
      cloudBaseOptions: {},
      envId: "env-test",
    });
    expect(status.isExist).toBe(false);
    expect(status.status).toBe("unopened");
  });

  it("throws when commonService is missing", async () => {
    mockGetCloudBaseManager.mockReturnValue({});
    await expect(
      queryCloudRunEnvStatus({ cloudBaseOptions: {}, envId: "env-test" }),
    ).rejects.toThrow(/commonService/);
  });
});

type RegisteredTool = { meta: any; handler: (args: any) => Promise<any> };

async function createCloudRunTools() {
  const tools: Record<string, RegisteredTool> = {};
  const server: any = {
    cloudBaseOptions: {},
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  };
  const { registerCloudRunTools } = await import("./cloudrun.js");
  registerCloudRunTools(server);
  return tools;
}

function parseToolResult(res: any) {
  const text = res.content[0].text;
  return JSON.parse(text);
}

describe("manageCloudRun initEnv action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvId.mockResolvedValue("env-configured");
  });

  it("returns already-opened (idempotent) when env Status=normal, without calling CreateCloudRunEnv", async () => {
    const calls: unknown[] = [];
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async (req: any) => {
          calls.push(req);
          if (req.Action === "DescribeEnvBaseInfo") {
            return {
              EnvBaseInfo: { EnvId: "env-test", Status: "normal", PackageType: "Trial" },
              IsExist: true,
            };
          }
          return {};
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.manageCloudRun.handler({
      action: "initEnv",
      envId: "env-test",
      packageType: "Trial",
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("normal");
    expect(parsed.data.created).toBe(false);
    expect(calls.map((c: any) => c.Action)).toEqual(["DescribeEnvBaseInfo"]);
  });

  it("returns already-creating (idempotent) when env Status=creating, without calling CreateCloudRunEnv", async () => {
    const calls: unknown[] = [];
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async (req: any) => {
          calls.push(req);
          return {
            EnvBaseInfo: { EnvId: "env-test", Status: "creating" },
            IsExist: true,
          };
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.manageCloudRun.handler({
      action: "initEnv",
      envId: "env-test",
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("creating");
    expect(parsed.data.created).toBe(false);
    expect(calls.map((c: any) => c.Action)).toEqual(["DescribeEnvBaseInfo"]);
  });

  it("creates the env (async) when not opened, returns creating and guides envStatus", async () => {
    const calls: unknown[] = [];
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async (req: any) => {
          calls.push(req);
          if (req.Action === "DescribeEnvBaseInfo") {
            return { EnvBaseInfo: {}, IsExist: false };
          }
          if (req.Action === "CreateCloudRunEnv") {
            return { EnvId: "env-test", TranId: "tran-123" };
          }
          return {};
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.manageCloudRun.handler({
      action: "initEnv",
      envId: "env-test",
      packageType: "Professional",
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("creating");
    expect(parsed.data.created).toBe(true);
    expect(parsed.data.packageType).toBe("Professional");
    expect(parsed.data.tranId).toBe("tran-123");
    expect(calls.map((c: any) => c.Action)).toEqual([
      "DescribeEnvBaseInfo",
      "CreateCloudRunEnv",
    ]);
    expect((calls[1] as any).Param).toEqual({
      EnvId: "env-test",
      PackageType: "Professional",
      EnvType: "baas",
    });
  });

  it("defaults packageType to Trial when not provided", async () => {
    const calls: unknown[] = [];
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async (req: any) => {
          calls.push(req);
          if (req.Action === "DescribeEnvBaseInfo") {
            return { EnvBaseInfo: {}, IsExist: false };
          }
          return { EnvId: "env-test" };
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    await tools.manageCloudRun.handler({ action: "initEnv", envId: "env-test" });
    expect((calls[1] as any).Param.PackageType).toBe("Trial");
    expect((calls[1] as any).Param.EnvType).toBe("baas");
  });

  it("passes optional vpcId/subnetIds through to CreateCloudRunEnv", async () => {
    const calls: unknown[] = [];
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async (req: any) => {
          calls.push(req);
          if (req.Action === "DescribeEnvBaseInfo") {
            return { EnvBaseInfo: {}, IsExist: false };
          }
          return { EnvId: "env-test", TranId: "tran-vpc" };
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    await tools.manageCloudRun.handler({
      action: "initEnv",
      envId: "env-test",
      vpcId: "vpc-26vsxozo",
      subnetIds: ["subnet-hyiwt4ut"],
    });
    expect((calls[1] as any).Param).toEqual({
      EnvId: "env-test",
      PackageType: "Trial",
      EnvType: "baas",
      VpcId: "vpc-26vsxozo",
      SubNetIds: ["subnet-hyiwt4ut"],
    });
  });

  it("treats uppercase NORMAL as already-opened (idempotent)", async () => {
    const calls: unknown[] = [];
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async (req: any) => {
          calls.push(req);
          return {
            EnvBaseInfo: { EnvId: "env-test", Status: "NORMAL", PackageType: "Trial" },
            IsExist: true,
          };
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.manageCloudRun.handler({
      action: "initEnv",
      envId: "env-test",
    });
    const parsed = parseToolResult(res);
    expect(parsed.data.status).toBe("normal");
    expect(parsed.data.created).toBe(false);
    expect(calls.map((c: any) => c.Action)).toEqual(["DescribeEnvBaseInfo"]);
  });

  it("guides device code / SecretKey on CAM auth failure during initEnv", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async (req: any) => {
          if (req.Action === "DescribeEnvBaseInfo") {
            return { EnvBaseInfo: {}, IsExist: false };
          }
          throw new Error("UnauthorizedOperation: [CAM] not authorized to perform: tcbr:CreateCloudRunEnv");
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    await expect(
      tools.manageCloudRun.handler({ action: "initEnv", envId: "env-test" }),
    ).rejects.toThrow(/device code|SecretId\/SecretKey|start_auth/);
  });
});

describe("queryCloudRun envStatus action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvId.mockResolvedValue("env-configured");
  });

  it("returns normal with deploy guidance", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async () => ({
          EnvBaseInfo: { EnvId: "env-test", Status: "normal", PackageType: "Trial" },
          IsExist: true,
        }),
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({ action: "envStatus", envId: "env-test" });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("normal");
    expect(parsed.data.envBaseInfo.Status).toBe("normal");
    expect(parsed.message).toMatch(/可直接 manageCloudRun\(action="deploy"\)/);
  });

  it("normalizes uppercase NORMAL/CREATING from platform", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async () => ({
          EnvBaseInfo: { EnvId: "env-test", Status: "NORMAL", PackageType: "Trial" },
          IsExist: true,
        }),
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({ action: "envStatus", envId: "env-test" });
    const parsed = parseToolResult(res);
    expect(parsed.data.status).toBe("normal");
  });

  it("returns creating with retry guidance", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async () => ({
          EnvBaseInfo: { EnvId: "env-test", Status: "creating" },
          IsExist: true,
        }),
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({ action: "envStatus", envId: "env-test" });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("creating");
    expect(parsed.message).toMatch(/请稍后重试/);
  });

  it("returns unopened with initEnv guidance", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async () => ({ EnvBaseInfo: {}, IsExist: false }),
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({ action: "envStatus", envId: "env-test" });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("unopened");
    expect(parsed.data.isExist).toBe(false);
    expect(parsed.message).toMatch(/initEnv/);
  });

  it("treats ResourceNotFound as unopened", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async () => {
          throw new Error("ResourceNotFound.CloudRunEnv: env not opened");
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({ action: "envStatus", envId: "env-test" });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("unopened");
  });

  // F2 回归：错误文案已被下层本地化为中文，旧守卫只匹配 message 会失效 → 模型拿到裸错
  it("treats a localized (Chinese) resource-not-found error as unopened", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async () => {
          throw new Error("[DescribeEnvBaseInfo] 资源不存在");
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({ action: "envStatus", envId: "env-test" });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("unopened");
    expect(parsed.data.isExist).toBe(false);
    expect(parsed.message).toMatch(/initEnv/);
  });

  // F2 回归：错误码只在 error.code 上，message 不含任何可匹配文案
  it("treats an error carrying only ResourceNotFound code as unopened", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async () => {
          const error = new Error("请求失败");
          (error as Error & { code?: string }).code = "ResourceNotFound.CloudRunEnv";
          throw error;
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({ action: "envStatus", envId: "env-test" });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("unopened");
  });

  it("still rethrows unrelated errors instead of masking them as unopened", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async () => {
          const error = new Error("UnauthorizedOperation: no permission");
          (error as Error & { code?: string }).code = "UnauthorizedOperation";
          throw error;
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    await expect(
      tools.queryCloudRun.handler({ action: "envStatus", envId: "env-test" }),
    ).rejects.toThrow(/UnauthorizedOperation/);
  });

  it("falls back to the configured envId when envId is not provided", async () => {
    mockGetCloudBaseManager.mockReturnValue({
      commonService: vi.fn().mockReturnValue({
        call: async (req: any) => {
          expect(req.Param.EnvId).toBe("env-configured");
          return { EnvBaseInfo: { Status: "normal" }, IsExist: true };
        },
      }),
      cloudrun: {},
    });
    const tools = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({ action: "envStatus" });
    const parsed = parseToolResult(res);
    expect(parsed.data.envId).toBe("env-configured");
  });
});

describe("cloudrun VPC helpers", () => {
  it("buildCreateCloudRunEnvParam always sets EnvType=baas", async () => {
    const { buildCreateCloudRunEnvParam } = await import("./cloudrun.js");
    expect(
      buildCreateCloudRunEnvParam({ envId: "env-x", packageType: "Trial" }),
    ).toEqual({
      EnvId: "env-x",
      PackageType: "Trial",
      EnvType: "baas",
    });
  });

  it("resolveCloudRunDeployVpcInfo prefers VpcConf then env base info", async () => {
    const { resolveCloudRunDeployVpcInfo } = await import("./cloudrun.js");
    expect(
      resolveCloudRunDeployVpcInfo({
        vpcConf: { VpcId: "vpc-a", SubnetId: "subnet-a" },
        envBaseInfo: { VpcId: "vpc-b", SubNetIds: ["subnet-b"] },
      }),
    ).toEqual({
      VpcId: "vpc-a",
      CreateType: 2,
      SubnetIds: ["subnet-a"],
    });
    expect(
      resolveCloudRunDeployVpcInfo({
        vpcConf: null,
        envBaseInfo: { VpcId: "vpc-b", SubNetIds: ["subnet-b"] },
      }),
    ).toEqual({
      VpcId: "vpc-b",
      CreateType: 2,
      SubnetIds: ["subnet-b"],
    });
  });
});
