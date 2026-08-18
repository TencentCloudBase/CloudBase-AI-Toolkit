// hooks/inject-session-context.mjs — Core session context injection
// Reads profiler env vars, builds additionalContext, outputs to Claude Code / Cursor.
// Adapted from Vercel's inject-claude-md.mjs
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createLogger } from "./logger.mjs";
import { normalizeInput, formatOutput } from "./compat.mjs";
import { hasActivationMarkers, isGreenfieldDirectory } from "./session-start-activation.mjs";
import { pluginRoot, safeReadFile } from "./hook-env.mjs";

var log = createLogger();

var GREENFIELD_CONTEXT = `<!-- cloudbase-plugin:greenfield-execution -->
## Greenfield execution mode

This directory is empty. Do not stop in planning mode or spin up a read-only planning subagent.
Choose sensible defaults immediately.
Start executing with real tool calls (prefer \`downloadTemplate\` MCP when available; if MCP is missing in this session, configure MCP for next time and use \`tcb\` / documented CLI init instead of stalling).
Only ask follow-up questions when blocked by missing credentials or irreversible decisions.`;

// Skill catalog layers (for grouping in additionalContext)
var SKILL_LAYERS = [
  { name: "Platform & Guidelines", skills: ["cloudbase", "cloudbase-platform", "cloudbase-cli"] },
  { name: "Frontend", skills: ["web-development", "miniprogram-development", "ui-design"] },
  { name: "Backend", skills: ["cloudrun-development", "cloud-functions", "cloudbase-agent"] },
  { name: "Authentication", skills: ["auth-tool-cloudbase", "auth-web-cloudbase", "auth-wechat-miniprogram", "auth-nodejs-cloudbase"] },
  { name: "Database", skills: ["cloudbase-document-database-web-sdk", "cloudbase-document-database-in-wechat-miniprogram", "relational-database-web-cloudbase", "relational-database-mcp-cloudbase", "postgresql-development-cloudbase", "data-model-creation"] },
  { name: "Storage & API", skills: ["cloud-storage-web", "http-api-cloudbase"] },
  { name: "AI Models", skills: ["ai-model-web", "ai-model-nodejs", "ai-model-wechat"] },
  { name: "Integration & Ops", skills: ["cloudbase-wechat-integration", "cloudbase-code-review", "ops-inspector", "spec-workflow"] },
];

// Short descriptions for skill catalog (fallback if manifest missing)
var SKILL_SHORT_DESC = {
  "cloudbase": "总入口：项目开发/部署/调试/迁移",
  "cloudbase-platform": "平台能力、控制台导航、跨平台差异",
  "cloudbase-cli": "tcb CLI 资源管理",
  "web-development": "Web 前端（React/Vue/Vite）",
  "miniprogram-development": "微信小程序云开发",
  "ui-design": "UI/UX 设计规范、配色、布局",
  "cloudrun-development": "CloudBase Run 后端服务",
  "cloud-functions": "云函数（事件/HTTP）",
  "cloudbase-agent": "AI Agent SDK（AG-UI/LangGraph）",
  "auth-tool-cloudbase": "管理端认证 provider 配置",
  "auth-web-cloudbase": "Web SDK 认证客户端",
  "auth-wechat-miniprogram": "小程序认证（OPENID）",
  "auth-nodejs-cloudbase": "Node.js 后端认证",
  "cloudbase-document-database-web-sdk": "Web 文档数据库",
  "cloudbase-document-database-in-wechat-miniprogram": "小程序文档数据库",
  "relational-database-web-cloudbase": "Web MySQL",
  "relational-database-mcp-cloudbase": "MCP MySQL 操作",
  "postgresql-development-cloudbase": "PostgreSQL 开发",
  "data-model-creation": "数据模型建模",
  "cloud-storage-web": "云存储上传下载",
  "http-api-cloudbase": "HTTP API（非 SDK）",
  "ai-model-web": "Web AI 模型",
  "ai-model-nodejs": "Node.js AI 模型",
  "ai-model-wechat": "小程序 AI",
  "cloudbase-wechat-integration": "微信支付、公众号 OAuth",
  "cloudbase-code-review": "代码审查",
  "ops-inspector": "AIOps 巡检",
  "spec-workflow": "Spec 需求/设计/任务流程",
};

