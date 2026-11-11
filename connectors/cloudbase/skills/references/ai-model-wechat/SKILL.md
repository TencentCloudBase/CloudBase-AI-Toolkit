---
name: ai-model-wechat
description: "Use this skill for WeChat Mini Program AI via wx.cloud.extend.AI (小程序, wx.cloud apps). Covers generateText and streamText with callbacks (onText, onEvent, onFinish); streamText needs a data wrapper, generateText returns the raw response. Also covers multimodal image input (image_url content blocks, OCR and form extraction) — vision-capable models only. Models via wx.cloud.extend.AI.createModel with groups cloudbase (main managed, also 小程序成长计划 with `hy4-preview` / `hy3` / `deepseek-v4.1-flash`), the legacy hunyuan-v3 / hunyuan-exp, or custom-*; model id goes in the `model` field. MUST run two-step preflight before code — see body. NOT for browser/Web (use ai-model-web), Node.js backend (use ai-model-nodejs), or image generation (use ai-model-nodejs)."
version: 2.37.6
license: MIT
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

## When to use this skill

Use this skill for **calling AI models in WeChat Mini Program** using `wx.cloud.extend.AI`.

**Use it when you need to:**

- Integrate AI text generation in a Mini Program
- Stream AI responses with callback support
- Read text and fields from an image (OCR, receipts, forms) with a vision-capable model
- Call Hunyuan models from the WeChat environment

**Do NOT use for:**

- Browser/Web apps → use `ai-model-web` skill
- Node.js backend or cloud functions → use `ai-model-nodejs` skill
- Image generation → use `ai-model-nodejs` skill (not available in Mini Program)
- Runtimes without a CloudBase SDK (native apps, Python, etc.) → use `http-api-cloudbase` skill (it now includes the `ai_model` OpenAPI spec for direct HTTP calls)

---

## ⛔ STOP — `wx.cloud.extend.AI.createModel(provider)` argument is **not** a vendor / model name

Read this before writing any `createModel(...)` line. Agents frequently hallucinate this argument. There are **exactly four** legal shapes. Anything else is a bug.

| ✅ Legal `createModel(provider)` argument | When to use it |
|-----------------------------------------|----------------|
| `"cloudbase"` | **Default, including 小程序成长计划.** Main managed group (TokenHub-backed, multi-vendor pool). Growth Plan quota covers `hy4-preview` / `hy3` / `deepseek-v4.1-flash`; only `deepseek-v4.1-flash` accepts images. Vendor + concrete model go into the **`model` field**, e.g. `{ model: "deepseek-v4.1-flash" }`. |
| `"hunyuan-v3"` | **Legacy plan group, being retired.** Only `hy3` is available and no new models are added. Existing plan-enrolled code keeps working; new code uses `cloudbase` + a plan model. |
| `"hunyuan-exp"` | Older legacy builtin group — only if `DescribeAIModels` still returns it. Its default `hunyuan-2.0-instruct-20251111` went **offline on 2026-05-31**; never target that id. |
| `"custom-<your-name>"` | A user-defined GroupName you onboarded via `CreateAIModel`. **Must** start with `custom-` (e.g. `custom-kimi`, `custom-openai-compat`). |

### ❌ Do NOT write any of these — they are all wrong

```js
wx.cloud.extend.AI.createModel("deepseek")                   // wrong — vendor, not GroupName
wx.cloud.extend.AI.createModel("deepseek-v4.1-flash")        // wrong — model id goes in `model`
wx.cloud.extend.AI.createModel("hunyuan")                    // wrong — vendor family
wx.cloud.extend.AI.createModel("hunyuan-2.0-instruct-20251111")  // wrong — model name
wx.cloud.extend.AI.createModel("glm") / "kimi" / "minimax"   // wrong — vendor names
wx.cloud.extend.AI.createModel("custom")                     // wrong — placeholder
wx.cloud.extend.AI.createModel(modelName)                    // wrong — do not reuse the model-id variable
```

### ✅ Correct pattern — provider vs model are two different fields

