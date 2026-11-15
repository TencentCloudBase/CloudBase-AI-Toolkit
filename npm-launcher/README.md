# @cloudbase/npm-launcher

按版本目录安装并启动 npm 包，不读写共享的 `~/.npm/_npx` 缓存。

用于 MCP 这类由客户端按需拉起、可能同时开多个窗口的 stdio 服务。每个版本装进自己的目录，版本切换只改一个 `current` 文件；本地已有可用版本时立刻启动，检查更新放到后台。

## 用法

```json
{
  "command": "npx",
  "args": ["-y", "@cloudbase/npm-launcher@1.2.0", "@cloudbase/cloudbase-mcp@latest", "..."]
}
```

第一个参数是本包，第二个参数是要运行的包，其后的参数原样转给目标包的 bin。

引用本包时请写固定版本号。本包保持零依赖、单文件。1.3.0 起 launcher 可以在后台自更新，客户端配置里的固定版本号不用跟着改。

## 1.3.0 新增行为

冷启动不再三次失败就退出：后台安装连续失败时按退避（2s / 5s / 10s）继续尝试，直到等待预算用完；正在安装的版本一律等到装完。等待超过 8 秒会上报一次 `start/slow`；如果之后没有 `start/ok` 或 `start/failed`，说明客户端在就绪前就断开了连接。

安装按源依次尝试：腾讯镜像（默认）→ npmmirror → registry.npmjs.org，每档有独立的解析与下载超时，成功后在 `reason` 里记下实际走的源。设置 `NGE_REGISTRY` 时只用该源，不自动切换，供企业内网使用。

热启动增加三道兜底：某个版本连续两次在启动后 5 秒内非 0 退出，就隔离该版本并回退到上一个可用版本；`current` 指向的目录缺 bin 或包描述损坏时，直接用次新可用版本启动；连续冷启动失败进入冷却，冷却期内每个连接只尝试一次，装成功后自动解除。Node 低于 18 时不安装，直接在 stderr 提示升级。

自更新在热启动时后台进行，只采用 `stable` 标签下**同主版本、发布满 72 小时、通过自检**的版本；维护者把 `stable` 拨回旧版本即可回滚。设置 `NGE_SELF_UPDATE=0` 可关闭。

### 新增环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `NGE_REGISTRIES` | 未设置 | 逗号分隔的备用源链，覆盖默认三档 |
| `NGE_COLD_RESOLVE_MS` | `15000` | 单档解析版本的最长等待（毫秒） |
| `NGE_COLD_INSTALL_MS` | `90000` | 单档直装的最长等待（毫秒） |
| `NGE_COLD_NPM_MS` | `90000` | 冷启动时 npm 回退的最长等待（毫秒） |
| `NGE_SLOW_MS` | `8000` | 超过这个时间上报一次 `start/slow` |
| `NGE_FAIL_BUDGET` | `30000` | 每次尝试都秒级失败时，继续重试的总时长 |
| `NGE_CRASH_WINDOW` | `5000` | 启动后这个时间内非 0 退出算崩溃 |
| `NGE_SELF_UPDATE` | `1` | 设为 `0` 关闭自更新 |
| `NGE_SELF_MIN_AGE` | `259200000` | 自更新只采用发布满这个毫秒数的版本 |

遥测仍用原来的 12 个字段，只新增枚举值：`result=slow`，`reason=crash-rollback` / `node-unsupported` / `cooldown` / `quarantined` / `selftest`；成功行的 `reason` 记为 `direct` / `direct-m2` / `direct-m3` / `npm`。目录里新增 `quarantine`、`crashes`、`cooldown` 三个记录文件，含义发布后同样冻结。`tests/resilience.test.mjs` 与 `tests/self-update.test.mjs` 覆盖上述行为。

## 行为

