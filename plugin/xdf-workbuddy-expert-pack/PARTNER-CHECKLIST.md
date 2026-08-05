# XDF / WorkBuddy 伙伴启用验收清单

**包：** `plugin/xdf-workbuddy-expert-pack`（依赖 sibling `plugin/workbuddy-template-prewarm`）  
**目标体验：** Lovable / Supabase 式「分钟级可预览」最小 Web + 数据库 Demo（BaaS-first，默认 **0 云函数**）  
**主机：** WorkBuddy（`CODEBUDDY_CONFIG_DIR=~/.workbuddy`）

> 勾选顺序建议：先装启用面 → 空目录新会话 → 并行验 prewarm/preview → 再验专家路由。  
> 端口验收看 **17173..17272 池**，不要硬等固定 `17173`（空闲端口可能是 17174 等）。

---

## 0. 分发物齐备（装机前）

- [ ] 已拿到同级目录：
  ```text
  plugin/
    workbuddy-template-prewarm/   # SessionStart + Sites preview CLI（含 vendor）
    xdf-workbuddy-expert-pack/    # 本包：专家提示词 + settings 片段
  ```
- [ ] `workbuddy-template-prewarm/hooks/on-session-start.sh` 可执行
- [ ] `workbuddy-template-prewarm/vendor/cloudbase-sites/bin/cloudbase-sites` 存在（或已设 `CLOUDBASE_SITES_BIN`）
- [ ] `xdf-workbuddy-expert-pack/agents/cloudbase-baas-expert.md` 存在且 **无** frontmatter `hooks`
- [ ] CloudBase 连接器可在 WorkBuddy 中配置 / Trust（skills 侧能解析 `minimal-web-baas-demo`）

---

## 1. 启用 SessionStart（二选一）

### 路径 A — 推荐产品化：marketplace 插件

- [ ] 添加 marketplace：`TencentCloudBase/CloudBase-MCP`（或伙伴约定源）
- [ ] 安装并启用 `workbuddy-template-prewarm`
- [ ] **未**删除 `~/.workbuddy/settings.json` 里已有 **teamai** SessionStart
- [ ] **未**因本包打开 `allowUntrustedFrontmatterHooks`

### 路径 B — 离线 / 内网：settings 合并（本清单主验路径）

```bash
# 在含 plugin/ 的仓根执行
bash plugin/xdf-workbuddy-expert-pack/scripts/render-settings.sh --merge
```

- [ ] 生成 `plugin/xdf-workbuddy-expert-pack/settings.rendered.json`
- [ ] 将其中 **唯一** `hooks.SessionStart` 条目 **APPEND** 进 `~/.workbuddy/settings.json`
- [ ] 合并后 `hooks.SessionStart` **同时**包含：
  - `[xdf] CloudBase template prewarm…`（或等价 description）
  - 原有 `[teamai] …`（若伙伴机本来就有）
- [ ] **禁止**整段替换 `hooks` 对象
- [ ] **禁止**为启用本包设置 `allowUntrustedFrontmatterHooks: true`
- [ ] 重启 WorkBuddy / 新开会话使 settings 生效

**合并自检：**

```bash
jq '.hooks.SessionStart[] | {matcher, desc: .description, hooks: [.hooks[]?.description]}' \
  ~/.workbuddy/settings.json
# 期望：至少一条含 [xdf] / prewarm；teamai 仍在（若原有）
jq 'has("allowUntrustedFrontmatterHooks")' ~/.workbuddy/settings.json
# 期望：false（或不存在该键）
```

---

## 2. 安装专家 Agent / 系统提示

- [ ] 将 `agents/cloudbase-baas-expert.md` 复制到 `~/.workbuddy/agents/`  
  **或**粘贴进 WorkBuddy 专家 / 系统提示（伙伴既有专家位）
- [ ] frontmatter **没有** `hooks` 字段
- [ ] frontmatter / 正文指向 skill id：`minimal-web-baas-demo`
- [ ] （可选）伙伴 brief：`briefs/baas-fast-path.md` 已作为一页指针归档

```bash
cp plugin/xdf-workbuddy-expert-pack/agents/cloudbase-baas-expert.md \
   ~/.workbuddy/agents/cloudbase-baas-expert.md
# 确认无 frontmatter hooks：
head -20 ~/.workbuddy/agents/cloudbase-baas-expert.md | grep -E '^hooks:' && echo FAIL || echo OK
```

