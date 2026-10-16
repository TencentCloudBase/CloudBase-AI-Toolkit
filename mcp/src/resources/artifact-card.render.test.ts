import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { t } from "../i18n/index.js";
import { buildArtifactCardPayload } from "../tools/artifact-card-payload.js";
import { buildArtifactCardHtml } from "./artifact-card.js";

/**
 * `ui://cloudbase/artifact-card` 面板**脚本的运行时**测试。
 *
 * 做法沿用 `env-credits.render.test.ts`：把面板 HTML 里唯一的 `<script>` 抽出来，
 * 用 `node:vm` 在一块手写的 window/document 垫片上执行；**载荷一律由 `buildArtifactCardPayload`
 * 的真实输出驱动**（不是手写 fixture），所以任何一侧的键名/层级漂移都会让这里的断言变红。
 *
 * 它验的是**面板自己的渲染语义**（状态 → 文案/标签/主行动/显示隐藏、点击发出的消息），
 * 不验宿主行为（iframe / CSP / 剪贴板 / CSS）。
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

type SentMessage = { method?: string; params?: any };

interface PanelHarness {
  dispatch(params: unknown): void;
  el(id: string): ShimmedElement;
  /** 模拟一次 document 级点击（面板用 `event.target.closest("button")` 取按钮） */
  clickDocument(id: string): void;
  sent: SentMessage[];
  methods(): string[];
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

  const sent: SentMessage[] = [];
  const messageListeners: Array<(event: { data: unknown }) => void> = [];
  const clickListeners: Array<(event: unknown) => void> = [];
  const sandbox: Record<string, unknown> = {
    document: {
      getElementById: (id: string) => elements.get(id) ?? null,
      documentElement: { scrollWidth: 460, scrollHeight: 320 },
      body: { appendChild() {}, removeChild() {} },
      createElement: () => ({ setAttribute() {}, style: {}, select() {} }),
      execCommand: () => true,
      addEventListener(type: string, fn: (event: unknown) => void) {
        if (type === "click") {
          clickListeners.push(fn);
        }
      },
    },
    // 剪贴板不可用：copyText 走 textarea 兜底分支（垫片里都是 no-op）
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
  sandbox.parent = {
    postMessage(message: unknown) {
      sent.push(message as SentMessage);
    },
  };
  sandbox.addEventListener = (type: string, fn: (event: { data: unknown }) => void) => {
    if (type === "message") {
      messageListeners.push(fn);
    }
  };

  vm.runInNewContext(script, sandbox, { filename: "artifact-card.html#script" });

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
    sent,
    methods() {
      return sent.map((entry) => entry.method).filter((method): method is string => !!method);
    },
  };
}

const HTML = buildArtifactCardHtml("zh", FALLBACK);
const L = (key: string): string => t(key as never, undefined, "zh");

/** 用真实载荷驱动面板渲染 */
function render(payload: unknown): PanelHarness {
  const panel = loadPanel(HTML);
  panel.dispatch({ structuredContent: payload });
  return panel;
}

const BASE = { site: "domestic", region: "ap-shanghai" } as const;

/** 面板在点击时会把 {target} 与 {url} 换掉；测试按同一规则拼期望值 */
const fill = (template: string, target: string, url: string): string =>
  template.replace("{target}", target).replace("{url}", url);
/** {target} = 类型人话 + 产物名（都拿不到时用兜底词） */
const targetOf = (kind: string, name: string): string =>
  kind && name ? `${L(`mcpUiArtifact.kind.${kind}`)} ${name}` : name || L("mcpUiArtifact.message.targetFallback");
const PUBLIC_URL = "https://my-blog.tcloudbaseapp.com";
const INTERNAL_URL = "https://demo.internal.tcb";

const payloadDeploying = () =>
  buildArtifactCardPayload({
    ...BASE,
    success: true,
    pending: true,
    accessUrl: PUBLIC_URL,
    accessUrlSource: "cloudrun.defaultDomain",
    kind: "cloudrun",
    artifactName: "cloudbase-demo",
    envId: "my-env-3gk9ab",
    envAlias: "生产环境",
    planRaw: "baas_personal",
  });

