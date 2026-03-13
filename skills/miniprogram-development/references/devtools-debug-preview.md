# WeChat DevTools Debug and Preview

This reference covers debugging, preview, and publishing workflows for WeChat Mini Program projects, with and without WeChat Developer Tools.

## When to read this reference

Read this file when the task involves:

- WeChat Developer Tools
- simulator or real-device debugging
- preview or publish workflows
- project opening or `project.config.json`
- no-DevTools fallback workflows
- `miniprogram-ci`

## 1. With WeChat Developer Tools

WeChat Developer Tools should be the primary path for local debugging and preview when available.

### Before opening the project

- Confirm `project.config.json` exists
- Confirm `appid` is available for real preview, upload, or publish workflows
- Confirm `miniprogramRoot` points to the correct source directory
- Confirm referenced local assets and cloud function directories actually exist

### Recommended debugging workflow

- Use the **simulator** for quick interaction checks
- Use **custom compile** when you need controlled launch parameters or scene-based testing
- Use the built-in debug panels to inspect runtime state:
  - Console
  - Network
  - Storage
  - Sources
  - WXML / component structure
- Use **auto preview** to shorten feedback loops when iterating
- Use **real-device preview** and **remote debugging** for cases where simulator behavior may differ

### Preview and publish guidance

- Open the project from the directory containing `project.config.json`
- Validate configuration, resource files, and page configs before preview
- Prefer real-device verification before publishing

### Version-awareness guidance

- When behavior differences are suspicious, check the WeChat Developer Tools stable release notes page
- Treat DevTools version differences as a possible cause when preview, compile, or debug behavior changes unexpectedly

## 2. Without WeChat Developer Tools

When WeChat Developer Tools is unavailable, use `miniprogram-ci` as the main fallback for build, preview, and upload workflows.

### What `miniprogram-ci` can do

According to the official CI documentation, `miniprogram-ci` can be used without opening WeChat Developer Tools for:

- preview
- upload
- npm build
- cloud function upload
- CloudBase hosting or storage related upload flows

### Required prerequisites

Before using `miniprogram-ci`, prepare:

- `appid`
- project path
- code upload private key
- IP whitelist configuration

The official docs state that preview and upload permissions depend on the code upload key and IP whitelist configuration in the WeChat public platform.

### Typical fallback usage

- Use `miniprogram-ci preview` for preview generation
- Use `miniprogram-ci upload` for code upload
- Use `miniprogram-ci pack-npm` when npm build is needed

### Key limitation

`miniprogram-ci` can replace parts of preview, upload, and automation workflows, but it does **not** fully replace the panel-based debugging experience inside WeChat Developer Tools.

## 3. Practical guidance when no DevTools is available

If WeChat Developer Tools cannot be used:

- rely more on code-level logging and error handling
- use `miniprogram-ci` for preview and upload automation
- verify behavior on real devices whenever possible
- treat the lack of simulator and runtime panels as a debugging limitation, not just a tooling inconvenience

## 4. Suggested agent behavior

When the user has WeChat Developer Tools:

- prefer tool-based simulator, panel inspection, preview, and remote debugging guidance

When the user does not have WeChat Developer Tools:

- switch to `miniprogram-ci` for preview/upload/build guidance
- clearly explain which debugging capabilities are missing without DevTools

## 5. Official references

- WeChat Developer Tools release notes: `https://developers.weixin.qq.com/miniprogram/dev/devtools/log.html#stable`
- WeChat Mini Program CI: `https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html`
