---
name: codebuddy-ide-mcp-upgrade
description: 升级 CodeBuddy IDE（genie 扩展）内置的 CloudBase MCP，以及 MCP 发版时同步 IDE 侧白名单。当用户提到「更新 IDE 里的 MCP」「内置 MCP 版本太老」「IDE 集成的 CloudBase 功能不足」「改工具白名单 toolWhiteList」「把新 bundle 打进 CodeBuddy」「白名单漂移」「MCP 发版要同步什么」时使用。覆盖：解包定位内置 bundle 与内嵌配置、重新构建 mcp bundle、生成新的工具白名单与系统提示词、安全注入 IDE 并备份、用 MCP 协议验证工具清单、人工端到端验收、一键回滚。
description_zh: 升级 CodeBuddy IDE 内置 CloudBase MCP
description_en: Upgrade the CloudBase MCP bundled inside CodeBuddy IDE
disable: false
agent_created: true
---

# codebuddy-ide-mcp-upgrade

## When to use

- 需要把 CloudBase MCP 新版本推进 CodeBuddy IDE 的内置集成
- 线上反馈「IDE 里集成的 CloudBase 功能不足」（大概率是白名单过期，不是 MCP 能力不够）
- 需要修改 IDE 内置的 `toolWhiteList` / `systemPrompt` / `attatchPrompt`
- 需要定位「IDE 里的 MCP 到底装的哪个版本、能用哪些工具」

## 集成结构（先读，别猜）

CodeBuddy IDE 的内置 CloudBase MCP 由 **genie 扩展**承载，改一处不生效，**必须同时改两个文件**：

| 文件 | 内容 | 等价来源 |
| --- | --- | --- |
| `Contents/Resources/app/extensions/genie/integration-mcp/tcb/index.cjs` | MCP Server bundle | 仓库 `mcp/dist/cli.cjs` 改名 |
| `Contents/Resources/app/extensions/genie/out/extension/index.js` | 内嵌的 tcb 集成配置（webpack module，`ir.exports=JSON.parse('{...}')`） | 无仓库对版，需就地解包 |

默认 IDE 路径：`/Applications/CodeBuddy CN.app`。同目录还有 `anydev`、`eop`、`lighthouse` 三个集成，别改错。

加载与启动契约：

```js
// TcbIntegration
mcpServer: {
  path: path.join("integration-mcp", "tcb", "index.cjs"),
  envMapper: (r) => ({ TENCENTCLOUD_SECRETID: r.tmp_secret_id,
                       TENCENTCLOUD_SECRETKEY: r.tmp_secret_key,
                       TENCENTCLOUD_SESSIONTOKEN: r.token }),
  toolWhiteList: config.toolWhiteList,
}
// StdioClientTransport
{ command: process.execPath, args: [mcpPath],
  env: { ...envMapper(), INTEGRATION_IDE: "CodeBuddy",
         ELECTRON_RUN_AS_NODE: "1", WORKSPACE_FOLDER_PATHS } }
```

**不传任何命令行参数**（`--cloud-mode` / `--integration-ide` 都没用），凭据全靠环境变量，MCP 侧 `mcp/src/auth.ts` 直接读 `TENCENTCLOUD_SECRETID/SECRETKEY`。

## Steps

### 1. 解包拿到线上基线（第一步必做）

配置内嵌在 21MB 的 `out/extension/index.js` 里，用 `JSON.parse('...')` 包着，**必须按 JS 字符串语义 eval 才能解析**：

```js
const i = s.indexOf('"id":"tcb"');
const st = s.lastIndexOf("JSON.parse('", i) + 12;
let cursor = st, cfg;
for (;;) {
  cursor = s.indexOf("')", cursor + 1);
  try { cfg = JSON.parse(eval("'" + s.slice(st, cursor) + "'")); break; } catch {}
}
```

拿到后先数一遍白名单，并和仓库 `scripts/tools.json` 比对。**九成问题出在这里**：白名单停留在旧版本，里面全是已被 MCP 改名的死条目。

### 2. 构建新 bundle

```bash
cd <repo>/mcp && npm run build:webpack   # 产物 dist/cli.cjs，约 4.6 MiB
```

只跑 `build:webpack`，不要跑 `npm run build`（会触发 `prebuild` 的 `rm -rf dist`，可能被 safe-delete hook 拦截）。

### 3. 生成新配置

