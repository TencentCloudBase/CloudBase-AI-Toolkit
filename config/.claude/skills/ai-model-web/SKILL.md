---
name: ai-model-web
description: Use this skill whenever a browser/Web application (React/Vue/Angular, Next/Nuxt, static sites, SPAs, admin dashboards, AI chat UI on the page) needs to call an AI model. **This is the default routing target for any AI request framed around a page / 页面 / Web / 前端 / frontend / 网页 / H5 — do NOT first propose a Node.js / cloud-function / CloudRun proxy; call the model directly from the browser via `@cloudbase/js-sdk`.** Covers text generation (`generateText`) and streaming (`streamText`). Managed models are invoked via `ai.createModel("<GroupName>")` — the only legal GroupName values are `"cloudbase"` (the main managed, TokenHub-backed pool; **no model is enabled by default** — the agent MUST first call `DescribeAIModels` to see what is already enabled and, if the target model is missing, call `DescribeManagedAIModelList` to read the platform-supported catalog, then `UpdateAIModel` with `Status: 1` to enable it), `"hunyuan-exp"` (legacy builtin group, only if `DescribeAIModels` returns it — mainly Mini Program Growth Plan), or a user-defined GroupName created through `CreateAIModel` (must start with `custom-`). The concrete model id (`deepseek-v4-flash`, `deepseek-v3.2`, `hunyuan-2.0-instruct-20251111`, `glm-5`, `kimi-k2.6`, …) goes into the **`model` field** of `generateText` / `streamText`, never into `createModel(...)`. Before emitting any SDK code the agent MUST run the two-step preflight: (1) eligibility — call `DescribeEnvPostpayPackage` to confirm a Token Credits resource pack is active; (2) group readiness — `DescribeAIModels` → `DescribeManagedAIModelList` → `UpdateAIModel` to enable the target model. **Never assume a model is already enabled** and never invent SDK method names — this skill is the authoritative reference for `@cloudbase/js-sdk` AI methods; look them up here, do not guess. Non-managed or self-hosted OpenAI-compatible models must be onboarded through `CreateAIModel` as a custom group. Keywords: 页面, Web, 前端, frontend, React, Vue, Next, Nuxt, SPA, admin dashboard, AI chat UI, call large language model, AI model, generateText, streamText, createModel, cloudbase group, hunyuan-exp, eligibility check, group readiness, Token Credits resource pack, deepseek-v4-flash, UpdateAIModel, DescribeAIModels, DescribeManagedAIModelList, CreateAIModel, custom model onboarding, callCloudApi, DescribeEnvPostpayPackage, TokenHub, Hunyuan, DeepSeek, GLM, Zhipu GLM, Kimi, MiniMax, third-party managed model. Do NOT use for Node.js backend work (use `ai-model-nodejs`), WeChat Mini Program (use `ai-model-wechat`), or image generation (Node SDK only).
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/ai-model-web/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

## When to use this skill

Use this skill for **calling AI models in browser/Web applications** via `@cloudbase/js-sdk`.

> 🧭 **Runtime-plane default for Web.** Any time the user's request is framed around a page, a Web app, the frontend, React/Vue/Next/Nuxt, a dashboard UI, or "add AI to my H5", this skill is the default routing target. **Do NOT first propose a Node.js / cloud-function / CloudRun proxy**; `@cloudbase/js-sdk` can call the model from the browser directly. Only switch to `ai-model-nodejs` if the user explicitly asks for a backend/server call, image generation, or a scenario that truly needs server-side keys or long-running work. This decision is independent of which concrete model the user picks — model names (`deepseek-*`, `glm-*`, `hunyuan-*`, `kimi-*`, …) only affect the `model` field, not the routing plane.

**Use it when you need to:**

- Integrate AI text generation into a frontend Web app
- Stream AI responses for a better UX
- Call Hunyuan / DeepSeek / GLM / Kimi / MiniMax models from the browser

**Do NOT use for:**

