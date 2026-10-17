import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { t } from "../i18n/index.js";
import { buildEnvCreditsHtml } from "./env-credits.js";
import {
  buildEnvCreditsPayload,
  buildEnvMetricsPayload,
  type CreditsUsageLike,
} from "../tools/env-credits-payload.js";
import { ENV_METRIC_NAME_VALUES } from "../tools/env.js";
import { mcpUiCredits } from "../i18n/locales/modules/mcpUiCredits.js";

/**
 * `ui://cloudbase/env-credits` 面板**脚本的运行时**测试。
 *
 * 为什么必须有它：`env-credits.test.ts` 只做静态 HTML 扫描与兜底解析，**从不执行面板脚本**
 * ⇒ `render()` 的分支文案、模块映射、各行显示/隐藏、复制提示等行为在仓内没有覆盖；
 * 而 panel↔payload 的键契约也没有任何测试绑定（buildEnvCreditsPayload 的测试只测自己那一侧）。
 *
 * 做法（沿用 `get-started.bridge.test.ts` 的既有模式）：把面板 HTML 里唯一的 `<script>` 抽出来，
 * 用 `node:vm` 在一块手写的 window/document 垫片上执行；**载荷一律由 `buildEnvCreditsPayload`
 * 的真实输出驱动**，所以任何一侧的键名/层级漂移都会让这里的断言变红。
 *
 * 它验的是**面板自己的渲染语义**，不验宿主行为（iframe/CSP/剪贴板/CSS）。
 */

type ShimmedElement = {
  id: string;
  hidden: boolean;
  disabled: boolean;
  className: string;
  textContent: string;
  title: string;
  style: Record<string, string>;
  setAttribute(name: string, value: unknown): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, fn: () => void): void;
  appendChild(): void;
  removeChild(): void;
  click(): void;
};

  interface PanelHarness {
    /** `source` 缺省是宿主（父窗口）；传别的对象即模拟"另一个窗口"塞消息 */
    dispatch(params: unknown, source?: unknown): void;
  el(id: string): ShimmedElement;
  /** 模拟一次 document 级点击（面板用 `event.target.closest("button")` 取按钮） */
  clickDocument(id: string): void;
  /** 面板发给宿主的消息（按发出顺序）——本分支（指标卡 ui/message 断言用） */
  posted: Array<Record<string, unknown>>;
  /** 取某方法的最后一次请求参数（如 ui/message 的 params）——本分支 */
  lastRequest(method: string): Record<string, unknown> | undefined;
  /** 垫片里剪贴板不可用 ⇒ copyText 走 textarea 兜底；这里读回它实际要复制的文本 —— main（#1180 链接断言用） */
  copiedText(): string | null;
}

const FALLBACK = { envId: "my-env-3gk9ab", site: "domestic", region: "ap-shanghai" };

function loadPanel(html: string): PanelHarness {
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) {
    throw new Error("panel HTML has no <script> block");
  }

  const elements = new Map<string, ShimmedElement>();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    const id = match[1];
    const handlers: Record<string, Array<() => void>> = {};
    const attrs: Record<string, string> = {};
    elements.set(id, {
      id,
      hidden: true,
      disabled: false,
      className: "",
      textContent: "",
      title: "",
      style: {},
      setAttribute(name, value) {
        attrs[name] = String(value);
      },
      getAttribute(name) {
        return attrs[name] ?? null;
      },
      addEventListener(type, fn) {
        (handlers[type] ||= []).push(fn);
      },
      appendChild() {},
      removeChild() {},
      click() {
        (handlers.click ?? []).forEach((fn) => fn());
      },
    });
  }

  const messageListeners: Array<(event: { data: unknown; source?: unknown }) => void> = [];
  const clickListeners: Array<(event: unknown) => void> = [];
  let copied: string | null = null;
  const sandbox: Record<string, unknown> = {
    document: {
      getElementById: (id: string) => elements.get(id) ?? null,
      documentElement: { scrollWidth: 480, scrollHeight: 320 },
      body: { appendChild() {}, removeChild() {} },
      createElement: () => {
        const area: {
          value?: string;
          setAttribute(): void;
          style: Record<string, unknown>;
          select(): void;
        } = {
          setAttribute() {},
          style: {},
          // copyText 先写 .value 再 .select()，所以在 select 处读回就是要复制的内容
          select() {
            copied = String(area.value ?? "");
          },
        };
        return area;
      },
      execCommand: () => true,
      addEventListener(type: string, fn: (event: unknown) => void) {
        if (type === "click") {
          clickListeners.push(fn);
        }
      },
    },
    // 剪贴板不可用：copyText 会走 textarea 兜底分支（垫片里都是 no-op）
    navigator: {},
    // 面板脚本不使用定时器；给一个不触发的最小实现
    setTimeout: () => 1,
    clearTimeout() {},
    JSON,
    String,
    Object,
    Array,
    Error,
    Number,
    Boolean,
    Date,
    Math,
    Promise,
    console,
  };
  sandbox.window = sandbox;
  // 收集面板发往宿主的消息：ui/message 的**原文**必须能被断言（不再只断言按钮文案）
  const posted: Array<Record<string, unknown>> = [];
  sandbox.parent = { postMessage(message: Record<string, unknown>) { posted.push(message); } };
  sandbox.addEventListener = (type: string, fn: (event: { data: unknown }) => void) => {
    if (type === "message") {
      messageListeners.push(fn);
    }
  };

  vm.runInNewContext(script, sandbox, { filename: "env-credits.html#script" });

  return {
    dispatch(params, source: unknown = sandbox.parent) {
      messageListeners.forEach((fn) => fn({ data: { method: "ui/notifications/tool-result", params }, source }));
    },
    el(id) {
      const element = elements.get(id);
      if (!element) {
        throw new Error(`panel HTML has no element #${id}`);
      }
      return element;
    },
    clickDocument(id) {
      clickListeners.forEach((fn) =>
        fn({ target: { closest: (sel: string) => (sel === "button" ? elements.get(id) ?? null : null) } }),
      );
    },
    /** 面板发给宿主的消息（按发出顺序）。 */
    posted,
    /** 取某方法的最后一次请求参数（如 ui/message 的 params）。 */
    lastRequest(method: string) {
      for (let i = posted.length - 1; i >= 0; i--) {
        const message = posted[i] as { method?: string; params?: unknown };
        if (message.method === method) { return message.params as Record<string, unknown> | undefined; }
      }
      return undefined;
    },
    /** main（#1180）：读回 textarea 兜底实际复制出去的文本 */
    copiedText() {
      return copied;
    },
  };
}

