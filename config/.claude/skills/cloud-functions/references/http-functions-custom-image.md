# HTTP Functions — Custom Image Deployment Reference

Use this reference when an HTTP Function must run from a **container image** instead of the managed Node.js/Python runtime. This is the `Runtime: CustomImage` path: the code is packaged as a Docker image, pushed to TCR (Tencent Container Registry), and SCF runs that image.

## When to choose Custom Image (vs the other two HTTP options)

| Deployment form | Choose when | How it deploys |
| --- | --- | --- |
| **Managed runtime** (default, see `http-functions.md`) | Plain Node.js / Python, dependencies are simple | `manageFunctions(createFunction)` + `scf_bootstrap` + zip |
| **Custom Image** (this file) | Need custom system libraries / arbitrary runtime, but still want SCF request-driven execution and scale-to-zero | CloudApp custom build → TCR → SCF image function |
| **CloudRun container** (see `cloudrun-development`) | Long-lived process, persistent connections, listens on injected `PORT` | `manageCloudRun` |

Keep Custom Image HTTP Functions distinct from CloudRun containers — both use a Dockerfile, but:

- **Custom Image HTTP Function**: container listens on a **fixed port `9000`**, request-driven, scales to zero. SCF gateway sends each HTTP request into the container.
- **CloudRun container**: container listens on the **injected `PORT`** env var, long-lived process.

Do not blend the two contracts.

## End-to-end pipeline (6 steps)

The link between the two stages is the TCR image address:

```text
ImageUri = {TCR_REGISTRY}/{TCR_NAMESPACE}/{ServiceName}:{VersionName}
example:   ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001
```

```text
Stage A — build the image (CloudApp custom build pipeline)
  ① DescribeCloudAppCosInfo   -> get COS upload credentials + UnixTimestamp
  ② PUT zip to COS            -> upload source
  ③ CreateCloudApp            -> trigger docker build + docker push to TCR
  ④ DescribeCloudAppVersion   -> poll until Status=SUCCESS, read VersionName

Stage B — deploy to SCF (based on the TCR image)
  ⑤ createFunction / updateFunctionCode  -> SCF image function
  ⑥ getFunctionDetail (optional)         -> confirm Status=Active
```

## Tooling boundary (read this before acting)

- **Stage B (SCF image deploy) is covered by `manageFunctions`.** Use `manageFunctions(action="createFunction")` with `func.runtime="CustomImage"` + `imageConfig`, and `manageFunctions(action="updateFunctionCode")` + `imageConfig` for later iterations. The Manager SDK auto-fills `ImageType=enterprise` and `ImagePort=9000`, and strips Handler / dependency install for image functions.
- **Stage A (CloudApp custom build → TCR) is NOT covered by MCP tools.** The `manageApps` / `queryApps` tools only support `static-hosting`. The custom-build pipeline (`DeployType=custom`, `CustomSteps`, `DescribeCloudAppCosInfo` with `DeployType=custom`) is a **raw Tencent Cloud API path**. Treat it as a `callCloudApi` fallback:
  - Confirm the exact action name, parameters, and `X-TC-Version` from official docs **before** calling — do not guess payloads from memory.
  - CloudApp build APIs are on `tcb.tencentcloudapi.com` (`X-TC-Version: 2018-06-08`).
  - SCF APIs are on `scf.tencentcloudapi.com` (`X-TC-Version: 2018-04-16`).
- **Region must match.** TCR, the CloudApp build, and SCF must be in the same region (e.g. all `ap-shanghai`). Cross-region image pulls time out.

## Stage B with `manageFunctions` (the supported path)

### Create (first deploy)

```javascript
manageFunctions({
  action: "createFunction",
  func: {
    name: "my-scf-func",
    type: "HTTP",
    runtime: "CustomImage"
  },
  imageConfig: {
    imageType: "enterprise",
    imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001",
    registryId: "tcr-xxxxxxxx",
    command: "python",
    args: "-u app.py",
    imagePort: 9000,
    containerImageAccelerate: true
  }
});
```

### Update image (later iterations)

Only the tag changes; no local code packaging.

```javascript
manageFunctions({
  action: "updateFunctionCode",
  functionName: "my-scf-func",
  imageConfig: {
    imageType: "enterprise",
    imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-002",
    registryId: "tcr-xxxxxxxx"
  }
});
```

### `imageConfig` fields

| Field | Required | Notes |
| --- | --- | --- |
| `imageUri` | yes | Full address **with tag**: `{domain}/{ns}/{image}:{tag}`. Never `:latest`. |
| `imageType` | — | `"enterprise"` (TCR enterprise) or `"personal"`. Defaults to `enterprise`. |
| `registryId` | enterprise only | TCR instance id `tcr-xxxxxxxx`. Required when `imageType=enterprise`. |
| `command` | — | Overrides `ENTRYPOINT`. Omit to use the Dockerfile default. |
| `args` | — | Overrides `CMD`, space-separated. |
| `imagePort` | — | Web Server: `9000` (default). Job-style image: `-1`. |
| `containerImageAccelerate` | — | Image acceleration; enable for large images to cut cold-start time. |