```js
// Growth Plan branch (enable the model in the console first)
const model = wx.cloud.extend.AI.createModel("cloudbase"); // ← provider / GroupName
await model.streamText({
  data: { model: "deepseek-v4.1-flash", messages: [...] }  // ← concrete model id
});

// Token Credits branch — same provider, any managed model you enabled
await model.streamText({
  data: { model: "glm-5.3", messages: [...] }
});
```

### Decision procedure (when the user names a specific model)

1. The user says "use DeepSeek v3.2" / "use hunyuan thinking" / "use Kimi k2.6" / …
2. First run the eligibility decision tree below — the provider is `"cloudbase"` in almost every case, including Growth Plan environments (`cloudbase` + a plan model). `"hunyuan-v3"` only appears in existing code that already used it; `"hunyuan-exp"` only if `DescribeAIModels` still returns that older group.
3. Put the model id into the **`model` field**: `{ model: "deepseek-v4.1-flash" }`, `{ model: "hy3" }`, `{ model: "kimi-k2.6" }`, … (inside `data` when you call `streamText`).
4. Before using the model id, make sure it is present in `DescribeAIModels({ GroupName: "cloudbase" }).Models[]`. If not, enable it via `UpdateAIModel`.

> If you are about to type `wx.cloud.extend.AI.createModel(` and the thing inside the parentheses is a vendor name or a model id — **stop**. It is almost certainly one of the four legal values above.

---

## Mandatory Two-Step Preflight

You MUST NOT jump straight into `wx.cloud.extend.AI.createModel(...)`. Before writing any business code, confirm **billing eligibility** and **group readiness** in this fixed order: **① eligibility → ② group readiness**. Do not swap the two.

### Preflight ① · Billing Eligibility (two parallel billing paths)

The Mini Program side has two billing paths: **小程序成长计划** (checked first) and **Token Credits 资源包** (generic fallback). Both settle through the `cloudbase` main managed group — on the plan, the model is one of `hy4-preview` / `hy3` / `deepseek-v4.1-flash`, and the plan quota is drawn first; `hunyuan-v3` is the legacy plan group that only draws plan quota and is being retired.

1. Fetch `envId` via the MCP tool `queryEnv action=info`.

2. Pick the branch by user intent:

| User intent | Eligibility to check first | `createModel` provider on hit | Model selection | Guidance on miss |
|-------------|----------------------------|-------------------------------|-----------------|------------------|
| No model specified / default call | Check **小程序成长计划** enrollment first; if not enrolled, fall back to Token Credits resource pack | `"cloudbase"` in both cases | Enrolled: `deepseek-v4.1-flash` (covers text and images; `hy4-preview` / `hy3` are text-only alternatives — enable it in the `"cloudbase"` group first). Otherwise: pick a text model with the user, then verify/enable it in the `"cloudbase"` group via `DescribeAIModels` → `DescribeManagedAIModelList` → `UpdateAIModel` | Plan not enrolled → point to `https://docs.cloudbase.net/ai/ai-inspire-plan`; resource pack missing → purchase link |
| User requests a `hunyuan-*` model | **小程序成长计划** enrollment | `"cloudbase"` (+ a plan model for the plan quota) | Verify the exact `Model` in `DescribeAIModels({ GroupName: "cloudbase" }).Models[]` and enable it via `UpdateAIModel` if missing | Enrolled but the model is missing → enable it; not enrolled → point to the plan page, or use `"cloudbase"` + the resource pack |
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

**Hit criterion:** the response's `attendRecords` contains at least one entry where `activityName === "ai_miniprogram_inspire_plan"` and `envId` matches the current environment. On hit, use `createModel("cloudbase")` + one of `hy4-preview` / `hy3` / `deepseek-v4.1-flash` (enable it in the group first); the call draws the plan's free quota. Pick `deepseek-v4.1-flash` unless the user needs a text-only model. Legacy code on `createModel("hunyuan-v3")` + `hy3` still works but that group is being retired — migrate it to `cloudbase`.

