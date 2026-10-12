import type { Lang } from "../i18n/index.js";

/**
 * MCP `initialize` 结果里的 `instructions`（服务端自述「怎么用我」）。
 *
 * 为什么放这里而不是 i18n 词典：词典是给工具 description / 输出文案用的短句，
 * 这是一整段免协商的自述文本，跟着 server 走、由实例语言选一份。
 *
 * 四条约束（改文案前先读）：
 *   1. **≤ MAX_CHARS**（≈500 tokens）。工具定义本身已经吃掉 3 万 tokens（44 个工具），
 *      这里再堆就是雪上加霜 —— 所以只写「先做一次调用 + 顺序 + 3 条可照抄问法」，
 *      **不列工具清单**（除 `auth` 与「别猜、先查」要用的检索入口外不点名工具）。
 *   2. **只写使用者照着做什么**，不写内部实现、不写安全须知（那是 rules 的活）。
 *   3. 提到的 action 名必须与 `auth` 工具 schema 一致（`status` / `start_auth` /
 *      `login_by_api_key` / `set_env` / `logout`），改 auth 时这里要一起改。
 *   4. **第一句就给一个「零参数、只读、现在就能做」的动作**。读这段文本的模型如果在
 *      犹豫该不该动，成本最低的出口就是它 —— 这直接对着「连上了但一次都不调用」那条断点。
 *
 * ⚠️ 客户端是否把 instructions 注入上下文**不由协议保证**，也**看不出来**（它不是
 * capability）⇒ 同样的话在工具 description（首推 `auth`）里要留兜底，不要把它当唯一引导。
 */
export const SERVER_INSTRUCTIONS_MAX_CHARS = 2000;

export const SERVER_INSTRUCTIONS: Record<Lang, string> = {
  zh: [
    "CloudBase MCP：操作腾讯云开发（CloudBase）环境里的云函数、数据库、静态托管等资源。",
    "",
    '第一步先做一次工具调用：auth(action="status") —— 只读、不用参数，用来确认登录态和当前环境。不确定从哪开始时，永远先调它。',
    "",
    "需要登录或绑定环境时，按这个顺序走：",
    '1. auth(action="status") 查登录态；需要登录时按它返回的指引完成登录。',
    '2. auth(action="set_env", envId="环境ID") 绑定环境 —— 没有绑定环境时，其他工具都用不了。',
    "3. 做一件小事确认链路通，例如「列出这个环境的云函数」。",
    "",
    "还没有环境？国内站新用户可以免费开通一个体验环境，开通后再回到第 2 步。",
    "",
    "不要凭记忆猜 API 名称、参数和用法：先读 CloudBase Skill，或调用知识库检索 searchKnowledgeBase 确认，再动手；查不到就说查不到，不要编。",
    "",
    "可以直接照抄的问法：",
    "- 看下数据库里最新的 10 条记录",
    "- 把我当前项目部署到静态托管",
    "- 列出这个环境的云函数和它们最近的日志",
    "",
    "报错时按报错文案里的指引处理，不要反复重试同一个调用。",
  ].join("\n"),
  en: [
    "CloudBase MCP: work with resources in a Tencent CloudBase environment — cloud functions, databases, static hosting, and more.",
    "",
    'Start with one tool call: auth(action="status") — read-only, no arguments, it confirms the login state and the current environment. When unsure where to begin, call it first.',
    "",
    "When login or an environment binding is needed, follow this order:",
    '1. auth(action="status") to check the login state; follow the guidance it returns when login is required.',
    '2. auth(action="set_env", envId="your-env-id") to bind an environment. Until one is bound, the other tools are unusable.',
    '3. Do one small thing to confirm the connection works, for example "list the cloud functions in this environment".',
    "",
    "No environment yet? On the China site a new user can create a trial environment for free; then return to step 2.",
    "",
    "Do not guess API names, parameters or usage from memory: read the CloudBase Skill first, or confirm through the knowledge-base search (searchKnowledgeBase), then act. If it is not documented, say so instead of inventing it.",
    "",
    "Prompts you can copy as-is:",
    "- Show me the 10 most recent records in the database",
    "- Deploy my current project to static hosting",
    "- List this environment's cloud functions and their recent logs",
    "",
    "When a call fails, follow the guidance in the error message instead of retrying the same call repeatedly.",
  ].join("\n"),
};

/** 按实例语言取 instructions；未知语言回退 zh（与 i18n 的默认一致） */
export function resolveServerInstructions(lang: Lang): string {
  return SERVER_INSTRUCTIONS[lang] ?? SERVER_INSTRUCTIONS.zh;
}