白名单真源是 `scripts/tools.json`，**不要手写清单**。配置改动落在：

- `toolWhiteList` ← `tools.json` 全部工具名（**全量，不要裁剪**，理由见「白名单裁剪的前提已不存在」）
- `systemPrompt.login` / `.logout`、`userPrompt.*`、`attatchPrompt.*` ← 提示词
- 其余字段（`id`、`displayName`、`description`、`descriptionMap`、`types`、`ruleZipUrl`、`loginOnlyChinese`、`loginType`、`toolTimeout`）**保持原值**

### 3.1 写提示词前必须知道的两件事

**（1）PG 模式 = Supabase 同构，不是「多了一种数据库」**

判定为 PG 环境后，认证、存储、权限、迁移**四项全部改道**：

| 能力层 | Supabase | CloudBase PG 模式 | 工具 |
| --- | --- | --- | --- |
| 数据库 | Postgres | PostgreSQL | `queryPgDatabase` / `managePgDatabase` |
| Schema 变更 | Migration | `applyMigration`（须带 `migrationVersion`） | `managePgDatabase` |
| 行级授权 | RLS Policies | RLS | `managePgDatabase` + `rls-patterns.md` |
| 存储 | Storage Buckets | **pgstore（与 legacy COS 是两套系统）** | `queryPgStorage`（不是 `queryStorage`） |
| 认证 | anon/service key | 应用认证（publishable key / API key） | `queryAppAuth` / `manageAppAuth` |

**PG 环境里引导错路径（用 NoSQL/MySQL 工具，或用 `queryStorage` 而非 `queryPgStorage`）是最高频的跑偏方式。**

**（2）提示词看配重，不看总长**

- **总长不是问题**：`systemPrompt.login` 约 10.6k 字符 ≈ 3.5k token，在 Tool Search + 长上下文下不构成负担。为「看起来短」删引导 = 丢掉关键分叉点的判断质量。
- **要看常量 vs 变量的配比**。实测一次改版的占比：
  - 静态索引（rule 文件路径清单 + 控制台 URL 清单）占 **28.8%**，但模型随时可查、规则文件里本来就有完整版（提示词自己都写着 "see platform rule for full list"）；
  - 真正决定走向的分支变量（如 PG 主线）只占 **6.6%**，且散落在互不相邻的章节，需要模型自行拼接 —— 这是「提示词写了但模型没照做」的典型成因。
- **改法**：
  1. 下沉常量索引（可省 ~23%），腾出的空间上提变量主线；
  2. 分支判定后**紧跟一张「改道表」**，把散落约束收敛成一处；
  3. 「三选一」式的并列列表，若各分支会改变后续多项决策，应改写成「两条主线」各自自包含。

改完提示词用这个脚本量化配重，别靠感觉：

```bash
node -e '
const s=require("fs").readFileSync("config/prompts/systemPrompt.login.md","utf8"),L=s.split("\n");
let c="(开头)",a={[c]:0},o=[c];
for(const l of L){if(/^## /.test(l)){c=l.slice(3);if(!(c in a)){a[c]=0;o.push(c)}continue}
if(/^### /.test(l)){c=l.slice(4);if(!(c in a)){a[c]=0;o.push(c)}continue}a[c]+=l.length+1}
for(const k of o)console.log(String(a[k]).padStart(6),(a[k]/s.length*100).toFixed(1).padStart(5)+"%  ",k.slice(0,50))'
```

### 4. 注入 IDE（先 dry-run）

```bash
node scripts/apply-to-ide.mjs --dry-run   # 只看差异
node scripts/apply-to-ide.mjs             # 备份到 backup/<时间戳>/ 后写入
node scripts/patch-tool-timeout.mjs --timeout 300000   # 接通 toolTimeout（见 Pitfalls）
```

写配置的替换逻辑：生成**紧凑 JSON**（`JSON.stringify(cfg)`，无裸换行），再按 JS 单引号字符串转义（先 `\\` 再 `'`），替换 `JSON.parse('...')` 区间。转义顺序错了会破坏 JS 字符串。

**边界语义（踩过坑，勿改错）**：`start` = raw 起点（`slice(0, start)` 里**已包含** `JSON.parse('`），`end` = `')` 之后。所以替换时**只能拼 escaped raw + `')`，绝不能再拼一次 `JSON.parse('`**。

### 5. 验证

