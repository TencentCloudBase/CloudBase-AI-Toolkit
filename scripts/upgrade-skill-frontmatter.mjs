#!/usr/bin/env node
// scripts/upgrade-skill-frontmatter.mjs
// [COMPLETED — retained for historical reference only]
// This one-time script added metadata/promptSignals/retrieval fields to all 28 SKILL.md
// frontmatters. It has already been run and the changes are committed. Do not re-run unless
// you are adding a brand-new skill and want to bootstrap its frontmatter.
// Preserves existing name/description/version/alwaysApply fields and body content.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(__dirname, "..", "plugin", "cloudbase", "skills");

// Skill metadata map: dir name → { priority, pathPatterns, bashPatterns, promptSignals, retrieval }
const SKILL_METADATA = {
  "ui-design": {
    priority: 9,
    pathPatterns: ["**/*.tsx", "**/*.vue", "**/*.css", "**/*.scss"],
    phrases: ["ui", "界面", "设计", "design", "页面", "page", "组件", "component", "样式", "style", "配色", "color", "原型", "prototype", "布局", "layout"],
    allOf: [],
    anyOf: ["原型", "prototype", "布局", "layout"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["ui design", "interface design", "原型设计"],
      intents: ["design ui", "create prototype", "define color palette"],
      entities: ["Color Palette", "Typography", "Layout", "Design System"],
      examples: ["design a dashboard ui", "make a prototype", "define color scheme"],
    },
  },
  "web-development": {
    priority: 8,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/web-development"],
    pathPatterns: ["src/**", "public/**", "vite.config.*", "webpack.config.*"],
    bashPatterns: ["\\b(vite|webpack|npm|pnpm|yarn)\\s+(dev|build|serve)\\b", "\\bnpx\\s+create-(vite|react-app)\\b"],
    phrases: ["web", "前端", "react", "vue", "vite", "浏览器", "spa", "ssr", "静态托管"],
    anyOf: ["部署", "deploy", "页面", "page"],
    noneOf: ["小程序", "miniprogram"],
    minScore: 6,
    retrieval: {
      aliases: ["web frontend", "react", "vue", "vite", "spa"],
      intents: ["build a web app", "deploy static hosting"],
      entities: ["React", "Vue", "Vite", "Webpack", "CloudBase JS SDK"],
      examples: ["make a todo app", "build a dashboard", "deploy to static hosting"],
    },
  },
  "miniprogram-development": {
    priority: 8,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/miniprogram-development"],
    pathPatterns: ["miniprogram/**", "cloudfunctions/**", "project.config.json", "app.json", "app.wxss"],
    bashPatterns: ["\\btcb\\s+(fn|cloudfunctions)\\s+deploy\\b"],
    phrases: ["小程序", "miniprogram", "微信", "wechat", "wx.cloud", "tabbar", "appid"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["wechat mini program", "wxmp", "小程序"],
      intents: ["build a mini program", "wechat cloud development"],
      entities: ["WeChat", "wx.cloud", "project.config.json", "tabBar"],
      examples: ["make a mini program", "add tabBar", "deploy cloud function"],
    },
  },
  "auth-tool": {
    priority: 8,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/auth-tool"],
    phrases: ["登录", "认证", "auth", "login", "signin", "openid", "unionid", "jwt", "token"],
    anyOf: ["配置", "config", "provider", "sms", "email"],
    noneOf: ["登出", "logout"],
    minScore: 6,
    retrieval: {
      aliases: ["authentication", "login", "认证配置"],
      intents: ["configure auth provider", "enable login methods"],
      entities: ["SMS", "Email", "WeChat Auth", "Custom Login", "Publishable Key"],
      examples: ["enable sms login", "configure wechat auth", "set up custom login"],
    },
  },
  "cloudbase-platform": {
    priority: 8,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/cloudbase-platform"],
    phrases: ["cloudbase", "云开发", "平台", "控制台", "tcb"],
    noneOf: [],
    minScore: 8,
    retrieval: {
      aliases: ["cloudbase platform", "云开发平台", "tcb"],
      intents: ["understand cloudbase platform", "navigate console"],
      entities: ["CloudBase", "Console", "Environment", "TCB"],
      examples: ["what is cloudbase", "how to use cloudbase console"],
    },
  },
  "cloud-functions": {
    priority: 7,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/cloud-functions"],
    pathPatterns: ["cloudfunctions/**"],
    bashPatterns: ["\\btcb\\s+fn\\s+(deploy|list|invoke)\\b", "\\bcloudbase\\s+functions?\\b"],
    phrases: ["云函数", "cloud function", "serverless", "scf", "http function", "event function"],
    anyOf: ["部署", "deploy", "调试", "debug"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["cloud function", "serverless", "scf", "lambda"],
      intents: ["deploy a cloud function", "debug serverless"],
      entities: ["SCF", "HTTP Function", "Event Function", "wx-server-sdk"],
      examples: ["deploy cloud function", "create http function", "debug serverless"],
    },
  },
  "cloudrun-development": {
    priority: 7,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/cloudrun-development"],
    pathPatterns: ["Dockerfile", "docker-compose.yml", "cloudbaserc.json"],
    phrases: ["云托管", "cloudrun", "docker", "容器", "websocket", "长连接"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["cloudrun", "container", "docker"],
      intents: ["deploy container service", "build cloudrun app"],
      entities: ["Docker", "CloudRun", "Container", "WebSocket"],
      examples: ["deploy docker app", "create cloudrun service"],
    },
  },
  "data-model-creation": {
    priority: 7,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/data-model-creation"],
    pathPatterns: ["**/schema.prisma", "**/drizzle.config.*", "**/migrations/**"],
    bashPatterns: ["\\b(db|migrate|schema):"],
    phrases: ["数据模型", "建模", "model", "schema", "er图", "entity", "数据库设计", "data model"],
    anyOf: ["mysql", "postgresql", "nosql", "关系型"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["data modeling", "schema design", "er diagram"],
      intents: ["design database schema", "create er diagram"],
      entities: ["Mermaid", "ER Diagram", "MySQL Types", "PostgreSQL"],
      examples: ["design database schema", "create er diagram", "model data"],
    },
  },
  "no-sql-web-sdk": {
    priority: 7,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/no-sql-web-sdk"],
    phrases: ["文档数据库", "nosql", "collection", "web sdk"],
    anyOf: ["数据库", "database", "db"],
    noneOf: ["小程序", "miniprogram"],
    minScore: 6,
    retrieval: {
      aliases: ["nosql", "document database", "mongodb"],
      intents: ["use nosql database from web", "crud collection"],
      entities: ["NoSQL", "Collection", "CloudBase JS SDK"],
      examples: ["query collection", "add document", "update nosql"],
    },
  },
  "relational-database-tool": {
    priority: 7,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/relational-database-tool"],
    phrases: ["mysql", "关系型数据库", "sql", "queryMysqlDatabase", "manageMysqlDatabase"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["mysql", "relational database", "sql"],
      intents: ["query mysql database", "manage relational database"],
      entities: ["MySQL", "FlexDB", "SQL"],
      examples: ["query mysql", "create table", "run sql"],
    },
  },
  "auth-web": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/auth-web"],
    phrases: ["web 登录", "前端认证", "web sdk auth", "web auth"],
    noneOf: ["小程序", "miniprogram"],
    minScore: 6,
    retrieval: {
      aliases: ["web auth", "前端认证"],
      intents: ["implement web authentication"],
      entities: ["CloudBase Web SDK", "auth.toDefaultLoginPage"],
      examples: ["add login to web app", "web auth flow"],
    },
  },
  "auth-wechat": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/auth-wechat"],
    phrases: ["小程序认证", "openid", "unionid", "wx.cloud auth", "微信登录"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["wechat auth", "小程序认证", "openid"],
      intents: ["implement wechat mini program auth"],
      entities: ["OPENID", "UNIONID", "wxContext", "wx.cloud"],
      examples: ["get openid", "mini program login"],
    },
  },
  "auth-nodejs": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/auth-nodejs"],
    phrases: ["服务端认证", "node 认证", "custom login ticket", "服务端 auth"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["node auth", "server auth", "服务端认证"],
      intents: ["implement server-side auth"],
      entities: ["Custom Login", "Ticket", "Node SDK"],
      examples: ["create custom login", "server auth"],
    },
  },
  "no-sql-wx-mp-sdk": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/no-sql-wx-mp-sdk"],
    phrases: ["小程序数据库", "wx.cloud database", "小程序 nosql"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["miniprogram nosql", "小程序数据库"],
      intents: ["use nosql from mini program"],
      entities: ["wx.cloud.database", "NoSQL", "Mini Program"],
      examples: ["query mini program database", "wx cloud db"],
    },
  },
  "relational-database-web": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/relational-database-web"],
    phrases: ["web mysql", "web 关系型", "web relational"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["web mysql", "relational web"],
      intents: ["use mysql from web"],
      entities: ["MySQL", "Web SDK", "FlexDB"],
      examples: ["query mysql from web", "web relational db"],
    },
  },
  "postgresql-development": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/postgresql-development"],
    phrases: ["postgresql", "postgres", "pg", "rls", "app.rdb()"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["postgresql", "postgres", "pg"],
      intents: ["use postgresql on cloudbase"],
      entities: ["PostgreSQL", "RLS", "app.rdb()"],
      examples: ["query postgres", "setup rls", "pg mode"],
    },
  },
  "cloud-storage-web": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/cloud-storage-web"],
    phrases: ["云存储", "upload", "上传", "下载", "download", "文件存储"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["cloud storage", "云存储", "file upload"],
      intents: ["upload/download files"],
      entities: ["Cloud Storage", "uploadFile", "downloadFile"],
      examples: ["upload file", "get download url", "manage storage"],
    },
  },
  "ai-model-web": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/ai-model-web"],
    phrases: ["页面 ai", "generatetext", "streamtext", "hunyuan", "混元", "deepseek", "glm", "kimi"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["web ai", "ai model web", "页面 ai"],
      intents: ["call ai from web"],
      entities: ["Hunyuan", "DeepSeek", "GLM", "generateText"],
      examples: ["add ai chat to web", "stream text"],
    },
  },
  "ai-model-nodejs": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/ai-model-nodejs"],
    phrases: ["云函数 ai", "serverless ai", "generateimage", "llm proxy"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["node ai", "serverless ai"],
      intents: ["call ai from cloud function"],
      entities: ["generateImage", "LLM Proxy", "Hunyuan"],
      examples: ["ai in cloud function", "generate image"],
    },
  },
  "ai-model-wechat": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/ai-model-wechat"],
    phrases: ["小程序 ai", "wx.cloud.extend.ai", "小程序成长计划"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["mini program ai", "小程序 ai"],
      intents: ["call ai from mini program"],
      entities: ["wx.cloud.extend.AI", "Mini Program"],
      examples: ["ai in mini program", "wx cloud ai"],
    },
  },
  "cloudbase-agent": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/cloudbase-agent"],
    phrases: ["agent", "智能体", "ag-ui", "langgraph", "langchain"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["ai agent", "智能体", "ag-ui"],
      intents: ["build ai agent"],
      entities: ["AG-UI", "LangGraph", "LangChain", "Agent SDK"],
      examples: ["build agent", "deploy ai agent"],
    },
  },
  "cloudbase-wechat-integration": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/cloudbase-wechat-integration"],
    phrases: ["微信支付", "jsapi pay", "公众号 oauth", "支付回调"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["wechat pay", "微信支付", "wechat integration"],
      intents: ["integrate wechat pay", "wechat oauth"],
      entities: ["JSAPI Pay", "OAuth", "WeChat"],
      examples: ["add wechat pay", "wechat oauth login"],
    },
  },
  "ops-inspector": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/ops-inspector"],
    phrases: ["巡检", "诊断", "health check", "健康检查", "troubleshooting"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["ops", "inspect", "diagnose", "巡检"],
      intents: ["inspect cloudbase health", "diagnose issues"],
      entities: ["AIOps", "Health Check", "Logs"],
      examples: ["run health check", "inspect environment"],
    },
  },
  "spec-workflow": {
    priority: 6,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/spec-workflow"],
    phrases: ["spec", "需求文档", "技术方案", "tasks.md", "验收标准"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["spec", "requirements", "需求"],
      intents: ["plan with spec workflow"],
      entities: ["EARS", "Requirements", "Design", "Tasks"],
      examples: ["write spec", "plan feature with requirements"],
    },
  },
  "cloudbase-guidelines": {
    priority: 5,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/cloudbase-platform"],
    phrases: ["cloudbase 总入口", "云开发指南"],
    noneOf: [],
    minScore: 8,
    retrieval: {
      aliases: ["cloudbase guidelines", "云开发指南"],
      intents: ["understand cloudbase overview"],
      entities: ["CloudBase", "Guidelines"],
      examples: ["cloudbase overview", "getting started"],
    },
  },
  "cloudbase-cli": {
    priority: 5,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/cloudbase-cli"],
    bashPatterns: ["\\btcb\\s+\\w+"],
    phrases: ["tcb", "cli", "命令行"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["tcb cli", "cloudbase cli"],
      intents: ["use tcb cli"],
      entities: ["tcb", "CLI"],
      examples: ["tcb deploy", "tcb fn list"],
    },
  },
  "http-api": {
    priority: 5,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/http-api"],
    phrases: ["http api", "非 sdk", "原生 app"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["http api", "rest api"],
      intents: ["call cloudbase via http"],
      entities: ["HTTP", "REST", "API"],
      examples: ["call cloudbase http", "native app api"],
    },
  },
  "cloudbase-code-review": {
    priority: 5,
    docs: ["https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/cloudbase-code-review"],
    phrases: ["code review", "代码审查", "lint"],
    noneOf: [],
    minScore: 6,
    retrieval: {
      aliases: ["code review", "代码审查"],
      intents: ["review cloudbase code"],
      entities: ["Lint", "Review", "Best Practices"],
      examples: ["review my code", "code quality check"],
    },
  },
};

