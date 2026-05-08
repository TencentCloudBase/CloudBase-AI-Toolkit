---
name: ai-model-nodejs
description: Use this skill when developing Node.js backend services, CloudBase cloud functions, or CloudRun services (Express / Koa / NestJS, serverless, backend APIs, scheduled jobs, LLM proxies) that need AI capabilities through `@cloudbase/node-sdk` (>= 3.16.0). Also use it for any AI **image generation** — the Node SDK is the only one that supports `ai.createImageModel("hunyuan-image")` + `generateImage`. **Routing note:** for Web/page-facing AI chat UIs, prefer `ai-model-web` instead of wrapping this SDK behind a backend proxy; use the Node SDK when the call truly belongs on the server (private keys, long-running agent jobs, orchestration, image generation). Text models are invoked via `ai.createModel("<GroupName>")` where the only legal GroupName values are `"cloudbase"` (the main managed group; **no model is enabled by default** — always check `DescribeAIModels` first, then `DescribeManagedAIModelList` for the authoritative supported-model catalog, then `UpdateAIModel` with `Status: 1` to enable the target model), `"hunyuan-exp"` (legacy builtin group, only if `DescribeAIModels` returns it), or a user-defined GroupName created via `CreateAIModel` (must start with `custom-`). The concrete model id (`deepseek-v4-flash`, `deepseek-v3.2`, `hunyuan-2.0-instruct-20251111`, `glm-5`, `kimi-k2.6`, …) goes into the **`model` field** of `generateText` / `streamText`. Image generation uses `ai.createImageModel("hunyuan-image")`. Before emitting any SDK code the agent MUST run the two-step preflight: (1) eligibility — call `DescribeEnvPostpayPackage` to confirm a Token Credits resource pack is active (text and image share the same pack); (2) group readiness — `DescribeAIModels` → `DescribeManagedAIModelList` → `UpdateAIModel` to enable the target model. **Never assume a model is already enabled**, and never invent SDK method names — this skill is the authoritative reference for `@cloudbase/node-sdk` AI methods; look them up here, do not guess. Non-managed / self-hosted OpenAI-compatible models must be onboarded through `CreateAIModel` as a custom group. Keywords: backend, server-side, 云函数, 云托管, serverless, Express, Koa, NestJS, LLM proxy, agent orchestration, call large language model, AI model, generateText, streamText, generateImage, createModel, cloudbase group, hunyuan-exp, hunyuan-image, eligibility check, group readiness, Token Credits resource pack, deepseek-v4-flash, UpdateAIModel, DescribeAIModels, DescribeManagedAIModelList, CreateAIModel, custom model onboarding, callCloudApi, DescribeEnvPostpayPackage, TokenHub, Hunyuan, DeepSeek, GLM, Zhipu GLM, Kimi, MiniMax, third-party managed model. Do NOT use for browser/Web apps (use `ai-model-web`) or WeChat Mini Program (use `ai-model-wechat`).
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/ai-model-nodejs/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

## When to use this skill

Use this skill for **calling AI models from Node.js backends, cloud functions, or CloudRun services** via `@cloudbase/node-sdk`.

> 🧭 **Runtime-plane fit.** This is the right skill when the AI call truly belongs on the server: image generation (the only SDK that supports it), long-running agent jobs, orchestration across multiple tools, scheduled tasks, or flows that must keep secrets server-side. **If the user is building a Web page / frontend AI chat UI, do NOT wrap this SDK behind a backend proxy** — route to `ai-model-web` and call the model directly from the browser. For WeChat Mini Programs use `ai-model-wechat`. Routing is decided by runtime plane first; the concrete model (`deepseek-*`, `glm-*`, `hunyuan-*`, `kimi-*`, …) only affects the `model` field.

**Use it when you need to:**

- Integrate AI text generation into a backend service
- Generate images with the Hunyuan Image model
- Call AI models from CloudBase cloud functions or CloudRun
- Do server-side AI processing (agent orchestration, batch jobs, scheduled tasks)

**Do NOT use for:**

- Browser/Web apps → use the `ai-model-web` skill
- WeChat Mini Program → use the `ai-model-wechat` skill
- HTTP API integration → use the `http-api` skill

---

## ⛔ STOP — `ai.createModel(...)` argument is **not** a vendor / model name

