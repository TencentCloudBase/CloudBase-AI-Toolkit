import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import type { MsgPushQbaseResponse } from "../types.js";
import {
  mergeSetEnableList,
  mergeSubscribeList,
  mergeUnsubscribeList,
  registerMsgPushTools,
  XPAY_EVENT_TYPES,
} from "./msg-push.js";

/**
 * 有状态的 qbase CGI mock：模拟真实后端 getappconfig/uploadappconfig 行为
 * （全量覆盖 + version 乐观锁），使幂等测试贴近真实语义。
 */
function createQbaseBackendMock(options?: {
  initialCallbacks?: Array<Record<string, unknown>>;
  initialVersion?: number;
  supportedEvents?: string[];
  containerQbaseOpen?: boolean;
  /** 上传携带该 version 时返回版本冲突（模拟并发写入） */
  conflictOnVersion?: number;
}) {
  let version = options?.initialVersion ?? 0;
  let enable = true;
  let callbacks = [...(options?.initialCallbacks ?? [])];
  let containerQbaseOpen = options?.containerQbaseOpen ?? false;

  const supportedEvents = new Set(
    options?.supportedEvents ?? ["user_enter_tempsession", ...XPAY_EVENT_TYPES],
  );

  const calls: Array<{ action: string; payload?: Record<string, unknown> }> = [];

  const requestFn = async (params: {
    service: string;
    action: string;
    version: string;
    region: string;
    payload: Record<string, unknown>;
  }): Promise<MsgPushQbaseResponse> => {
    calls.push({ action: params.action, payload: params.payload });
    if (params.action === "getAppConfig") {
      return {
        base_resp: { ret: 0 },
        version,
        config: JSON.stringify({ enable, callbacks }),
      };
    }
    if (params.action === "getCallbackSupportList") {
      return {
        base_resp: { ret: 0 },
        data: JSON.stringify({
          list: [...supportedEvents].map((event) => ({ msgType: "event", event })),
        }),
      };
    }
    if (params.action === "uploadAppConfig") {
      const body = params.payload ?? {};
      if (options?.conflictOnVersion !== undefined && body.version === options.conflictOnVersion) {
        return {
          base_resp: { ret: 99999, errmsg: "version conflict, please refresh" },
        };
      }
      if (body.version !== version) {
        return {
          base_resp: { ret: 99999, errmsg: "version conflict, please refresh" },
        };
      }
      const config = JSON.parse(String(body.config));
      version += 1;
      enable = config.enable !== false;
      callbacks = config.callbacks ?? [];
      return { base_resp: { ret: 0 } };
    }
    if (params.action === "getContainerCallbackConfig") {
      return {
        base_resp: { ret: 0 },
        qbase_open: containerQbaseOpen,
        qbase_env: "env-container",
        qbase_container_path: "/push",
      };
    }
    if (params.action === "setContainerCallbackConfig") {
      containerQbaseOpen = params.payload?.qbase_open === true;
      return { base_resp: { ret: 0 } };
    }
    throw new Error(`unexpected qbase action: ${params.action}`);
  };

  return {
    requestFn,
    calls,
    getState: () => ({ version, enable, callbacks, containerQbaseOpen }),
  };
}

function createMockServer(requestFn: (params: any) => Promise<MsgPushQbaseResponse>) {
  const tools: Record<
    string,
    {
      meta: any;
      handler: (args: any) => Promise<any>;
    }
  > = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", requestFn },
    logger: vi.fn(),
    pluginOptions: {},
    registerTool: vi.fn(
      (name: string, meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { meta, handler };
      },
    ),
  } as unknown as ExtendedMcpServer;

  registerMsgPushTools(server);

  return { tools, server };
}

function parseResult(result: any): any {
  const text = result.content[0].text;
  return JSON.parse(text);
}