After deploy, confirm readiness with `queryFunctions(action="getFunctionDetail", functionName="my-scf-func")` and look for `Status=Active`. For public/browser access, create gateway access explicitly with `manageGateway(action="createAccess", type="HTTP")` and set the function security rule (anonymous login is disabled by default — see `http-functions.md`).

## Source packaging (Stage A input)

Package the **contents** of the project root, with a `Dockerfile` at the root — do not nest an extra top-level folder.

```bash
# correct: zip the contents from inside the project root
cd ./my-app
zip -r ../my-app.zip .

# wrong: this nests an extra my-app/ layer after extraction
zip -r my-app.zip my-app/
```

After extraction the build container sees:

```text
/  (workspace root)
├── Dockerfile          <- must be at the root
├── package.json / requirements.txt / pom.xml ...
├── src/
└── ...
```

## Dockerfile contract for SCF image functions

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 9000              # SCF Web Server functions must listen on 9000
CMD ["python", "-u", "app.py"]
```

SCF image constraints:

| Constraint | Detail |
| --- | --- |
| Web Server functions listen on `9000` | The SCF gateway sends HTTP requests into the container on this port. |
| The image must start an HTTP server on its own | Not a CLI tool, not a blocking script. |
| Image size ideally ≤ 500MB | Large images cold-start slowly; enable `containerImageAccelerate`. |
| Container start ≤ health-check timeout | Default 60s. |

## TCR credentials (Stage A push, raw API)

Use STS temporary credentials + TCR `CreateInstanceToken` to obtain a short-lived registry login, instead of storing any long-term TCR password:

- The build container injects STS credentials as `$API_SECRET_ID` / `$API_SECRET_KEY` / `$API_TOKEN`.
- In the build step, sign a TCR `CreateInstanceToken` call (`tcr.tencentcloudapi.com`, `X-TC-Version: 2019-09-24`) with those credentials to get a temporary token.
- `docker login` with that token (always via `--password-stdin`), then `docker push`.

Security red lines:

- Never print `$API_SECRET_*` / `$API_TOKEN` or pass them outside the container.
- Always use `docker login --password-stdin` so credentials never appear in `ps` or logs.

## Build-container variables (Stage A, custom build)

Use these inside `CustomSteps` commands:

| Variable | Meaning |
| --- | --- |
| `$CLOUDBASE_SERVICE_NAME` | Service name (= the `ServiceName` input) |
| `$CLOUDBASE_VERSION_NAME` | Version name — **use this as the image tag**; available at build time, unique, traceable |
| `$CLOUDBASE_VERSION_NUMBER` | Numeric version (e.g. `001`) |
| `$CLOUDBASE_ENV_ID` | Environment id |
| `$BUILD_TYPE` | `zip` / `git` |
| `$ZIP_FILE_URL` | Zip download URL (injected automatically in zip mode) |
| `$API_SECRET_ID` `$API_SECRET_KEY` `$API_TOKEN` | STS credentials (never print) |

- Reserved prefixes that must NOT be declared in `Env`: `API_*`, `CLOUDBASE_*`, `CODE_*`, `BUILD_TYPE`, `ZIP_FILE_URL`.
- Do NOT reference non-existent variables such as `$BUILD_ID`, `$CLOUDBASE_BUILD_ID`, `$CLOUDBASE_VERSION` — use `$CLOUDBASE_VERSION_NAME` for the tag.

## Common errors

### Stage A (build)

| Symptom | Likely cause |
| --- | --- |
| `Source 不能为空` | `Source.Type` empty; zip flow must set `"zip"` |
| `Commands 和 CustomSteps 不能同时为空` | Provide at least one `CustomSteps` entry |
| COS upload 403 | Missing one of the `UploadHeaders`, or the upload URL expired (>15 min) |
| `检出 ZIP 包` failed | `CosTimestamp` missing or wrong (must reuse the `UnixTimestamp` from step ①) |
| `docker push :tag` empty tag | Used a non-existent variable; use `$CLOUDBASE_VERSION_NAME` |
| `docker login unauthorized` | TCR namespace not authorized; check `TCR_INSTANCE_ID` |
| `AuthFailure.SignatureFailure` | Push script `REGION` does not match the TCR instance region |

### Stage B (deploy)

| Symptom | Likely cause |
| --- | --- |
| `ResourceNotFound.ImageConfig` | `imageUri` does not exist or the tag is wrong |
| `InvalidParameterValue.ImageUri` | Wrong format; must be `{domain}/{ns}/{image}:{tag}` |
| SCF image pull timeout | TCR and SCF are not in the same region |
| SCF image pull denied | `SCF_QcsRole` not authorized to pull from TCR |
| Function start timeout (60s) | Image too large or startup too slow; enable image acceleration / slim the image |
| Port 9000 no response | Dockerfile `EXPOSE` / `CMD` does not actually start an HTTP server on 9000 |

## Best practices

- Image tag = `$CLOUDBASE_VERSION_NAME` — available at build time, unique, traceable.
- TCR push via STS + `CreateInstanceToken` — no long-term secrets to manage.
- `Runtime` must be `"CustomImage"`, not a language runtime.
- `imageUri` must include a tag — never `:latest`.
- Keep TCR, CloudApp build, and SCF in the same region.
- SCF image ≤ 500MB + enable acceleration to control cold-start time.
