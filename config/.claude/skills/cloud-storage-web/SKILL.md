---
name: cloud-storage-web
description: Complete guide for CloudBase cloud storage using Web SDK (@cloudbase/js-sdk) - upload, download, temporary URLs, file management, and best practices.
version: 2.20.2
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloud-storage-web/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

# Cloud Storage Web SDK

## Activation Contract

### Use this first when

- A browser or Web app must upload, download, or manage CloudBase storage objects through `@cloudbase/js-sdk`.
- The request mentions `uploadFile`, `getTempFileURL`, `deleteFile`, or `downloadFile` in frontend code.

### Read before writing code if

- The task is browser-side storage work but you still need to separate it from Mini Program storage, backend storage management, or static hosting deployment.
- The request may be blocked by security domains or frontend auth.

### Then also read

- Web login and identity -> `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`)
- General Web app setup -> `../web-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`)
- Direct storage management through MCP tools -> `../cloudbase-platform/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudbase-platform/SKILL.md`)

### Do NOT use for

- Mini Program file APIs.
- Backend or agent-side direct storage management through MCP.
- Static website hosting deployment via `manageHosting(action="upload")`.
- Database operations.

### Common mistakes / gotchas

- Uploading from browser code without configuring security domains.
- Using this skill for static hosting instead of storage objects.
- Mixing browser SDK upload flows with server-side file-management tasks.
- Assuming temporary download URLs are permanent links.
- On local Vite or dev-server tasks, forgetting to whitelist the exact current browser `host:port` before testing `app.uploadFile()`.

### Minimal checklist

- Confirm the caller is a browser/Web app.
- Initialize the Web SDK once.
- Check security-domain/CORS requirements.
- Pick the right storage method before coding.

### Local dev recipe

When the app runs on a local browser origin and must upload files from the frontend:

1. Use `envQuery` with `action="domains"` to inspect the current security-domain whitelist.
2. Convert the browser origin into the CloudBase whitelist entry format:
   - Browser origin `http://127.0.0.1:4173` -> whitelist entry `127.0.0.1:4173`
   - Browser origin `http://localhost:5173` -> whitelist entry `localhost:5173`
3. If the exact current host entry is missing, call `envDomainManagement` with `action="create"` and add that host entry before relying on `app.uploadFile()`.
4. If the runtime port may change between runs, do not assume any fixed default port list is sufficient. Re-check the actual browser origin you are really using for testing or final validation, then add that exact `host:port`.
5. Tell the user that security-domain changes may take several minutes to propagate.
6. Only after that should you implement and test browser-side `app.uploadFile()` flows.

If the task uses browser-side file upload, treat this as a prerequisite rather than an optional cleanup.

## Overview

Use this skill for **browser-side cloud storage operations** through the CloudBase Web SDK.

Typical tasks:

- upload files from a browser
- generate temporary download URLs
- delete files
- trigger browser downloads

## SDK initialization

```javascript
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "your-env-id"
});
```

Initialization rules:

- Use synchronous initialization with a shared app instance.
- Do not re-initialize in every component.
- If the operation depends on user identity, handle auth before storage operations.

## Method routing

- Upload from browser -> `app.uploadFile()`
- Temporary preview/download URL -> `app.getTempFileURL()`
- Delete existing files -> `app.deleteFile()`
- Trigger browser download -> `app.downloadFile()`

## Upload

```javascript
const result = await app.uploadFile({
  cloudPath: "uploads/avatar.jpg",
  filePath: selectedFile
});
```

### Upload rules

- `cloudPath` must include the filename.
- Use `/` to create folder structure.
- Validate file type and size before upload.
- Show upload progress for larger files when UX matters.
- On local dev origins, confirm the exact frontend origin already exists in environment security domains before assuming the upload path is usable.
- Match against the whitelist entry format returned by `envQuery(action="domains")`, which is typically `host:port` instead of a full `http://...` URL.
- After `app.uploadFile()` succeeds, do **not** fabricate a public-looking URL by concatenating `envId`, bucket domain, or `cloudPath`. Use the returned `fileID` with `app.getTempFileURL()` and store or display the SDK-resolved URL instead.

### Progress example

```javascript
await app.uploadFile({
  cloudPath: "uploads/avatar.jpg",
  filePath: selectedFile,
  onUploadProgress: ({ loaded, total }) => {
    const percent = Math.round((loaded * 100) / total);
    console.log(percent);
  }
});
```

## Temporary URLs

```javascript
const result = await app.getTempFileURL({
  fileList: [
    {
      fileID: "cloud://env-id/uploads/avatar.jpg",
      maxAge: 3600
    }
  ]
});
```

Use temp URLs when the browser needs to preview or download private files without exposing a permanent public link.

Typical upload + preview flow:

```javascript
const uploadResult = await app.uploadFile({
  cloudPath: "uploads/avatar.jpg",
  filePath: selectedFile
});

const tempUrlResult = await app.getTempFileURL({
  fileList: [{ fileID: uploadResult.fileID, maxAge: 3600 }]
});

const previewUrl = tempUrlResult.fileList?.[0]?.tempFileURL || tempUrlResult.fileList?.[0]?.download_url;
if (!previewUrl) {
  throw new Error("Failed to resolve temporary file URL after upload");
}
```

## Delete files

```javascript
await app.deleteFile({
  fileList: ["cloud://env-id/uploads/old-avatar.jpg"]
});
```

Always inspect per-file results before assuming deletion succeeded.

## Download files

```javascript
await app.downloadFile({
  fileID: "cloud://env-id/uploads/report.pdf"
});
```

Use this for browser-initiated downloads. For programmatic rendering or preview, prefer `getTempFileURL()`.

## Security-domain reminder

To avoid CORS problems, add your frontend domain in CloudBase security domains. In MCP-enabled workflows, prefer checking and updating this through tools before coding browser uploads.

```json
{ "tool": "envQuery", "action": "domains" }
```

Use the actual browser origin when deciding what to add. If the page is running on a custom domain or a local dev port, add that exact `host:port` value instead of guessing from a hard-coded list.

```json
{
  "tool": "envDomainManagement",
  "action": "create",
  "domains": ["<actual-browser-host>:<actual-browser-port>"]
}
```

Match the real browser origin to the whitelist entry format returned by `envQuery(action="domains")`. For local Vite and preview servers, the port can vary between runs, so avoid assuming any fixed default port is sufficient.

Typical examples:

- `<your-local-host>:<actual-port>`
- `<your-custom-domain>`

## Best practices

1. Use a clear folder structure such as `uploads/`, `avatars/`, `documents/`.
2. Validate file size and type in the browser before upload.
3. Use temporary URLs with reasonable expiration windows.
4. Clean up obsolete files instead of leaving orphaned storage objects.
5. Route privileged batch-management tasks to backend or MCP flows instead of browser direct access.

## Error handling

```javascript
try {
  const result = await app.uploadFile({
    cloudPath: "uploads/file.jpg",
    filePath: selectedFile
  });
  console.log(result.fileID);
} catch (error) {
  console.error("Storage operation failed:", error);
}
```
