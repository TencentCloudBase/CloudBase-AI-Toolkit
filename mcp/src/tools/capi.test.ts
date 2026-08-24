import { describe, expect, it } from "vitest";
import {
  assertTcbCloudRunActionAllowed,
  buildCapiErrorMessage,
  removeEmptyStringParams,
  resolveCloudApiRegionAndParams,
} from "./capi.js";

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
