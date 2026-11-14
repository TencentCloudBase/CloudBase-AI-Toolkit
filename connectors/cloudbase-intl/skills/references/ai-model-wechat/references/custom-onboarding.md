# Custom Onboarding

Part of the `ai-model-wechat` skill. Complete the two-step preflight in `SKILL.md` before using this path.

## Custom Onboarding (when not in the managed catalog)

When the user specifies a model that is not in the main managed group (`cloudbase`) catalog (e.g. enterprise-hosted OpenAI-compatible endpoints, third-party model services), pick one of the two paths below. Use neutral phrasing such as "third-party / self-hosted / OpenAI-compatible endpoint" — **do not name specific competitor brands**.

**Path 1 · Register in the console**

Point the user to the CloudBase console AI model page:

```
https://tcb.tencentcloud.com/dev?envId={envId}#/ai
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