⚠️ **The gifted Token is source-scoped.** It applies to **Mini Program client calls** and **administrator-identity calls** (console playground, calls made inside a cloud function) only. A call from any other origin does not draw on it and settles against the environment's resource-point pool instead — which is what a user sees as "the Token pack did not apply, resource points were charged". When a report sounds like that, check the call origin before touching the code or the model config. Same rule for the Token Credits pack path below.

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

**On miss:** surface the purchase link (replace `{region}` with the environment's `Region` from `queryEnv`, e.g. `ap-shanghai`, and `{envId}` with the real ID — never leave the placeholders):

```
https://buy.cloud.tencent.com/CloudBase?buyType=resPack&region={region}&envId={envId}
```

### Preflight ② · Group Readiness (mandatory for every Mini Program AI call)

Passing eligibility does not mean the target model is callable. **No model is enabled by default** in the `"cloudbase"` main managed group — you must first call `DescribeAIModels` to see what is enabled, then (if missing) `DescribeManagedAIModelList` for the authoritative supported-model catalog and `UpdateAIModel` with `Status: 1` to enable it. Growth Plan enrollment does not skip this check: the chosen plan model must still be present and enabled in the `cloudbase` group. Legacy `"hunyuan-v3"` exposes only `hy3` and is being retired — treat it as read-only compatibility, not the default.

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
      { Model: "deepseek-v4.1-flash", EnableMCP: false },
      { Model: "hy3", EnableMCP: false },             // append the new model to enable
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

The `provider` argument of `wx.cloud.extend.AI.createModel(provider)` equals the `GroupName` returned by `DescribeAIModels`. Only the four kinds of values below are legal. Run the decision tree before choosing.

### A. 小程序成长计划 (default when enrolled) — provider is `cloudbase`, model is one of the three plan models

| createModel provider | Default model | Other available models | Notes |
|----------------------|---------------|------------------------|-------|
| `"cloudbase"` | `deepseek-v4.1-flash` | `hy4-preview` (1M context, text only), `hy3` (256K context, text only) — all three draw the plan quota. **Only `deepseek-v4.1-flash` accepts image input.** Query `DescribeAIModels({ GroupName: "cloudbase" }).Models[]` at runtime instead of hard-coding the roster | Plan quota draws first when the call origin allows it; enable the chosen model via `UpdateAIModel` before the first call |
| `"hunyuan-v3"` | `hy3` | None — this group only exposes `hy3` | Legacy plan group, being retired. Existing code works; migrate to `cloudbase` + a plan model |
| `"hunyuan-exp"` | — | Whatever the env still returns | Older legacy builtin. Its original default `hunyuan-2.0-instruct-20251111` is offline (2026-05-31) — do not target it |

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

When the user specifies a model that is not in the main managed group (`cloudbase`) catalog (e.g. enterprise-hosted OpenAI-compatible endpoints, third-party model services), pick one of the two paths below. Use neutral phrasing such as "third-party / self-hosted / OpenAI-compatible endpoint" — **do not name specific competitor brands**.

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

- WeChat base library **3.15.1+**
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

> **Prerequisite:** the "Mandatory Two-Step Preflight" has been completed **and** the target model has been confirmed enabled via `DescribeAIModels` (or enabled via `UpdateAIModel` if missing). The example below assumes the current environment is enrolled in 小程序成长计划 and uses `createModel("cloudbase")` + `deepseek-v4.1-flash`. If the target is a different managed model, keep the provider and set the `model` to whatever the user chose and you have just enabled via `UpdateAIModel` — never assume a model is already on.

```js
const model = wx.cloud.extend.AI.createModel("cloudbase");

const res = await model.generateText({
  model: "deepseek-v4.1-flash",  // plan default, also accepts images
  messages: [{ role: "user", content: "hi" }],
});

// ⚠️ Return value is the RAW model response, NOT wrapped like JS/Node SDK
console.log(res.choices[0].message.content);  // access via choices array
console.log(res.usage);                        // token usage
```

---

## Multimodal Image Input (OCR / form extraction)

Images go through the same `generateText` call — only `content` changes, from a string to an array of blocks.

**Pick a vision-capable model first.** Not every model accepts images. In 小程序成长计划 only `deepseek-v4.1-flash` does; `hy4-preview` and `hy3` are text-only and will ignore or reject the image. Check the 「图片」column in `https://docs.cloudbase.net/ai/available-models` before choosing.

```js
const model = wx.cloud.extend.AI.createModel("cloudbase");

const PROMPT = "...";  // your field spec, see rule 2 below

const res = await model.generateText({
  model: "deepseek-v4.1-flash",          // must be a vision-capable model
  messages: [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: imageUrl } },  // image first
      { type: "text", text: PROMPT },                        // instruction second
    ],
  }],
});

const raw = res.choices[0].message.content;  // same contract as the text path — no `data` wrapper
```

⚠️ **Image first, text second.** With the order reversed, some models ignore the image and answer the text alone.

### Three rules that decide whether this ships

**1. Upload first, hand over a URL.**

```js
const { tempFiles } = await wx.chooseMedia({ count: 1, mediaType: ["image"] });

// Compress for cost and latency, not for the size limit — recognition quality barely
// changes, while token spend and upload time drop sharply.
const { tempFilePath } = await wx.compressImage({ src: tempFiles[0].tempFilePath, quality: 70 });

const { fileID } = await wx.cloud.uploadFile({
  cloudPath: `expenses/${Date.now()}.jpg`,
  filePath: tempFilePath,
});

// The model needs a public HTTPS URL; it cannot read a cloud:// fileID.
const { fileList } = await wx.cloud.getTempFileURL({ fileList: [fileID] });
const imageUrl = fileList[0].tempFileURL;
```

Keep the original image — finance review and the user's own re-check both need it. Uploading first sends the image upstream once (Base64 plus `uploadFile` would send it twice) and keeps the call log readable: a URL instead of megabytes of Base64. Store the `fileID` in the database, never the temporary URL — it expires.

**2. Put the enumerations and the output shape in the prompt.**

"Extract the department" is not enough — the model may answer 呼吸内科 when the system only accepts 内科. List the allowed values, state the business rule, and demand JSON only:

```
Output JSON only. No explanation, no Markdown fence.
- dept: one of 内科 / 外科 / 儿科 / 口腔科 / 眼科 / 皮肤科 / 其他
- amount: number only, no currency symbol or unit
- visitDate: YYYY-MM-DD
- use null when a field cannot be confirmed; never invent a value
- add a _confidence object keyed by field name, values high / medium / low
```

Parse defensively even so — models occasionally wrap the JSON in a Markdown fence:

```js
let parsed;
try {
  parsed = JSON.parse(raw.replace(/`{3}(?:json)?/g, "").trim());
} catch (err) {
  wx.setStorageSync("aiDraft", { fileID, raw });  // keep the draft so the user can retry
  throw err;
}
```

**3. Never write the result straight into the database.**

Handwriting, stamps and glare all break extraction. Render the parsed fields into an editable form **beside the image**, let the user correct them, and only then insert:

```js
await db.collection("expenses").add({
  data: { ...parsed, imageFileID: fileID, createdAt: db.serverDate() },
});
```

Use `_confidence` to mark only the low-confidence inputs with 「请核对」 — asking the user to re-read all eight fields defeats the purpose. For anything containing names, diagnoses or amounts, set the collection permission to 「仅创建者可读写」; CloudBase filters reads and writes by `_openid` automatically.

---

## streamText() - Streaming

⚠️ **Different from JS/Node SDK:** parameters MUST be wrapped in a `data` object; callbacks are supported.

> **Prerequisite:** the "Mandatory Two-Step Preflight" has been completed and the target model has been enabled. The example below uses the 成长计划 branch (`cloudbase` + `deepseek-v4.1-flash`); for another managed model, keep the provider and set the `model` to whatever the user chose and you have just enabled via `UpdateAIModel` (no model is enabled by default).

```js
const model = wx.cloud.extend.AI.createModel("cloudbase");

