---
description: "@cloudbase/npm-launcher package"
globs: "*"
alwaysApply: true
---

# @cloudbase/npm-launcher

独立 npm 包，不进根 `pnpm-workspace.yaml`：零依赖、单文件、用 `npm publish` 在本目录单独发布，避免改动 `pnpm-lock.yaml` 与供应链策略。

## 真源

- 入口 `index.js`（CommonJS，零依赖，Node >= 18）。`package.json` 的 `files` 只含 `index.js` / `README.md` / `LICENSE`；`AGENTS.md` 与测试不进包。
- 版本固定 `1.0.0`。**本包尽量不再发版**：客户端配置引用固定版本，每发一次新版，所有用户都要重写一次自己的 `_npx` 目录。
- 目标包仍可写 `@latest`，由 launcher 在后台解析版本号并装进 `versions/<版本号>/`。

## 设计红线

1. **stdout 是 MCP 的 JSON-RPC 通道**：npm 的 stdout/stderr 一律 pipe 后写 `install.log`，只有目标包进程用 `stdio: "inherit"`。
2. **不共用 node_modules**：每个进程用自己的 `.tmp-<pid>-<ts>` 安装，成功后 `renameSync` 到 `versions/<version>`。目标已存在时先判 `binOf()`，另一个进程装好就直接复用。
3. **`current` 必须原子替换**：写 `<current>.<pid>` 再 rename，绝不原地覆写。
4. **锁只防重复下载，不保证正确性**：`mkdir` 抢锁，超时视为残留；抢不到锁最多多等一轮，不能因此失败退出。
5. **任何一步失败都继续用旧版本**，只有首次安装且拿不到任何可用版本才 `exit(1)`。
6. **删除前先改名**：Windows 上文件被占用时 rename 会失败，跳过即可，别删出半个目录。
7. **用 `process.execPath` 启动目标包**，不碰 `.cmd` / `.ps1` shim；并转发 SIGINT / SIGTERM / SIGHUP。
8. `KEEP` 不要设太小：长跑的窗口可能在用到旧版本，目录被清掉后懒加载模块会报错。
9. **遥测**：默认开启，`NGE_TELEMETRY=0` 只关网络上报，`events.jsonl` 始终写本地。只报灯塔已登记的 12 个键（事件 `toolkit_launcher`）——**新增字段必须先登记**，否则被网关静默丢弃。上报 fire-and-forget、1 秒超时、前台退出路径不等网络；测试与 CI 一律关闭对外上报，遥测专项只发本地接收端（`NGE_TELEMETRY_ENDPOINT`）。

10. **在用的版本不能删**：每次启动给当前版本登记 pid 租约，prune 跳过仍有存活进程的租约；进程退出或 pid 已死就回收。锁目录也写 pid，进程已退出立刻抢锁，不再等满 10 分钟 mtime。
11. **前台首装只有一个总时限**：`DEADLINE` 贯穿 npm view / npm install / rename 退避；等锁失败只上报一次，不每 500ms 刷一条。

## 未实现的可选项

「发版后立刻生效」需要前台等待 `lockedUpdate` 10–15 秒，会拖慢启动、可能撞上客户端超时。当前实现按「后台更新、下次启动生效」处理；若以后要加，开关需按客户端 timeout 定。

## 验证

`npm test` 跑 `tests/concurrency.test.mjs` + `tests/behaviour.test.mjs` + `tests/telemetry.test.mjs` + `tests/hardening.test.mjs`（都用 `NGE_ROOT` 指到临时目录；`mock-registry.mjs` 用纯 JS 生成 tarball，不依赖系统 `tar` 或外网；遥测专项用本地 HTTP 接收端）。本机 macOS 实测 11/11 + 20/20 + 29/29 + 15/15 通过（75 项）（含 20 并发 + 中途发版）。CI 见 `.github/workflows/npm-launcher-ci.yml`：ubuntu / macOS / Windows 三平台，Windows 跳过 POSIX 信号转发，job 级 `NGE_TELEMETRY=0` 防止测试产生真实上报。另有 `.github/workflows/npm-launcher-nightly.yml`（手动 + 每周一）：三平台 × npm 10/11 跑 `tests/real-package-smoke.mjs`，真实下载 `@cloudbase/cloudbase-mcp@latest` 验冷启动；**nightly 不进 PR 门禁**，包未发布前脚本用 `node index.js` 直跑，publish 后要切到 npx 路径再验一次。发布前仍建议在真实 Windows 客户端上验一次 EPERM / EBUSY，以及新版 npm 并发锁的重试行为。

## 发布

workflow：`.github/workflows/npm-launcher-publish.yml`。

**触发**：打 tag `npm-launcher-v<package.json 的 version>`；也可在 main 上手动 dispatch，`dry_run=true` 只跑门禁和打包、不发版。从 feature 分支手动触发会被跳过。

**发版前四步**（顺序不能省）：

1. 改 `package.json` 的 `version`。
2. 同步固定版本引用，共 6 处：`config/source/editor-config/files/codex.toml`、`connectors/cloudbase/mcp.json`、`connectors/cloudbase/SUBMISSION.md`、`doc/ide-setup/_template.mdx`、`doc/en/ide-setup/_template.mdx`、`npm-launcher/README.md`。稳定版发版有门禁，漏改会直接失败；beta 版有意豁免。
3. 重跑产物链：`build:rules-sync` → `update:compat-baseline` → `check:compat-diff` → `build:connector`。
4. 提交合并到 main，再打 tag。**每次发版都让所有客户端重写自己的 `_npx` 目录，connector 还要重新提审**，动手前先确认确实需要发。

**认证分两段**：

- **首次发布**：npm 只允许给「已存在的包」配 trusted publisher，所以先在 GitHub 仓库配 secret `NPM_LAUNCHER_TOKEN`（granular access token，bypass 2FA）。
- **包存在之后**：在 npmjs.com 的包设置里加 Trusted Publisher —— GitHub Actions，org `TencentCloudBase`、repo `CloudBase-AI-Toolkit`、workflow filename `npm-launcher-publish.yml`（只填文件名、区分大小写）、允许 `npm publish`；然后删掉 secret，之后自动走 OIDC + provenance。`package.json.repository` 已填且必须与仓库匹配，别删。

**门禁**：tag 与版本一致、`node --check`、`npm test`（75 项）、`npm pack --dry-run --json` 断言恰好 4 个文件、registry 幂等检查（同版本重跑不会 403）。

**发布后** `verify` job：直连 `registry.npmjs.org` 轮询收录（最多 15 分钟，别信本机 `.npmrc` 镜像），再经 `npx -y @cloudbase/npm-launcher@<version>` 跑 `tests/real-package-smoke.mjs`（`NGE_SMOKE_LAUNCHER_SPEC`），这是唯一覆盖 launcher 自身经 npx 冷启动的验证。
