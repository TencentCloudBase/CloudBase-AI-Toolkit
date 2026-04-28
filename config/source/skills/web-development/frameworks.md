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

### Vite subdirectory deployment

**When deploying to a subdirectory (e.g., `/vite-test`), configure `base` in `vite.config.ts`:**

```typescript
// vite.config.ts
export default defineConfig({
  base: '/vite-test/',  // MUST include leading AND trailing slash
  // ... other config
})
```

**Common mistakes:**
- ❌ `base: './'` — Relative path causes 404 when URL lacks trailing slash
- ❌ `base: '/vite-test'` — Missing trailing slash causes asset path issues
- ❌ `base: ''` — Same as `/`, wrong for subdirectory

**After changing base:**
1. Run `npm run build` (or your build command)
2. Verify `dist/index.html` contains `<script src="/vite-test/assets/...">` not `<script src="/assets/...">`
3. Deploy with `uploadFiles` cloudPath set to `'vite-test'` (no leading slash)

## Routing and build defaults

- Use the existing router if present; do not switch routing libraries without an explicit requirement.
- For purely static hosting environments, prefer hash routing when server rewrite support is absent or unknown.
- Make build and preview commands explicit before handing off deployment steps.
