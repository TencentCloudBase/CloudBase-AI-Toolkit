import { describe, expect, it } from "vitest";
import {
  containsInternalCode,
  formatUsageItem,
  mapRegion,
  mapUsageModule,
  scrubInternalCodes,
} from "../src/server/term-map.js";

describe("term-map", () => {
  it("maps internal usage modules to product names", () => {
    expect(mapUsageModule("FLEXDB")).toBe("文档型数据库");
    expect(mapUsageModule("SCF")).toBe("云函数");
    expect(mapUsageModule("TDSQL")).toBe("数据库");
    // PostgreSQL / Token 是 2026-11 补上的两个模块码，缺映射会让面板直接显示原始码
    expect(mapUsageModule("PostgreSQL")).toBe("PostgreSQL 数据库");
    expect(mapUsageModule("Token")).toBe("AI Token");
    // 与用量清单同步补齐的六项：缺映射同样会露出原始码
    expect(mapUsageModule("Gateway")).toBe("环境调用");
    expect(mapUsageModule("CLS")).toBe("日志");
    expect(mapUsageModule("CI")).toBe("数据万象");
    expect(mapUsageModule("STORAGE_EO")).toBe("边缘存储");
    expect(mapUsageModule("CBF")).toBe("云函数");
  });

  it("maps regions without exposing a bare Region field", () => {
    expect(mapRegion("ap-shanghai")).toBe("上海（ap-shanghai）");
  });

  it("scrubs internal codes from free text", () => {
    expect(scrubInternalCodes("SCF used 38 MB")).toBe("云函数 used 38 MB");
    expect(formatUsageItem("FLEXDB", "1.2 GB", "5 GB")).toEqual({
      productName: "文档型数据库",
      usedLabel: "1.2 GB / 5 GB",
    });
    expect(containsInternalCode("FLEXDB")).toBe(true);
    expect(containsInternalCode("FLEXDB")).toBe(true);
    expect(containsInternalCode("文档型数据库")).toBe(false);
  });
});