| 情况 | 做什么 |
| --- | --- |
| 本地已有可用版本 | 立刻启动；距上次检查超过 5 分钟时，后台检查更新，新版本在下次启动生效 |
| 第一次运行 | 后台进程负责下载安装，前台只等版本就绪；前台被客户端杀掉后下载继续，重连接着等，不从头再来。Windows 上这个后台进程经 WMI 拉起，放在客户端的 Job 对象之外，客户端关闭时不会被一起结束 |
| 安装或检查更新失败 | 继续用旧版本，不退出 |
| 某个版本还有进程在用 | 给它登记租约，清理版本目录时跳过它 |
| 多个进程同时启动 | 各自用独立临时目录安装，装完原子改名；锁只用来避免重复下载 |
| 客户端关闭 | 把 SIGINT / SIGTERM / SIGHUP 转给子进程 |

## 遥测

本包默认发送匿名运行数据，用来统计本地连接成功率、首次安装成功率、更新失败时继续用旧版本的情况，以及平台与版本分布。启动、安装、更新、回退各记一条；上报在后台发出，网络失败会跳过，不会拖慢启动。

首次安装没有旧版本可回退，因此失败记 `start:failed`（带真实失败原因），不记 `fallback`；`coldStart` 会一路带到后台进程的安装与更新事件里。只有真正等待超时才写 `timeout`。

每次事件只包含以下 12 个字段：

| 字段 | 含义 |
| --- | --- |
| `phase` | 阶段：`start` / `install` / `update` / `fallback` |
| `result` | 结果：`ok` / `reused` / `skipped` / `failed` / `fallback` |
| `launcherVersion` | 本包版本 |
| `spec` | 目标包名与版本范围 |
| `targetVersion` | 目标版本 |
| `fromVersion` | 更新前版本 |
| `osPlatform` | 操作系统平台 |
| `nodeMajor` | Node 主版本 |
| `client` | 宿主来源（`CLOUDBASE_MCP_CLIENT`） |
| `coldStart` | 是否首次安装 |
| `reason` | 失败原因类别（归一后的类别名，不含命令输出原文） |
| `elapsedMs` | 耗时（毫秒） |

上报字段只有上表 12 项，不含账号标识、本地路径、目标包参数或命令输出原文。事件的公共字段另带一个**设备标识**：与 CloudBase MCP 使用同一算法，优先取系统级不可变标识（macOS `IOPlatformUUID`、Windows `MachineGuid`、Linux `machine-id`），取不到才用主机名、CPU 型号与物理网卡地址，SHA256 取前 32 位。它让启动、安装事件与 MCP 运行事件能按设备关联，也用于按设备统计规模；不读取账号、路径或命令输出。每次启动时按当前系统锚点实时计算，进程内只算一次；不写入磁盘，也不保存锚点原文。

**关闭方式**：设置 `NGE_TELEMETRY=0` 或社区通用的 `DO_NOT_TRACK=1`。关闭后不再发出网络请求；事件仍会写入本地 `events.jsonl`，供 `--nge-diag` 排障时使用。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `NGE_TELEMETRY` | `1` | 设为 `0` 关闭匿名运行数据上报，本地事件仍写 |
| `DO_NOT_TRACK` | 未设置 | 设为任意非空值即关闭上报，与 `NGE_TELEMETRY=0` 等效 |
| `NGE_REGISTRY` | `https://mirrors.cloud.tencent.com/npm/` | npm registry |
| `NGE_ROOT` | `~/cloudbase-mcp/.nge` | 版本目录的根，测试时可指到临时目录 |
| `NGE_CHECK_INTERVAL` | `300000` | 两次检查更新的最小间隔（毫秒） |
| `NGE_KEEP` | `5` | 保留的版本数，含当前版本 |
| `NGE_FIRST_RUN_TIMEOUT` | `120000` | 首次安装的最长等待（毫秒），客户端超时需大于它 |
| `NGE_LOCK_STALE` | `600000` | 锁残留多久后视为失效（毫秒） |
| `NGE_TMP_TTL` | `600000` | 安装被中断留下的临时目录，多久后可以回收（毫秒） |
| `NGE_WIN_BREAKAWAY` | `1` | 仅 Windows：设为 `0` 时首装不经 WMI 拉起后台进程（例如安全软件拦截 WMI），客户端关闭时首装会随之中断 |

