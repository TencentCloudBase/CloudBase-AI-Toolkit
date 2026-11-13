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

1. **stdout 是 MCP 的 JSON-RPC 通道，launcher 自己一个字节都不写**：npm 的 stdout/stderr 一律 pipe 后写 `install.log`；后台更新进程 `stdio: "ignore"`；错误只走 `console.error`（stderr）；冷启动、首装失败、后台更新、参数错误四条路径的 stdout 必须为空或只有目标包输出。唯一例外是手动排障的 `--nge-diag`，它用 `process.stdout.write`，**绝不能写进 MCP 配置**。`tests/stdout-guard.test.mjs` 做静态检查（禁止 `console.log`、stdout 写入只能出现在 diag 分支）加五条动态路径断言，改输出行为必须跑它。
2. **不共用 node_modules**：每个进程用自己的 `.tmp-<pid>-<ts>` 安装，成功后 `renameSync` 到 `versions/<version>`。目标已存在时先判 `binOf()`，另一个进程装好就直接复用。
3. **`current` 必须原子替换**：写 `<current>.<pid>` 再 rename，绝不原地覆写。
4. **锁只防重复下载，不保证正确性**：`mkdir` 抢锁，超时视为残留；抢不到锁最多多等一轮，不能因此失败退出。
5. **任何一步失败都继续用旧版本**，只有首次安装且拿不到任何可用版本才 `exit(1)`。
6. **删除前先改名**：Windows 上文件被占用时 rename 会失败，跳过即可，别删出半个目录。
7. **用 `process.execPath` 启动目标包**，不碰 `.cmd` / `.ps1` shim；并转发 SIGINT / SIGTERM / SIGHUP。
8. `KEEP` 不要设太小：长跑的窗口可能在用到旧版本，目录被清掉后懒加载模块会报错。
9. **npm 完整性校验**：`npmCli()` 命中 `npm-cli.js` 后还要确认同前缀 `lib/commands/install.js` 存在。客户端可能打包一个能跑 `npm view`、却缺 install 命令的半残 npm；只用 `existsSync` 判存在会让它一路走到 install 才以 `other` 失败。候选不完整就跳过，让后面的候选或 PATH 上的 npm 接管。失败原因由 `npmFailureReason()` 统一裁决：`spawnSync` 自己没拉起 npm 记 `spawn-failed`，npm 自己打印的 `ENOENT` 仍是 `enoent`，超时优先于两者。
10. **遥测**：默认开启，`NGE_TELEMETRY=0` 只关网络上报，`events.jsonl` 始终写本地。只报灯塔已登记的 12 个键（事件 `toolkit_launcher`）——**新增字段必须先登记**，否则被网关静默丢弃。上报 fire-and-forget、1 秒超时、前台退出路径不等网络；测试与 CI 一律关闭对外上报，遥测专项只发本地接收端（`NGE_TELEMETRY_ENDPOINT`）。
   `common.A2` 现在放**与 `mcp/src/utils/device-id.ts` 逐字同算法的设备标识**（灯塔落到 `uin` 列），使本包事件与 MCP 的 lifecycle / tool_call 可直接按 `uin` 串联、按设备去重；**不新增登记参数，仍是 12 键**。锚点只在遥测开启时读一次，结果缓存在 `<base>/.device-id`（点开头、0600、`wx` 排他创建），关闭 `NGE_TELEMETRY=0` / `DO_NOT_TRACK` 时连锚点都不读；读锚点是遥测副作用，`emit()` 里包了 `try/catch`，不能让安装主流程跟着失败。**改算法必须两侧同步**，门禁是公开仓 `tests/device-id-parity.test.mjs`（真机行为对拍，纯 Node 内置模块、三平台 CI 可跑）与 `tests/device-id.test.mjs`（源码要素一致）；本地对拍脚本只作额外复核，**不进门禁、也不能写进 PR 验收项**。

