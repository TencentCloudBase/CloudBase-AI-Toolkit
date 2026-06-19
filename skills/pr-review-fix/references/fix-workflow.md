# PR Fix Workflow

## Pre-flight

1. Note the current branch name:
   ```bash
   git branch --show-current
   ```

2. Stash any uncommitted changes:
   ```bash
   git stash
   ```

3. Fetch latest:
   ```bash
   git fetch github
   ```

## Fix loop (per PR)

### Step 1 — Switch to PR branch

```bash
git checkout -B <branch-name> github/<branch-name>
```

### Step 2 — Reproduce locally

Run the same pipeline as CI:

```bash
cd mcp
npm ci           # clean install (match CI)
npm run build    # webpack build
npm run test     # vitest
```

Capture the exact error output — this is your fix target.

### Step 3 — Analyze root cause

Common patterns in this project:

| Error pattern | Likely cause | Fix approach |
|--------------|-------------|--------------|
| `debug(msg, string)` not assignable to `(msg, Error)` | Wrong argument type passed to debug helper | Wrap with `new Error()` or pass Error object directly |
| `ReferenceError: x is not defined` | Variable declared in block scope, referenced outside | Move declaration to shared scope |
| `TS2345: Argument of type X not assignable to Y` | Type mismatch after refactoring | Fix the type or cast appropriately |
| Duplicate function definition | Refactoring left behind old inline copy | Remove the duplicate, use the module-level one |
| Path validation rejects valid paths | Edge case in `startsWith` check (e.g., root `/`) | Normalize prefix with `path.sep` guard |
| Test timeout | Async test missing `await` or env var | Add `await` or use `test.skipIf` for env-dependent tests |

### Step 4 — Apply fix

- Keep changes minimal — fix only what's broken.
- Don't mix refactoring with bug fixes.
- If multiple issues exist, fix them all in one commit (per PR).

### Step 5 — Verify locally

```bash
cd mcp
npm run build    # must pass cleanly
npm run test     # all tests must pass
```

If build or test fails, go back to Step 3.

### Step 6 — Commit

Use conventional-changelog format with emoji:

```bash
git add <changed-files>
git commit -m 'fix(<scope>): 🔧 <english description of what was fixed>'
```

Scope examples:
- `cloudrun` — changes to cloudrun.ts
- `security` — security-related fixes
- `code-quality` — type fixes, dead code removal
- `database` — database-related changes
- `test` — test fixes

### Step 7 — Push

```bash
git push github <branch-name>
```

**Never** force-push unless explicitly asked.

### Step 8 — Return to original branch

```bash
git checkout <original-branch>
git stash pop   # only if we stashed in pre-flight
```

## Multi-PR session

When fixing multiple PRs in one session:

1. Complete the full fix loop for PR A before starting PR B.
2. Track progress with a checklist.
3. Only stash once at the beginning; pop once at the end.
4. If fixing PR B requires changes that conflict with PR A's branch, note it and proceed carefully.

## Post-fix verification

After pushing all fixes:

```bash
# Check CI status for each fixed PR
gh pr checks <number>
```

Wait ~2-3 minutes for CI to pick up the new commit.

If CI still fails:
1. Re-read the failure
2. Determine if it's the same issue or a new one
3. Loop back to Step 2

## Completion summary template

```
## PR Fix Session — <date>

### Fixed:
- ✅ PR #NNN (<branch>) — <what was fixed> — commit <hash>
- ✅ PR #NNN (<branch>) — <what was fixed> — commit <hash>

### Still needs attention:
- ⚠️ PR #NNN — <reason>

### CI verification:
- PR #NNN: ✅ passing
- PR #NNN: ⏳ waiting for CI
```