数字型配置里只有 `NGE_CHECK_INTERVAL` 可以设为 `0`，其余设为 `0` 或非数字会回落到默认值。

## 目录

```
<NGE_ROOT>/<包名@范围>/
├── versions/<版本号>/node_modules/<包名>/   # 每个版本一份，互不覆盖
├── current                                  # 原子替换，记录当前版本
├── last-check
├── lock
├── leases/                                  # 运行中的进程登记正在使用的版本
├── events.jsonl                             # 运行事件，--nge-diag 导出最近 50 条
└── install.log                              # npm 输出只写这里，不占 stdout
```

`npm` 的输出全部写入 `install.log`。stdout 留给 MCP 的 JSON-RPC 通道，launcher 自己不会往 stdout 写任何东西；唯一例外是手动排障的 `--nge-diag`，不要把它写进 MCP 配置。

## 目录约定（发布后冻结）

这些文件的含义在 1.0.0 发布后不再改变，后续版本必须能读懂旧版本写下的目录：

| 位置 | 约定 |
| --- | --- |
| `current` / `leases/<pid>` / `lock/pid` / `last-check` | 纯文本，**只读第一行**；以后可以在后面追加行 |
| `versions/<版本号>/node_modules/<包名>/` | 只把符合版本号格式的目录当作版本，其他目录不清理 |
| 以 `.` 开头的目录 | 临时安装目录 / 待删目录 |
| `lock/` | 目录即锁，内含 `pid` 文件 |
| `leases/<pid>` | 内容是版本号；launcher 与 MCP 子进程各一份 |
| 顶层目录名 | 由 `name@range` 把 `@ / \ :` 换成 `_` 得到；只接受 tag 与精确版本 |

**格式要做不兼容的改动时，换一个根目录名（例如 `.nge2`），不要改现有文件的含义。**

已知限制：顶层目录名是有损映射，`@a_b/c` 与 `@a/b_c` 会指向同一个目录；`HOME` 放在网络盘或 WSL 与 Windows 共用时 pid 判断可能失效。本包实际只服务固定 spec，这些场景暂不处理。

## Windows 首次安装

Windows 客户端常把 MCP 进程放进一个 Job，关掉客户端时里面所有进程会被一起结束。首次安装时，launcher 会请 Windows 自带的 WMI 服务代为启动后台安装进程，让它不在这个 Job 里，客户端关闭后下载仍能继续。只有首次安装走这条路，每台机器一次；已有版本时的更新检查仍用普通进程。

WMI 启动的进程不继承环境变量，所以 launcher 会先在 `<NGE_ROOT>/<包名@范围>/` 下临时写一个点开头的 `.updater-env-*.json`。里面只有运行所需的 `NGE_*`、npm 配置、代理地址和 PATH 等：**不含 token、密码或任何认证信息**，代理地址里的用户名密码会被去掉。后台进程读到后立即删除，万一残留会在 10 分钟后回收。

如果 WMI 被组策略或安全软件拦截、或 20 秒内没启动成功，会退回普通进程，首装照常进行，只是关客户端时会被一起结束；原因记在 `install.log`。设置 `NGE_WIN_BREAKAWAY=0` 可以手动关掉这条路。

## 清理残留

升级到本包之前，如果旧实现留下过安装残片，可以先清掉：

```bash
# macOS / Linux
rm -rf ~/cloudbase-mcp/node_modules ~/cloudbase-mcp/package-lock.json
```

Windows 上对应 `%USERPROFILE%\cloudbase-mcp\node_modules` 和 `%USERPROFILE%\cloudbase-mcp\package-lock.json`。

