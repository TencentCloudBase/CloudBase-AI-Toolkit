# AI Model (WeChat) Reference Map

Use this file to decide which detailed reference to read after `SKILL.md`.

The mandatory two-step preflight and the four legal `createModel(provider)` values live in `SKILL.md` and are not repeated here.

## Reference routing

### `./references/custom-onboarding.md`

Read when the model is outside the managed catalog: register a `custom-` GroupName through the console or `CreateAIModel`.

### `./references/api-usage.md`

Read when writing Mini Program call code: prerequisites, `wx.cloud.init`, `generateText`, `streamText`, error handling, JS/Node SDK comparison.

### `./references/multimodal.md`

Read when the task takes an image as input: OCR and form extraction, upload-before-call, prompt enums, human review before insert.

### `./references/type-definitions.md`

Read when typing the API surface: `WxContentBlock`, `WxStreamTextInput`, `WxStreamTextResult`, `WxGenerateTextResponse`.