const HTML = buildEnvCreditsHtml("zh", FALLBACK);
const L = (key: string, params?: Record<string, string | number>) =>
  t(key as never, params, "zh");

const usage = (Module: string, CreditsValue?: number, detail?: Array<[string, number]>): CreditsUsageLike =>
  ({
    Module,
    ...(CreditsValue === undefined ? {} : { CreditsValue }),
    ...(detail
      ? {
          MetricUsageDetail: [
            { ValueDetailList: detail.map(([CalcTime, value]) => ({ CalcTime, CreditsValue: value })) },
          ],
        }
      : {}),
  }) as CreditsUsageLike;

/** 用真实载荷驱动面板渲染，返回垫片句柄 */
function render(payload: unknown): PanelHarness {
  const panel = loadPanel(HTML);
  panel.dispatch({ structuredContent: payload });
  return panel;
}

const BASE = { envId: "env-demo", site: "domestic", region: "ap-shanghai" };

describe("env-credits 面板脚本运行时", () => {
  it("四分支：状态词 / 说明句 / 主行动 / 链接按钮都随真实载荷切换", () => {
    const cases: Array<{
      name: string;
      payload: unknown;
      branch: string;
      main?: string;
      link?: string;
    }> = [
      {
        name: "normal",
        payload: buildEnvCreditsPayload({
          ...BASE,
          planRaw: "baas_free",
          usages: [usage("SCF", 10)],
          expired: false,
        }),
        branch: "normal",
      },
      {
        name: "unknown（到期字段缺失 ⇒ 不下结论）",
        payload: buildEnvCreditsPayload({ ...BASE, planRaw: "baas_free", usages: [usage("SCF", 10)] }),
        branch: "unknown",
      },
      {
        name: "trialExhausted",
        payload: buildEnvCreditsPayload({
          ...BASE,
          planRaw: "baas_free",
          usages: [usage("SCF", 3000)],
          expired: false,
        }),
        branch: "trialExhausted",
        main: "action.upgrade",
        link: "action.copyConsoleLink",
      },
      {
        name: "stopped",
        payload: buildEnvCreditsPayload({
          ...BASE,
          planRaw: "baas_personal",
          usages: [usage("SCF", 40000)],
          expired: false,
        }),
        branch: "stopped",
        main: "action.recommendRestore",
        link: "action.copyConsoleLink",
      },
      {
        name: "expired",
        payload: buildEnvCreditsPayload({
          ...BASE,
          planRaw: "baas_personal",
          usages: [usage("SCF", 1)],
          expired: true,
          isolatedDaysLeft: 7,
        }),
        branch: "expired",
        main: "action.renew",
        link: "action.copyConsoleLink",
      },
      {
        name: "arrears",
        payload: buildEnvCreditsPayload({
          ...BASE,
          planRaw: "baas_personal",
          usages: [usage("SCF", 1)],
          expired: false,
          balance: -5,
        }),
        branch: "arrears",
        main: "action.guidedTopup",
        link: "action.copyExpenseLink",
      },
    ];

    for (const item of cases) {
      // 前置：分支判定确实是我们以为的那个（否则下面的文案断言会指向另一分支）
      expect((item.payload as { branch: string }).branch, item.name).toBe(item.branch);

      const panel = render(item.payload);
      expect(panel.el("st-text").textContent, `${item.name} 状态词`).toBe(L(`mcpUiCredits.state.${item.branch}`));
      expect(panel.el("c-hint").textContent, `${item.name} 说明句`).toBe(L(`mcpUiCredits.hint.${item.branch}`));

      const main = panel.el("btn-main");
      if (item.main) {
        expect(main.hidden, `${item.name} 主行动应显示`).toBe(false);
        expect(main.textContent, `${item.name} 主行动文案`).toBe(L(`mcpUiCredits.${item.main}`));
      } else {
        expect(main.hidden, `${item.name} 无主行动`).toBe(true);
      }

      const link = panel.el("btn-link");
      if (item.link) {
        expect(link.hidden, `${item.name} 链接按钮应显示`).toBe(false);
        expect(panel.el("btn-link-label").textContent, `${item.name} 链接按钮文案`).toBe(
          L(`mcpUiCredits.${item.link}`),
        );
      } else {
        expect(link.hidden, `${item.name} 无链接按钮`).toBe(true);
      }

      // 可见正文不得出现分支内部枚举
      const visible = ["st-text", "c-hint", "k-credits", "k-plan", "k-mods", "k-place"]
        .map((id) => panel.el(id).textContent)
        .join("|");
      expect(visible, `${item.name} 正文不含分支枚举`).not.toContain(item.branch);
    }
  });

  it("到期分支显示隔离期剩余天数；非到期分支不显示", () => {
    const expired = render(
      buildEnvCreditsPayload({
        ...BASE,
        planRaw: "baas_personal",
        usages: [usage("SCF", 1)],
        expired: true,
        isolatedDaysLeft: 7,
      }),
    );
    expect(expired.el("k-expired").hidden).toBe(false);
    expect(expired.el("k-expired").textContent).toContain("7");

    const normal = render(
      buildEnvCreditsPayload({ ...BASE, planRaw: "baas_free", usages: [usage("SCF", 1)], expired: false }),
    );
    expect(normal.el("k-expired").hidden).toBe(true);
  });

  it("模块行：同一规范键聚合成一行并累加，且绝不出现云 API 原始码", () => {
    const payload = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [
        usage("FLEXDB", 2),
        usage("TDSQL", 3),
        usage("SCF", 12),
        usage("EKS", 5),
        usage("VM", 7),
        usage("ZZZ-UNKNOWN", 1),
      ],
      expired: false,
    });

    // 载荷层已聚合：database 5 / functions 12 / other 13
    expect(payload.modules).toEqual([
      { module: "database", credits_value: 5 },
      { module: "functions", credits_value: 12 },
      { module: "other", credits_value: 13 },
    ]);

    const panel = render(payload);
    const row = panel.el("k-mods").textContent;
    expect(row).toContain(`${L("mcpUiCredits.module.database")} 5`);
    expect(row).toContain(`${L("mcpUiCredits.module.functions")} 12`);
    expect(row).toContain(`${L("mcpUiCredits.module.other")} 13`);
    // 「其它」只应出现一次（聚合过），不能是 其它 5 · 其它 7 · 其它 1
    expect(row.split(L("mcpUiCredits.module.other")).length - 1).toBe(1);
    for (const raw of ["FLEXDB", "TDSQL", "SCF", "EKS", "VM", "ZZZ-UNKNOWN"]) {
      expect(row, `正文不应出现原始模块码 ${raw}`).not.toContain(raw);
    }
    expect(panel.el("f-mods").hidden).toBe(false);
  });

  it("每个规范键都能被渲染成标签（没有键静默消失）", () => {
    const payload = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [
        usage("SCF", 1),
        usage("FLEXDB", 1),
        usage("COS", 1),
        usage("AI", 1),
        usage("Auth", 1),
        usage("APIInvocation", 1),
        usage("HTTPInvocation", 1),
        usage("HOSTING", 1),
        usage("Workflow", 1),
        usage("Other", 1),
      ],
      expired: false,
    });

    const panel = render(payload);
    const row = panel.el("k-mods").textContent;
    const keys = [
      "functions",
      "database",
      "storage",
      "ai",
      "auth",
      "api",
      "http",
      "hosting",
      "workflow",
      "other",
    ];
    // 每个键都必须真的渲染出一段（客户端对没有标签的键会整条跳过 ⇒ 行数会少，这里会红）。
    // 注意不能只断言 `row` 含 `t(key)`：词典缺键时 t() 与渲染同源退化，那种断言是自证的。
    const entries = row.split(L("mcpUiCredits.modules.sep"));
    expect(entries, "十个规范键应各占一段").toHaveLength(keys.length);
    for (const key of keys) {
      const label = L(`mcpUiCredits.module.${key}`);
      expect(label.trim(), `${key} 应有非空标签`).not.toBe("");
      expect(label, `${key} 的标签不应退化成词典键名`).not.toBe(`mcpUiCredits.module.${key}`);
      expect(entries.some((e) => e.startsWith(label + " ")), `模块行应含 ${key} 的标签`).toBe(true);
    }
    // 十个标签互不相同（防止两键共用同一文案而掩盖缺失）
    expect(new Set(entries.map((e) => e.replace(/ *[\d,]+$/, ""))).size).toBe(keys.length);
  });

  it("降级：拿不到就整块隐藏，不编数（credits / 进度条 / 余额 / 曲线）", () => {
    // 一个值都读不到 ⇒ credits 整块不传
    const noCredits = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [usage("SCF"), usage("COS")],
      expired: false,
    });
    expect(noCredits).not.toHaveProperty("credits");
    const p1 = render(noCredits);
    expect(p1.el("f-credits").hidden).toBe(true);
    expect(p1.el("ubar-box").hidden).toBe(true);

    // 只读到 used（无 total）⇒ 显示 used、不画进度条
    const usedOnly = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [usage("SCF", 42), usage("COS")],
      expired: false,
    });
    expect(usedOnly.credits).toEqual({ used: 42 });
    const p2 = render(usedOnly);
    expect(p2.el("f-credits").hidden).toBe(false);
    expect(p2.el("k-credits").textContent).toBe("42");
    expect(p2.el("ubar-box").hidden).toBe(true);

    // 余额没有只读来源 ⇒ null ⇒ 隐藏
    const noBalance = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [usage("SCF", 1, [["2026-08-01", 5]])],
      expired: false,
    });
    expect(noBalance.balance).toBeNull();
    expect(render(noBalance).el("f-balance").hidden).toBe(true);

    // 曲线 < 2 点 ⇒ 不画
    const onePoint = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [usage("SCF", 1, [["2026-08-01", 5]])],
      expired: false,
    });
    expect(onePoint.spark).toHaveLength(1);
    expect(render(onePoint).el("f-spark").hidden).toBe(true);

    // ≥ 2 点 ⇒ 画
    const twoPoints = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [usage("SCF", 6, [["2026-08-01", 5], ["2026-08-02", 1]])],
      expired: false,
    });
    expect(render(twoPoints).el("f-spark").hidden).toBe(false);
  });

  it("曲线：条目级聚合值缺失时逐日明细照画（不因 total 被省掉而丢曲线）", () => {
    const payload = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [usage("SCF", 100, [["2026-08-01", 5], ["2026-08-02", 6]]), usage("COS")],
      expired: false,
    });
    // 求和不完整 ⇒ 省 total + 结论 unknown
    expect(payload.credits).toEqual({ used: 100 });
    expect(payload.branch).toBe("unknown");
    // 但逐日明细还在
    expect(payload.spark).toHaveLength(2);

    const panel = render(payload);
    expect(panel.el("f-spark").hidden).toBe(false);
    expect(panel.el("st-text").textContent).toBe(L("mcpUiCredits.state.unknown"));
    expect(panel.el("ubar-box").hidden).toBe(true);
  });

  it("复制提示写在独立一行，且不覆盖分支说明句（费用中心 vs 控制台各说各的）", () => {
    const stopped = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_personal",
      usages: [usage("SCF", 40000)],
      expired: false,
    });
    const panel = render(stopped); // link = package → 控制台
    const hintBefore = panel.el("c-hint").textContent;
    expect(panel.el("k-copynote").hidden).toBe(true);
    panel.clickDocument("btn-link");
    expect(panel.el("k-copynote").hidden).toBe(false);
    expect(panel.el("k-copynote").textContent).toBe(L("mcpUiCredits.action.copiedConsole"));
    expect(panel.el("c-hint").textContent, "分支说明句不应被复制提示覆盖").toBe(hintBefore);

    const arrears = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_personal",
      usages: [usage("SCF", 1)],
      expired: false,
      balance: -5,
    });
    const panel2 = render(arrears); // link = expense → 费用中心
    panel2.clickDocument("btn-link");
    expect(panel2.el("k-copynote").textContent).toBe(L("mcpUiCredits.action.copiedExpense"));
    expect(panel2.el("c-hint").textContent).toBe(L("mcpUiCredits.hint.arrears"));
  });

  it("复制出去的是完整控制台地址：带本次载荷的 envId，且站点决定主机", () => {
    // 环境级（package / renew）→ 云开发控制台「套餐用量」页，必须带本环境的 envId
    const exhausted = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [usage("SCF", 3000)],
      expired: false,
    });
    const pkg = render(exhausted);
    pkg.clickDocument("btn-link");
    expect(pkg.copiedText()).toBe(
      "https://tcb.cloud.tencent.com/dev?envId=env-demo#/env/package-usage",
    );

    // 载荷带另一个站点 ⇒ 换主机（不是本地兜底的 domestic）
    const intlExpired = buildEnvCreditsPayload({
      ...BASE,
      envId: "env-intl",
      site: "intl",
      region: "ap-singapore",
      planRaw: "baas_personal",
      usages: [usage("SCF", 1)],
      expired: true,
    });
    const renew = render(intlExpired);
    renew.clickDocument("btn-link");
    expect(renew.copiedText()).toBe(
      "https://tcb.tencentcloud.com/dev?envId=env-intl#/env/package-usage",
    );

    // 账户级（arrears）→ 充值页，主机同样随站点走，且不带 envId
    const arrears = buildEnvCreditsPayload({
      ...BASE,
      envId: "env-intl",
      site: "intl",
      region: "ap-singapore",
      planRaw: "baas_personal",
      usages: [usage("SCF", 1)],
      expired: false,
      balance: -5,
    });
    const expense = render(arrears);
    expense.clickDocument("btn-link");
    expect(expense.copiedText()).toBe("https://console.intl.cloud.tencent.com/expense/recharge");

    // 载荷明确说「没有 envId」（空串）⇒ 地址里就不带查询串，绝不编一个环境出来
    const noEnv = render(
      buildEnvCreditsPayload({
        envId: "",
        site: "domestic",
        region: "ap-shanghai",
        planRaw: "baas_free",
        usages: [usage("SCF", 3000)],
        expired: false,
      }),
    );
    noEnv.clickDocument("btn-link");
    expect(noEnv.copiedText()).toBe("https://tcb.cloud.tencent.com/dev#/env/package-usage");
  });

  it("没有链接可复制的分支，点了复制按钮也不会写出半截地址", () => {
    const panel = loadPanel(HTML); // 不放载荷：分支 = unknown，link = 空
    expect(panel.el("btn-link").hidden).toBe(true);
    panel.clickDocument("btn-link");
    expect(panel.copiedText(), "不该写出 #undefined / 只有主机名之类的东西").toBe(null);
  });

  it("位置行：实时地域优先；缺字段才回落本地；实时值不可译时出「—」而绝不泄露原始码", () => {
    const open = L("mcpUi.place.open");
    const close = L("mcpUi.place.close");
    const unavailable = L("mcpUiCredits.value.unavailable");
    const place = (payload: unknown) => render(payload).el("k-place").textContent;
    // 本文件的面板以 { site: "domestic", region: "ap-shanghai" } 作本地兜底
    const localFallback = `${L("mcpUi.region.apShanghai")}${open}${L("mcpUi.site.domestic")}${close}`;

    // ① 载荷问的是**另一个地域**的环境 ⇒ 位置行跟着载荷走，而不是本地兜底
    const live = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      usages: [usage("SCF", 1)],
      expired: false,
      region: "ap-guangzhou",
      site: "domestic",
    });
    expect((live as { current_region?: string }).current_region).toBe("ap-guangzhou");
    expect(place(live)).toBe(
      `${L("mcpUi.region.apGuangzhou")}${open}${L("mcpUi.site.domestic")}${close}`,
    );
    expect(place(live)).not.toBe(localFallback);

    // ② 载荷**不带** current_region ⇒ 该半回落本地；只带 site 时拼接形态是 `地域（站点）`
    expect(place({ branch: "normal", credits: { total: 3000, used: 1 } })).toBe(localFallback);
    expect(place({ branch: "normal", credits: { total: 3000, used: 1 }, site: "intl" })).toBe(
      `${L("mcpUi.region.apShanghai")}${open}${L("mcpUi.site.intl")}${close}`,
    );
    // 两个都不带 ⇒ 都回落本地
    expect(
      place({ branch: "normal", credits: { total: 3000, used: 1 } }),
    ).toBe(localFallback);

    // ③ 实时值存在但**不可译** ⇒ 显示「—」，既不打原始码、也不冒充本地位置
    const unknownRegion = place({
      branch: "normal",
      credits: { total: 3000, used: 1 },
      current_region: "ap-unknown",
      site: "domestic",
    });
    expect(unknownRegion).toBe(`${unavailable}${open}${L("mcpUi.site.domestic")}${close}`);
    expect(unknownRegion).not.toContain("ap-unknown");
    // 实时值"存在但译不出"不得长得和"环境就在本地"一样
    expect(unknownRegion).not.toBe(localFallback);

    // ④ 两半都不可译 ⇒ 只出一个「—」（不是「—（—）」），且不含任何原始码
    const bothUnknown = place({
      branch: "normal",
      credits: { total: 3000, used: 1 },
      current_region: "ap-unknown",
      site: "weird-site",
    });
    expect(bothUnknown).toBe(unavailable);
    expect(bothUnknown).not.toContain("ap-unknown");
    expect(bothUnknown).not.toContain("weird-site");
  });

  it("位置标签表与词典同源：脚本查表逐项等于词典值（不再两处各写一张表）", () => {
    const script = HTML.match(/<script>([\s\S]*?)<\/script>/i)?.[1] ?? "";
    const REGION_KEYS: Record<string, string> = {
      "ap-shanghai": "apShanghai",
      "ap-guangzhou": "apGuangzhou",
      "ap-beijing": "apBeijing",
      "ap-nanjing": "apNanjing",
      "ap-chengdu": "apChengdu",
      "ap-hongkong": "apHongkong",
      "ap-singapore": "apSingapore",
      "na-siliconvalley": "naSiliconvalley",
      "eu-frankfurt": "euFrankfurt",
    };

    const regionPairs = [...(script.match(/region: \{([^}]*)\}/)?.[1] ?? "").matchAll(/"([^"]+)":"([^"]*)"/g)];
    expect(regionPairs, "脚本里的地域表应有 9 项").toHaveLength(9);
    for (const [, code, label] of regionPairs) {
      expect(REGION_KEYS[code], `${code} 应在映射表里`).toBeTruthy();
      expect(label, `${code} 的脚本标签应与词典一致`).toBe(L(`mcpUi.region.${REGION_KEYS[code]}`));
    }

    const sitePairs = [...(script.match(/site: \{([^}]*)\}/)?.[1] ?? "").matchAll(/"([^"]+)":"([^"]*)"/g)];
    expect(sitePairs, "脚本里的站点表应有 2 项").toHaveLength(2);
    for (const [, code, label] of sitePairs) {
      expect(label, `${code} 的脚本标签应与词典一致`).toBe(
        L(code === "domestic" ? "mcpUi.site.domestic" : "mcpUi.site.intl"),
      );
    }
  });

  it("读不懂的返回：状态回「未确认」、正文不含原文、原文只进折叠区", () => {
    const panel = loadPanel(HTML);
    panel.dispatch({ content: [{ type: "text", text: "<b>NOT-JSON-MARKER</b>" }] });
    expect(panel.el("st-text").textContent).toBe(L("mcpUiCredits.state.unknown"));
    expect(panel.el("btn-main").hidden).toBe(true);
    expect(panel.el("c-hint").textContent).not.toContain("NOT-JSON-MARKER");
    expect(panel.el("raw-out").textContent).toContain("NOT-JSON-MARKER");
  });

  it("契约绑定：客户端消费的键与载荷产出的键一致（不手写 fixture）", () => {
    const payload = buildEnvCreditsPayload({
      ...BASE,
      planRaw: "baas_free",
      envAlias: "演示环境",
      usages: [usage("SCF", 1, [["2026-08-01", 5]])],
      expired: true,
      isolatedDaysLeft: 3,
      balance: 12.5,
    });
    const keys = Object.keys(payload).sort();
    // 只允许这个键集合；任何一侧改名都会让上面/这里变红
    expect(keys).toEqual(
      [
        "balance",
        "branch",
        "credits",
        "current_region",
        "env_alias",
        "env_id",
        "isolated_days_left",
        "modules",
        "plan",
        "plan_raw",
        "site",
        "spark",
      ].sort(),
    );

    // 逐字段被面板真正消费（同一条载荷渲染出来）
    const panel = render(payload);
    expect(panel.el("c-title").textContent).toContain("演示环境");
    expect(panel.el("k-plan").textContent).toBe(L("mcpUiCredits.plan.trial"));
    expect(panel.el("k-balance").textContent).toContain("12.50");
    expect(panel.el("k-expired").hidden).toBe(false);
    expect(panel.el("k-mods").textContent).toContain(L("mcpUiCredits.module.functions"));
    // current_region / site 也被位置行消费（见下一条用例）
    expect(panel.el("k-place").textContent).toContain(L("mcpUi.region.apShanghai"));
  });

  it("面板不发起任何 tools/call（只读面板，纯展示）", () => {
    const panel = loadPanel(HTML);
    panel.dispatch({
      structuredContent: buildEnvCreditsPayload({
        ...BASE,
        planRaw: "baas_free",
        usages: [usage("SCF", 1)],
        expired: false,
      }),
    });
    expect(HTML.split('"tools/call"').length - 1).toBe(0);
    expect(panel.el("f-credits").hidden).toBe(false);
  });
});

