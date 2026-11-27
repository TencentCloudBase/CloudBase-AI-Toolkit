#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_PAGE_URL = 'https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/blob/main/scripts/tools.json';

/**
 * The MCP server already ships zh/en i18n. Both generated references therefore
 * read the matching tools snapshot (scripts/tools.json / scripts/tools.en.json)
 * and use the same fixed copy in both languages.
 */
const I18N = {
  zh: {
    toolsJson: 'tools.json',
    output: ['..', 'doc', 'mcp-tools.md'],
    title: '# MCP 工具',
    intro: (n) => `当前包含 ${n} 个工具，按功能分组如下。`,
    source: (url) => `源数据: [tools.json](${url})`,
    overview: '## 工具总览',
    params: '#### 参数',
    none: '无',
    required: '是',
    enumHint: '可填写的值:',
    defaultHint: '默认值:',
    spec: '## 详细规格',
    fallbackGroup: '其他',
    config: [
      '## 云端 MCP 配置说明',
      '',
      '使用云端 MCP，推荐直接连**官方托管站点 + OAuth 授权**，不需要配置任何密钥：',
      '',
      '```json',
      '{',
      '  "mcpServers": {',
      '    "cloudbase": {',
      '      "type": "http",',
      '      "url": "https://tcb-api.cloud.tencent.com/mcp/v1"',
      '    }',
      '  }',
      '}',
      '```',
      '',
      '首次连接时客户端会打开浏览器完成 OAuth 授权（登录腾讯云、选择环境），密钥不落配置文件。国际站把地址换成 `https://tcb-api.tencentcloud.com/mcp/v1`。完整说明见[连接方式 - 远端模式](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/connection-modes#remote-mode)。',
      '',
      '不支持 OAuth 的客户端（以及 CI/CD 等无法交互授权的场景），在请求头携带腾讯云 API 密钥作为静态凭证，同样不需要下方环境变量。',
      '',
      '### 环境变量配置（仅自建远端服务时）',
      '',
      '以下环境变量用于**在自有服务器自建** MCP 服务（开启 Cloud Mode 部署）时注入凭证；使用上面的官方托管站点无需配置：',
      '',
      '| 环境变量 | 说明 | 获取方式 |',
      '|---------|------|---------|',
      '| `TENCENTCLOUD_SECRETID` | 腾讯云 SecretId | [获取腾讯云 API 密钥](https://console.cloud.tencent.com/cam/capi) |',
      '| `TENCENTCLOUD_SECRETKEY` | 腾讯云 SecretKey | [获取腾讯云 API 密钥](https://console.cloud.tencent.com/cam/capi) |',
      '| `TENCENTCLOUD_SESSIONTOKEN` | 非必填，腾讯云临时密钥 Token（可选） | 仅在使用临时密钥时需要，可通过 [STS 服务](https://console.cloud.tencent.com/cam/capi) 获取 |',
      '| `CLOUDBASE_ENV_ID` | 云开发环境 ID | [获取云开发环境 ID](https://tcb.cloud.tencent.com/dev) |',
      '',
    ],
  },
  en: {
    toolsJson: 'tools.en.json',
    output: ['..', 'doc', 'en', 'mcp-tools.md'],
    title: '# MCP Tools',
    intro: (n) => `Currently includes ${n} tools, grouped by function as follows.`,
    source: (url) => `Source data: [tools.json](${url})`,
    overview: '## Tool Overview',
    params: '#### Parameters',
    none: 'None',
    required: 'Yes',
    enumHint: 'Allowed values:',
    defaultHint: 'Default:',
    spec: '## Detailed Specification',
    fallbackGroup: 'Other',
    config: [
      '## Hosted MCP configuration',
      '',
      'For hosted MCP, connect to the official endpoint with OAuth. No credential needs to be stored in a config file:',
      '',
      '```json',
      '{',
      '  "mcpServers": {',
      '    "cloudbase": {',
      '      "type": "http",',
      '      "url": "https://tcb-api.cloud.tencent.com/mcp/v1"',
      '    }',
      '  }',
      '}',
      '```',
      '',
      'The client opens a browser on first connect for OAuth (Tencent Cloud login and environment selection), so the credential never lands in a config file. For the international site use `https://tcb-api.tencentcloud.com/mcp/v1`. See [Connection modes - Remote](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/connection-modes#remote-mode) for the full guide.',
      '',
      'Clients without OAuth support (including CI/CD, where interactive authorization is impossible) pass a Tencent Cloud API key as a static credential in the request header; the environment variables below are not needed in that case either.',
      '',
      '### Environment variables (self-hosted remote server only)',
      '',
      'These variables inject credentials when you **self-host** the MCP server on your own machine (Cloud Mode deployment). They are not needed for the official hosted endpoint above:',
      '',
      '| Variable | Description | Where to get it |',
      '|----------|-------------|-----------------|',
      '| `TENCENTCLOUD_SECRETID` | Tencent Cloud SecretId | [Tencent Cloud API keys](https://console.cloud.tencent.com/cam/capi) |',
      '| `TENCENTCLOUD_SECRETKEY` | Tencent Cloud SecretKey | [Tencent Cloud API keys](https://console.cloud.tencent.com/cam/capi) |',
      '| `TENCENTCLOUD_SESSIONTOKEN` | Optional temporary STS token | Only for temporary credentials, via [STS](https://console.cloud.tencent.com/cam/capi) |',
      '| `CLOUDBASE_ENV_ID` | CloudBase environment ID | [CloudBase console](https://tcb.cloud.tencent.com/dev) |',
      '',
    ],
  },
};

