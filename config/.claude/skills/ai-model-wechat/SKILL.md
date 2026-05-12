---
name: ai-model-wechat
description: Use this skill when developing WeChat Mini Programs (小程序, 企业微信小程序, wx.cloud-based apps) that need AI capabilities. Features text generation (generateText) and streaming (streamText) with callback support (onText, onEvent, onFinish) via wx.cloud.extend.AI. Managed AI models are called via wx.cloud.extend.AI.createModel("<GroupName>") — the only legal GroupName values are "hunyuan-exp" (小程序成长计划 exclusive builtin group; `hunyuan-2.0-instruct-20251111` is the plan-default, other hunyuan SKUs must still be verified via DescribeAIModels and enabled via UpdateAIModel if missing), "cloudbase" (main managed group used when 成长计划 is not enrolled; **no model is enabled by default** — the agent MUST first call DescribeAIModels to see what is enabled and, if the target model is missing, call DescribeManagedAIModelList for the authoritative supported-model catalog and then UpdateAIModel with Status:1 to enable it), or a user-defined GroupName created via CreateAIModel (must start with `custom-`). The concrete model id (`deepseek-v4-flash`, `deepseek-v3.2`, `hunyuan-2.0-instruct-20251111`, `glm-5`, `kimi-k2.6`, …) goes into the `model` field of the generateText / streamText `data` wrapper, never into `createModel(...)`. Before generating any code you MUST run the two-step preflight — eligibility (first DescribeActivityInfo for 小程序成长计划 ai_miniprogram_inspire_plan; enrolled users go hunyuan-exp billed via pkg_hunyuan_token_la_inspire_100m; else DescribeEnvPostpayPackage for Token Credits → "cloudbase") and group readiness (DescribeAIModels for env config, DescribeManagedAIModelList for the authoritative supported-model catalog + pricing, UpdateAIModel with Status:1 to enable the target model). **Never assume a model is already enabled**, and never invent SDK method names — this skill is the authoritative reference for `wx.cloud.extend.AI`; look them up here, do not guess. Non-managed / self-hosted OpenAI-compatible models go through CreateAIModel custom-group integration. API differs from JS/Node SDK — streamText requires data wrapper, generateText returns raw response; image generation is NOT available here. Keywords: Mini Program AI, wx.cloud.extend.AI, generateText, streamText, createModel, cloudbase group, hunyuan-exp, eligibility check, group readiness, 小程序成长计划, ai_miniprogram_inspire_plan, hunyuan-2.0-instruct-20251111, Token Credits 资源包, deepseek-v4-flash, UpdateAIModel, DescribeAIModels, DescribeManagedAIModelList, CreateAIModel, custom model onboarding, callCloudApi, DescribeActivityInfo, DescribeEnvPostpayPackage, TokenHub, Hunyuan, DeepSeek, GLM, Zhipu GLM, Kimi, MiniMax, third-party managed model. NOT for browser/Web apps (use ai-model-web), Node.js backend (use ai-model-nodejs), or image generation (use ai-model-nodejs).
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
- Call Hunyuan models from the WeChat environment

**Do NOT use for:**

- Browser/Web apps → use `ai-model-web` skill
- Node.js backend or cloud functions → use `ai-model-nodejs` skill
- Image generation → use `ai-model-nodejs` skill (not available in Mini Program)
- HTTP API integration → use `http-api` skill

---

## ⛔ STOP — `wx.cloud.extend.AI.createModel(provider)` argument is **not** a vendor / model name

Read this before writing any `createModel(...)` line. Agents frequently hallucinate this argument. There are **exactly three** legal shapes. Anything else is a bug.

| ✅ Legal `createModel(provider)` argument | When to use it |
|-----------------------------------------|----------------|
| `"hunyuan-exp"` | The Mini Program **成长计划** (`ai_miniprogram_inspire_plan`) is enrolled for the current env. Default model: `hunyuan-2.0-instruct-20251111`. |
| `"cloudbase"` | Default fallback. Main managed group (TokenHub-backed, multi-vendor pool). Vendor + concrete model go into the **`model` field**, e.g. `{ model: "deepseek-v4-flash" }`. |
| `"custom-<your-name>"` | A user-defined GroupName you onboarded via `CreateAIModel`. **Must** start with `custom-` (e.g. `custom-kimi`, `custom-openai-compat`). |