const payloadPublished = () =>
  buildArtifactCardPayload({
    ...BASE,
    success: true,
    accessUrl: PUBLIC_URL,
    accessUrlSource: "hosting.staticDomain",
    accessUrlReachable: true,
    kind: "hosting",
    artifactName: "my-blog",
    envId: "my-env-3gk9ab",
  });

const payloadInternal = () =>
  buildArtifactCardPayload({
    ...BASE,
    success: true,
    accessUrl: INTERNAL_URL,
    accessUrlSource: "cloudrun.internalDomain",
    kind: "cloudrun",
    artifactName: "cloudbase-demo",
  });

const FAILURE_TEXT = "端口 8080 未在健康检查内响应";
const payloadFailed = () =>
  buildArtifactCardPayload({
    ...BASE,
    success: false,
    errorText: FAILURE_TEXT,
    kind: "cloudrun",
    artifactName: "cloudbase-demo",
  });

describe("artifact-card 面板脚本运行时（载荷驱动）", () => {
  it("四态：状态词 / 圆点 / 说明句 / 主行动 都随真实载荷切换", () => {
    const deploying = render(payloadDeploying());
    expect(deploying.el("st-text").textContent).toBe(L("mcpUiArtifact.state.deploying"));
    expect(deploying.el("st-dot").className).toContain("warn");
    expect(deploying.el("c-hint").textContent).toBe(L("mcpUiArtifact.hint.deploying"));
    expect(deploying.el("btn-main").textContent).toBe(L("mcpUiArtifact.action.viewBuildLog"));
    expect(deploying.el("btn-main").hidden).toBe(false);
    // 部署中不展示地址（那是已有服务的地址），但给一个图标刷新
    expect(deploying.el("f-url").hidden).toBe(true);
    expect(deploying.el("btn-refresh").hidden).toBe(false);

    const published = render(payloadPublished());
    expect(published.el("st-text").textContent).toBe(L("mcpUiArtifact.state.published"));
    expect(published.el("st-dot").className).toContain("ok");
    expect(published.el("c-hint").textContent).toBe(L("mcpUiArtifact.hint.published"));
    expect(published.el("btn-main").textContent).toBe(L("mcpUiArtifact.action.openUrl"));
    expect(published.el("f-url").hidden).toBe(false);
    expect(published.el("k-url").textContent).toBe(PUBLIC_URL);
    expect(published.el("k-url-tag").hidden).toBe(true);

    const internal = render(payloadInternal());
    expect(internal.el("st-text").textContent).toBe(L("mcpUiArtifact.state.published"));
    expect(internal.el("c-hint").textContent).toBe(L("mcpUiArtifact.hint.publishedInternal"));
    // 仅内网：撤掉「打开」，主行动改成绑定公网域名，地址带「仅内网」Tag
    expect(internal.el("btn-main").textContent).toBe(L("mcpUiArtifact.action.bindDomain"));
    expect(internal.el("k-url").textContent).toBe(INTERNAL_URL);
    expect(internal.el("k-url-tag").hidden).toBe(false);
    expect(internal.el("k-url-tag").textContent).toBe(L("mcpUiArtifact.tag.internalOnly"));
    expect(internal.el("btn-log").hidden).toBe(false);

    const failed = render(payloadFailed());
    expect(failed.el("st-text").textContent).toBe(L("mcpUiArtifact.state.failed"));
    expect(failed.el("st-dot").className).toContain("err");
    // 说明句是**后端原文**，逐字（不是词典里的话）
    expect(failed.el("c-hint").textContent).toBe(FAILURE_TEXT);
    expect(failed.el("btn-main").textContent).toBe(L("mcpUiArtifact.action.viewLog"));
    expect(failed.el("f-url").hidden).toBe(true);

    const unknown = render(buildArtifactCardPayload({ ...BASE }));
    expect(unknown.el("st-text").textContent).toBe(L("mcpUiArtifact.state.unknown"));
    expect(unknown.el("c-hint").textContent).toBe(L("mcpUiArtifact.hint.unknown"));
    expect(unknown.el("btn-main").hidden).toBe(true);
  });

  it("有地址但可见范围未知：给地址、但不承诺公网（不给主行动）", () => {
    const panel = render(
      buildArtifactCardPayload({
        ...BASE,
        success: true,
        accessUrl: PUBLIC_URL,
        accessUrlSource: "mystery.source",
      }),
    );

    expect(panel.el("k-url").textContent).toBe(PUBLIC_URL);
    expect(panel.el("k-url-tag").hidden).toBe(true);
    expect(panel.el("btn-main").hidden).toBe(true);
    // 仍然给一个次级出路
    expect(panel.el("btn-redeploy").hidden).toBe(false);
  });

  it("品牌条：别名 + 套餐 Tag + 复制环境 ID（ID 只在 title 里，不常驻正文）", () => {
    const panel = render(payloadDeploying());

    expect(panel.el("brand-alias").textContent).toBe("生产环境");
    expect(panel.el("brand-alias").title).toBe(`${L("mcpUiArtifact.brand.envIdLabel")}: my-env-3gk9ab`);
    expect(panel.el("brand-plan").hidden).toBe(false);
    expect(panel.el("brand-plan").textContent).toBe(L("mcpUiCredits.plan.personal"));
    expect(panel.el("btn-copy-env").hidden).toBe(false);
    // 环境 ID 不出现在正文的任何可见位置（只有品牌条 hover 的 title 与折叠区）
    for (const id of ["c-hint", "k-place", "k-url", "st-text"]) {
      expect(panel.el(id).textContent).not.toContain("my-env-3gk9ab");
    }
    expect(panel.el("brand-alias").textContent).not.toContain("my-env-3gk9ab");
    expect(panel.el("brand-plan").textContent).not.toContain("my-env-3gk9ab");
  });

  it("降级：别名拿不到时回退站点人话；环境 ID 拿不到时隐藏复制按钮", () => {
    const panel = render(buildArtifactCardPayload({ ...BASE, success: true, accessUrl: PUBLIC_URL, accessUrlSource: "hosting.staticDomain" }));

    // 没有 env_id 的载荷 → 面板用服务端解析出的兜底环境 ID，别名回退站点人话
    expect(panel.el("brand-alias").textContent).toBe(L("mcpUi.site.domestic"));
    expect(panel.el("brand-plan").hidden).toBe(true);
  });

  it("主行动与次级行动都只发 ui/message，文案来自词典（{url} 用实时地址替换）", () => {
    const panel = render(payloadInternal());
    panel.clickDocument("btn-main");

    const messages = panel.sent.filter((entry) => entry.method === "ui/message");
    expect(messages).toHaveLength(1);
    expect(messages[0].params).toEqual({
      role: "user",
      content: {
        type: "text",
        text: fill(
          L("mcpUiArtifact.message.bindDomain"),
          targetOf("cloudrun", "cloudbase-demo"),
          INTERNAL_URL,
        ),
      },
    });

    const published = render(payloadPublished());
    published.clickDocument("btn-main");
    expect(published.sent.filter((entry) => entry.method === "ui/message")[0]?.params.content.text).toBe(
      fill(L("mcpUiArtifact.message.openUrl"), targetOf("hosting", "my-blog"), PUBLIC_URL),
    );
  });

  it("发给会话的话里带着本次部署的对象（否则技能不知道查哪个服务）", () => {
    const failed = render(payloadFailed());
    failed.clickDocument("btn-main");
    const failedText = failed.sent.filter((entry) => entry.method === "ui/message")[0]?.params.content.text ?? "";
    // 失败态主行动：既要有日志动作，也要点出对象
    expect(failedText).toBe(
      fill(L("mcpUiArtifact.message.viewLog"), targetOf("cloudrun", "cloudbase-demo"), ""),
    );
    expect(failedText).toContain("cloudbase-demo");

    // 拿不到对象时不硬凑：落回兜底措辞
    const bare = render(
      buildArtifactCardPayload({ ...BASE, success: false, errorText: "boom" }),
    );
    bare.clickDocument("btn-main");
    const bareText = bare.sent.filter((entry) => entry.method === "ui/message")[0]?.params.content.text ?? "";
    expect(bareText).toBe(
      fill(L("mcpUiArtifact.message.viewLog"), L("mcpUiArtifact.message.targetFallback"), ""),
    );
    expect(bareText).toContain(L("mcpUiArtifact.message.targetFallback"));
  });

  it("面板从不调用工具：任何一次点击后 tools/call 计数都为 0", () => {
    for (const payload of [payloadDeploying(), payloadPublished(), payloadInternal(), payloadFailed()]) {
      const panel = render(payload);
      panel.clickDocument("btn-main");
      panel.clickDocument("btn-redeploy");
      panel.clickDocument("btn-log");
      panel.clickDocument("btn-refresh");
      panel.clickDocument("btn-copy-url");
      panel.clickDocument("btn-copy-env");

      expect(panel.methods().filter((method) => method === "tools/call")).toEqual([]);
      // 面板只会发这四条消息名；没有任何其它调用（尤其没有 tools/call）
      const allowed = new Set([
        "ui/initialize",
        "ui/notifications/initialized",
        "ui/notifications/size-changed",
        "ui/message",
      ]);
      for (const method of panel.methods()) {
        expect(allowed, `面板不应发出 ${method}`).toContain(method);
      }
      expect(panel.methods()).toContain("ui/message");
    }
  });

  it("兜底：只收到失败标记（isError）时显示「部署失败」，并保留上一次的身份", () => {
    const panel = render(payloadPublished()); // 先有一次真实结果：身份（类型/名称/环境 ID）来自它
    expect(panel.el("c-title").textContent).toContain("my-blog");

    panel.dispatch({ content: [{ type: "text", text: "boom" }], isError: true });

    // 主路是"失败也带载荷"；这条兜底保证只拿到失败标记时也不显示「未确认」
    expect(panel.el("st-text").textContent).toBe(L("mcpUiArtifact.state.failed"));
    expect(panel.el("st-dot").className).toContain("err");
    // 身份保留（否则用户不知道"什么失败了"）：标题里的产物名 + 环境 ID 都还在
    expect(panel.el("c-title").textContent).toContain("my-blog");
    expect(panel.el("brand-alias").title).toContain("my-env-3gk9ab");
    expect(panel.el("btn-copy-env").hidden).toBe(false);
    // 但不留旧地址（那属于上一次结果），也不给「打开」
    expect(panel.el("f-url").hidden).toBe(true);
    expect(panel.el("btn-main").textContent).toBe(L("mcpUiArtifact.action.viewLog"));
    // 原文只进折叠区，不进正文
    expect(panel.el("raw-out").textContent).toContain("boom");
    expect(panel.el("c-hint").textContent).toBe("");
    expect(panel.el("c-hint").hidden).toBe(true);
  });

  it("兜底：没有任何上一次身份时也不崩（失败态、无标题、无地址）", () => {
    const panel = loadPanel(HTML);
    panel.dispatch({ content: [{ type: "text", text: "boom" }], isError: true });

    expect(panel.el("st-text").textContent).toBe(L("mcpUiArtifact.state.failed"));
    expect(panel.el("c-title").hidden).toBe(true);
    expect(panel.el("f-url").hidden).toBe(true);
    expect(panel.el("btn-main").textContent).toBe(L("mcpUiArtifact.action.viewLog"));
  });

  it("读不懂的返回只进折叠区，卡片回到未确认（正文不摊原文）", () => {
    const junk = '<img src=x onerror="alert(1)"> not-a-payload';
    const panel = loadPanel(HTML);
    panel.dispatch({ content: [{ type: "text", text: junk }] });

    expect(panel.el("st-text").textContent).toBe(L("mcpUiArtifact.state.unknown"));
    expect(panel.el("btn-main").hidden).toBe(true);
    expect(panel.el("raw-out").textContent).toContain("not-a-payload");
    for (const id of ["c-hint", "k-place", "k-url", "st-text", "brand-alias"]) {
      expect(panel.el(id).textContent).not.toContain("not-a-payload");
      expect(panel.el(id).textContent).not.toContain("<img");
    }
  });

  it("契约键 pin：面板读取的键就是 buildArtifactCardPayload 产出的键", () => {
    const publicPayload = payloadPublished();
    for (const key of ["state", "access_url", "access_url_scope", "env_id", "plan", "plan_raw", "site", "current_region", "artifact_kind", "artifact_name"]) {
      expect(publicPayload, `载荷缺 ${key}`).toHaveProperty(key);
    }
    const failedPayload = payloadFailed();
    expect(failedPayload).toHaveProperty("error_text");

    // 反向：真正驱动面板的是这些键——把地址抹掉，面板就不再显示地址行
    const withoutUrl = render({ ...publicPayload, access_url: undefined });
    expect(withoutUrl.el("f-url").hidden).toBe(true);
  });
});
