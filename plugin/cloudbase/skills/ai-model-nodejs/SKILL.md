---
name: ai-model-nodejs
description: "Use this skill for Node.js backend AI via @cloudbase/node-sdk (>=3.16.0) — cloud functions, CloudRun, Express/Koa/NestJS, serverless APIs, scheduled jobs, LLM proxies, agent orchestration. The only SDK supporting image generation (ai.createImageModel + generateImage). Text via ai.createModel with groups cloudbase, hunyuan-exp, or custom-*; model ids (e.g. deepseek-v4-flash, glm-5, kimi-k2.6) go in the `model` field of generateText/streamText. MUST run two-step preflight before code — see body. NOT for browser/Web (use ai-model-web) or Mini Program (use ai-model-wechat)."
version: 2.33.0
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

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
- Runtimes without a CloudBase SDK (Python, Go, PHP, curl, etc.) → use the `http-api-cloudbase` skill (it now includes the `ai_model` OpenAPI spec for direct HTTP calls to the AI model endpoint; do NOT wrap this SDK behind an HTTP proxy)

---

## ⛔ STOP — `ai.createModel(...)` argument is **not** a vendor / model name

Read this before writing any `createModel(...)` line. Agents frequently hallucinate this argument. There are **exactly three** legal shapes. Anything else is a bug.

| ✅ Legal `ai.createModel(...)` argument | When to use it |
|----------------------------------------|----------------|
| `"cloudbase"` | **The main managed group for server-side projects** (TokenHub-backed, multi-vendor pool). Vendor + concrete model go into the **`model` field** of `generateText` / `streamText`, e.g. `{ model: "deepseek-v4-flash" }`. **No model is enabled by default — always check `DescribeAIModels` first and, if the target model is missing, enable it with `UpdateAIModel` before calling the SDK.** |
| `"hunyuan-exp"` | Only if `DescribeAIModels` explicitly returns this legacy builtin group for the current env. |
| `"custom-<your-name>"` | A user-defined GroupName you onboarded via `CreateAIModel`. **Must** start with `custom-` (e.g. `custom-kimi`, `custom-openai-compat`). |

> Image generation is a separate entry point: `ai.createImageModel("hunyuan-image")`. Do not mix it with `createModel(...)`.

### ❌ Wrong argument patterns

Anything that is not one of the three legal values above: vendor names (`"deepseek"`, `"glm"`, `"kimi"`, `"openai"`, `"moonshot"`, …), concrete model ids (`"deepseek-v4-flash"`, `"hunyuan-2.0-instruct-20251111"`), the bare placeholder `"custom"`, or a variable holding the model id. All of these are bugs in `createModel(...)`.

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

When the user wants a **non-managed** text model (self-hosted, enterprise-internal, third-party OpenAI-compatible endpoint, …), **do not block**. Guide them through onboarding — console flow, the full `CreateAIModel` payload, and follow-up management steps: [custom-onboarding.md](references/custom-onboarding.md). The custom `GroupName` MUST start with `custom-`; custom-model billing is covered by the third-party provider and does not draw from the Token Credits resource pack.

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

## SDK API Reference (on demand)

For full `generateText` / `streamText` / `generateImage` code examples, the error-handling pattern, image-generation parameters, and the complete TypeScript type definitions, read [api-reference.md](references/api-reference.md). That file (together with this SKILL.md) is the authoritative reference for `@cloudbase/node-sdk`'s AI surface — look up method signatures there before writing code. If a method or field is not documented there, stop and ask, or check the live contract via the MCP tools. No guessing.

---

## Best Practices

