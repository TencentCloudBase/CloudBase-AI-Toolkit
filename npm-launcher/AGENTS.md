---
description: "@cloudbase/npm-launcher package"
globs: "*"
alwaysApply: true
---

# @cloudbase/npm-launcher

独立 npm 包，不进根 `pnpm-workspace.yaml`：零依赖、单文件、用 `npm publish` 在本目录单独发布，避免改动 `pnpm-lock.yaml` 与供应链策略。

## 真源

- 入口 `index.js`（CommonJS，零依赖，Node >= 18）。`package.json` 的 `files` 只含 `index.js` / `README.md` / `LICENSE`；`AGENTS.md` 与测试不进包。
- 当前版本 `1.2.0`。**本包尽量不再发版**：客户端配置引用固定版本，每发一次新版，所有用户都要重写一次自己的 `_npx` 目录。发过 1.0.0 / 1.1.0 / 1.2.0；目录契约仍以 1.0.0 冻结的格式为准。
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
   `common.A2` 现在放**与 `mcp/src/utils/device-id.ts` 逐字同算法的设备标识**（灯塔落到 `uin` 列），使本包事件与 MCP 的 lifecycle / tool_call 可直接按 `uin` 串联、按设备去重；**不新增登记参数，仍是 12 键**。锚点只在遥测开启时读一次，结果留在进程内存里（与 MCP 侧 `private deviceId` 同生命周期）；**不落盘**——把首次的值写进文件会固化它，系统锚点一变（换主板、重装系统、容器重建），MCP 侧重算拿新值、launcher 还读旧值，`uin` 就串不起来。实测 `ioreg` 约 10 ms，1 s 只是子进程超时上限，不值得为省这 10 ms 新增持久化文件；目录契约表里也因此没有这个文件。关闭 `NGE_TELEMETRY=0` / `DO_NOT_TRACK` 时连锚点都不读；读锚点是遥测副作用，`emit()` 里包了 `try/catch`，不能让安装主流程跟着失败。**改算法必须两侧同步**，门禁是公开仓 `tests/device-id-parity.test.mjs`（真机行为对拍，纯 Node 内置模块、三平台 CI 可跑）与 `tests/device-id.test.mjs`（源码要素一致）；本地对拍脚本只作额外复核，**不进门禁、也不能写进 PR 验收项**。

