# Deployment Gate

**Mandatory pre-check** for any deployment, release, public exposure, custom domain, CloudRun, or mini program upload/publish operations.

## When to Apply

You must read and complete this gate before:
- Deploying or updating CloudRun services
- Binding custom domains or enabling HTTPS
- Publishing static hosting
- Uploading or publishing mini programs via miniprogram-ci
- Exposing cloud functions or HTTP services publicly

**Rule**: Never proceed with deployment actions until you have checked the relevant items below and obtained user confirmation on all gaps.

## Pre-Check Tables by Scenario

### Custom Domain / HTTPS Access

| Check Item                          | Consequence if Missing              | Required Action                              |
|-------------------------------------|-------------------------------------|----------------------------------------------|
| Environment plan supports custom domains | Feature unavailable, repeated errors | Verify current plan tier                     |
| Existing custom domain reusable?    | Unnecessary re-bind / cert prompts  | `queryGateway(listCustomDomains)` first; if one exists, `createRoute(domain=...)` — no certificateId |
| ICP filing completed                | Cannot bind **new** domain          | Complete ICP filing or choose alternative    |
| SSL certificate obtained + certificateId available | **New** domain bind fails        | Only when first-time `bindCustomDomain`; retrieve certificateId from SSL console |

**Critical distinction**:
- Security Domain (`envDomainManagement`) ≠ Custom Domain (`manageGateway` Domain/Route)
- Reusing an existing custom domain = `createRoute` (no cert). Binding a brand-new custom domain = `bindCustomDomain` (needs certificateId).

### CloudRun (Container Services)

| Check Item                          | Consequence if Missing              | Required Action                              |
|-------------------------------------|-------------------------------------|----------------------------------------------|
| Application port matches Dockerfile / code | Startup failure or 502           | Confirm listening port (commonly 9000)       |
| Health check path correctly configured | Frequent restarts / unhealthy     | Set correct path (e.g. `/` or `/health`)     |
| Required environment variables and secrets injected | Runtime errors                 | Configure via console or MCP before deploy   |
| No httpbin / header-echo / env-dump endpoints | `x-cloudbase-context` temporary credentials leak to callers | Follow `sensitive-runtime-data-protection.md`; health checks must return fixed non-secret payloads only |
| TCP DB/cache dependency detected (`DATABASE_URL`, MySQL/PG/Redis host) | Deploy succeeds but runtime cannot reach DB | Set `serverConfig.VpcConf` to the DB's VPC/subnet; use private DB host; see `cloudrun-development/references/vpc-and-database.md` |
| `OpenAccessTypes` vs `VpcConf` understood | Agent configures public ingress but omits private network | Ingress (`OpenAccessTypes`) ≠ egress VPC (`VpcConf`); both may be required |

### Static Website Hosting

| Check Item                          | Consequence if Missing              | Required Action                              |
|-------------------------------------|-------------------------------------|----------------------------------------------|
| Content-Disposition / caching headers suitable for public web access | Files download instead of render | Verify ACL and response headers              |
| Custom domain required              | Must complete domain + SSL checks first | Warn user before starting                    |

### Mini Program Upload / Publish (miniprogram-ci)

| Check Item                          | Consequence if Missing              | Required Action                              |
|-------------------------------------|-------------------------------------|----------------------------------------------|
| Upload IP added to mini program whitelist | Upload rejected                  | Add current egress IP in WeChat backend      |
| AppID matches target environment    | Publishing to wrong app             | Double-check `project.config.json`           |

### Cloud Functions Public Exposure / HTTP Access

| Check Item                          | Consequence if Missing              | Required Action                              |
|-------------------------------------|-------------------------------------|----------------------------------------------|
| Function security rule configured to allow required callers | `EXCEED_AUTHORITY` errors     | Configure via `managePermissions` immediately after creation |
| Anonymous login status understood   | Public access unexpectedly blocked  | Explicitly inform user (disabled by default on new environments) |
| Responses do not echo headers / env / `x-cloudbase-context` | Temporary credential leak     | Follow `sensitive-runtime-data-protection.md` before public exposure |
| Non-native TCP DB/cache env (`DATABASE_URL`, MySQL/PG/Redis host) without `vpc` | Deploy succeeds but runtime cannot reach private DB | Set real `vpc.vpcId` + `vpc.subnetId` from DB console / resource detail / user — never invent IDs; see `cloud-functions/references/vpc-and-tcp-database.md`. Native `app.rdb()` / `app.database()` does not need VPC. |

## Mandatory Declaration Template

Before starting any deployment-related work, you must output something like this and wait for user confirmation:

> This deployment has the following prerequisites. Please confirm:
> - [ ] Plan supports required features (custom domain, CloudRun, etc.)
> - [ ] ICP filing and SSL certificate ready (if using custom domain)
> - [ ] CloudRun port and health check configured
> - [ ] If CloudRun or cloud functions use TCP MySQL/PostgreSQL/Redis (non-native SDK): real VPC + subnet IDs + private DB endpoint ready (do not invent IDs)
> - [ ] Mini program upload IP whitelist updated (if applicable)
> - [ ] Function / hosting security rules configured for public access
>
> Any missing item above will very likely cause deployment failure. Proceed?

## Usage Instruction

When the task involves deployment, publishing, custom domains, CloudRun, or public exposure:

> Before any deployment or publish action, you must first complete the full checks in `cloudbase-platform/references/protocols/deployment-gate.md` and present the declaration template to the user.
