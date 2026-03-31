# Review Strategy

## Scope

Default target: `mcp/src/` (all TypeScript files). The user can override this.

Before starting, confirm the scope:
```bash
find <target-dir> -name '*.ts' -not -path '*/node_modules/*' | wc -l
```

## Approach

Use the `code-explorer` subagent for large-scale file reading. Send it a prompt that covers ALL files and ALL categories in one pass. Do NOT sample — read every file.

If the target has more than 50 files, split into batches by subdirectory and launch parallel subagents.

## Review checklist

For **every** file, check each category below. Not every category applies to every file — skip inapplicable ones but never skip a file.

### 1. Security (Critical priority)

| Check | What to look for |
|-------|-----------------|
| Path traversal | User-controlled paths not validated with `path.resolve` + prefix check |
| Command injection | String interpolation in `exec()`, `execSync()`, shell commands |
| SQL/NoSQL injection | Unparameterized queries with user input |
| Hardcoded secrets | API keys, tokens, passwords in source code |
| Improper error exposure | Stack traces, internal paths, or secrets in error messages returned to clients |
| Missing input validation | Tool parameters accepted without type/range/format checks |
| Prototype pollution | Unchecked `Object.assign`, spread of user-controlled objects |
| SSRF | User-controlled URLs fetched without allowlist validation |
| Vulnerable dependencies | Known CVEs in direct or transitive dependencies (see `dependency-audit.md`) |

### 2. Error handling (High priority)

| Check | What to look for |
|-------|-----------------|
| Missing try-catch | Async operations without error handling |
| Swallowed errors | `catch` blocks that log but don't rethrow or return error state |
| Generic catch | `catch(e)` that loses error type information |
| Missing finally | Resources opened but not cleaned up on error path |
| Error message quality | Error messages that don't help diagnose the problem |

### 3. Type safety (Medium priority)

| Check | What to look for |
|-------|-----------------|
| `as any` | Unsafe type casts that bypass type checking |
| Missing null checks | Optional values used without `?.` or explicit null check |
| Implicit any | Function parameters or returns without type annotations |
| Incorrect generics | Generic types that don't match actual usage |
| Union type narrowing | Missing type guards before accessing union-specific properties |

### 4. Logic bugs (High priority)

| Check | What to look for |
|-------|-----------------|
| Race conditions | Shared mutable state accessed from async code without synchronization |
| Off-by-one | Loop bounds, slice indices, pagination offsets |
| Unreachable code | Code after unconditional return/throw |
| Incorrect conditionals | Flipped boolean logic, wrong comparison operators |
| Missing edge cases | Empty arrays, zero values, undefined, boundary conditions |
| Dead code | Functions or branches that are never called/reached |

### 5. Code quality (Medium priority)

| Check | What to look for |
|-------|-----------------|
| Duplication | Same logic repeated in multiple places |
| Complexity | Functions > 50 lines, deeply nested conditionals |
| Naming | Misleading variable/function names |
| Inconsistency | Different patterns for the same operation across files |
| Magic values | Hardcoded numbers or strings without explanation |

### 6. Resource management (High priority)

| Check | What to look for |
|-------|-----------------|
| Unclosed connections | Database, HTTP, or file handles not closed |
| Missing cleanup | Temporary files, directories not removed |
| Memory leaks | Growing collections without bounds, event listeners not removed |
| Timeout management | Missing timeouts on network operations |

### 7. API design (Medium priority)

| Check | What to look for |
|-------|-----------------|
| Inconsistent validation | Some tools validate input, others don't |
| Missing required fields | Required parameters not checked at entry |
| Return type inconsistency | Same operation returns different shapes in different code paths |
| Error response format | Inconsistent error formats across tools |

## Recording findings

For each finding, capture:

```
File: <path>
Lines: <start>-<end>
Category: <Security|Error handling|Type safety|Logic|Quality|Resource|API>
Severity: <Critical|High|Medium|Low>
Title: <one-line summary>
Description: <what's wrong and why it matters>
Suggested fix: <concrete code change or approach>
```

Group related findings (same root cause across files) into a single entry with multiple locations listed.
