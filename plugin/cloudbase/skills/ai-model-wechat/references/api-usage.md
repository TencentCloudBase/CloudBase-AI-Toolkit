# Mini Program AI Call Examples

Part of the `ai-model-wechat` skill. Complete the two-step preflight in `SKILL.md` before copying any example. All examples assume `createModel("cloudbase")` with a model confirmed present in `DescribeAIModels`.

## Prerequisites

- WeChat base library **3.15.1+**
- No extra SDK installation needed


## Initialization

```js
// app.js
App({
  onLaunch: function() {
    wx.cloud.init({ env: "<YOUR_ENV_ID>" });
  }
})
```


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


