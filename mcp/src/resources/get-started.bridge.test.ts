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
  credentialScope: "account",
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
  textContent: string;
  getAttribute(name: string): string | null;
  addEventListener(type: string, fn: () => void): void;
  click(): void;
}

interface PanelHarness {
  /** 记录 View → Host 发出的每一条消息及其 targetOrigin */
  sent: Array<{ message: { jsonrpc?: string; id?: number; method?: string; params?: any; result?: any }; origin: string }>;
  /** 模拟 Host → View 的一条消息 */
  dispatch(message: unknown): void;
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
    elements.set(elementId, {
      id: elementId,
      hidden: true,
      textContent: "",
      getAttribute(name) {
        return attributes.get(elementId)?.[name.replace(/^data-/, "")] ?? null;
      },
      addEventListener(type, fn) {
        (handlers[type] ||= []).push(fn);
      },
      click() {
        (handlers.click ?? []).forEach((fn) => fn());
      },
    });
  }

  const sent: PanelHarness["sent"] = [];
  const messageListeners: Array<(event: { data: unknown }) => void> = [];
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
    dispatch(message) {
      messageListeners.forEach((fn) => fn({ data: message }));
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

  it("握手与加载阶段不发 tools/call（路径 1 是唯一会调用工具的地方）", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(HOST_INITIALIZE_RESULT);
    await flush();

    expect(panel.sent.some((entry) => entry.message.method === "tools/call")).toBe(false);
  });

  it("点路径 1：发一次只读 auth(status)，结果落到面板", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(HOST_INITIALIZE_RESULT);
    await flush();

    const before = panel.sent.length;
    panel.element("btn-check").click();

    const calls = panel.sent.slice(before).filter((entry) => entry.message.method === "tools/call");
    expect(calls).toHaveLength(1);
    expect(calls[0].message.params).toEqual({ name: "auth", arguments: { action: "status" } });

    panel.dispatch({
      jsonrpc: "2.0",
      id: calls[0].message.id,
      result: { content: [{ type: "text", text: "RESULT-FROM-SERVER" }] },
    });
    await flush();

    const out = panel.element("out");
    expect(out.hidden).toBe(false);
    expect(out.textContent).toContain("RESULT-FROM-SERVER");
  });

  it("点路径 2 / 3：只发 ui/message，且不发 tools/call", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(HOST_INITIALIZE_RESULT);
    await flush();

    const before = panel.sent.length;
    panel.element("btn-login").click();
    panel.element("btn-deploy").click();
    await flush();

    const messages = panel.sent.slice(before).filter((entry) => entry.message.method === "ui/message");
    expect(messages).toHaveLength(2);
    expect(messages[0].message.params).toEqual({
      role: "user",
      content: { type: "text", text: t("mcpUi.message.login", undefined, "en") },
    });
    expect(messages[1].message.params).toEqual({
      role: "user",
      content: { type: "text", text: t("mcpUi.message.deploy", undefined, "en") },
    });
    expect(panel.sent.slice(before).some((entry) => entry.message.method === "tools/call")).toBe(false);
  });

  it("消费 ui/notifications/tool-result：把那次 auth 调用的结果渲染出来", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));

    // 面板被当成本次 auth 调用的 UI 渲染时，宿主会把这个通知送来；忽略它，面板就会
    // "顶掉"真实结果、只剩静态卡片——这条断言就是为那个失败而写。
    const card = panel.element("tool-result-card");
    expect(card.hidden).toBe(true);

    panel.dispatch({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { content: [{ type: "text", text: "LIVE-AUTH-RESULT" }] },
    });
    await flush();

    expect(card.hidden).toBe(false);
    expect(panel.element("tool-result-out").textContent).toBe("LIVE-AUTH-RESULT");
  });

  it("tool-result 里的 HTML 只被当作文字（渲染路径不做注入）", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    const payload = '<img src=x onerror="alert(1)">';

    panel.dispatch({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { content: [{ type: "text", text: payload }] },
    });
    await flush();

    // textContent 原样保留：payload 没有被解析成元素（页面里没有 <img>，也没有 innerHTML 路径）
    expect(panel.element("tool-result-out").textContent).toBe(payload);
  });

  it("tools/call 超时：宿主不转发时显示失败态，不会永远停在等待中", async () => {
    const panel = loadPanel(buildGetStartedHtml("en", sampleStatus));
    panel.dispatch(HOST_INITIALIZE_RESULT);
    await flush();

    panel.element("btn-check").click();
    // 宿主不回应这次 tools/call —— 手动把兜底定时器推到点
    panel.fireTimers();
    await flush();

    const out = panel.element("out");
    expect(out.hidden).toBe(false);
    expect(out.textContent).toBe(t("mcpUi.action.timeout", undefined, "en"));
    expect(out.textContent).not.toBe(t("mcpUi.action.pending", undefined, "en"));
  });
});
