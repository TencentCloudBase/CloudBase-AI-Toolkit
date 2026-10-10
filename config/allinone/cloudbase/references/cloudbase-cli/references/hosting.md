# Hosting — CloudBase CLI

Deploy pre-built static files (HTML/CSS/JS) to CloudBase CDN hosting.
Hosting = pre-built static files with CDN; for framework build + deploy, use `app` instead.

## When to Use

- Deploying pre-built static files to CloudBase CDN hosting
- Managing hosted files: listing, downloading, or deleting
- Setting up a static website or SPA with CDN acceleration
- Need fine-grained control over individual file deployment

## Do NOT use for

- Web app deployment with framework auto-detection and build — use `app`
- File storage with ACL rules — use `storage`
- Cloud functions — use `functions`
- Containerized services — use `cloudrun`

---

## Workflow 1: Deploy Static Site

```bash
# 1. Confirm target environment
tcb env list

# 2. Build locally first
npm run build

# 3. Deploy built assets (hosting must already be enabled)
tcb hosting deploy ./dist --env-id <envId>

# 4. Verify
tcb hosting list --env-id <envId>
```

> `tcb hosting deploy` only checks the hosting status, it never enables the service. If hosting is not enabled, the command fails and the environment owner must enable it in the CloudBase console first. If the service was just enabled and is still initializing (`init` / `process`), the command waits until it reports `online` (checks every 5 seconds, up to about 6 minutes) and then uploads.

### Deploy Variations

```bash
# Deploy current directory
tcb hosting deploy --env-id <envId>

# Deploy to a sub-path
tcb hosting deploy ./dist /v2 --env-id <envId>

# Deploy a single file
tcb hosting deploy ./index.html --env-id <envId>

# Update only one file (incremental)
tcb hosting deploy ./dist/index.html /index.html --env-id <envId>

# CI/CD: non-interactive with JSON output
tcb hosting deploy ./dist --env-id $ENV_ID --json
```

> ⚠️ Deploy overwrites existing files at the same path. There is no built-in versioning — consider cleaning old files before redeploying.

### Deploying to a Shared Bucket Environment

Platforms that create many environments under one account may keep hosting files for all of them in one shared COS bucket, each environment under its own BasePath. The bucket is chosen by the platform when hosting is enabled and cannot be changed afterwards; the CLI has no flag for it.

- Keep writing `cloudPath` as a plain path (`./dist app`). The CLI adds the BasePath, and the hosting domain resolves it too, so site URLs use the plain path — adding the BasePath to a URL returns 404.

---

## Workflow 2: Safe Deletion

```bash
# 1. Always preview first
tcb hosting delete --dry-run --env-id <envId>

# 2. Delete a specific file
tcb hosting delete path/to/file --env-id <envId> --yes

# 3. Delete a directory
tcb hosting delete path/to/dir --dir --env-id <envId> --yes
```

> ⚠️ Always use `--dry-run` first before bulk deletions.

> ⚠️ CDN cache delay: deleted files may remain accessible for 5-10 minutes. Flush CDN cache in console if needed.

### Clean Redeploy Pattern

```bash
# Preview what will be deleted
tcb hosting delete --dry-run --env-id <envId>

# Delete all hosted files
tcb hosting delete --env-id <envId> --yes

# Deploy fresh build
tcb hosting deploy ./dist --env-id <envId>
```

---

## Workflow 3: List and Download

### List files (with pagination)

```bash
# List all files
tcb hosting list --env-id <envId>

# Paginated listing
tcb hosting list --env-id <envId> --limit 10 --offset 20

# JSON output
tcb hosting list --env-id <envId> --json
```

> ⚠️ `meta.total` in list output excludes directories (Size=0 entries) — count may seem inaccurate.

### Download files

```bash
# Download a single file
tcb hosting download path/to/file.txt --env-id <envId>

# Download to a specific local path
tcb hosting download path/to/file.txt ./local --env-id <envId>

# Download entire directory
tcb hosting download path/to/dir ./local --dir --env-id <envId>

# Download full hosting backup
tcb hosting download / ./hosting-backup --dir --env-id <envId>
```

---

## Common Options

| Option | Description |
|--------|-------------|
| `-e, --env-id <envId>` | Target environment ID |
| `--yes` | Skip interactive confirmation |
| `--json` | JSON output for scripting |
| `--dry-run` | Preview mode (delete only) |
| `-d, --dir` | Operate on directory |
| `-l, --limit <n>` | Max items returned (default 50) |
| `--offset <n>` | Skip N items (default 0) |

---

## Command Quick Reference

```bash
tcb hosting detail   --env-id <id>                    # View hosting service info
tcb hosting deploy   <localPath> [cloudPath] --env-id <id>  # Deploy files
tcb hosting delete   [cloudPath] --env-id <id>        # Delete files
tcb hosting list     --env-id <id>                    # List hosted files
tcb hosting download <cloudPath> [localPath] --env-id <id>  # Download files
```

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Hosting not enabled" | Hosting service not activated | Enable static hosting for the environment in the CloudBase console, then retry |
| `静态网站服务【初始化中】` (service initializing) | Hosting was just enabled and is not `online` yet | The deploy command already waits up to about 6 minutes; if it times out, wait a few minutes and retry |
| File still accessible after delete | CDN cache delay (5-10 min) | Wait or flush CDN cache in console |
| `meta.total` looks wrong | Directories (Size=0) excluded from count | This is expected behavior |
| Deploy has no effect | Deploying to wrong path or env | Verify `--env-id` and cloud path; run `tcb hosting list` to check |

---

## Self-Check

- [ ] `tcb` CLI installed, version >= 3.0.0
- [ ] Logged in (`tcb login`) and correct environment set (`tcb env use <envId>`)
- [ ] Static hosting already enabled for the environment (the CLI does not enable it)
- [ ] On a shared hosting bucket, `cloudPath` is written as a plain path with no BasePath
- [ ] Build output ready locally before deploying (e.g. `npm run build` completed)
- [ ] For deletion: previewed with `--dry-run` first
- [ ] For CI/CD: `--env-id` specified (deletions also need `--yes`)
- [ ] CDN cache delay considered (5-10 min after updates/deletions)