```bash
node scripts/verify-ide-config.mjs   # 从 IDE 回读配置，逐字段比对
node scripts/verify-bundle.mjs       # 按 IDE 方式启动 bundle，拉 tools/list
```

`verify-bundle.mjs` 复刻 IDE 的启动参数（stdio + `INTEGRATION_IDE=CodeBuddy` + `ELECTRON_RUN_AS_NODE=1` + 临时密钥占位值），比对三件事：暴露的工具是否全在白名单内、白名单是否有悬空条目、PG 工具是否注册。

### 6. 回滚

```bash
node scripts/rollback-ide.mjs --latest
```

## MCP 发版时的强制同步项（防漂移）

**白名单漂移是「IDE 里 CloudBase 功能不足」的唯一根因**，不是 MCP 能力问题。线上实测：21 条白名单里 12 条是已被 MCP 删除或改名的死条目，用户实际只能用 9 个。

因此 **MCP 每次发版（工具增删改名）都必须重新生成 IDE 侧白名单**，否则新版本 MCP 发得再勤，IDE 里还是老的。

**发版 checklist：**

1. `scripts/tools.json` 是否已更新（工具清单真源）
2. 用 `scripts/build-config.mjs` 重新生成 IDE 配置，产出新 `toolWhiteList`
3. 检查**新增/改名**的工具是否在提示词里有对应引导 —— 提示词里引用已删除的工具名会导致模型调用不存在的工具
4. 把新配置同步给 IDE 侧（或直接执行本 skill 的 Steps 打进本机 IDE 验证）
5. 在交付文档里记录「本次新增了哪些工具」，便于 IDE 侧理解变更

**建议把这个 checklist 挂到 MCP 发版流程里（release workflow 或发版 checklist 文档），不要靠人工记忆。** 靠人记的后果就是这次的 12 条死条目。

### 白名单裁剪的前提已不存在

- **CodeBuddy 已支持 Tool Search**：MCP 工具按需检索，不再全量塞进上下文；MCP server 配置层也支持 `defer_loading`。
- **当初给 tcb 加 `toolWhiteList` 的唯一理由就是省上下文，这个前提现在没了。**
- 结论：白名单回归「安全边界」单一职责，按 `tools.json` **全量生成**。继续裁剪的唯一后果就是随 MCP 发版漂移成死条目。
- ⚠️ 判断「IDE 是否支持 Tool Search」时**不要 grep genie 的 `out/extension/index.js`** —— 那里搜不到 `ToolSearch` 字符串（实测 0 命中）。Tool Search 属 Agent CLI 内核层，证据在 CLI 进程参数（`--tools` 白名单含 `ToolSearch`）和 mcp-config 的 `defer_loading` 里。

## Pitfalls

- **白名单过滤在 IDE 侧，不在 bundle 内。** 只换 bundle 不换白名单 = 新工具被静默过滤，用户侧零变化。这是最容易踩的坑。
- **写入后必须完全退出并重启 IDE** 才生效，运行中的进程已把旧 bundle 加载进内存。
- 解包时配置字符串里可能含 `')` 序列，必须用「eval + JSON.parse 能否成功」来判断结束位置，不能用第一个 `')`。
- **定位 tcb 块必须用 `"id":"tcb"` 做锚点。** 全文 `toolWhiteList` 出现 13 次，用 `toolWhiteList` 搜会抓到 eop（EdgeOne）的配置块——症状是解出来的 raw 只有 1,015 字符（正常应 ~16,000）。
- 插件类工具（如 `msg-push`）不在 `DEFAULT_PLUGINS` 里，白名单写了也不会注册，需注入 `CLOUDBASE_MCP_PLUGINS_ENABLED=msg-push`。白名单 40 条、实际暴露 38 条是**正常现象**，不是 bug。

### ⚠️ 头号陷阱：JSON 回读全绿 ≠ 文件可用

曾发生的事故：替换时重复拼接 `JSON.parse('` 前缀，生成 `JSON.parse('JSON.parse('{...}')`，第二个 `'` 提前闭合字符串，整文件 `SyntaxError`。**但 verify 脚本的 JSON 字段比对全部显示 ✅** —— 因为定位用 `lastIndexOf("JSON.parse('")`，恰好命中了第二个前缀，照样能解析出正确 JSON。

**铁律**：改动这种大打包产物后，**必须对整文件做真实编译**：