### ❌ Do NOT write any of these — they are all wrong

```js
wx.cloud.extend.AI.createModel("deepseek")                   // wrong — vendor, not GroupName
wx.cloud.extend.AI.createModel("deepseek-v4-flash")          // wrong — model id goes in `model`
wx.cloud.extend.AI.createModel("hunyuan")                    // wrong — vendor family
wx.cloud.extend.AI.createModel("hunyuan-2.0-instruct-20251111")  // wrong — model name
wx.cloud.extend.AI.createModel("glm") / "kimi" / "minimax"   // wrong — vendor names
wx.cloud.extend.AI.createModel("custom")                     // wrong — placeholder
wx.cloud.extend.AI.createModel(modelName)                    // wrong — do not reuse the model-id variable
```

### ✅ Correct pattern — provider vs model are two different fields

```js
// Growth Plan branch
const model = wx.cloud.extend.AI.createModel("hunyuan-exp"); // ← provider / GroupName
await model.streamText({
  data: { model: "hunyuan-2.0-instruct-20251111", messages: [...] }  // ← concrete model id
});

// Token Credits branch
const model = wx.cloud.extend.AI.createModel("cloudbase");
await model.streamText({
  data: { model: "deepseek-v4-flash", messages: [...] }
});
```

### Decision procedure (when the user names a specific model)

1. The user says "use DeepSeek v3.2" / "use hunyuan thinking" / "use Kimi k2.6" / …
2. First run the eligibility decision tree below — the correct `provider` may be `"hunyuan-exp"` (if the env is on Growth Plan and the user asked for a `hunyuan-*` model) or `"cloudbase"` (anything else in the managed catalog).
3. Put the model id into the **`model` field** inside `data`: `{ model: "deepseek-v3.2" }`, `{ model: "hunyuan-2.0-instruct-20251111" }`, `{ model: "kimi-k2.6" }`, …
4. Before using the model id, make sure it is present in `DescribeAIModels({ GroupName: "cloudbase" }).Models[]`. If not, enable it via `UpdateAIModel`.

> If you are about to type `wx.cloud.extend.AI.createModel(` and the thing inside the parentheses is a vendor name or a model id — **stop**. It is almost certainly one of the three legal values above.

---

## Mandatory Two-Step Preflight

You MUST NOT jump straight into `wx.cloud.extend.AI.createModel(...)`. Before writing any business code, confirm **billing eligibility** and **group readiness** in this fixed order: **① eligibility → ② group readiness**. Do not swap the two.

### Preflight ① · Billing Eligibility (two parallel billing paths)

The Mini Program side has two billing paths: **小程序成长计划** (checked first; if enrolled, use `hunyuan-exp`) and **Token Credits 资源包** (generic fallback; if available, use the `cloudbase` main managed group).

1. Fetch `envId` via the MCP tool `envQuery action=info`.

2. Pick the branch by user intent:

| User intent | Eligibility to check first | `createModel` provider on hit | Model selection | Guidance on miss |
|-------------|----------------------------|-------------------------------|-----------------|------------------|
| No model specified / default call | Check **小程序成长计划** enrollment first; if not enrolled, fall back to Token Credits resource pack | Enrolled: `"hunyuan-exp"`; otherwise: `"cloudbase"` | Enrolled: `hunyuan-2.0-instruct-20251111` (the 成长计划 default). Otherwise: pick a text model with the user, then verify/enable it in the `"cloudbase"` group via `DescribeAIModels` → `DescribeManagedAIModelList` → `UpdateAIModel` | Plan not enrolled → point to `https://docs.cloudbase.net/ai/ai-inspire-plan`; resource pack missing → purchase link |
| User requests a `hunyuan-*` model | **小程序成长计划** enrollment | `"hunyuan-exp"` (plan-exclusive Token pack billing) | `hunyuan-2.0-instruct-20251111` if present; otherwise verify via `DescribeAIModels({ GroupName: "hunyuan-exp" }).Models[]` and `UpdateAIModel` to enable | Not enrolled → enroll first, or switch to `"cloudbase"` + a non-hunyuan model |
| User requests `deepseek-*` / `glm-*` / `kimi-*` / `minimax-*` / other non-hunyuan managed models | **Token Credits 资源包** activation | `"cloudbase"` | Do NOT assume the model is already enabled. `DescribeAIModels` → if missing, `DescribeManagedAIModelList` for the canonical `Model` string → `UpdateAIModel` with `Status: 1` (full-replacement `Models[]`) | Resource pack not activated → purchase link |
| User requests a third-party / self-hosted (non-managed) model | Skip billing eligibility and go to "Custom onboarding" | Custom GroupName (must start with `custom-`) | Registered via `CreateAIModel.Models[]` | Offer both console + `CreateAIModel` paths |

