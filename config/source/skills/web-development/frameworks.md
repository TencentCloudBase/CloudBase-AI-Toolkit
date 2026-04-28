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

### Subdirectory deployment (CRITICAL)

When deploying to a CloudBase static hosting subdirectory (e.g., `cloudPath: 'my-app'`), the `base` config in `vite.config.ts` MUST be set correctly:

```typescript
// vite.config.ts
export default defineConfig({
  base: '/my-app/', // MUST match deployment path: absolute path with leading and trailing slashes
  // ... other config
})
```

**Key rules:**
- `base` MUST be an absolute path like `/my-app/` (with leading and trailing slashes)
- **FORBIDDEN**: `base: './'` or `base: ''` - these cause 404 errors when URL is accessed without trailing slash
- After changing `base`, ALWAYS rebuild: `npm run build`
- Verify `dist/index.html` has correct asset paths: `<script src="/my-app/assets/...">`

**Why absolute paths are required:**
When accessing `https://domain.com/my-app` (without trailing slash), relative paths like `./assets/index.js` resolve to `https://domain.com/assets/index.js` (missing `/my-app/`), causing 404. Absolute paths like `/my-app/assets/index.js` always resolve correctly.

## Routing and build defaults

- Use the existing router if present; do not switch routing libraries without an explicit requirement.
- For purely static hosting environments, prefer hash routing when server rewrite support is absent or unknown.
- Make build and preview commands explicit before handing off deployment steps.