11. **在用的版本不能删**：每次启动给当前版本登记 pid 租约，prune 跳过仍有存活进程的租约；进程退出或 pid 已死就回收。锁目录也写 pid，进程已退出立刻抢锁，不再等满 10 分钟 mtime。
12. **首装是「后台装、前台等」**：前台只 spawn detached 的 `--nge-update` 并轮询 `current`，绝不自己跑 npm；客户端杀掉前台后下载继续，重连接着等。`FIRST_RUN_TIMEOUT` 是前台等待上限，后台每次 npm 调用固定 5 分钟；预算内最多 3 次尝试。**1.2.0 起重试由 updater 的结果驱动**（看到本次会话新增的终态失败就起下一次），不再按固定 10 秒间隔；3 次用尽且无人在装就立即带真因退出，不空等满预算 —— 见红线 22。
13. **子进程也要登记租约**：`run()` 里给 MCP 子进程再写一份 `leases/<child pid>`。launcher 被 `kill -9` 时子进程仍握着客户端的 stdio 管道继续跑，只有它自己的租约能保护正在用的版本。
14. **失败退出要给上报留时间**：首装失败分支设 `FLUSH_ON_EXIT`（socket 不 unref）→ `process.exitCode=1` → `setTimeout(..., TELEMETRY_TIMEOUT+200)` → **必须 `return`**，否则会继续读 `cur.version`（null）抛异常，请求一条都发不出去。
15. **只有 `NGE_CHECK_INTERVAL` 允许为 0**：其余数字配置取 0 会让首装循环直接跳过、锁永远判为过期；`num(v,d,allowZero)` 默认下限 1。
16. **移走残缺目录前先查租约**：目标版本目录存在但 `binOf()` 读不到时，先确认 `versionsInUse()` 里没有它、停 200ms 再读一次，才改名到 `.trash-*`。Windows 杀软短暂占用 `package.json` 也会让 `binOf()` 返回 null。
17. **磁盘文件只读第一行**：`current` / `leases/<pid>` / `lock/pid` / `last-check` 一律走 `firstLine()`，以后可以在后面追加行而不破坏 1.0.0。
18. **prune 只删版本目录**：`VERSION_DIR` 正则之外的目录（例如未来的 `versions/meta`）一律不动；`setCurrent()` 的临时文件改成 `.current.<pid>` 放在 base 下，按 `TMP_TTL` 回收。
19. **遥测口径**：首装失败没有旧版本，记 `start:failed` 而不是 `fallback`；reason 从本地事件日志取真实值，**只看本次启动（`t0`）之后的事件**，旧会话的失败原因不能串过来；只有真超时才写 `timeout`；`coldStart` 由 `update()` 的 `!from` 一路传到 `install()`；`fallback` 只在 `fromVersion` 非空时发。
20. **Windows 首装要逃出客户端的 Job 对象**：Electron 类客户端常把 MCP 进程放进带 KILL_ON_JOB_CLOSE 的 Job，`detached: true` 不会脱离 Job，客户端一关后台安装就跟着死。首装（仅首装，热启动的更新检查不走这里）用 PowerShell `Invoke-CimMethod Win32_Process Create` 拉起 `--nge-update`，父进程是 WMI 宿主，不在 Job 里。WMI 进程不继承环境变量，所以把 `NGE_*` / `npm_*` / 代理 / PATH 等写进 `.updater-env-<pid>-<ts>.json`（base 下、点开头、0600），`--nge-update <spec> <envFile>` 读到后立刻删除，读不到就直接退出；残留按 `TMP_TTL` 由 prune 回收。写文件前用 `SECRET_KEY` 过滤凭据变量名（`npm_` 也会匹配 `NPM_TOKEN` 和 .npmrc 派生的 auth 键）、用 `stripUserinfo()` 剥掉代理地址里的 `user:pass@`；`collectUpdaterEnv()` 在文件末尾导出供单测直接验证。WMI 失败（被策略或安全软件拦截、20 秒超时）就退回普通 spawn，并在 `install.log` 记一行。`NGE_WIN_BREAKAWAY=0` 可关掉。

21. **npm 是可选安装器，不是唯一安装器**（1.2.0）：目标包自 1.9.0 起每个发布版都零依赖（`mcp/scripts/prepare-publish.cjs` 在 `prepublishOnly` 清空 `dependencies`，webpack 已把运行时打进 `dist/`），所以「安装」= 下载一个 tarball + 解包，不需要依赖解析。`directInstall()` / `directResolve()` 用 Node 内置模块直接走 registry，**冷启动优先用它**、npm 作为回退；热启动仍 npm 优先（那条路本来零失败），npm 失败后再试直装。
    - **顺序不能颠倒**：实测坏代理下 npm `view` 71s + `install` 71s 才失败，直装虽成功但已到 142s，超过 `FIRST_RUN_TIMEOUT`(120s) 预算；直装优先后同场景 3.3s。**退路存在 ≠ 退路可用，必须在预算内到达**。
    - **跑在子进程里**：下载要 `await`，但安装主流程是同步的、`sleep()` 用 `Atomics.wait` 会阻塞事件循环导致 https 回调永不触发。用 `spawnSync(process.execPath, ["-e", SCRIPT, ...])`，`stdio` 不接 stdout —— MCP 的 JSON-RPC 通道天然碰不到。
    - **结果回传禁止走 stdout**：用退出码 + `.direct-ok` / `.direct-err` / `.direct-resolve-<pid>` 哨兵文件。曾让子进程 `process.stdout.write("OK ...")`，5 条动态断言全绿但 `stdout-guard` 的**静态检查**挂了（它 grep 全文件的 `process.stdout.write` 行号）；那个检查守的是红线 1，不能为新功能放宽。
    - **自己解包就要自己挡 npm 原本挡的东西**：校验 `dist.integrity`（缺失即拒，不降级）、`dependencies` 非空即拒、只接受普通文件条目（symlink / hardlink / 设备 / 目录全跳过）、路径三重校验（含 `..` 段 / 绝对路径 / 最终 `startsWith(root + sep)`）、GNU longname 走同一套校验、下载上限 200MB。门禁 `tests/direct-install.test.mjs` 有 10 例逃逸样本。
    - **前提失效是静默降级**：有依赖时直装拒绝、回退 npm，不会装出残包；但没 npm 的机器就起不来了。所以仓库根有 `tests/launcher-direct-install-precondition.test.mjs` 盯着 `prepublishOnly` 仍跑 strip、webpack 仍打包、两条拒绝仍在。

