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

# 2. Check hosting status (auto-enables if not active)
tcb hosting detail --env-id <envId>

# 3. Build locally first
npm run build

# 4. Deploy built assets
tcb hosting deploy ./dist --env-id <envId> --yes

# 5. Verify
tcb hosting list --env-id <envId>
```

### Deploy Variations

```bash
# Deploy current directory
tcb hosting deploy --env-id <envId> --yes

# Deploy to a sub-path
tcb hosting deploy ./dist /v2 --env-id <envId> --yes

# Deploy a single file
tcb hosting deploy ./index.html --env-id <envId> --yes

# Update only one file (incremental)
tcb hosting deploy ./dist/index.html /index.html --env-id <envId> --yes

# CI/CD: non-interactive with JSON output
tcb hosting deploy ./dist --env-id $ENV_ID --yes --json
```

> ⚠️ Deploy overwrites existing files at the same path. There is no built-in versioning — consider cleaning old files before redeploying.

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
tcb hosting deploy ./dist --env-id <envId> --yes
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
| "Hosting not enabled" | Hosting service not activated | Run `tcb hosting detail -e <envId>` to auto-enable |
| File still accessible after delete | CDN cache delay (5-10 min) | Wait or flush CDN cache in console |
| `meta.total` looks wrong | Directories (Size=0) excluded from count | This is expected behavior |
| Deploy has no effect | Deploying to wrong path or env | Verify `--env-id` and cloud path; run `tcb hosting list` to check |

---

## Self-Check

- [ ] `tcb` CLI installed, version >= 3.0.0
- [ ] Logged in (`tcb login`) and correct environment set (`tcb env use <envId>`)
- [ ] Hosting service enabled (`tcb hosting detail --env-id <envId>`)
- [ ] Build output ready locally before deploying (e.g. `npm run build` completed)
- [ ] For deletion: previewed with `--dry-run` first
- [ ] For CI/CD: `--env-id` + `--yes` both specified
- [ ] CDN cache delay considered (5-10 min after updates/deletions)
