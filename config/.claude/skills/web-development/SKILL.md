---
name: web-development
description: Use when users need to implement, integrate, debug, build, deploy, or validate a Web frontend after the product direction is already clear, especially for React, Vue, Vite, browser flows, or CloudBase Web integration.
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

# Web Development

## Activation Contract

### Use this first when

- The request is to implement, integrate, debug, build, deploy, or validate a Web frontend or static site.
- The design direction is already decided, or the user is asking for engineering execution rather than visual exploration.
- The work involves React, Vue, Vite, routing, browser-based verification, or CloudBase Web integration.

### Read before writing code if

- The task includes project structure, framework conventions, build config, deployment, routing, or frontend test and validation flows.
- The request includes UI implementation but the visual direction is already fixed; otherwise read `ui-design` first.

### Then also read

- General React / Vue / Vite guidance -> `frameworks.md`
- Browser flow checks or page validation -> `browser-testing.md`
- Login flow -> `../auth-tool/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-tool/SKILL.md`), then `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`)
- CloudBase database work -> matching database skill

### Do NOT use for

- Visual direction setting, prototype-first design work, or pure aesthetic exploration.
- Mini programs, native Apps, or backend-only services.

### Common mistakes / gotchas

- Starting implementation before clarifying whether the task is design or engineering execution.
- Mixing framework setup, deployment, and CloudBase integration concerns into one vague change.
- Treating cloud functions as the default solution for Web authentication.
- Skipping browser-level validation after a UI or routing change.
- In an existing application, detouring into UI redesign or broad repo sweeps before patching the current handlers and services.

## When to use this skill

Use this skill for Web engineering work such as:

- Implementing React or Vue pages and components
- Setting up or maintaining Vite-based frontend projects
- Handling routing, data loading, forms, and build configuration
- Running browser-based validation and smoke checks
- Integrating CloudBase Web SDK and static hosting when the project needs CloudBase capabilities

**Do NOT use for:**
- UI direction or visual system design only; use `ui-design`
- Mini program development; use `miniprogram-development`
- Backend service implementation; use `cloudrun-development` or `cloud-functions`

## How to use this skill (for a coding agent)

1. **Clarify the execution surface**
   - Confirm whether the task is framework setup, page implementation, debugging, deployment, validation, or CloudBase integration.
   - Keep the work scoped to the actual Web app surface instead of spreading into unrelated backend changes.
   - If the workspace is an existing application with TODOs, treat it as a targeted repair task, not a greenfield build.

2. **Follow framework and build conventions**
   - Prefer the existing project stack if one already exists.
   - For new work, treat Vite as the default bundler unless the repo or user constraints say otherwise.
   - Put reusable app code under `src` and build output under `dist` unless the repo already uses a different convention.
   - In an existing application with fixed structure, inspect the files that already own the flow before reading broad docs: `src/lib/backend.*`, `src/lib/auth.*`, `src/lib/*service.*`, route guards, and the page handlers bound to submit buttons.

3. **Validate through the browser, not only by reading code**
   - For interaction, routing, rendering, or regression checks, use `agent-browser` workflows from `browser-testing.md`.
   - Prefer lightweight smoke validation for changed flows before claiming the frontend work is complete.

4. **Treat CloudBase as an integration branch**
   - Use CloudBase Web SDK and static hosting guidance only when the project actually needs CloudBase platform features.
   - Reuse `auth-tool` and `auth-web` for login or provider readiness instead of re-describing those flows here.

## Core workflow

### 1. Choose the right engineering path

- **React / Vue feature work**: implement within the app's existing component, routing, and state conventions
- **New Web app**: prefer Vite unless the repo already standardizes on another toolchain
- **Debugging and regressions**: reproduce in browser, narrow to a specific page or interaction, then patch
- **CloudBase integration**: wire in Web SDK, auth, data, or static hosting only after the base frontend path is clear

### 2. Keep implementation grounded in project reality

- Follow the repo's package manager, scripts, and lint/test patterns
- Avoid framework rewrites unless the user explicitly asks for one
- Prefer the smallest viable page/component/config change that satisfies the task
- In TODO-based apps, complete the existing implementation directly instead of creating parallel helpers, sample pages, or detached prototypes

### 3. Validate changed flows explicitly

- Run the relevant local build or test command when available
- Open the affected page or flow in a browser when behavior depends on rendering, interaction, or navigation
- Record what was checked: route, action, expected result, and any remaining gap

## CloudBase Web integration

Use this section only when the Web project needs CloudBase platform features.

### Web SDK rules

- Prefer npm installation for React, Vue, Vite, and other bundler-based projects
- Use the CDN only for static HTML pages, quick demos, embedded snippets, or README examples
- Only use documented CloudBase Web SDK APIs; do not invent methods or options
- Keep a shared `app` or `auth` instance instead of re-initializing on every call
- If the user only provides an environment alias, nickname, or other shorthand, resolve it to the canonical full `EnvId` before writing SDK init code, console links, or config files. Do not pass alias-like short forms directly into `cloudbase.init({ env })`.

### Authentication boundary

- Authentication must use CloudBase SDK built-in features
- Do not move Web login logic into cloud functions
- For provider readiness, login method setup, or publishable key issues, route to `auth-tool` and `auth-web`

### Static hosting defaults

- Build before deployment
- Prefer relative asset paths for static hosting compatibility
- Use hash routing by default when the project lacks server-side route rewrites
- If the user does not specify a root path, avoid deploying directly to the site root by default

### CloudBase quick start

```js
// npm install @cloudbase/js-sdk
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "your-full-env-id", // Canonical full CloudBase environment ID resolved from envQuery or the console
});

const auth = app.auth();
```