function buildYamlBlock(dirName) {
  const meta = SKILL_METADATA[dirName];
  if (!meta) return null;

  const lines = [];

  // metadata
  lines.push("metadata:");
  lines.push(`  priority: ${meta.priority}`);
  if (meta.docs && meta.docs.length > 0) {
    lines.push("  docs:");
    for (const doc of meta.docs) {
      lines.push(`    - "${doc}"`);
    }
  }
  if (meta.pathPatterns && meta.pathPatterns.length > 0) {
    lines.push("  pathPatterns:");
    for (const p of meta.pathPatterns) {
      lines.push(`    - '${p}'`);
    }
  }
  if (meta.bashPatterns && meta.bashPatterns.length > 0) {
    lines.push("  bashPatterns:");
    for (const p of meta.bashPatterns) {
      lines.push(`    - '${p}'`);
    }
  }

  // promptSignals
  lines.push("promptSignals:");
  if (meta.phrases && meta.phrases.length > 0) {
    lines.push("  phrases:");
    for (const p of meta.phrases) {
      lines.push(`    - "${p}"`);
    }
  }
  if (meta.allOf && meta.allOf.length > 0) {
    lines.push("  allOf:");
    for (const group of meta.allOf) {
      lines.push(`    - [${group.join(", ")}]`);
    }
  }
  if (meta.anyOf && meta.anyOf.length > 0) {
    lines.push("  anyOf:");
    for (const p of meta.anyOf) {
      lines.push(`    - "${p}"`);
    }
  }
  if (meta.noneOf && meta.noneOf.length > 0) {
    lines.push("  noneOf:");
    for (const p of meta.noneOf) {
      lines.push(`    - "${p}"`);
    }
  }
  lines.push(`  minScore: ${meta.minScore || 6}`);

  // retrieval
  lines.push("retrieval:");
  const r = meta.retrieval || {};
  if (r.aliases && r.aliases.length > 0) {
    lines.push(`  aliases: [${r.aliases.join(", ")}]`);
  }
  if (r.intents && r.intents.length > 0) {
    lines.push(`  intents: [${r.intents.join(", ")}]`);
  }
  if (r.entities && r.entities.length > 0) {
    lines.push(`  entities: [${r.entities.join(", ")}]`);
  }
  if (r.examples && r.examples.length > 0) {
    lines.push(`  examples: [${r.examples.join(", ")}]`);
  }

  return lines.join("\n");
}

