# Cloud Functions Execution Checklist

Use this checklist before creating or updating a CloudBase function.

## Required checks

1. Decide whether this is an Event Function or an HTTP Function.
   - Event Function: `exports.main(event, context)`, SDK/timer driven
   - HTTP Function: `req` / `res`, listens on port `9000`
2. Pick the runtime before creation and state it explicitly.
   - For a managed runtime, choose a language runtime (e.g. `Nodejs18.15`).
   - For a container-image HTTP Function, set `runtime: "CustomImage"` and provide `imageConfig` (`imageUri` with tag; `registryId` for enterprise TCR). The image still listens on port `9000`. See `references/http-functions-custom-image.md`.
3. For HTTP Functions on a managed runtime, confirm `scf_bootstrap` exists and the Node.js binary path matches the runtime (e.g. `Nodejs18.15` → `/var/lang/node18/bin/node`). Custom Image functions do not use `scf_bootstrap`.
4. If an HTTP Function calls CloudBase resources through `@cloudbase/node-sdk` or `@cloudbase/manager-node`, complete `references/http-function-credentials.md`. Do not rely on the default temporary credential path:
   - Node SDK: inject `CLOUDBASE_APIKEY`, preferably after creating a server key with `manageAppAuth(action="createApiKey", keyType="api_key")`, or inject a Tencent Cloud key pair.
   - Manager SDK: inject a Tencent Cloud `SecretId` / `SecretKey` pair.
   - Never commit credentials, return them to clients, or overwrite unrelated function environment variables.
5. Confirm no response path echoes `x-cloudbase-context`, full `req.headers` / `event` / `context`, or `process.env`. Follow `../cloudbase-platform/references/protocols/sensitive-runtime-data-protection.md`.
6. Confirm the function root path points to the parent directory, not the function directory itself. (Not needed for Custom Image deploys — the code lives in the image.)
7. For Custom Image deploys, confirm TCR, the CloudApp build, and SCF are in the same region, and the image tag is unique (not `:latest`). Remember Stage A (CloudApp custom build → TCR push) is a raw Tencent Cloud API path, not covered by MCP tools.
8. For HTTP Functions that need public access, configure the function security rule with `managePermissions(action="updateResourcePermission", resourceType="function")` after creation. Default rules reject unauthenticated callers with `EXCEED_AUTHORITY`. Note: anonymous login is disabled by default — use `rule: "true"` for public endpoints.
9. If creating or mutating a function **layer**, follow the account-scoped naming contract (same as MCP tool descriptions):
   - New layer names must use `{layerName}_{当前envId}` (e.g. `common_cloud1-d9ghadgak3edf6b36`). Pass that full string as `layerName`; do not auto-append suffixes in client code.
   - Before `createLayerVersion`, call `queryFunctions(action="listLayers")` to avoid colliding with another env's bare name.
   - Treat envelope `warnings` as soft advisories (success still means the call ran). Deleting a layer version or rebinding layers can impact every env that shares that LayerName.
   - Details: `references/operations-and-config.md`.
10. If the request is really for a long-running container service, reroute to `cloudrun-development`.

## Common failure patterns

- Choosing the wrong function type and compensating later.
- Mixing Event Function and HTTP Function handler shapes in the same implementation.
- Forgetting that runtime cannot be changed after creation.
- Mismatching the `scf_bootstrap` Node.js binary path with the function runtime.
- Relying on passwordless/default temporary credentials when an HTTP Function calls a CloudBase SDK.
- Returning request headers, environment dumps, or `x-cloudbase-context` from debug/hello endpoints.
- For Custom Image functions: using `:latest`, mismatched regions across TCR/CloudApp/SCF, or assuming MCP covers the CloudApp build → TCR push stage (it does not).
- Forgetting to configure function security rules for HTTP Functions that need public access.
- Treating Cloud Functions as the default answer for Web authentication.
- Creating layers with a bare name (e.g. `common`) so multiple envs share one version sequence, or ignoring MCP layer `warnings` about account-scoped sharing.

## Done criteria

- Function type and runtime are explicit.
- Packaging constraints are checked.
- HTTP Function SDK credentials are explicit and a real SDK operation was verified after deployment.
- No response echoes `x-cloudbase-context`, full headers, or credential env vars.
- If layers were created, names follow `{layerName}_{当前envId}` and duplicate checks were done via `listLayers`.
- The task is confirmed to be a function workflow rather than CloudRun.
