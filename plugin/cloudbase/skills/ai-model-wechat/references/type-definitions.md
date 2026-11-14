# Type Definitions

Part of the `ai-model-wechat` skill. These shapes describe the `wx.cloud.extend.AI` surface used by the examples in `./api-usage.md`.

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