function buildSkillCatalog() {
  const lines = [
    "### Skill Catalog (fetch on demand via cloudbase-mcp)",
    "",
    "These CloudBase domain skills are NOT auto-loaded — fetch their full content on demand via:",
    "  `searchKnowledgeBase(mode=skill, skillName=\"<name>\")`",
    "",
  ];
  for (const layer of SKILL_LAYERS) {
    lines.push(`**${layer.name}**`);
    for (const skillName of layer.skills) {
      const desc = SKILL_SHORT_DESC[skillName] || "";
      lines.push(`- \`${skillName}\` — ${desc}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

var RULES_BLOCK = `## CloudBase Plugin (plugin-injected, MUST follow)

### Hard Rules

1. **Environment Check (FIRST).** Before any CloudBase work, resolve envId + RuntimeMode + RecommendedSkills.
   When CloudBase MCP tools are available in this session, call \`envQuery({ action: "info" })\`.
   If MCP is missing or not yet loaded (first session / post-install before restart), configure MCP for
   the next session and use \`tcb\` CLI now (\`tcb login\` → \`tcb env list\` / \`tcb env use\`; see
   \`skills/cloudbase/references/tooling-fallback.md\`). Do not stall waiting for restart.
   Skip only if envId is already known from this session.

2. **Scenario Routing.** When user requests overlap multiple scenarios, use the detected scenario
   as the primary. Fetch skills via \`searchKnowledgeBase(mode=skill, skillName="<name>")\`.

3. **UI Design Mandatory.** Before generating ANY UI/page/component/style, fetch
   \`searchKnowledgeBase(mode=skill, skillName="ui-design")\` and produce its 4-part design spec.
   No exceptions for new apps/features.

4. **Auth Configuration First.** When user mentions login/auth, fetch
   \`searchKnowledgeBase(mode=skill, skillName="auth-tool-cloudbase")\` BEFORE writing client auth code.

5. **Template First for New Projects.** For greenfield projects, prefer \`downloadTemplate\` MCP when
   available; if MCP is missing in this session, configure MCP for next time and use \`tcb\` /
   documented CLI init paths from \`tooling-fallback.md\` / \`cloudbase-cli\` instead of stalling.

### CLI Quick Reference
- Prefer MCP when tools are loaded: \`manageFunctions\`, \`manageHosting\`, \`envQuery\`, \`manageStorage\`
- First-session / MCP-missing fallback: \`tcb login\`, \`tcb env use\`, \`tcb fn deploy\`, \`tcb hosting deploy\` (not \`tcb deploy\`)
- Decision tree: \`skills/cloudbase/references/tooling-fallback.md\``;

function buildAdditionalContext({ scenario, likelySkills, isGreenfield, sessionContext }) {
  const parts = [];

  // Session context (lightweight guidance)
  if (sessionContext) {
    parts.push(sessionContext);
  }

  // Scenario detection block
  const scenarioBlock = `### Scenario Detection
- **detected scenario:** ${scenario}
- **likely skills:** ${likelySkills.length > 0 ? likelySkills.join(", ") : "(none — fetch via searchKnowledgeBase)"}`;
  parts.push(scenarioBlock);

  // Hard rules
  parts.push(RULES_BLOCK);

  // Skill catalog (dynamically grouped)
  parts.push(buildSkillCatalog());

  // Greenfield mode
  if (isGreenfield) {
    parts.push(GREENFIELD_CONTEXT);
  }

  return parts.join("\n\n");
}

function main() {
  const raw = readFileSync(0, "utf-8");
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    input = {};
  }
  const normalized = normalizeInput(input);
  const platform = normalized.platform;
  const projectRoot = normalized.cwd || process.env.CLAUDE_PROJECT_ROOT || process.cwd();

  const isGreenfield = isGreenfieldDirectory(projectRoot);
  const greenfieldOverride = process.env.CLOUDBASE_PLUGIN_GREENFIELD === "true";
  const shouldActivate = isGreenfield || greenfieldOverride || !existsSync(projectRoot) || hasActivationMarkers(projectRoot);

  if (!shouldActivate) {
    log.debug("inject-session-context:skip-non-cloudbase", { projectRoot });
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  const scenario = process.env.CLOUDBASE_PLUGIN_SCENARIO || (isGreenfield ? "greenfield" : "unknown");
  const likelySkills = (process.env.CLOUDBASE_PLUGIN_LIKELY_SKILLS || "").split(",").filter(Boolean);

  // Read lightweight session context
  const sessionContext = safeReadFile(join(pluginRoot(), "cloudbase-session.md"));

  const additionalContext = buildAdditionalContext({
    scenario,
    likelySkills,
    isGreenfield: isGreenfield || greenfieldOverride,
    sessionContext,
  });

  log.summary("inject-session-context:complete", {
    scenario,
    likelySkills,
    isGreenfield: isGreenfield || greenfieldOverride,
    contextLength: additionalContext.length,
  });

  process.stdout.write(
    JSON.stringify(
      formatOutput(platform, {
        additionalContext,
      })
    )
  );
}

main();
