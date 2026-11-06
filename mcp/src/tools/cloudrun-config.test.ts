import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { t } from "../i18n/index.js";
import { ManageCloudRunInputSchema } from "./cloudrun.js";
import {
  NESTED_OBJECT_KEYS,
  assertCpuMemPair,
  listLikelyRedeployFields,
  mergeCloudRunServerConfig,
  parseServerConfigToDiffItems,
  summarizeConfigSnapshot,
} from "./cloudrun-config.js";

describe("mergeCloudRunServerConfig", () => {
  it("preserves remote VpcConf when input omits it", () => {
    const { merged, mergedFromRemote } = mergeCloudRunServerConfig({
      remote: {
        VpcConf: { VpcId: "vpc-remote", SubnetId: "subnet-remote" },
        OpenAccessTypes: ["PUBLIC"],
      },
      input: { MinNum: 1 },
    });
    expect(merged.VpcConf).toEqual({
      VpcId: "vpc-remote",
      SubnetId: "subnet-remote",
    });
    expect(mergedFromRemote).toContain("VpcConf");
    expect(merged.OpenAccessTypes).toEqual(["PUBLIC"]);
    expect(mergedFromRemote).toContain("OpenAccessTypes");
  });

  it("prefers complete input VpcConf over remote", () => {
    const { merged, mergedFromRemote } = mergeCloudRunServerConfig({
      remote: {
        VpcConf: { VpcId: "vpc-old", SubnetId: "subnet-old" },
      },
      input: {
        VpcConf: { VpcId: "vpc-new", SubnetId: "subnet-new" },
      },
    });
    expect(merged.VpcConf).toEqual({
      VpcId: "vpc-new",
      SubnetId: "subnet-new",
    });
    expect(mergedFromRemote).not.toContain("VpcConf");
  });

  it("merges EnvParams by key and preserves remote-only keys", () => {
    const { merged, mergedFromRemote } = mergeCloudRunServerConfig({
      remote: {
        EnvParams: JSON.stringify({ KEEP: "1", SHARED: "old" }),
      },
      input: {
        EnvParams: JSON.stringify({ SHARED: "new", ADD: "2" }),
      },
    });
    expect(JSON.parse(String(merged.EnvParams))).toEqual({
      KEEP: "1",
      SHARED: "new",
      ADD: "2",
    });
    expect(mergedFromRemote).toContain("EnvParams");
  });

  it("replaces EnvParams entirely when envParamsReplaceAll is true", () => {
    const { merged, mergedFromRemote } = mergeCloudRunServerConfig({
      remote: {
        EnvParams: JSON.stringify({ KEEP: "1", SHARED: "old" }),
      },
      input: {
        EnvParams: JSON.stringify({ SHARED: "new" }),
      },
      envParamsReplaceAll: true,
    });
    expect(JSON.parse(String(merged.EnvParams))).toEqual({ SHARED: "new" });
    expect(mergedFromRemote).not.toContain("EnvParams");
  });

  it("keeps input OpenAccessTypes when provided", () => {
    const { merged, mergedFromRemote } = mergeCloudRunServerConfig({
      remote: { OpenAccessTypes: ["OA", "PUBLIC", "MINIAPP"] },
      input: { OpenAccessTypes: ["PUBLIC", "VPC"] },
    });
    expect(merged.OpenAccessTypes).toEqual(["PUBLIC", "VPC"]);
    expect(mergedFromRemote).not.toContain("OpenAccessTypes");
  });
});

describe("parseServerConfigToDiffItems", () => {
  it("maps Cpu/Mem/OpenAccessTypes/EnvParams/VpcConf to Diff keys", () => {
    const items = parseServerConfigToDiffItems({
      Cpu: 0.5,
      Mem: 1,
      OpenAccessTypes: ["PUBLIC"],
      EnvParams: '{"A":"1"}',
      VpcConf: { VpcId: "vpc-1", SubnetId: "subnet-1" },
      MinNum: 1,
    });
    const byKey = Object.fromEntries(items.map((i) => [i.Key, i]));
    expect(byKey.CpuSpecs?.FloatValue).toBe(0.5);
    expect(byKey.MemSpecs?.FloatValue).toBe(1);
    expect(byKey.AccessTypes?.ArrayValue).toEqual(["PUBLIC"]);
    expect(byKey.EnvParam?.Value).toBe('{"A":"1"}');
    expect(byKey.VpcConf?.VpcConf).toEqual({
      VpcId: "vpc-1",
      SubnetId: "subnet-1",
    });
    expect(byKey.MinNum?.IntValue).toBe(1);
  });

  it("throws when Cpu is set without Mem", () => {
    expect(() => parseServerConfigToDiffItems({ Cpu: 1 })).toThrow(
      t("cloudrunConfig.cpuMemPairRequired"),
    );
  });

  it("assertCpuMemPair allows both unset", () => {
    expect(() => assertCpuMemPair({})).not.toThrow();
  });
});

