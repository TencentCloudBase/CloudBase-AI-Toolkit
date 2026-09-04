# 微信开发者工具调试与预览

本参考覆盖微信小程序项目的调试、预览、发布，以及经 **微信开发者工具 Nightly Skills**（`wechatide`）完成的日常 CloudBase 操作；并说明 Nightly 不可用时的回退路径。

何时用哪一套栈，另见 [微信 IDE Skills 与 CloudBase MCP](wxide-vs-cloudbase-mcp.md)。

## 何时阅读本参考

任务涉及以下内容时阅读本文件：

- 微信开发者工具 / Nightly / `wechatide`
- 模拟器、控制台、网络或真机调试
- 预览、上传或发布流程
- 打开项目 / `project.config.json` / `appid`
- 经开发者工具登录完成的日常云操作（NoSQL、云函数、云存储）
- 无开发者工具时用 `miniprogram-ci` 回退

## 0. 前置：Nightly 构建（内置 Skills / MCP）

微信 IDE Skills 与对应的 DevTools MCP 面随 **微信开发者工具 Nightly（开发版）** 发布，不是单独的 `npx` 包。

- 下载 / 更新日志：https://developers.weixin.qq.com/miniprogram/dev/devtools/nightly_backup.html
- 安装 Nightly 后应具备：
  - CLI：`wechatide`（通常已在 PATH）
  - 内置 skill 包（macOS 示例）：
    `/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/miniprogram-dev-skill`
  - Windows（典型）：在 DevTools 安装目录下的 `resources/app.asar.unpacked/miniprogram-dev-skill`
- **仅安装「微信开发者工具」并不保证有 Skills。** 若缺少 `wechatide` 或 skill 目录，先请用户安装 **Nightly**。
- Nightly 为日构建：功能/修复更快，稳定性可能低于稳定版。需要 AI Skills / MCP 工作流时使用它。

## 1. 优先路径：`wechatide`（Nightly Skills）

DevTools 工作流的原子执行入口：

```bash
wechatide -c <clientName> -t <toolName> [flags...]
```

### 必需上下文（不要臆造）

| 上下文 | 含义 |
| --- | --- |
| `-c <clientName>` | 当前 AI 客户端短名（如 `CodeBuddy`、`Claude`、`Cursor`） |
| `--project` | 含 `project.config.json` 的目录的绝对路径 |
| `appid` | 打开窗口 / 预览 / 上传前必需；从 `project.config.json` 读取 |
| `env` | 云工具所需的云环境 ID；未知时先调 `cloud_env_list` —— 绝不猜测 |

发现参数（**不要**臆造工具名或参数形态）：

```bash
wechatide
wechatide -c <clientName> -t <toolName> --help
```

Nightly skill 包内的工具注册表：

- `miniprogram-tools/references/tools.yaml`
- 场景 skills：`skills/{initializer,debugger,automator,compiler,previewer,cloudbase-operator,project-manager}/SKILL.md`

若 agent 已加载 Nightly 根 skill（`miniprogram-dev-skill/SKILL.md`），遵循该包的路由。否则用本参考确定路径与优先级，再打开内置场景 skill 看细节。

### 会话引导（每会话一次）

1. 确认 `wechatide` 存在（`which wechatide` / `wechatide`）。
2. 读取 Nightly 包 `skill.yaml` 顶层 `version`（不要硬编码）。
3. 检查登录 / skill 版本：

```bash
wechatide -c <clientName> -t check_devtools_status --skill-version <versionFromSkillYaml>
```

| 结果 | 动作 |
| --- | --- |
| 响应含 `openid` | 就绪；不要每次调工具都重复检查 |
| 关于 skill 版本的 `warning` | 从 DevTools 内置路径重装 / 同步 skill，再检查 |
| 无 `openid` | 运行 `wechatide -c <clientName> -t scan_login`，等待用户扫码，再检查 |
| `command not found` | 安装 Nightly；确保 `wechatide` 在 PATH |
| 连接 / 鉴权错误 | `wechatide auth -c <clientName>`，然后重试 |

### 打开项目窗口之前

