import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { t } from "../i18n/index.js";
import { buildEnvCreditsHtml } from "./env-credits.js";
import { buildEnvCreditsPayload, type CreditsUsageLike } from "../tools/env-credits-payload.js";

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
  dispatch(params: unknown): void;
  el(id: string): ShimmedElement;
  /** 模拟一次 document 级点击（面板用 `event.target.closest("button")` 取按钮） */
  clickDocument(id: string): void;
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

  const messageListeners: Array<(event: { data: unknown }) => void> = [];
  const clickListeners: Array<(event: unknown) => void> = [];
  const sandbox: Record<string, unknown> = {
    document: {
      getElementById: (id: string) => elements.get(id) ?? null,
      documentElement: { scrollWidth: 480, scrollHeight: 320 },
      body: { appendChild() {}, removeChild() {} },
      createElement: () => ({ setAttribute() {}, style: {}, select() {} }),
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
  sandbox.parent = { postMessage() {} };
  sandbox.addEventListener = (type: string, fn: (event: { data: unknown }) => void) => {
    if (type === "message") {
      messageListeners.push(fn);
    }
  };

  vm.runInNewContext(script, sandbox, { filename: "env-credits.html#script" });

  return {
    dispatch(params) {
      messageListeners.forEach((fn) => fn({ data: { method: "ui/notifications/tool-result", params } }));
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