Read this before writing any `createModel(...)` line. Agents frequently hallucinate this argument. There are **exactly three** legal shapes. Anything else is a bug.

| ✅ Legal `ai.createModel(...)` argument | When to use it |
|----------------------------------------|----------------|
| `"cloudbase"` | **The main managed group for server-side projects** (TokenHub-backed, multi-vendor pool). Vendor + concrete model go into the **`model` field** of `generateText` / `streamText`, e.g. `{ model: "deepseek-v4-flash" }`. **No model is enabled by default — always check `DescribeAIModels` first and, if the target model is missing, enable it with `UpdateAIModel` before calling the SDK.** |
| `"hunyuan-exp"` | Only if `DescribeAIModels` explicitly returns this legacy builtin group for the current env. |
| `"custom-<your-name>"` | A user-defined GroupName you onboarded via `CreateAIModel`. **Must** start with `custom-` (e.g. `custom-kimi`, `custom-openai-compat`). |

> Image generation is a separate entry point: `ai.createImageModel("hunyuan-image")`. Do not mix it with `createModel(...)`.

### ❌ Do NOT write any of these — they are all wrong

```js
ai.createModel("deepseek")                 // wrong — that's a vendor, not a GroupName
ai.createModel("deepseek-v4-flash")        // wrong — model id goes in the `model` field
ai.createModel("hunyuan") / "hunyuan-2.0-instruct-20251111"  // wrong — vendor / model name
ai.createModel("glm") / "kimi" / "minimax"  // wrong — vendor names
ai.createModel("openai") / "moonshot"       // wrong — vendor names
ai.createModel("custom")                   // wrong — placeholder; use your real custom-<name>
ai.createModel(modelName)                  // wrong — do not reuse the variable that holds the model id
```

### ✅ Correct pattern — GroupName vs Model are two different fields

```js
const model = ai.createModel("cloudbase");          // ← GroupName
await model.generateText({
  model: "deepseek-v4-flash",                       // ← concrete model id
  messages: [...]
});
```

### Decision procedure (when the user names a specific model)

1. The user says "use DeepSeek v3.2" / "use hunyuan instruct" / "use Kimi k2.6" / "use GLM-5" / …
2. `createModel("cloudbase")` stays the same.
3. Put the model id into the **`model` field**: `{ model: "deepseek-v3.2" }`, `{ model: "hunyuan-2.0-instruct-20251111" }`, `{ model: "kimi-k2.6" }`, `{ model: "glm-5" }`, …
4. **Never assume the model is already enabled.** Before calling the SDK, verify it is present in `DescribeAIModels({ GroupName: "cloudbase" }).Models[]`. If missing, call `DescribeManagedAIModelList` to confirm the exact `Model` name the platform supports (case-sensitive — do **not** guess the spelling) and then enable it via `UpdateAIModel` with `Status: 1` (remember `Models` is a full replacement).

> If you are about to type `ai.createModel(` and the thing inside the parentheses is a vendor name, a model name, or a guess — **stop**. It is almost certainly one of the three legal values above.

---

## Mandatory Two-Step Preflight (before any SDK code)

Before calling any AI API on the server, **run the two-step preflight**: ① eligibility, ② group readiness. **Text generation and image generation draw from the same Token Credits resource pack**, and both must complete the preflight before code is emitted.

### Step 0: obtain the environment ID

Call the MCP tool `envQuery` with `action=info` and read `EnvId` from the response.

---

### Preflight ① — Eligibility (Token Credits resource pack)

Call the MCP tool:

```
callCloudApi(service="tcb", action="DescribeEnvPostpayPackage", params={ EnvId })
```

**Pass conditions (all required):**
- `envPostpayPackageInfoList` contains at least one entry
- That entry's `postpayPackageId` starts with `pkg_tcb_tokencredits_`
- That entry's `status` is NOT in `[3, 4]` (3 / 4 typically mean expired / disabled; trust the live response)

- ❌ **Not satisfied** → **stop writing code** and surface this to the user (replacing `{envId}` with the real id):
  > The current environment has no active Token Credits resource pack. Please purchase one before calling any AI API:
  > https://buy.cloud.tencent.com/lowcode?buyType=resPack&envId={envId}&resourceType=token
  >
  > Let me know once it's done and I'll re-check the resource pack status.

- ✅ **Satisfied** → proceed to preflight ②.

