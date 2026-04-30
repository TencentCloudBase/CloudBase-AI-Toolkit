---
name: ai-model-web
description: Use this skill when developing browser/Web applications (React/Vue/Angular, static websites, SPAs) that need AI capabilities. Features text generation (generateText) and streaming (streamText) via @cloudbase/js-sdk. Default managed model is deepseek-v4-flash; hunyuan-2.0-instruct-20251111 available as alternative. Before calling any model you MUST run a pre-flight eligibility check via callCloudApi (DescribeEnvPostpayPackage for Token Credits resource package, or for WeChat Mini Program switch to ai-model-wechat for inspire plan). Handles non-managed / self-hosted OpenAI-compatible models via custom model integration. 关键词：大模型调用、AI 模型、generateText、streamText、资格检查、Token Credits 资源包、deepseek-v4-flash、hunyuan-exp、自定义模型接入、callCloudApi、DescribeEnvPostpayPackage。NOT for Node.js backend (use ai-model-nodejs), WeChat Mini Program (use ai-model-wechat), or image generation (Node SDK only).
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/ai-model-web/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

## When to use this skill

Use this skill for **calling AI models in browser/Web applications** using `@cloudbase/js-sdk`.

**Use it when you need to:**

- Integrate AI text generation in a frontend Web app
- Stream AI responses for better user experience
- Call Hunyuan or DeepSeek models from browser

**Do NOT use for:**

- Node.js backend or cloud functions → use `ai-model-nodejs` skill
- WeChat Mini Program → use `ai-model-wechat` skill
- Image generation → use `ai-model-nodejs` skill (Node SDK only)
- HTTP API integration → use `http-api` skill

---

## 调用前必须的资格检查（Pre-flight Eligibility Check）

在生成任何 AI 调用代码之前，**先确认当前环境具备调用条件**。直接写代码再解释错误会显著增加用户调试成本。

### 步骤 1：获取环境 ID

调用 MCP 工具 `envQuery`（`action=info`），从返回值中取出 `EnvId`。后续所有检查与购买链接都使用该 `EnvId`。

### 步骤 2：按场景判定分支

| 用户输入特征 | 进入哪个分支 |
|-------------|-------------|
| 未指定模型 / 只说「调用大模型 / AI」 | 分支 A：托管 + Token Credits 资源包 |
| 指定托管列表内模型（如 `deepseek-v4-flash`、`hunyuan-2.0-instruct-20251111`） | 分支 A |
| 指定第三方 / 自建私有模型（非托管） | 分支 C：自定义接入（跳到下一章节） |
| 目标是小程序场景 | 切到 `ai-model-wechat` skill（有小程序成长计划分支） |

### 步骤 3：分支 A — Token Credits 资源包检查

调用 MCP 工具：

```
callCloudApi(service="tcb", action="DescribeEnvPostpayPackage", params={ EnvId })
```

**命中条件**（均需满足）：
- `envPostpayPackageInfoList` 中存在至少一项
- 该项 `postpayPackageId` 前缀为 `pkg_tcb_tokencredits_`
- 该项 `status ∉ [3, 4]`（3 / 4 通常代表已过期 / 已停用；以实际响应为准）

> 参数 / 返回字段大小写以首次实测返回为准。若调用报 `InvalidParameter`，尝试 camelCase（如 `envId` / `envPostpayPackageInfoList`）。

### 步骤 4：结果处理

- ✅ **命中** → 可以继续写代码，未指定模型时使用默认 `deepseek-v4-flash`
- ❌ **未命中** → **停止写代码**，向用户输出（把 `{envId}` 替换为真实值）：
  > 当前环境未开通 Token Credits 资源包，请先购买后再调用：
  > https://buy.cloud.tencent.com/lowcode?buyType=resPack&envId={envId}&resourceType=token
  >
  > 完成后告诉我一声，我重新检查资源包状态。

---

## Available Providers and Models

CloudBase 托管以下 provider；**未指定模型时默认使用 `deepseek-v4-flash`**。

### 默认 / 推荐（托管 + Token Credits）

| Provider | 模型 | 适用 |
|----------|------|------|
| `deepseek` | ✅ **`deepseek-v4-flash`**（默认） | 通用对话、文本生成、未指定模型时的首选 |
| `hunyuan-exp` | `hunyuan-2.0-instruct-20251111` | 中文语境备选；小程序成长计划专属模型（见 `ai-model-wechat`） |

### 兼容可用（不推荐新项目）

保留在托管里但不作为首选推荐；老项目可继续使用：
`deepseek-r1-0528`、`deepseek-v3-0324`、`deepseek-v3.2`、`hunyuan-turbos-latest`、`hunyuan-t1-latest`、`hunyuan-2.0-thinking-20251109`

