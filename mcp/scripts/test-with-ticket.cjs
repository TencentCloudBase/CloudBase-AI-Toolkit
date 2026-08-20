#!/usr/bin/env node
/**
 * 本地用微信 IDE ticket 测试 MCP Server
 * 存储操作通过 /route/getcosauth 获取临时签名后走 COS 直连
 *
 * 使用方法：
 *   node scripts/test-with-ticket.cjs \
 *     --appid wxXXXXXXXX \
 *     --env-id your-env-id \
 *     --ticket "your-newticket-here"
 *
 * 消息推送测试组（msg-push 工具）：
 *   node scripts/test-with-ticket.cjs --appid wxX --env-id envX --ticket t --group msgpush
 *     # 真实调用 getappconfig/uploadappconfig 验证 subscribe 幂等 + confirm + unsubscribe 还原
 *   node scripts/test-with-ticket.cjs --appid wxX --env-id envX --ticket t --group msgpush --mock-msgpush
 *     # 使用内存模拟 qbase 后端验证幂等，不修改任何真实配置（无需真实 AppID 权限）
 *   --test-event EVENT   # 指定测试组订阅的事件（默认 user_enter_tempsession）
 *
 * 需要 cos-nodejs-sdk-v5（仅存储测试需要）：
 *   cd mcp && npm install cos-nodejs-sdk-v5 --no-save
 */

const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { createCloudBaseMcpServer } = require("../dist/index.cjs");
const https = require("https");

// 修复 webpack 打包的 source-map-support 在 Node v22 上的崩溃问题
// source-map-support 的 _createParsedCallSite 被 tree-shake 掉了，
// 但 ExceptionHandler 在 Error.prepareStackTrace 里调用它时会 crash。
// 用一个安全包装替代原始的 prepareStackTrace。
const origPrepareStackTrace = Error.prepareStackTrace;
Error.prepareStackTrace = function(err, structuredStack) {
  try {
    return origPrepareStackTrace ? origPrepareStackTrace(err, structuredStack) : err.stack;
  } catch {
    // source-map-support 的 ExceptionHandler 崩溃时使用 V8 默认格式
    return structuredStack.map(site => {
      try { return String(site); } catch { return '<unknown>'; }
    }).join('\n');
  }
};

// ─── 参数解析 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.findIndex((a) => a === flag);
  if (i !== -1 && args[i + 1]) return args[i + 1];
  const prefix = flag + "=";
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
};

const appid  = get("--appid")  || process.env.WX_APPID;
const envId  = get("--env-id") || process.env.CLOUDBASE_ENV_ID;
const ticket = get("--ticket") || process.env.WX_TICKET;

// ─── 消息推送测试组参数 ──────────────────────────────────────────────────────
// --group msgpush: 运行消息推送自动化测试组（真实 ticket 调用 getappconfig/uploadappconfig，
//                  或 --mock-msgpush 用内存模拟后端验证幂等）后退出
// --test-event:    测试组订阅的事件名（默认 user_enter_tempsession）
const testGroup = get("--group");
const testEvent = get("--test-event") || "user_enter_tempsession";
const mockMsgPush = args.includes("--mock-msgpush");

if (!appid || !envId || !ticket) {
  console.error("[test-with-ticket] 缺少必要参数");
  process.exit(1);
}

// ─── 代理支持 ────────────────────────────────────────────────────────────────
const HTTP_PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';

// Node 内置 http 模块实现 HTTP CONNECT 隧道代理
function createProxyAgent() {
  if (!HTTP_PROXY) return null;
  const pu = new URL(HTTP_PROXY);
  const HttpAgent = require('http');
  const HttpsAgent = require('https');

  // 自定义 Agent：对 HTTPS 请求走 HTTP CONNECT 隧道
  class TunnelAgent extends HttpsAgent.Agent {
    constructor() {
      super({ keepAlive: false });
    }
    createConnection(options, cb) {
      const net = require('net');
      const socket = net.connect(pu.port, pu.hostname, () => {
        const buf = `CONNECT ${options.host}:${options.port} HTTP/1.1\r\nHost: ${options.host}:${options.port}\r\n`;
        if (pu.username || pu.password) {
          const auth = Buffer.from(`${pu.username}:${pu.password}`).toString('base64');
          socket.write(`${buf}Proxy-Authorization: Basic ${auth}\r\n\r\n`);
        } else {
          socket.write(`${buf}\r\n`);
        }
        socket.once('data', (chunk) => {
          const resp = chunk.toString();
          if (!resp.startsWith('HTTP/1.1 200')) {
            cb(new Error(`Proxy CONNECT failed: ${resp.split('\r\n')[0]}`));
            return;
          }
          cb(null, socket);
        });
      });
      socket.on('error', cb);
    }
  }

  return new TunnelAgent();
}
const PROXY_AGENT = createProxyAgent();

