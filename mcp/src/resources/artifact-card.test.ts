import { describe, expect, it } from "vitest";
import { mcpUi } from "../i18n/locales/modules/mcpUi.js";
import { mcpUiArtifact } from "../i18n/locales/modules/mcpUiArtifact.js";
import { mcpUiCredits } from "../i18n/locales/modules/mcpUiCredits.js";
import type { ArtifactKind, ArtifactState } from "../tools/artifact-card-payload.js";
import type { PlanCode } from "./env-credits.js";
import { ARTIFACT_CARD_MIME_TYPE, ARTIFACT_CARD_RESOURCE_URI, buildArtifactCardHtml } from "./artifact-card.js";

/**
 * 静态面：面板 HTML 是「纯 ASCII 模板 + 词典注入」，所以这层只锁模板本身的纪律
 * （零外链 / 无注入 API / 英文纯 ASCII / 正文零内部枚举 / 不留 tools/call），
 * 以及**枚举 ↔ 词典标签**这类跨文件不对称（运行时的渲染行为在 render 测试里验）。
 */
const sampleFallback = { envId: "env-abc123", site: "domestic", region: "ap-shanghai" };

/** 可见正文 = 去掉 <script> 逻辑与「查看原始返回」折叠区之后的标记。 */
function visibleMarkup(html: string): string {
  return html
    .replace(/<script>[\s\S]*?<\/script>/gi, "")
    .replace(/<details[\s\S]*?<\/details>/gi, "");
}

/** 内部枚举 / 字段名 / 工具名：只允许出现在脚本查表与折叠区里。 */
const INTERNAL_TOKENS = [
  "domestic",
  "intl",
  "ap-",
  "deploying",
  "published",
  "unknown",
  "internalDomain",
  "staticDomain",
  "describeAppInfo",
  "baas_",
  "access_url",
  "artifact_kind",
  "manageHosting",
  "manageApps",
  "manageCloudRun",
  "ui/",
];

const STATE_KEYS: ArtifactState[] = ["deploying", "published", "failed", "unknown"];
const KIND_KEYS: ArtifactKind[] = ["hosting", "apps", "cloudrun"];
const PLAN_KEYS: PlanCode[] = ["trial", "personal", "standard", "enterprise", "enterpriseAdvanced"];

describe("artifact-card 面板 HTML（静态面）", () => {
  it("零外链：不含 http(s)、<link、xmlns、以及任何外部 src=/href=", () => {
    const html = buildArtifactCardHtml("zh", sampleFallback);

    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
    expect(html).not.toContain('src="//');
    expect(html).not.toContain("<link");
    expect(html).not.toContain("xmlns");
    expect(html).not.toMatch(/\bsrc=/);
    expect(html).not.toMatch(/\bhref=/);
  });

  it("不做 HTML 注入：不用 innerHTML / outerHTML / insertAdjacentHTML / document.write", () => {
    const html = buildArtifactCardHtml("zh", sampleFallback);

    expect(html).not.toContain("innerHTML");
    expect(html).not.toContain("outerHTML");
    expect(html).not.toContain("insertAdjacentHTML");
    expect(html).not.toContain("document.write");
  });

  it("英文面板保持纯 ASCII（模板无 CJK 硬编码）", () => {
    const html = buildArtifactCardHtml("en", sampleFallback);

    // eslint-disable-next-line no-control-regex
    const nonAscii = html.match(/[^\x00-\x7F]/g) ?? [];
    expect(nonAscii).toEqual([]);
  });

  it("正文不出现内部枚举 / 字段名 / 工具名（只允许在脚本与折叠区里）", () => {
    for (const lang of ["zh", "en"] as const) {
      const markup = visibleMarkup(buildArtifactCardHtml(lang, sampleFallback));
      for (const token of INTERNAL_TOKENS) {
        expect(markup, `${lang} 正文不应出现 ${token}`).not.toContain(token);
      }
    }
  });

  it("不含任何密钥类字段名", () => {
    const html = buildArtifactCardHtml("zh", sampleFallback);

    for (const secretKey of ["secretId", "secretKey", "apiKey", "accessKey", "token"]) {
      expect(html).not.toContain(secretKey);
    }
  });

  it("bridge 消息名齐，且面板自身一个 tools/call 都没有（写意图一律走 ui/message）", () => {
    const html = buildArtifactCardHtml("en", sampleFallback);

    for (const method of [
      "ui/initialize",
      "ui/notifications/initialized",
      "ui/notifications/size-changed",
      "ui/message",
      "ui/notifications/tool-result",
    ]) {
      expect(html).toContain(method);
    }
    expect(html).not.toContain("tools/call");
    expect(html.split('"tools/call"').length - 1).toBe(0);
  });

  it("握手自报的面板名固定（宿主按它识别面板）", () => {
    const html = buildArtifactCardHtml("en", sampleFallback);

    expect(html).toContain('"cloudbase-artifact-card"');
    expect(html).toContain('name: "cloudbase-artifact-card"');
  });

  it("四态文案来自词典（中英各一份，硬编码不了）", () => {
    const zhHtml = buildArtifactCardHtml("zh", sampleFallback);
    const enHtml = buildArtifactCardHtml("en", sampleFallback);

    for (const key of STATE_KEYS) {
      const dictKey = `state.${key}` as keyof typeof mcpUiArtifact.zh;
      expect(zhHtml).toContain(mcpUiArtifact.zh[dictKey]);
      expect(enHtml).toContain(mcpUiArtifact.en[dictKey]);
    }
  });

  it("资源常量与注册名对得上（URI / MIME）", () => {
    expect(ARTIFACT_CARD_RESOURCE_URI).toBe("ui://cloudbase/artifact-card");
    expect(ARTIFACT_CARD_MIME_TYPE).toBe("text/html;profile=mcp-app");
  });
});

