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
- Check route base paths, asset paths, and build output behavior before deployment.

### Vite subdirectory deployment (CRITICAL)

When deploying to a CloudBase static hosting subdirectory, the `base` config in `vite.config.ts` **must** match the deployment path:

```ts
// vite.config.ts — deploying to /vite-test
export default defineConfig({
  base: '/vite-test/', // ✅ Absolute path with leading AND trailing slash
  // base: './',       // ❌ WRONG — causes 404 when URL has no trailing slash
  // base: '',         // ❌ WRONG — same problem as './'
})
```

Rules:
- **Always use absolute path** with leading `/` and trailing `/` — e.g., `'/vite-test/'`
- **Never use `'./'`** or empty string for subdirectory deploys — relative paths break when the access URL lacks a trailing slash
- After changing `base`, **always rebuild** (`npm run build`) before uploading
- Verify the built `dist/index.html` contains paths like `/vite-test/assets/...`, not `/assets/...` or `./assets/...`

## Routing and build defaults

- Use the existing router if present; do not switch routing libraries without an explicit requirement.
- For purely static hosting environments, prefer hash routing when server rewrite support is absent or unknown.
- Make build and preview commands explicit before handing off deployment steps.
