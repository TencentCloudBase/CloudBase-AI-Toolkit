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