// ─── 通用的带 ticket 的 HTTPS POST 请求 ─────────────────────────────────────
// 模拟 IDE 的 requestService.requestWithAppId({ url, method, needToken, body })
function httpsPost(urlStr, bodyStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const options = {
      hostname: u.hostname, path: u.pathname + u.search, method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(bodyStr) },
    };
    if (PROXY_AGENT) {
      options.agent = PROXY_AGENT;
    }
    const req = require('https').request(options, (res) => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error(`JSON parse error: ${d.slice(0, 200)}`)); }
      });
    });
    req.on("error", reject); req.write(bodyStr); req.end();
  });
}

const CLOUD_API_AGENT_URL = "https://servicewechat.com/wxa-dev-qbase/apihttpagent";
const COS_AUTH_URL = "https://servicewechat.com/wxa-dev-qbase/route/getcosauth";

function makeTicketUrl(base) {
  return `${base}?appid=${appid}&newticket=${encodeURIComponent(ticket)}&platform=0&os=darwin`;
}

// ─── CAPI requestFn ──────────────────────────────────────────────────────────
function createTicketRequestFn() {
  return async ({ service, action, version, region, payload }) => {
    const body = JSON.stringify({ service, action, version, region: region || "", postdata: JSON.stringify(payload) });
    const json = await httpsPost(makeTicketUrl(CLOUD_API_AGENT_URL), body);
    const inner = json?.content ? JSON.parse(json.content) : json;
    return inner?.Response ?? inner;
  };
}

// ─── COS 认证（模拟 IDE wx-ide-storage-overrides.ts 的 getCosAuth）──────────
async function getCosAuth({ region, bucket, method, path: cosPath }) {
  // 模拟 IDE requestWithAppId：appid 同时在 URL query 和 body 中
  // IDE 的 wx-ide-storage-overrides.ts 也是此格式
  const bodyStr = JSON.stringify({
    region, bucket,
    requestmethod: method,
    path: cosPath,
    params: "",
    signature_type: 0,
  });
  const json = await httpsPost(makeTicketUrl(COS_AUTH_URL), bodyStr);

  // 解析 base_resp（与 IDE 端一致）
  if (json?.base_resp?.ret !== 0) {
    throw new Error(`getcosauth failed (ret=${json?.base_resp?.ret}): ${json?.base_resp?.errmsg}`);
  }
  const data = typeof json.data === "string" ? JSON.parse(json.data) : json.data;
  if (!data?.signature || !data?.token) {
    throw new Error(`getcosauth 返回数据缺少 signature 或 token: ${JSON.stringify(data)}`);
  }
  return { signature: data.signature, token: data.token };
}

