---
name: ai-model-wechat
description: Use this skill when developing WeChat Mini Programs (小程序, 企业微信小程序, wx.cloud-based apps) that need AI capabilities. Features text generation (generateText) and streaming (streamText) with callback support (onText, onEvent, onFinish) via wx.cloud.extend.AI. Before calling ANY model you MUST run a pre-flight eligibility check — first probe the 小程序成长计划 (ai_miniprogram_inspire_plan) via callCloudApi DescribeActivityInfo; enrolled users call hunyuan-exp/hunyuan-2.0-instruct-20251111 on the plan-exclusive token pack; otherwise fall back to the Token Credits 资源包 branch (default deepseek-v4-flash) via DescribeEnvPostpayPackage; managed-list misses route to the custom-model integration path. API differs from JS/Node SDK — streamText requires data wrapper, generateText returns raw response; image generation is NOT available here. 关键词：小程序 AI、wx.cloud.extend.AI、generateText、streamText、资格检查、小程序成长计划、ai_miniprogram_inspire_plan、hunyuan-exp、hunyuan-2.0-instruct-20251111、Token Credits 资源包、deepseek-v4-flash、自定义模型接入、callCloudApi、DescribeActivityInfo、DescribeEnvPostpayPackage。NOT for browser/Web apps (use ai-model-web), Node.js backend (use ai-model-nodejs), or image generation (use ai-model-nodejs).
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/ai-model-wechat/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

## When to use this skill

Use this skill for **calling AI models in WeChat Mini Program** using `wx.cloud.extend.AI`.

**Use it when you need to:**

- Integrate AI text generation in a Mini Program
- Stream AI responses with callback support
- Call Hunyuan models from WeChat environment

**Do NOT use for:**

- Browser/Web apps → use `ai-model-web` skill
- Node.js backend or cloud functions → use `ai-model-nodejs` skill
- Image generation → use `ai-model-nodejs` skill (not available in Mini Program)
- HTTP API integration → use `http-api` skill

---

## 调用前必须的资格检查（Pre-flight Eligibility Check）

小程序侧 AI 调用的计费主要有两条路径：**小程序成长计划（优先判断）** 与 **Token Credits 资源包（通用兜底）**。在写任何 `wx.cloud.extend.AI` 调用代码前，必须先跑完下面四步，不要先写 SDK 调用再靠运行时报错兜底。

### 1. 取 `envId`

通过 MCP 工具 `envQuery action=info` 拿到当前云开发环境 ID，后续两次云 API 调用都要用到它。

### 2. 按决策分支选动作

| 用户意图 | 第一优先要查的资格 | 命中后默认模型 | 未命中时的引导动作 |
|----------|--------------------|----------------|----------------------|
| 未指定模型 / 默认调用 | 先查 **小程序成长计划** 报名状态；未命中再退回 Token Credits 资源包 | 计划内：`hunyuan-exp` 的 `hunyuan-2.0-instruct-20251111`；计划外：`deepseek-v4-flash` | 计划未报名 → 引导去 `https://docs.cloudbase.net/ai/ai-inspire-plan` 报名；资源包未开通 → 给出购买链接 |
| 指定 `hunyuan-*` 系列 | **小程序成长计划** 报名状态 | `hunyuan-exp` 的 `hunyuan-2.0-instruct-20251111`（计划专属 Token 包扣费） | 计划未报名 → 先报名或切回资源包 + 非 hunyuan 模型 |
| 指定 `deepseek-*` 等非 hunyuan 托管模型 | **Token Credits 资源包** 开通状态 | 用户指定型号，或 `deepseek-v4-flash` | 未开通 → 购买链接引导 |
| 指定第三方 / 自建私有模型（非托管） | 跳过计费资格，走「不在托管列表时的自定义接入」 | —— | 给出控制台与 `CreateAIModel` 双方案 |

### 3. 查小程序成长计划（推荐优先）

```ts
// Pseudocode, adjust case to match the real API contract on first run
callCloudApi({
  service: "tcb",
  action: "DescribeActivityInfo",
  params: {
    ActivityNames: ["ai_miniprogram_inspire_plan"], // 以实测为准，若报 InvalidParameter 回退 activityNames
  },
})
```

**命中判定**：响应中的 `attendRecords` 至少有一条 `activityName === "ai_miniprogram_inspire_plan"` 且 `envId` 与当前环境一致，即视为已报名。命中后默认模型用 `hunyuan-exp` / `hunyuan-2.0-instruct-20251111`，计费走计划专属 Token 包 `pkg_hunyuan_token_la_inspire_100m`（到期后需要用户续订或切换到资源包分支）。

**未命中处理**：不要自己偷偷 fallback 到资源包 + hunyuan，先告诉用户「当前环境未报名小程序成长计划」，给出报名入口 `https://docs.cloudbase.net/ai/ai-inspire-plan` 并询问是报名后再试、还是切到资源包路径 + 非 hunyuan 模型。