```js
import vm from "node:vm";
try { new vm.Script(source, { filename: "index.js" }); }
catch (e) { /* 立即回滚备份 */ }
```

- 写入脚本要内置编译校验 + 失败自动回滚
- verify 脚本的结构/语法检查必须**硬阻断 `exit 1`**，只打印 ❌ 而不改变退出码等于没有检查
- 交付前再独立跑一次 `node --check <file>`，不要只信自己的脚本
- **反向测试**：拿一个已知损坏的备份喂给 verify，确认它真的报失败（否则检测是摆设）

### 已知 IDE 侧缺陷：`toolTimeout` 未接通，实际只有 60 秒

- `TcbIntegration` 的配置对象**没有** `toolTimeout` 字段（`EopIntegration` 传了）
- `callTool` 用 `this.config.toolTimeout` → `undefined`
- MCP SDK：`const Sn = sn?.timeout ?? DEFAULT_REQUEST_TIMEOUT_MSEC`，而 `DEFAULT_REQUEST_TIMEOUT_MSEC = 6e4`
- ⇒ 配置 JSON 里写的 `"toolTimeout":120000` **从未生效**，实际 60 秒就掐断 PG `applyMigration` / CloudRun 部署

修复（`scripts/patch-tool-timeout.mjs`）：

- **Patch A**：给 `TcbIntegration` 配置对象补 `toolTimeout:hn.toolTimeout`（锚点 `attatchPrompt:hn.attatchPrompt,loginOnlyChinese:hn.loginOnlyChinese}`，全文唯一 1 处）
- **Patch B**：把配置值从 120000 提到 300000

### 白名单可以放心多留位（源码实证）

```js
((ir?.tools) || []).filter((ir) => this.config.mcpServer.toolWhiteList.includes(ir.name))
```

遍历的是 **server 实际返回的 `tools/list`**，白名单只做 `includes` 判定。多出的条目静默跳过、不报错、不产生悬空工具。所以白名单按 `tools.json` 全量下发是安全的，插件后续启用也无需再改配置。
- `mcp/src/server.ts` 用 `ide === "CodeBuddy"` 判定 logging capability，大小写敏感；IDE 传的正是 `"CodeBuddy"`，别改成小写。
- 老版本 bundle 用旧的 MySQL / 云函数 / 存储工具名（`executeReadOnlySQL`、`createFunction`、`uploadFiles`、`writeSecurityRule` 等），新 bundle 里这些名字已全部消失，提示词里如果还在引用就会引导模型调用不存在的工具。

## Verification

交付前必须同时满足：

1. **独立跑 `node --check "<genie>/out/extension/index.js"` 通过**（最关键，能抓住回读校验掩盖的语法错误）
2. `apply-to-ide.mjs` 输出「语法有效」+「回读校验通过」
3. `verify-ide-config.mjs` 结构完整性三项 ✅ + 七个字段 ✅，`echo $?` 为 0
4. `verify-bundle.mjs` 显示「所有暴露的工具都在白名单内」且 PG 三件套（`queryPgDatabase` / `managePgDatabase` / `queryPgStorage`）已注册
5. `verify-ide-config.mjs` 反向测试：喂已知损坏文件必须 `exit 1`
6. 重启 IDE 后完成下方的人工端到端验收（E1–E10）

### 人工端到端验收用例（自动化证明不了的那一层）

脚本只能证明「bundle 与配置文件本身是对的」，**证明不了 IDE 加载后用户真的能用**。重启后逐项跑：

| # | 用例 | 预期 |
| --- | --- | --- |
| E1 | 完全退出后重启 IDE | 集成面板正常渲染，无 `SyntaxError`、genie 扩展不报错 |
| E2 | 集成面板连接 CloudBase | 登录成功，显示环境信息 |
| E3 | 让 Agent 列出可用的 CloudBase 工具 | 数量与新白名单一致（不是旧版数量） |
| E4 | PG 环境让 Agent 建表 | 走 `managePgDatabase` 的 `applyMigration`，提示词先引导读 `postgresql-development-cloudbase` 规则 |
| E5 | 执行一条只读 SQL | 走 `queryMysqlDatabase`（不再是 `executeReadOnlySQL`） |
| E6 | 部署一个 Node.js 云函数 | 走 `manageFunctions`（不再是 `createFunction`） |
| E7 | PG 模式下访问存储 | 走 `queryPgStorage` 而非 `queryStorage` |
| E8 | 查看/修改安全规则 | 走 `queryPermissions` / `managePermissions`（不再是 `writeSecurityRule`） |
| E9 | PG 执行耗时 >1 分钟的迁移 | 不中断，5 分钟超时生效（验证 `toolTimeout` 修复） |
| E10 | 正常对话观察上下文占用 | 工具全量放开后无明显膨胀（验证 Tool Search 结论） |

