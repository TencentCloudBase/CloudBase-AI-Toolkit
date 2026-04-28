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

## Routing and build defaults

- Use the existing router if present; do not switch routing libraries without an explicit requirement.
- For purely static hosting environments, prefer hash routing when server rewrite support is absent or unknown.
- Make build and preview commands explicit before handing off deployment steps.

## Vite base config for subdirectory deployment

When deploying a Vite app to a CloudBase static hosting subdirectory (e.g. `/vite-test/`):

1. Set `base` in `vite.config.ts` to the **absolute** subdirectory path with leading and trailing slashes:
   ```js
   // vite.config.ts — deploying to /vite-test/
   export default defineConfig({
     base: '/vite-test/',  // MUST be absolute, NOT './' or ''
   })
   ```
2. **NEVER** use `base: './'` or `base: ''` for subdirectory deployment. Relative paths break when the access URL does not end with `/`, causing all JS/CSS assets to 404.
3. After changing `base`, you MUST run `npm run build` again and verify that `dist/index.html` contains asset paths like `/vite-test/assets/xxx.js` rather than `/assets/xxx.js` or `./assets/xxx.js`.
4. When calling `uploadFiles`, use `cloudPath: 'vite-test'` (no leading `/`) and `localPath` pointing to the `dist/` directory.
