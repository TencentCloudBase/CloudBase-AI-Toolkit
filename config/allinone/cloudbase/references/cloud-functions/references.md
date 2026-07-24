# Cloud Functions Reference Map

Use this file to decide which detailed reference to read after the main skill.

## Read this next when

- You already know the task belongs to Cloud Functions, but the main `SKILL.md` is intentionally keeping only the routing and guardrails.

## Reference routing

### `./references/event-functions.md`

Read this when the task is about:

- `exports.main(event, context)`
- SDK-invoked serverless functions
- timer-triggered jobs
- Event Function deployment or invocation patterns

### `./references/http-functions.md`

Read this when the task is about:

- HTTP endpoints
- REST APIs
- SSE or WebSocket services
- `scf_bootstrap`
- browser/public access paths for HTTP Functions

### `./references/http-functions-custom-image.md`

Read this when the task is about:

- deploying an HTTP Function from a **container image** (`Runtime: CustomImage`)
- `imageConfig` / `ImageUri` / TCR image addresses
- the zip → COS → CloudApp custom build → TCR → SCF image pipeline
- choosing between a managed-runtime HTTP Function, a Custom Image HTTP Function, and a CloudRun container

### `./references/operations-and-config.md`

Read this when the task is about:

- function logs
- environment-variable updates
- trigger or VPC configuration
- gateway exposure for Event Functions
- legacy tool-name translation
- `callCloudApi` fallback for Cloud Functions

## Keep these distinctions straight

- Event Function code shape: `exports.main(event, context)`
- HTTP Function code shape: `req` / `res` web server on port `9000`
- HTTP Access for Event Functions is a gateway configuration, not the HTTP Function runtime model
- CloudRun is the right route when the task is actually a long-lived service or broader container workload
- Custom Image HTTP Function (`Runtime: CustomImage`) still listens on the fixed port `9000` and is request-driven — distinct from a CloudRun container, which listens on the injected `PORT` and runs long-lived