3. Check 小程序成长计划 enrollment:

```ts
callCloudApi({
  service: "tcb",
  action: "DescribeActivityInfo",
  params: {
    ActivityNames: ["ai_miniprogram_inspire_plan"], // PascalCase preferred; switch to camelCase if InvalidParameter is returned
  },
})
```

**Hit criterion:** the response's `attendRecords` contains at least one entry where `activityName === "ai_miniprogram_inspire_plan"` and `envId` matches the current environment. On hit, default to `createModel("hunyuan-exp")` + `hunyuan-2.0-instruct-20251111`; billing uses the plan-exclusive Token pack `pkg_hunyuan_token_la_inspire_100m`.

**On miss:** do NOT silently fall back. Tell the user "the current environment is not enrolled in 小程序成长计划", surface the enrollment entry `https://docs.cloudbase.net/ai/ai-inspire-plan`, and ask whether to enroll and retry, or to switch to the Token Credits resource pack path with a non-hunyuan model.

4. Check the Token Credits resource pack (when the path leads to the `"cloudbase"` main managed group):

```ts
callCloudApi({
  service: "tcb",
  action: "DescribeEnvPostpayPackage",
  params: {
    EnvId: "<current envId>",
  },
})
```

**Hit criterion:** `envPostpayPackageInfoList` contains an entry whose `postpayPackageId` starts with `pkg_tcb_tokencredits_`, has `status ∉ [3, 4]` (not expired, not disabled), and `versionSwitchStatus` is not in a blocking state.

**On miss:** surface the purchase link (replace `{envId}` with the real ID — never leave the placeholder):

```
https://buy.cloud.tencent.com/lowcode?buyType=resPack&envId={envId}&resourceType=token
```

### Preflight ② · Group Readiness (mandatory for every Mini Program AI call)

Passing eligibility does not mean the target model is callable. **No model is enabled by default** in the `"cloudbase"` main managed group — you must first call `DescribeAIModels` to see what is enabled, then (if missing) `DescribeManagedAIModelList` for the authoritative supported-model catalog and `UpdateAIModel` with `Status: 1` to enable it. The `"hunyuan-exp"` group's readiness is driven by 成长计划 enrollment — enrollment alone makes `hunyuan-2.0-instruct-20251111` available, but any other hunyuan SKU still has to be checked against `DescribeAIModels({ GroupName: "hunyuan-exp" }).Models[]` and enabled via `UpdateAIModel` if missing.

1. Query the groups and switches currently configured in the environment (`tcb` Action `DescribeAIModels`, Version `2018-06-08`):

```ts
callCloudApi({
  service: "tcb",
  action: "DescribeAIModels",
  params: { EnvId: "<envId>" },
})
```

Returns `AIModelGroups: AIModelGroup[]`. Each `AIModelGroup` has `GroupName` (e.g. `cloudbase` / `hunyuan-exp` / your custom group), `Type` (`builtin` / `custom`), `Models: [{ Model, EnableMCP, Tags }]`, and `Status` (1=on / 2=off). Group readiness = all three of: the `GroupName` exists + `Status === 1` + the target `Model` is present in `Models[]`.

2. If the target model is not in the `DescribeAIModels` response, query the platform catalog + pricing via `DescribeManagedAIModelList` — it returns `ManagedAIModelGroup[]` including `ModelSpec` (context length, etc.) and `ModelChargingInfo` (`Uniform` / `Tiered` pricing). Pick the target model, then enable it via `UpdateAIModel`:

```ts
callCloudApi({
  service: "tcb",
  action: "UpdateAIModel",
  params: {
    EnvId: "<envId>",
    GroupName: "cloudbase",
    Status: 1, // 1=on, 2=off
    Models: [
      { Model: "deepseek-v4-flash", EnableMCP: false },
      { Model: "deepseek-v3.2", EnableMCP: false },   // append the new model to enable
    ],
    // ⚠️ `Models` is a FULL REPLACEMENT, not incremental; merge the old list + new entries before passing.
  },
})
```