describe("summarizeConfigSnapshot", () => {
  it("returns env keys without values", () => {
    const snap = summarizeConfigSnapshot({
      VpcConf: { VpcId: "vpc-x", SubnetId: "subnet-y" },
      EnvParams: JSON.stringify({ SECRET: "do-not-leak", NODE_ENV: "prod" }),
      OpenAccessTypes: ["PUBLIC"],
    });
    expect(snap.hasVpcConf).toBe(true);
    expect(snap.vpcId).toBe("vpc-x");
    expect(snap.envParamKeys).toEqual(
      expect.arrayContaining(["SECRET", "NODE_ENV"]),
    );
    expect(JSON.stringify(snap)).not.toContain("do-not-leak");
  });
});

describe("listLikelyRedeployFields", () => {
  it("lists VpcConf and EnvParams when present", () => {
    expect(
      listLikelyRedeployFields({
        VpcConf: { VpcId: "vpc-1", SubnetId: "subnet-1" },
        EnvParams: "{}",
        MinNum: 1,
      }),
    ).toEqual(expect.arrayContaining(["VpcConf", "EnvParams"]));
  });
});

/**
 * 契约测试：serverConfig 的嵌套字段必须存在于 @cloudbase/manager-node 的类型里。
 *
 * 背景：069bb2df5（2026-07）一次性加了 12 个 serverConfig 参数，只抄了字段名没对类型，
 * `VolumesConf.VolumeName` / `PublicNetConf.PublicAccess` 这些 API 不认的字段
 * 一路透传到 Create/UpdateCloudRunServer，用户拿到的是
 * "The parameter Items.12.PublicNetConf.PublicAccess is not recognized"。
 * 这类错误的唯一可靠拦法是在 CI 里拿 SDK 类型当夹具。
 */

