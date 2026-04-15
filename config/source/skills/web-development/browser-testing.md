# Browser Validation

Use `agent-browser` when the task depends on what actually happens in the browser, especially for:

- routing and page navigation
- form submission and validation
- modal, drawer, and tab interactions
- login flow checks
- post-fix smoke tests for rendering or event bugs
- runtime behaviors that may surface through console errors, network failures, or blocked backend dependencies

## Default workflow

1. Open the relevant page or start from the entry route.
2. Reproduce the changed or broken interaction deliberately.
3. Note the pre-fix behavior and any relevant console, network, or runtime evidence when the browser surfaces it.
4. Apply the fix in code.
5. Re-run the same browser flow and one adjacent smoke interaction such as refresh, revisit, or retry when it matters.
6. Note any remaining gap if the full flow is blocked by missing data, credentials, backend dependencies, or environment setup.

## What to capture

- route or page opened
- user action taken
- expected result
- actual result before the fix
- actual result after the fix
- console, network, or runtime evidence when relevant
- any remaining blocker or follow-up risk

## Common mistakes

- Claiming a frontend bug is fixed without checking the actual browser behavior.
- Verifying only the happy path when the bug is triggered by navigation, refresh, empty states, validation errors, or retry flows.
- Ignoring console or network evidence when the changed flow depends on auth, data loading, or backend calls.
- Using browser automation for purely visual direction work that should have gone through `ui-design` first.