- 确认存在 `project.config.json`
- 确认 `appid` 存在且对预览/上传有效
- 确认 `miniprogramRoot` 指向真实源码树
- 相关时确认引用的资源 / 云函数目录存在

然后经 Nightly 工具打开 / 编译 / 导航（见场景 skills）。示例模式：

```bash
wechatide -c <clientName> -t project_open_window --project <absProjectPath>
wechatide -c <clientName> -t simulator_open_page --project <absProjectPath> --page pages/index/index
```

### 能力地图（仅分类）

| 分类 | 典型工具（仅名称） | 使用场景 |
| --- | --- | --- |
| project | `project_list`、`project_open_window`、`project_setting_*` | 导入 / 打开 / 设置 |
| compile | `compile_js`、`compile_wxml`、`compile_wxss`、`buildnpm` | 编译 / npm |
| simulator | `simulator_open_page`、`simulator_refresh` | 打开页面 / 刷新 |
| preview | `auto_preview`、`create_preview_qrcode` | 真机预览 |
| automation | `automation_*` | 点击 / 断言 / 截图 |
| debug | `get_app_console_content`、`get_app_network_content`、`debug_clear_cache` | 控制台 / 网络 / 缓存 |
| cloud | `cloud_env_list`、`cloud_fn_*`、`cloud_db_*`、`cloud_stor_*` | 微信登录下的日常 CloudBase 操作 |
| publish | `miniprogram_upload` | 上传体验版 |

手机快速推送优先 `auto_preview`。猜测根因前，优先用 `debugger` 场景拿控制台/网络证据。

### 经 Nightly 的云操作（日常路径）

在小程序 CloudBase 环境中列举/查询/部署集合、文档、云函数与存储：

1. 解析 `appid` + `env`（需要时用 `cloud_env_list`）
2. 使用 Nightly `cloudbase-operator` 工具（`cloud_db_*`、`cloud_fn_*`、`cloud_stor_*`）
3. 写操作走 DevTools 确认 UI —— 等待用户批准；拒绝/超时后不要重试破坏性操作

Nightly 可用时，**不要** 为这些日常操作强制经 CloudBase MCP 单独做腾讯云登录。仅在缺口时用 CloudBase MCP（见 [wxide-vs-cloudbase-mcp.md](wxide-vs-cloudbase-mcp.md)）。

### 安全与失败处理

- 写操作需要用户在 DevTools 中确认
- 工具失败时：展示原始错误；不要臆造替代工具名或静默重试
- 临时下载 URL 寿命短；绝不要提交进源码

## 2. 回退：无 Nightly / 无 `wechatide`

Nightly Skills 不可用时：

1. 告知用户：仅稳定版 DevTools 可能不含 Skills/MCP；推荐上方 Nightly 下载页
2. 密钥与 IP 白名单就绪时，用 `miniprogram-ci` 做预览 / 上传 / npm 构建
3. 需要腾讯云登录的云资源操作，用 **CloudBase MCP**（IDE MCP 或 `mcporter`）

### `miniprogram-ci` 能做什么

- 预览、上传、npm 构建，以及部分云函数上传流程

### `miniprogram-ci` 前置条件

- `appid`、项目路径、代码上传私钥、微信小程序后台的 IP 白名单

### 关键限制

`miniprogram-ci` **不能** 替代模拟器面板、控制台/网络缓冲，或 `wechatide` 自动化/调试。

## 3. 建议的 agent 行为

Nightly + `wechatide` 可用时：

- 打开 / 编译 / 调试 / 预览 / 日常云操作优先 `wechatide`
- 按需携带 `clientName`、绝对路径 `--project`，以及 `appid`/`env`
- 用 `--help` 或内置 `tools.yaml` 查参数 —— 永不臆造工具

不可用时：

- 回退到 `miniprogram-ci` + CloudBase MCP
- 明确说明缺失哪些调试能力

## 4. 官方参考

- Nightly 下载：https://developers.weixin.qq.com/miniprogram/dev/devtools/nightly_backup.html
- DevTools 更新日志：https://developers.weixin.qq.com/miniprogram/dev/devtools/log.html#stable
- 小程序 CI：https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html
