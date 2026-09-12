# Sensitive Runtime Data Protection

**Mandatory protocol** when writing, reviewing, or deploying CloudBase Cloud Functions or CloudBase Run (Function mode / Container mode) code that handles HTTP requests, request headers, environment variables, or debug/echo tooling.

## Why this exists

CloudBase gateways may inject platform context into backend requests. The header `x-cloudbase-context` is a base64-encoded payload that can include temporary cloud credentials for the account/environment. If application code echoes request headers, dumps `process.env`, or deploys a generic request inspector (for example `httpbin`), those credentials can leak to any caller and grant broad cloud-resource access.

This is the same class of failure as returning cloud-function environment variables or SecretId/SecretKey to clients: the platform cannot fully prevent unsafe application code from disclosing what it can already read.

## Hard rules (non-negotiable)

1. **Never return `x-cloudbase-context` to clients**
   - Do not put it in response bodies, response headers, logs shipped to clients, error payloads, or debug endpoints.
   - Do not base64-decode it and print, store in public storage, or forward it to untrusted systems.
   - Treat case variants the same (`X-CloudBase-Context`, `x-cloudbase-context`, etc.).

2. **Never echo raw request metadata wholesale**
   - Forbidden patterns: returning `req.headers`, `event.headers`, `event`, `context`, `os.environ`, `process.env`, or "dump everything" debug routes.
   - If debugging is required, return only an explicit allowlist of non-sensitive fields (for example `method`, `path`, a business request id).

3. **Never dump runtime secrets or credential-shaped env vars**
   - Do not return or log values for names such as:
     - `TENCENTCLOUD_SECRETID` / `TENCENTCLOUD_SECRETKEY` / `TENCENTCLOUD_SESSIONTOKEN`
     - `CLOUDBASE_APIKEY` / `CLOUDBASE_API_KEY` / `TCB_*` credential fields
     - Any `*SECRET*`, `*TOKEN*`, `*PASSWORD*`, `*PRIVATE_KEY*` environment variable
   - Prefer CloudBase server API Keys for app runtime auth instead of reflecting platform-injected temporary keys.

4. **Do not deploy request-echo / inspector images for CloudRun demos**
   - Do **not** recommend or deploy `httpbin`, `requestbin`, `webhook.site`-style reflectors, or custom "print all headers" services on CloudBase Run.
   - Prefer a minimal hello-world that returns a fixed JSON payload, or a health check that returns `{ "ok": true }` only.

5. **Keep secrets server-side**
   - Inject credentials through environment variables / secret managers.
   - Use them only inside the process to call CloudBase or Tencent Cloud APIs.
   - Never serialize them into HTTP responses, client bundles, README samples with real values, or chat/tool output meant for end users.

## Safe vs unsafe examples

### Unsafe (do not generate)

```js
// CloudRun / HTTP Function — leaks gateway-injected credentials
app.get("/debug", (req, res) => {
  res.json({ headers: req.headers, env: process.env });
});
```

```js
// Event Function — may leak platform context fields
exports.main = async (event, context) => {
  return { event, context, env: process.env };
};
```

```yaml
# CloudRun — httpbin reflects x-cloudbase-context to callers
image: kennethreitz/httpbin
```

### Safe (preferred)

```js
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/whoami", (req, res) => {
  // Allowlist only non-sensitive request facts
  res.json({
    method: req.method,
    path: req.path,
    // Do NOT include req.headers or credential headers
  });
});
```

```js
exports.main = async (event) => {
  const name = typeof event?.name === "string" ? event.name : "world";
  return { ok: true, message: `hello ${name}` };
};
```

## Agent checklist before claiming done

- [ ] No response path returns `x-cloudbase-context` or full `headers` / `env` objects
- [ ] No CloudRun/function demo uses httpbin or equivalent header echo tools
- [ ] Credential env vars are read for SDK init only, never written into responses
- [ ] Debug endpoints, if any, use an explicit non-sensitive allowlist

## Usage instruction

> Before writing or deploying Cloud Function / CloudRun HTTP handlers, debug routes, or container images, follow `cloudbase-platform/references/protocols/sensitive-runtime-data-protection.md`.