> Parameter casing is PascalCase by contract. If the call returns `InvalidParameter`, fall back to camelCase (`envId`) and trust the live response.

---

### Preflight ② — Group readiness (`DescribeAIModels` → `UpdateAIModel` if needed)

Eligibility alone is not enough. **Do not write `createModel("cloudbase")` yet.** First confirm that the target `GroupName` exists in the env with `Status=1`, and that the target `Model` is present in its `Models[]`.

1. **List groups configured in the current env:**

   ```
   callCloudApi(service="tcb", action="DescribeAIModels", params={ EnvId })
   ```

   Returns `AIModelGroups: AIModelGroup[]` with `GroupName`, `Type` (`builtin` / `custom`), `Models: [{ Model, EnableMCP, Tags }]`, `Status` (1 / 2), `BaseUrl`, `Secret`, `Remark`. The main managed `GroupName` is `cloudbase`.

2. **Never assume a model is already enabled.** Inspect `AIModelGroups[?].Models[].Model` for the target group. If the text model you plan to use (e.g. `deepseek-v4-flash`, or whatever the user asked for) is missing from the `cloudbase` group's `Models[]`, jump to step 4 and enable it — do not call `createModel("cloudbase")` yet. Image generation uses `createImageModel("hunyuan-image")` + `model: "hunyuan-image"`; verify it is likewise enabled before the call.

3. **User asked for a model from the managed catalog** (e.g. `deepseek-v3.2`, `hunyuan-2.0-instruct-20251111`): check whether that `Model` is already in the `cloudbase` group's `Models[]`. If not, jump to step 4. **Do not guess the exact model id** — confirm the canonical spelling in `DescribeManagedAIModelList` first.

4. **Enable / add a managed model** (always inspect the authoritative catalog + pricing first):

   ```
   callCloudApi(service="tcb", action="DescribeManagedAIModelList", params={ EnvId })
   ```

   Returns `ManagedAIModelGroup[]` with `GroupName`, `Remark`, and `Models: [{ Model, EnableMCP, ModelSpec, ModelChargingInfo }]`. **This is the single source of truth for supported model names and pricing — do not infer them from memory. Use the exact `Model` string from here when calling `UpdateAIModel`.** `ModelChargingInfo` includes input / output prices and billing unit. Surface the prices to the user before enabling.

   Then enable (note: `Models` is a **full replacement** — always resend the already-enabled models together with the new one):

   ```
   callCloudApi(service="tcb", action="UpdateAIModel", params={
     EnvId,
     GroupName: "cloudbase",
     Models: [
       // resend every model that DescribeAIModels already showed as enabled
       { Model: "<already-enabled model>" },
       // append the newly-requested one, using the exact spelling from DescribeManagedAIModelList
       { Model: "<target model>" }
     ],
     Status: 1
   })
   ```

5. **The requested model is not in the managed catalog** (not found by `DescribeManagedAIModelList`) → jump to the next section, **Custom onboarding (models outside the managed catalog)**.

> All Actions use `service=tcb`, `Version=2018-06-08`. Parameters are PascalCase; fall back to camelCase only on `InvalidParameter`.

---

## Available Providers and Models

`ai.createModel(<GroupName>)` accepts exactly three kinds of legal values; `ai.createImageModel("hunyuan-image")` is the dedicated image-generation entry point.

### 1. `"cloudbase"` — the main managed group (recommended)

- `GroupName: "cloudbase"`, `Type: "builtin"`, `Remark: "腾讯云开发"` (Tencent CloudBase)
- Backed by **Tencent Cloud TokenHub**, a unified managed pool covering multiple vendors — **Hunyuan** (HY 2.0 Instruct, HY 2.0 Think, Hunyuan-role, Hy3 preview, …), **DeepSeek** (DeepSeek-V4-Pro, DeepSeek-V4-Flash, Deepseek-v3.2, Deepseek-v3.1, Deepseek-r1-0528, Deepseek-v3-0324, …), **Zhipu GLM** (GLM-5, GLM-5-Turbo, GLM-5.1, GLM-5V-Turbo), **Kimi** (K2.5, K2.6), **MiniMax** (M2.5, M2.7), and more. The roster evolves — **do not hard-code specific SKUs**; discover at runtime
- **No model is enabled by default.** Always call `DescribeAIModels` first to see what the env has actually enabled; if your target model is missing, call `DescribeManagedAIModelList` for the authoritative catalog + pricing and then `UpdateAIModel` (`Status: 1`, `Models` full-replacement) to enable it before making the SDK call.
- Authoritative catalog + pricing: `DescribeManagedAIModelList`
- Env-enabled set: `DescribeAIModels`

