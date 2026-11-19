#!/usr/bin/env node
/**
 * CloudBase MCP stdio wrapper
 *
 * 与官方托管的远端 MCP 同源：同一个 createCloudBaseMcpServer 工厂。
 * 远端形态用它 + StreamableHTTPServerTransport 做多租户服务，
 * 本示例换 InMemoryTransport（进程内对接官方 server）+ StdioServerTransport（对 IDE）。
 *
 * 三条纪律：
 * 1. stdout 只写 JSON-RPC，所有日志走 stderr。混一个 console.log 客户端就崩。
 * 2. 不 spawn 子进程。官方 server 跑在同一进程，由 in-memory 传输对接。
 * 3. 工具可见性与动作可执行性分开管，两层都要。
 */

import process from 'node:process';
import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { parseAllowTools, isToolAllowed, isActionAllowed, patchArguments } from './policy.mjs';

/**
 * 必须走 CJS 入口。
 * ESM 入口 dist/index.js 是 2.4MB 未打包版本，会 import 一批没写进 dependencies 的
 * 内部包（@cloudbase/cals 等），而且那些包的 CJS 文件里相对 import 缺 .js 扩展名，
 * Node 的 ESM 解析器直接报 ERR_MODULE_NOT_FOUND。
 * dist/index.cjs 是 12MB 自包含 bundle，不依赖任何外部包；也别用 esbuild 二次打包它。
 */
const require = createRequire(import.meta.url);
const { createCloudBaseMcpServer } = require('@cloudbase/cloudbase-mcp');

const log = (...args) => console.error('[cbw]', ...args);

const ENV_ID = process.env.CLOUDBASE_ENV_ID;
const API_KEY = process.env.CLOUDBASE_API_KEY ?? process.env.CLOUDBASE_APIKEY;
const SERVICE_PREFIX = process.env.CBW_SERVICE_PREFIX ?? '';

if (!ENV_ID) {
  log('缺少 CLOUDBASE_ENV_ID，退出');
  process.exit(1);
}
if (!API_KEY) {
  log('缺少 CLOUDBASE_API_KEY，退出。这个 wrapper 不接受其他凭证形式。');
  process.exit(1);
}

let allowTools;
try {
  allowTools = parseAllowTools(process.env.CBW_ALLOW_TOOLS);
} catch (err) {
  log(err.message);
  process.exit(1);
}

/**
 * 上游：官方 MCP，进程内实例。
 *
 * 凭证解析的真实行为（按 mcp/src/auth.ts 核对）：
 * - API Key 分支的条件是 `apiKey && process.env.CLOUDBASE_ENV_ID`——两个变量必须同时在
 *   环境里，cloudBaseOptions.envId 不参与凭证解析（getEnvId 读它但不回填 env）
 * - Key 换证失败会被吞掉（return null），然后回落到全局登录态。若机器上有历史登录态，
 *   wrapper 会带着账号级权限继续跑——这是越权面，所以连接 IDE 前必须做作用域自检
 */
const upstream = await createCloudBaseMcpServer({
  name: 'cloudbase-mcp',
  ide: 'stdio-wrapper',
  cloudMode: false,
  pluginsEnabled: ['apps', 'env'],
  cloudBaseOptions: { envId: ENV_ID },
});

/**
 * 凭证自检：auth(action="status") 三项同时成立才放行。
 * - auth_status=READY：真的登录了（credential_scope 只反映变量是否配齐，不验证 Key 有效性）
 * - credential_scope=single_env：环境级作用域
 * - credential_source=env：凭证来自进程环境变量，不是机器上的全局登录态
 * 返回读不到或不是 JSON 一律拒绝启动，不带未知权限继续跑。
 * 测试/CI 可用 CBW_SKIP_AUTH_CHECK=1 跳过，仅用于协议层验证。
 */