function upgradeSkill(dirName) {
  const skillPath = join(skillsDir, dirName, "SKILL.md");
  if (!existsSync(skillPath)) {
    return { name: dirName, status: "skip", reason: "SKILL.md not found" };
  }

  const content = readFileSync(skillPath, "utf-8");

  // Check if already upgraded
  if (content.includes("promptSignals:")) {
    return { name: dirName, status: "skip", reason: "already has promptSignals" };
  }

  // Find the closing --- of frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return { name: dirName, status: "skip", reason: "no frontmatter found" };
  }

  const yamlBlock = buildYamlBlock(dirName);
  if (!yamlBlock) {
    return { name: dirName, status: "skip", reason: "no metadata defined" };
  }

  // Insert after `alwaysApply: false` (or last frontmatter line before ---)
  const newContent = content.replace(/^(---\n[\s\S]*?)(\n---)/m, `$1\n${yamlBlock}$2`);

  writeFileSync(skillPath, newContent, "utf-8");
  return { name: dirName, status: "ok" };
}

// Main
const entries = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
console.log(`Found ${entries.length} skill directories`);

let ok = 0, skip = 0;
for (const entry of entries) {
  const result = upgradeSkill(entry.name);
  if (result.status === "ok") {
    console.log(`  ✓ ${result.name}`);
    ok++;
  } else {
    console.log(`  - ${result.name}: ${result.reason}`);
    skip++;
  }
}

console.log(`\nDone: ${ok} upgraded, ${skip} skipped`);