### 2. `"hunyuan-exp"` — legacy builtin group (kept for compatibility)

- Default model: `hunyuan-2.0-instruct-20251111`; additional hunyuan SKUs must be discovered at runtime via `DescribeAIModels({ GroupName: "hunyuan-exp" }).Models[]` — do not hard-code other IDs
- Use it directly only if `DescribeAIModels` actually returns this group with `Status=1`. New projects should prefer `cloudbase`

### 3. User-defined GroupName

- Onboarded via `CreateAIModel` (see the next section). The custom `GroupName` **MUST start with `custom-`** (e.g. `custom-kimi`, `custom-moonshot`, `custom-openai-compat`). This naming convention prevents future collisions with built-in / vendor GroupNames (like `cloudbase`, `hunyuan-exp`, `deepseek`, `glm`, `kimi`, `minimax`) that the platform may introduce over time
- Examples: `createModel("custom-kimi")`, `createModel("custom-openai-compat")`

### Image generation (independent API)

- `ai.createImageModel("hunyuan-image")` + `model: "hunyuan-image"`. Only supported in the Node SDK

> **Never** write guesses like `createModel("deepseek")` or `createModel("custom")` unless `DescribeAIModels` explicitly returned that exact `GroupName`.

---

## Custom onboarding (models outside the managed catalog)

When the user wants a **non-managed** text model (self-hosted, enterprise-internal, third-party OpenAI-compatible endpoint, …), **do not block**. Guide them through onboarding:

### Option 1: console flow (recommended, user handles it)

`https://tcb.cloud.tencent.com/dev?envId={envId}#/ai`

### Option 2: programmatic onboarding (`CreateAIModel`)

```
callCloudApi(service="tcb", action="CreateAIModel", params={
  EnvId: "<envId>",
  GroupName: "custom-<your-name>",  // MUST start with "custom-" (e.g. custom-kimi, custom-openai-compat); never start with "cloudbase"
  BaseUrl: "<OpenAI-compatible endpoint, e.g. https://api.moonshot.cn/v1>",
  Models: [
    { Model: "<model name, e.g. kimi-k2.5>", EnableMCP: true }
  ],
  Remark: "<optional remark>",
  Status: 1,
  Secret: { ApiKey: "<vendor api key supplied by the user>" }
})
```

Once onboarded, confirm with `DescribeAIModels` that the group is ready, then call `ai.createModel("<the GroupName you just registered>")` from your code. Use `UpdateAIModel` to add/remove models, rotate keys, or change `BaseUrl` (remember `Models` is a **full replacement**). Use `DeleteAIModel` to remove a custom group (builtin groups cannot be deleted).

> Custom-model billing is covered by the third-party provider and does not draw from the Token Credits resource pack. Field casing follows the live contract — fall back to camelCase on `InvalidParameter`.

---

## Installation

```bash
npm install @cloudbase/node-sdk
```

⚠️ **The AI feature requires version 3.16.0 or above.** Check with `npm list @cloudbase/node-sdk`.

---

## Initialization

### Inside a CloudBase cloud function

```js
const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: '<YOUR_ENV_ID>' });

exports.main = async (event, context) => {
  const ai = app.ai();
  // Use AI features
};
```

### Cloud function configuration for AI models

⚠️ **Important:** when creating cloud functions that use AI models (especially `generateImage()` and large text generation), set a longer timeout — these operations can be slow.

**Using the MCP tool `manageFunctions(action="createFunction")`:**

Legacy compatibility: if an older prompt still says `createFunction`, keep the same payload shape but execute it through `manageFunctions(action="createFunction")`.

Set `timeout` inside the `func` object:

- **Parameter**: `func.timeout` (number)
- **Unit**: seconds
- **Range**: 1 – 900
- **Default**: 20 seconds (usually too short for AI operations)

**Recommended timeouts:**
- **Text generation (`generateText`)**: 60 – 120 s
- **Streaming (`streamText`)**: 60 – 120 s
- **Image generation (`generateImage`)**: 300 – 900 s (recommended: 900 s)
- **Combined operations**: 900 s (maximum allowed)

