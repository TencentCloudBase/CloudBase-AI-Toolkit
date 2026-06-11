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
 * 需要 cos-nodejs-sdk-v5：
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

  const server = await createCloudBaseMcpServer({
    enableTelemetry: false,
    ide: 'wxide',
    cloudBaseOptions: { envId, requestFn },
    pluginsEnabled: ['env', 'database-nosql', 'functions', 'storage', 'permissions', 'logs'],
    ...(storageOverrides ? { pluginOptions: { storage: storageOverrides } } : {}),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[test-with-ticket] ✅ MCP Server 已启动（stdio），等待 Inspector 连接...\n");
}

main().catch((e) => {
  process.stderr.write(`[test-with-ticket] 启动失败: ${e.stack}\n`);
  process.exit(1);
});