// ─── StorageOverrides（与 IDE wx-ide-storage-overrides.ts 一致的接口）─────────
function createStorageOverrides(bucket, region) {
  let COS;
  try {
    COS = require("cos-nodejs-sdk-v5");
  } catch {
    process.stderr.write("[test-with-ticket] ⚠️  cos-nodejs-sdk-v5 未安装，存储 override 跳过\n");
    return null;
  }

  /** 创建带动态签名的 COS 实例（与 IDE createCosClient 一致，增加错误处理和代理支持） */
  function createCosClient() {
    return new COS({
      Agent: PROXY_AGENT,
      getAuthorization: async (options, callback) => {
        try {
          const method = (options.Method || "get").toLowerCase();
          const cosPath = "/" + (options.Key || "");
          const auth = await getCosAuth({ bucket, region, method, path: cosPath });
          callback({ Authorization: auth.signature, XCosSecurityToken: auth.token });
        } catch (err) {
          process.stderr.write(`[test-with-ticket] COS auth 失败: ${err.message}\n`);
          callback(err);
        }
      },
    });
  }

  return {
    async listFiles({ cloudPath }) {
      const cos = createCosClient();
      return new Promise((resolve, reject) => {
        cos.getBucket({ Bucket: bucket, Region: region, Prefix: cloudPath, MaxKeys: 100 },
          (err, data) => err ? reject(err) : resolve(data?.Contents ?? []));
      });
    },
    async getFileInfo({ cloudPath }) {
      const cos = createCosClient();
      return new Promise((resolve, reject) => {
        cos.headObject({ Bucket: bucket, Region: region, Key: cloudPath },
          (err, data) => err ? reject(err) : resolve(data ?? {}));
      });
    },
    async getFileUrl({ cloudPath, maxAge }) {
      const cos = createCosClient();
      return new Promise((resolve, reject) => {
        cos.getObjectUrl({ Bucket: bucket, Region: region, Key: cloudPath, Sign: true, Expires: maxAge ?? 3600 },
          (err, data) => err ? reject(err) : resolve({ url: data?.Url ?? '', fileId: cloudPath }));
      });
    },
    async downloadFile({ cloudPath, localPath }) {
      const cos = createCosClient();
      const fs = require("fs");
      const path = require("path");
      await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
      return new Promise((resolve, reject) => {
        cos.getObject({ Bucket: bucket, Region: region, Key: cloudPath, Output: localPath },
          (err) => err ? reject(err) : resolve());
      });
    },
    async uploadFile({ localPath, cloudPath }) {
      const cos = createCosClient();
      const fs = require("fs");
      return new Promise((resolve, reject) => {
        cos.putObject({ Bucket: bucket, Region: region, Key: cloudPath,
          Body: fs.createReadStream(localPath), ContentLength: fs.statSync(localPath).size },
          (err) => err ? reject(err) : resolve());
      });
    },
    async deleteFiles({ cloudPaths }) {
      const cos = createCosClient();
      return new Promise((resolve, reject) => {
        cos.deleteMultipleObject({ Bucket: bucket, Region: region,
          Objects: cloudPaths.map(Key => ({ Key })) },
          (err) => err ? reject(err) : resolve());
      });
    },
    async deleteDirectory({ cloudPath }) {
      const cos = createCosClient();
      const prefix = cloudPath.endsWith("/") ? cloudPath : cloudPath + "/";
      const files = await new Promise((resolve, reject) => {
        cos.getBucket({ Bucket: bucket, Region: region, Prefix: prefix, MaxKeys: 1000 },
          (err, data) => err ? reject(err) : resolve(data?.Contents ?? []));
      });
      if (!files.length) return;
      await new Promise((resolve, reject) => {
        cos.deleteMultipleObject({ Bucket: bucket, Region: region,
          Objects: files.map(f => ({ Key: f.Key })) },
          (err) => err ? reject(err) : resolve());
      });
    },
  };
}

// ─── 消息推送 qbase 传输层（模拟 IDE 的 ideRequest 直连 wxa-dev-qbase）────────
// 与微信云开发控制台 callbackconfig.ts 的 CGI 地址一致
const QBASE_BASE = "https://servicewechat.com/wxa-dev-qbase";
const QBASE_PATHS = {
  getAppConfig: `${QBASE_BASE}/getappconfig`,
  uploadAppConfig: `${QBASE_BASE}/uploadappconfig`,
  getCallbackSupportList: `${QBASE_BASE}/route/getcallbacksupportlist`,
  getContainerConfig: `${QBASE_BASE}/getcontainercallbackconfig`,
  setContainerConfig: `${QBASE_BASE}/setcontainercallbackconfig`,
};

