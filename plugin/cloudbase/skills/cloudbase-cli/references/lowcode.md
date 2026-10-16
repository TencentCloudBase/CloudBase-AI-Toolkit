# Low-code / WeDa (`tcb lowcode`)

`tcb lowcode` drives the **WeDa 低代码 (微搭)** toolchain: low-code **apps** and **components**
(自定义组件) — build, local preview, debug in WeChat DevTools, publish, version.

## When to Use

- The user explicitly works with **微搭 / WeDa low-code** projects
- Building or previewing a low-code **app** locally
- Creating / building / publishing a low-code **component**
- Managing low-code dependencies

## Do NOT use for

- CloudBase-native web apps (framework build + CDN) → `app.md` / `hosting.md`
- Cloud functions → `functions.md`
- Containerised services → `cloudrun.md`
- Anything that is not a WeDa low-code project — **most CloudBase tasks do not need this module**

> ⚠️ This is a **different product surface** from the rest of the CLI. Do not reach for `tcb lowcode`
> just because the task mentions "app" — confirm with the user that the project really is a 微搭
> low-code project first. Several commands also expect a Windows/macOS WeChat DevTools installation
> (`--wx-devtool-path`), which CI does not have.

---

## App commands

```bash
tcb lowcode watch                     # build in watch mode (local dev loop)
tcb lowcode watch -p ./src --force-install
tcb lowcode watch --wx-devtool-path <path>

tcb lowcode build:app                 # build the low-code app
tcb lowcode build:app --clean --out ./dist

tcb lowcode preview:app               # preview in WeChat DevTools
tcb lowcode preview:app --platform <platform> --wx-devtool-path <path>

tcb lowcode build:app-config          # generate the app config bundle
tcb lowcode build:app-config --out ./out --build-type-list <list> --domain <domain>

tcb lowcode publish:app               # publish the app
tcb lowcode publish:app --src ./dist --sync-cloud

tcb lowcode sync                      # sync low-code sources
```

## Component commands

```bash
tcb lowcode create my-component       # scaffold a component
tcb lowcode create my-component --skip-validate

tcb lowcode build                     # build the component
tcb lowcode debug                     # debug the component
tcb lowcode debug --debug-port 9229 --wx-devtool-path <path>

tcb lowcode publish                   # publish the component
tcb lowcode publish --admin

tcb lowcode publishVersion            # publish a new component version
tcb lowcode publishVersion --comment "fix" --tag latest --admin
```

## Dependencies

```bash
tcb lowcode deps                      # install low-code dependencies
tcb lowcode deps --force --registry https://registry.npmjs.org
```

---

## Command Quick Reference

```bash
tcb lowcode watch                      # App: local watch/build
tcb lowcode build:app [--clean --out <dir>]
tcb lowcode preview:app [--platform <p>]
tcb lowcode build:app-config [--out <dir>]
tcb lowcode publish:app [--src <dir> --sync-cloud]
tcb lowcode sync

tcb lowcode create <name>              # Component: scaffold
tcb lowcode build | debug | publish
tcb lowcode publishVersion [--comment <c>] [--tag <t>] [--admin]

tcb lowcode deps [--force] [--registry <url>]
```

> ℹ️ `tcb lowcode` **is** listed in `tcb --help`, but the `build:app` / `preview:app` /
> `build:app-config` / `publish:app` names use a colon — some shells and docs render them oddly.
> Copy them exactly.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Cannot find WeChat DevTools | `preview:app` / `debug` need it installed | Install DevTools and pass `--wx-devtool-path <path>`; not available in CI |
| `publish` asks for admin | The account lacks publishing rights | Use `--admin` only with an admin account, or ask the owner |
| Component build fails after editing | Stale deps | Re-run `tcb lowcode deps --force` |
| Wrong project targeted | Project is not a 微搭 project | Confirm with the user; use `app.md` / `hosting.md` for CloudBase-native web apps |

---

## Self-Check

- [ ] Confirmed the project really is a **WeDa low-code** project (not a CloudBase web app)?
- [ ] For `preview:app` / `debug`: is WeChat DevTools available (not a headless CI box)?
- [ ] For `publish:app` / `publishVersion`: does the user have publish rights, and did they approve?
- [ ] Used `--out` / `--src` explicitly rather than relying on defaults?