describe("msg-push tools schema", () => {
  const { tools } = createMockServer(async () => ({ base_resp: { ret: 0 } }));

  it("queryMessagePush schema: action enum + appid required", () => {
    const schema = tools.queryMessagePush.meta.inputSchema;
    expect(schema.action._def.values).toEqual(["list", "listSupportedEvents"]);
    expect(schema.appid._def.typeName).toBe("ZodString");
    expect(schema.env?._def?.typeName).toBe("ZodOptional");
  });

  it("manageMessagePush schema: action enum, open event_types, confirm", () => {
    const schema = tools.manageMessagePush.meta.inputSchema;
    expect(schema.action._def.values).toEqual([
      "subscribe",
      "unsubscribe",
      "setEnable",
      "ensureCloudFunctionMode",
    ]);
    // event_types 是开放字符串数组（工具通用，不按 xpay 枚举收窄）
    expect(schema.event_types._def.typeName).toBe("ZodOptional");
    expect(schema.event_types._def.innerType._def.typeName).toBe("ZodArray");
    expect(schema.event_types._def.innerType._def.type._def.typeName).toBe("ZodString");
    expect(schema.env_id._def.typeName).toBe("ZodString");
    expect(schema.function_name._def.typeName).toBe("ZodString");
  });

  it("XPAY_EVENT_TYPES 默认集合包含虚拟支付 7 事件", () => {
    expect(XPAY_EVENT_TYPES).toHaveLength(7);
    expect(XPAY_EVENT_TYPES).toContain("xpay_goods_deliver_notify");
    expect(XPAY_EVENT_TYPES).toContain("xpay_refund_notify");
  });
});