11. **在用的版本不能删**：每次启动给当前版本登记 pid 租约，prune 跳过仍有存活进程的租约；进程退出或 pid 已死就回收。锁目录也写 pid，进程已退出立刻抢锁，不再等满 10 分钟 mtime。
12. **首装是「后台装、前台等」**：前台只 spawn detached 的 `--nge-update` 并轮询 `current`，绝不自己跑 npm；客户端杀掉前台后下载继续，重连接着等。`FIRST_RUN_TIMEOUT` 是前台等待上限，后台每次 npm 调用固定 5 分钟；预算内最多重试 2 次（仅当锁空闲且距上次拉起超过 10 秒）。
13. **子进程也要登记租约**：`run()` 里给 MCP 子进程再写一份 `leases/<child pid>`。launcher 被 `kill -9` 时子进程仍握着客户端的 stdio 管道继续跑，只有它自己的租约能保护正在用的版本。
14. **失败退出要给上报留时间**：首装失败分支设 `FLUSH_ON_EXIT`（socket 不 unref）→ `process.exitCode=1` → `setTimeout(..., TELEMETRY_TIMEOUT+200)` → **必须 `return`**，否则会继续读 `cur.version`（null）抛异常，请求一条都发不出去。
15. **只有 `NGE_CHECK_INTERVAL` 允许为 0**：其余数字配置取 0 会让首装循环直接跳过、锁永远判为过期；`num(v,d,allowZero)` 默认下限 1。
16. **移走残缺目录前先查租约**：目标版本目录存在但 `binOf()` 读不到时，先确认 `versionsInUse()` 里没有它、停 200ms 再读一次，才改名到 `.trash-*`。Windows 杀软短暂占用 `package.json` 也会让 `binOf()` 返回 null。
17. **磁盘文件只读第一行**：`current` / `leases/<pid>` / `lock/pid` / `last-check` 一律走 `firstLine()`，以后可以在后面追加行而不破坏 1.0.0。
18. **prune 只删版本目录**：`VERSION_DIR` 正则之外的目录（例如未来的 `versions/meta`）一律不动；`setCurrent()` 的临时文件改成 `.current.<pid>` 放在 base 下，按 `TMP_TTL` 回收。
19. **遥测口径**：首装失败没有旧版本，记 `start:failed` 而不是 `fallback`；reason 从本地事件日志取真实值，**只看本次启动（`t0`）之后的事件**，旧会话的失败原因不能串过来；只有真超时才写 `timeout`；`coldStart` 由 `update()` 的 `!from` 一路传到 `install()`；`fallback` 只在 `fromVersion` 非空时发。
20. **Windows 首装要逃出客户端的 Job 对象**：Electron 类客户端常把 MCP 进程放进带 KILL_ON_JOB_CLOSE 的 Job，`detached: true` 不会脱离 Job，客户端一关后台安装就跟着死。首装（仅首装，热启动的更新检查不走这里）用 PowerShell `Invoke-CimMethod Win32_Process Create` 拉起 `--nge-update`，父进程是 WMI 宿主，不在 Job 里。WMI 进程不继承环境变量，所以把 `NGE_*` / `npm_*` / 代理 / PATH 等写进 `.updater-env-<pid>-<ts>.json`（base 下、点开头、0600），`--nge-update <spec> <envFile>` 读到后立刻删除，读不到就直接退出；残留按 `TMP_TTL` 由 prune 回收。写文件前用 `SECRET_KEY` 过滤凭据变量名（`npm_` 也会匹配 `NPM_TOKEN` 和 .npmrc 派生的 auth 键）、用 `stripUserinfo()` 剥掉代理地址里的 `user:pass@`；`collectUpdaterEnv()` 在文件末尾导出供单测直接验证。WMI 失败（被策略或安全软件拦截、20 秒超时）就退回普通 spawn，并在 `install.log` 记一行。`NGE_WIN_BREAKAWAY=0` 可关掉。

## 发布后冻结的目录契约

1.0.0 会被客户端长期固定引用，`.nge` 里的格式**以后不能再改**，新版本必须能读懂旧版本写下的目录：

