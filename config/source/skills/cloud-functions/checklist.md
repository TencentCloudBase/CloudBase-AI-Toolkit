# Cloud Functions Execution Checklist

Use this checklist before creating or updating a CloudBase function.

## Required checks

1. Decide whether this is an Event Function or an HTTP Function.
   - Event Function: `exports.main(event, context)`, SDK/timer driven
   - HTTP Function: `req` / `res`, listens on port `9000`
2. For Event Functions, confirm the code uses CommonJS: `require()` for imports, `exports.main` for the handler. Do not use `import` or `export` syntax — the runtime is CommonJS only.
3. Pick the runtime before creation and state it explicitly.
4. For HTTP Functions, confirm `scf_bootstrap` exists and the Node.js binary path matches the runtime (e.g. `Nodejs18.15` → `/var/lang/node18/bin/node`).
5. Confirm the function root path points to the parent directory, not the function directory itself.
6. For HTTP Functions that need anonymous access, configure the function security rule with `managePermissions(action="updateResourcePermission", resourceType="function")` after creation. Default rules reject anonymous callers with `EXCEED_AUTHORITY`.
7. If the request is really for a long-running container service, reroute to `cloudrun-development`.

## Common failure patterns

- Choosing the wrong function type and compensating later.
- Using ES Module syntax (`import`, `export`) in Event Functions instead of CommonJS (`require()`, `exports.main`).
- Mixing Event Function and HTTP Function handler shapes in the same implementation.
- Forgetting that runtime cannot be changed after creation.
- Mismatching the `scf_bootstrap` Node.js binary path with the function runtime.
- Forgetting to configure function security rules for HTTP Functions that need anonymous access.
- Treating Cloud Functions as the default answer for Web authentication.

## Done criteria

- Function type and runtime are explicit.
- Packaging constraints are checked.
- The task is confirmed to be a function workflow rather than CloudRun.