### 不在托管列表的模型

第三方 / 自建私有模型 → 见下一章节「不在托管列表时的自定义接入」。

---

## 不在托管列表时的自定义接入

当用户要调用**非托管**的模型（企业自建、第三方 OpenAI 兼容端点等），**不要阻塞**，给出接入指引：

1. 控制台入口：`https://tcb.cloud.tencent.com/dev?envId={envId}#/ai`
2. 程序化方式（参数名以官方文档及实测为准；若 Action 不可用，回退控制台入口）：
   ```
   callCloudApi(service="tcb", action="CreateAIModel", params={
     EnvId: "<envId>",
     Provider: "custom",
     BaseUrl: "<OpenAI 兼容端点>",
     ApiKey: "<用户持有的 key>",
     ModelName: "<模型名>"
   })
   ```
3. 配置完成后用 `callCloudApi(tcb, DescribeAIModels, { EnvId })` 查看当前环境已接入的模型列表，再按本 skill 普通 SDK 流程调用。

> 自定义模型的计费由第三方承担，不走 Token Credits 资源包。

---

## Installation

```bash
npm install @cloudbase/js-sdk
```

## Initialization

```js
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "<YOUR_ENV_ID>",
  accessKey: "<YOUR_PUBLISHABLE_KEY>"  // Get from CloudBase console
});

const auth = app.auth();
await auth.signInAnonymously();

const ai = app.ai();
```

**Important notes:**

- Always use synchronous initialization with top-level import
- User must be authenticated before using AI features
- Get `accessKey` from CloudBase console

---

## generateText() - Non-streaming

> **前提**：已完成「调用前必须的资格检查」。

```js
const model = ai.createModel("deepseek");

const result = await model.generateText({
  model: "deepseek-v4-flash",  // 默认推荐（托管 + Token Credits）
  messages: [{ role: "user", content: "你好，请你介绍一下李白" }],
});

console.log(result.text);           // Generated text string
console.log(result.usage);          // { prompt_tokens, completion_tokens, total_tokens }
console.log(result.messages);       // Full message history
console.log(result.rawResponses);   // Raw model responses
```

---

## streamText() - Streaming

> **前提**：已完成「调用前必须的资格检查」。

```js
const model = ai.createModel("deepseek");

const res = await model.streamText({
  model: "deepseek-v4-flash",  // 默认推荐
  messages: [{ role: "user", content: "你好，请你介绍一下李白" }],
});

// Option 1: Iterate text stream (recommended)
for await (let text of res.textStream) {
  console.log(text);  // Incremental text chunks
}

// Option 2: Iterate data stream for full response data
for await (let data of res.dataStream) {
  console.log(data);  // Full response chunk with metadata
}

// Option 3: Get final results
const messages = await res.messages;  // Full message history
const usage = await res.usage;        // Token usage
```

---

## Error Handling Pattern

```js
const model = ai.createModel("deepseek");

try {
  const result = await model.generateText({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Generate a concise onboarding checklist" }],
  });

  console.log(result.text);
} catch (error) {
  console.error("Failed to call CloudBase AI from Web", error);
}
```

---

## Type Definitions

```ts
interface BaseChatModelInput {
  model: string;                        // Required: model name
  messages: Array<ChatModelMessage>;    // Required: message array
  temperature?: number;                 // Optional: sampling temperature
  topP?: number;                        // Optional: nucleus sampling
}

type ChatModelMessage =
  | { role: "user"; content: string }
  | { role: "system"; content: string }
  | { role: "assistant"; content: string };

interface GenerateTextResult {
  text: string;                         // Generated text
  messages: Array<ChatModelMessage>;    // Full message history
  usage: Usage;                         // Token usage
  rawResponses: Array<unknown>;         // Raw model responses
  error?: unknown;                      // Error if any
}

interface StreamTextResult {
  textStream: AsyncIterable<string>;    // Incremental text stream
  dataStream: AsyncIterable<DataChunk>; // Full data stream
  messages: Promise<ChatModelMessage[]>;// Final message history
  usage: Promise<Usage>;                // Final token usage
  error?: unknown;                      // Error if any
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
```

---

## Best Practices

1. **Run the pre-flight eligibility check first** — confirm Token Credits 资源包 已开通（或按场景切换到自定义接入），否则模型调用会失败
2. **Use streaming for long responses** - Better user experience
3. **Handle errors gracefully** - Wrap AI calls in try/catch
4. **Keep accessKey secure** - Use publishable key, not secret key
5. **Initialize early** - Initialize SDK in app entry point
6. **Ensure authentication** - User must be signed in before AI calls