3. Once both steps pass, only THEN write `wx.cloud.extend.AI.createModel("<GroupName>")` in the Mini Program code, and pass a `model` value that exists in that group's `Models[]`.

> **Order is fixed.** Without eligibility, no enabled model will bill; without group readiness, even with eligibility you will receive `ModelNotEnabled`-class errors. Both must be done before business code.
>
> **API casing tip:** `tcb` public-service Actions officially use PascalCase (`EnvId`, `GroupName`, `ActivityNames`); some docs show camelCase. On the first call, if you hit `InvalidParameter`, switch casing and retry, then freeze the working form in your project's wrapper.

---

## Available Providers and Models

The `provider` argument of `wx.cloud.extend.AI.createModel(provider)` equals the `GroupName` returned by `DescribeAIModels`. Only three kinds of values are legal. Run the decision tree before choosing.

### A. 小程序成长计划 exclusive (default when enrolled)

| createModel provider | Default model | Other available models | Notes |
|----------------------|---------------|------------------------|-------|
| `"hunyuan-exp"` | `hunyuan-2.0-instruct-20251111` | Additional hunyuan SKUs (e.g. instruct / thinking / turbos / role variants) — **query at runtime** via `DescribeAIModels({ GroupName: "hunyuan-exp" }).Models[]`, do NOT hard-code | Legacy `Type=builtin` GroupName; billed via `pkg_hunyuan_token_la_inspire_100m`; do NOT use without 成长计划 enrollment |

### B. Main managed group (Token Credits pack scenario, recommended default)

The `"cloudbase"` GroupName is backed by **Tencent Cloud TokenHub**, a unified managed pool that covers multiple first-party and third-party vendors — including the **Hunyuan** family (HY 2.0 Instruct, HY 2.0 Think, Hunyuan-role, Hy3 preview, …), **DeepSeek** family (DeepSeek-V4-Pro, DeepSeek-V4-Flash, Deepseek-v3.2, Deepseek-v3.1, Deepseek-r1-0528, Deepseek-v3-0324, …), **Zhipu GLM** (GLM-5, GLM-5-Turbo, GLM-5.1, GLM-5V-Turbo), **Kimi** (K2.5, K2.6), **MiniMax** (M2.5, M2.7) and more. The roster evolves over time, so **do not hard-code the list in application code** — always discover it at runtime.

| createModel provider | Model readiness | How to enable a model | Notes |
|----------------------|-----------------|-----------------------|-------|
| `"cloudbase"` | **No model is enabled by default** — always check `DescribeAIModels({ GroupName: "cloudbase" }).Models[]` first | 1) Fetch the authoritative catalog + pricing via `DescribeManagedAIModelList` (do NOT guess the `Model` string). 2) Call `UpdateAIModel` with `Status: 1` and a full-replacement `Models[]` that includes the target model | Unified managed group (`Type=builtin`), Remark `"腾讯云开发"`, depends on a `pkg_tcb_tokencredits_*` resource pack |

> ⚠️ Common Mini Program mistake: writing `createModel("deepseek")` / `createModel("hunyuan")` / `createModel("glm")` / `createModel("kimi")` / `createModel("minimax")` / `createModel("custom")`. All wrong — those are **vendor / model names**, not provider / GroupName. The provider must be one of the `GroupName` values returned by `DescribeAIModels`. New projects always use the unified `"cloudbase"` managed group and select the concrete vendor model via the `model` field.

### C. Not in the managed catalog → Custom onboarding

Models involving third-party / self-hosted / OpenAI-compatible endpoints (anything not appearing in A/B) do NOT go through the billing paths above. You must register a `Type=custom` GroupName via "Custom onboarding" first. See the next section.

---

## Custom Onboarding (when not in the managed catalog)

When the user specifies a model that is neither in 成长计划 (`hunyuan-exp`) nor in the main managed group (`cloudbase`) catalog (e.g. enterprise-hosted OpenAI-compatible endpoints, third-party model services), pick one of the two paths below. Use neutral phrasing such as "third-party / self-hosted / OpenAI-compatible endpoint" — **do not name specific competitor brands**.

