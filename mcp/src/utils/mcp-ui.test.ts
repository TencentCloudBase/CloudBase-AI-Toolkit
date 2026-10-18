import { describe, expect, it } from "vitest";
import { isMcpUiEnabled, mcpUiMeta } from "./mcp-ui.js";

describe("MCP Apps 总开关 CLOUDBASE_MCP_UI", () => {
  it("默认开：没设置、空串、明确开启都算开", () => {
    expect(isMcpUiEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: "" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: "on" } as NodeJS.ProcessEnv)).toBe(true);
    // 拼错的值按开处理：宁可留着面板，也别让一个错字把 UI 全关掉
    expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: "of" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("关：off / 0 / false / no / disabled（大小写与空格不敏感）", () => {
    for (const value of ["off", "0", "false", "no", "disabled", " OFF ", "False"]) {
      expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: value } as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it("开着挂 _meta.ui，关掉连字段都不出现", () => {
    const on = mcpUiMeta("ui://cloudbase/get-started");
    expect(on).toEqual({ _meta: { ui: { resourceUri: "ui://cloudbase/get-started" } } });

    const previous = process.env.CLOUDBASE_MCP_UI;
    process.env.CLOUDBASE_MCP_UI = "off";
    try {
      // 空对象：调用点用展开语法，不需要每处写 if
      expect(mcpUiMeta("ui://cloudbase/get-started")).toEqual({});
    } finally {
      if (previous === undefined) {
        delete process.env.CLOUDBASE_MCP_UI;
      } else {
        process.env.CLOUDBASE_MCP_UI = previous;
      }
    }
  });
});