describe("监控指标卡：同一资源按 kind 分派", () => {
  const M = {
    envId: "env-demo",
    envAlias: "生产环境",
    metricName: "FunctionError",
    site: "domestic",
    region: "ap-shanghai",
  };
  const metricsOf = (
    values: number[],
    extra: Record<string, unknown> = {},
    metricName: string = M.metricName,
  ) =>
    buildEnvMetricsPayload({
      ...M,
      metricName,
      periodSeconds: 300,
      summary: {
        sampleCount: values.length,
        max: values.length ? Math.max(...values) : null,
        min: values.length ? Math.min(...values) : null,
        avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
        latest: values.length ? values[values.length - 1] : null,
        allZero: values.length > 0 && values.every((v) => v === 0),
        ...extra,
      },
      curve: { NewValues: values },
    });

  it("有数据：标题＝指标人话·别名、状态/说明句/四个字段/曲线/唯一主行动齐备", () => {
    const panel = render(metricsOf([1, 3, 2, 5]));

    expect(panel.el("c-title").textContent).toBe(
      L("mcpUiCredits.metric.unitWrap", {
        label: L("mcpUiCredits.metric.FunctionError"),
        unit: L("mcpUiCredits.metric.unit.count"),
      }) +
        L("mcpUiCredits.title.sep") +
        "生产环境",
    );
    expect(panel.el("st-text").textContent).toBe(L("mcpUiCredits.metric.state.data"));
    expect(panel.el("c-hint").textContent).toBe(L("mcpUiCredits.metric.hint.data"));

    expect(panel.el("f-m-latest").hidden).toBe(false);
    expect(panel.el("k-m-latest").textContent).toBe("5" + L("mcpUiCredits.metric.unit.count"));
    expect(panel.el("f-m-peak").hidden).toBe(false);
    expect(panel.el("k-m-peak").textContent).toContain("5");
    expect(panel.el("f-m-avg").hidden).toBe(false);
    // 指标数值保留小数（控制台不抹小数、服务端本来就给浮点）：2.75 就是 2.75，不再取整成 3
    expect(panel.el("k-m-avg").textContent).toBe("2.75" + L("mcpUiCredits.metric.unit.count"));
    expect(panel.el("f-m-window").hidden).toBe(false);
    expect(panel.el("k-m-window").textContent).toContain(L("mcpUiCredits.metric.period.minute"));

    // 单线曲线：四个点足以成线
    expect(panel.el("f-spark").hidden).toBe(false);
    expect(panel.el("spark-line").getAttribute("d")).toContain("M");

    // 一屏一个主行动：交给会话深挖（标签来自词典）
    expect(panel.el("btn-main").hidden).toBe(false);
    expect(panel.el("btn-main").textContent).toBe(L("mcpUiCredits.metric.action.data"));
    // ① 绿在这张卡上不携带健康含义：有数据也只是中性圆点 + 默认曲线样式
    expect(panel.el("st-dot").className).toBe("dot");
    expect(panel.el("spark-line").getAttribute("stroke")).toBe("var(--text-2)");
    expect(panel.el("btn-link").hidden).toBe(true);

    // 用量卡专有块全部收起（同一块屏上不能两套字段并排）
    for (const id of ["f-credits", "f-mods", "f-plan", "f-balance"]) {
      expect(panel.el(id).hidden).toBe(true);
    }
  });

  it("无流量（全零）：状态＝无流量，且不画曲线（不把贴底直线当成有数据）", () => {
    const panel = render(metricsOf([0, 0, 0, 0]));
    expect(panel.el("st-text").textContent).toBe(L("mcpUiCredits.metric.state.noData"));
    expect(panel.el("c-hint").textContent).toBe(L("mcpUiCredits.metric.hint.noData"));
    expect(panel.el("f-spark").hidden).toBe(true);
    // 数值仍如实显示（0 是真实读数，不是"拿不到"），且带单位
    expect(panel.el("k-m-latest").textContent).toBe("0" + L("mcpUiCredits.metric.unit.count"));
  });

  it("拿不到 Summary 的字段 ⇒ 整行隐藏，不编数（latest/max/avg/window 全隐）", () => {
    const panel = render(
      buildEnvMetricsPayload({ ...M, metricName: "EnvQPSAll", summary: { sampleCount: 0 }, curve: { NewValues: [] } }),
    );
    for (const id of ["f-m-latest", "f-m-peak", "f-m-avg", "f-m-window"]) {
      expect(panel.el(id).hidden).toBe(true);
    }
  });

  it("查询失败：保持指标视图并显示「查询失败」，原文只进折叠区", () => {
    const panel = loadPanel(HTML);
    panel.dispatch({ structuredContent: metricsOf([2, 4]) });
    panel.dispatch({ isError: true, content: [{ type: "text", text: "metrics boom" }] });

    expect(panel.el("st-text").textContent).toBe(L("mcpUiCredits.metric.state.failed"));
    expect(panel.el("raw-out").textContent).toContain("metrics boom");
    // 卡片正文里不出现错误原文
    expect(panel.el("c-hint").textContent).not.toContain("boom");
    expect(panel.el("f-spark").hidden).toBe(true);
  });

  it("未映射的指标码：退化为通用标题，且正文绝不出现原始码", () => {
    const panel = render(metricsOf([1, 2], {}, "NotARealMetric"));
    expect(panel.el("c-title").textContent).toContain(L("mcpUiCredits.metric.generic"));
    // 正文（标题/说明/字段）绝不出现原始码……
    expect(panel.el("c-title").textContent).not.toContain("NotARealMetric");
    expect(panel.el("c-hint").textContent).not.toContain("NotARealMetric");
    expect(panel.el("k-m-latest").textContent).not.toContain("NotARealMetric");
    // ……但原始值必须能在折叠区里看到（折叠区就是原样的地方）
    expect(panel.el("raw-out").textContent).toContain("NotARealMetric");
  });

  it("主行动交给会话：ui/message 原文含指标人话、且不含内部枚举码（指标卡）", () => {
    const panel = render(metricsOf([1, 3, 2, 5]));
    panel.clickDocument("btn-main");

    const params = panel.lastRequest("ui/message");
    const text = String((params?.content as { text?: unknown } | undefined)?.text ?? "");
    expect(text).toBe(
      L("mcpUiCredits.metric.message.data", {
        metric: L("mcpUiCredits.metric.FunctionError"),
      }),
    );
    // 人话进了消息，内部码没有
    expect(text).toContain(L("mcpUiCredits.metric.FunctionError"));
    expect(text).not.toContain("FunctionError");
  });

  it("按 kind 分派：切回用量载荷时，指标字段全部收起、用量块恢复", () => {
    const panel = loadPanel(HTML);
    panel.dispatch({ structuredContent: metricsOf([1, 2]) });
    expect(panel.el("f-m-latest").hidden).toBe(false);

    panel.dispatch({
      structuredContent: buildEnvCreditsPayload({
        ...BASE,
        planRaw: "baas_free",
        usages: [usage("SCF", 10)],
        expired: false,
      }),
    });
    expect(panel.el("f-m-latest").hidden).toBe(true);
    expect(panel.el("f-spark").hidden).toBe(true);
    expect(panel.el("f-credits").hidden).toBe(false);
    // 状态词回到用量分支的话术（不是指标的三态）
    expect(panel.el("st-text").textContent).toBe(L("mcpUiCredits.state.normal"));
    // normal 分支没有主行动（只有耗尽/到期/欠费才有），主按钮应隐藏
    expect(panel.el("btn-main").hidden).toBe(true);
  });

  it("主行动交给会话：ui/message 原文逐字等于分支话术（用量卡，两个分支）", () => {
    const cases: Array<{ name: string; payload: unknown; message: string }> = [
      {
        name: "体验版耗尽",
        payload: buildEnvCreditsPayload({
          ...BASE,
          planRaw: "baas_free",
          usages: [usage("SCF", 3000)],
          expired: false,
        }),
        message: L("mcpUiCredits.message.upgrade"),
      },
      {
        name: "账户欠费",
        payload: buildEnvCreditsPayload({
          ...BASE,
          planRaw: "baas_personal",
          usages: [usage("SCF", 10)],
          expired: false,
          balance: -1,
        }),
        message: L("mcpUiCredits.message.topup"),
      },
    ];
    for (const item of cases) {
      const panel = render(item.payload);
      expect(panel.el("btn-main").hidden, item.name).toBe(false);
      panel.clickDocument("btn-main");
      const params = panel.lastRequest("ui/message");
      const text = String((params?.content as { text?: unknown } | undefined)?.text ?? "");
      expect(text, item.name).toBe(item.message);
    }
  });

  it("守卫：指标枚举 ↔ 词典标签齐备（未列出的枚举也必须有通用标题兜底）", () => {
    // 直接查词典模块本身（不只查 t()）：两种语言都必须**逐个枚举**有标签，
    // 少一个就是漏配——这条守卫的变异自证见提交说明（改名即可打红）。
    const zh = mcpUiCredits.zh as Record<string, unknown>;
    const en = mcpUiCredits.en as Record<string, unknown>;
    expect(zh).toHaveProperty("metric.generic");
    for (const name of ENV_METRIC_NAME_VALUES) {
      const key = `metric.${name}`;
      expect(Object.prototype.hasOwnProperty.call(zh, key), `zh 缺 ${key}`).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(en, key), `en 缺 ${key}`).toBe(true);
      // 标签必须是人话：非空、且不是枚举码本身
      expect(String(zh[key]).length).toBeGreaterThan(0);
      expect(String(zh[key])).not.toBe(name);
      expect(String(en[key]).length).toBeGreaterThan(0);
      expect(String(en[key])).not.toBe(name);
    }
  });

  it("单位覆盖：指标枚举每一个都在面板的单位表里显式表态（新增指标不许静默没单位）", () => {
    // 从生成出来的面板脚本里抽出单位表——它就是运行时真正查的那张表
    const table = HTML.match(/var METRIC_UNIT_KEY = \{([\s\S]*?)\};/);
    expect(table, "面板脚本里应有 METRIC_UNIT_KEY").not.toBeNull();
    const body = table![1];
    const entries = new Map<string, string>();
    for (const line of body.split("\n")) {
      const hit = line.match(/^\s*([A-Za-z][A-Za-z0-9]*):\s*"([^"]*)"/);
      if (hit) { entries.set(hit[1], hit[2]); }
    }
    // ① 枚举逐个都有条目
    for (const name of ENV_METRIC_NAME_VALUES) {
      expect(entries.has(name), `单位表缺 ${name}`).toBe(true);
    }
    // ② "单位未定"（空串）只能是这份**已知清单**：控制台对这些指标不给后缀，
    //    我们不编；其余每一个都必须指向一个真实存在的单位键
    // 唯一未定项：MysqlDbConnections（控制台仪表盘切到数据库时超时，没拿到它的单位）
    const undetermined = [...entries.entries()].filter(([, key]) => key === "").map(([n]) => n);
    expect(undetermined).toEqual(["MysqlDbConnections"]);
    const unitKeys = new Set(
      [...HTML.matchAll(/^\s*(count|ms|gbs|cu|gb|percent|perSec|item):\s*"/gm)].map((m) => m[1]),
    );
    expect(unitKeys.size).toBe(8);
    for (const [, key] of entries) {
      if (key !== "") { expect(unitKeys.has(key), `未知单位键 ${key}`).toBe(true); }
    }
    // ③ 表里没有枚举之外的私货（枚举之外的名字只可能来自控制台新增，需显式处理）
    const known = new Set<string>(ENV_METRIC_NAME_VALUES);
    for (const name of entries.keys()) {
      expect(known.has(name), `单位表里有枚举之外的名字 ${name}`).toBe(true);
    }
  });

  it("平均值保留小数：服务端浮点 16.043478260869566 渲染成 16.04（不是 16）", () => {
    const panel = render(
      buildEnvMetricsPayload({
        ...M,
        metricName: "FunctionInvocation",
        summary: { sampleCount: 23, avg: 16.043478260869566, latest: 18, max: 88.3 },
        curve: { NewValues: [1, 2] },
      }),
    );
    expect(panel.el("k-m-avg").textContent).toBe("16.04" + L("mcpUiCredits.metric.unit.count"));
    // 整数不留无意义的尾零
    expect(panel.el("k-m-latest").textContent).toBe("18" + L("mcpUiCredits.metric.unit.count"));
    // 一位小数照原样
    expect(panel.el("k-m-peak").textContent).toContain("88.3");
  });

  it("单位未定（今日唯一：MysqlDbConnections）：标题不加括号、数值不加后缀，也不编一个单位", () => {
    const panel = render(metricsOf([3, 9], {}, "MysqlDbConnections"));
    expect(panel.el("c-title").textContent).toBe(
      L("mcpUiCredits.metric.MysqlDbConnections") + L("mcpUiCredits.title.sep") + "生产环境",
    );
    expect(panel.el("k-m-latest").textContent).toBe("9");
    expect(panel.el("k-m-avg").textContent).toBe("6");
  });

  it("新增两个单位词（控制台原文转写）：QPS 家族＝次/秒、并发＝个", () => {
    const suffix = (value: string, unit: string) =>
      L("mcpUiCredits.metric.unitSuffix", { value, unit });

    // QPS 家族：控制台 QPS 页原文「当前环境QPS（每秒请求量）」
    const qps = render(metricsOf([3, 9], {}, "EnvQPSAll"));
    expect(qps.el("c-title").textContent).toBe(
      L("mcpUiCredits.metric.unitWrap", {
        label: L("mcpUiCredits.metric.EnvQPSAll"),
        unit: L("mcpUiCredits.metric.unit.perSec"),
      }) +
        L("mcpUiCredits.title.sep") +
        "生产环境",
    );
    expect(qps.el("k-m-latest").textContent).toBe(suffix("9", L("mcpUiCredits.metric.unit.perSec")));
    expect(qps.el("k-m-avg").textContent).toBe(suffix("6", L("mcpUiCredits.metric.unit.perSec")));

    // 并发：控制台云函数视图原文「并发执行个数（个）」——是「个」不是「次」
    const conc = render(metricsOf([1, 3], {}, "FunctionConcurrentExecutions"));
    expect(conc.el("c-title").textContent).toContain(L("mcpUiCredits.metric.unit.item"));
    expect(conc.el("k-m-latest").textContent).toBe(suffix("3", L("mcpUiCredits.metric.unit.item")));
    expect(conc.el("k-m-latest").textContent).not.toContain(L("mcpUiCredits.metric.unit.count"));
  });

  it("圆点与曲线不携带健康含义：三态都是中性圆点，失败也不染红（红在用量卡里表示环境有问题）", () => {
    // 有数据：中性（旧行为是 ok，等于把"有数据"说成"健康"——一万次函数错误也是绿的）
    const data = render(metricsOf([1, 3, 2, 5]));
    expect(data.el("st-dot").className).toBe("dot");
    expect(data.el("spark-line").getAttribute("stroke")).toBe("var(--text-2)");

    // 无流量：中性
    const noData = render(metricsOf([0, 0, 0]));
    expect(noData.el("st-dot").className).toBe("dot");

    // 查询失败：仍是中性 —— 这是"我们没问到"，不是"环境出问题了"；
    // 用量卡里的红表示资源耗尽/欠费（环境问题），同色同义会让人读错。
    const failed = loadPanel(HTML);
    failed.dispatch({ structuredContent: metricsOf([2, 4]) });
    failed.dispatch({ isError: true, content: [{ type: "text", text: "boom" }] });
    expect(failed.el("st-text").textContent).toBe(L("mcpUiCredits.metric.state.failed"));
    expect(failed.el("st-dot").className).toBe("dot");
  });

  it("80% 提前警告与文案一致：条/曲线已红时，状态词与说明句都换成「接近上限」", () => {
    // 个人版 40000 配额用掉 34000 ⇒ 85%，分支仍是 normal（未耗尽）
    const near = render(
      buildEnvCreditsPayload({
        ...BASE,
        planRaw: "baas_personal",
        // 带两点明细 ⇒ 曲线会真的画出来，才能同时断言"条红 + 曲线红 + 文案跟上"
        usages: [usage("SCF", 34000, [["2026-08-01", 17000], ["2026-08-02", 17000]])],
        expired: false,
      }),
    );
    expect(near.el("st-text").textContent).toBe(
      L("mcpUiCredits.state.nearLimit", { pct: 85 }),
    );
    expect(near.el("c-hint").textContent).toBe(L("mcpUiCredits.hint.nearLimit", { pct: 85 }));
    // 同一条用例里两头都断：红色（提前警告保住）与文案（跟上）同时出现
    expect(near.el("ubar-box").className).not.toContain(" ok");
    expect(near.el("spark-line").getAttribute("stroke")).toBe("var(--err)");

    // 对照：未到 80% 时文案不动（原 normal 话术）
    const below = render(
      buildEnvCreditsPayload({
        ...BASE,
        planRaw: "baas_personal",
        usages: [usage("SCF", 1000)],
        expired: false,
      }),
    );
    expect(below.el("st-text").textContent).toBe(L("mcpUiCredits.state.normal"));
    expect(below.el("c-hint").textContent).toBe(L("mcpUiCredits.hint.normal"));
  });

  it("主按钮三态各自的动作：文案互不相同、noData 不含「异常」、消息也按态给", () => {
    const seen: Array<{ name: string; label: string; message: string }> = [];
    const collect = (name: string, panel: PanelHarness) => {
      const label = panel.el("btn-main").textContent;
      panel.clickDocument("btn-main");
      const text = String(
        (panel.lastRequest("ui/message")?.content as { text?: unknown } | undefined)?.text ?? "",
      );
      seen.push({ name, label, message: text });
      return label;
    };

    collect("data", render(metricsOf([1, 3, 2, 5])));
    collect("noData", render(metricsOf([0, 0, 0])));
    const failedPanel = loadPanel(HTML);
    failedPanel.dispatch({ structuredContent: metricsOf([2, 4]) });
    failedPanel.dispatch({ isError: true, content: [{ type: "text", text: "boom" }] });
    collect("failed", failedPanel);

    expect(seen.map((x) => x.label)).toEqual([
      L("mcpUiCredits.metric.action.data"),
      L("mcpUiCredits.metric.action.noData"),
      L("mcpUiCredits.metric.action.failed"),
    ]);
    // 三条文案互不相同（含消息）
    expect(new Set(seen.map((x) => x.label)).size).toBe(3);
    expect(new Set(seen.map((x) => x.message)).size).toBe(3);
    // noData 是最接近流失的状态：中性陈述，不许出现"异常"
    const noData = seen[1];
    expect(noData.label).not.toContain("异常");
    expect(noData.message).not.toContain("异常");
    // 文案里也不该再出现机制腔
    for (const item of seen) {
      expect(item.label).not.toContain("在会话里");
      expect(item.message).not.toContain("在会话里");
    }
  });

  it("守卫：metric.* 文案一律不含机制腔（hint 也纳入——上一轮只覆盖了 action/message）", () => {
    const zh = mcpUiCredits.zh as Record<string, unknown>;
    const en = mcpUiCredits.en as Record<string, unknown>;
    const keys = Object.keys(zh).filter((k) => k.startsWith("metric."));
    expect(keys.length).toBeGreaterThan(0);
    // 三态 hint 必须都在，否则这条守卫会被"没有 hint"绕过
    for (const state of ["data", "noData", "failed"]) {
      expect(keys, `缺 metric.hint.${state}`).toContain(`metric.hint.${state}`);
    }
    for (const key of keys) {
      for (const [lang, dict] of [["zh", zh], ["en", en]] as const) {
        const value = String(dict[key] ?? "");
        expect(value, `${lang} ${key} 含机制腔`).not.toContain("在会话里");
        expect(value, `${lang} ${key} 含机制腔`).not.toContain("in the session");
      }
    }
    // 失败态说明句不得逐字重复按钮的劝告（按钮＝重试这次查询 / Retry this query）
    expect(String(zh["metric.hint.failed"])).not.toContain(String(zh["metric.action.failed"]));
    expect(String(en["metric.hint.failed"])).not.toContain(String(en["metric.action.failed"]));
  });

  it("守卫：两个分支的渲染入口都在面板脚本里（缺一即红）", () => {
    expect(HTML).toContain('id="f-credits"');
    expect(HTML).toContain('id="f-m-latest"');
      // 判别式与两条 render 路径都必须在脚本里出现
      expect(HTML).toContain('payload.kind === "metrics"');
      expect(HTML).toContain("renderMetrics(");
    });

    it("只认宿主：别的窗口塞进来的用量结果不改卡片、也不发任何消息", () => {
      const stranger = { postMessage() {} };
      const panel = loadPanel(HTML);
      const before = {
        title: panel.el("c-title").textContent,
        credits: panel.el("k-credits").textContent,
        hint: panel.el("c-hint").textContent,
        main: panel.el("btn-main").textContent,
      };
      const posted = panel.posted.length;

      const expired = buildEnvCreditsPayload({
        ...BASE,
        planRaw: "baas_free",
        usages: [usage("SCF", 40000)],
        expired: true,
      });

      panel.dispatch({ structuredContent: expired }, stranger);
      expect(panel.el("c-title").textContent).toBe(before.title);
      expect(panel.el("k-credits").textContent).toBe(before.credits);
      expect(panel.el("c-hint").textContent).toBe(before.hint);
      expect(panel.el("btn-main").textContent).toBe(before.main);
      expect(panel.posted.length).toBe(posted);

      // null 来源必须放行：沙箱代理 / MessagePort 中转就是这样投递的（Codex 的 mcp-app-sandbox
      // 实测如此），挡掉它面板会静默收不到任何结果。
      panel.dispatch({ structuredContent: expired }, null);
      expect(panel.el("btn-main").textContent).not.toBe(before.main);
      expect(panel.el("btn-main").hidden).toBe(false);

      // 对照：同一份载荷由宿主发，卡片确实会变（否则上面五条是虚假通过）
      panel.dispatch({ structuredContent: expired });
      expect(panel.el("btn-main").textContent).not.toBe(before.main);
      expect(panel.el("btn-main").textContent).not.toBe("");
    });
  });
