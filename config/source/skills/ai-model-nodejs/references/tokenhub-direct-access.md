# TokenHub direct access from Cloud Functions

Use this note when the user explicitly wants **direct Tencent Cloud TokenHub / Hunyuan API access** from a CloudBase cloud function or other Node.js backend.

## Core routing rule

- **TokenHub platform** is the direct cloud-side model service platform.
- **Token Plan** is a subscription plan for AI coding tools / IDEs such as CodeBuddy, Cursor, Cline, Claude Code and similar tools.
- **Do not** use Token Plan API keys for backend automation, custom app servers, cron jobs, or batch API calls.
- If the user wants cloud functions to call Tencent Cloud models directly, use **TokenHub API Key + TokenHub endpoints**, not CloudBase-managed `generateImage()`.

## Important boundary in this repo

When describing the built-in managed route in this repository, treat it as the **mini program incentive / growth-plan managed path** and do not present it as the general-purpose direct-cloud API route.

## Recommended configuration flow

1. Open TokenHub and confirm the target model and billing path.
2. Create or obtain a **TokenHub API Key**.
3. In the cloud function, store credentials in environment variables instead of hard-coding them.
4. Use a regular HTTP client or OpenAI-compatible SDK from the backend.
5. Return the generated image URL or task status back to the client.

## Suggested environment variables

```bash
TOKENHUB_API_KEY=your_tokenhub_api_key
TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com
TOKENHUB_IMAGE_MODEL=hy-image-lite
```

For higher-quality async image generation, switch `TOKENHUB_IMAGE_MODEL` to `hy-image-v3.0` and call the submit/query endpoints.

## Cloud Function example: synchronous image generation with `hy-image-lite`

```js
exports.main = async (event) => {
  const prompt = event?.prompt || '现代极简客厅，木质地板，暖色灯光，落地窗';
  const apiKey = process.env.TOKENHUB_API_KEY;
  const baseUrl = process.env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com';
  const model = process.env.TOKENHUB_IMAGE_MODEL || 'hy-image-lite';

  if (!apiKey) {
    throw new Error('Missing TOKENHUB_API_KEY');
  }

  const response = await fetch(`${baseUrl}/v1/api/image/lite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      rsp_img_type: 'url',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TokenHub request failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return {
    model,
    prompt,
    imageUrl: result?.data?.[0]?.url || null,
    raw: result,
  };
};
```

## Async image generation with `hy-image-v3.0`

- Submit endpoint: `POST https://tokenhub.tencentmaas.com/v1/api/image/submit`
- Query endpoint: `POST https://tokenhub.tencentmaas.com/v1/api/image/query`
- Submit with `model: "hy-image-v3.0"` and save the returned `id`
- Poll the query endpoint with `model` + `id` until `status === "completed"`

## Minimal implementation notes for agents

- Prefer cloud functions or backend services, not browser-side direct calls.
- Put API keys in environment variables only.
- For CAD -> render scenarios, keep CAD parsing, prompt assembly, and result persistence in CloudBase; keep model inference on TokenHub.
- If the user asks about pricing or package selection, distinguish **TokenHub platform billing** from **Token Plan for IDE tools**.

## Official references

- Product overview: `https://cloud.tencent.com/document/product/1823/130050`
- Model list: `https://cloud.tencent.com/document/product/1823/130051`
- Token Plan overview: `https://cloud.tencent.com/document/product/1823/130060`
- Token Plan FAQ: `https://cloud.tencent.com/document/product/1823/130076`
- API protocol: `https://cloud.tencent.com/document/product/1823/130078`
- Text generation: `https://cloud.tencent.com/document/product/1823/130079`
- Image generation: `https://cloud.tencent.com/document/product/1823/130080`
- Video generation: `https://cloud.tencent.com/document/product/1823/130081`
- 3D generation: `https://cloud.tencent.com/document/product/1823/130082`
