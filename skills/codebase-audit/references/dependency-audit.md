# Dependency Security Audit

## Overview

This reference covers how to discover, triage, and fix dependency-level security vulnerabilities reported by GitHub Dependabot (or `npm audit`). It complements the source-code review in `review-strategy.md`.

## Step 1 — Fetch alerts

### GitHub Dependabot alerts (preferred)

```bash
gh api repos/<owner>/<repo>/dependabot/alerts \
  --jq '.[] | select(.state=="open") | {number, severity: .security_vulnerability.severity, package: .dependency.package.name, ecosystem: .dependency.package.ecosystem, summary: .security_advisory.summary, ghsa: .security_advisory.ghsa_id, patched: .security_vulnerability.first_patched_version.identifier, manifest: .dependency.manifest_path}' \
  | cat
```

### npm audit (fallback / local)

```bash
cd <project-root> && npm audit --json 2>/dev/null | head -500
```

Use Dependabot alerts as the primary source — they track advisory state and dismissal. `npm audit` is a supplementary check for unlisted transitive issues.

## Step 2 — Aggregate & prioritise

1. **Group by package** — multiple alerts for the same package should be fixed together.
2. **Sort groups by highest severity** within the group:
   - **Critical** → fix immediately
   - **High** → fix in current session
   - **Medium** → fix if straightforward, otherwise create issue
   - **Low** → create issue for tracking, may dismiss with justification
3. **Identify dependency depth** — determine whether the vulnerable package is a direct or transitive dependency:
   ```bash
   npm ls <package-name> 2>/dev/null | head -20
   ```
4. **Check current locked version**:
   ```bash
   jq '.packages | to_entries[] | select(.key | contains("<package-name>")) | {key, version: .value.version}' package-lock.json
   ```

## Step 3 — Choose fix strategy

Use this decision tree for each package group:

```
Is the package a direct dependency?
├─ YES → Can we upgrade to a patched version without breaking changes?
│        ├─ YES → Strategy A: Direct upgrade
│        └─ NO  → Is the package still maintained?
│                  ├─ YES → Strategy B: Major version upgrade (check changelog for breaking changes)
│                  └─ NO  → Strategy C: Replace with alternative package
└─ NO (transitive) → Can the parent dependency be upgraded to pull in the fix?
                      ├─ YES → Strategy A: Upgrade parent dependency
                      └─ NO  → Strategy D: npm overrides
```

### Strategy A — Direct upgrade

```bash
npm install <package>@<patched-version> --save       # direct dep
npm install <parent-package>@<latest> --save          # transitive via parent
npm audit fix                                          # let npm attempt auto-fix
```

After upgrade, verify:
```bash
npm ls <package-name>           # confirm version resolved
npm run build && npm run test   # confirm no breakage
```

### Strategy B — Major version upgrade

1. Read the package changelog / migration guide.
2. Identify breaking changes relevant to current usage.
3. Update call sites as needed.
4. Run full build + test.

### Strategy C — Replace with alternative

1. Identify an actively maintained alternative with equivalent functionality.
2. Update import paths and usage across the codebase.
3. Remove the old package: `npm uninstall <old-package>`.
4. Run full build + test.

### Strategy D — npm overrides (transitive only)

When the parent package hasn't released a fix, use `overrides` in `package.json`:

```json
{
  "overrides": {
    "<vulnerable-package>": "<patched-version>"
  }
}
```

For scoped transitive overrides (only override within a specific parent):

```json
{
  "overrides": {
    "<parent-package>": {
      "<vulnerable-package>": "<patched-version>"
    }
  }
}
```

After adding overrides:
```bash
rm -rf node_modules package-lock.json
npm install
npm ls <vulnerable-package>     # confirm override applied
npm run build && npm run test   # confirm no breakage
```

> **Caution**: Overrides can break the parent package if the patched version has incompatible API changes. Always test thoroughly.

### Strategy E — Dismiss with justification

If the vulnerability is **not exploitable** in the project's context (e.g., a server-side ReDoS in a package only used at build time with trusted input), dismiss the alert:

```bash
gh api repos/<owner>/<repo>/dependabot/alerts/<number> \
  -X PATCH \
  -f state=dismissed \
  -f dismissed_reason="not_used" \
  -f dismissed_comment="<explanation of why this is not exploitable in our context>"
```

Valid `dismissed_reason` values: `fix_started`, `inaccurate`, `no_bandwidth`, `not_used`, `tolerable_risk`.

> **Rule**: Never dismiss Critical or High alerts without explicit user approval.

## Step 4 — Execute fixes

Follow the same worktree isolation process as `worktree-fix.md`:

1. Create a single worktree + branch for all dependency fixes (they typically go in one PR):
   ```bash
   git worktree add ../<repo>-dep-fix -b fix/security-vulnerabilities-<issue-number> origin/main
   cd ../<repo>-dep-fix
   ```
2. Apply fixes (upgrade / override / replace).
3. Regenerate lockfile: `npm install`.
4. Verify: `npm run build && npm run test`.
5. Commit:
   ```bash
   git add package.json package-lock.json
   git commit -m 'fix(deps): 🔒 upgrade vulnerable dependencies

   Closes #<issue-number>'
   ```
6. If code changes were needed (strategy B/C), commit them separately with descriptive messages.
7. Push and create PR.

## Step 5 — Verify resolution

After the PR is merged:

```bash
gh api repos/<owner>/<repo>/dependabot/alerts \
  --jq '[.[] | select(.state=="open")] | length'
```

Expected: the count should decrease by the number of fixed alerts.

Also re-run:
```bash
npm audit
```

## Recording findings

For each vulnerable dependency group, record:

```
Package: <name>
Alerts: #<number1>, #<number2>, ...
Severity: <Critical|High|Medium|Low> (highest in group)
Current version: <locked version>
Patched version: <target version>
Dependency depth: <direct|transitive via X>
Strategy: <A|B|C|D|E>
Status: <fixed|dismissed|deferred>
Notes: <any context>
```

## Common patterns

| Package type | Typical fix |
|---|---|
| Direct devDependency (test/build tools) | Usually safe to upgrade to latest; low risk of runtime breakage |
| Direct production dependency | Check changelog carefully; may need code changes |
| Deeply nested transitive | npm overrides; or upgrade the nearest direct ancestor |
| Unmaintained package | Replace with maintained fork/alternative |
| Build-time only vulnerability | Often dismissible if input is trusted (e.g., template compilation at build time) |