describe("msg-push transport", () => {
  it("未注入 requestFn 时返回 MSG_PUSH_TRANSPORT_UNAVAILABLE 指引", async () => {
    const tools: Record<string, any> = {};
    const server = {
      cloudBaseOptions: { envId: "env-test" },
      logger: vi.fn(),
      pluginOptions: {},
      registerTool: vi.fn(
        (name: string, meta: any, handler: (args: any) => Promise<any>) => {
          tools[name] = { meta, handler };
        },
      ),
    } as unknown as ExtendedMcpServer;
    registerMsgPushTools(server);

    const result = parseResult(
      await tools.queryMessagePush.handler({ appid: "wx123", action: "list" }),
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MSG_PUSH_TRANSPORT_UNAVAILABLE");
    expect(result.next_step.tool).toBe("queryMessagePush");
  });
});

describe("queryMessagePush", () => {
  let backend: ReturnType<typeof createQbaseBackendMock>;
  let tools: any;

  beforeEach(() => {
    backend = createQbaseBackendMock({
      initialCallbacks: [
        { msgType: "event", event: "user_enter_tempsession", env: "env-a", functionName: "cb", enable: true },
        { msgType: "event", event: "xpay_refund_notify", env: "env-b", functionName: "pay-cb", enable: false },
      ],
      initialVersion: 3,
    });
    tools = createMockServer(backend.requestFn).tools;
  });

  it("list 返回 version/enable/callbacks，并支持 env 过滤", async () => {
    const all = parseResult(
      await tools.queryMessagePush.handler({ appid: "wx1", action: "list" }),
    );
    expect(all.success).toBe(true);
    expect(all.version).toBe(3);
    expect(all.callbacks).toHaveLength(2);
    expect(all.callbacks[0]).toMatchObject({
      msgType: "event",
      event: "user_enter_tempsession",
      env: "env-a",
      functionName: "cb",
    });

    const filtered = parseResult(
      await tools.queryMessagePush.handler({ appid: "wx1", action: "list", env: "env-b" }),
    );
    expect(filtered.callbacks).toHaveLength(1);
    expect(filtered.callbacks[0].event).toBe("xpay_refund_notify");
  });

  it("listSupportedEvents 按 msgType 分组并标注 xpay 默认集合", async () => {
    const result = parseResult(
      await tools.queryMessagePush.handler({ appid: "wx1", action: "listSupportedEvents" }),
    );
    expect(result.success).toBe(true);
    const eventGroup = result.msgTypes.find((g: any) => g.msgType === "event");
    expect(eventGroup.events).toContain("user_enter_tempsession");
    expect(eventGroup.events).toContain("xpay_refund_notify");
    expect(result.xpay_default_events.supported).toHaveLength(7);
    expect(result.xpay_default_events.missing).toHaveLength(0);
  });
});

describe("manageMessagePush — 幂等与 merge", () => {
  let backend: ReturnType<typeof createQbaseBackendMock>;
  let tools: any;

  beforeEach(() => {
    backend = createQbaseBackendMock({
      initialCallbacks: [
        { msgType: "event", event: "user_enter_tempsession", env: "env-a", functionName: "cb", enable: true },
        { msgType: "event", event: "xpay_refund_notify", env: "env-a", functionName: "other-fn", enable: true },
      ],
      initialVersion: 3,
    });
    tools = createMockServer(backend.requestFn).tools;
  });

  it("subscribe 无 confirm 时返回 CONFIRM_REQUIRED，不发起写请求", async () => {
    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "subscribe",
        event_types: ["xpay_goods_deliver_notify"],
      }),
    );
    expect(result.code).toBe("CONFIRM_REQUIRED");
    expect(result.next_step.requiredParams).toContain("confirm");
    const uploadCalls = backend.calls.filter((c) => c.action === "uploadAppConfig");
    expect(uploadCalls).toHaveLength(0);
  });

  it("subscribe 重复执行幂等：完全相同的订阅不再 POST", async () => {
    const args = {
      appid: "wx1",
      env_id: "env-a",
      function_name: "cb",
      action: "subscribe",
      event_types: ["user_enter_tempsession"],
      confirm: "yes",
    };
    // 第一次：user_enter_tempsession 已绑定 env-a/cb → 无变化（幂等 no-op）
    const first = parseResult(await tools.manageMessagePush.handler(args));
    expect(first.code).toBe("NO_CHANGE");
    expect(backend.calls.filter((c) => c.action === "uploadAppConfig")).toHaveLength(0);
  });

  it("subscribe 一事一函数：同事件已绑定其他函数时重绑并全量覆盖", async () => {
    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "subscribe",
        event_types: ["xpay_refund_notify"],
        confirm: "yes",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.rebound).toEqual(["xpay_refund_notify"]);
    expect(result.callbacks.find((c: any) => c.event === "xpay_refund_notify")).toMatchObject({
      env: "env-a",
      functionName: "cb",
      enable: true,
    });
    // 其他配置保留
    expect(result.callbacks).toHaveLength(2);
  });

  it("subscribe 缺省 event_types 时默认订阅虚拟支付 7 事件", async () => {
    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "subscribe",
        confirm: "yes",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.added).toHaveLength(7);
    expect(result.added.sort()).toEqual([...XPAY_EVENT_TYPES].sort());
  });

  it("subscribe 显式非法事件被拒绝（INVALID_EVENT_TYPE）且不写", async () => {
    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "subscribe",
        event_types: ["not_a_real_event"],
        confirm: "yes",
      }),
    );
    expect(result.code).toBe("INVALID_EVENT_TYPE");
    expect(result.invalid_events).toEqual(["not_a_real_event"]);
    expect(result.next_step.tool).toBe("queryMessagePush");
    expect(backend.calls.filter((c) => c.action === "uploadAppConfig")).toHaveLength(0);
  });

  it("unsubscribe 只移除匹配条目，保留其他配置；无匹配时幂等 no-op", async () => {
    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "unsubscribe",
        event_types: ["user_enter_tempsession"],
        confirm: "yes",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.removed).toEqual(["user_enter_tempsession"]);
    expect(result.callbacks).toHaveLength(1);
    expect(result.callbacks[0].event).toBe("xpay_refund_notify");

    // 再次执行 → 无变化
    const again = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "unsubscribe",
        event_types: ["user_enter_tempsession"],
        confirm: "yes",
      }),
    );
    expect(again.code).toBe("NO_CHANGE");
  });

  it("unsubscribe 不触碰绑定到其他函数的同事件", async () => {
    // xpay_refund_notify 绑定在 env-a/other-fn，从 env-a/cb 取消不影响它
    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "unsubscribe",
        event_types: ["xpay_refund_notify"],
        confirm: "yes",
      }),
    );
    expect(result.code).toBe("NO_CHANGE");
    // 后端状态未被改动，other-fn 的绑定仍在
    expect(
      backend.getState().callbacks.find((c: any) => c.event === "xpay_refund_notify")!.functionName,
    ).toBe("other-fn");
  });

  it("setEnable 翻转匹配条目 enable，不匹配时 no-op", async () => {
    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "setEnable",
        event_types: ["user_enter_tempsession"],
        enable: false,
        confirm: "yes",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.matched).toEqual(["user_enter_tempsession"]);
    expect(result.callbacks.find((c: any) => c.event === "user_enter_tempsession").enable).toBe(false);
  });

  it("setEnable 缺 enable 参数时报错", async () => {
    await expect(
      tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "setEnable",
        event_types: ["user_enter_tempsession"],
      }),
    ).rejects.toThrow("setEnable 必须提供 enable");
  });
});