**验证时的两个坑：**

- **tcb 临时密钥会过期**：日志表现为 `Authorization cache loaded for tcb, tempKey expires at: <过去时间>`，必须在集成面板重新登录，MCP 才起来。
- **MCP 进程按需启动**：tcb 的 MCP Server 只有集成面板连上后才拉起，IDE 刚启动时日志里没有 tcb 的 `tools/list` 属正常，**别据此判定 bundle 没生效**。

日志位置：`~/Library/Application Support/CodeBuddy CN/logs/<时间戳>/window1/exthost/Tencent-Cloud.coding-copilot/腾讯云代码助手.log`（搜 `[Integration]` / `tcb`）。

### MCP 服务端质量的合格基线（顺带可测）

如果要顺带评估 MCP 工具层本身，这几项是实测通过的基线，达不到说明有回归：

- **只读承诺**：`queryPgDatabase(action=sql)` 必须拦截 DELETE / UPDATE / DROP / 多语句注入，且返回带 `nextActions` 的可执行建议
- **confirm 闸门**：`managePgDatabase(execute)`、`manageFunctions(deleteFunction)` 缺 `confirm` 时必须拒绝
- **负向路径零崩溃**：不存在的函数名 / 集合 / envId / topic 都返回结构化错误或正常语义，不出裸 stack trace
- **能力边界明示**：PG 环境下 `queryPermissions` 应返回「不支持 PostgreSQL 类型环境」，而不是假装成功

首次实操的完整交付物（文档 + 配置 + 脚本）模板在 CloudBase-MCP 仓库的 `specs/cb-ide-mcp-upgrade/`（worktree `chore/cb-ide-mcp-upgrade`）。

## 交付前的一致性自查（易漏）

**凡「改配置 + 再打独立 patch」的两步流程，patch 改的标量必须回流到配置生成脚本**。

实例：本任务里 `toolTimeout` 先从 120000 提到 300000 是靠 `patch-tool-timeout.mjs` 单独 patch 的，而 `build-config.mjs` 生成的 `tcb-config.new.json` 里仍是 120000。交付物自带旧值，IDE 侧直接拿配置去用就会退回两分钟。

自查项：
1. 对比「交付配置 JSON 的标量值」与「IDE 内实际生效值」，逐项相等
2. 白名单条数、各提示词长度、所有标量字段都要对，不能只看回读脚本报绿
3. 文档里的数值表格（变更项、建议项）与配置源保持一致

## 交付文档的可读性（易被忽略）

**Markdown 交付物不要放在点开头的隐藏目录下**。git worktree 常用 `.worktrees/<name>/`，预览器常因安全策略拒绝加载隐藏目录资源，表现是「文件能读到、点击却打不开/报错」。

交付前做两件事：

1. 把文档产物镜像到非隐藏路径（本次用 `~/Projects/cb-ide-mcp-upgrade/`），`present_files` 指向该路径
2. 生成自包含 HTML 版，`present_files` 第一个传它（HTML 会同时开预览面板 + 列 artifact card，最稳）

渲染脚本在本 skill 的 `scripts/render-html.mjs`，依赖 `marked`：

```bash
mkdir -p /tmp/mdrender && cd /tmp/mdrender
echo '{"name":"mdrender","private":true}' > package.json
npm install marked
NODE_PATH=/tmp/mdrender/node_modules node <skill>/scripts/render-html.mjs \
  "<交付目录>/README.md" "<交付目录>/README.html" "文档标题"
```

注意：`npm install` 别在 `~/.workbuddy/binaries/node/workspace` 里跑——没有 package.json 时 npm 会向上找到 `~/node_modules` 并因 ENOTEMPTY 失败。装到带 package.json 的临时目录最省事。

产物自带侧边目录导航（从 h2/h3 生成）、表格与代码高亮样式、`@media print` 打印规则（可直接导出 PDF 交给外部团队）。
