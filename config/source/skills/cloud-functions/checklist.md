# Cloud Functions Execution Checklist

Use this checklist before creating or updating a CloudBase function.

## Required checks

1. Decide whether this is an Event Function or an HTTP Function.
   - Event Function: `exports.main(event, context)`, SDK/timer driven
   - HTTP Function: `req` / `res`, listens on port `9000`
2. Pick the runtime before creation and state it explicitly.
3. For HTTP Functions, confirm `scf_bootstrap` exists and the Node.js binary path matches the runtime (e.g. `Nodejs18.15` → `/var/lang/node18/bin/node`).
4. Confirm the function root path points to the parent directory, not the function directory itself.
5. For HTTP Functions that need anonymous access, configure the function security rule with `managePermissions(action="updateResourcePermission", resourceType="function")` after creation. Default rules reject anonymous callers with `EXCEED_AUTHORITY`.
6. For HTTP Functions, verify that route handlers account for the gateway path prefix. The gateway does **not** strip the public path before forwarding requests to your function. If the gateway access path is `/api/demo` or the default `/${targetName}`, the handler receives that full prefix — routes that only match `/` will not match. **Do NOT use `process.env.PUBLIC_BASE_PATH || ""`** — this env var is not set by the CloudBase runtime and defaults to empty string, making normalization a no-op. Either: (a) call `manageGateway(action="createAccess", path="/")` to expose at `/`, or (b) hard-code `const BASE_PATH = "/<functionName>"` in your function code and strip it before routing (see `./references/http-functions.md` gateway path mapping).
7. If the request is really for a long-running container service, reroute to `cloudrun-development`.

## Common failure patterns

- Choosing the wrong function type and compensating later.
- Mixing Event Function and HTTP Function handler shapes in the same implementation.
- Forgetting that runtime cannot be changed after creation.
- Mismatching the `scf_bootstrap` Node.js binary path with the function runtime.
- Forgetting to configure function security rules for HTTP Functions that need anonymous access.
- Writing HTTP Function routes that only match `/` and `/health` but ignoring that the gateway forwards the full public path (e.g. `/myFunction` or `/api/demo`). This causes every route to return 404 when accessed through the gateway.
- Using `process.env.PUBLIC_BASE_PATH || ""` for path normalization — this env var is not set by the CloudBase runtime, so it defaults to empty string and normalization is a no-op. Always hard-code the function name as the base path (e.g. `const BASE_PATH = "/httpDemo"`).
- Treating Cloud Functions as the default answer for Web authentication.

## Done criteria

- Function type and runtime are explicit.
- Packaging constraints are checked.
- Gateway path prefix is handled — the handler either normalizes the prefix with a hard-coded `BASE_PATH = "/<functionName>"`, or the gateway access is configured with `path: "/"` so internal routes match directly. **No `process.env.PUBLIC_BASE_PATH || ""`** — it defaults to empty and does nothing.
- The task is confirmed to be a function workflow rather than CloudRun.
