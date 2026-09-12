import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadProjectConfig } = vi.hoisted(() => ({
  mockReadProjectConfig: vi.fn(),
}));

// resolveInstanceLang 在「无显式参数 + 无 TCB_LANG」时会真实读 .cloudbase/project.json
// （readProjectConfig 默认从 process.cwd() 逐级向上找）。测试进程的 cwd 取决于 vitest 从哪里被调用，
// 仓库里是否恰好存在该文件不受测试控制，会让「默认 zh」这条用例时好时坏。
// 这里把文件系统读取隔离掉，只验证解析链本身。
vi.mock("../utils/project-config.js", () => ({
  readProjectConfig: mockReadProjectConfig,
}));

import type { MessageKey } from "./locales/zh.js";
import {
  getInstanceLang,
  isMessageKey,
  normalizeLang,
  resolveInstanceLang,
  setInstanceLang,
  t,
} from "./index.js";

/**
 * 绕过编译期 key 存在性检查：MessageKey 由 zh 词典树推导，
 * 只用于「运行时缺 key 兜底」这类用例。string -> MessageKey 是收窄断言，不需要 any。
 */
function runtimeKey(key: string): MessageKey {
  return key as MessageKey;
}

describe("normalizeLang", () => {
  it("should accept the canonical codes", () => {
    expect(normalizeLang("zh")).toBe("zh");
    expect(normalizeLang("en")).toBe("en");
  });

  it("should be case insensitive and trim whitespace", () => {
    expect(normalizeLang("ZH")).toBe("zh");
    expect(normalizeLang("EN")).toBe("en");
    expect(normalizeLang("  en  ")).toBe("en");
  });

  it("should accept region and separator variants", () => {
    expect(normalizeLang("en-US")).toBe("en");
    expect(normalizeLang("en_US")).toBe("en");
    expect(normalizeLang("enus")).toBe("en");
    expect(normalizeLang("zh-CN")).toBe("zh");
    expect(normalizeLang("zh_CN")).toBe("zh");
    expect(normalizeLang("zhcn")).toBe("zh");
  });

  it("should accept the cn alias", () => {
    expect(normalizeLang("cn")).toBe("zh");
  });

  it("should return undefined for unknown or non-string input", () => {
    expect(normalizeLang(undefined)).toBeUndefined();
    expect(normalizeLang(null)).toBeUndefined();
    expect(normalizeLang(123)).toBeUndefined();
    expect(normalizeLang("")).toBeUndefined();
    expect(normalizeLang("fr")).toBeUndefined();
    expect(normalizeLang({})).toBeUndefined();
  });
});

describe("resolveInstanceLang priority chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TCB_LANG;
    mockReadProjectConfig.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should default to zh with no configuration", () => {
    expect(resolveInstanceLang()).toBe("zh");
  });

  it("should prefer the explicit argument over TCB_LANG", () => {
    vi.stubEnv("TCB_LANG", "en");
    expect(resolveInstanceLang("zh")).toBe("zh");
    expect(resolveInstanceLang("ZH")).toBe("zh");
  });

  it("should read TCB_LANG when no explicit argument is given", () => {
    vi.stubEnv("TCB_LANG", "en");
    expect(resolveInstanceLang()).toBe("en");
  });

  it("should fall back to project config lang when env is absent", () => {
    mockReadProjectConfig.mockReturnValue({ lang: "en" });
    expect(resolveInstanceLang()).toBe("en");
  });

  it("should let TCB_LANG override project config lang", () => {
    mockReadProjectConfig.mockReturnValue({ lang: "en" });
    vi.stubEnv("TCB_LANG", "zh");
    expect(resolveInstanceLang()).toBe("zh");
  });

  it("should keep walking the chain when the explicit argument is invalid", () => {
    vi.stubEnv("TCB_LANG", "en");
    expect(resolveInstanceLang("fr")).toBe("en");
    expect(resolveInstanceLang(42)).toBe("en");
  });

  it("should ignore unparsable project config lang", () => {
    mockReadProjectConfig.mockReturnValue({ lang: "klingon" });
    expect(resolveInstanceLang()).toBe("zh");
  });
});

describe("t() interpolation and fallback", () => {
  beforeEach(() => {
    setInstanceLang("zh");
  });

  afterEach(() => {
    setInstanceLang("zh");
  });

  it("should substitute a single placeholder", () => {
    expect(t("storage.urlSuccess", { path: "/a/b.png" })).toBe(
      "成功为 '/a/b.png' 生成临时下载链接",
    );
  });

  it("should substitute multiple placeholders by name, not by position", () => {
    const forward = t("storage.listSuccess", { path: "/images", count: 3 });
    const reversed = t("storage.listSuccess", { count: 3, path: "/images" });

    expect(forward).toBe("成功列出目录 '/images' 下的 3 个文件");
    expect(reversed).toBe(forward);
  });

  it("should leave placeholders without a matching param untouched", () => {
    expect(t("storage.listSuccess", { path: "/images" })).toBe(
      "成功列出目录 '/images' 下的 {count} 个文件",
    );
  });

  it("should return the raw template when no params are provided", () => {
    expect(t("storage.urlSuccess")).toBe("成功为 '{path}' 生成临时下载链接");
  });

  it("should return the key itself when the key is missing", () => {
    expect(t(runtimeKey("storage.definitelyNotAKey"))).toBe("storage.definitelyNotAKey");
    expect(t(runtimeKey("nonexistent.key"))).toBe("nonexistent.key");
    expect(t(runtimeKey("noDotSeparator"))).toBe("noDotSeparator");
  });
});

describe("t() language switching", () => {
  afterEach(() => {
    setInstanceLang("zh");
  });

  it("should return zh copy for langOverride zh and en copy for en", () => {
    expect(t("storage.queryTitle", undefined, "zh")).toBe("查询 CloudBase 存储信息");
    expect(t("storage.queryTitle", undefined, "en")).toBe("Query CloudBase storage info");
  });

  it("should resolve the same key to different copy per language", () => {
    const zh = t("storage.queryTitle", undefined, "zh");
    const en = t("storage.queryTitle", undefined, "en");

    expect(zh).not.toBe(en);
  });

  it("should interpolate into the selected language dictionary", () => {
    expect(t("storage.listSuccess", { path: "/images", count: 2 }, "en")).toBe(
      "Successfully listed 2 files in directory '/images'",
    );
  });

  it("should fall back to the instance language when no override is given", () => {
    setInstanceLang("en");
    expect(t("storage.queryTitle")).toBe("Query CloudBase storage info");
    expect(getInstanceLang()).toBe("en");

    setInstanceLang("zh");
    expect(t("storage.queryTitle")).toBe("查询 CloudBase 存储信息");
    expect(getInstanceLang()).toBe("zh");
  });
});

describe("isMessageKey", () => {
  it("should recognize existing dictionary keys", () => {
    expect(isMessageKey("storage.queryTitle")).toBe(true);
    expect(isMessageKey("storage.listSuccess")).toBe(true);
  });

  it("should reject unknown keys and non-string values", () => {
    expect(isMessageKey("storage.notAKey")).toBe(false);
    expect(isMessageKey("nonexistent.key")).toBe(false);
    expect(isMessageKey("noDotSeparator")).toBe(false);
    expect(isMessageKey(undefined)).toBe(false);
    expect(isMessageKey(123)).toBe(false);
  });
});