1. **Run the two-step preflight before writing business code** — ① eligibility: `envQuery` → `callCloudApi(tcb, DescribeEnvPostpayPackage)` to confirm the Token Credits resource pack (text + image share the same pack); ② group readiness: `DescribeAIModels` for the `cloudbase` group and its `Models[]`, `DescribeManagedAIModelList` for the authoritative supported-model catalog, `UpdateAIModel` with a full-replacement `Models[]` + `Status: 1` when the target model is missing. If the pack is missing, return the purchase link `https://buy.cloud.tencent.com/lowcode?buyType=resPack&envId={envId}&resourceType=token` instead of emitting SDK code and letting the user debug runtime errors.
2. **Never assume any model is already enabled** — not `deepseek-v4-flash`, not `hunyuan-image`, not anything. Always verify with `DescribeAIModels` first; if the target is missing, look up the exact `Model` string in `DescribeManagedAIModelList` (do **not** guess the spelling) and then `UpdateAIModel` to enable it.
3. **`createModel` accepts exactly three kinds of values** — `"cloudbase"` (the main managed group), `"hunyuan-exp"` (legacy builtin), or a user-defined GroupName registered via `CreateAIModel` (**MUST start with `custom-`**, e.g. `custom-kimi`, `custom-openai-compat`). **Never** guess with `createModel("deepseek")` / `createModel("kimi")` / `createModel("custom")` — the first two are vendor/model names, the last is a placeholder. `createImageModel("hunyuan-image")` is a separate image API — keep it as-is.
4. **Do not invent SDK method names or parameters.** This skill (SKILL.md + `references/api-reference.md`) is the authoritative reference for `@cloudbase/node-sdk`'s AI surface — look up the method signature there before writing code. If a method or field is not documented there, stop and ask, or check the live contract via the MCP tools. No guessing.
5. **Show pricing before enabling a new managed model** — `DescribeManagedAIModelList` returns `ModelSpec` (context length, max input/output tokens) + `ModelChargingInfo` (input / output / cache prices, billing unit). Show the prices to the user before calling `UpdateAIModel`.
6. **Plan timeout and quota separately for image generation** — `generateImage` costs more per call than text and takes longer. For cloud functions, set `timeout` to `900s`. HTTP-function gateways cap at 60s, so use an async-task + polling pattern. Throttle per-user concurrency and frequency to avoid burning an entire Token pack on one failure.
7. **Prefer streaming for long-form interactions** — in HTTP-function or cloud-function SSE scenarios, use `streamText` + `for await (const chunk of result.textStream)` to flush chunks back to the client incrementally. Handle stream interruption in `catch` and close the underlying response.
8. **Pin `@cloudbase/node-sdk` >= 3.16.0** on the server — image generation is only available from this version. Verify with `npm ls @cloudbase/node-sdk` to confirm the version actually loaded by the cloud function / cloud run runtime — local and production can drift.
9. **Centralize model names in config, not scattered literals.** Keep the chosen text / image model in a single constant and source from `DescribeAIModels` / `DescribeManagedAIModelList`. The managed catalog evolves; a single source of truth makes upgrades cheap. For models outside the managed catalog, follow the Custom Onboarding section — never hard-code third-party API keys in business code (let `CreateAIModel.Secret.ApiKey` hold them via CloudBase).
10. **Distinguish "preflight failure" from "model call failure"** — the former means the resource pack is not active or the target model has not been enabled via `UpdateAIModel` (guide the user to purchase / enable). The latter is a parameter issue or upstream error. Do not wrap both in one generic toast.
11. **Do not log full prompts or generated text in production** — log only `usage.total_tokens` and a short prefix. Prompts can leak sensitive content; token counts can leak cost signals.
12. **TypeScript: do NOT use `any` to silence SDK type errors.** The Node SDK ships its own types; narrow with `unknown` + a type guard, write a precise `interface` for the shape you consume, or augment types in a local `.d.ts`. Never `: any`, `as any`, `@ts-ignore`, `@ts-nocheck`. See the Engineering constitution in the `web-development` skill — it applies to backend TS too.
13. **Self-verify before claiming done.** `tsc --noEmit` + project build + actually invoke the function (local invoke / `manageFunctions(action="invokeFunction")` / direct HTTP hit) and confirm `usage.total_tokens > 0` and the returned text is not an error envelope. "It should work" without a real round-trip is not acceptable evidence.

## Reference index

All packaged reference files (required for skill lint reachability):

- [api-reference.md](references/api-reference.md) — generateText / streamText / generateImage examples, error-handling pattern, image parameters, TypeScript type definitions
- [custom-onboarding.md](references/custom-onboarding.md) — onboarding models outside the managed catalog (console flow + `CreateAIModel`)
