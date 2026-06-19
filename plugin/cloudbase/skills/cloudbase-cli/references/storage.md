# Cloud Storage Management (`tcb storage`)

Manage CloudBase cloud storage — upload, download, delete, copy/move files, generate temp URLs, and configure ACL rules.

## When to Use

- Upload or download files to/from CloudBase cloud storage
- Delete files (single, batch, or wildcard-based)
- Generate temporary access URLs for stored files
- Copy or move files within cloud storage
- Manage storage ACL permission rules

## Do NOT use for

- Static website hosting with CDN → use `references/hosting.md`
- Web app deployment → use `references/app.md`
- Database operations → use `references/mysql.md` or `references/nosql.md`
- In-app file operations via Web/Mini-Program SDK → use `cloud-storage-web` skill
- Large-scale data migration (>10 GB) → use the console bulk-import tool

## Command Quick Reference

```
tcb storage upload        Upload local file(s) or directory
tcb storage download      Download file(s) or directory
tcb storage rm            Delete file(s) — supports wildcards and --dry-run
tcb storage list          List files in storage
tcb storage url           Get temporary access URL
tcb storage detail        Get file metadata
tcb storage cp            Copy or move files in cloud
tcb storage rules get     Get storage ACL rules
tcb storage rules update  Update storage ACL rules
```

⚠️ `storage delete`, `storage get-acl`, `storage set-acl` are **deprecated** — use the new commands:

| Old (deprecated) | New command |
|-------------------|-------------|
| `storage delete` | `storage rm` |
| `storage get-acl` | `storage rules get` |
| `storage set-acl` | `storage rules update` |

---

## Workflow 1: Upload Files

```bash
# Single file
tcb storage upload ./logo.png images/logo.png -e <envId>

# Directory (recursive)
tcb storage upload ./images images/ -e <envId>

# With retry (0-10 retries, default 1)
tcb storage upload ./images images/ --times 3 --interval 1000 -e <envId>
```

⚠️ **`cloudPath` must NOT start with `/`** — this is the #1 upload error.

```bash
# WRONG — errors with "cloudPath cannot start with /"
tcb storage upload ./logo.png /images/logo.png
# CORRECT
tcb storage upload ./logo.png images/logo.png
```

For 50+ file uploads, check `cloudbase-error.log` for partial failure details. Retry with `--times 5 --interval 1000`.

---

## Workflow 2: Download Files

```bash
# Single file
tcb storage download images/logo.png ./logo.png -e <envId>

# Directory — requires --dir
tcb storage download images/ ./images --dir -e <envId>
```

⚠️ Missing `--dir` when downloading a folder will fail or only affect one file.

---

## Workflow 3: Safe File Deletion

Always preview before executing:

```bash
# 1. Dry-run preview (no actual deletion)
tcb storage rm "*.tmp" --dry-run -e <envId>

# 2. Execute after confirming
tcb storage rm "*.tmp" --force -e <envId>
```

### Deletion patterns

```bash
tcb storage rm file.txt -e <envId>                    # Single file
tcb storage rm file1.txt file2.txt -e <envId>          # Multiple files
tcb storage rm "*.log" -e <envId>                      # Wildcard — current dir only
tcb storage rm "temp/**" -e <envId>                    # Recursive wildcard
tcb storage rm folder/ --dir -e <envId>                # Directory
```

⚠️ Wildcard patterns **must be quoted** — use `"*.log"`, not `*.log`. Unquoted globs expand against your local filesystem, not cloud storage.

⚠️ Deleting 2+ files triggers a confirmation prompt. Use `--force` to skip (required in CI/scripts).

### Wildcard rules

| Pattern | Meaning |
|---------|---------|
| `*` | Match any filename in current directory (not across `/`) |
| `**` | Match any path including `/` (recursive) |
| `?` | Match single character (not `/`) |

```bash
# Only root-level .log files
tcb storage rm "*.log" -e <envId>
# .log files in ALL directories
tcb storage rm "**/*.log" -e <envId>
```

---

## Workflow 4: Temporary URL Generation

```bash
# Default expiry: 3600 seconds
tcb storage url images/logo.png -e <envId>

# Custom expiry (1-86400 seconds)
tcb storage url data.json --expires 7200 -e <envId>
```

---

## Workflow 5: Copy and Move Files

```bash
tcb storage cp images/a.jpg backup/a.jpg -e <envId>                 # Copy
tcb storage cp old/data.json new/data.json --move -e <envId>         # Move (copy + delete source)
tcb storage cp src.txt dest.txt --force -e <envId>                   # Overwrite existing
tcb storage cp src.txt dest.txt --skip-existing -e <envId>           # Skip if exists
```

⚠️ `cp` only supports **file-level** operations, NOT directories. To copy a directory, script a loop over `tcb storage list` output and copy each file individually.

---

## Workflow 6: ACL Permission Management

