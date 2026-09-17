/**
 * 连接矩阵真源（文档层）
 *
 * 站点域名、地域、能力差异以 `mcp/src/utils/site-map.ts` 为最终依据；本文件是它在
 * 文档侧的投影。改动顺序：先改 site-map.ts，再同步本文件，然后文档自动吃到。
 *
 * 派生关系：
 *   - connection-modes.mdx      站点矩阵、模式选择
 *   - getting-started.mdx       国际站提示
 *   - IDESelector.tsx           配置片段、一键安装链接
 *
 * ⚠️ README.md / README.zh-CN.md 是 Markdown，无法 import 本文件，只能人工对齐。
 * 站点或域名变更时记得同步改这两处。
 */

export type SiteId = 'domestic' | 'intl';

/** 连接模式：远端（HTTP，默认推荐）与本地（stdio，npx） */
export type ConnectionMode = 'remote' | 'local';

/**
 * 接入通道：客户端「拿到配置」的路径。决定页面上该渲染什么。
 *
 * - `deeplink`  有官方一键安装协议（Cursor / VSCode 系 / Trae）→ 出按钮
 * - `cli`       一条命令安装（Claude Code / Gemini CLI 等）→ 出命令
 * - `builtin`   客户端已内置 CloudBase，无需配置 → 不出配置，只指路
 * - `manual`    用户自己写配置文件 / 图形界面粘贴 → 出 JSON
 */
export type ChannelType = 'deeplink' | 'cli' | 'builtin' | 'manual';

export interface SiteDefinition {
  id: SiteId;
  label: string;
  labelEn: string;
  /** 远端模式 MCP 端点（Streamable HTTP）。站点由域名本身决定。 */
  mcpEndpoint: string;
  /** 控制台域名：开环境、建密钥、看文档都在这 */
  consoleHost: string;
  defaultRegion: string;
  regions: string[];
  capabilities: {
    /** 国际站暂未提供 NoSQL（文档数据库）相关工具 */
    noSql: boolean;
  };
}

export const SITES: Record<SiteId, SiteDefinition> = {
  domestic: {
    id: 'domestic',
    label: '国内站',
    labelEn: 'China',
    mcpEndpoint: 'https://tcb-api.cloud.tencent.com/mcp/v1',
    consoleHost: 'tcb.cloud.tencent.com',
    defaultRegion: 'ap-shanghai',
    regions: ['ap-shanghai', 'ap-guangzhou', 'ap-singapore'],
    capabilities: { noSql: true },
  },
  intl: {
    id: 'intl',
    label: '国际站',
    labelEn: 'International site',
    mcpEndpoint: 'https://tcb-api.tencentcloud.com/mcp/v1',
    consoleHost: 'tcb.tencentcloud.com',
    defaultRegion: 'ap-singapore',
    regions: ['ap-singapore'],
    capabilities: { noSql: false },
  },
};

export const SITE_IDS: SiteId[] = ['domestic', 'intl'];

/** npm 包名：本地模式与 MCP Registry 共用 */
export const MCP_PACKAGE = '@cloudbase/cloudbase-mcp';

/** 本地模式启动命令 */
export const LOCAL_RUN_COMMAND = `npx ${MCP_PACKAGE}@latest`;

/** MCP 服务在客户端配置里的固定名字 */
export const MCP_SERVER_NAME = 'cloudbase';

/** 远端端点（裸地址，走 OAuth 时用这个：不带 env_id、不带密钥） */
export function buildRemoteEndpoint(siteId: SiteId): string {
  return SITES[siteId].mcpEndpoint;
}

/**
 * 远端 URL。
 *
 * `site` query 参数**不是**用来切站点的——站点由域名决定。它只在
 * 「国内站账号 + ap-singapore 环境」这种两个站点都存在该地域、服务端无法
 * 从 env_id 归属时才需要显式声明。国际站域名访问 ap-singapore 无需传。
 */
export function buildRemoteUrl(
  siteId: SiteId,
  opts: { envId?: string; declareAmbiguousSite?: boolean } = {},
): string {
  const { mcpEndpoint } = SITES[siteId];
  // 手工拼接而非 URLSearchParams：占位符 `<env_id>` 需要原样展示给用户，不能被转义成 %3C
  const params = [`env_id=${opts.envId || '<env_id>'}`];
  if (opts.declareAmbiguousSite) {
    params.push(`site=${siteId}`);
  }
  return `${mcpEndpoint}?${params.join('&')}`;
}

/** 本地模式配置片段 */
export function buildLocalConfig(ideName = 'Cursor'): string {
  return JSON.stringify(
    {
      mcpServers: {
        cloudbase: {
          command: 'npx',
          args: [`${MCP_PACKAGE}@latest`],
          env: { INTEGRATION_IDE: ideName },
        },
      },
    },
    null,
    2,
  );
}

