import { describe, expect, it } from "vitest";
import { isMcpUiEnabled, mcpUiMeta } from "./mcp-ui.js";

describe("CLOUDBASE_MCP_UI 开关（默认开启，保留显式关闭）", () => {
  it("默认开：没设置、空串都算开", () => {
    expect(isMcpUiEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: "" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: "   " } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("显式关闭：off / 0 / false / no / disabled 仍是关", () => {
    for (const value of ["off", "0", "false", "no", "disabled", " OFF ", "False"]) {
      expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: value } as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it("拼错的值仍是关——不能因为一个错字把开关打开", () => {
    // 这条是「白名单放行」与「黑名单拦截」的分界线。
    // 若把默认开写成 `!["off","0",...].includes(raw)`，`of` 会被判成开。
    for (const value of ["of", "ofr", "onn", "ture", "1 1"]) {
      expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: value } as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it("显式打开：on / 1 / true / yes / enabled（大小写与空格不敏感）", () => {
    for (const value of ["on", "1", "true", "yes", "enabled", " ON ", "True"]) {
      expect(isMcpUiEnabled({ CLOUDBASE_MCP_UI: value } as NodeJS.ProcessEnv)).toBe(true);
    }
  });

  it("关闭时连 _meta 字段都不出现，打开才挂", () => {
    const previous = process.env.CLOUDBASE_MCP_UI;
    try {
      process.env.CLOUDBASE_MCP_UI = "off";
      // 空对象：调用点用展开语法，不需要每处写 if
      expect(mcpUiMeta("ui://cloudbase/get-started")).toEqual({});

      process.env.CLOUDBASE_MCP_UI = "on";
      expect(mcpUiMeta("ui://cloudbase/get-started")).toEqual({
        _meta: { ui: { resourceUri: "ui://cloudbase/get-started" } },
      });

      // 未设置即默认开，同样要挂上
      delete process.env.CLOUDBASE_MCP_UI;
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
