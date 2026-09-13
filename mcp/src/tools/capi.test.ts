import { describe, expect, it } from "vitest";
import {
  ALLOWED_SERVICES,
  SERVICE_VERSIONS,
  assertTcbCloudRunActionAllowed,
  buildCapiErrorMessage,
  removeEmptyStringParams,
  resolveCloudApiRegionAndParams,
  resolveServiceVersion,
} from "./capi.js";

describe("callCloudApi service 白名单", () => {
  it("枚举取值与版本映射表的 key 完全一致", () => {
    expect([...ALLOWED_SERVICES].sort()).toEqual(Object.keys(SERVICE_VERSIONS).sort());
  });

  it("覆盖 CloudBase 场景高频依赖产品（含扩表前调不通的 ssl / dnspod / domain / cls）", () => {
    expect([...ALLOWED_SERVICES]).toEqual(
      expect.arrayContaining([
        "tcb",
        "tcbr",
        "scf",
        "sts",
        "cam",
        "cdn",
        "vpc",
        "monitor",
        "postgres",
        "ssl",
        "dnspod",
        "domain",
        "cls",
        "redis",
        "cdb",
        "cvm",
        "tke",
        "ckafka",
        "kms",
        "tcr",
        "hunyuan",
      ]),
    );
  });

  it("白名单维持在「常用扩容」量级：不退回旧的小表，也不退化成官方全量", () => {
    expect(ALLOWED_SERVICES.length).toBeGreaterThanOrEqual(40);
    expect(ALLOWED_SERVICES.length).toBeLessThanOrEqual(80);
  });

  it("不含体系外或近义写法（COS 走独立 XML API；MySQL 的标识是 cdb 不是 mysql）", () => {
    expect(ALLOWED_SERVICES).not.toContain("cos");
    expect(ALLOWED_SERVICES).not.toContain("mysql");
    expect(ALLOWED_SERVICES).not.toContain("dns");
  });

  it("版本号形如 YYYY-MM-DD 且取自官方 SDK 目录", () => {
    for (const versions of Object.values(SERVICE_VERSIONS)) {
      expect(versions.length).toBeGreaterThan(0);
      for (const version of versions) {
        expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
    expect(SERVICE_VERSIONS.ssl).toEqual(["2019-12-05"]);
    expect(SERVICE_VERSIONS.dnspod).toEqual(["2021-03-23"]);
    expect(SERVICE_VERSIONS.domain).toEqual(["2018-08-08"]);
    // 官方 STS 是 2018-08-13；SDK 内置的 2018-04-16 实为 SCF 版本，不能用
    expect(SERVICE_VERSIONS.sts).toEqual(["2018-08-13"]);
  });
});

describe("resolveServiceVersion", () => {
  it("显式传入的 version 永远优先", () => {
    expect(resolveServiceVersion("monitor", "2023-06-16")).toBe("2023-06-16");
    expect(resolveServiceVersion("tcb", "2099-01-01")).toBe("2099-01-01");
  });

  it("单版本产品缺省时自动补齐官方版本", () => {
    expect(resolveServiceVersion("tcb")).toBe("2018-06-08");
    expect(resolveServiceVersion("ssl")).toBe("2019-12-05");
    expect(resolveServiceVersion("postgres")).toBe("2017-03-12");
    // 不会被 SDK 内置的错误默认值带走
    expect(resolveServiceVersion("sts")).toBe("2018-08-13");
  });

  it("多版本产品缺省时报错并列出可选项，不替调用方猜", () => {
    expect(() => resolveServiceVersion("monitor")).toThrow(/2018-07-24/);
    expect(() => resolveServiceVersion("monitor")).toThrow(/2023-06-16/);
    expect(() => resolveServiceVersion("teo")).toThrow(/多个在用的官方 API 版本/);
    expect(() => resolveServiceVersion("tke")).toThrow(/2018-05-25/);
  });

  it("白名单外的 service 直接拒绝并给出命名指引", () => {
    expect(() => resolveServiceVersion("dns")).toThrow(/不在支持列表内/);
    expect(() => resolveServiceVersion("dns")).toThrow(/dnspod/);
    expect(() => resolveServiceVersion("cos")).toThrow(/不在云 API 体系内/);
  });
});

describe("buildCapiErrorMessage", () => {
  it("suggests likely tcb actions for invalid action names", () => {
    const message = buildCapiErrorMessage(
      "tcb",
      "CreatEnv",
      new Error("Action invalid or not found"),
    );

    expect(message).toContain("可能的 tcb Action");
    expect(message).toContain("`CreateEnv`");
  });

  it("shows param hints for known tcb actions", () => {
    const message = buildCapiErrorMessage(
      "tcb",
      "DestroyEnv",
      new Error("parameter `Foo` is not recognized"),
    );

    expect(message).toContain("常见参数键");
    expect(message).toContain("`EnvId`");
    expect(message).toContain("必填参数");
    expect(message).toContain("type DestroyEnvParams =");
    expect(message).toContain("/**");
  });

  it("does not inject tcb action suggestions for non-tcb services", () => {
    const message = buildCapiErrorMessage(
      "scf",
      "CreatEnv",
      new Error("Action invalid or not found"),
    );

    expect(message).not.toContain("可能的 tcb Action");
  });

  it("guides device code / SecretKey on CAM auth failures", () => {
    const message = buildCapiErrorMessage(
      "tcbr",
      "CreateCloudRunEnv",
      new Error("UnauthorizedOperation: [CAM] not authorized to perform: tcbr:CreateCloudRunEnv"),
    );

    expect(message).toMatch(/device code|start_auth/);
    expect(message).toMatch(/SecretId\/SecretKey/);
    expect(message).toMatch(/API Key/);
  });

  it("网络类报错给出重试与 region 指引（service 命名已由白名单拦住）", () => {
    const message = buildCapiErrorMessage(
      "ssl",
      "DescribeCertificates",
      new Error("getaddrinfo ENOTFOUND ssl.tencentcloudapi.com"),
    );

    expect(message).toContain("网络请求异常");
    expect(message).toContain("region");
  });
});

describe("assertTcbCloudRunActionAllowed", () => {
  it("blocks tcb CreateCloudBaseRunResource with tcbr guidance", () => {
    expect(() => assertTcbCloudRunActionAllowed("tcb", "CreateCloudBaseRunResource")).toThrow(
      /已禁用/,
    );
    expect(() => assertTcbCloudRunActionAllowed("tcb", "CreateCloudBaseRunResource")).toThrow(
      /CreateCloudRunEnv/,
    );
    expect(() => assertTcbCloudRunActionAllowed("tcb", "CreateCloudBaseRunResource")).toThrow(
      /tcbr/,
    );
  });

  it("blocks the legacy tcb CloudRun resource family", () => {
    expect(() => assertTcbCloudRunActionAllowed("tcb", "DescribeCloudBaseRunResource")).toThrow(
      /已禁用/,
    );
    expect(() => assertTcbCloudRunActionAllowed("tcb", "DeleteCloudBaseRunResource")).toThrow(
      /已禁用/,
    );
  });

  it("blocks legacy CloudRun resource actions case-insensitively", () => {
    expect(() => assertTcbCloudRunActionAllowed("tcb", "createcloudbaserunresource")).toThrow(
      /已禁用/,
    );
    expect(() => assertTcbCloudRunActionAllowed("tcb", "CREATECLOUDBASERUNRESOURCE")).toThrow(
      /已禁用/,
    );
  });

  it("does not block non-cloudrun tcb actions such as DescribeCloudBaseBuildService", () => {
    expect(() =>
      assertTcbCloudRunActionAllowed("tcb", "DescribeCloudBaseBuildService"),
    ).not.toThrow();
    expect(() => assertTcbCloudRunActionAllowed("tcb", "CreateEnv")).not.toThrow();
  });

  it("does not block tcbr actions or non-tcb services", () => {
    expect(() =>
      assertTcbCloudRunActionAllowed("tcbr", "CreateCloudRunServer"),
    ).not.toThrow();
    expect(() =>
      assertTcbCloudRunActionAllowed("scf", "CreateCloudBaseRunResource"),
    ).not.toThrow();
  });
});

describe("resolveCloudApiRegionAndParams", () => {
  it("prefers top-level region and strips params.Region", () => {
    expect(
      resolveCloudApiRegionAndParams({
        region: "ap-singapore",
        params: { EnvId: "env-xxx", Region: "ap-shanghai" },
      }),
    ).toEqual({
      region: "ap-singapore",
      params: { EnvId: "env-xxx" },
    });
  });

  it("promotes params.Region when top-level region is omitted", () => {
    expect(
      resolveCloudApiRegionAndParams({
        params: { Region: "ap-singapore" },
      }),
    ).toEqual({
      region: "ap-singapore",
      params: {},
    });
  });
});

describe("buildCapiErrorMessage region", () => {
  it("guides callers to top-level region when Region is not recognized", () => {
    const message = buildCapiErrorMessage(
      "tcb",
      "DescribeEnvs",
      new Error("The parameter Region is not recognized"),
    );
    expect(message).toContain("顶层参数 region");
    expect(message).toContain("X-TC-Region");
  });
});

describe("removeEmptyStringParams", () => {
  it("should remove empty string parameters", () => {
    const params = {
      EnvId: "env-xxx",
      StartTime: "",
      EndTime: "",
      FunctionName: "test-function",
      Limit: 10,
    };

    const cleaned = removeEmptyStringParams(params);

    expect(cleaned).toEqual({
      EnvId: "env-xxx",
      FunctionName: "test-function",
      Limit: 10,
    });
    expect(cleaned).not.toHaveProperty("StartTime");
    expect(cleaned).not.toHaveProperty("EndTime");
  });

  it("should keep non-empty string parameters", () => {
    const params = {
      EnvId: "env-xxx",
      StartTime: "2024-01-01 00:00:00",
      EndTime: "2024-01-01 23:59:59",
      FunctionName: "test-function",
      Limit: 10,
    };

    const cleaned = removeEmptyStringParams(params);

    expect(cleaned).toEqual(params);
  });

  it("should handle empty object", () => {
    const params = {};
    const cleaned = removeEmptyStringParams(params);
    expect(cleaned).toEqual({});
  });

  it("should handle all empty strings", () => {
    const params = {
      StartTime: "",
      EndTime: "",
    };
    const cleaned = removeEmptyStringParams(params);
    expect(cleaned).toEqual({});
  });

  it("should keep zero and false values", () => {
    const params = {
      Limit: 0,
      Offset: 0,
      Enable: false,
    };
    const cleaned = removeEmptyStringParams(params);
    expect(cleaned).toEqual(params);
  });
});
