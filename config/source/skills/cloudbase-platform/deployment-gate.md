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
| ICP filing completed                | Cannot bind domain                  | Complete ICP filing or choose alternative    |
| SSL certificate obtained + certificateId available | Binding fails                    | Retrieve certificateId from SSL console      |

**Critical distinction**:
- Security Domain (`envDomainManagement`) ≠ Custom Domain (`manageGateway` bindCustomDomain action)

### CloudRun (Container Services)

| Check Item                          | Consequence if Missing              | Required Action                              |
|-------------------------------------|-------------------------------------|----------------------------------------------|
| Application port matches Dockerfile / code | Startup failure or 502           | Confirm listening port (commonly 9000)       |
| Health check path correctly configured | Frequent restarts / unhealthy     | Set correct path (e.g. `/` or `/health`)     |
| Required environment variables and secrets injected | Runtime errors                 | Configure via console or MCP before deploy   |

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

## Mandatory Declaration Template

Before starting any deployment-related work, you must output something like this and wait for user confirmation:

> This deployment has the following prerequisites. Please confirm:
> - [ ] Plan supports required features (custom domain, CloudRun, etc.)
> - [ ] ICP filing and SSL certificate ready (if using custom domain)
> - [ ] CloudRun port and health check configured
> - [ ] Mini program upload IP whitelist updated (if applicable)
> - [ ] Function / hosting security rules configured for public access
>
> Any missing item above will very likely cause deployment failure. Proceed?

## Usage Instruction

When the task involves deployment, publishing, custom domains, CloudRun, or public exposure:

> Before any deployment or publish action, you must first complete the full checks in `cloudbase-platform/deployment-gate.md` and present the declaration template to the user.