/** 远端模式是否支持 OAuth 交互式授权（客户端自动走 DCR + PKCE，用户无需手配密钥） */
export const REMOTE_SUPPORTS_OAUTH = true;

/**
 * 远端模式相对本地模式的已知能力缺口。
 * 文档中推荐远端时必须一并说明，否则用户会以为两者完全等价。
 */
export const REMOTE_LIMITATIONS = {
  zh: [
    '本地文件上传、模板下载到本机等依赖本地文件系统的能力不可用',
    '国际站暂无 NoSQL（文档数据库）相关工具',
    '需要本机无法访问外网时的私有化场景请改用本地模式或自建',
  ],
  en: [
    'Local-filesystem features (file upload, template download) are unavailable',
    'NoSQL (document database) tools are not available on the international site',
    'Offline or restricted-network setups should use local mode or self-hosted',
  ],
};

/* ---------------------------------------------------------------------------
 * 配置派生
 *
 * 设计取舍：不为 27 个客户端 × 2 模式 × 2 站点手写 108 份配置。每个客户端只在
 * IDE 表里维护**一份本地配置**（它已经承载了各家独有的容器键与扩展字段），
 * 远端版本由本地版本派生——保留容器键与传输无关字段，只替换服务端定义块。
 * 这样新增站点或改动端点时，所有客户端自动跟上。
 * ------------------------------------------------------------------------- */

/** 客户端配置的顶层容器键：绝大多数是 mcpServers，VS Code 系用 servers */
const CONFIG_ENVELOPE_KEYS = ['mcpServers', 'servers', 'context_servers'] as const;

/** 只在某一种传输下成立、派生时必须丢弃的字段 */
const TRANSPORT_ONLY_KEYS = new Set([
  'command',
  'args',
  'env',
  'type',
  'url',
  'headers',
  'transportType',
]);

export interface RemoteConfigOptions {
  /** 用静态凭证（env_id + X-TencentCloud-*）代替 OAuth */
  staticCredentials?: boolean;
  /** 国内站账号下 ap-singapore 环境：地域歧义，需显式声明站点 */
  declareAmbiguousSite?: boolean;
}

/** 远端模式的服务端定义块 */
export function buildRemoteServerBlock(
  siteId: SiteId,
  opts: RemoteConfigOptions = {},
): Record<string, unknown> {
  if (!opts.staticCredentials) {
    // OAuth：只给地址。DCR + PKCE 由客户端自动完成，密钥不落盘。
    return { type: 'http', url: buildRemoteEndpoint(siteId) };
  }
  return {
    type: 'http',
    url: buildRemoteUrl(siteId, { declareAmbiguousSite: opts.declareAmbiguousSite }),
    headers: {
      'X-TencentCloud-SecretId': '<Tencent Cloud SecretId>',
      'X-TencentCloud-SecretKey': '<Tencent Cloud SecretKey>',
    },
  };
}

/**
 * 由本地（stdio）配置派生远端（HTTP）配置。
 *
 * 保留：容器键（mcpServers / servers）、服务端名字、以及 autoApprove / timeout /
 * disabled 这类与传输无关的客户端扩展字段。
 * 丢弃：command / args / env / type / transportType 等只在 stdio 下有意义的字段。
 *
 * 解析失败或配置为空时返回空串——调用方据此回退到不渲染配置。
 */
export function deriveRemoteConfig(
  localConfigExample: string,
  siteId: SiteId,
  opts: RemoteConfigOptions = {},
): string {
  const source = (localConfigExample || '').trim();
  if (!source) return '';

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(source);
  } catch {
    return '';
  }
  if (!parsed || typeof parsed !== 'object') return '';

  const envelopeKey = CONFIG_ENVELOPE_KEYS.find(
    (key) => parsed[key] && typeof parsed[key] === 'object',
  );
  if (!envelopeKey) return '';

  const servers = parsed[envelopeKey] as Record<string, Record<string, unknown>>;
  const serverName = Object.keys(servers)[0];
  if (!serverName) return '';

  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(servers[serverName] || {})) {
    if (!TRANSPORT_ONLY_KEYS.has(key)) preserved[key] = value;
  }

  const config = {
    [envelopeKey]: {
      [serverName]: { ...preserved, ...buildRemoteServerBlock(siteId, opts) },
    },
  };
  return JSON.stringify(config, null, 2);
}

