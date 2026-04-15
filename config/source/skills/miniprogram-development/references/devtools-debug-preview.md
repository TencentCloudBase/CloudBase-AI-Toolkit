# WeChat DevTools Debug and Preview

Use this reference when the task involves debugging, previewing, uploading, publishing, or validating a WeChat Mini Program after code changes.

## When to read this reference

Read this file when any of the following is true:

- the request mentions WeChat Developer Tools
- the task requires simulator checks, preview QR codes, or real-device validation
- the task requires `miniprogram-ci` because DevTools is unavailable
- the task includes publish or upload steps

## Done criteria

Do not claim the mini program task is complete until one of these is true:

1. A DevTools or real-device preview path has been executed and the changed flow has been checked.
2. A `miniprogram-ci` preview or upload path has been executed successfully.
3. A concrete blocker is recorded, such as missing `appid`, missing private key, unavailable WeChat Developer Tools, or lack of device access.

For every verification pass, record:

- the route or page checked
- the user action taken
- the expected result
- the actual result
- any remaining blocker or follow-up risk

## Required checks before preview or upload

Before running DevTools preview or `miniprogram-ci`, confirm:

- `project.config.json` exists
- `project.config.json` contains the correct `appid`
- `project.config.json` points to the correct `miniprogramRoot`
- the mini program source and referenced assets exist under the configured root
- page-level files include required companions such as `index.json`
- if the project uses CloudBase, the environment choice and `wx.cloud` initialization path are already understood

## Preferred path: WeChat Developer Tools

Use WeChat Developer Tools first when it is available.

### Recommended workflow

1. Open the project with WeChat Developer Tools.
2. Let the project compile and fix any immediate config or asset errors.
3. Reproduce the changed flow in the simulator.
4. Use Preview to generate a QR code and verify the same flow on a real device when the task depends on device behavior, login context, permissions, or cloud data.
5. Record the checked route, interaction, and result before closing the task.

### What to check in DevTools

- routing and page navigation
- `tabBar` switching and entry pages
- asset loading and local file paths
- form submission and validation
- cloud function or `wx.cloud` interactions that depend on runtime data
- any UI change that may look correct in code but fail in the simulator or on device

## Fallback path: `miniprogram-ci`

Use `miniprogram-ci` when WeChat Developer Tools is unavailable or when the workflow needs CI automation.

### Preconditions

Before using `miniprogram-ci`, confirm:

- the WeChat public platform code-upload private key has been downloaded
- the relevant IP whitelist is configured when enabled
- the project path points at the mini program project root
- the correct `appid` is available
- npm dependencies needed for build are installed inside the `miniprogramRoot` scope when the project depends on npm packages

### Common command-line flow

```bash
miniprogram-ci preview --pp ./YOUR_PROJECT/ --pkp ./private.YOUR_APPID.key --appid YOUR_APPID --uv PACKAGE_VERSION -r 1 --qrcode-format image --qrcode-output-dest ./preview.jpg
miniprogram-ci upload --pp ./YOUR_PROJECT/ --pkp ./private.YOUR_APPID.key --appid YOUR_APPID --uv PACKAGE_VERSION -r 1
```

### Script-based flow

`miniprogram-ci` also supports script usage through `ci.Project`, `ci.preview`, and `ci.upload`.
Use the script path when the task needs repeatable automation or progress callbacks.

### Notes

- `miniprogram-ci` is extracted from WeChat Developer Tools and supports preview and upload without opening the IDE.
- When npm is involved, keep the relevant `package.json` inside the `miniprogramRoot` scope or verify the project’s npm build arrangement first.
- When `miniprogramRoot` is missing, the directory that contains `project.config.json` is treated as the mini program root.

## CloudBase-specific preview reminders

If the mini program uses CloudBase:

- make sure `wx.cloud.init` is configured once at app startup
- confirm the environment ID source before testing cloud flows
- do not treat missing preview success as purely a UI issue; check env binding, permissions, and runtime data assumptions
- if the problem becomes a live runtime diagnosis task, reroute to `ops-inspector` or the relevant CloudBase implementation skill

## Common mistakes

- claiming success after code changes without running any preview path
- skipping `project.config.json` / `appid` / `miniprogramRoot` checks
- using Web login ideas in mini program flows
- assuming DevTools and real-device behavior are always identical
- attempting `miniprogram-ci` upload without a private key or robot configuration
