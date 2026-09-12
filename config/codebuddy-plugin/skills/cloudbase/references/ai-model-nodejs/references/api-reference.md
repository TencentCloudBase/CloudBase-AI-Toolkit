# AI Model SDK API Reference (@cloudbase/node-sdk)

> Prerequisite for all calls: the two-step preflight (eligibility + group readiness) in SKILL.md has passed.

## generateText() — non-streaming

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

## streamText() — streaming

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
