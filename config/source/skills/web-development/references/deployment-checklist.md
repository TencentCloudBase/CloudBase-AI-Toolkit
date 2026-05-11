# ⚠️ MANDATORY: Subdirectory Deployment Checklist

**You MUST complete ALL steps below before calling `uploadFiles` for subdirectory deployment. Skipping any step will cause 404 errors.**

---

## Pre-Deployment (MUST complete in order)

### Step 1: Read and confirm build configuration
**Action**: Read `vite.config.ts` (or `next.config.js`, `vue.config.js`, `webpack.config.js`)

**Check**:
- [ ] `base` (Vite) / `publicPath` (Webpack/Vue) / `assetPrefix` (Next.js) is set
- [ ] Value is `'/your-subdirectory/'` format (absolute path, leading AND trailing slashes)
- [ ] NOT `./`, NOT `''`, NOT `'your-subdirectory'` (missing slashes)

**Example (Vite)**:
```ts
// vite.config.ts
export default defineConfig({
  base: '/vite-test/',  // ✓ Correct
  // base: './',         // ✗ WRONG - causes 404
  // base: '',           // ✗ WRONG - deploys to root
  // base: 'vite-test', // ✗ WRONG - missing slashes
})
```

**YOU MUST OUTPUT**: "Step 1 completed: read vite.config.ts, base is set to '/vite-test/'"

---

### Step 2: Rebuild after config change
**Action**: Run build command (e.g., `npm run build`)

**Check**:
- [ ] Build command was run AFTER changing config
- [ ] Build completed successfully (zero errors)
- [ ] `dist/` (or build output dir) contains updated files

**YOU MUST OUTPUT**: "Step 2 completed: rebuilt project with `npm run build`"

---

### Step 3: Verify build output paths
**Action**: Read `dist/index.html` (or equivalent build output)

**Check**:
- [ ] Resource references use `/your-subdirectory/...` format
- [ ] Example: `<script src="/vite-test/assets/index.js">` ✓
- [ ] NOT `<script src="/assets/index.js">` (missing prefix)
- [ ] NOT `<script src="./assets/index.js">` (relative path)

**YOU MUST OUTPUT**: "Step 3 completed: verified dist/index.html references paths correctly (e.g., /vite-test/assets/...)"

---

### Step 4: Confirm upload scope
**Action**: Prepare `uploadFiles` call

**Check**:
- [ ] `localPath` points to ENTIRE build directory (e.g., `/path/to/dist`)
- [ ] NOT `localPath: '/path/to/dist/index.html'` (only uploads one file)
- [ ] `cloudPath` has NO leading `/` (e.g., `'vite-test'`, NOT `'/vite-test'`)
- [ ] `cloudPath` matches the `base` config (e.g., base `'/vite-test/'` → cloudPath `'vite-test'`)

**YOU MUST OUTPUT**: "Step 4 completed: localPath='/path/to/dist', cloudPath='vite-test' (no leading /)"

---

### Step 5: Output pre-deployment confirmation
**Action**: Before calling `uploadFiles`, output ALL of the above confirmations in your response.

**Template**:
```
Pre-deployment checklist (subdirectory deployment):
✓ Step 1: Read vite.config.ts, base is set to '/vite-test/'
✓ Step 2: Rebuilt project with `npm run build`
✓ Step 3: Verified dist/index.html references paths correctly
✓ Step 4: localPath='/path/to/dist', cloudPath='vite-test' (no leading /)
→ Now calling uploadFiles...
```

**DO NOT CALL `uploadFiles` without this confirmation output.**

---

## Post-Upload Verification (MUST complete)

### Step 6: Verify uploaded files
**Action**: Call `findFiles` with prefix matching your `cloudPath`

**Check**:
- [ ] `findFiles({ prefix: 'vite-test/' })` returns results
- [ ] Results include `index.html`
- [ ] Results include JS/CSS/assets (not just index.html)
- [ ] If only `index.html` exists → upload is INCOMPLETE, re-check `localPath`

**YOU MUST OUTPUT**: "Step 6 completed: verified uploaded files exist via findFiles"

---

## Common 404 Causes

1. **`base: './'` in Vite**: When URL lacks trailing slash (e.g., `/vite-test`), relative paths resolve incorrectly
2. **Missing rebuild**: Changed `base` but didn't re-run build → old paths in dist/
3. **Only uploaded index.html**: Forgot to set `localPath` to dist/ directory → JS/CSS missing
4. **`cloudPath` with leading `/`**: Causes incorrect path mapping in hosting
5. **URL without trailing slash**: Always access with trailing slash, or configure server redirects

---

## Framework-Specific Notes

### Vite
- Config: `base` in `vite.config.ts`
- See `../frameworks.md` for detailed examples

### Next.js
- Config: `assetPrefix` in `next.config.js`
- Also set `basePath` if using App Router

### Vue CLI
- Config: `publicPath` in `vue.config.js`

### Webpack
- Config: `output.publicPath` in `webpack.config.js`
