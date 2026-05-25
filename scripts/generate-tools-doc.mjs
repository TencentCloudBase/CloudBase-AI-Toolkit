#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_PAGE_URL = 'https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/blob/main/scripts/tools.json';

export function readToolsJson(toolsJsonPath = path.join(__dirname, 'tools.json')) {
  if (!fs.existsSync(toolsJsonPath)) {
    throw new Error(`tools.json not found at ${toolsJsonPath}. Please run scripts/generate-tools-json.mjs first.`);
  }
  const raw = fs.readFileSync(toolsJsonPath, 'utf8');
  return JSON.parse(raw);
}

export function escapeMd(text = '') {
  // MDX 中禁止 HTML 标签；只做纯文本处理，换行转空格
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

// Plugin 分组映射（tool name → plugin 中文名）
const PLUGIN_MAP = {
  auth:                        '认证与登录',
  envQuery:                    '环境管理',
  envDomainManagement:          '环境管理',
  readNoSqlDatabaseStructure:  'NoSQL 数据库',
  writeNoSqlDatabaseStructure: 'NoSQL 数据库',
  readNoSqlDatabaseContent:    'NoSQL 数据库',
  writeNoSqlDatabaseContent:   'NoSQL 数据库',
  querySqlDatabase:            'MySQL 数据库',
  manageSqlDatabase:           'MySQL 数据库',
  manageDataModel:             '数据模型',
  modifyDataModel:             '数据模型',
  queryFunctions:              '云函数',
  manageFunctions:             '云函数',
  queryHosting:               '静态托管',
  manageHosting:              '静态托管',
  queryStorage:               '云存储',
  manageStorage:              '云存储',
  queryCloudRun:              '云托管',
  manageCloudRun:             '云托管',
  queryGateway:               '网关',
  manageGateway:              '网关',
  queryAppAuth:               '应用认证',
  manageAppAuth:              '应用认证',
  queryPermissions:           '权限管理',
  managePermissions:          '权限管理',
  queryLogs:                  '日志',
  queryAgents:               'AI Agent',
  manageAgents:               'AI Agent',
  downloadTemplate:           '模板与文件',
  downloadRemoteFile:         '模板与文件',
  searchWeb:                  '搜索与知识库',
  searchKnowledgeBase:        '搜索与知识库',
  activateInviteCode:         '激励计划',
  callCloudApi:               '云 API',
};

function getPlugin(toolName) {
  return PLUGIN_MAP[toolName] || '其他';
}

/**
 * 将 JSON Schema 转为 ParameterTable 的 parameters 数组（JSX 源码字符串）
 */
function schemaToParameters(schema) {
  if (!schema || schema.type !== 'object' || !schema.properties) return '[]';
  const requiredSet = new Set(schema.required || []);
  const parts = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    const lines = [];
    lines.push(`    {`);
    lines.push(`      name: "${name}",`);
    lines.push(`      type: "${typeOfSchema(prop)}",`);
    if (requiredSet.has(name)) {
      lines.push(`      required: true,`);
    }
    // description: 用反引号模板字符串，换行压缩为空格
    let desc = (prop.description || '').replace(/[\r\n]+/g, ' ');
    const enumValues = renderEnum(prop);
    if (enumValues) {
      desc += ` 可填写的值: ${enumValues}`;
    }
    if (desc) {
      // 反引号字符串：内部 ` 需要转义为 \`，其他字符原样
      const escaped = desc.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
      lines.push(`      description: \`${escaped}\`,`);
    }
    // children for nested object/array
    const children = schemaToParametersChildren(prop);
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

function schemaToParametersChildren(propSchema, depth = 0) {
  if (!propSchema) return null;
  const indent = 8 + depth * 4;
  const innerIndent = indent + 2;
  // array of object
  if (propSchema.type === 'array' && propSchema.items) {
    const inner = propSchema.items;
    if (inner.type === 'object' && inner.properties) {
      const requiredSet = new Set(inner.required || []);
      const parts = [];
      for (const [k, v] of Object.entries(inner.properties)) {
        const lines = [];
        lines.push(`${' '.repeat(indent)}{`);
        lines.push(`${' '.repeat(innerIndent)}name: "${k}",`);
        lines.push(`${' '.repeat(innerIndent)}type: "${typeOfSchema(v)}",`);
        if (requiredSet.has(k)) lines.push(`${' '.repeat(innerIndent)}required: true,`);
        let desc = (v.description || '').replace(/[\r\n]+/g, ' ');
        const enumValues = renderEnum(v);
        if (enumValues) desc += ` 可填写的值: ${enumValues}`;
        if (desc) {
          const escaped = desc.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
          lines.push(`${' '.repeat(innerIndent)}description: \`${escaped}\`,`);
        }
        const nested = schemaToParametersChildren(v, depth + 1);
        if (nested) {
          lines.push(`${' '.repeat(innerIndent)}children: [`);
          lines.push(nested);
          lines.push(`${' '.repeat(innerIndent)}],`);
        }
        lines.push(`${' '.repeat(indent)}}`);
        parts.push(lines.join('\n'));
      }
      return parts.join(',\n');
    }
  }
  // direct object
  if (propSchema.type === 'object' && propSchema.properties) {
    const requiredSet = new Set(propSchema.required || []);
    const parts = [];
    for (const [k, v] of Object.entries(propSchema.properties)) {
      const lines = [];
      lines.push(`${' '.repeat(indent)}{`);
      lines.push(`${' '.repeat(innerIndent)}name: "${k}",`);
      lines.push(`${' '.repeat(innerIndent)}type: "${typeOfSchema(v)}",`);
      if (requiredSet.has(k)) lines.push(`${' '.repeat(innerIndent)}required: true,`);
      let desc = (v.description || '').replace(/[\r\n]+/g, ' ');
      const enumValues = renderEnum(v);
      if (enumValues) desc += ` 可填写的值: ${enumValues}`;
      if (desc) {
        const escaped = desc.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
        lines.push(`${' '.repeat(innerIndent)}description: \`${escaped}\`,`);
      }
      const nested = schemaToParametersChildren(v, depth + 1);
      if (nested) {
        lines.push(`${' '.repeat(innerIndent)}children: [`);
        lines.push(nested);
        lines.push(`${' '.repeat(innerIndent)}],`);
      }
      lines.push(`${' '.repeat(indent)}}`);
      parts.push(lines.join('\n'));
    }
    return parts.join(',\n');
  }
  return null;
}

function renderUnion(schema) {
  const variants = schema.anyOf || schema.oneOf || [];
  return variants.map(s => typeOfSchema(s)).join(' | ');
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

function flattenSchemaRows(name, schema, isRequired) {
  const rows = [];
  const typeText = (schema.anyOf || schema.oneOf) && !schema.type ? renderUnion(schema) : typeOfSchema(schema);
  const enumText = renderEnum(schema);
  const defText = renderDefault(schema);
  const baseDesc = schema.description ? escapeMd(schema.description) : '';
  const extras = [
    enumText ? `可填写的值: ${escapeMd(enumText)}` : '',
    defText ? `默认值: ${escapeMd(defText)}` : ''
  ].filter(Boolean).join('；');
  let mergedDesc = [baseDesc, extras].filter(Boolean).join(' ');
  // For extremely long descriptions (e.g., mermaid diagram), move to details block per-tool
  if (name === 'mermaidDiagram' && schema.description && schema.description.includes('示例：')) {
    const [head] = schema.description.split('示例：');
    mergedDesc = escapeMd(head.trim());
  }
  rows.push({ name, type: typeText, required: isRequired ? '是' : '', desc: mergedDesc });

  if (schema.type === 'array' && schema.items) {
    const item = schema.items;
    if (item.type === 'object' && item.properties) {
      const req = new Set(item.required || []);
      for (const [k, v] of Object.entries(item.properties)) {
        rows.push(...flattenSchemaRows(`${name}[].${k}`, v, req.has(k)));
      }
    }
  }

  if (schema.type === 'object' && schema.properties) {
    const req = new Set(schema.required || []);
    for (const [k, v] of Object.entries(schema.properties)) {
      rows.push(...flattenSchemaRows(`${name}.${k}`, v, req.has(k)));
    }
  }
  return rows;
}

function renderToolDetails(tool) {
  const lines = [];
  lines.push(`### \`${tool.name}\``);
  if (tool.description) {
    // MDX v2 会把正文中的 { ... } 解析为 JSX 表达式，需反斜杠转义
    const desc = tool.description.trim()
      .replace(/\\{/g, '\\\\{')
      .replace(/\\}/g, '\\\\}')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}');
    lines.push(desc);
  }
  const schema = tool.inputSchema || {};
  if (schema && schema.type === 'object' && schema.properties && Object.keys(schema.properties).length > 0) {
    lines.push('');
    lines.push('#### 参数');
    lines.push('');
    // 使用 ParameterTable 组件
    lines.push('<ParameterTable');
    lines.push('  parameters={[');
    lines.push(schemaToParameters(schema));
    lines.push('  ]}');
    lines.push('/>');
    lines.push('');
  } else {
    lines.push('');
    lines.push('#### 参数');
    lines.push('');
    lines.push('无');
    lines.push('');
  }
  lines.push('---');
  return lines.join('\n');
}

export function renderDoc(toolsJson) {
  const { tools = [] } = toolsJson;
  const lines = [];
  // 文件头：导入 ParameterTable 组件
  lines.push("import ParameterTable from '../../api-reference/components/ApiContainer';");
  lines.push('');
  lines.push('# MCP 工具');
  lines.push('');
  lines.push(`当前包含 ${tools.length} 个工具，按功能分组如下。`);
  lines.push('');
  lines.push(`源数据: [tools.json](${GITHUB_PAGE_URL})`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 工具总览');
  lines.push('');
  // 按 plugin 分组
  const groups = {};
  for (const t of tools) {
    const plugin = getPlugin(t.name);
    if (!groups[plugin]) groups[plugin] = [];
    groups[plugin].push(t);
  }
  // 用英文 key 保证顺序稳定，但按需可自定义
  const groupOrder = [...new Set(tools.map(t => getPlugin(t.name)))];
  for (const plugin of groupOrder) {
    const toolList = groups[plugin] || [];
    lines.push(`### ${plugin}`);
    lines.push('');
    for (const t of toolList) {
      lines.push(`- [\`${t.name}\`](#${t.name.toLowerCase()})`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('## 云端 MCP 配置说明');
  lines.push('');
  lines.push('');
  lines.push('### 环境变量配置');
  lines.push('');
  lines.push('使用云端 MCP 需要配置以下环境变量：');
  lines.push('');
  lines.push('| 环境变量 | 说明 | 获取方式 |');
  lines.push('|---------|------|---------|');
  lines.push('| `TENCENTCLOUD_SECRETID` | 腾讯云 SecretId | [获取腾讯云 API 密钥](https://console.cloud.tencent.com/cam/capi) |');
  lines.push('| `TENCENTCLOUD_SECRETKEY` | 腾讯云 SecretKey | [获取腾讯云 API 密钥](https://console.cloud.tencent.com/cam/capi) |');
  lines.push('| `TENCENTCLOUD_SESSIONTOKEN` | 非必填，腾讯云临时密钥 Token（可选） | 仅在使用临时密钥时需要，可通过 [STS 服务](https://console.cloud.tencent.com/cam/capi) 获取 |');
  lines.push('| `CLOUDBASE_ENV_ID` | 云开发环境 ID | [获取云开发环境 ID](https://tcb.cloud.tencent.com/dev) |');
  lines.push('');
  lines.push('## 详细规格');
  lines.push('');
  for (const t of tools) {
    lines.push(renderToolDetails(t));
    lines.push('');
  }
  return lines.join('\n');
}

export function generateToolsDoc({
  toolsJsonPath = path.join(__dirname, 'tools.json'),
  outputPath = path.join(__dirname, '..', 'doc', 'mcp-tools.md'),
} = {}) {
  const toolsJson = readToolsJson(toolsJsonPath);
  const markdown = renderDoc(toolsJson);
  fs.writeFileSync(outputPath, markdown, 'utf8');
  return {
    outputPath,
    markdown,
    toolCount: Array.isArray(toolsJson.tools) ? toolsJson.tools.length : 0,
  };
}

function main() {
  const { outputPath } = generateToolsDoc();
  console.log(`✅ 文档已生成: ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (e) {
    console.error('❌ 生成文档失败:', e && e.message ? e.message : e);
    process.exit(1);
  }
}