- Node.js backend or cloud functions → use the `ai-model-nodejs` skill
- WeChat Mini Program → use the `ai-model-wechat` skill
- Image generation → use the `ai-model-nodejs` skill (Node SDK only)
- HTTP API integration → use the `http-api` skill

---

## ⛔ STOP — `ai.createModel(...)` argument is **not** a vendor / model name

Read this before writing any `createModel(...)` line. The single most common mistake when agents generate code for this SDK is hallucinating the argument. There are **exactly three** legal shapes. Anything else is a bug.

| ✅ Legal `ai.createModel(...)` argument | When to use it |
|----------------------------------------|----------------|
| `"cloudbase"` | **The main managed group for new projects** (TokenHub-backed, multi-vendor pool). Vendor + concrete model go into the **`model` field** of `generateText` / `streamText`, e.g. `{ model: "deepseek-v4-flash" }`. **No model is enabled by default — always check `DescribeAIModels` first and, if the target model is missing, enable it with `UpdateAIModel` before calling the SDK.** |
| `"hunyuan-exp"` | Only if `DescribeAIModels` explicitly returns this legacy builtin group for the current env (mainly the Mini Program Growth Plan — see `ai-model-wechat`). |
| `"custom-<your-name>"` | A user-defined GroupName you onboarded via `CreateAIModel`. **Must** start with `custom-` (e.g. `custom-kimi`, `custom-openai-compat`). |

### ❌ Do NOT write any of these — they are all wrong

