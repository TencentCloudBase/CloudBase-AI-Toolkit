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

### Vite base configuration for subdirectory deployment

When deploying to a subdirectory (e.g., `https://example.com/vite-test/`), the Vite `base` configuration is critical:

1. **Required format**: Set `base` to an absolute path with leading and trailing slashes, matching the deployment path:
   ```js
   // vite.config.ts
   export default defineConfig({
     base: '/vite-test/',  // Correct: absolute path with leading and trailing slashes
   })
   ```

2. **Forbidden patterns** - These will cause 404 errors when URL lacks trailing slash:
   ```js
   base: './',      // WRONG: relative path breaks when URL is /vite-test (no trailing slash)
   base: '',        // WRONG: empty base means root deployment
   base: 'vite-test', // WRONG: missing leading and trailing slashes
   ```

3. **Why this matters**: When a user accesses `https://example.com/vite-test` (without trailing slash), relative paths like `./assets/index.js` resolve to `https://example.com/assets/index.js` instead of `https://example.com/vite-test/assets/index.js`, causing 404 errors.

4. **Pre-deployment checklist**:
   - [ ] `vite.config.ts` has `base: '/your-subdirectory/'` set correctly
   - [ ] Build command has been re-run after config change
   - [ ] Built `dist/index.html` references assets with correct paths (e.g., `/vite-test/assets/...`)

## Routing and build defaults

- Use the existing router if present; do not switch routing libraries without an explicit requirement.
- For purely static hosting environments, prefer hash routing when server rewrite support is absent or unknown.
- Make build and preview commands explicit before handing off deployment steps.
