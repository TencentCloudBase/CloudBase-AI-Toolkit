import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { t } from "../i18n/index.js";
import { buildGetStartedHtml, type GetStartedStatus } from "./get-started.js";

/**
 * 面板 bridge 的行为级测试：不需要浏览器，也不需要真宿主。
 *
 * 做法（移植自 specs/mcp-ui/probe/bridge-host-sim.mjs，探针本身留在 specs/ 不随包发布）：
 * 把面板 HTML 里唯一的 <script> 抽出来，用 `node:vm` 在一块手写的 window/document 垫片上执行；
 * `window.parent.postMessage` 换成记录器，宿主→View 的消息手动 dispatch。
 *
 * 它验的是**面板自己的消息语义**：握手顺序、按钮点下去真的发什么、
 * 返回结果能不能落到面板。验不了的是「宿主是否来拉资源 / 是否渲染 iframe / CSP 是否放行 /
 * 是否把 View 发起的 tools/call 转发回服务端」——那些是宿主行为，必须人工看界面。
 */
const sampleStatus: GetStartedStatus = {
  envId: "env-abc123",
  site: "domestic",
  region: "ap-shanghai",
};

/** 内部枚举：可见正文里不允许出现，只允许在「查看原始返回」折叠区里。 */
const INTERNAL_ENUMS = ["domestic", "intl", "single_env", "account", "ap-", "READY", "auth(status)"];

const READY_STATUS = {
  ok: true,
  code: "STATUS",
  auth_status: "READY",
  auth_mode: "api_key",
  credential_scope: "single_env",
  site: "domestic",
  current_region: "ap-shanghai",
  current_env_id: "tcb-demo-a1b2c3d4",
  env_status: "READY",
  env_setup_status: "NOT_NEEDED",
};

const UNBOUND_STATUS = {
  ok: true,
  code: "STATUS",
  auth_status: "READY",
  credential_scope: "account",
  site: "domestic",
  current_region: "ap-shanghai",
  current_env_id: null,
};

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};
const decodeEntities = (value: string): string =>
  value.replace(/&(amp|lt|gt|quot|#39);/g, (match) => HTML_ENTITIES[match]);

interface ShimmedElement {
  id: string;
  hidden: boolean;
  disabled: boolean;
  className: string;
  textContent: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, fn: () => void): void;
  click(): void;
  readonly firstChild: ShimmedElement | null;
  appendChild(child: ShimmedElement): void;
  removeChild(child: ShimmedElement): void;
}

interface PanelHarness {
  /** 记录 View → Host 发出的每一条消息及其 targetOrigin */
  sent: Array<{ message: { jsonrpc?: string; id?: number; method?: string; params?: any; result?: any }; origin: string }>;
  /** 模拟 Host → View 的一条消息 */
  /** `source` 缺省是宿主（父窗口）；传别的对象即模拟"另一个窗口"塞消息 */
  dispatch(message: unknown, source?: unknown): void;
  /** 触发所有尚未执行的 setTimeout 回调（面板的超时兜底靠它） */
  fireTimers(): void;
  element(id: string): ShimmedElement;
  methodsFrom(start: number): Array<string | undefined>;
}

function loadPanel(html: string): PanelHarness {
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) {
    throw new Error("panel HTML has no <script> block");
  }

  // 每个元素的 data-* 属性（浏览器会把实体解码后再交给 getAttribute）
  const attributes = new Map<string, Record<string, string>>();
  for (const tag of html.matchAll(/<[a-z][^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const attr of tag[0].matchAll(/data-([\w-]+)="([^"]*)"/g)) {
      attrs[attr[1]] = decodeEntities(attr[2]);
    }
    attributes.set(tag[1], attrs);
  }

  const elements = new Map<string, ShimmedElement>();
  for (const id of html.matchAll(/\bid="([^"]+)"/g)) {
    const elementId = id[1];
    const handlers: Record<string, Array<() => void>> = {};
    const children: ShimmedElement[] = [];
    elements.set(elementId, {
      id: elementId,
      hidden: true,
      disabled: false,
      className: "",
      textContent: "",
      getAttribute(name) {
        return attributes.get(elementId)?.[name.replace(/^data-/, "")] ?? null;
      },
      setAttribute() {},
      addEventListener(type, fn) {
        (handlers[type] ||= []).push(fn);
      },
      click() {
        (handlers.click ?? []).forEach((fn) => fn());
      },
      get firstChild() {
        return children[0] ?? null;
      },
      appendChild(child: ShimmedElement) {
        children.push(child);
      },
      removeChild(child: ShimmedElement) {
        const at = children.indexOf(child);
        if (at >= 0) { children.splice(at, 1); }
      },
    });
  }

  const sent: PanelHarness["sent"] = [];
  const messageListeners: Array<(event: { data: unknown; source?: unknown }) => void> = [];
  // 可控的假定时器：面板的超时兜底需要能"手动到点"，而不是真等 10s
  let timerSeq = 0;
  let timers = new Map<number, () => void>();
  const sandbox: Record<string, unknown> = {
    document: {
      // 与浏览器一致：不存在的 id 返回 null，避免掩盖"按钮丢了"这类问题
      getElementById: (id: string) => elements.get(id) ?? null,
      documentElement: { scrollWidth: 480, scrollHeight: 320 },
      body: {},
      addEventListener() {},
      // 面板用 createElement 造环境行；垫片只需要这几种属性，别假装是个完整 DOM。
      createElement(tag: string) {
        const node: Record<string, unknown> = {
          tagName: tag.toUpperCase(),
          className: "",
          textContent: "",
          type: "",
          children: [] as unknown[],
          setAttribute() {},
          addEventListener() {},
          appendChild(child: { textContent?: string }) {
            (node.children as unknown[]).push(child);
          },
        };
        return node;
      },
    },
    setTimeout: (fn: () => void) => {
      const id = ++timerSeq;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
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
    postMessage: (message: unknown, origin: string) => sent.push({ message: message as any, origin }),
  };
  sandbox.addEventListener = (type: string, fn: (event: { data: unknown }) => void) => {
    if (type === "message") {
      messageListeners.push(fn);
    }
  };
  // 刻意不定义 ResizeObserver：面板用 typeof 守卫，应优雅跳过

  vm.runInNewContext(script, sandbox, { filename: "get-started-panel.html#script" });

  return {
    sent,
    dispatch(message, source: unknown = sandbox.parent) {
      messageListeners.forEach((fn) => fn({ data: message, source }));
    },
    fireTimers() {
      const pendingTimers = [...timers.values()];
      timers = new Map();
      pendingTimers.forEach((fn) => fn());
    },
    element(id) {
      const element = elements.get(id);
      if (!element) {
        throw new Error(`panel HTML has no element #${id}`);
      }
      return element;
    },
    methodsFrom(start) {
      return sent.slice(start).map((entry) => entry.message.method);
    },
  };
}

