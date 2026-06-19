# Common Pitfalls in WeChat Mini Program Development

This file captures high-frequency mistakes observed in real projects. Use these as pre-flight checks before generating code.

## 1. Optional Chaining (`?.`) and Modern Syntax

**Problem**: Many base libraries and WeChat DevTools versions do not support optional chaining (`obj?.prop`) or nullish coalescing (`??`).

**Correct approach**:
- Use traditional `if` checks or `&&` / `||` patterns.
- Prefer `wx.getSystemInfoSync()` + version checks only when truly needed.

**Example to avoid**:
```js
const name = user?.name ?? 'Guest';   // Often breaks
```

**Safe alternative**:
```js
const name = (user && user.name) || 'Guest';
```

## 2. TDesign Component Styling (Especially `::after`)

**Problem**: TDesign components use pseudo-elements for borders, icons, and states. Overriding with simple class selectors often fails.

**Key points**:
- Use CSS custom properties (variables) provided by TDesign when possible.
- Target `::after` and `::before` carefully with high specificity or `!important` only as last resort.
- Test on real device — DevTools preview can hide rendering differences.

**Recommended pattern**:
```css
/* Prefer variables first */
.t-button {
  --td-button-border-color: transparent;
}

/* Only fall back to ::after when necessary */
.custom-cell::after {
  border-color: var(--td-border-color, #e5e5e5) !important;
}
```

## 3. Canvas in Mini Games + Cloud Storage Permissions

**Problem**: Canvas drawing + saving to cloud storage frequently fails due to permission or context issues.

**Checklist**:
- Use `wx.createCanvasContext` (2D) or `wx.createOffscreenCanvas` correctly for the target base lib.
- Request `scope.writePhotosAlbum` or use `canvasToTempFilePath` + `wx.cloud.uploadFile` with proper auth.
- For cloud storage, ensure the file path uses the correct env and the storage permission rule allows the openid or role.

**Common failure**:
Saving canvas as image then uploading without handling the temporary file path correctly.

## 4. Environment & Code Configuration Drift

**Problem**: Developer tools environment does not match the actual cloud environment used in code.

**Prevention**:
- Always verify `project.config.json` → `cloudbaseRoot` and `appid`.
- Use `wx.cloud.init({ env: 'your-real-env-id' })` explicitly.
- After changing cloud environment in DevTools, restart the simulator.
- For CI/CD with `miniprogram-ci`, the IP whitelist must include the build machine.

## 5. General Recommendation

When generating mini program code that touches CloudBase:
1. Read this pitfalls file first.
2. Apply the Change Safety Protocol before any modification.
3. For upload/publish flows, complete the Deployment Gate checklist.

This keeps the skill defensive and reduces repeated correction loops.
