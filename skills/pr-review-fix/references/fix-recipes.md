# Common Fix Recipes

Patterns observed in this project that frequently cause CI failures or review feedback.

---

## Recipe 1: debug() type mismatch

**Symptom:**
```
TS2345: Argument of type 'string' is not assignable to parameter of type 'Error | object'
```

**Root cause:** The `debug(message, data?)` helper expects the second argument to be `Error | object`, but code passes `error.message` (a string).

**Fix:**
```typescript
// ❌ Wrong
debug('operation skipped:', error instanceof Error ? error.message : String(error));

// ✅ Correct
debug('operation skipped:', error instanceof Error ? error : new Error(String(error)));
```

---

## Recipe 2: Block-scoped variable referenced outside

**Symptom:**
```
ReferenceError: command is not defined
```

**Root cause:** Variable declared with `const` inside `if/else` block, but referenced after the block.

**Fix:** Move the declaration before the `if/else`:

```typescript
// ❌ Wrong
if (condition) {
  const value = computeA();
  doWork(value);
} else {
  const value = computeB();
  doWork(value);
}
return { result: value }; // ReferenceError!

// ✅ Correct
let value: string;
if (condition) {
  value = computeA();
  doWork(value);
} else {
  value = computeB();
  doWork(value);
}
return { result: value };
```

Or, if the value is identical in both branches, extract it:

```typescript
const value = computeShared();
if (condition) {
  doWorkA(value);
} else {
  doWorkB(value);
}
return { result: value };
```

---

## Recipe 3: Duplicate function after refactoring

**Symptom:** Module-level function exists, but an inline copy was left behind inside another function.

**Root cause:** Refactoring moved a helper to module scope but forgot to delete the old inline definition.

**Fix:** Delete the inline copy; keep only the module-level definition.

```typescript
// Module level (keep this)
function toJSONString(v: any) { ... }

// Inside another function (delete this)
const toJSONString = (v: any) => ...;  // ← remove
```

---

## Recipe 4: Path validation edge case

**Symptom:** `validateAndNormalizePath` rejects valid paths when `cwd` is the filesystem root `/`.

**Root cause:** `cwd + path.sep` produces `//` when cwd is `/`, and `normalizedPath.startsWith('//')` fails.

**Fix:**
```typescript
// ❌ Wrong
if (!normalizedPath.startsWith(cwd + path.sep) && normalizedPath !== cwd) {

// ✅ Correct
const prefix = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;
if (!normalizedPath.startsWith(prefix) && normalizedPath !== cwd) {
```

---

## Recipe 5: Test environment dependency

**Symptom:** Tests fail in CI because cloud credentials are not available.

**Root cause:** Test directly calls cloud API without checking environment.

**Fix:** Use `test.skipIf` pattern:

```typescript
// ❌ Wrong
test('should query database', async () => {
  const result = await cloudbase.query(...);
  expect(result).toBeDefined();
});

// ✅ Correct
test.skipIf(!process.env.CLOUDBASE_ENV_ID)(
  'should query database',
  async () => {
    const result = await cloudbase.query(...);
    expect(result).toBeDefined();
  }
);
```

---

## Recipe 6: Security review — input validation

**Common review feedback:** "User input should be validated before use."

**Fix patterns:**

```typescript
// Whitelist validation for dynamic identifiers
const ALLOWED = new Set(['id', 'name', 'createdAt']);
if (!ALLOWED.has(input.orderBy)) {
  throw new Error(`Invalid orderBy: ${input.orderBy}`);
}

// Path traversal prevention
const normalized = path.resolve(inputPath);
if (!normalized.startsWith(allowedBase + path.sep)) {
  throw new Error('Path traversal detected');
}

// Command injection prevention
// Never interpolate user input into shell commands
// Use spawn with argument arrays instead of exec with string
```

---

## Recipe 7: Merge conflict resolution

**Symptom:** PR shows "This branch has conflicts that must be resolved."

**Fix:**
```bash
git checkout <pr-branch>
git fetch github main
git merge github/main
# Resolve conflicts in editor
git add <resolved-files>
git commit -m 'chore: 🔀 resolve merge conflicts with main'
git push github <pr-branch>
```

**Rules:**
- Prefer `merge` over `rebase` for PR branches (preserves history).
- After resolving, always rebuild and retest.