/** 真实传输：带 ticket 直连 qbase CGI（POST，URL 带 appid/newticket） */
function createTicketMsgPushRequestFn() {
  return async ({ url, method = "post", body, appid: reqAppid }) => {
    const u = new URL(url);
    u.searchParams.set("appid", reqAppid || appid);
    u.searchParams.set("newticket", ticket);
    u.searchParams.set("platform", "0");
    u.searchParams.set("os", "darwin");
    const bodyStr = body ? JSON.stringify(body) : "{}";
    const json = await httpsPost(u.toString(), bodyStr);
    if (!json || !json.base_resp) {
      throw new Error(`qbase 响应缺少 base_resp: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return json;
  };
}

/**
 * 内存模拟 qbase 后端（--mock-msgpush 用）：
 * 与真实后端一致的全量覆盖 + version 乐观锁语义，可在无 ticket / 不动真实配置时验证幂等。
 */
function createMockMsgPushBackend() {
  const XPAY_EVENTS = [
    "xpay_goods_deliver_notify", "xpay_coin_pay_notify", "xpay_complaint_notify",
    "xpay_subscribe_signing_result_notify", "xpay_subscribe_pay_fail_notify",
    "xpay_subscribe_ios_refund_query_notify", "xpay_refund_notify",
  ];
  const supported = new Set(["user_enter_tempsession", "user_subscribe_msg", ...XPAY_EVENTS]);
  let version = 0;
  let enable = true;
  let callbacks = [];
  let qbaseOpen = false;

  return {
    requestFn: async ({ url, body }) => {
      if (url.endsWith("/getappconfig")) {
        return { base_resp: { ret: 0 }, version, config: JSON.stringify({ enable, callbacks }) };
      }
      if (url.endsWith("/route/getcallbacksupportlist")) {
        return {
          base_resp: { ret: 0 },
          data: JSON.stringify({ list: [...supported].map((event) => ({ msgType: "event", event })) }),
        };
      }
      if (url.endsWith("/uploadappconfig")) {
        const cfg = JSON.parse(body.config);
        version += 1;
        enable = cfg.enable !== false;
        callbacks = cfg.callbacks || [];
        return { base_resp: { ret: 0 } };
      }
      if (url.endsWith("/getcontainercallbackconfig")) {
        return { base_resp: { ret: 0 }, qbase_open: qbaseOpen };
      }
      if (url.endsWith("/setcontainercallbackconfig")) {
        qbaseOpen = body.qbase_open === true;
        return { base_resp: { ret: 0 } };
      }
      throw new Error(`mock qbase: 未知 CGI ${url}`);
    },
    state: () => ({ version, enable, callbacks, qbaseOpen }),
  };
}

// ─── 消息推送自动化测试组 ─────────────────────────────────────────────────────
// 使用 in-process MCP client 调用 queryMessagePush / manageMessagePush，验证：
// 1) list / listSupportedEvents 只读可用
// 2) subscribe 幂等（重复执行第二次返回 NO_CHANGE，不发起写请求）
// 3) unsubscribe 移除匹配条目（还原配置）
// 真实模式会真实修改小程序配置（随后还原）；模拟模式（--mock-msgpush）不动任何线上配置。
async function runMsgPushTestGroup() {
  const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");

  process.stderr.write(`[test-with-ticket] 运行消息推送测试组（event=${testEvent}, mock=${mockMsgPush}）...\n`);

  const mockBackend = createMockMsgPushBackend();
  const msgPushRequestFn = mockMsgPush
    ? mockBackend.requestFn
    : createTicketMsgPushRequestFn();

  const server = await createCloudBaseMcpServer({
    enableTelemetry: false,
    ide: "wxide",
    cloudBaseOptions: { envId, requestFn: createTicketRequestFn() },
    pluginsEnabled: ["msg-push"],
    pluginOptions: { msgPush: { requestFn: msgPushRequestFn } },
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "msgpush-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  const call = async (name, args) => {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? "{}";
    return JSON.parse(text);
  };

  const baseArgs = { appid, env_id: envId, function_name: "msg-push-test-fn" };

  // 1. 只读检查
  const list1 = await call("queryMessagePush", { appid, action: "list" });
  if (!list1.success) throw new Error(`queryMessagePush(list) 失败: ${JSON.stringify(list1)}`);
  process.stderr.write(`[msgpush] ✅ list 成功：version=${list1.version}, callbacks=${list1.callbacks.length}\n`);

  const supported = await call("queryMessagePush", { appid, action: "listSupportedEvents" });
  if (!supported.success) throw new Error(`listSupportedEvents 失败: ${JSON.stringify(supported)}`);
  const eventValid = supported.msgTypes
    .flatMap((g) => g.events)
    .includes(testEvent);
  process.stderr.write(`[msgpush] ✅ listSupportedEvents 成功：${supported.totalEvents} 个合法事件（${testEvent} 合法=${eventValid}）\n`);
  if (!eventValid && !mockMsgPush) {
    throw new Error(`测试事件 ${testEvent} 不在合法约束内，请用 --test-event 指定其他事件`);
  }

  // 2. subscribe（首次应产生变更）
  const sub1 = await call("manageMessagePush", {
    ...baseArgs,
    action: "subscribe",
    event_types: [testEvent],
    confirm: "yes",
  });
  if (!sub1.success) throw new Error(`subscribe 首次执行失败: ${JSON.stringify(sub1)}`);
  if (sub1.code === "NO_CHANGE") {
    process.stderr.write(`[msgpush] ⚠️ ${testEvent} 已订阅（幂等 no-op）\n`);
  } else {
    process.stderr.write(`[msgpush] ✅ subscribe 成功：added=${JSON.stringify(sub1.added)}, rebound=${JSON.stringify(sub1.rebound)}\n`);
  }

  // 3. subscribe 重复执行 → 必须 NO_CHANGE（幂等核心验证）
  const sub2 = await call("manageMessagePush", {
    ...baseArgs,
    action: "subscribe",
    event_types: [testEvent],
    confirm: "yes",
  });
  if (sub2.code !== "NO_CHANGE") {
    throw new Error(`幂等验证失败：重复 subscribe 期望 NO_CHANGE，实际 ${JSON.stringify(sub2)}`);
  }
  process.stderr.write("[msgpush] ✅ 幂等验证通过：重复 subscribe 返回 NO_CHANGE（未重复写入）\n");

  // 4. confirm 保护验证：不带 confirm 应返回 CONFIRM_REQUIRED
  const noConfirm = await call("manageMessagePush", {
    ...baseArgs,
    action: "unsubscribe",
    event_types: [testEvent],
  });
  if (noConfirm.code !== "CONFIRM_REQUIRED") {
    throw new Error(`confirm 保护验证失败：期望 CONFIRM_REQUIRED，实际 ${JSON.stringify(noConfirm)}`);
  }
  process.stderr.write("[msgpush] ✅ confirm 保护验证通过：未确认时返回 CONFIRM_REQUIRED\n");

  // 5. unsubscribe 还原
  const unsub = await call("manageMessagePush", {
    ...baseArgs,
    action: "unsubscribe",
    event_types: [testEvent],
    confirm: "yes",
  });
  if (!unsub.success && unsub.code !== "NO_CHANGE") {
    throw new Error(`unsubscribe 失败: ${JSON.stringify(unsub)}`);
  }
  process.stderr.write("[msgpush] ✅ unsubscribe 成功（配置已还原）\n");

  if (mockMsgPush) {
    process.stderr.write(`[msgpush] mock 后端最终状态：version=${mockBackend.state().version}, callbacks=${mockBackend.state().callbacks.length}\n`);
  }

  await client.close();
  process.stderr.write("[msgpush] 🎉 消息推送测试组全部通过\n");
  process.exit(0);
}

// ─── 启动 MCP Server ─────────────────────────────────────────────────────────
async function main() {
  process.stderr.write(`[test-with-ticket] appid=${appid} envId=${envId}\n`);
  process.stderr.write(`[test-with-ticket] ticket=${ticket.slice(0, 20)}...\n`);

  const requestFn = createTicketRequestFn();

  // 验证 ticket 并获取存储桶信息
  process.stderr.write("[test-with-ticket] 验证 ticket 有效性（DescribeEnvs）...\n");
  let envResult;
  try {
    envResult = await requestFn({
      service: "tcb", action: "DescribeEnvs", version: "2018-06-08", region: "", payload: { Limit: 1 },
    });
    if (envResult?.Error) throw new Error(JSON.stringify(envResult.Error));
    process.stderr.write(`[test-with-ticket] ✅ ticket 有效，env 数量: ${envResult?.EnvList?.length ?? "unknown"}\n`);
  } catch (e) {
    process.stderr.write(`[test-with-ticket] ❌ ticket 无效: ${e.message}\n`);
    process.exit(1);
  }

  // 从 DescribeEnvs 获取存储桶信息，创建 StorageOverrides
  const storage = envResult?.EnvList?.[0]?.Storages?.[0];
  let storageOverrides = null;
  if (storage?.Bucket && storage?.Region) {
    process.stderr.write(`[test-with-ticket] 存储桶: ${storage.Bucket} region: ${storage.Region}\n`);
    storageOverrides = createStorageOverrides(storage.Bucket, storage.Region);
    if (storageOverrides) {
      process.stderr.write("[test-with-ticket] ✅ StorageOverrides 已创建（COS 直连模式）\n");
    }
  }

  // 消息推送：真实 ticket 传输（或 --mock-msgpush 内存模拟后端）
  const msgPushRequestFn = mockMsgPush
    ? createMockMsgPushBackend().requestFn
    : createTicketMsgPushRequestFn();
  process.stderr.write(`[test-with-ticket] ✅ msg-push 传输层已注入（${mockMsgPush ? "mock" : "real ticket"}）\n`);

  const server = await createCloudBaseMcpServer({
    enableTelemetry: false,
    ide: 'wxide',
    cloudBaseOptions: { envId, requestFn },
    pluginsEnabled: ['env', 'database-nosql', 'functions', 'storage', 'permissions', 'logs', 'msg-push'],
    pluginOptions: {
      ...(storageOverrides ? { storage: storageOverrides } : {}),
      msgPush: { requestFn: msgPushRequestFn },
    },
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[test-with-ticket] ✅ MCP Server 已启动（stdio），等待 Inspector 连接...\n");
}

// --group msgpush：运行消息推送自动化测试组后退出（不启动 stdio server）
if (testGroup === "msgpush") {
  runMsgPushTestGroup().catch((e) => {
    process.stderr.write(`[test-with-ticket] ❌ 消息推送测试组失败: ${e.message}\n`);
    process.exit(1);
  });
  return;
}

main().catch((e) => {
  process.stderr.write(`[test-with-ticket] 启动失败: ${e.stack}\n`);
  process.exit(1);
});
