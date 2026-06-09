#!/usr/bin/env node
/**
 * 本地用微信 IDE ticket 测试 MCP Server
 *
 * 使用方法：
 *   node scripts/test-with-ticket.cjs \
 *     --appid wxXXXXXXXX \
 *     --env-id your-env-id \
 *     --ticket "your-newticket-here"
 *
 * 然后用 MCP Inspector 连接本地 stdio server 调试：
 *   npx @modelcontextprotocol/inspector node scripts/test-with-ticket.cjs --appid xxx --env-id xxx --ticket xxx
 */

const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { createCloudBaseMcpServer } = require("../dist/index.cjs");
const https = require("https");

// ─── 解析参数 ────────────────────────────────────────────────────────────────
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

// ─── CAPI requestFn ──────────────────────────────────────────────────────────
const CLOUD_API_AGENT_URL = "https://servicewechat.com/wxa-dev-qbase/apihttpagent";

function createTicketRequestFn(currentTicket) {
  return async ({ service, action, version, region, payload }) => {
    const url = `${CLOUD_API_AGENT_URL}?appid=${appid}&newticket=${encodeURIComponent(currentTicket)}&platform=0&os=darwin`;
    const body = JSON.stringify({ service, action, version, region: region || "", postdata: JSON.stringify(payload) });
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
        (res) => {
          let d = ""; res.on("data", c => d += c);
          res.on("end", () => {
            try { const j = JSON.parse(d); const inner = j?.content ? JSON.parse(j.content) : j; resolve(inner?.Response ?? inner); }
            catch (e) { reject(new Error(`JSON parse error: ${d.slice(0, 200)}`)); }
          });
        });
      req.on("error", reject); req.write(body); req.end();
    });
  };
}

// ─── 启动 MCP Server ─────────────────────────────────────────────────────────
async function main() {
  process.stderr.write(`[test-with-ticket] appid=${appid} envId=${envId}\n`);
  process.stderr.write(`[test-with-ticket] ticket=${ticket.slice(0, 20)}...\n`);

  const requestFn = createTicketRequestFn(ticket);

  // 冒烟测试
  process.stderr.write("[test-with-ticket] 验证 ticket 有效性（DescribeEnvs）...\n");
  try {
    const result = await requestFn({
      service: "tcb", action: "DescribeEnvs", version: "2018-06-08", region: "", payload: { Limit: 1 },
    });
    if (result?.Error) {
      process.stderr.write(`[test-with-ticket] ❌ ticket 无效: ${JSON.stringify(result.Error)}\n`);
      process.exit(1);
    }
    process.stderr.write(`[test-with-ticket] ✅ ticket 有效，env 数量: ${result?.EnvList?.length ?? "unknown"}\n`);
  } catch (e) {
    process.stderr.write(`[test-with-ticket] ❌ 请求失败: ${e.message}\n`);
    process.exit(1);
  }

  const server = await createCloudBaseMcpServer({
    enableTelemetry: false,
    ide: 'wxide',
    cloudBaseOptions: { envId, requestFn },
    pluginsEnabled: ['env', 'database-nosql', 'functions', 'storage', 'permissions', 'logs'],
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[test-with-ticket] ✅ MCP Server 已启动（stdio），等待 Inspector 连接...\n");
}

main().catch((e) => {
  process.stderr.write(`[test-with-ticket] 启动失败: ${e.stack}\n`);
  process.exit(1);
});
