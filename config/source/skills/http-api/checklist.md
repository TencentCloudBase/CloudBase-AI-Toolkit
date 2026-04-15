# HTTP API Routing Checklist

Use this checklist when the request comes from Android, iOS, Flutter, React Native, backend scripts, or any environment that is not using a CloudBase SDK.

## Required checks

1. Confirm the caller really needs raw HTTP APIs rather than Web SDK, mini program SDK, or MCP management tools.
2. Confirm whether the request targets official CloudBase APIs or the user's own business API before drafting any request sample.
3. Confirm environment ID, region, and gateway base URL.
4. Choose the auth mechanism: AccessToken, API Key, or Publishable Key.
5. Fix the secret-placement boundary before coding.
   - API Key stays on trusted server or script environments
   - Publishable Key can be exposed only for intended public access cases
   - untrusted client code must not receive admin credentials
6. Query the matching OpenAPI definition before writing request code.
7. Re-check the final method, path, auth header, expected status code, and response shape against the same OpenAPI contract.
8. Decide how the final request will be replayed or smoke-checked, such as `curl`, Postman, integration test, or server-side script.

## Do not route here when

- The user is building a Web frontend with `@cloudbase/js-sdk`.
- The user is building a CloudBase mini program with `wx.cloud`.
- The task is MCP-driven database management rather than raw HTTP calls.
- The task is really about building a new HTTP service on CloudBase.

## Done criteria

- SDK support boundary is explicit.
- Official CloudBase API vs self-built API boundary is explicit.
- OpenAPI source has been checked.
- The auth method, request base URL, and secret placement are fixed before code generation.
- The final request shape is checked against OpenAPI, including method, path, auth, status code, and response shape.
- A replay path is verified, or a concrete blocker is recorded.
- If the task shifts to diagnosing a real API failure, it is rerouted to `../ops-inspector/SKILL.md` with environment, failing request, and time window context.
