# Custom Model Onboarding (models outside the managed catalog)

When the user wants a **non-managed** text model (self-hosted, enterprise-internal, third-party OpenAI-compatible endpoint, …), **do not block**. Guide them through onboarding:

## Option 1: console flow (recommended, user handles it)

`https://tcb.cloud.tencent.com/dev?envId={envId}#/ai`

## Option 2: programmatic onboarding (`CreateAIModel`)

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
