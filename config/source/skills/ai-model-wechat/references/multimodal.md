# Multimodal Image Input

Part of the `ai-model-wechat` skill. Pick a vision-capable model and complete the two-step preflight in `SKILL.md` first.

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


