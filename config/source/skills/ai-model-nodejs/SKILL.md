---
name: ai-model-nodejs
description: Use this skill when developing Node.js backend services or CloudBase cloud functions (Express/Koa/NestJS, serverless, backend APIs) that need CloudBase AI managed model capabilities via @cloudbase/node-sdk ≥3.16.0. It covers generateText, streamText, and CloudBase-managed generateImage(); within the CloudBase SDK family, Node SDK is the only SDK that exposes managed image generation. Do NOT use this skill when the user explicitly wants to call Tencent Cloud / Hunyuan model APIs directly, use separate cloud-side quotas or billing, or avoid the CloudBase AI managed access layer. Not for browser/Web apps (use ai-model-web) or WeChat Mini Program (use ai-model-wechat).
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/ai-model-nodejs/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

## When to use this skill

Use this skill for **calling CloudBase AI managed models in Node.js backends or CloudBase cloud functions** using `@cloudbase/node-sdk`.

**Use it when you need to:**

- Integrate CloudBase AI managed text generation in backend services
- Generate images through CloudBase AI's managed `generateImage()` entry
- Call CloudBase AI models from CloudBase cloud functions or Node.js servers
- Keep model access on the server side behind your backend or function

**Do NOT use for:**

- Browser/Web apps → use `ai-model-web` skill
- WeChat Mini Program → use `ai-model-wechat` skill
- Requests that explicitly require direct Tencent Cloud / Hunyuan model HTTP API access
- Scenarios that require provider-native quotas, billing, API keys, or parameters instead of CloudBase AI managed access

---

## Available Providers and Models

CloudBase AI currently exposes these managed providers and models through Node SDK:

| Provider | Models | Recommended |
|----------|--------|-------------|
| `hunyuan-exp` | `hunyuan-turbos-latest`, `hunyuan-t1-latest`, `hunyuan-2.0-thinking-20251109`, `hunyuan-2.0-instruct-20251111` | ✅ `hunyuan-2.0-instruct-20251111` |
| `deepseek` | `deepseek-r1-0528`, `deepseek-v3-0324`, `deepseek-v3.2` | ✅ `deepseek-v3.2` |

> **Important:** This table describes the models exposed by **CloudBase AI's managed access layer**. It does **not** mean this skill covers every direct Tencent Cloud / Hunyuan API or every provider-native feature.

## Scope boundary: CloudBase-managed vs direct cloud model access

- `app.ai().createModel()` and `createImageModel()` go through **CloudBase AI's managed access layer**.
- Use this skill when the user wants CloudBase cloud functions / CloudRun / Node.js backends to consume **CloudBase AI** models.
- Do **not** force this skill when the user explicitly says “直接调用腾讯云上的模型 / 混元 API”, cares about separate Tencent Cloud quotas or billing, or needs provider-native API behavior.
- In those direct-cloud cases, keep CloudBase only as the runtime host and call the provider's official API from backend code after consulting the official docs.

## If the user explicitly wants TokenHub direct access

- Read `references/tokenhub-direct-access.md` before proposing code.
- Treat **TokenHub** as the direct cloud model platform and **Token Plan** as the IDE / AI coding tools subscription, not a backend API entitlement.
- Do **not** recommend Token Plan API keys for cloud functions, cron jobs, backend services, or custom application servers.
- In this repo's wording, describe the built-in managed route as the **mini program incentive / growth-plan managed path**; do not present it as the general-purpose direct-cloud API route.

---

## Installation

```bash
npm install @cloudbase/node-sdk
```

⚠️ **AI feature requires version 3.16.0 or above.** Check with `npm list @cloudbase/node-sdk`.

---

## Initialization

### In Cloud Functions

```js
const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: '<YOUR_ENV_ID>' });

exports.main = async (event, context) => {
  const ai = app.ai();
  // Use AI features
};
```

### Cloud Function Configuration for AI Models

⚠️ **Important:** When creating cloud functions that use AI models (especially `generateImage()` and large language model generation), set a longer timeout as these operations can be slow.

**Using MCP Tool `manageFunctions(action="createFunction")`:**

Legacy compatibility: if an older prompt still says `createFunction`, keep the same payload shape but execute it through `manageFunctions(action="createFunction")`.

Set the `timeout` parameter in the `func` object:

- **Parameter**: `func.timeout` (number)
- **Unit**: seconds
- **Range**: 1 - 900
- **Default**: 20 seconds (usually too short for AI operations)

**Recommended timeout values:**
- **Text generation (`generateText`)**: 60-120 seconds
- **Streaming (`streamText`)**: 60-120 seconds  
- **Image generation (`generateImage`)**: 300-900 seconds (recommended: 900s)
- **Combined operations**: 900 seconds (maximum allowed)

### In Regular Node.js Server

```js
const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({
  env: '<YOUR_ENV_ID>',
  secretId: '<YOUR_SECRET_ID>',
  secretKey: '<YOUR_SECRET_KEY>'
});

const ai = app.ai();
```

---

## generateText() - Non-streaming

```js
const model = ai.createModel("hunyuan-exp");

const result = await model.generateText({
  model: "hunyuan-2.0-instruct-20251111",  // Recommended model
  messages: [{ role: "user", content: "你好，请你介绍一下李白" }],
});

console.log(result.text);           // Generated text string
console.log(result.usage);          // { prompt_tokens, completion_tokens, total_tokens }
console.log(result.messages);       // Full message history
console.log(result.rawResponses);   // Raw model responses
```

---

## Error Handling Pattern

```js
const model = ai.createModel("deepseek");

try {
  const result = await model.generateText({
    model: "deepseek-v3.2",
    messages: [{ role: "user", content: "Summarize today's deployment logs" }],
  });

  console.log(result.text);
} catch (error) {
  console.error("AI request failed", error);
}
```

---

## streamText() - Streaming

```js
const model = ai.createModel("hunyuan-exp");

const res = await model.streamText({
  model: "hunyuan-2.0-instruct-20251111",  // Recommended model
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

## generateImage() - Image Generation

⚠️ **Within the CloudBase SDK family, managed image generation is only available in Node SDK**, not in JS SDK (Web) or WeChat Mini Program.

⚠️ `generateImage()` here belongs to **CloudBase AI's managed access layer**. It is **not** the same as directly calling Tencent Cloud / Hunyuan image APIs. If the user explicitly wants provider-side billing, quota, API keys, or native API behavior, use a backend HTTP client against the official provider API instead of assuming this method.

```js
const imageModel = ai.createImageModel("hunyuan-image");

const res = await imageModel.generateImage({
  model: "hunyuan-image",
  prompt: "一只可爱的猫咪在草地上玩耍",
  size: "1024x1024",
  version: "v1.9",
});

console.log(res.data[0].url);           // Image URL (valid 24 hours)
console.log(res.data[0].revised_prompt);// Revised prompt if revise=true
```

### Image Generation Parameters

```ts
interface HunyuanGenerateImageInput {
  model: "hunyuan-image";      // Required
  prompt: string;                       // Required: image description
  version?: "v1.8.1" | "v1.9";         // Default: "v1.8.1"
  size?: string;                        // Default: "1024x1024"
  negative_prompt?: string;             // v1.9 only
  style?: string;                       // v1.9 only
  revise?: boolean;                     // Default: true
  n?: number;                           // Default: 1
  footnote?: string;                    // Watermark, max 16 chars
  seed?: number;                        // Range: [1, 4294967295]
}

interface HunyuanGenerateImageOutput {
  id: string;
  created: number;
  data: Array<{
    url: string;                        // Image URL (24h valid)
    revised_prompt?: string;
  }>;
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