```js
ai.createModel("deepseek")                 // wrong — that's a vendor, not a GroupName
ai.createModel("deepseek-v4-flash")        // wrong — that's a model name, goes in the `model` field
ai.createModel("hunyuan")                  // wrong — vendor family, not a GroupName
ai.createModel("hunyuan-2.0-instruct-20251111")  // wrong — model name
ai.createModel("glm") / ai.createModel("kimi") / ai.createModel("minimax")  // wrong — vendor names
ai.createModel("openai") / ai.createModel("moonshot")  // wrong — vendor names
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
4. **Never assume the model is already enabled.** Before writing the SDK call, verify it is present in `DescribeAIModels({ GroupName: "cloudbase" }).Models[]`. If missing, call `DescribeManagedAIModelList` to confirm the exact `Model` name the platform supports (case-sensitive — do **not** guess the spelling), then enable it via `UpdateAIModel` with `Status: 1` (remember `Models` is a full replacement, so resend everything already enabled + the new one).

> If you are about to type `ai.createModel(` and the thing inside the parentheses is a vendor name, a model name, or a guess — **stop**. It is almost certainly one of the three legal values above.

---

## Mandatory Two-Step Preflight (before any SDK code)

Before generating any AI-related SDK code, **run the two-step preflight**: ① eligibility, ② group readiness. Emitting `createModel(...)` straight away and letting the user debug runtime errors is significantly more costly.

### Step 0: obtain the environment ID

Call the MCP tool `envQuery` with `action=info` and read `EnvId` from the response. Every subsequent check and purchase link uses this `EnvId`.

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

> Parameter casing is PascalCase by contract. If the call returns `InvalidParameter`, fall back to camelCase (`envId` / `envPostpayPackageInfoList`) and trust the live response. For the Mini Program scenario there is an additional growth-plan branch — switch to the `ai-model-wechat` skill.

---

### Preflight ② — Group readiness (`DescribeAIModels` → `UpdateAIModel` if needed)

Eligibility alone is not enough. **Do not write `createModel("cloudbase")` yet.** First confirm that the target `GroupName` exists in the env with `Status=1`, and that the target `Model` is present in its `Models[]`.

1. **List groups configured in the current env:**

   ```
   callCloudApi(service="tcb", action="DescribeAIModels", params={ EnvId })
   ```

   Returns `AIModelGroups: AIModelGroup[]`, where each `AIModelGroup` includes `GroupName`, `Type` (`builtin` / `custom`), `Models: [{ Model, EnableMCP, Tags }]`, `Status` (1 = on / 2 = off), `BaseUrl`, `Secret`, `Remark`. The main managed `GroupName` is `cloudbase`.

2. **Never assume a model is already enabled.** Inspect `AIModelGroups[?].Models[].Model` for the `cloudbase` group. If the target model (or, when the user did not specify one, the model you intend to default to such as `deepseek-v4-flash`) is missing, jump to step 4 and enable it — do not call `createModel("cloudbase")` yet. If the `cloudbase` group itself is missing or has `Status=2`, also jump to step 4.

3. **User asked for a model that belongs to the managed catalog** (e.g. `deepseek-v3.2`, `hunyuan-2.0-instruct-20251111`, `glm-5`, `kimi-k2.6`, …): check whether that `Model` is already in the `cloudbase` group's `Models[]`. If not, jump to step 4. **Do not guess the exact model id** — verify the canonical spelling in `DescribeManagedAIModelList` first (step 4 covers this).

4. **Enable / add a managed model** (always inspect the authoritative catalog + pricing first):

   ```
   callCloudApi(service="tcb", action="DescribeManagedAIModelList", params={ EnvId })
   ```

   Returns `ManagedAIModelGroup[]`, where each group lists `GroupName` (e.g. `cloudbase`), `Remark`, and `Models: [{ Model, EnableMCP, ModelSpec{ContextLength, MaxInputToken, MaxOutputToken}, ModelChargingInfo[{Type, InputPrice, OutputPrice, InputOutputUnit, CachePrice}] }]`. **This is the single source of truth for supported model names and pricing — do not infer them from memory. Use the exact `Model` string returned here when calling `UpdateAIModel`.** Also surface the prices to the user before enabling.

   Then enable (note: `Models` is a **full replacement** — always resend the already-enabled models together with the new one):

   ```
   callCloudApi(service="tcb", action="UpdateAIModel", params={
     EnvId,
     GroupName: "cloudbase",
     Models: [
       // resend every model that DescribeAIModels already showed as enabled
       { Model: "<already-enabled model, e.g. deepseek-v4-flash>" },
       // append the newly-requested one, using the exact spelling from DescribeManagedAIModelList
       { Model: "<target model>" }
     ],
     Status: 1
   })
   ```

5. **The requested model is not in the managed catalog** (not found by `DescribeManagedAIModelList`) → jump to the next section, **Custom onboarding (models outside the managed catalog)**.

> All Actions use `service=tcb`, `Version=2018-06-08`. Parameters are PascalCase (`EnvId` / `GroupName` / `Models` / `Status`). Fall back to camelCase only if the call returns `InvalidParameter`.

---

## Available Providers and Models

`ai.createModel(<GroupName>)` accepts exactly three kinds of legal values:

### 1. `"cloudbase"` — the main managed group (recommended)

- `GroupName: "cloudbase"`, `Type: "builtin"`, `Remark: "腾讯云开发"` (Tencent CloudBase)
- Backed by **Tencent Cloud TokenHub**, a unified managed pool covering multiple vendors — **Hunyuan** (HY 2.0 Instruct, HY 2.0 Think, Hunyuan-role, Hy3 preview, …), **DeepSeek** (DeepSeek-V4-Pro, DeepSeek-V4-Flash, Deepseek-v3.2, Deepseek-v3.1, Deepseek-r1-0528, Deepseek-v3-0324, …), **Zhipu GLM** (GLM-5, GLM-5-Turbo, GLM-5.1, GLM-5V-Turbo), **Kimi** (K2.5, K2.6), **MiniMax** (M2.5, M2.7), and more. The roster evolves — **do not hard-code specific SKUs** in application code; discover at runtime.
- **No model is enabled by default.** Always call `DescribeAIModels` first to see what the env has actually enabled; if your target model is missing, call `DescribeManagedAIModelList` for the authoritative catalog + pricing and then `UpdateAIModel` (`Status: 1`, `Models` full-replacement) to enable it before making the SDK call.
- Authoritative catalog + pricing: `DescribeManagedAIModelList`
- Env-enabled set: `DescribeAIModels`

### 2. `"hunyuan-exp"` — legacy builtin group (kept for compatibility)

- Primarily relevant to the Mini Program Growth Plan scenario; do not use from Web unless the env explicitly still has it (switch to the `ai-model-wechat` skill for that flow)
- Default model: `hunyuan-2.0-instruct-20251111`; additional hunyuan SKUs must be discovered at runtime via `DescribeAIModels({ GroupName: "hunyuan-exp" }).Models[]` — do not hard-code other IDs

### 3. User-defined GroupName

- Onboarded via `CreateAIModel` (see the next section). The custom `GroupName` **MUST start with `custom-`** (e.g. `custom-kimi`, `custom-moonshot`, `custom-openai-compat`). This naming convention prevents future collisions with built-in / vendor GroupNames (`cloudbase`, `hunyuan-exp`, `deepseek`, `glm`, `kimi`, `minimax`, …) that the platform may introduce over time
- Examples: `createModel("custom-kimi")`, `createModel("custom-openai-compat")`

> **Never** write guesses like `createModel("deepseek")` or `createModel("custom")` unless `DescribeAIModels` explicitly returned that exact `GroupName` (old envs may still carry historical `deepseek` / `hunyuan-exp` builtin groups — that stays legal for compatibility, but new projects should always go through `cloudbase`).

---

## Custom onboarding (models outside the managed catalog)

When the user wants to call a **non-managed** model (self-hosted, enterprise-internal, third-party OpenAI-compatible endpoint, …), **do not block**. Guide them through onboarding:

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
npm install @cloudbase/js-sdk
```

## Initialization

> ⚠️ **Do not use anonymous sign-in as the default.** Anonymous login is **disabled by default** for new environments, and inactive existing environments have also been automatically disabled. Even when anonymous login is manually enabled, **anonymous users are denied AI model invocation permissions by default**. The AI-model skill does **not** prescribe a specific login UI — delegate that concern:
>
> - **Enabling / configuring login providers** (phone SMS, email, WeChat Open Platform, username+password, OAuth, …) → follow the **`auth-tool`** skill (backend config via `callCloudApi`).
> - **Building the actual sign-in flow in the browser** (login form, callbacks, session guarding) → follow the **`auth-web`** skill (`@cloudbase/js-sdk` auth API, e.g. `signInWithPassword`, `signInWithPhone`, `getSession`).
>
> Do **not** fall back to `signInAnonymously()` for AI features — anonymous users cannot call AI models. Only use anonymous login for non-AI read-only demos where the user explicitly requests it and accepts the trade-off.

```js
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "<YOUR_ENV_ID>",
  accessKey: "<YOUR_PUBLISHABLE_KEY>"  // Get it from the CloudBase console
});

const auth = app.auth();

// CRITICAL: Use auth.getSession() to check login — NOT the deprecated getLoginState().
// getLoginState() returns uid even without real login (just accessKey), causing false positives.
// getSession() returns data.session === undefined when no real login exists.
// Anonymous users are DENIED AI model permissions — calling AI without real login will fail.
const { data: sessionData } = await auth.getSession();
if (!sessionData?.session || sessionData.session.user?.is_anonymous) {
  // No real login or anonymous session — route to sign-in page
  window.location.href = "/login";
  return;
}

const ai = app.ai();
```

**Important notes:**

- Use synchronous initialization with a top-level import
- **`accessKey` causes `getLoginState()` to return misleading auth data** — the deprecated `getLoginState()` returns an object with `uid` even without real login, which breaks naive `!!loginState` checks. Use `auth.getSession()` instead: it returns `data.session === undefined` when no real login exists, so `!!data.session` is a reliable auth gate.
- The user MUST be authenticated with a verified login (phone, email, WeChat, username+password, custom) before using AI features. Anonymous users are denied AI model permissions. The exact flow is the responsibility of the `auth-web` skill.
- Get `accessKey` from the CloudBase console

---

## generateText() — non-streaming

> **Prerequisite:** the two-step preflight (eligibility + group readiness) has passed, and the target model has been confirmed present in `DescribeAIModels({ GroupName: "cloudbase" }).Models[]` — if it was not, it should already have been enabled via `UpdateAIModel`. The example below uses `deepseek-v4-flash` only for illustration; substitute the actual model the user asked for.

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

## Error Handling Pattern

```js
const model = ai.createModel("cloudbase");

try {
  const result = await model.generateText({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Generate a concise onboarding checklist." }],
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

1. **Run the two-step preflight first** — ① eligibility (Token Credits resource pack via `DescribeEnvPostpayPackage`) + ② group readiness (`DescribeAIModels` to inspect what is enabled, `DescribeManagedAIModelList` for the authoritative supported-model catalog, `UpdateAIModel` with a full-replacement `Models[]` and `Status: 1` when the target model is missing). Skipping preflight leads straight to "model not found" / "model not enabled" errors at runtime.
2. **Never assume any model is already enabled** — not `deepseek-v4-flash`, not `hunyuan-*`, not anything. Always verify with `DescribeAIModels` first; if the target is missing, look up the exact `Model` string in `DescribeManagedAIModelList` (do **not** guess the spelling or invent vendor prefixes) and then `UpdateAIModel` to enable it.
3. **`createModel` accepts exactly three kinds of values** — `"cloudbase"` (the main managed group), `"hunyuan-exp"` (legacy builtin, Growth Plan scenarios), or a user-defined GroupName registered via `CreateAIModel` (**MUST start with `custom-`**, e.g. `custom-kimi`, `custom-openai-compat`). **Never** guess with `createModel("deepseek")` / `createModel("kimi")` / `createModel("custom")`.
4. **Do not invent SDK method names or parameters.** This SKILL.md is the authoritative reference for `@cloudbase/js-sdk`'s AI surface — look up the method signature here (or in the Type Definitions section below) before writing code. If a method or field is not documented here, stop and ask, or check the live contract via the MCP tools. No guessing.
5. **Show pricing before enabling a new managed model** — `DescribeManagedAIModelList` returns `ModelSpec` (context length, max input/output tokens) + `ModelChargingInfo` (input / output / cache prices, billing unit). Surface the prices to the user before calling `UpdateAIModel`.
6. **Use streaming for long responses** — better perceived latency and interactivity.
7. **Handle errors gracefully** — wrap AI calls in try/catch.
8. **Keep `accessKey` safe** — use a publishable key, never a secret key.
9. **Initialize early** — set up the SDK at app entry so auth and AI are both ready before routing.
10. **Do NOT use anonymous auth for AI features** — anonymous login is disabled by default for new environments, and anonymous users are denied AI model permissions. Require a verified sign-in (phone, email, username+password, WeChat, custom) before calling any AI API. Delegate provider configuration to the `auth-tool` skill and the browser sign-in flow to the `auth-web` skill; the AI-model skill checks `auth.getSession()` and verifies `loginType` before gating the call.
11. **Distinguish "preflight failure" from "model call failure"** — the former means the user needs to buy a resource pack or call `UpdateAIModel`; the latter is a prompt / parameter / network issue. Give the user different guidance for each.
12. **TypeScript: do NOT use `any` to silence type errors from the SDK.** The SDK ships its own types; if an error shows up, narrow with `unknown` + a type guard, write a precise `interface` for the shape you actually consume, or augment types in a local `.d.ts`. Never `: any`, `as any`, `@ts-ignore`, or `@ts-nocheck`. See the Engineering constitution in the `web-development` skill.
13. **Self-verify before claiming done.** Run `tsc --noEmit` + the project build + open the page with `agent-browser` and actually trigger the AI call. Confirm: (a) the text stream reaches the UI, (b) no new console errors, (c) `result.usage` is non-zero. Saying "it should work" without evidence is not acceptable — follow `web-development/browser-testing.md`.