const PLUGIN_MAP_ZH = {
  auth: '认证与登录',
  queryEnv: '环境管理',
  envDomainManagement: '环境管理',
  readNoSqlDatabaseStructure: 'NoSQL 数据库',
  writeNoSqlDatabaseStructure: 'NoSQL 数据库',
  readNoSqlDatabaseContent: 'NoSQL 数据库',
  writeNoSqlDatabaseContent: 'NoSQL 数据库',
  queryMysqlDatabase: 'MySQL 数据库',
  manageMysqlDatabase: 'MySQL 数据库',
  queryPgDatabase: 'PostgreSQL 数据库',
  managePgDatabase: 'PostgreSQL 数据库',
  queryPgStorage: 'PostgreSQL 云存储',
  manageDataModel: '数据模型',
  modifyDataModel: '数据模型',
  queryFunctions: '云函数',
  manageFunctions: '云函数',
  queryHosting: '静态托管',
  manageHosting: '静态托管',
  queryStorage: '云存储',
  manageStorage: '云存储',
  queryCloudRun: '云托管',
  manageCloudRun: '云托管',
  queryGateway: '网关',
  manageGateway: '网关',
  queryAppAuth: '应用认证',
  manageAppAuth: '应用认证',
  queryPermissions: '权限管理',
  managePermissions: '权限管理',
  queryLogs: '日志',
  manageLogs: '日志',
  queryAgents: 'AI Agent',
  manageAgents: 'AI Agent',
  downloadTemplate: '模板与文件',
  searchKnowledgeBase: '搜索与知识库',
  activateInviteCode: '激励计划',
  callCloudApi: '云 API',
  queryMessagePush: '消息推送',
  manageMessagePush: '消息推送',
};

