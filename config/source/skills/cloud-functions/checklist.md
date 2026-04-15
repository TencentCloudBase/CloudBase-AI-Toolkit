# Cloud Functions Execution Checklist

Use this checklist before creating or updating a CloudBase function.

## Required checks

1. Decide whether this is an Event Function, an HTTP Function, or actually a CloudRun service.
   - Event Function: `exports.main(event, context)`, SDK/timer driven
   - HTTP Function: `req` / `res`, listens on port `9000`
   - CloudRun: long-lived container runtime, custom environment, or container-style service
2. Pick the runtime before creation and state it explicitly.
3. For HTTP Functions, confirm `scf_bootstrap` exists, the service listens on port `9000`, and dependencies are packaged with the function code.
4. Confirm the function root path points to the parent directory, not the function directory itself.
5. For HTTP-facing or gateway-exposed delivery, fix the access path, auth expectation, and permission boundary before shipping the code.
6. Decide the post-deploy smoke path before claiming the task is complete.
   - direct invocation
   - SDK call
   - HTTP gateway request
   - other agreed runtime entry
7. Decide which recent log window or runtime evidence will be checked after deployment, or explicitly record why runtime verification is blocked.

## Common failure patterns

- Choosing the wrong function type and compensating later.
- Mixing Event Function and HTTP Function handler shapes in the same implementation.
- Forgetting that runtime cannot be changed after creation.
- Treating Cloud Functions as the default answer for Web authentication.
- Stopping after code generation without checking access paths, recent logs, or permission expectations.

## Done criteria

- Function type and runtime are explicit.
- Packaging constraints are checked.
- The task is confirmed to be a function workflow rather than CloudRun.
- A post-deploy access path or invocation path is verified, or a concrete blocker is recorded.
- Recent logs, runtime evidence, or permission expectations are checked for the changed function path.
- If the task becomes live failure diagnosis instead of implementation, it is rerouted to `../ops-inspector/SKILL.md` with environment, affected resource, and time window context.
