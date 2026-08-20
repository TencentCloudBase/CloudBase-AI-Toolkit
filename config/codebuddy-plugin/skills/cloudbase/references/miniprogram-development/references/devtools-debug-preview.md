# WeChat DevTools Debug and Preview

This reference covers debugging, preview, publishing, and daily CloudBase ops for WeChat Mini Program projects via **WeChat Developer Tools Nightly Skills** (`wechatide`), plus fallbacks when Nightly is unavailable.

Also read [WeChat IDE Skills vs CloudBase MCP](wxide-vs-cloudbase-mcp.md) for when to use which stack.

## When to read this reference

Read this file when the task involves:

- WeChat Developer Tools / Nightly / `wechatide`
- simulator, console, network, or real-device debugging
- preview, upload, or publish flows
- opening a project / `project.config.json` / `appid`
- daily cloud ops (NoSQL, cloud functions, cloud storage) through DevTools login
- no-DevTools fallback with `miniprogram-ci`

## 0. Prerequisite: Nightly Build (built-in Skills / MCP)

WeChat IDE Skills and the matching DevTools MCP surface ship with **WeChat Developer Tools Nightly (开发版)**, not as a separate `npx` package.

- Download / changelog: https://developers.weixin.qq.com/miniprogram/dev/devtools/nightly_backup.html
- After installing Nightly you should have:
  - CLI: `wechatide` (often on PATH)
  - Built-in skill pack (macOS example):
    `/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/miniprogram-dev-skill`
  - Windows (typical): under the DevTools install dir, `resources/app.asar.unpacked/miniprogram-dev-skill`
- **Having “WeChat Developer Tools” installed does not guarantee Skills.** If `wechatide` is missing or the skill directory is absent, ask the user to install **Nightly** first.
- Nightly is a daily build: faster features/fixes, possibly less stable than Stable. Use it when you need the AI Skills / MCP workflow.

## 1. Preferred path: `wechatide` (Nightly Skills)

Atomic execution entry for DevTools workflows:

```bash
wechatide -c <clientName> -t <toolName> [flags...]
```

### Required context (do not invent)

| Context | Meaning |
| --- | --- |
| `-c <clientName>` | Current AI client short name (e.g. `CodeBuddy`, `Claude`, `Cursor`) |
| `--project` | Absolute path to the directory that contains `project.config.json` |
| `appid` | Required before open-window / preview / upload; read from `project.config.json` |
| `env` | Cloud env ID for cloud tools; if unknown, call `cloud_env_list` first — never guess |

Discover parameters (do **not** invent tool names or flag shapes):

```bash
wechatide
wechatide -c <clientName> -t <toolName> --help
```

Tool registry inside Nightly skill pack:

- `miniprogram-tools/references/tools.yaml`
- Scene skills: `skills/{initializer,debugger,automator,compiler,previewer,cloudbase-operator,project-manager}/SKILL.md`

If the agent has already loaded the Nightly root skill (`miniprogram-dev-skill/SKILL.md`), follow that pack’s routing. Otherwise use this reference for path + priority, then open the built-in scene skill for details.

### Session bootstrap (once per session)

1. Confirm `wechatide` exists (`which wechatide` / `wechatide`).
2. Read Nightly pack `skill.yaml` top-level `version` (do not hard-code).
3. Check login / skill version:

```bash
wechatide -c <clientName> -t check_devtools_status --skill-version <versionFromSkillYaml>
```

| Result | Action |
| --- | --- |
| Response contains `openid` | Ready; do not repeat this check every tool call |
| `warning` about skill version | Reinstall / sync skill from DevTools built-in path, then recheck |
| No `openid` | Run `wechatide -c <clientName> -t scan_login`, wait for user scan, recheck |
| `command not found` | Install Nightly; ensure `wechatide` is on PATH |
| Connect / auth errors | `wechatide auth -c <clientName>`, then retry |

### Before opening a project window

- Confirm `project.config.json` exists
- Confirm `appid` is present and valid for preview/upload
- Confirm `miniprogramRoot` points at the real source tree
- Confirm referenced assets / cloud function dirs exist when relevant

Then open / compile / navigate via Nightly tools (see scene skills). Example pattern:

```bash
wechatide -c <clientName> -t project_open_window --project <absProjectPath>
wechatide -c <clientName> -t simulator_open_page --project <absProjectPath> --page pages/index/index
```

### Capability map (categories only)

| Category | Typical tools (names only) | Use when |
| --- | --- | --- |
| project | `project_list`, `project_open_window`, `project_setting_*` | Import / open / settings |
| compile | `compile_js`, `compile_wxml`, `compile_wxss`, `buildnpm` | Compile / npm |
| simulator | `simulator_open_page`, `simulator_refresh` | Open page / refresh |
| preview | `auto_preview`, `create_preview_qrcode` | Device preview |
| automation | `automation_*` | Click / assert / screenshot |
| debug | `get_app_console_content`, `get_app_network_content`, `debug_clear_cache` | Console / network / cache |
| cloud | `cloud_env_list`, `cloud_fn_*`, `cloud_db_*`, `cloud_stor_*` | Daily CloudBase ops with WeChat login |
| publish | `miniprogram_upload` | Upload experience build |

Prefer `auto_preview` for quick phone push. Prefer `debugger` scene for console/network evidence before guessing root cause.

### Cloud ops via Nightly (daily path)

For list/query/deploy of collections, documents, cloud functions, and storage in a mini program CloudBase env:

1. Resolve `appid` + `env` (`cloud_env_list` if needed)
2. Use Nightly `cloudbase-operator` tools (`cloud_db_*`, `cloud_fn_*`, `cloud_stor_*`)
3. Write ops go through DevTools confirmation UI — wait for user approval; do not retry destructive ops after deny/timeout

Do **not** force a separate Tencent Cloud login via CloudBase MCP for these daily ops when Nightly works. Use CloudBase MCP only for gaps (see [wxide-vs-cloudbase-mcp.md](wxide-vs-cloudbase-mcp.md)).

### Safety and failure handling

- Write ops require user confirmation in DevTools
- On tool failure: surface the raw error; do not invent alternate tool names or silent retries
- Temporary download URLs are short-lived; never commit them into source

## 2. Fallback: without Nightly / without `wechatide`

When Nightly Skills are unavailable:

1. Tell the user that Stable DevTools alone may not include Skills/MCP; recommend Nightly download page above
2. Use `miniprogram-ci` for preview / upload / npm build when keys and IP whitelist are ready
3. Use **CloudBase MCP** (IDE MCP or `mcporter`) for cloud resource ops that need a Tencent Cloud login

### What `miniprogram-ci` can do

- preview, upload, npm build, some cloud function upload flows

### Prerequisites for `miniprogram-ci`

- `appid`, project path, code upload private key, IP whitelist on WeChat MP admin

### Key limitation

`miniprogram-ci` does **not** replace simulator panels, console/network buffers, or `wechatide` automation/debug.

## 3. Suggested agent behavior

When Nightly + `wechatide` are available:

- Prefer `wechatide` for open / compile / debug / preview / daily cloud ops
- Carry `clientName`, absolute `--project`, and `appid`/`env` as required
- Look up flags with `--help` or built-in `tools.yaml` — never invent tools

When they are not:

- Fall back to `miniprogram-ci` + CloudBase MCP
- State clearly which debug capabilities are missing

## 4. Official references

- Nightly download: https://developers.weixin.qq.com/miniprogram/dev/devtools/nightly_backup.html
- DevTools release notes: https://developers.weixin.qq.com/miniprogram/dev/devtools/log.html#stable
- Mini Program CI: https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html