22. **冷启动失败要快，不能空等满预算**（1.2.0）：旧逻辑前台固定等到 `FIRST_RUN_TIMEOUT`，而后台 updater 可能 1 秒就失败了 —— 线上实测 `start/failed` 的 `elapsedMs` 是 120,419ms，而它前面的 `update/skipped` 只有 1–2 秒。结果是**快而具体的失败被报成慢而模糊的超时**，`elapsedMs` 全部贴着预算、看不出真因。
    - 重试改为**由 updater 的结果驱动**，不再按固定 10 秒间隔：`failureSince(c, since)` 返回 `{reason, ts}`，看到本次会话新增的终态失败就起下一次尝试（`since = ts + 1`，避免把同一条失败数两次），3 次用尽则立即带真因退出。
    - `installerBusy(c)` 为真表示还在装，必须继续等 —— **安静不等于失败**，这条由 `cold-start-timing.test.mjs` 的场景 4 守着。
    - 实测：秒级失败场景 121s → 2.7s，且 `elapsedMs` 报 1.5s 而不是预算值。

23. **失败要告诉用户是什么、怎么办**（1.2.0）：`reason` 从单个桶名扩展为 `<桶>/<exit 事实>/<npm 码>/<短语>`（≤4 token、≤80 字符），`startFailureMessage()` 再按 reason 给一条可操作建议（DNS / 代理鉴权 / TLS 证书 / 权限 / 磁盘满 / 鉴权 / 404 …）外加日志路径与 `--nge-diag` 命令。
    - **这是 allowlist，不是脱敏**。此前否掉的方案是「把 stderr 脱敏后上报」，问题在于规则永远追不上新格式（20 例压测漏 2 个）。这里反过来：npm 的输出**一个字节都不进结果**，每个 token 要么是固定词表里的词，要么是受限的码形状（`E[A-Z]{1,14}` / `E\d{3}` / `exit\d+` / `sig-X` / `spawn-CODE` / `http\d{3}`）。没见过的格式产出**零 token**，失败模式是「少了细节」而不是「泄了内容」。
    - npm 码的形状刻意收窄：`ETOKEN_ABCDEF123456GHIJ` 这类长混合串匹配不上，所以 token / 路径骑不进这个槽位。
    - `reason` 是**已登记的键**、取值自由（1.1.0 已经这样上了 `empty-output`），所以**不新增登记参数，仍是 12 键**。安装成功时 `reason` 记哪个安装器干的活（`direct` / `npm` / `direct-after-npm`），退路效果不用新键就能量。
    - 门禁：`direct-install.test.mjs` 用 192 例含密钥/路径/URL/CJK/控制字符的恶意输入断言「每个 token 都在词表内」+「输出不含路径/token/URL/CJK/控制字符」。