只删旧实现留下的这两个文件，不要清 `~/.npm/_npx` 或整个 npm 缓存：那会清掉其他工具的缓存，也会打断正在运行的 MCP。本包使用 `<NGE_ROOT>` 下的新目录，升级之后不需要再手动清理。

## 测试（在源码仓库中运行）

```bash
npm test
```

- `tests/concurrency.test.mjs`：12 个进程并发首次安装、并发装第二个版本、并发热启动带后台更新；检查目录冲突、写坏的 `package.json` 和临时目录残留。
- `tests/behaviour.test.mjs`：本地 mock registry，检查 stdout 不被 npm 输出污染、参数透传、同一 spec 的 tag 移动、20 个进程并发启动中途发新版、安装失败或断网时回退到旧版本、信号转发、残留锁恢复。
- `tests/hardening.test.mjs`：`DO_NOT_TRACK`、死 pid 锁回收、等锁只上报一次、版本租约、非法版本范围、`kill -9` launcher 后子进程租约仍保护版本、数字配置边界、只读第一行、prune 不误删非版本目录、杀掉前台后台仍装完并重连秒起、首装失败的真实原因与 `coldStart` 口径、超时只看本次会话的事件；Windows 上用 Job 对象（KILL_ON_JOB_CLOSE）模拟客户端关闭，先验证普通 detached 进程会被一起结束，再验证 WMI 拉起的首装进程仍能装完。
- `tests/stdout-guard.test.mjs`：静态禁止 `console.log`，并验证冷启动、首装失败、后台更新、参数错误四条路径的 stdout 不被污染。
- `tests/updater-env.test.mjs`：验证 Windows 首装的临时环境文件不会写入 token、密码或认证信息，代理地址里的用户名密码会被去掉，必要配置仍保留。
- `tests/telemetry.test.mjs`：本地 HTTP 接收端，检查上报字段与登记一致、四个阶段都产生事件、关闭开关生效、上报超时不阻塞启动、客户端标识被清洗。

六组测试都用 `NGE_ROOT` 指到临时目录，不碰真实用户目录；mock registry 用纯 JS 生成 tarball，不依赖系统 `tar`。测试与 CI 显式关闭对外上报，遥测专项只往本地接收端发。CI 在 ubuntu / macOS / Windows 三平台跑 `npm test`，Windows 跳过 POSIX 信号转发那一项。

## npx 拉不起来时

从程序坞或 Finder 打开的 IDE 可能继承不到终端的 PATH，报 `spawn npx ENOENT`；`~/.npm/_npx` 缓存损坏会报 ENOTEMPTY / EACCES。这两种情况都发生在 launcher 启动之前，launcher 自己修不了。

手动退路是把 launcher 单独装到一个固定目录，配置里直接调用 Node，不经过 npx：

```bash
npm install --prefix ~/cloudbase-mcp/launcher @cloudbase/npm-launcher@<固定版本>
```

```json
{
  "command": "/绝对路径/node",
  "args": ["/绝对路径/cloudbase-mcp/launcher/node_modules/@cloudbase/npm-launcher/index.js", "@cloudbase/cloudbase-mcp@latest"]
}
```

两处都写绝对路径：IDE 不继承 PATH 时，`node` 和相对路径都找不到。先确认 `node --version` 不低于 18；Node 的绝对路径用 `command -v node`（macOS / Linux）或 `where node`（Windows）查。清理 `~/.npm/_npx` 前先关掉所有 MCP 客户端，只删对应的缓存目录，不要清整个 npm 缓存，会打断其他工具。

## 诊断

在客户机器的终端里手动运行（只用于排障，不要写进 MCP 配置）：

```bash
npx -y @cloudbase/npm-launcher@1.2.0 --nge-diag "@cloudbase/cloudbase-mcp@latest"
```

输出平台、Node 版本、npm 路径、当前版本、可用版本、锁状态、上次检查时间、遥测开关，以及 `install.log` 和 `events.jsonl` 的路径与最近 50 条运行事件。每次 npm 调用也会把环境写进日志，报障时只需这一个文件。