const PLUGIN_MAP_EN = {
  auth: 'Authentication & Login',
  queryEnv: 'Environment Management',
  envDomainManagement: 'Environment Management',
  readNoSqlDatabaseStructure: 'NoSQL Database',
  writeNoSqlDatabaseStructure: 'NoSQL Database',
  readNoSqlDatabaseContent: 'NoSQL Database',
  writeNoSqlDatabaseContent: 'NoSQL Database',
  queryMysqlDatabase: 'MySQL Database',
  manageMysqlDatabase: 'MySQL Database',
  queryPgDatabase: 'PostgreSQL Database',
  managePgDatabase: 'PostgreSQL Database',
  queryPgStorage: 'PostgreSQL Storage',
  manageDataModel: 'Data Model',
  modifyDataModel: 'Data Model',
  queryFunctions: 'Cloud Functions',
  manageFunctions: 'Cloud Functions',
  queryHosting: 'Static Hosting',
  manageHosting: 'Static Hosting',
  queryStorage: 'Cloud Storage',
  manageStorage: 'Cloud Storage',
  queryCloudRun: 'Cloud Run',
  manageCloudRun: 'Cloud Run',
  queryGateway: 'Gateway',
  manageGateway: 'Gateway',
  queryAppAuth: 'App Authentication',
  manageAppAuth: 'App Authentication',
  queryPermissions: 'Permissions',
  managePermissions: 'Permissions',
  queryLogs: 'Logs',
  manageLogs: 'Logs',
  queryAgents: 'AI Agent',
  manageAgents: 'AI Agent',
  downloadTemplate: 'Templates & Files',
  searchKnowledgeBase: 'Search & Knowledge Base',
  activateInviteCode: 'Incentive Program',
  callCloudApi: 'Cloud API',
  queryMessagePush: 'Message Push',
  manageMessagePush: 'Message Push',
};

export function parseLangArg(argv = process.argv) {
  const i = argv.indexOf('--lang');
  const lang = i >= 0 ? argv[i + 1] : 'zh';
  if (lang !== 'zh' && lang !== 'en') {
    throw new Error(`unsupported --lang: ${lang} (expected zh or en)`);
  }
  return lang;
}

export function readToolsJson(toolsJsonPath = path.join(__dirname, 'tools.json')) {
  if (!fs.existsSync(toolsJsonPath)) {
    throw new Error(`tools.json not found at ${toolsJsonPath}. Please run scripts/generate-tools-json.mjs first.`);
  }
  return JSON.parse(fs.readFileSync(toolsJsonPath, 'utf8'));
}

export function escapeMd(text = '') {
  return String(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&/g, '&')
    .trim();
}

function typeOfSchema(schema) {
  if (!schema) return 'unknown';
  if (schema.type) {
    if (schema.type === 'array') {
      const itemType = schema.items ? typeOfSchema(schema.items) : 'any';
      return `array of ${itemType}`;
    }
    return schema.type;
  }
  if (schema.anyOf) return 'union';
  if (schema.oneOf) return 'union';
  if (schema.allOf) return 'intersection';
  return 'unknown';
}

function dictFor(lang = 'zh') {
  return I18N[lang] || I18N.zh;
}

function getPlugin(toolName, lang = 'zh') {
  const map = lang === 'en' ? PLUGIN_MAP_EN : PLUGIN_MAP_ZH;
  return map[toolName] || dictFor(lang).fallbackGroup;
}

function renderEnum(schema) {
  if (Array.isArray(schema.enum)) {
    return schema.enum.map(v => JSON.stringify(v)).join(', ');
  }
  if (schema.const !== undefined) {
    return `const ${JSON.stringify(schema.const)}`;
  }
  return '';
}

function renderDefault(schema) {
  return schema && schema.default !== undefined ? JSON.stringify(schema.default) : '';
}

function renderUnion(schema) {
  const variants = schema.anyOf || schema.oneOf || [];
  return variants.map(s => typeOfSchema(s)).join(' | ');
}

function schemaToParameters(schema, lang = 'zh') {
  const d = dictFor(lang);
  if (!schema || schema.type !== 'object' || !schema.properties) return '[]';
  const requiredSet = new Set(schema.required || []);
  const parts = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    const lines = [];
    lines.push(`    {`);
    lines.push(`      name: "${name}",`);
    lines.push(`      type: "${typeOfSchema(prop)}",`);
    if (requiredSet.has(name)) lines.push(`      required: true,`);
    let desc = (prop.description || '').replace(/[\r\n]+/g, ' ');
    const enumValues = renderEnum(prop);
    if (enumValues) desc += ` ${d.enumHint} ${enumValues}`;
    if (desc) {
      const escaped = desc.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
      lines.push(`      description: \`${escaped}\`,`);
    }
    const children = schemaToParametersChildren(prop, 0, lang);
    if (children) {
      lines.push(`      children: [`);
      lines.push(children);
      lines.push(`      ],`);
    }
    lines.push(`    }`);
    parts.push(lines.join('\n'));
  }
  return `${parts.join(',\n')}`;
}