/** 按模式给出该客户端的配置片段 */
export function buildConfigForMode(
  localConfigExample: string,
  mode: ConnectionMode,
  siteId: SiteId,
  opts: RemoteConfigOptions = {},
): string {
  if (mode === 'remote') {
    return deriveRemoteConfig(localConfigExample, siteId, opts) || localConfigExample;
  }
  return applySiteToLocalConfig(localConfigExample, siteId);
}

/**
 * 本地模式没有域名可依据，站点要靠 `TCB_SITE` 声明。
 *
 * `domestic` 是默认值，不写就是国内站，所以只在 `intl` 时注入——避免给一份本来
 * 干净的配置塞进冗余字段。不注入的后果是：国际站用户登录时会走国内站链路，
 * 表现为「登录成功但看不到自己的环境」，而不是明确报错。
 */
export function applySiteToLocalConfig(localConfigExample: string, siteId: SiteId): string {
  if (siteId === 'domestic' || !localConfigExample.trim()) return localConfigExample;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(localConfigExample);
  } catch {
    return localConfigExample;
  }

  const envelopeKey = CONFIG_ENVELOPE_KEYS.find(
    (key) => parsed[key] && typeof parsed[key] === 'object',
  );
  if (!envelopeKey) return localConfigExample;

  const servers = parsed[envelopeKey] as Record<string, Record<string, unknown>>;
  const serverName = Object.keys(servers)[0];
  if (!serverName) return localConfigExample;

  const server = servers[serverName] || {};
  const env = { ...((server.env as Record<string, unknown>) || {}), TCB_SITE: siteId };

  return JSON.stringify(
    { [envelopeKey]: { [serverName]: { ...server, env } } },
    null,
    2,
  );
}

/* ---------------------------------------------------------------------------
 * 一键安装链接
 *
 * 只有 deeplink 型通道能生成：Cursor / VS Code 系 / Trae。其余客户端没有安装
 * 协议，硬塞链接只会点出「当前版本不支持」，所以这里返回 null 让调用方回退到
 * 复制配置。
 * ------------------------------------------------------------------------- */

function toBase64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

export interface InstallLinkContext {
  mode: ConnectionMode;
  siteId: SiteId;
  /** 客户端显示名，本地模式写进 INTEGRATION_IDE */
  ideName: string;
}

/**
 * Cursor：官方 install-mcp 页面。
 * 本地模式 config 为 stdio 定义块；远端模式按官方约定只给 `url`（走 OAuth）。
 */
export function buildCursorInstallUrl({ mode, siteId, ideName }: InstallLinkContext): string {
  const config =
    mode === 'local'
      ? { env: { INTEGRATION_IDE: ideName }, command: 'npx', args: [`${MCP_PACKAGE}@latest`] }
      : { url: buildRemoteEndpoint(siteId) };
  const encoded = encodeURIComponent(toBase64(JSON.stringify(config)));
  return `https://cursor.com/en-US/install-mcp?name=${MCP_SERVER_NAME}&config=${encoded}`;
}

/** VS Code（含 Insiders）：原生 `vscode:mcp/install` 协议，payload 为 urlencode 的 JSON */
export function buildVSCodeInstallUrl({ mode, siteId, ideName }: InstallLinkContext): string {
  const config =
    mode === 'local'
      ? {
          name: MCP_SERVER_NAME,
          command: 'npx',
          args: [`${MCP_PACKAGE}@latest`],
          env: { INTEGRATION_IDE: ideName },
        }
      : { name: MCP_SERVER_NAME, type: 'http', url: buildRemoteEndpoint(siteId) };
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(config))}`;
}

/**
 * Trae 的 URL scheme。
 *
 * ⚠️ 待实测：TRAE 国际版注册 `trae://`，TRAE CN 版注册 `trae-cn://`。此处保留仓库
 * 既有取值（`trae://`）以避免回归；若确认文档站的主要受众是 TRAE CN，可改为
 * `trae-cn://`——但国际版用户会失效，理想做法是按站点给出两条链接。
 */
const TRAE_SCHEME = 'trae://';

/** Trae（含 TRAE CN）：`trae.ai-ide/mcp-import`，payload 为 base64 */
export function buildTraeInstallUrl({ mode, siteId, ideName }: InstallLinkContext): string {
  const config =
    mode === 'local'
      ? { command: 'npx', args: [`${MCP_PACKAGE}@latest`], env: { INTEGRATION_IDE: ideName } }
      : { url: buildRemoteEndpoint(siteId) };
  const type = mode === 'local' ? 'stdio' : 'http';
  const encoded = encodeURIComponent(toBase64(JSON.stringify(config)));
  return `${TRAE_SCHEME}trae.ai-ide/mcp-import?type=${type}&name=${MCP_SERVER_NAME}&config=${encoded}`;
}