| 位置 | 约定 |
| --- | --- |
| `current` | 纯文本版本号 |
| `versions/<version>/node_modules/<name>` | 版本目录与包入口 |
| 以 `.` 开头的目录 | 临时安装目录 / 待删目录 |
| `lock/` | 目录即锁，内含 `pid` 文件 |
| `leases/<pid>` | 内容是版本号；launcher 与 MCP 子进程各一份 |
| `last-check` | 毫秒时间戳 |
| 顶层目录名 | 由 `name@range` 把 `@ / \ :` 换成 `_` 得到；只接受 tag 与精确版本，含空格或 `<>|*?"` 的 range 直接报错 |
| 文件读取 | 只读第一行，后续可在后面追加行 |
| 非版本目录 | `versions/` 下不符合版本号格式的目录一律不清理 |
| `current` 临时文件 | `.current.<pid>` 放在 base 下，按 `TMP_TTL` 回收 |
| Windows 首装环境文件 | `.updater-env-<pid>-<ts>.json` 放在 base 下，只含运行所需配置、不含凭据，被读后即删，残留按 `TMP_TTL` 回收 |

**逃生口**：格式要做不兼容的改动时，换根目录名（例如 `.nge2`），不要改现有文件的含义。

已知限制：两个不同包名可能映射到同一个顶层目录（如 `@x_y/z` 与 `@x/y_z`）；网络盘 / WSL 共用 HOME 时 pid 判断可能失效。本包实际只服务固定 spec，不会触发；要消除得改目录名规则，那会动已冻结的格式。

## 未实现的可选项

「发版后立刻生效」需要前台等待 `lockedUpdate` 10–15 秒，会拖慢启动、可能撞上客户端超时。当前实现按「后台更新、下次启动生效」处理；若以后要加，开关需按客户端 timeout 定。

「首次安装改成后台装、前台等」**已在 1.0.0 落地**：`spawnUpdater()` + 前台轮询 `current`，`DEADLINE` 与前台 spawnSync 已删除。仍未做的是限网 100 KB/s 下「客户端超时杀进程 → 重连续传」的真机验收，以及先发 rc 做内部测试。

## 验证

`npm test` 跑 `tests/concurrency.test.mjs` + `tests/behaviour.test.mjs` + `tests/telemetry.test.mjs` + `tests/hardening.test.mjs` + `tests/stdout-guard.test.mjs` + `tests/updater-env.test.mjs` + `tests/npm-cli.test.mjs` + `tests/failure-reason.test.mjs` + `tests/device-id.test.mjs` + `tests/device-id-parity.test.mjs`（都用 `NGE_ROOT` 指到临时目录；`mock-registry.mjs` 用纯 JS 生成 tarball，不依赖系统 `tar` 或外网；遥测专项用本地 HTTP 接收端）。本机 macOS 实测 11/11 + 20/20 + 30/30 + 37/37 + 10/10 + 11/11 + 11/11 + 24/24 + 20/20 + 10/10 通过（184 项；Windows 上 hardening 另有 Job 对象专项 5 项）（含 20 并发 + 中途发版 + kill -9 后子进程租约仍保护版本 + 只读第一行 + 首装失败真实原因 + 杀掉前台后台仍装完并重连秒起）。CI 见 `.github/workflows/npm-launcher-ci.yml`：ubuntu / macOS / Windows 三平台，Windows 跳过 POSIX 信号转发，job 级 `NGE_TELEMETRY=0` 防止测试产生真实上报。另有 `.github/workflows/npm-launcher-nightly.yml`（手动 + 每周一）：三平台 × npm 10/11 跑 `tests/real-package-smoke.mjs`，真实下载 `@cloudbase/cloudbase-mcp@latest` 验冷启动；**nightly 不进 PR 门禁**，包未发布前脚本用 `node index.js` 直跑，publish 后要切到 npx 路径再验一次。发布前仍建议在真实 Windows 客户端上验一次 EPERM / EBUSY，以及新版 npm 并发锁的重试行为。

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

**门禁**：tag 与版本一致、`node --check`、`npm test`、`npm pack --dry-run --json` 断言恰好 4 个文件、registry 幂等检查（同版本重跑不会 403）。

**发布后** `verify` job：直连 `registry.npmjs.org` 轮询收录（最多 15 分钟，别信本机 `.npmrc` 镜像），再经 `npx -y @cloudbase/npm-launcher@<version>` 跑 `tests/real-package-smoke.mjs`（`NGE_SMOKE_LAUNCHER_SPEC`），这是唯一覆盖 launcher 自身经 npx 冷启动的验证。