describe("manageMessagePush — version 冲突与错误处理", () => {
  it("upload version 冲突返回可重试 VERSION_CONFLICT", async () => {
    const backend = createQbaseBackendMock({
      initialCallbacks: [],
      initialVersion: 5,
      conflictOnVersion: 5,
    });
    const tools = createMockServer(backend.requestFn).tools;

    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "subscribe",
        event_types: ["user_enter_tempsession"],
        confirm: "yes",
      }),
    );
    expect(result.code).toBe("VERSION_CONFLICT");
    expect(result.retryable).toBe(true);
    expect(result.next_step.tool).toBe("queryMessagePush");
    expect(result.message).toMatch(/version/);
  });

  it("upload 其他业务错误返回 QBASE_ERROR（可重试）", async () => {
    const requestFn = async (params: any) => {
      if (params.action === "uploadAppConfig") {
        return { base_resp: { ret: 50001, errmsg: "internal error" } };
      }
      if (params.action === "getAppConfig") {
        return {
          base_resp: { ret: 0 },
          version: 0,
          config: JSON.stringify({ enable: true, callbacks: [] }),
        };
      }
      if (params.action === "getCallbackSupportList") {
        return {
          base_resp: { ret: 0 },
          data: JSON.stringify({ list: [{ msgType: "event", event: "user_enter_tempsession" }] }),
        };
      }
      return { base_resp: { ret: 0 } };
    };
    const tools = createMockServer(requestFn).tools;

    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "subscribe",
        event_types: ["user_enter_tempsession"],
        confirm: "yes",
      }),
    );
    expect(result.code).toBe("QBASE_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("getappconfig 返回 80209 时视为空配置，首次 subscribe 可正常写入", async () => {
    const backend = createQbaseBackendMock();
    // 覆盖 getappconfig 返回 80209
    const requestFn = async (params: any) => {
      if (params.action === "getAppConfig") {
        return { base_resp: { ret: 80209, errmsg: "config not exists" } };
      }
      return backend.requestFn(params);
    };
    const tools = createMockServer(requestFn).tools;

    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "subscribe",
        event_types: ["user_enter_tempsession"],
        confirm: "yes",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.added).toEqual(["user_enter_tempsession"]);
  });
});

describe("manageMessagePush — ensureCloudFunctionMode", () => {
  it("已是云函数模式（qbase_open=false）时 no-op", async () => {
    const backend = createQbaseBackendMock({ containerQbaseOpen: false });
    const tools = createMockServer(backend.requestFn).tools;

    const result = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "ensureCloudFunctionMode",
      }),
    );
    expect(result.code).toBe("NO_CHANGE");
  });

  it("云托管模式（qbase_open=true）需确认后切换 qbase_open=false", async () => {
    const backend = createQbaseBackendMock({ containerQbaseOpen: true });
    const tools = createMockServer(backend.requestFn).tools;

    const pending = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "ensureCloudFunctionMode",
      }),
    );
    expect(pending.code).toBe("CONFIRM_REQUIRED");
    expect(pending.message).toMatch(/云托管/);

    const done = parseResult(
      await tools.manageMessagePush.handler({
        appid: "wx1",
        env_id: "env-a",
        function_name: "cb",
        action: "ensureCloudFunctionMode",
        confirm: "yes",
      }),
    );
    expect(done.success).toBe(true);
    const setCalls = backend.calls.filter((c) => c.action === "setContainerCallbackConfig");
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]!.payload!.qbase_open).toBe(false);
    // 保留其他云托管字段
    expect(setCalls[0]!.payload!.qbase_container_path).toBe("/push");
  });
});

describe("merge 纯函数", () => {
  const current = [
    { msgType: "event", event: "a", env: "env1", functionName: "fn1", enable: true },
    { msgType: "event", event: "b", env: "env1", functionName: "fn2", enable: true },
    { msgType: "text", event: "", env: "env1", functionName: "fn1" },
  ];

  it("mergeSubscribeList 幂等：重复执行结果收敛", () => {
    const first = mergeSubscribeList(current, ["a", "c"], "env1", "fn1");
    const second = mergeSubscribeList(first.list, ["a", "c"], "env1", "fn1");
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.list).toEqual(first.list);
  });

  it("mergeSubscribeList 一事一函数重绑", () => {
    const result = mergeSubscribeList(current, ["b"], "env1", "fn1");
    expect(result.rebound).toEqual(["b"]);
    expect(result.list.find((e) => e.event === "b")!).toMatchObject({
      env: "env1",
      functionName: "fn1",
    });
  });

  it("mergeUnsubscribeList 只移除匹配的四元组", () => {
    const result = mergeUnsubscribeList(current, ["b"], "env1", "fn1");
    expect(result.changed).toBe(false); // b 绑定在 fn2，不匹配 fn1
    const result2 = mergeUnsubscribeList(current, ["b"], "env1", "fn2");
    expect(result2.removed).toEqual(["b"]);
    expect(result2.list).toHaveLength(2);
  });

  it("mergeSetEnableList 翻转 enable", () => {
    const result = mergeSetEnableList(current, ["a"], "env1", "fn1", false);
    expect(result.changed).toBe(true);
    expect(result.list.find((e) => e.event === "a")!.enable).toBe(false);
  });
});