**Path 1 · Register in the console**

Point the user to the CloudBase console AI model page:

```
https://tcb.cloud.tencent.com/dev?envId={envId}#/ai
```

Replace `{envId}` with the real environment ID and let the user fill in model name, endpoint, API key, etc.

**Path 2 · Register via `callCloudApi` + `CreateAIModel`**

The `tcb` Action `CreateAIModel` (Version `2018-06-08`) creates a `Type=custom` AI model group in the current environment:

```ts
callCloudApi({
  service: "tcb",
  action: "CreateAIModel",
  params: {
    EnvId: "<current envId>",
    GroupName: "custom-openai-compat",  // ⚠️ MUST start with "custom-" (e.g. custom-kimi, custom-moonshot) to avoid colliding with built-in / vendor GroupNames; this becomes the value passed to createModel(provider)
    BaseUrl: "https://api.example.com/v1",
    Models: [
      { Model: "gpt-4o-mini", EnableMCP: false },
      { Model: "gpt-4o",       EnableMCP: false },
    ],
    Remark: "Internal OpenAI-compatible endpoint",
    Status: 1,                         // 1=on, 2=off
    Secret: {
      // Key / ApiKey: pick one; OpenAI-compatible endpoints usually use ApiKey
      ApiKey: "<vendor-api-key>",
    },
  },
})
```

After registration:
- Run `DescribeAIModels` to confirm the `GroupName` exists with `Status=1` and the target `Model` appears in `Models[]`.
- In the Mini Program, call `wx.cloud.extend.AI.createModel("custom-openai-compat")` and pass a registered model name (e.g. `"gpt-4o-mini"`) as the `model` field.
- To add or modify models later, use `UpdateAIModel` (remember `Models` is a **full replacement**; `Status` uses 1/2 as on/off). To delete an entire custom group, use `DeleteAIModel` (custom groups only; batch via `GroupNames.N`).
- All calls still hit the environment's billing path. If such custom models also need Token settlement, eligibility must be verified first.

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

⚠️ **Different from JS/Node SDK:** the return value is the raw model response.

> **Prerequisite:** the "Mandatory Two-Step Preflight" has been completed **and** the target model has been confirmed enabled via `DescribeAIModels` (or enabled via `UpdateAIModel` if missing). The example below assumes the current environment is enrolled in 小程序成长计划 and uses `createModel("hunyuan-exp")` + `hunyuan-2.0-instruct-20251111`. If the eligibility branch landed on the resource pack, swap the provider to `"cloudbase"` and set the `model` to whatever the user chose and you have just enabled via `UpdateAIModel` — never assume `deepseek-v4-flash` is already on.

```js
const model = wx.cloud.extend.AI.createModel("hunyuan-exp");

const res = await model.generateText({
  model: "hunyuan-2.0-instruct-20251111",  // plan-enrolled default
  messages: [{ role: "user", content: "hi" }],
});

// ⚠️ Return value is the RAW model response, NOT wrapped like JS/Node SDK
console.log(res.choices[0].message.content);  // access via choices array
console.log(res.usage);                        // token usage
```

---

## streamText() - Streaming

⚠️ **Different from JS/Node SDK:** parameters MUST be wrapped in a `data` object; callbacks are supported.

> **Prerequisite:** the "Mandatory Two-Step Preflight" has been completed and the target model has been enabled. The example below uses the 成长计划 branch; for the resource pack branch, swap `createModel("hunyuan-exp")` to `createModel("cloudbase")` and the `model` to whatever the user chose and you have just enabled via `UpdateAIModel` (no model is enabled by default).

```js
const model = wx.cloud.extend.AI.createModel("hunyuan-exp");

// ⚠️ Parameters MUST be wrapped in a `data` object
const res = await model.streamText({
  data: {                              // ⚠️ Required wrapper
    model: "hunyuan-2.0-instruct-20251111",  // plan-enrolled default
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

// Async iteration is also available
for await (let str of res.textStream) {
  console.log(str);
}

// Check for completion via eventStream
for await (let event of res.eventStream) {
  console.log(event);
  if (event.data === "[DONE]") {       // ⚠️ Check for [DONE] to stop
    break;
  }
}
```

---

## Error Handling Pattern