### In a regular Node.js server

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

## generateText() — non-streaming

> **Prerequisite:** the two-step preflight (eligibility + group readiness) has passed. The example below assumes the user did not specify a model, so it uses the `cloudbase` managed group + `deepseek-v4-flash`.

```js
const model = ai.createModel("cloudbase");

const result = await model.generateText({
  model: "deepseek-v4-flash",  // must already be enabled in this env (DescribeAIModels → UpdateAIModel)
  messages: [{ role: "user", content: "Give me a one-paragraph intro to Li Bai." }],
});

console.log(result.text);           // generated text string
console.log(result.usage);          // { prompt_tokens, completion_tokens, total_tokens }
console.log(result.messages);       // full message history
console.log(result.rawResponses);   // raw model responses
```

---

## Error Handling Pattern

```js
const model = ai.createModel("cloudbase");

try {
  const result = await model.generateText({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Summarize today's deployment logs." }],
  });

  console.log(result.text);
} catch (error) {
  console.error("AI request failed", error);
}
```

---

## streamText() — streaming

> **Prerequisite:** the two-step preflight has passed.

```js
const model = ai.createModel("cloudbase");

const res = await model.streamText({
  model: "deepseek-v4-flash",
  messages: [{ role: "user", content: "Give me a one-paragraph intro to Li Bai." }],
});

// Option 1: iterate the text stream (recommended)
for await (let text of res.textStream) {
  console.log(text);  // incremental text chunks
}

// Option 2: iterate the data stream for full response chunks
for await (let data of res.dataStream) {
  console.log(data);  // full response chunk with metadata
}

// Option 3: access final results
const messages = await res.messages;  // full message history
const usage = await res.usage;        // token usage
```

---

## generateImage() — image generation

⚠️ **Image generation is only available in the Node SDK**, not in the JS SDK (Web) or WeChat Mini Program.

⚠️ **Image generation also consumes the Token Credits resource pack**, so the two-step preflight must pass before calling it. Per-call cost is higher than text and calls take longer (set cloud function timeout to 900 s).

```js
const imageModel = ai.createImageModel("hunyuan-image");

const res = await imageModel.generateImage({
  model: "hunyuan-image",
  prompt: "A cute kitten playing on the grass",
  size: "1024x1024",
  version: "v1.9",
});

console.log(res.data[0].url);           // image URL (valid for 24 hours)
console.log(res.data[0].revised_prompt);// revised prompt when revise=true
```

### Image Generation Parameters

```ts
interface HunyuanGenerateImageInput {
  model: "hunyuan-image";      // required
  prompt: string;                       // required: image description
  version?: "v1.8.1" | "v1.9";         // default: "v1.8.1"
  size?: string;                        // default: "1024x1024"
  negative_prompt?: string;             // v1.9 only
  style?: string;                       // v1.9 only
  revise?: boolean;                     // default: true
  n?: number;                           // default: 1
  footnote?: string;                    // watermark, max 16 chars
  seed?: number;                        // range: [1, 4294967295]
}

interface HunyuanGenerateImageOutput {
  id: string;
  created: number;
  data: Array<{
    url: string;                        // image URL (24h valid)
    revised_prompt?: string;
  }>;
}
```

---

## Type Definitions

```ts
interface BaseChatModelInput {
  model: string;                        // required: model name
  messages: Array<ChatModelMessage>;    // required: message array
  temperature?: number;                 // optional: sampling temperature
  topP?: number;                        // optional: nucleus sampling
}

type ChatModelMessage =
  | { role: "user"; content: string }
  | { role: "system"; content: string }
  | { role: "assistant"; content: string };

interface GenerateTextResult {
  text: string;                         // generated text
  messages: Array<ChatModelMessage>;    // full message history
  usage: Usage;                         // token usage
  rawResponses: Array<unknown>;         // raw model responses
  error?: unknown;                      // error if any
}

interface StreamTextResult {
  textStream: AsyncIterable<string>;    // incremental text stream
  dataStream: AsyncIterable<DataChunk>; // full data stream
  messages: Promise<ChatModelMessage[]>;// final message history
  usage: Promise<Usage>;                // final token usage
  error?: unknown;                      // error if any
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
```

---

## Best Practices

