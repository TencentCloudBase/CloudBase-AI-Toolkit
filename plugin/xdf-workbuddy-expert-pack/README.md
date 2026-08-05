# XDF / WorkBuddy 专家 Agent 分发包

把 **SessionStart 模板 prewarm**、**BaaS Fast-path Brief 指针**、以及 **专家 Agent 提示词**打成一套可交给新东方 / WorkBuddy 伙伴启用的包。

> 状态：partner enablement pack（依赖同级 `plugin/workbuddy-template-prewarm` spike）。

## 包内清单

| 路径 | 作用 |
| --- | --- |
| `agents/cloudbase-baas-expert.md` | 专家 Agent 正文（**无** frontmatter `hooks`） |
| `skills/minimal-web-baas-demo/` | 可加载 BaaS Fast-path skill（Trust 前 `Skill()` 可用） |
| `scripts/install-skill.sh` | 安装到 `~/.workbuddy/skills/`（及 `~/.codebuddy/skills/`） |
| `briefs/baas-fast-path.md` | `minimal-web-baas-demo` 一页指针 |
| `settings.snippet.json` | 合并进 `~/.workbuddy/settings.json` 的 SessionStart 片段 |
| `scripts/render-settings.sh` | 把片段里的路径渲染成绝对路径 |
| `PARTNER-CHECKLIST.md` | 伙伴侧启用验收清单（merge / preview 端口池 / 零云函数） |
| `HOOKS.md` | frontmatter allowlist 结论（英文技术备忘） |
| `.claude-plugin/plugin.json` | 插件元数据（agents + skills；prewarm 仍走 sibling） |

Sibling（必须同仓 / 同目录分发）：

```text
plugin/
  workbuddy-template-prewarm/   # SessionStart hook 实现
  xdf-workbuddy-expert-pack/    # 本包
```

## 关键结论：frontmatter hooks 要不要开 allowlist？

**不要靠 Expert Agent frontmatter hooks，因此默认也不要求开 `allowUntrustedFrontmatterHooks`。**

原因（详见 `HOOKS.md`）：

1. 非内置 Agent/Skill 的 frontmatter hooks **默认拒绝**，需 `allowUntrustedFrontmatterHooks: true`
2. frontmatter hooks 绑定 **子 Agent 生命周期**，盖不住主会话里「空目录 + 等 sre-aihub Trust」的死时间
3. **插件分发的 Agent 根本不允许** frontmatter `hooks` 字段

正确启用面：

| 方式 | 是否需要 allowlist | 推荐 |
| --- | --- | --- |
| 合并 `settings.snippet.json` → `~/.workbuddy/settings.json` | 否 | ✅ 伙伴机快速启用 |
| 启用 sibling 插件 `workbuddy-template-prewarm`（`hooks/hooks.json`） | 否 | ✅ 产品化 |
| Agent frontmatter `hooks` | 是（且仍不够） | ❌ 不用 |

## 伙伴启用步骤（推荐：settings 合并）

```bash
# 1) 渲染绝对路径
bash plugin/xdf-workbuddy-expert-pack/scripts/render-settings.sh --merge

# 2) 把 settings.rendered.json 里的 SessionStart 条目 APPEND 到
#    ~/.workbuddy/settings.json 的 hooks.SessionStart 数组
#    （保留已有 teamai hooks，不要整段替换）

# 3) 把 agents/cloudbase-baas-expert.md 粘进 WorkBuddy 专家 / 系统提示
#    或复制到 ~/.workbuddy/agents/（若伙伴用本地 agents）

# 4) 安装 BaaS skill 到本机 skill 面（Trust / MCP 之前也要能 Skill()）
bash plugin/xdf-workbuddy-expert-pack/scripts/install-skill.sh
# 期望：~/.workbuddy/skills/minimal-web-baas-demo/SKILL.md 存在

# 5) 配置 CloudBase 连接器（Trust 后才可用 searchKnowledgeBase；Step0 不依赖它）

# 6) 新开 WorkBuddy 会话，cwd 选空项目目录；引导凭据时检查：
#    cat <cwd>/.cloudbase-prewarm/state.json      # status=ready
#    cat <cwd>/.cloudbase-sites/preview.json     # internalUrl @ 17173..17272
#    保持 sibling plugin/cloudbase-sites 可用（或设 CLOUDBASE_SITES_BIN）
```

可选：若必须用本地 Agent frontmatter hooks（不推荐），才在 settings 加：

```json
{ "allowUntrustedFrontmatterHooks": true }
```

本包 **不**依赖该开关。

## 无 hooks 时的回退

专家正文 §1b 已含便携预热：MCP `downloadTemplate` + `npm install`。  
hooks 装不上时仍可改善体验，但弱于 SessionStart 后台任务。Preview 回退：Sites CLI 不可用时才允许 `npm run dev`（并注明端口不确定）。

## 验收建议

完整可勾选清单见 **[PARTNER-CHECKLIST.md](./PARTNER-CHECKLIST.md)**（merge settings / preview 端口池 / BaaS-first 零云函数）。

摘要：

- [ ] SessionStart 与 teamai hooks **并存**，未互相覆盖
- [ ] 空目录新会话 → ~20–40s 内 `.cloudbase-prewarm/state.json` 为 `ready`
- [ ] 同期出现 `.cloudbase-sites/preview.json`（端口池 17173..17272，非 5173）
- [ ] `Skill("minimal-web-baas-demo")` 在 **未 Trust** 时也可解析（已跑 `install-skill.sh`）
- [ ] 专家不为留言板创建云函数（对齐 skill 契约）
- [ ] `allowUntrustedFrontmatterHooks` **未**因本包被强制打开

## 与上游任务的关系

- Spike：`plugin/workbuddy-template-prewarm`（SessionStart 可行 + Sites preview 对齐）
- Skill：`minimal-web-baas-demo`（BaaS-first 契约）
- Prompt rewrite：ATO artifact `xdf-workbuddy-expert-prompt.md`（本包 Agent 已吸收并加上 skill 指针）
