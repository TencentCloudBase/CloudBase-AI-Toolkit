# Framework Guidance

## React

- Follow the existing router, data-fetching, and component patterns already used by the repo.
- Prefer focused page and component changes over broad refactors.
- Keep state close to where it is used unless the project already relies on shared state primitives.
- For form, navigation, and async UI bugs, verify the behavior in browser after code changes.

## Vue

- Respect the existing composition style in the repo, such as Composition API or Options API.
- Keep template, script, and style responsibilities clear instead of mixing unrelated logic into one large SFC.
- When changing reactive state or watchers, verify the actual rendered behavior rather than assuming the code path is enough.

## Vite

- Treat Vite as the default choice for new Web app setup unless the repo already standardizes on another bundler.
- Keep environment-specific values in `.env` or the project's existing config pattern instead of hardcoding them into UI files.
- **Subdirectory deployment base config (most common Vite 404 cause):**
  - When deploying to a subdirectory like `/vite-test`, set `base: '/vite-test/'` in `vite.config.ts` — absolute path with leading AND trailing slash.
  - **NEVER use `base: './'` or `base: ''`** for subdirectory deployments. When the browser accesses `https://domain.com/vite-test` (no trailing slash), relative paths resolve to `/` instead of `/vite-test/`, causing all JS/CSS assets to 404.
  - After changing `base`, you MUST rebuild (`vite build`) before uploading — the built `dist/` files must reference assets with the subdirectory prefix.
  - When uploading with `uploadFiles`, set `cloudPath` to the subdirectory without a leading slash (e.g. `vite-test`, not `/vite-test`).
- Check route base paths, asset paths, and build output behavior before deployment.

## Routing and build defaults

- Use the existing router if present; do not switch routing libraries without an explicit requirement.
- For purely static hosting environments, prefer hash routing when server rewrite support is absent or unknown.
- Make build and preview commands explicit before handing off deployment steps.