function schemaToParametersChildren(propSchema, depth = 0, lang = 'zh') {
  const d = dictFor(lang);
  if (!propSchema) return null;
  const indent = 8 + depth * 4;
  const innerIndent = indent + 2;

  const buildRows = (properties, requiredSet) => {
    const parts = [];
    for (const [k, v] of Object.entries(properties)) {
      const lines = [];
      lines.push(`${' '.repeat(indent)}{`);
      lines.push(`${' '.repeat(innerIndent)}name: "${k}",`);
      lines.push(`${' '.repeat(innerIndent)}type: "${typeOfSchema(v)}",`);
      if (requiredSet.has(k)) lines.push(`${' '.repeat(innerIndent)}required: true,`);
      let desc = (v.description || '').replace(/[\r\n]+/g, ' ');
      const enumValues = renderEnum(v);
      if (enumValues) desc += ` ${d.enumHint} ${enumValues}`;
      if (desc) {
        const escaped = desc.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
        lines.push(`${' '.repeat(innerIndent)}description: \`${escaped}\`,`);
      }
      const nested = schemaToParametersChildren(v, depth + 1, lang);
      if (nested) {
        lines.push(`${' '.repeat(innerIndent)}children: [`);
        lines.push(nested);
        lines.push(`${' '.repeat(innerIndent)}],`);
      }
      lines.push(`${' '.repeat(indent)}}`);
      parts.push(lines.join('\n'));
    }
    return parts.join(',\n');
  };

  if (propSchema.type === 'array' && propSchema.items) {
    const inner = propSchema.items;
    if (inner.type === 'object' && inner.properties) {
      return buildRows(inner.properties, new Set(inner.required || []));
    }
  }
  if (propSchema.type === 'object' && propSchema.properties) {
    return buildRows(propSchema.properties, new Set(propSchema.required || []));
  }
  return null;
}

function flattenSchemaRows(name, schema, isRequired, lang = 'zh') {
  const d = dictFor(lang);
  const rows = [];
  const typeText = (schema.anyOf || schema.oneOf) && !schema.type ? renderUnion(schema) : typeOfSchema(schema);
  const enumText = renderEnum(schema);
  const defText = renderDefault(schema);
  const baseDesc = schema.description ? escapeMd(schema.description) : '';
  const extras = [
    enumText ? `${d.enumHint} ${escapeMd(enumText)}` : '',
    defText ? `${d.defaultHint} ${escapeMd(defText)}` : '',
  ].filter(Boolean).join('；');
  let mergedDesc = [baseDesc, extras].filter(Boolean).join(' ');
  if (name === 'mermaidDiagram' && schema.description && schema.description.includes('示例：')) {
    const [head] = schema.description.split('示例：');
    mergedDesc = escapeMd(head.trim());
  }
  rows.push({ name, type: typeText, required: isRequired ? d.required : '', desc: mergedDesc });
  if (schema.type === 'array' && schema.items) {
    const item = schema.items;
    if (item.type === 'object' && item.properties) {
      const req = new Set(item.required || []);
      for (const [k, v] of Object.entries(item.properties)) {
        rows.push(...flattenSchemaRows(`${name}[].${k}`, v, req.has(k), lang));
      }
    }
  }
  if (schema.type === 'object' && schema.properties) {
    const req = new Set(schema.required || []);
    for (const [k, v] of Object.entries(schema.properties)) {
      rows.push(...flattenSchemaRows(`${name}.${k}`, v, req.has(k), lang));
    }
  }
  return rows;
}