### 4. 查 Token Credits 资源包（兜底 / 非 hunyuan 模型）

```ts
callCloudApi({
  service: "tcb",
  action: "DescribeEnvPostpayPackage",
  params: {
    EnvId: "<当前 envId>", // 以实测为准，若报 InvalidParameter 回退 envId
  },
})
```

**命中判定**：`envPostpayPackageInfoList` 中存在一条 `postpayPackageId` 以 `pkg_tcb_tokencredits_` 开头，且 `status ∉ [3, 4]`（未过期且未被禁用）。同时检查 `versionSwitchStatus` 非阻塞态；两者任一不满足，视为 `billingModelBlocked`。

**未命中处理**：返回购买链接模板

```
https://buy.cloud.tencent.com/lowcode?buyType=resPack&envId={envId}&resourceType=token
```

把 `{envId}` 替换成上一步拿到的真实环境 ID 再给用户，不要留占位符。

> **API 大小写提示**：腾讯云公共服务 Action 官方契约默认 PascalCase（`EnvId`、`ActivityNames`），业务文档里常写成 camelCase。首次调用若收到 `InvalidParameter` 就切换大小写再试，并把结论固化到本工程的调用封装里。

---

## Available Providers and Models

CloudBase 托管的模型分三类，决策树走完再决定用哪一类：

### A. 小程序成长计划专属（推荐默认）

| Provider | Models | 说明 |
|----------|--------|------|
| `hunyuan-exp` | `hunyuan-2.0-instruct-20251111`（✅ 默认）、`hunyuan-turbos-latest`、`hunyuan-t1-latest`、`hunyuan-2.0-thinking-20251109` | 由 `pkg_hunyuan_token_la_inspire_100m` 扣费；未报名成长计划时不要直接调用 |

### B. 通用 Token Credits 资源包（兜底默认）

| Provider | Models | 说明 |
|----------|--------|------|
| `deepseek` | `deepseek-v4-flash`（✅ 默认）、`deepseek-v3.2`、`deepseek-r1-0528`、`deepseek-v3-0324` | 依赖 `pkg_tcb_tokencredits_*` 资源包 |

### C. 不在托管列表时 → 自定义接入

涉及第三方 / 自建 / OpenAI 兼容端点的模型（即未出现在上方 A/B 列表中的所有模型）不走上面两种计费，必须通过「自定义模型接入」登记后才能在小程序里调用。做法见下一节。

---

## 不在托管列表时的自定义接入

当用户指定的模型既不在成长计划列表也不在 Token Credits 资源包支持列表（例如企业自建 OpenAI 兼容端点、第三方模型服务）时，走以下双方案任选其一，**描述上不要点名具体竞品品牌**，用「第三方 / 自建 / OpenAI 兼容端点」这类中性措辞。

**方案 1 · 控制台登记**

指引用户去 CloudBase 控制台 AI 模型页登记：

```
https://tcb.cloud.tencent.com/dev?envId={envId}#/ai
```

把 `{envId}` 替换成真实环境 ID，让用户手工填入模型名、访问地址、密钥等字段。

**方案 2 · 通过 `callCloudApi` 登记**

```ts
callCloudApi({
  service: "tcb",
  action: "CreateAIModel", // 以实测为准
  params: {
    EnvId: "<当前 envId>",
    // 其余字段以 DescribeAIModels / CreateAIModel 的实际契约为准
  },
})
```

登记完成后，用 `DescribeAIModels` 确认模型已就绪，再在小程序里用 `wx.cloud.extend.AI.createModel("<登记的 provider 名>")` 发起调用。所有调用仍会走当前环境的计费入口，若此类自定义模型也需要 Token 结算，同样要先完成资格检查。

---


## Prerequisites

- WeChat base library **3.7.1+**
- No extra SDK installation needed

---

## Initialization

```js
// app.js
App({
  onLaunch: function() {
    wx.cloud.init({ env: "<YOUR_ENV_ID>" });
  }
})
```

---

## generateText() - Non-streaming

⚠️ **Different from JS/Node SDK:** Return value is raw model response.

> **前提**：已完成「调用前必须的资格检查」。下面示例默认当前环境已报名小程序成长计划，因此用 `hunyuan-exp` / `hunyuan-2.0-instruct-20251111`；若资格分支落到资源包，把模型换成 `deepseek` + `deepseek-v4-flash` 即可。

```js
const model = wx.cloud.extend.AI.createModel("hunyuan-exp");

const res = await model.generateText({
  model: "hunyuan-2.0-instruct-20251111",  // 计划内默认
  messages: [{ role: "user", content: "你好" }],
});

// ⚠️ Return value is RAW model response, NOT wrapped like JS/Node SDK
console.log(res.choices[0].message.content);  // Access via choices array
console.log(res.usage);                        // Token usage
```

---

## streamText() - Streaming

⚠️ **Different from JS/Node SDK:** Must wrap parameters in `data` object, supports callbacks.