async function checkCredentialScope() {
  if (process.env.CBW_SKIP_AUTH_CHECK === '1') {
    log('跳过凭证自检（CBW_SKIP_AUTH_CHECK=1），仅限协议层验证');
    return;
  }
  let status;
  try {
    const res = await upstreamClient.callTool({ name: 'auth', arguments: { action: 'status' } });
    const text = (res.content ?? []).map((c) => c.text ?? '').join('\n');
    status = JSON.parse(text);
  } catch (err) {
    log(`拒绝启动：无法读取 auth(action="status") 的返回（${String(err.message).slice(0, 80)}）。凭证状态不明，不能带未知权限继续运行。`);
    process.exit(1);
  }
  const ok = status.auth_status === 'READY'
    && status.credential_scope === 'single_env'
    && status.credential_source === 'env';
  if (!ok) {
    log(`拒绝启动：凭证未生效（auth_status=${status.auth_status}, scope=${status.credential_scope}, source=${status.credential_source}）。请确认 CLOUDBASE_ENV_ID 与 CLOUDBASE_API_KEY 成对配置且 Key 有效。`);
    process.exit(1);
  }
  log('凭证自检通过：READY / single_env / env');
}

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await upstream.connect(serverTransport);

const upstreamClient = new Client(
  { name: 'cloudbase-wrapper', version: '0.1.0' },
  { capabilities: {} },
);
await upstreamClient.connect(clientTransport);

/** 取全量工具，处理分页 */
async function listAllTools() {
  const tools = [];
  let cursor;
  do {
    const page = await upstreamClient.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

const wrapper = new Server(
  { name: 'cloudbase-wrapper', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

/** 第一层：模型只看见白名单工具，且参数 enum 里没有被禁的 action */
wrapper.setRequestHandler(ListToolsRequestSchema, async () => {
  const all = await listAllTools();
  const visible = [];
  for (const tool of all) {
    if (!isToolAllowed(tool.name, allowTools)) continue;
    // schema 改写：把不允许的 action 从参数 enum 里剪掉，模型源头看不见
    const actionProp = tool.inputSchema?.properties?.action;
    if (actionProp?.enum) {
      actionProp.enum = actionProp.enum.filter((a) => isActionAllowed(tool.name, a));
      if (actionProp.enum.length === 0) continue; // 整工具只剩禁用动作，不暴露
    }
    visible.push(tool);
  }
  log(`tools/list：${all.length} 个 → 暴露 ${visible.length} 个`);
  return { tools: visible };
});

/** 第二层：挡住不该执行的动作，并注入业务参数 */
wrapper.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: rawArgs = {} } = req.params;
  const action = rawArgs.action;
  const startedAt = Date.now();

  if (!allowTools.includes(name)) {
    return deny(`工具 ${name} 未对该业务开放。不要重试，也不要换工具绕过。`);
  }

  if (!isActionAllowed(name, action)) {
    return deny(`${name}.${action} 未对该业务开放。这是权限限制，重试无效。`);
  }

  const patched = patchArguments(name, rawArgs, SERVICE_PREFIX);

  try {
    const result = await upstreamClient.callTool({ name, arguments: patched });
    audit({ name, action, serviceName: patched.serviceName, status: 'ok', costMs: Date.now() - startedAt });
    return result;
  } catch (err) {
    audit({ name, action, serviceName: patched.serviceName, status: 'error', error: err.message, costMs: Date.now() - startedAt });
    throw err;
  }
});

function deny(text) {
  log('denied:', text);
  return { content: [{ type: 'text', text }], isError: true };
}

function audit(event) {
  console.error('[cbw-audit]', JSON.stringify({ ts: new Date().toISOString(), envId: ENV_ID, ...event }));
}

await checkCredentialScope();

/** 接 IDE。stdio 传输是唯一往 stdout 写的东西 */
await wrapper.connect(new StdioServerTransport());
log(`已就绪 env=${ENV_ID} tools=${allowTools.join(',')} prefix=${SERVICE_PREFIX || '-'}`);

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  log(`收到 ${signal}，收起上游`);
  try {
    await upstreamClient.close();
    await upstream.close();
  } catch (err) {
    log('关闭时出错:', err.message);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.stdin.on('end', () => shutdown('stdin end'));
