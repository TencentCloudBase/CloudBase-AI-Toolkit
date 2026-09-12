# HTTP Function Credentials for CloudBase SDKs

Use this reference whenever an HTTP Function (managed runtime or Custom Image) calls CloudBase resources through `@cloudbase/node-sdk` or `@cloudbase/manager-node`.

## Credential boundary

> **STOP:** Do not assume that an HTTP Function can use CloudBase SDKs without explicit credentials.

Event Functions can use the platform-provided runtime credential path. HTTP Functions must not depend on that default temporary credential injection: credential rotation can leave the process with invalid credentials and cause intermittent authorization failures.

Before deploying an HTTP Function that calls CloudBase SDKs:

1. Identify which SDK the function uses.
2. Select one supported explicit credential path below.
3. Store credentials in function environment variables, never in source code.
4. Read the existing function configuration, merge the credential variables, and update it with `manageFunctions(action="updateFunctionConfig")`.
5. Verify one real SDK operation after deployment.

## `@cloudbase/node-sdk`

Choose one of these server-side paths:

### Preferred: CloudBase server API Key

First inspect existing server keys:

```javascript
queryAppAuth({
  action: "listApiKeys",
  keyType: "api_key",
  pageNumber: 1,
  pageSize: 20
});
```

If no suitable dedicated key exists, create one through MCP:

```javascript
manageAppAuth({
  action: "createApiKey",
  keyType: "api_key",
  keyName: "http-function-my-service",
  expireIn: 0
});
```

Inject the returned key into the HTTP Function as `CLOUDBASE_APIKEY`. Do not print it, commit it, return it to a client, or put it in browser code.

Use a dedicated key name for each service and define a rotation/revocation owner. `expireIn: 0` avoids automatic expiry but creates a long-lived secret, so use it only when the deployment's secret-rotation process is explicit.

The Node SDK reads this variable automatically:

```javascript
const tcb = require("@cloudbase/node-sdk");

const app = tcb.init({
  env: process.env.TCB_ENV
});
```

The equivalent explicit initialization field is `accessKey`, but the environment-variable path avoids embedding the key in source:

```javascript
const app = tcb.init({
  env: process.env.TCB_ENV,
  accessKey: process.env.CLOUDBASE_APIKEY
});
```

### Alternative: Tencent Cloud permanent key pair

Inject both:

- `TENCENTCLOUD_SECRETID`
- `TENCENTCLOUD_SECRETKEY`

Then initialize the Node SDK with the environment ID. The SDK reads the key pair from those environment variables:

```javascript
const tcb = require("@cloudbase/node-sdk");

const app = tcb.init({
  env: process.env.TCB_ENV
});
```

Do not inject only one member of the pair.

Use a dedicated CAM sub-account with the minimum permissions required by the function instead of a root-account key.

## `@cloudbase/manager-node`

The Manager SDK documentation supports Tencent Cloud credentials, not the CloudBase server API Key used by `@cloudbase/node-sdk`.

Inject:

- `TENCENTCLOUD_SECRETID`
- `TENCENTCLOUD_SECRETKEY`

Pass them explicitly during initialization:

```javascript
const CloudBase = require("@cloudbase/manager-node");

const app = CloudBase.init({
  envId: process.env.TCB_ENV,
  secretId: process.env.TENCENTCLOUD_SECRETID,
  secretKey: process.env.TENCENTCLOUD_SECRETKEY
});
```

Do not tell users to create a CloudBase API Key for Manager SDK initialization unless the Manager SDK public contract adds that capability.

Use a dedicated CAM sub-account with the minimum management permissions required by the function.

## Safe environment update

Never replace all existing environment variables with only the new credentials.

1. Call `queryFunctions(action="getFunctionDetail", functionName="...")`.
2. Merge the existing variables with the new credential variables.
3. Call `manageFunctions(action="updateFunctionConfig", ...)` with the merged object.

Do not expose credential values in logs, summaries, generated examples, or function responses. If a key leaks, revoke it immediately; for a CloudBase API Key use `manageAppAuth(action="deleteApiKey", keyId="...")`.

## Verification

After deployment:

- Invoke an endpoint that performs a harmless CloudBase SDK read.
- Confirm it succeeds more than once rather than checking only process startup.
- Inspect function logs for authentication or expired-token failures.
- Confirm no credential value appears in logs or responses.

## Official references

- Node SDK initialization: `https://docs.cloudbase.net/api-reference/server/node-sdk/initialization`
- Manager SDK initialization: `https://docs.cloudbase.net/api-reference/manager/node/introduction`