> **前提**：已完成「调用前必须的资格检查」。下列示例按成长计划分支写；走资源包分支时把 `createModel("hunyuan-exp")` 换成 `createModel("deepseek")`，`model` 换成 `deepseek-v4-flash`。

```js
const model = wx.cloud.extend.AI.createModel("hunyuan-exp");

// ⚠️ Parameters MUST be wrapped in `data` object
const res = await model.streamText({
  data: {                              // ⚠️ Required wrapper
    model: "hunyuan-2.0-instruct-20251111",  // 计划内默认
    messages: [{ role: "user", content: "hi" }]
  },
  onText: (text) => {                  // Optional: incremental text callback
    console.log("New text:", text);
  },
  onEvent: ({ data }) => {             // Optional: raw event callback
    console.log("Event:", data);
  },
  onFinish: (fullText) => {            // Optional: completion callback
    console.log("Done:", fullText);
  }
});

// Async iteration also available
for await (let str of res.textStream) {
  console.log(str);
}

// Check for completion with eventStream
for await (let event of res.eventStream) {
  console.log(event);
  if (event.data === "[DONE]") {       // ⚠️ Check for [DONE] to stop
    break;
  }
}
```

---

## Error Handling Pattern

> **前提**：已完成「调用前必须的资格检查」。资源包分支用 `deepseek-v4-flash` 兜底。

```js
const model = wx.cloud.extend.AI.createModel("deepseek");

try {
  const res = await model.generateText({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "生成一段欢迎文案" }],
  });

  console.log(res.choices[0].message.content);
} catch (error) {
  console.error("Mini Program AI request failed", error);
}
```

---

## API Comparison: JS/Node SDK vs WeChat Mini Program

| Feature | JS/Node SDK | WeChat Mini Program |
|---------|-------------|---------------------|
| **Namespace** | `app.ai()` | `wx.cloud.extend.AI` |
| **generateText params** | Direct object | Direct object |
| **generateText return** | `{ text, usage, messages }` | Raw: `{ choices, usage }` |
| **streamText params** | Direct object | ⚠️ Wrapped in `data: {...}` |
| **streamText return** | `{ textStream, dataStream }` | `{ textStream, eventStream }` |
| **Callbacks** | Not supported | `onText`, `onEvent`, `onFinish` |
| **Image generation** | Node SDK only | Not available |

---

## Type Definitions

### streamText() Input

```ts
interface WxStreamTextInput {
  data: {                              // ⚠️ Required wrapper object
    model: string;
    messages: Array<{
      role: "user" | "system" | "assistant";
      content: string;
    }>;
  };
  onText?: (text: string) => void;     // Incremental text callback
  onEvent?: (prop: { data: string }) => void;  // Raw event callback
  onFinish?: (text: string) => void;   // Completion callback
}
```

### streamText() Return

```ts
interface WxStreamTextResult {
  textStream: AsyncIterable<string>;   // Incremental text stream
  eventStream: AsyncIterable<{         // Raw event stream
    event?: unknown;
    id?: unknown;
    data: string;                      // "[DONE]" when complete
  }>;
}
```

### generateText() Return

```ts
// Raw model response (OpenAI-compatible format)
interface WxGenerateTextResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

---

## Best Practices

1. **先跑「调用前必须的资格检查」再写业务代码** —— 小程序侧两条计费路径并存：优先 `DescribeActivityInfo` 判成长计划，再 `DescribeEnvPostpayPackage` 判 Token Credits 资源包。未就绪时直接抛引导，不要先写 `wx.cloud.extend.AI` 调用再看报错。
2. **Hunyuan 系列强绑定成长计划** —— 只要用户想走 `hunyuan-*` 模型，成长计划必须已报名；未报名时先引导 `https://docs.cloudbase.net/ai/ai-inspire-plan`，或切到 `deepseek-v4-flash` + 资源包方案，不要绕开校验直接调用。
3. **Check base library version** —— Ensure 3.7.1+ for AI support。低版本直接在 `wx.cloud.extend.AI` 上报 undefined，不要当成模型问题排查。
4. **Use callbacks for UI updates** —— `onText` 适合逐段刷新聊天气泡，避免用 `eventStream` 手工拼串时漏掉分隔符。
5. **Check for `[DONE]`** —— 使用 `eventStream` 时必须判断 `event.data === "[DONE]"` 才停止循环，否则会一直挂着等待下一帧。
6. **Remember the `data` wrapper** —— streamText 参数必须裹在 `data: { ... }` 里，这点跟 JS/Node SDK 不一样，漏写会直接报参数错误。
7. **错误处理要区分「资格未就绪」与「调用失败」** —— 前者要把用户带去报名 / 购买流程；后者才是排查 prompt、模型参数或网络问题。两者提示文案与动作完全不同。
8. **不要在小程序里硬编码第三方模型密钥** —— 托管列表外的模型走「自定义接入」登记，由 CloudBase 侧代管密钥；小程序端只保留 provider 名。