> **Prerequisite:** the "Mandatory Two-Step Preflight" has been completed. For the resource pack branch, use `"cloudbase"` + the specific text model you just verified/enabled via `DescribeAIModels` / `UpdateAIModel` — no model is enabled by default.

```js
const model = wx.cloud.extend.AI.createModel("cloudbase");

try {
  const res = await model.generateText({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Write a welcome message" }],
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
  onText?: (text: string) => void;     // incremental text callback
  onEvent?: (prop: { data: string }) => void;  // raw event callback
  onFinish?: (text: string) => void;   // completion callback
}
```

### streamText() Return

```ts
interface WxStreamTextResult {
  textStream: AsyncIterable<string>;   // incremental text stream
  eventStream: AsyncIterable<{         // raw event stream
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

1. **Run the two-step preflight before writing business code.** Fixed order: ① `DescribeActivityInfo` / `DescribeEnvPostpayPackage` for billing eligibility → ② `DescribeAIModels` for group readiness (if needed, `DescribeManagedAIModelList` for catalog + pricing, then `UpdateAIModel` to enable the target model). Only after both pass should you write `wx.cloud.extend.AI.createModel(...)`.
2. **`createModel(provider)` accepts only three kinds of values** — `"hunyuan-exp"` (成长计划 exclusive legacy group), `"cloudbase"` (main managed group, default for new projects), or the custom-onboarding `GroupName` (**MUST start with `custom-`**, e.g. `custom-kimi`, `custom-openai-compat`, to avoid colliding with built-in / vendor names). **Never** write `createModel("deepseek")` (unless `DescribeAIModels` truly returns a legacy builtin group named `deepseek`), `createModel("hunyuan")`, `createModel("kimi")`, or `createModel("custom")` — these are model/vendor names or placeholders, not GroupNames.
3. **The `model` field must come from `DescribeAIModels`.** Pass a value that actually exists in the `Models[].Model` list of the chosen group. The main managed group only has `deepseek-v4-flash` enabled by default; to use others, call `UpdateAIModel` first.
4. **Hunyuan models are strictly bound to 成长计划.** To use a `hunyuan-*` model, the 成长计划 must be enrolled. When not enrolled, guide the user to `https://docs.cloudbase.net/ai/ai-inspire-plan`, or switch to `"cloudbase"` + `deepseek-v4-flash`. Do not bypass the check and call anyway.
5. **Check pricing before enabling more models.** `DescribeManagedAIModelList` returns `ModelChargingInfo` (`Uniform` flat price / `Tiered` tiered pricing) + `ModelSpec.ContextLength`. Confirm before calling `UpdateAIModel`. `Models` is a **full replacement** — merge the old list + the new entry before passing.
6. **Check base library version.** 3.7.1+ is required; on older versions `wx.cloud.extend.AI` is `undefined` — do not debug it as a model issue.
7. **Use callbacks for UI updates.** `onText` is well-suited for progressively refreshing chat bubbles; manually concatenating from `eventStream` tends to drop separators.
8. **Check for `[DONE]`.** When iterating `eventStream`, stop only when `event.data === "[DONE]"`, otherwise the stream waits forever for the next frame.
9. **Remember the `data` wrapper.** `streamText` parameters MUST be wrapped in `data: { ... }` — unlike JS/Node SDK. Forgetting it yields a parameter error.
10. **Distinguish "not-eligible / group-not-ready" from "call failure".** The former should guide the user into enrollment / purchase / `UpdateAIModel` flows; the latter is about debugging prompts, parameters, or the network. The error messages and next actions are completely different.
11. **Do not hardcode third-party model API keys in the Mini Program.** For models outside the managed catalog, use `CreateAIModel` (`Secret.ApiKey`) so the key is stored on the CloudBase side; keep only the `GroupName` in the Mini Program.
12. **TypeScript: do NOT use `any` to silence type errors.** If the `wx.cloud.extend.AI` surface is missing types, declare a precise `interface` for the slice you actually use, or augment via a local `.d.ts`. Never `: any`, `as any`, `@ts-ignore`, `@ts-nocheck`.
13. **Self-verify before claiming done.** Build the Mini Program, open it in the WeChat DevTools simulator, exercise the real `streamText` / `generateText` flow end-to-end, and confirm: (a) the text chunks arrive via `onText`, (b) `[DONE]` terminates the stream, (c) no new console errors. "It should work" without an actual run is not acceptable evidence.
