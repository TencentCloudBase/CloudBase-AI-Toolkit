# Browser Validation (with `agent-browser`)

This file is the concrete playbook for the `agent-browser` tool. Use it whenever the Engineering constitution in `SKILL.md` says "verify in the browser before claiming done".

Code reading, static types, and a clean build are **necessary but not sufficient**. Any change that affects what the user sees, clicks, or navigates must be opened in a real browser and exercised.

## When `agent-browser` is required (not optional)

Trigger browser validation for changes that touch any of:

- **Routing / navigation** — new routes, redirects, route guards, 404s, hash vs history mode, nested layouts
- **Forms** — submit handlers, controlled inputs, validation errors, disabled states, file uploads
- **Auth flows** — sign in, sign up, logout, session guards, token refresh, `getSession`
- **Async UI** — loading spinners, skeletons, error banners, retry buttons, streaming responses
- **Conditional rendering** — empty states, permission-gated sections, feature flags
- **Third-party SDK calls from the browser** — CloudBase Web SDK (auth, database, AI model, storage), analytics, payment

Skip browser validation only for pure build-config edits, README / documentation-only changes, backend-only work, or changes guarded by CI tests you verified pass.

## When `agent-browser` is NOT the right tool

- Pure visual direction / aesthetic exploration → use the `ui-design` skill first.
- Backend-only logic that never renders in the browser → use unit tests or direct API calls.
- Smoke-testing a production URL against real user credentials → do not automate; ask the user.

## Standard workflow

Follow these steps in order. Do not skip the "before the fix" reproduction — it is what proves the bug was real and that your change actually fixed it.

1. **Start the app** (or confirm it is already running).
   - Typical: `npm run dev` / `pnpm dev` / `vite`. Record the local URL (often `http://localhost:5173`).
   - If the project uses a build-and-serve flow instead of a dev server, document the exact commands you ran.
2. **Open the target route with `agent-browser`**, starting from the entry URL, not deep-linking into private pages unless you already have a valid session.
3. **Reproduce the current (pre-fix or pre-feature) behavior.** Capture: route, user action, observed outcome, console errors if any. This is the baseline.
4. **Apply the code change.** Rely on HMR where available; otherwise rebuild.
5. **Re-run the exact same flow in the browser.** Capture the new observed outcome.
6. **Check adjacent routes you touched** — if you edited a shared component or route guard, visit at least one other page that depends on it.
7. **Inspect the browser console for new warnings / errors** introduced by your change (React hydration mismatches, missing keys, uncaught promise rejections, CloudBase SDK init errors, etc.). New noise is a regression even if the happy path works.

## What to record in the final summary

For each flow you exercised, report:

- **Route** — e.g. `/login`, `/dashboard?tab=usage`
- **Action** — e.g. "Submitted the phone+code form with a valid code"
- **Expected** — e.g. "Redirect to `/dashboard` and show user's nickname"
- **Before** — e.g. "Stayed on `/login`; console showed `auth/invalid-session`"
- **After** — e.g. "Redirected to `/dashboard`; nickname rendered; no new console errors"
- **Gap (if any)** — e.g. "Did not test WeChat login branch because no test account available"

A one-liner like "tested in browser, works" is not acceptable evidence.

## Common CloudBase-specific flows worth validating

- **Auth**: sign-in page → success → protected route accessible; sign-out → same protected route redirects to `/login`.
- **AI model**: eligibility gate passes → `generateText` returns text → `streamText` incrementally updates UI → error path (invalid model name) surfaces a user-visible message, not a silent failure.
- **Database queries**: list page with pagination → empty state → after create, the new row appears without a hard refresh.
- **Static hosting deploy**: for a deployed build, confirm the root route, one sub-route (refresh directly on it — hash vs history matters), and one 404 route.

## Common mistakes to avoid

- Claiming a frontend bug is fixed without actually opening the browser.
- Verifying only the happy path when the reported bug is about empty states, validation errors, or route refresh.
- Catching and swallowing console errors instead of understanding them.
- Using `agent-browser` for aesthetic / visual direction work that should have gone through `ui-design`.
- Skipping the adjacent-routes check after editing a shared component or route guard.
- Using an old cached dev-server instance after a config change — restart the dev server if you modified `vite.config.*`, env vars, or TS path aliases.

## Escalation

If you cannot complete browser validation because of missing credentials, a missing backend, a paid external API, or a blocker in the local environment, do not paper over it. State exactly what you were unable to verify and what the user needs to supply. Partial verification with a named gap is acceptable; silent omission is not.