1. **Run the two-step preflight before writing business code** — ① eligibility: `envQuery` → `callCloudApi(tcb, DescribeEnvPostpayPackage)` to confirm the Token Credits resource pack (text + image share the same pack); ② group readiness: `DescribeAIModels` for the `cloudbase` group and its `Models[]`, `DescribeManagedAIModelList` for the authoritative supported-model catalog, `UpdateAIModel` with a full-replacement `Models[]` + `Status: 1` when the target model is missing. If the pack is missing, return the purchase link `https://buy.cloud.tencent.com/lowcode?buyType=resPack&envId={envId}&resourceType=token` instead of emitting SDK code and letting the user debug runtime errors.
2. **Never assume any model is already enabled** — not `deepseek-v4-flash`, not `hunyuan-image`, not anything. Always verify with `DescribeAIModels` first; if the target is missing, look up the exact `Model` string in `DescribeManagedAIModelList` (do **not** guess the spelling) and then `UpdateAIModel` to enable it.
3. **`createModel` accepts exactly three kinds of values** — `"cloudbase"` (the main managed group), `"hunyuan-exp"` (legacy builtin), or a user-defined GroupName registered via `CreateAIModel` (**MUST start with `custom-`**, e.g. `custom-kimi`, `custom-openai-compat`). **Never** guess with `createModel("deepseek")` / `createModel("kimi")` / `createModel("custom")` — the first two are vendor/model names, the last is a placeholder. `createImageModel("hunyuan-image")` is a separate image API — keep it as-is.
4. **Do not invent SDK method names or parameters.** This SKILL.md is the authoritative reference for `@cloudbase/node-sdk`'s AI surface — look up the method signature here (or in the Type Definitions section) before writing code. If a method or field is not documented here, stop and ask, or check the live contract via the MCP tools. No guessing.
5. **Show pricing before enabling a new managed model** — `DescribeManagedAIModelList` returns `ModelSpec` (context length, max input/output tokens) + `ModelChargingInfo` (input / output / cache prices, billing unit). Show the prices to the user before calling `UpdateAIModel`.
6. **Plan timeout and quota separately for image generation** — `generateImage` costs more per call than text and takes longer. For cloud functions, set `timeout` to `900s`. HTTP-function gateways cap at 60s, so use an async-task + polling pattern. Throttle per-user concurrency and frequency to avoid burning an entire Token pack on one failure.
7. **Prefer streaming for long-form interactions** — in HTTP-function or cloud-function SSE scenarios, use `streamText` + `for await (const chunk of result.textStream)` to flush chunks back to the client incrementally. Handle stream interruption in `catch` and close the underlying response.
8. **Pin `@cloudbase/node-sdk` >= 3.16.0** on the server — image generation is only available from this version. Verify with `npm ls @cloudbase/node-sdk` to confirm the version actually loaded by the cloud function / cloud run runtime — local and production can drift.
9. **Centralize model names in config, not scattered literals.** Keep the chosen text / image model in a single constant and source from `DescribeAIModels` / `DescribeManagedAIModelList`. The managed catalog evolves; a single source of truth makes upgrades cheap. For models outside the managed catalog, follow the Custom Onboarding section — never hard-code third-party API keys in business code (let `CreateAIModel.Secret.ApiKey` hold them via CloudBase).
10. **Distinguish "preflight failure" from "model call failure"** — the former means the resource pack is not active or the target model has not been enabled via `UpdateAIModel` (guide the user to purchase / enable). The latter is a parameter issue or upstream error. Do not wrap both in one generic toast.
11. **Do not log full prompts or generated text in production** — log only `usage.total_tokens` and a short prefix. Prompts can leak sensitive content; token counts can leak cost signals.
12. **TypeScript: do NOT use `any` to silence SDK type errors.** The Node SDK ships its own types; narrow with `unknown` + a type guard, write a precise `interface` for the shape you consume, or augment types in a local `.d.ts`. Never `: any`, `as any`, `@ts-ignore`, `@ts-nocheck`. See the Engineering constitution in the `web-development` skill — it applies to backend TS too.
13. **Self-verify before claiming done.** `tsc --noEmit` + project build + actually invoke the function (local invoke / `manageFunctions(action="invokeFunction")` / direct HTTP hit) and confirm `usage.total_tokens > 0` and the returned text is not an error envelope. "It should work" without a real round-trip is not acceptable evidence.
