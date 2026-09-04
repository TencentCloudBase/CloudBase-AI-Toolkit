import { describe, expect, it } from "vitest";
import {
  enhanceErrorMessage,
  findErrorGuidance,
  resolveErrorCode,
  resolveRequestId,
} from "./error-guidance.js";

// issue #994 的真实报错形态：SDK CloudBaseError 的 message 为 `[${action}] ${Message}`，
// 结构化错误码挂在 error.code 上（云 API Response.Error.Code）。
// 注意：客户端拿到的 Message 里没有 OutOfWriteRequestQuota 子码，那是后端日志里的形态。
const WRITE_OVERRUN_MESSAGE =
  "[PutItem] Write request overrun. Please improve write specifications, but if the problem cannot be solved, contact us.";

function apiError(message: string, fields: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), fields);
}

describe("error-guidance", () => {
  describe("findErrorGuidance", () => {
    it("never guesses from the Message alone", () => {
      // 关键回归：Message 是云 API 声明「可能随时变更、不应依赖」的字段。
      // 仅有英文文案、没有结构化 Code 时不得触发任何指引。
      expect(findErrorGuidance(apiError(WRITE_OVERRUN_MESSAGE))).toBeNull();
      expect(findErrorGuidance(apiError(WRITE_OVERRUN_MESSAGE, { code: "" }))).toBeNull();
    });

    it("matches the structured Code", () => {
      const guidance = findErrorGuidance(
        apiError(WRITE_OVERRUN_MESSAGE, { code: "EXCEED_REQUEST_LIMIT" }),
      );
      expect(guidance).not.toBeNull();
      expect(guidance?.docsUrl).toContain("EXCEED_REQUEST_LIMIT");
    });

    it("degrades to the generic entry instead of passing raw English through", () => {
      // Message 文案变更导致细分正则失配时的降级路径：结论仍然正确，只是不那么具体。
      const guidance = findErrorGuidance(
        apiError("Some brand new wording", { code: "EXCEED_REQUEST_LIMIT" }),
      );
      expect(guidance).not.toBeNull();
      expect(guidance?.summary).not.toContain("数据库写入配额");
      expect(guidance?.docsUrl).toContain("EXCEED_REQUEST_LIMIT");
    });

    it("does not mislabel read-quota as write-quota", () => {
      const guidance = findErrorGuidance(
        apiError("Read request overrun", { code: "EXCEED_REQUEST_LIMIT" }),
      );
      expect(guidance?.summary).not.toContain("数据库写入配额");
    });

    it("reads the Code from SDK/legacy mount points", () => {
      expect(resolveErrorCode({ code: "A.B" })).toBe("A.B");
      expect(resolveErrorCode({ Code: "A.B" })).toBe("A.B");
      expect(resolveErrorCode({ Response: { Error: { Code: "A.B" } } })).toBe("A.B");
      expect(resolveErrorCode(new Error("no code"))).toBeUndefined();
    });
  });

  describe("enhanceErrorMessage", () => {
    it("appends guidance and the official docs link when matched", () => {
      const enhanced = enhanceErrorMessage(
        apiError(WRITE_OVERRUN_MESSAGE, { code: "EXCEED_REQUEST_LIMIT" }),
        WRITE_OVERRUN_MESSAGE,
      );

      expect(enhanced).toContain(WRITE_OVERRUN_MESSAGE);
      expect(enhanced).toContain("与单次写入的文档条数、文档大小无关");
      expect(enhanced).toContain("https://docs.cloudbase.net/error-code/EXCEED_REQUEST_LIMIT");
    });

    it("links to the dedicated error-code page, not the generic basic page", () => {
      // 实测：/error-code/basic/<CODE> 会退回 basic 通用页（只泛泛提及该码），
      // /error-code/<CODE> 才是专属页（同一错误码出现次数 17 vs 4）。
      const enhanced = enhanceErrorMessage(
        apiError(WRITE_OVERRUN_MESSAGE, { code: "EXCEED_REQUEST_LIMIT" }),
        WRITE_OVERRUN_MESSAGE,
      );
      expect(enhanced).not.toContain("/error-code/basic/");
    });

    it("keeps the Code in the output so error-code troubleshooting can hit the docs", () => {
      // #991 的错误码排障协议要求消息里含 `Category.Code`，否则 agent 无法检索官方文档。
      const enhanced = enhanceErrorMessage(
        apiError(WRITE_OVERRUN_MESSAGE, { code: "EXCEED_REQUEST_LIMIT" }),
        WRITE_OVERRUN_MESSAGE,
      );
      expect(enhanced).toMatch(/EXCEED_REQUEST_LIMIT/);
    });

    it("does not hardcode plan-specific numbers", () => {
      // 阈值随套餐变化，指引正文不得写死某个环境查到的数字。
      const enhanced = enhanceErrorMessage(
        apiError(WRITE_OVERRUN_MESSAGE, { code: "EXCEED_REQUEST_LIMIT" }),
        WRITE_OVERRUN_MESSAGE,
      );
      expect(enhanced).not.toMatch(/30,000|30000/);
    });

    it("passes unrelated errors through untouched", () => {
      const error = apiError("[PutItem] Collection does not exist", {
        code: "ResourceNotFound.Collection",
      });
      expect(enhanceErrorMessage(error, error.message)).toBe(error.message);
    });
  });

  describe("resolveRequestId", () => {
    it("normalizes the mount points used by SDK and requestFn paths", () => {
      expect(resolveRequestId({ requestId: "r1" })).toBe("r1");
      expect(resolveRequestId({ RequestId: "r2" })).toBe("r2");
      expect(resolveRequestId({ requestID: "r3" })).toBe("r3");
      expect(resolveRequestId({ Response: { RequestId: "r4" } })).toBe("r4");
      expect(resolveRequestId(new Error("no id"))).toBe("");
    });
  });
});
