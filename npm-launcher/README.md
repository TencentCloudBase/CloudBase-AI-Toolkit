# @cloudbase/npm-launcher

按版本目录安装并启动 npm 包，不读写共享的 `~/.npm/_npx` 缓存。

用于 MCP 这类由客户端按需拉起、可能同时开多个窗口的 stdio 服务。每个版本装进自己的目录，版本切换只改一个 `current` 文件；本地已有可用版本时立刻启动，检查更新放到后台。

## 用法

```json
{
  "command": "npx",
  "args": ["-y", "@cloudbase/npm-launcher@1.0.0", "@cloudbase/cloudbase-mcp@latest", "..."]
}
```

第一个参数是本包，第二个参数是要运行的包，其后的参数原样转给目标包的 bin。

引用本包时请写固定版本号。本包保持零依赖、单文件，并且尽量不再发版；每次发版都会让所有客户端重写自己的 npx 缓存目录。

## 行为

| 情况 | 做什么 |
| --- | --- |
| 本地已有可用版本 | 立刻启动；距上次检查超过 5 分钟时，后台检查更新，新版本在下次启动生效 |
| 第一次运行 | 前台安装，等待其他进程装完；成功后再启动 |
| 安装或检查更新失败 | 继续用旧版本，不退出 |
| 多个进程同时启动 | 各自用独立临时目录安装，装完原子改名；锁只用来避免重复下载 |
| 客户端关闭 | 把 SIGINT / SIGTERM / SIGHUP 转给子进程 |

## 遥测

本包默认发送匿名运行数据，用来统计本地连接成功率、首次安装成功率、更新失败时继续用旧版本的情况，以及平台与版本分布。启动、安装、更新、回退各记一条；上报在后台发出，网络失败会跳过，不会拖慢启动。

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
| `reason` | 失败原因类别 |
| `elapsedMs` | 耗时（毫秒） |

上报字段只有上表 12 项，不含账号标识、设备指纹、本地路径、目标包参数或命令输出原文。

**关闭方式**：设置环境变量 `NGE_TELEMETRY=0`。关闭后不再发出网络请求；事件仍会写入本地 `events.jsonl`，供 `--nge-diag` 排障时使用。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `NGE_TELEMETRY` | `1` | 设为 `0` 关闭匿名运行数据上报，本地事件仍写 |
| `NGE_REGISTRY` | `https://mirrors.cloud.tencent.com/npm/` | npm registry |
| `NGE_ROOT` | `~/cloudbase-mcp/.nge` | 版本目录的根，测试时可指到临时目录 |
| `NGE_CHECK_INTERVAL` | `300000` | 两次检查更新的最小间隔（毫秒） |
| `NGE_KEEP` | `5` | 保留的版本数，含当前版本 |
| `NGE_FIRST_RUN_TIMEOUT` | `120000` | 首次安装的最长等待（毫秒），客户端超时需大于它 |
| `NGE_LOCK_STALE` | `600000` | 锁残留多久后视为失效（毫秒） |
| `NGE_TMP_TTL` | `600000` | 安装被中断留下的临时目录，多久后可以回收（毫秒） |

## 目录

```
<NGE_ROOT>/<包名@范围>/
├── versions/<版本号>/node_modules/<包名>/   # 每个版本一份，互不覆盖
├── current                                  # 原子替换，记录当前版本
├── last-check
├── lock
├── events.jsonl                             # 运行事件，--nge-diag 导出最近 50 条
└── install.log                              # npm 输出只写这里，不占 stdout
```

`npm` 的输出全部写入 `install.log`。stdout 留给 MCP 的 JSON-RPC 通道。

## 清理残留

升级到本包之前，如果旧实现留下过安装残片，可以先清掉：

```bash
# macOS / Linux
rm -rf ~/cloudbase-mcp/node_modules ~/cloudbase-mcp/package-lock.json ~/.npm/_npx
```

Windows 上对应 `%USERPROFILE%\cloudbase-mcp\node_modules`、`%USERPROFILE%\cloudbase-mcp\package-lock.json` 和 `%LOCALAPPDATA%\npm-cache\_npx`。

本包使用 `<NGE_ROOT>` 下的新目录，升级之后不需要再手动清理。

## 测试（在源码仓库中运行）

```bash
npm test
```

- `tests/concurrency.test.mjs`：12 个进程并发首次安装、并发装第二个版本、并发热启动带后台更新；检查目录冲突、写坏的 `package.json` 和临时目录残留。
- `tests/behaviour.test.mjs`：本地 mock registry，检查 stdout 不被 npm 输出污染、参数透传、同一 spec 的 tag 移动、20 个进程并发启动中途发新版、安装失败或断网时回退到旧版本、信号转发、残留锁恢复。
- `tests/telemetry.test.mjs`：本地 HTTP 接收端，检查上报字段与登记一致、四个阶段都产生事件、关闭开关生效、上报超时不阻塞启动、客户端标识被清洗。

三组测试都用 `NGE_ROOT` 指到临时目录，不碰真实用户目录；mock registry 用纯 JS 生成 tarball，不依赖系统 `tar`。测试与 CI 显式关闭对外上报，遥测专项只往本地接收端发。CI 在 ubuntu / macOS / Windows 三平台跑 `npm test`，Windows 跳过 POSIX 信号转发那一项。

## 诊断

在客户机器的终端里手动运行（只用于排障，不要写进 MCP 配置）：

```bash
npx -y @cloudbase/npm-launcher@1.0.0 --nge-diag "@cloudbase/cloudbase-mcp@latest"
```

输出平台、Node 版本、npm 路径、当前版本、可用版本、锁状态、上次检查时间、遥测开关，以及 `install.log` 和 `events.jsonl` 的路径与最近 50 条运行事件。每次 npm 调用也会把环境写进日志，报障时只需这一个文件。