---

## 3. 空目录新会话 — Prewarm 验收

准备空项目目录（仅允许 `.git` / README 等白名单噪声）：

```bash
DEMO=~/WorkBuddy/partner-check-$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEMO"
# 在 WorkBuddy 中打开该目录并新开会话（或 GUI 等价 CLI，见文末）
```

凭据 / Connector Trust **等待期间**并行检查：

- [ ] ~20–40s 内出现 `<cwd>/.cloudbase-prewarm/state.json`
- [ ] `status` 进入 `ready`（经 `prewarming` / `installing` 可接受）
- [ ] `packageJson=true` 且 `nodeModules=true`
- [ ] `strippedRules.replaced` 含 `AGENTS.md` / `CLAUDE.md`（afterBytes ≪ 40 KiB）；宿主无 `Rule file exceeds maximum size`
- [ ] **未**在凭据等待阶段手搓第二套脚手架 / 云函数目录

```bash
cat "$DEMO/.cloudbase-prewarm/state.json"
# 期望片段：
# { "status": "ready", "template": "react", "installed": true, "nodeModules": true,
#   "strippedRules": { "replaced": [ { "path": "AGENTS.md", "beforeBytes": 41975, "afterBytes": 605 } ] }, ... }
wc -c "$DEMO/AGENTS.md"   # 期望 << 40960
```

**失败排查：**

| 现象 | 处理 |
| --- | --- |
| 无 state 文件 | settings 未 merge / SessionStart 未触发；查 `~/.cloudbase/logs/workbuddy-prewarm-session-start.log` |
| 长期 installing | 看 log；确认 `pnpm install --ignore-workspace`（家目录 monorepo 会吞包） |
| skipped non-vite | cwd 非空且非 Vite — 换真正空目录 |
| `Rule file exceeds maximum size` | 确认 prewarm ≥0.2.1；`strippedRules` 非空；勿设 `CLOUDBASE_WORKBUDDY_STRIP_RULES=0` |

---

## 4. Preview.json — 端口池 17173..17272

- [ ] 同期出现 `<cwd>/.cloudbase-sites/preview.json`
- [ ] 存在 `internalUrl`（形如 `http://127.0.0.1:17xxx/`）
- [ ] `port` ∈ **17173..17272**（**不是** 5173 / 5174 / 5175）
- [ ] Agent / 助手给出的预览链接来自该文件或 `cloudbase-sites preview --status`，**未猜端口**
- [ ] **未**自行 `npm run dev` / 裸 `vite`（Sites CLI 可用时）

```bash
cat "$DEMO/.cloudbase-sites/preview.json"
node -e '
  const j=require(process.argv[1]);
  const p=Number(j.port);
  const ok=p>=17173 && p<=17272;
  console.log(JSON.stringify({port:p, internalUrl:j.internalUrl, poolOk:ok},null,2));
  process.exit(ok?0:1);
' "$DEMO/.cloudbase-sites/preview.json"
```

可选状态命令：

```bash
SITES=plugin/workbuddy-template-prewarm/vendor/cloudbase-sites/bin/cloudbase-sites
"$SITES" preview --status --cwd "$DEMO"
# 或
node plugin/workbuddy-template-prewarm/hooks/prewarm.mjs --status --cwd "$DEMO"
```

---

## 5. BaaS-first 零云函数 Demo 验收

在已启用专家的会话中，用伙伴真实话术（或等价）发起：

> 用 CloudBase 给我搭一套带云函数+云数据库的最小可用前后端 demo / 留言板

勾选：

- [ ] **第一步**调用（或等价拉取）  
  `searchKnowledgeBase(mode="skill", skillName="minimal-web-baas-demo")`  
  （WorkBuddy 常无本机 skill 文件时 **禁止**优先瞎读本地路径）
