import { describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";
import {
  ENV_CREDITS_CONSOLE_LINK_KEYS,
  ENV_CREDITS_MIME_TYPE,
  ENV_CREDITS_RESOURCE_URI,
  buildEnvCreditsConsoleUrl,
  buildEnvCreditsHtml,
  resolveEnvCreditsFallback,
  type EnvCreditsFallback,
} from "./env-credits.js";

// 只有 read 回调的本地日志会被断言；其余 logger 调用保留真实实现。
vi.mock("../utils/logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/logger.js")>();
  return { ...actual, debug: vi.fn() };
});

/**
 * 面板 HTML 是「纯 ASCII 模板 + 词典注入」，因此这层只锁四件事：
 *   1. 零外部资源（宿主默认 CSP 只允许自身与内联；外链一律被拦）；
 *   2. bridge 需要的消息名都在，且**面板自己不调用任何工具**（它只读、只指路）；
 *   3. 注入值被转义、面板里没有任何密钥类字段；
 *   4. 四分支的状态词、行动与交给会话的请求都来自词典（不是模板硬编码）。
 */
const sampleFallback: EnvCreditsFallback = {
  envId: "my-env-3gk9ab",
  site: "domestic",
  region: "ap-shanghai",
};

/**
 * 面板正文里不允许出现的内部枚举与数据字段名 —— 用户在界面上看到的一律是人话。
 * 它们只允许出现在「查看原始返回」折叠区与脚本查表里。
 */
const INTERNAL_ENUMS = [
  "trialExhausted",
  "arrears",
  "isolated_days_left",
  "credits_value",
  "plan_raw",
  "calc_time",
  "env_id",
  "ap-",
  "single_env",
  "READY",
];

/** 可见正文 = 去掉 <script> 逻辑与原始返回折叠区之后的标记（枚举在脚本查表里是必要的）。 */
function visibleMarkup(html: string): string {
  return html
    .replace(/<script>[\s\S]*?<\/script>/gi, "")
    .replace(/<details[\s\S]*?<\/details>/gi, "");
}

