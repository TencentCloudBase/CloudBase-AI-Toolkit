# cloudbaserc — Declarative Config Schema

The `cloudbaserc` config declares the **desired state** of a CloudBase project.
Supported file formats (searched from `cwd` downward): `cloudbaserc.json`,
`cloudbaserc.yaml`, `cloudbaserc.yml`, `cloudbaserc.js`.

`deploy` / `deployPlan` validate the parsed config against the official cloudbaserc schema
before applying. A schema failure aborts with the offending field path and reason.

> Official schema source: `https://static.cloudbase.net/cli/cloudbaserc.schema.json` (JSON Schema Draft-07)

## Top-level fields (official schema)

Top-level `required` is empty (no globally required field), but some conditional branches make
specific fields required in certain function image build scenarios.

| field | purpose |
|-------|---------|
| `$schema` | JSON Schema declaration for tooling/IDE validation |
| `version` | config schema version (official schema currently enumerates `"2.1"`) |
| `envId` | target environment ID (can be overridden by an explicit tool param) |
| `region` | target region (official enum includes `ap-shanghai` / `ap-guangzhou`) |
| `functionRoot` | base dir for cloud function code |
| `functionDefaultConfig` | defaults merged into every entry under `functions` |
| `functions` | array of cloud function definitions |
| `hosting` | hosting site definitions |
| `integrations` | integration definitions |
| `database` | database config (e.g. migration path) |
| `gateway` | gateway route config |
| `envOverrides` | per-`mode` overrides merged in when a matching `mode` is passed |
| `servers` | local/dev server settings |
| `app` | cloud app deployment config |
| `ai` | AI-related config |
| `privateSettings` | private settings |
| `lowcodeCustomComponents` | lowcode custom component config |

The resource sections the deploy orchestrator understands, in dependency order:

```text
database → functions → app → hosting → gateway
```

Use `only` / `skip` on the tools to restrict which of these sections are processed.

## functions

Each entry describes one cloud function. `functionDefaultConfig` is merged into every
entry (entry-level values win).

### Core function notes

- Function entry required field: `name`
- Common fields include: `type`, `runtime`, `handler`, `entry`, `timeout`, `memorySize`,
  `envVariables`, `triggers`, `vpc`, `buildStrategy`, `imageConfig`
- `type` enum: `Event` / `HTTP`
- `buildStrategy` enum: `zip` / `cloud` / `local` / `image`
- Runtime enum includes Node.js, Python, Java, Go, and `CustomImage` (follow official schema as source of truth)

Declarative image/HTTP functions are passed through without flattening — do not manually inline
`imageConfig` fields.

```jsonc
{
  "functionDefaultConfig": { "timeout": 5 },
  "functions": [
    { "name": "fn-a" },                 // inherits timeout: 5
    { "name": "fn-b", "timeout": 10 },  // overrides to 10
    {
      "name": "fn-image",
      "type": "HTTP",
      "buildStrategy": "local",
      "imageConfig": {
        "imageType": "enterprise",
        "registryId": "reg-1",
        "build": { "dockerfile": "Dockerfile", "repository": "ns/app" }
      }
    }
  ]
}
```

### Function image constraints (official schema highlights)

- If `runtime = CustomImage`, both `buildStrategy` and `imageConfig` are required.
- If `buildStrategy = image`, `imageConfig.imageUri` is required.
- If `buildStrategy = cloud` or `local`, `imageConfig.build` is required.
- If `buildStrategy = local`, `imageConfig.build.repository` is also required.
- For enterprise image paths (`imageType = enterprise` with image build flows),
  registry identity is required (`registryId` or `build.registryId`).

There is also a top-level conditional rule in the official schema:
- In personal cloud image build scenarios (e.g. `buildStrategy = cloud` + `imageType = personal`),
  top-level `envId` becomes required.

## Other resource sections (schema quick view)

- `database`: currently constrained to `type = postgresql`; supports `migrations` path.
- `hosting`: per-entry `name` required; supports `root`, `framework`, `installCommand`,
  `buildCommand`, `outputDir`, `deployPath`, `envVariables`, `ignore`.
- `app`: supports `root`, `serviceName`, `framework`, `installCommand`, `buildCommand`,
  `outputDir`, `deployPath`, `envVariables`, `ignore`.
- `gateway`: built around `routes[]`; each route requires `path` and `target`, with
  protocol/auth/QPS-related constraints.

## Template variables

The parser renders `{{env.*}}` and `{{tcb.*}}` template variables, loading
`.env` / `.env.local` / `.env.<mode>` from the project root.
Keep secrets in env files, never hard-coded in `cloudbaserc`.

## Validation

`deploy` / `deployPlan` run schema validation after parsing. If it fails you get a message
like:

```text
cloudbaserc 配置校验未通过：<fieldPath> <reason>; ...
```

Fix the reported field(s) and re-run `deployPlan`.