- [ ] **未**在会话开头整包灌入全部 cloudbase-skills
- [ ] 明确架构定案：**云函数数 = 0**（即使用户口头「带云函数」）
- [ ] CRUD 路径：`@cloudbase/js-sdk` → `app.database()` 或 `app.rdb()`（视 `envQuery` 锁定的 DB）
- [ ] Schema / 权限只走 MCP（等 Connector Trust 后）
- [ ] 复用 prewarm 模板（改 `envId` + 首页即业务），不另起云函数脚手架
- [ ] 先本地 preview，再问是否部署静态托管
- [ ] 会话全程 **未**调用 `createFunction` / 未生成 `cloudfunctions/` 业务函数（Secrets/cron 例外场景本路径默认不触发）

**一句话纠偏话术（专家应能说出）：**  
留言板/Todo 类 CRUD 走 Web SDK 直连数据库即可，云函数不是必需。

---

## 6. Connector / 云侧（需 Trust；可与 §3–4 并行准备）

- [ ] CloudBase 连接器已 Trust，MCP 可用
- [ ] `envQuery(action="info")` 成功并锁定 **一条** DB 平面（NoSQL / PG / MySQL）
- [ ] MCP 创建业务集合或表 + 最小权限
- [ ] 浏览器 CRUD 可交互（列表 + 新增）
- [ ] 预览 URL 仍来自 `preview.json`（端口池未漂移到 5173）

> 无 Trust 时：§3–4 + 「架构定案云函数=0」仍可判启用面通过；§6 记为阻塞项，不阻塞 SessionStart/preview 验收。

---

## 7. 回归 / 共存在（必做）

- [ ] teamai SessionStart 仍触发（若原环境依赖它）
- [ ] `CLOUDBASE_WORKBUDDY_PREWARM=0` 可关闭预热（应急）
- [ ] `CLOUDBASE_WORKBUDDY_PREVIEW=0` 可只装模板不启 preview
- [ ] 关闭 / 卸载后不影响其它插件

---

## 8. 通过标准（汇总）

| # | 验收项 | 通过条件 |
| --- | --- | --- |
| E1 | Settings / 插件启用 | SessionStart prewarm 与 teamai **并存**；无 frontmatter allowlist |
| E2 | Prewarm | 空目录新会话 ~20–40s 内 `state.json` → `ready` |
| E3 | Preview 端口 | `preview.json.port` ∈ 17173..17272；URL 非猜测 |
| E4 | BaaS-first | 最小 demo / 留言板路径 **云函数 = 0**；走 `minimal-web-baas-demo` |
| E5 | 专家安装 | `cloudbase-baas-expert` 可用且无 frontmatter hooks |

**全部 E1–E4 勾选即视为伙伴启用验收通过**（E5 为专家位配套；E6/§6 依赖 Trust）。

---

## 附：无人值守 / GUI 等价 CLI（验收工程师用）

WorkBuddy.app 内置 CLI 与 GUI ACP 共用同一 `HookExecutor` + settings：

```bash
WB_CLI="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy"
export CODEBUDDY_CONFIG_DIR="${CODEBUDDY_CONFIG_DIR:-$HOME/.workbuddy}"

# 空目录会话 + 专家 Agent（示例）
cd "$DEMO"
"$WB_CLI" -p "用 CloudBase 搭一套带云函数+云数据库的最小留言板" \
  --setting-sources user \
  --agent cloudbase-baas-expert
```

干净机模拟（隔离配置面）：

```bash
CLEAN="$HOME/.ato/workspace/<task-id>/clean-workbuddy-home"
mkdir -p "$CLEAN/agents"
# 写入最小 settings.json（含 teamai stub 可选）后执行 render-settings 合并
# 再 CODEBUDDY_CONFIG_DIR=$CLEAN 跑上述 CLI
```

Dry-run（不经 WorkBuddy host，仅验 prewarm + preview 脚本）：

```bash
TMP=$(mktemp -d)
node plugin/workbuddy-template-prewarm/hooks/prewarm.mjs --cwd "$TMP" --fg --start-preview
node plugin/workbuddy-template-prewarm/hooks/prewarm.mjs --status --cwd "$TMP"
```

---

## 相关文档

| 文档 | 用途 |
| --- | --- |
| `README.md` | 伙伴启用总览 |
| `HOOKS.md` | 为何不用 Agent frontmatter hooks |
| `briefs/baas-fast-path.md` | 一页 BaaS 指针 |
| `../workbuddy-template-prewarm/README.md` | prewarm / Sites preview 细节 |
| skill `minimal-web-baas-demo` | 完整 Fast-path 契约 |