/** 从已安装的 @cloudbase/manager-node 里读某个 interface 的字段名 */
function sdkInterfaceFields(interfaceName: string): Set<string> {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve("@cloudbase/manager-node/package.json");
  const dts = path.join(path.dirname(pkgJson), "types", "cloudrun", "type.d.ts");
  const source = fs.readFileSync(dts, "utf8");
  const body = source.match(
    new RegExp(`export interface ${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  if (!body) {
    throw new Error(
      `在 ${dts} 里找不到 interface ${interfaceName}，契约测试需要更新（SDK 可能改了类型布局）`,
    );
  }
  return new Set(
    [...body.matchAll(/^\s{2,}([A-Za-z_]\w*)\??\s*:/gm)].map((m) => m[1]),
  );
}

/** 取出 serverConfig 这个 ZodObject 的 shape（避免 zod 版本间 API 差异带来的脆弱性） */
function serverConfigShape(): Record<string, unknown> {
  const serverConfig = (ManageCloudRunInputSchema as Record<string, any>).serverConfig;
  const unwrapped =
    typeof serverConfig?.unwrap === "function" ? serverConfig.unwrap() : serverConfig;
  if (!unwrapped?.shape) {
    throw new Error("无法从 ManageCloudRunInputSchema 取到 serverConfig.shape，契约测试需要更新");
  }
  return unwrapped.shape;
}

describe("serverConfig 嵌套字段与 SDK 类型的契约", () => {
  it("白名单里的每个字段都能在 SDK 类型里找到", () => {
    const expectations: Record<string, string> = {
      VpcConf: "IVpcConf",
      PublicNetConf: "IPublicNetConf",
      VolumesConf: "IVolumeConf",
    };
    for (const [key, interfaceName] of Object.entries(expectations)) {
      const allowedBySdk = sdkInterfaceFields(interfaceName);
      // 防空转：解析不到字段时下面会「全都不在」，看起来像通过其实是夹具坏了
      // （IPublicNetConf 本来就只有一个字段，阈值只判「非空」）
      expect(allowedBySdk.size, `${interfaceName} 没解析出字段`).toBeGreaterThan(0);
      const unknown = [...NESTED_OBJECT_KEYS[key]].filter((f) => !allowedBySdk.has(f));
      expect(unknown, `${key} 里这些字段 ${interfaceName} 没有`).toEqual([]);
    }
  });

  it("schema 声明的嵌套字段都在白名单内（防止再出现声明了但 API 不认的字段）", () => {
    const shape = serverConfigShape();

    const publicNet = (shape.PublicNetConf as any)?.unwrap?.() ?? shape.PublicNetConf;
    expect(Object.keys(publicNet.shape)).toEqual(["PublicNetStatus"]);

    const volumes = (shape.VolumesConf as any)?.unwrap?.() ?? shape.VolumesConf;
    const variants = volumes?.element?.options ?? volumes?.element?.def?.options ?? [];
    expect(variants.length, "VolumesConf 应是 COS/CFS 两分支的联合").toBeGreaterThan(0);
    const declared = new Set<string>();
    for (const variant of variants) {
      for (const key of Object.keys(variant.shape)) declared.add(key);
    }
    const notWhitelisted = [...declared].filter((k) => !NESTED_OBJECT_KEYS.VolumesConf.has(k));
    expect(notWhitelisted).toEqual([]);
  });

  it("PublicNetConf 用的是 PublicNetStatus，不是 PublicAccess", () => {
    const items = parseServerConfigToDiffItems({
      PublicNetConf: { PublicNetStatus: "open" },
    });
    const byKey = Object.fromEntries(items.map((i) => [i.Key, i]));
    expect(byKey.PublicNetConf?.PublicNetConf).toEqual({ PublicNetStatus: "open" });
  });

  it("COS / CFS 两种卷都能映射，且字段与 SDK 一致", () => {
    const items = parseServerConfigToDiffItems({
      VolumesConf: [
        { Type: "COS", BucketName: "my-bucket", DstPath: "/mnt/cos" },
        { Type: "CFS", InstanceId: "cfs-123", DstPath: "/mnt/cfs" },
      ],
    });
    const byKey = Object.fromEntries(items.map((i) => [i.Key, i]));
    expect(byKey.VolumesConf?.VolumesConf).toEqual([
      { Type: "COS", BucketName: "my-bucket", DstPath: "/mnt/cos" },
      { Type: "CFS", InstanceId: "cfs-123", DstPath: "/mnt/cfs" },
    ]);
  });

  it("不存在的嵌套字段在本地就被拦下，不会打到 API", () => {
    // 这两个正是 2.36+ 上 100% 失败的历史字段
    expect(() =>
      parseServerConfigToDiffItems({
        PublicNetConf: { PublicAccess: true },
      }),
    ).toThrow(/PublicNetConf|PublicAccess|不受支持|Unsupported/);

    expect(() =>
      parseServerConfigToDiffItems({
        VolumesConf: [
          { VolumeName: "v", VolumeType: "CFS", VolumePath: "/mnt" },
        ],
      }),
    ).toThrow(/VolumesConf|VolumeName|不受支持|Unsupported/);
  });
});

describe("serverConfig 对未知嵌套字段的处理", () => {
  it("zod schema 直接拒绝不存在的字段，而不是静默丢弃", () => {
    const shape = serverConfigShape();

    const publicNet = (shape.PublicNetConf as any)?.unwrap?.() ?? shape.PublicNetConf;
    expect(publicNet.safeParse({ PublicAccess: true }).success).toBe(false);
    expect(publicNet.safeParse({ PublicNetStatus: "open" }).success).toBe(true);

    const volumes = (shape.VolumesConf as any)?.unwrap?.() ?? shape.VolumesConf;
    expect(
      volumes.safeParse([{ Type: "COS", BucketName: "b", DstPath: "/m", VolumeName: "x" }]).success,
    ).toBe(false);
    expect(
      volumes.safeParse([{ Type: "COS", BucketName: "b", DstPath: "/m" }]).success,
    ).toBe(true);
  });
});