24. **配了代理也要能装上，且不能因此拖慢直连用户**（1.2.0）：冷启动直装走**三档**，由 `directProxyPlan()` 统一给档位：
    - **第 1 档**直连，`DIRECT_HTTP` 的 `get()` 带 `CONNECT_MS=2500` 的连接级超时 —— 只管「发请求到收到响应头」，收到响应头立刻 `clearConnect()`，下载阶段仍由 `timeout:30000`（socket 空闲）兜底。`https.get` 的 `timeout` 不是 TCP 连接超时，别拿它当连接超时用。超时记 `net-timeout`（复用已有词表，不扩词表）。
    - **第 2 档**只在第 1 档失败、且环境里有 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`、且 `envProxySupported()` 为真时重跑：`spawnSync` 传 `env: { ...process.env, NODE_USE_ENV_PROXY: "1" }`。Node **22.21+/24.5+** 自带 CONNECT 隧道、`NO_PROXY` 豁免和代理 URL 里的凭据，**不要自己写隧道、不要解析代理 URL**；Node 18/20 忽略该变量，`envProxySupported()` 会跳过这一档，免得白等一次超时。
    - **第 3 档**是 `index.js` 原有的 npm 回退（npm 自己认代理变量）。
    - 🔴 **绝不按「代理变量存在」跳过第 1 档**：变量残留、只代理部分域名、`NO_PROXY` 覆盖时直连照样通，一刀切会把这类用户从 0.7s 退回 3.2s。「坏代理但直连可用」由 `tests/direct-proxy.test.mjs` 守着。
    - 两次直装共用同一个 tmp，重跑前必须清 `.direct-ok` / `.direct-err` 哨兵，否则会读到上一档的结果；传 `env` 时保留 `process.env`。热启动分支不动。
    - CI 三平台跑 Node 20，另加一组 **Ubuntu + Node 22** 才能真正跑到代理路径；Node 20 的 job 里该场景显式跳过但检查数不变。门禁 `tests/direct-proxy.test.mjs`（21 项）。

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

`npm test` 跑 13 个测试文件：`concurrency` + `behaviour` + `telemetry` + `hardening` + `stdout-guard` + `updater-env` + `npm-cli` + `failure-reason` + `device-id` + `device-id-parity` + `direct-install`（1.2.0 新增）+ `cold-start-timing`（1.2.0 新增）+ `direct-proxy`（1.2.0 新增）。都用 `NGE_ROOT` 指到临时目录；`mock-registry.mjs` 用纯 JS 生成 tarball，不依赖系统 `tar` 或外网；遥测专项用本地 HTTP 接收端。

本机 macOS 实测 **252 项全绿**（11 + 20 + 30 + 37 + 10 + 11 + 11 + 24 + 20 + 10 + 36 + 11 + 21；1.1.0 基线 184 项，1.2.0 新增 68 项），用的是 Node v22.23.4。经 `npm test` 跑是 **250 项**：npm 自带的 Node 是 v22.17.1（< 22.21.0），`direct-proxy.test.mjs` 的代理段显式跳过 2 条。两个数都对，差别只来自 Node 版本，不是缺陷。；Windows 上 hardening 另有 Job 对象专项 5 项。覆盖 20 并发 + 中途发版 + kill -9 后子进程租约仍保护版本 + 只读第一行 + 首装失败真实原因 + 杀掉前台后台仍装完并重连秒起 + 直装 10 例逃逸样本 + 192 例恶意 stderr 的词表约束 + 冷启动快速失败 + 代理唯一通路 / 坏代理不回归 / 连接超时封顶。

仓库根另有 `tests/launcher-direct-install-precondition.test.mjs`（5 项）：盯住直装的前提（`prepublishOnly` 仍跑 strip、webpack 仍打包、两条拒绝仍在）。它要读 `mcp/`，所以不在本包的 `npm test` 里，CI 单独一步跑。

**测试计数口径**：只把 `npm-launcher/` 单独 checkout 出来跑会少 6 项 —— `device-id.test.mjs` 有 6 条检查要读 `mcp/src/utils/device-id.ts` 做对拍，目录不存在就静默跳过（14 而不是 20）。**核基线数字必须在完整仓库里跑**，否则会把 184 误记成 178。同理 `direct-proxy.test.mjs` 在 Node < 22.21 / < 24.5 上是 19 项（代理段跳过）、在 ≥22.21 / ≥24.5 上是 21 项；CI 的 Ubuntu + Node 22 job 负责跑满 21 项。

CI 见 `.github/workflows/npm-launcher-ci.yml`：ubuntu / macOS / Windows 三平台跑 Node 20，另加一组 Ubuntu + Node 22 覆盖内置代理路径（Node 20 不认 `NODE_USE_ENV_PROXY`），Windows 跳过 POSIX 信号转发，job 级 `NGE_TELEMETRY=0` 防止测试产生真实上报。另有 `.github/workflows/npm-launcher-nightly.yml`（手动 + 每周一）：三平台 × npm 10/11 跑 `tests/real-package-smoke.mjs`，真实下载 `@cloudbase/cloudbase-mcp@latest` 验冷启动；**nightly 不进 PR 门禁**，包未发布前脚本用 `node index.js` 直跑，publish 后要切到 npx 路径再验一次。发布前仍建议在真实 Windows 客户端上验一次 EPERM / EBUSY，以及新版 npm 并发锁的重试行为。

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