function renderToolDetails(tool, lang = 'zh') {
  const d = dictFor(lang);
  const lines = [];
  lines.push(`### \`${tool.name}\``);
  if (tool.description) {
    const desc = tool.description.trim()
      .replace(/\\{/g, '\\\\{')
      .replace(/\\}/g, '\\\\}')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    lines.push(desc);
  }
  const schema = tool.inputSchema || {};
  lines.push('');
  lines.push(d.params);
  lines.push('');
  if (schema && schema.type === 'object' && schema.properties && Object.keys(schema.properties).length > 0) {
    lines.push('<ParameterTable');
    lines.push('  parameters={[');
    lines.push(schemaToParameters(schema, lang));
    lines.push('  ]}');
    lines.push('/>');
  } else {
    lines.push(d.none);
  }
  lines.push('');
  lines.push('---');
  return lines.join('\n');
}

export function renderDoc(toolsJson, lang = 'zh') {
  const d = dictFor(lang);
  const { tools = [] } = toolsJson;
  const lines = [];
  lines.push("import ParameterTable from '../../api-reference/components/ApiContainer';");
  lines.push('');
  lines.push(d.title);
  lines.push('');
  lines.push(d.intro(tools.length));
  lines.push('');
  lines.push(d.source(GITHUB_PAGE_URL));
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(d.overview);
  lines.push('');
  const groups = {};
  for (const t of tools) {
    const plugin = getPlugin(t.name, lang);
    if (!groups[plugin]) groups[plugin] = [];
    groups[plugin].push(t);
  }
  for (const plugin of [...new Set(tools.map(t => getPlugin(t.name, lang)))]) {
    lines.push(`### ${plugin}`);
    lines.push('');
    for (const t of groups[plugin] || []) {
      lines.push(`- [\`${t.name}\`](#${t.name.toLowerCase()})`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push(...d.config);
  lines.push(d.spec);
  lines.push('');
  for (const t of tools) {
    lines.push(renderToolDetails(t, lang));
    lines.push('');
  }
  return lines.join('\n');
}

export function generateToolsDoc({ lang = 'zh', toolsJsonPath, outputPath } = {}) {
  const d = dictFor(lang);
  const jsonPath = toolsJsonPath ?? path.join(__dirname, d.toolsJson);
  const out = outputPath ?? path.join(__dirname, ...d.output);
  const toolsJson = readToolsJson(jsonPath);
  const markdown = renderDoc(toolsJson, lang);
  fs.writeFileSync(out, markdown, 'utf8');
  return {
    outputPath: out,
    markdown,
    lang,
    toolCount: Array.isArray(toolsJson.tools) ? toolsJson.tools.length : 0,
  };
}

function check() {
  const toolsJson = readToolsJson();
  let failed = false;
  for (const lang of ['zh', 'en']) {
    const d = dictFor(lang);
    const doc = renderDoc(toolsJson, lang);
    const toolHeadings = (doc.match(/^### `.*`$/gm) || []).length;
    const ok = doc.includes(d.title) && doc.includes(d.overview) &&
      doc.includes(d.params) && !doc.includes(dictFor(lang === 'zh' ? 'en' : 'zh').overview) &&
      toolHeadings === toolsJson.tools.length;
    console.log(`[${lang}] ${ok ? 'OK' : 'FAIL'} fixed copy + ${toolHeadings}/${toolsJson.tools.length} tool sections`);
    if (!ok) failed = true;
  }
  if (failed) process.exitCode = 1;
}

function main() {
  if (process.argv.includes('--check')) return check();
  const lang = parseLangArg(process.argv);
  const { outputPath, toolCount } = generateToolsDoc({ lang });
  console.log(`✅ [${lang}] 文档已生成: ${outputPath} (${toolCount} tools)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (e) {
    console.error('❌ 生成文档失败:', e && e.message ? e.message : e);
    process.exit(1);
  }
}