```bash
# Get current rules
tcb storage rules get -e <envId>

# Set predefined ACL
tcb storage rules update --acl READONLY -e <envId>

# Set custom rules
tcb storage rules update --acl CUSTOM \
  --rule '{"read": true, "write": "auth.openid == resource.openid"}' -e <envId>
```

### Predefined ACL types

| ACL value | Read | Write | Use case |
|-----------|------|-------|----------|
| `READONLY` | Everyone | Creator + admin | Public assets (images, documents) |
| `PRIVATE` | Creator + admin | Creator + admin | User private data (default) |
| `ADMINWRITE` | Everyone | Admin only | Read-only public resources |
| `ADMINONLY` | Admin only | Admin only | Sensitive internal data |
| `CUSTOM` | Per rule | Per rule | Fine-grained access control |

### Custom rule format

```json
{ "read": <condition>, "write": <condition> }
```

At least one of `read` or `write` must be present. Condition values:
- `true` — unrestricted
- `false` — deny all
- Expression string — evaluated per request

| Variable | Description |
|----------|-------------|
| `auth.openid` | OpenID of the currently authenticated user |
| `resource.openid` | OpenID of the user who uploaded the file |

**Example rules:**

```bash
# Public read, owner-only write
--rule '{"read": true, "write": "auth.openid == resource.openid"}'

# Authenticated users only (read + write)
--rule '{"read": "auth != null", "write": "auth != null"}'

# Public read, no writes
--rule '{"read": true, "write": false}'
```

---

## Real-World Scenarios

### Static asset deploy

```bash
npm run build
tcb storage upload ./dist/ website/ -e <envId>
tcb storage rules update --acl READONLY -e <envId>
tcb storage list website/ -e <envId>          # verify
```

### Upload user content with signed URL

```bash
tcb storage upload ./uploads/avatar-001.jpg avatars/user-001.jpg -e <envId>
tcb storage url avatars/user-001.jpg --expires 3600 -e <envId>
tcb storage detail avatars/user-001.jpg -e <envId>
```

### Backup and restore files

```bash
tcb storage download backups/ ./local-backups/ --dir -e <envId>
tcb storage upload ./local-backups/ backups/ -e staging-env-xxx    # restore to different env
tcb storage list backups/ -e <envId>                                # verify file count
```

### Batch cleanup old files

```bash
tcb storage rm "temp/**" --dry-run -e <envId>    # preview
tcb storage rm "temp/**" --force -e <envId>      # execute
tcb storage rm "**/*.log" --force -e <envId>     # cross-directory cleanup
```

### Copy files for migration

```bash
tcb storage cp data/report.pdf archive/2024/report.pdf -e <envId>
tcb storage cp old-path/config.json new-path/config.json --move -e <envId>
```

---

## Common Errors

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| `cloudPath cannot start with /` | Leading `/` in cloud path | Remove the leading `/` |
| `FILE_NOT_FOUND` | File doesn't exist or wrong path | Check with `tcb storage list`; ensure no leading `/`; use `--dir` for folders |
| Partial upload (`failedCount > 0`) | Network issues on large batch | Retry: `--times 5 --interval 1000`; check `cloudbase-error.log` |
| Delete hangs in CI | Confirmation prompt blocking | Add `--force` |
| `cp` destination already exists | Target file present | Use `--force` (overwrite) or `--skip-existing` |
| `cp` silently skips subdirectories | `cp` is file-only | Loop over `tcb storage list` and copy each file |
| `command not found: delete` | Deprecated command | Use `tcb storage rm` |
| `command not found: get-acl` | Deprecated command | Use `tcb storage rules get` / `rules update` |

### JSON output key fields

| Command | Key fields |
|---------|-----------|
| `storage rm` (success) | `{ deletedCount, files }` |
| `storage rm` (not found) | `{ error: true, code: "FILE_NOT_FOUND", notFoundPaths }` |
| `storage list` | `[{ key, lastModified, eTag, size }]` + `total` |
| `storage url` | `{ url, expires }` |
| `storage detail` | `{ size, type, date, eTag }` |
| `storage rules get` | `{ acl, aclDesc, rule }` |

### Debugging tips

```bash
tcb storage detail images/logo.png -e <envId>    # check file exists + metadata
tcb storage list images/ -e <envId>               # list directory contents
tcb storage rm "temp/**" --dry-run -e <envId>     # preview before delete
tcb storage rm file.txt --json -e <envId>         # script-friendly output
```

---

## Self-Check

- [ ] `cloudPath` does NOT start with `/`?
- [ ] Used `--dry-run` before batch/wildcard deletions?
- [ ] Wildcard patterns are properly quoted in shell?
- [ ] Used new commands (`rm`, `rules get/update`) not deprecated ones?
- [ ] Used `--dir` for directory download/delete?
- [ ] Used `--force` for non-interactive CI/script usage?
- [ ] Verified result with `list` / `detail` after each operation?