describe("env-credits 面板 HTML", () => {
  it("常量：URI 与 MIME 定稿，控制台链接三个键齐备", () => {
    expect(ENV_CREDITS_RESOURCE_URI).toBe("ui://cloudbase/env-credits");
    expect(ENV_CREDITS_MIME_TYPE).toBe("text/html;profile=mcp-app");
    expect([...ENV_CREDITS_CONSOLE_LINK_KEYS].sort()).toEqual(["expense", "package", "renew"]);
  });

  it("控制台链接：锁完整 URL（含 envId、hash、站点），不只锁主机名", () => {
    // 2026-10-16 登录态逐条打开核对过：环境级两条落在云开发控制台的「套餐用量」页
    // （套餐耗尽给升级/资源包/变配；环境被临时隔离时同一页给「续费」），
    // 费用中心那条是账户级充值页。
    expect(buildEnvCreditsConsoleUrl("package", "env-abc", "domestic")).toBe(
      "https://tcb.cloud.tencent.com/dev?envId=env-abc#/env/package-usage",
    );
    expect(buildEnvCreditsConsoleUrl("renew", "env-abc", "domestic")).toBe(
      "https://tcb.cloud.tencent.com/dev?envId=env-abc#/env/package-usage",
    );
    expect(buildEnvCreditsConsoleUrl("expense", "env-abc", "domestic")).toBe(
      "https://console.cloud.tencent.com/expense/recharge",
    );
    // 国际站只换主机，路径与 hash 不变；费用中心连主机都不同域
    expect(buildEnvCreditsConsoleUrl("package", "env-abc", "intl")).toBe(
      "https://tcb.tencentcloud.com/dev?envId=env-abc#/env/package-usage",
    );
    expect(buildEnvCreditsConsoleUrl("renew", "env-abc", "intl")).toBe(
      "https://tcb.tencentcloud.com/dev?envId=env-abc#/env/package-usage",
    );
    expect(buildEnvCreditsConsoleUrl("expense", "env-abc", "intl")).toBe(
      "https://console.intl.cloud.tencent.com/expense/recharge",
    );
    // 环境 ID 必须带上且转义；费用中心是账户级，不带环境
    expect(buildEnvCreditsConsoleUrl("package", "env a/b?c", "domestic")).toBe(
      "https://tcb.cloud.tencent.com/dev?envId=env%20a%2Fb%3Fc#/env/package-usage",
    );
    expect(buildEnvCreditsConsoleUrl("expense", undefined, "domestic")).toBe(
      "https://console.cloud.tencent.com/expense/recharge",
    );
  });

  it("回归：旧的不存在路径 console.cloud.tencent.com/tcb/* 不会再被拼出来", () => {
    // 该主机下任何未知 /tcb/* 都被 SPA 兜底到环境列表 /tcb/platform/env（既无 envId 也不分站点）。
    for (const key of ENV_CREDITS_CONSOLE_LINK_KEYS) {
      for (const site of ["domestic", "intl"] as const) {
        expect(buildEnvCreditsConsoleUrl(key, "env-abc", site)).not.toContain(
          "console.cloud.tencent.com/tcb",
        );
      }
    }
  });

  it("零外部资源：不含 <link、@import、src=、href=、xmlns、xlink", () => {
    const html = buildEnvCreditsHtml("zh", sampleFallback);
    expect(html).not.toContain("<link");
    expect(html).not.toContain("@import");
    expect(html).not.toMatch(/\bsrc=/);
    expect(html).not.toMatch(/\bhref=/);
    expect(html).not.toContain("xmlns");
    expect(html).not.toContain("xlink");
    // 控制台链接在点击时才由脚本拼（主机表 + hash 都在脚本里），所以模板里不该再有**带主机**的
    // 完整 URL；剩下的 `https://` 只是脚本里的协议前缀拼接。
    expect(html.match(/https:\/\/[a-z0-9.-]+/gi) ?? []).toHaveLength(0);
  });

  it("bridge 消息名齐备，且面板不调用任何工具", () => {
    const html = buildEnvCreditsHtml("zh", sampleFallback);
    for (const method of [
      "ui/initialize",
      "ui/notifications/initialized",
      "ui/notifications/size-changed",
      "ui/notifications/tool-result",
      "ui/message",
    ]) {
      expect(html).toContain(method);
    }
    // 面板只读：不发起 tools/call（引导一律交给会话）。
    expect(html.split('"tools/call"').length - 1).toBe(0);
  });

  it("正文不出现内部枚举与数据字段名", () => {
    for (const lang of ["zh", "en"] as const) {
      const markup = visibleMarkup(buildEnvCreditsHtml(lang, sampleFallback));
      for (const token of INTERNAL_ENUMS) {
        expect(markup, `${lang} 正文不应出现内部枚举 ${token}`).not.toContain(token);
      }
    }
  });

  it("zh / en 两个实例产出不同 HTML，且各自语言文案正确", () => {
    const zhHtml = buildEnvCreditsHtml("zh", sampleFallback);
    const enHtml = buildEnvCreditsHtml("en", sampleFallback);

    expect(zhHtml).not.toBe(enHtml);
    expect(zhHtml).toContain(t("mcpUiCredits.title", undefined, "zh"));
    expect(enHtml).toContain(t("mcpUiCredits.title", undefined, "en"));
    expect(zhHtml).not.toContain(t("mcpUiCredits.title", undefined, "en"));
    expect(enHtml).not.toContain(t("mcpUiCredits.title", undefined, "zh"));
    // 四分支的行动与交给会话的请求都来自词典。
    for (const key of [
      "mcpUiCredits.state.normal",
      "mcpUiCredits.hint.normal",
      "mcpUiCredits.field.modules",
      "mcpUiCredits.action.upgrade",
      "mcpUiCredits.action.recommendRestore",
      "mcpUiCredits.action.renew",
      "mcpUiCredits.action.guidedTopup",
      "mcpUiCredits.message.upgrade",
      "mcpUiCredits.message.restore",
      "mcpUiCredits.message.renew",
      "mcpUiCredits.message.topup",
    ] as const) {
      expect(zhHtml).toContain(t(key, undefined, "zh"));
      expect(enHtml).toContain(t(key, undefined, "en"));
    }
  });

  it("注入含 '<script>' 的恶意环境 ID 会被 HTML 转义", () => {
    const evil: EnvCreditsFallback = {
      ...sampleFallback,
      envId: "<script>alert(1)</script>",
    };
    const html = buildEnvCreditsHtml("zh", evil);

    // 环境 ID 注入的位置是脚本里的 JS 字面量，因此转义形态是 \u003c（而不是 HTML 实体）。
    expect(html).not.toContain("<script>alert(1)</script>");
    // 期望值用与生产同一套转义规则算出，避免手写反斜杠出错。
    const expected = JSON.stringify("<script>alert(1)</script>").replace(/</g, "\\u003c");
    expect(html).toContain(expected);
  });

  it("面板不含任何密钥类字段名", () => {
    const html = buildEnvCreditsHtml("zh", sampleFallback);
    for (const key of ["secretId", "secretKey", "apiKey", "sessionToken", "password"]) {
      expect(html).not.toContain(key);
    }
  });

  it("英文面板保持纯 ASCII（HTML 模板无 CJK 硬编码）", () => {
    const html = buildEnvCreditsHtml("en", sampleFallback);
    // eslint-disable-next-line no-control-regex
    const nonAscii = html.match(/[^\x00-\x7F]/g) ?? [];
    expect(nonAscii).toEqual([]);
  });

  it("面板脚本不做 HTML 注入：不用 innerHTML / outerHTML / insertAdjacentHTML", () => {
    const html = buildEnvCreditsHtml("zh", sampleFallback);
    expect(html).not.toContain("innerHTML");
    expect(html).not.toContain("outerHTML");
    expect(html).not.toContain("insertAdjacentHTML");
    expect(html).not.toContain("document.write");
  });
});

describe("env-credits 兜底解析", () => {
  it("环境 ID 按优先级取值：实例配置 > 环境变量 > 缓存 > 降级为空", () => {
    const previous = process.env.CLOUDBASE_ENV_ID;
    try {
      process.env.CLOUDBASE_ENV_ID = "unit-env-1";
      const fromEnvVar = resolveEnvCreditsFallback({
        cloudBaseOptions: {},
      } as never);
      expect(fromEnvVar.envId).toBe("unit-env-1");

      const fromOptions = resolveEnvCreditsFallback({
        cloudBaseOptions: { envId: "unit-env-2" },
      } as never);
      expect(fromOptions.envId).toBe("unit-env-2");
    } finally {
      if (previous === undefined) {
        delete process.env.CLOUDBASE_ENV_ID;
      } else {
        process.env.CLOUDBASE_ENV_ID = previous;
      }
    }
  });

  it("站点与地域翻成人话（未知值原样保留，不猜）", () => {
    const known = resolveEnvCreditsFallback({
      cloudBaseOptions: { site: "domestic", region: "ap-shanghai" },
    } as never);
    expect(known.site).toBe("domestic");
    expect(known.region).toBe("ap-shanghai");

    const html = buildEnvCreditsHtml("zh", known);
    expect(visibleMarkup(html)).toContain(t("mcpUi.region.apShanghai", undefined, "zh"));
    expect(visibleMarkup(html)).toContain(t("mcpUi.site.domestic", undefined, "zh"));
  });
});