describe("枚举 ↔ 词典标签守卫（跨文件不对称的地方没有编译器拦）", () => {
  it("状态枚举的每个值都有 zh/en 标签", () => {
    for (const state of STATE_KEYS) {
      const dictKey = `state.${state}` as keyof typeof mcpUiArtifact.zh;
      expect(mcpUiArtifact.zh[dictKey], `zh 缺 ${dictKey}`).toBeTruthy();
      expect(mcpUiArtifact.en[dictKey], `en 缺 ${dictKey}`).toBeTruthy();
    }
  });

  it("产物类型枚举的每个值都有 zh/en 标签", () => {
    for (const kind of KIND_KEYS) {
      const dictKey = `kind.${kind}` as keyof typeof mcpUiArtifact.zh;
      expect(mcpUiArtifact.zh[dictKey], `zh 缺 ${dictKey}`).toBeTruthy();
      expect(mcpUiArtifact.en[dictKey], `en 缺 ${dictKey}`).toBeTruthy();
    }
  });

  it("面板真的把状态 / 类型标签接进了脚本（否则客户端兜底是空串，那一行静默消失）", () => {
    const html = buildArtifactCardHtml("en", sampleFallback);

    for (const state of STATE_KEYS) {
      expect(html, `客户端 T.state 缺 ${state}`).toContain(`${state}: "`);
    }
    for (const kind of KIND_KEYS) {
      expect(html, `客户端 T.kind 缺 ${kind}`).toContain(`${kind}: "`);
    }
  });

  it("plan 枚举复用 env-credits 的标签，两边都必须齐（跨模块复用不能只改一边）", () => {
    const html = buildArtifactCardHtml("en", sampleFallback);

    for (const plan of PLAN_KEYS) {
      const dictKey = `plan.${plan}` as keyof typeof mcpUiCredits.zh;
      expect(mcpUiCredits.zh[dictKey], `zh 缺 ${dictKey}`).toBeTruthy();
      expect(mcpUiCredits.en[dictKey], `en 缺 ${dictKey}`).toBeTruthy();
      expect(html, `客户端 T.plan 缺 ${plan}`).toContain(`${plan}: "`);
    }
  });

  it("站点 / 地域标签复用入口面板的映射表（三处同一份，复用键必须都在）", () => {
    const html = buildArtifactCardHtml("en", sampleFallback);

    for (const key of ["site.domestic", "site.intl", "region.apShanghai", "place.open", "place.close"]) {
      const dictKey = key as keyof typeof mcpUi.zh;
      expect(mcpUi.zh[dictKey], `zh 缺 ${dictKey}`).toBeTruthy();
      expect(mcpUi.en[dictKey], `en 缺 ${dictKey}`).toBeTruthy();
    }
    // 兜底位置值真的渲染进了正文（fallback 是 domestic + ap-shanghai）
    expect(visibleMarkup(html)).toContain(mcpUi.en["region.apShanghai"]);
  });
});