const HOST_INITIALIZE_RESULT = {
  jsonrpc: "2.0",
  id: 1,
  result: { protocolVersion: "2026-01-26", hostCapabilities: {}, hostInfo: {}, hostContext: {} },
};

const TOOL_RESULT = (params: unknown) => ({
  jsonrpc: "2.0",
  method: "ui/notifications/tool-result",
  params,
});

/** 面板的 sent 里有 Promise（握手与按钮回调都在 .then 里发下一条），断言前先让微任务跑完 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("get-started 面板 bridge（vm 垫片驱动）", () => {
  it("加载即握手：先 ui/initialize，收到结果后 initialized + size-changed", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));

    const initialize = panel.sent.find((entry) => entry.message.method === "ui/initialize");
    expect(initialize).toBeDefined();
    expect(initialize?.message.jsonrpc).toBe("2.0");
    expect(Number.isInteger(initialize?.message.id)).toBe(true);
    expect(initialize?.message.params?.appCapabilities).toBeDefined();
    expect(initialize?.message.params?.protocolVersion).toBe("2026-01-26");
    // `appInfo` 是宿主实际校验的字段名：实测 Codex 桌面端在缺它时回
    // `-32603 {"path":["params","appInfo"]}`；`clientInfo` 是规范里的名字。
    // 两个都发，因为真实宿主与已发布规范不一致——只发其中一个都会有一边不对。
    expect(initialize?.message.params?.appInfo).toEqual({
      name: "cloudbase-get-started",
      version: "1.0.0",
    });
    expect(initialize?.message.params?.clientInfo).toEqual({
      name: "cloudbase-get-started",
      version: "1.0.0",
    });
    expect(initialize?.origin).toBe("*");

    const before = panel.sent.length;
    panel.dispatch(HOST_INITIALIZE_RESULT);
    await flush();
    const afterInit = panel.methodsFrom(before);

    expect(afterInit).toContain("ui/notifications/initialized");
    const initialized = panel.sent
      .slice(before)
      .find((entry) => entry.message.method === "ui/notifications/initialized");
    expect(initialized?.message.id).toBeUndefined();

    const sizeChanged = panel.sent
      .slice(before)
      .find((entry) => entry.message.method === "ui/notifications/size-changed");
    expect(typeof sizeChanged?.message.params?.width).toBe("number");
    expect(typeof sizeChanged?.message.params?.height).toBe("number");
  });

  it("握手与加载阶段不发 tools/call（只有「重新检查」会调工具）", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(HOST_INITIALIZE_RESULT);
    await flush();

    expect(panel.sent.some((entry) => entry.message.method === "tools/call")).toBe(false);
    // 加载时没有实时结果：只给一个次级「重新检查」入口，主行动不瞎猜
    expect(panel.element("btn-main").hidden).toBe(true);
  });

  it("吃 ui/notifications/tool-result 的 structuredContent：状态卡与主行动跟着变", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));

    // 面板被当成本次 auth 调用的 UI 渲染时，宿主会把这个通知送来；忽略它，面板就会
    // "顶掉"真实结果、只剩静态兜底——这条断言就是为那个失败而写。
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.unknown", undefined, "en"));

    panel.dispatch(TOOL_RESULT({ structuredContent: READY_STATUS }));
    await flush();

    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.connected", undefined, "en"));
    expect(panel.element("k-env").textContent).toBe("tcb-demo-a1b2c3d4");
    expect(panel.element("k-place").textContent).toBe("Shanghai (China)");
    expect(panel.element("k-scope").textContent).toBe("Current environment only");
    expect(panel.element("btn-main").hidden).toBe(false);
    expect(panel.element("btn-main").textContent).toBe(t("mcpUi.next.action.deploy", undefined, "en"));
    expect(panel.element("nx-label").textContent).toBe(t("mcpUi.next.label.ready", undefined, "en"));
  });

  it("环境多于一屏：默认给前 5 个，「显示全部」就地展开，不向宿主发任何请求", async () => {
    const panel = loadPanel(buildGetStartedHtml("zh", sampleStatus));
    const candidates = Array.from({ length: 8 }, (_, i) => ({
      envId: `env-${i}`,
      alias: `env-${i}`,
      region: "ap-shanghai",
      status: i < 8 ? "NORMAL" : "UNAVAILABLE",
    }));
    panel.dispatch(
      TOOL_RESULT({
        structuredContent: {
          ...READY_STATUS,
          current_env_id: null,
          env_status: "MULTIPLE",
          env_candidates: candidates,
          env_candidates_summary: { total: 8, returned: 8, truncated: false },
        },
      }),
    );
    await flush();

    // 收起态：说明还剩多少，并给出一个能按的入口（不是干写着"只显示了前 5 个"）
    expect(panel.element("env-toggle").hidden).toBe(false);
    expect(panel.element("env-toggle").textContent).toBe(
      t("mcpUi.env.showAll", { n: 8 }, "zh"),
    );
    expect(panel.element("env-more").textContent).toBe(t("mcpUi.env.allShown", { total: 8 }, "zh"));

    const before = panel.sent.length;
    panel.element("env-toggle").click();
    await flush();

    // 展开态：按钮翻成「收起」，句子改成总数；展开前后都不该多出 tool 调用
    expect(panel.element("env-toggle").textContent).toBe(t("mcpUi.env.collapse", undefined, "zh"));
    expect(panel.element("env-more").textContent).toBe(t("mcpUi.env.allShown", { total: 8 }, "zh"));
    const after = panel.methodsFrom(before);
    expect(after).not.toContain("tools/call");
    expect(after.every((m) => m === "ui/notifications/size-changed")).toBe(true);

    // 再点一次收回，且换一份新结果时回到收起态（用户要的是"下一步"，不是四十行）
    panel.element("env-toggle").click();
    await flush();
    expect(panel.element("env-toggle").textContent).toBe(t("mcpUi.env.showAll", { n: 8 }, "zh"));
  });

  it("接口只回了 5 个、但总共 37 个：没有可展开的，就直接说清其余的在哪", async () => {
    const panel = loadPanel(buildGetStartedHtml("zh", sampleStatus));
    panel.dispatch(
      TOOL_RESULT({
        structuredContent: {
          ...READY_STATUS,
          current_env_id: null,
          env_status: "MULTIPLE",
          env_candidates: Array.from({ length: 5 }, (_, i) => ({
            envId: `env-${i}`,
            alias: `env-${i}`,
            region: "ap-shanghai",
            status: "NORMAL",
          })),
          env_candidates_summary: { total: 37, returned: 5, truncated: true },
        },
      }),
    );
    await flush();

    // 没有可展开的 → 不给按钮；但不能只说"只显示了前 5 个"就没了下文
    expect(panel.element("env-toggle").hidden).toBe(true);
    expect(panel.element("env-foot").hidden).toBe(false);
    expect(panel.element("env-more").textContent).toBe(
      t("mcpUi.env.restHidden", { total: 37, returned: 5 }, "zh"),
    );
    expect(panel.element("env-more").textContent).toContain("控制台");
  });

  it("只认宿主：别的窗口塞进来的结果不改状态卡，也不发任何消息", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    await flush();
    const unknown = panel.element("st-text").textContent;
    const sentBefore = panel.sent.length;

    // 别的窗口（同页其它 frame、或被别人套进来的一层）塞一份"已连接"的假结果：
    // 面板既不改状态，也不能因此向宿主发任何消息。
    panel.dispatch(TOOL_RESULT({ structuredContent: READY_STATUS }), { postMessage() {} });
    await flush();
    expect(panel.element("st-text").textContent).toBe(unknown);
    expect(panel.sent.length).toBe(sentBefore);

    // null 来源必须放行：沙箱代理 / MessagePort 中转就是这样投递的（Codex 的 mcp-app-sandbox
    // 实测如此），挡掉它面板会静默收不到任何结果。
    panel.dispatch(TOOL_RESULT({ structuredContent: READY_STATUS }), null);
    await flush();
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.connected", undefined, "en"));

    // 对照：宿主发同样内容，状态卡确实变（否则上面两条是虚假通过）
    panel.dispatch(TOOL_RESULT({ structuredContent: READY_STATUS }));
    await flush();
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.connected", undefined, "en"));
  });

  it("一屏一个主行动：未登录给登录、已登录未绑定给选环境，其余不并列", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));

    panel.dispatch(TOOL_RESULT({ structuredContent: { auth_status: "REQUIRED" } }));
    await flush();
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.loggedOut", undefined, "en"));
    expect(panel.element("btn-main").textContent).toBe(t("mcpUi.next.action.login", undefined, "en"));
    // 这次结果没带位置/环境字段 → 本地兜底（实时值优先，但缺失的字段仍要有个值）
    expect(panel.element("k-place").textContent).toBe("Shanghai (China)");
    expect(panel.element("k-env").textContent).toBe("env-abc123");
    expect(panel.element("k-scope").textContent).toBe(
      t("mcpUi.status.scopeAfterLogin", undefined, "en"),
    );

    panel.dispatch(TOOL_RESULT({ structuredContent: UNBOUND_STATUS }));
    await flush();
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.loggedIn", undefined, "en"));
    expect(panel.element("btn-main").textContent).toBe(t("mcpUi.next.action.selectEnv", undefined, "en"));
    // 实时结果里 current_env_id 显式为 null → 「未绑定」，不能被本地缓存的环境 ID 顶掉
    expect(panel.element("k-env").textContent).toBe(t("mcpUi.status.unset", undefined, "en"));
    expect(panel.element("k-scope").textContent).toBe(t("mcpUi.scope.account", undefined, "en"));
  });

  it("位置逐字段兜底：实时结果不带 site 时仍拼出「Shanghai (China)」", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));

    // 真机形状：auth(status) 总是带 current_region，但只有调用方显式传了 site 才带 site。
    panel.dispatch(
      TOOL_RESULT({
        structuredContent: { auth_status: "READY", current_region: "ap-shanghai", current_env_id: "env-live" },
      }),
    );
    await flush();
    expect(panel.element("k-place").textContent).toBe("Shanghai (China)");
    expect(panel.element("k-env").textContent).toBe("env-live");

    // 认不出来的 code 照原样显示，不猜（site 缺省时仍用本地兜底）
    panel.dispatch(
      TOOL_RESULT({
        structuredContent: { auth_status: "READY", current_region: "us-east-9", current_env_id: "env-live" },
      }),
    );
    await flush();
    expect(panel.element("k-place").textContent).toBe("us-east-9 (China)");
  });

  it("挂载在多用途 auth 上：只带 code 的结果也能给出对应状态", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));

    panel.dispatch(TOOL_RESULT({ structuredContent: { ok: true, code: "AUTH_PENDING" } }));
    await flush();
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.pending", undefined, "en"));
    expect(panel.element("btn-main").hidden).toBe(true);

    panel.dispatch(TOOL_RESULT({ structuredContent: { ok: true, code: "AUTH_REQUIRED" } }));
    await flush();
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.loggedOut", undefined, "en"));
    expect(panel.element("btn-main").textContent).toBe(t("mcpUi.next.action.login", undefined, "en"));
  });

  it("structuredContent 优先于 content 文本（两者冲突时以结构化结果为准）", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));

    panel.dispatch(
      TOOL_RESULT({
        structuredContent: { auth_status: "READY", current_env_id: "env-structured" },
        content: [{ type: "text", text: JSON.stringify({ auth_status: "REQUIRED" }) }],
      }),
    );
    await flush();

    expect(panel.element("k-env").textContent).toBe("env-structured");
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.connected", undefined, "en"));
  });

  it("可见正文只出人话：内部枚举不露面，原始值只在「查看原始返回」里", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(TOOL_RESULT({ structuredContent: READY_STATUS }));
    await flush();

    // 正面：站点的 domestic 与地域的 ap-shanghai 被翻成人话（进正文的是「Shanghai (China)」）
    expect(panel.element("k-place").textContent).toBe("Shanghai (China)");
    expect(panel.element("k-scope").textContent).toBe("Current environment only");

    // 反面：可见文本里一个原始枚举都不许出现
    for (const id of ["st-text", "st-qual", "k-place", "k-scope", "k-env", "nx-label", "nx-why"]) {
      const text = panel.element(id).textContent;
      for (const token of INTERNAL_ENUMS) {
        expect(text, `#${id} 不应出现内部枚举 ${token}`).not.toContain(token);
      }
    }

    // 而原始值确实在「查看原始返回」里（否则上一条会因为"压根没翻"而虚假通过）
    expect(panel.element("raw-box").hidden).toBe(false);
    expect(panel.element("raw-out").textContent).toContain("ap-shanghai");
    expect(panel.element("raw-out").textContent).toContain("single_env");
  });

  it("点「重新检查」：发一次只读 auth(status)，pending 落在按钮自身，结果回填状态卡", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(HOST_INITIALIZE_RESULT);
    await flush();

    const before = panel.sent.length;
    panel.element("btn-refresh").click();

    const calls = panel.sent.slice(before).filter((entry) => entry.message.method === "tools/call");
    expect(calls).toHaveLength(1);
    expect(calls[0].message.params).toEqual({ name: "auth", arguments: { action: "status" } });
    // pending 就落在按钮上（禁用 + 文案变「正在检查…」），不另起一行
    expect(panel.element("btn-refresh").disabled).toBe(true);
    expect(panel.element("btn-refresh").textContent).toBe(t("mcpUi.action.pending", undefined, "en"));

    // 服务端把结果放在 content[0].text 的 JSON 里，面板要能回落到解析它
    panel.dispatch({
      jsonrpc: "2.0",
      id: calls[0].message.id,
      result: { content: [{ type: "text", text: JSON.stringify(UNBOUND_STATUS) }] },
    });
    await flush();

    expect(panel.element("btn-refresh").disabled).toBe(false);
    expect(panel.element("btn-refresh").textContent).toBe(
      t("mcpUi.next.action.refresh", undefined, "en"),
    );
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.loggedIn", undefined, "en"));
    expect(panel.element("btn-main").textContent).toBe(t("mcpUi.next.action.selectEnv", undefined, "en"));
  });

  it("点主行动：只发 ui/message，且不发 tools/call", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(TOOL_RESULT({ structuredContent: { auth_status: "REQUIRED" } }));
    await flush();

    const before = panel.sent.length;
    panel.element("btn-main").click();
    await flush();

    const messages = panel.sent.slice(before).filter((entry) => entry.message.method === "ui/message");
    expect(messages).toHaveLength(1);
    expect(messages[0].message.params).toEqual({
      role: "user",
      content: { type: "text", text: t("mcpUi.message.login", undefined, "en") },
    });
    expect(
      panel.sent.slice(before).some((entry) => entry.message.method === "tools/call"),
    ).toBe(false);
  });

  it("读不懂的返回绝不摊到正文：原文只进「查看原始返回」，卡片回到尚未确认", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    // 先渲染一个真实状态，确认"读不懂的这次结果"能把卡片带回兜底值，而不是留着上一个状态
    panel.dispatch(TOOL_RESULT({ structuredContent: READY_STATUS }));
    await flush();
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.connected", undefined, "en"));

    const junk = '<img src=x onerror="alert(1)"> not-json';
    panel.dispatch(TOOL_RESULT({ content: [{ type: "text", text: junk }] }));
    await flush();

    // 状态卡：本地静态兜底 + 尚未确认（没有把"解析失败"当成一个状态）
    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.unknown", undefined, "en"));
    expect(panel.element("k-place").textContent).toBe("Shanghai (China)");
    expect(panel.element("k-env").textContent).toBe("env-abc123");
    expect(panel.element("k-scope").textContent).toBe(
      t("mcpUi.status.scopeAfterLogin", undefined, "en"),
    );
    // 唯一还能按下去的是「重新检查」（vm 垫片不反映 HTML 的静态文案与"默认不隐藏"，所以直接点它来验）
    expect(panel.element("btn-main").hidden).toBe(true);
    // 原文只落在折叠区里（且原样保留、没有被解析成元素）
    expect(panel.element("raw-box").hidden).toBe(false);
    expect(panel.element("raw-out").textContent).toBe(junk);
    for (const id of ["st-text", "st-qual", "k-place", "k-scope", "k-env", "nx-label", "nx-why"]) {
      expect(panel.element(id).textContent, `#${id} 不应出现原始返回`).not.toContain("not-json");
      expect(panel.element(id).textContent, `#${id} 不应出现原始返回`).not.toContain("<img");
    }

    const before = panel.sent.length;
    panel.element("btn-refresh").click();
    const calls = panel.sent.slice(before).filter((entry) => entry.message.method === "tools/call");
    expect(calls).toHaveLength(1);
    expect(calls[0].message.params).toEqual({ name: "auth", arguments: { action: "status" } });
    expect(panel.element("btn-refresh").textContent).toBe(t("mcpUi.action.pending", undefined, "en"));
  });

  it("「重新检查」拿回一段读不懂的文本：给失败态与出路，同样不摊原文", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(HOST_INITIALIZE_RESULT);
    await flush();

    panel.dispatch(TOOL_RESULT({ structuredContent: READY_STATUS }));
    await flush();

    const before = panel.sent.length;
    panel.element("btn-refresh").click();
    const call = panel.sent.slice(before).find((entry) => entry.message.method === "tools/call");
    panel.dispatch({
      jsonrpc: "2.0",
      id: call?.message.id,
      result: { content: [{ type: "text", text: "RAW-NOT-JSON" }] },
    });
    await flush();

    expect(panel.element("st-text").textContent).toBe(t("mcpUi.status.unknown", undefined, "en"));
    expect(panel.element("k-err").hidden).toBe(false);
    expect(panel.element("k-err").textContent).toBe(t("mcpUi.action.error", undefined, "en"));
    expect(panel.element("st-text").textContent).not.toContain("RAW-NOT-JSON");
    expect(panel.element("k-err").textContent).not.toContain("RAW-NOT-JSON");
    expect(panel.element("raw-out").textContent).toBe("RAW-NOT-JSON");
  });

  it("tools/call 超时：宿主不转发时给出失败态与出路，不会永远停在等待中", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(HOST_INITIALIZE_RESULT);
    await flush();

    panel.element("btn-refresh").click();
    // 宿主不回应这次 tools/call —— 手动把兜底定时器推到点
    panel.fireTimers();
    await flush();

    const err = panel.element("k-err");
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe(t("mcpUi.action.timeout", undefined, "en"));
    expect(err.textContent).not.toBe(t("mcpUi.action.pending", undefined, "en"));
    // 按钮从 loading 态恢复，可以再点
    expect(panel.element("btn-refresh").disabled).toBe(false);
    expect(panel.element("btn-refresh").textContent).toBe(
      t("mcpUi.next.action.refresh", undefined, "en"),
    );
  });
});
