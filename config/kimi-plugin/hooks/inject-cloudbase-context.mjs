#!/usr/bin/env node
/**
 * Kimi UserPromptSubmit hook.
 * When the prompt mentions CloudBase, append a compact MCP-first routing
 * block (same intent as Claude plugin inject-session-context.mjs / skill
 * inject, but self-contained for Kimi's plugin-root sandbox).
 *
 * Exit 0 + stdout text is attached to the turn. Fail-open on parse errors.
 */

const TRIGGER =
  /cloudbase|tcb\b|envid|云开发|云函数|云存储|云托管|cloudrun|静态托管|login/i;

const CONTEXT = `## CloudBase plugin context
- First call MCP \`envQuery\` / \`queryEnv\` with \`action=info\` to get envId and RuntimeMode.
- Credentials: \`tcb login\` or CloudBase API Key. Never use Kimi inject api_key / base_url as Tencent Cloud credentials.
- Prefer this plugin's CloudBase MCP tools. If MCP is missing in this session, use \`tcb\` now and configure MCP for the next session. Do not default to \`tcb deploy\`.
- Fetch domain skills on demand: \`searchKnowledgeBase(mode=skill, skillName="<name>")\` (web-development, miniprogram-development, cloudrun-development, auth-tool, postgresql-development, …).
- Do not mix Web SDK auth (\`auth.toDefaultLoginPage()\`) with Mini Program OPENID.
- Example prompts: 登录云开发 / 列出当前环境的云函数 / 查 PostgreSQL 有哪些表 / 列出云存储和 CloudRun / 部署静态托管
`;

let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let payload = {};
  try {
    payload = JSON.parse(input || "{}");
  } catch {
    process.exit(0);
  }

  const prompt = String(payload.prompt ?? payload.text ?? "");
  if (!TRIGGER.test(prompt)) {
    process.exit(0);
  }

  process.stdout.write(CONTEXT);
  process.exit(0);
});
