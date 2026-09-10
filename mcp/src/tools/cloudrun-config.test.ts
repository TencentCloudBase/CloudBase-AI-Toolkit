import { describe, expect, it } from "vitest";
import { t } from "../i18n/index.js";
import {
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
