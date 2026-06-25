import { describe, expect, it } from "vitest";
import { buildCapiErrorMessage, removeEmptyStringParams } from "./capi.js";

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