// ⚠️ Parameters MUST be wrapped in a `data` object
const res = await model.streamText({
  data: {                              // ⚠️ Required wrapper
    model: "deepseek-v4.1-flash",  // plan default
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
    model: "deepseek-v4.1-flash",
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
| **Image input (multimodal)** | Supported — `content` blocks | Supported — `content` blocks, vision-capable models only |
| **Image generation** | Node SDK only | Not available |

---

## Type Definitions

### Multimodal message content

Used by `generateText` when a message carries images. `system` / `assistant` messages stay plain strings.

```ts
type WxContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface WxMultimodalMessage {
  role: "user";
  content: string | WxContentBlock[];
}
```

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
2. **`createModel(provider)` accepts only four kinds of values** — `"cloudbase"` (main managed group, default for new projects and for 成长计划), `"hunyuan-v3"` (legacy plan group, only `hy3`, being retired), `"hunyuan-exp"` (older legacy builtin), or the custom-onboarding `GroupName` (**MUST start with `custom-`**, e.g. `custom-kimi`, `custom-openai-compat`, to avoid colliding with built-in / vendor names). **Never** write `createModel("deepseek")` (unless `DescribeAIModels` truly returns a legacy builtin group named `deepseek`), `createModel("hunyuan")`, `createModel("kimi")`, or `createModel("custom")` — these are model/vendor names or placeholders, not GroupNames.
3. **The `model` field must come from `DescribeAIModels`.** Pass a value that actually exists in the `Models[].Model` list of the chosen group. **No model is enabled by default** — if the model you want is missing, call `UpdateAIModel` first.
4. **The plan quota is bound to 成长计划, not to a group name.** Enrolled environments draw the free quota through `cloudbase` + one of `hy4-preview` / `hy3` / `deepseek-v4.1-flash`; `hunyuan-v3` (only `hy3`) still draws it too but is being retired. When not enrolled, guide the user to `https://docs.cloudbase.net/ai/ai-inspire-plan`, or use `"cloudbase"` + a managed model under the resource pack.
5. **Check pricing before enabling more models.** `DescribeManagedAIModelList` returns `ModelChargingInfo` (`Uniform` flat price / `Tiered` tiered pricing) + `ModelSpec.ContextLength`. Confirm before calling `UpdateAIModel`. `Models` is a **full replacement** — merge the old list + the new entry before passing.
6. **Check base library version.** 3.15.1+ is required; on older versions `wx.cloud.extend.AI` is `undefined` — do not debug it as a model issue.
7. **Use callbacks for UI updates.** `onText` is well-suited for progressively refreshing chat bubbles; manually concatenating from `eventStream` tends to drop separators.
8. **Check for `[DONE]`.** When iterating `eventStream`, stop only when `event.data === "[DONE]"`, otherwise the stream waits forever for the next frame.
9. **Remember the `data` wrapper.** `streamText` parameters MUST be wrapped in `data: { ... }` — unlike JS/Node SDK. Forgetting it yields a parameter error.
10. **Distinguish "not-eligible / group-not-ready" from "call failure".** The former should guide the user into enrollment / purchase / `UpdateAIModel` flows; the latter is about debugging prompts, parameters, or the network. The error messages and next actions are completely different.
11. **Do not hardcode third-party model API keys in the Mini Program.** For models outside the managed catalog, use `CreateAIModel` (`Secret.ApiKey`) so the key is stored on the CloudBase side; keep only the `GroupName` in the Mini Program.
12. **TypeScript: do NOT use `any` to silence type errors.** If the `wx.cloud.extend.AI` surface is missing types, declare a precise `interface` for the slice you actually use, or augment via a local `.d.ts`. Never `: any`, `as any`, `@ts-ignore`, `@ts-nocheck`.
13. **Self-verify before claiming done.** Build the Mini Program, open it in the WeChat DevTools simulator, exercise the real `streamText` / `generateText` flow end-to-end, and confirm: (a) the text chunks arrive via `onText`, (b) `[DONE]` terminates the stream, (c) no new console errors. "It should work" without an actual run is not acceptable evidence.
