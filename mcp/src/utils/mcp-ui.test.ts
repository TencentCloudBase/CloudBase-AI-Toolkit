import { describe, expect, it } from "vitest";
import { isMcpUiEnabled, mcpUiMeta } from "./mcp-ui.js";

describe("实验性开关 CLOUDBASE_MCP_UI（默认关闭）", () => {
  it("默认关：没设置、空串、拼错的值都不开", () => {
    expect(isMcpUiEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: "" } as NodeJS.ProcessEnv)).toBe(false);
    // 拼错的值按关闭处理：实验期宁可少开
    expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: "of" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: "off" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("显式打开：on / 1 / true / yes / enabled（大小写与空格不敏感）", () => {
    for (const value of ["on", "1", "true", "yes", "enabled", " ON ", "True"]) {
      expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: value } as NodeJS.ProcessEnv)).toBe(true);
    }
  });

  it("关着时连 _meta 字段都不出现，打开才挂", () => {
    const previous = process.env.CLOUDBASE_MCP_UI;
    try {
      delete process.env.CLOUDBASE_MCP_UI;
      // 空对象：调用点用展开语法，不需要每处写 if
      expect(mcpUiMeta("ui://cloudbase/get-started")).toEqual({});

      process.env.CLOUDBASE_MCP_UI = "on";
      expect(mcpUiMeta("ui://cloudbase/get-started")).toEqual({
        _meta: { ui: { resourceUri: "ui://cloudbase/get-started" } },
      });
    } finally {
      if (previous === undefined) {
        delete process.env.CLOUDBASE_MCP_UI;
      } else {
        process.env.CLOUDBASE_MCP_UI = previous;
      }
    }
  });
});
