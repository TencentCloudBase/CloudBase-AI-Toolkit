# Cloud Functions Execution Checklist

Use this checklist before creating or updating a CloudBase function.

## Required checks

1. Decide whether this is an Event Function or an HTTP Function.
   - Event Function: `exports.main(event, context)`, SDK/timer driven
   - HTTP Function: `req` / `res`, listens on port `9000`
2. Pick the runtime before creation and state it explicitly.
3. For HTTP Functions, confirm `scf_bootstrap` exists and the Node.js binary path matches the runtime (e.g. `Nodejs18.15` → `/var/lang/node18/bin/node`).
4. Confirm the function root path points to the parent directory, not the function directory itself.
5. If the task needs browser/public access, keep the gateway path and the in-function router path separate. For example, an external path like `/api/httpDemo/health` should normally map to an internal function route like `/health`.
6. For HTTP Functions that need anonymous access, configure the function security rule with `managePermissions(action="updateResourcePermission", resourceType="function")` after creation. Default rules reject anonymous callers with `EXCEED_AUTHORITY`.
7. If the request is really for a long-running container service, reroute to `cloudrun-development`.

## Common failure patterns

- Choosing the wrong function type and compensating later.
- Mixing Event Function and HTTP Function handler shapes in the same implementation.
- Forgetting that runtime cannot be changed after creation.
- Mismatching the `scf_bootstrap` Node.js binary path with the function runtime.
- Writing the public gateway prefix into the HTTP Function router instead of handling the internal route after the prefix is stripped.
- Forgetting to configure function security rules for HTTP Functions that need anonymous access.
- Treating Cloud Functions as the default answer for Web authentication.

## Done criteria

- Function type and runtime are explicit.
- Packaging constraints are checked.
- The task is confirmed to be a function workflow rather than CloudRun.
