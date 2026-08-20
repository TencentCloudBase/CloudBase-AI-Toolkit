# 📦 Release Assets 挂载盘点（对照 Kimi zip 流程）

> 更新：2026-08-20（v2.30.1）
> 背景：Kimi 插件已落地 release zip 流程（`pack-kimi-plugin.mjs` + `release-plugin-zips.yml`，v2.30.0 起 `cloudbase-kimi.zip` 挂在 release assets）。本文盘点仓库所有对外插件包/分发物，判定哪些应挂 release assets、哪些走独立 registry。

## 一、分发物清单

| # | 分发物 | 打包脚本 | 当前分发方式 | 对接方/上架渠道 | 需要 zip-url？ |
|---|--------|---------|-------------|----------------|---------------|
| 1 | Kimi 插件包 `cloudbase-kimi.zip` | ✅ `scripts/pack-kimi-plugin.mjs` | ✅ release assets（v2.30.0 起） | Kimi Code / Kimi Work 插件市场 | ✅ 已满足 |
| 2 | Qoder 插件包 `cloudbase-qoder.zip` | ✅ `scripts/pack-qoder-plugin.mjs` | ⚠️ 仅手动打包（QoderWork 上架时上传） | QoderWork / Qoder IDE 市场 | ✅ 需要（上架评审、下载、分享用稳定 URL） |
| 3 | Qoder Skill 包 `cloudbase-skill.zip` | ✅ `scripts/pack-qoder-skill.mjs` | ⚠️ 仅手动打包 | QoderWork Skills 市场 | ✅ 需要 |
| 4 | Claude 插件（`.claude-plugin/` + `marketplace.json`） | ❌ 无 zip | 独立仓库分发：`push-plugin-repos.yaml` 同步 `TencentCloudBase/cloudbase-plugin`，Claude 从 marketplace/仓库安装 | Claude Code 插件市场 | ❌ 不需要 |
| 5 | Cursor 插件（`.cursor-plugin/`，由 `build-open-plugin-spec.mjs` 生成） | ❌ 无 zip | 独立仓库分发（同上） | Cursor 插件市场 | ❌ 不需要 |
| 6 | Codex 插件（`.codex-plugin/`） | ❌ 无 zip | 独立仓库分发（同上） | Codex 插件市场 | ❌ 不需要 |
| 7 | Open Plugin Spec 包（`.plugin/` + `mcp.json`） | ⚙️ `build-open-plugin-spec.mjs`（生成 manifest） | 独立仓库分发：`cloudbase-plugin` / `cloudbase-sites-plugin` | 各 IDE 通用 | ❌ 不需要 |
| 8 | ClawHub / SkillHub skills | ✅ `build-clawhub-publish-artifacts.mjs` | 独立 registry：`publish-clawhub-registry.yml` | ClawHub / SkillHub | ❌ 不需要（registry 自带版本与下载） |
| 9 | Skills 仓库（`TencentCloudBase/skills`） | ✅ `build-skills-repo.mjs` | 独立仓库：`push-skills-repo.yaml` | OpenClaw 等 | ❌ 不需要 |
| 10 | Allinone skill（`TencentCloudBase/cloudbase-skills`） | ✅ `build-allinone-skill.ts` | 独立仓库：`push-allinone-skill.yml` | CodeBuddy 等 | ❌ 不需要 |
| 11 | npm 包 `@cloudbase/cloudbase-mcp` | ✅ pnpm build + publish | npm registry：`npm-publish.yaml` | 所有 IDE（npx 拉取） | ❌ 不需要（npm 即 registry） |
| 12 | Gemini 扩展（`gemini-extension.json` + `GEMINI.md`） | ❌ 无 | 仓库内 manifest，按需分发 | Gemini | ❌ 暂不需要 |

## 二、缺口判定

### 应挂 release assets 但当前没挂（本次补齐）
- **#2 Qoder 插件包**：已有 `pack-qoder-plugin.mjs`，但从未挂到 release assets（release 只有 kimi zip）。QoderWork 上架需 zip 物料，挂 assets 后获得稳定 URL，评审/下载/分享均可直接引用。
- **#3 Qoder Skill 包**：同上，已有 `pack-qoder-skill.mjs`，未挂 assets。

### 已挂（无需动作）
- **#1 Kimi 插件包**：v2.30.0 起每次 release 自动挂载。

### 走独立 registry / 独立仓库，不需要挂 release assets（无需动作）
- **#4/#5/#6/#7 Claude / Cursor / Codex / Open Plugin Spec**：已有 `push-plugin-repos.yaml` 自动同步 `TencentCloudBase/cloudbase-plugin` 独立仓库，各 IDE 市场从仓库/marketplace 安装；若再挂 zip 会形成双份分发面，白名单维护成本高（各 IDE 内容边界不同），收益低。
- **#8 ClawHub/SkillHub**：独立 registry（`publish-clawhub-registry.yml`），版本与下载由 registry 承载。
- **#9/#10 skills / allinone 仓库**：独立 GitHub 仓库分发。
- **#11 npm 包**：npm registry 本身就是分发载体。
- **#12 Gemini**：暂无 zip 需求，后续若 Gemini 扩展市场要求 zip 再补。

## 三、建议方案（已实施）

统一扩展 `release-plugin-zips.yml`，白名单打包 + 上传三个 zip（upload 步骤 `gh release upload $tag dist/*.zip --clobber` 天然支持多 zip）：

```yaml
# 白名单（每个 release 自动打包上传）
- cloudbase-kimi.zip    # pack-kimi-plugin.mjs  Kimi 插件（自包含 routing skill）
- cloudbase-qoder.zip   # pack-qoder-plugin.mjs  Qoder 插件（整目录）
- cloudbase-skill.zip   # pack-qoder-skill.mjs   QoderWork 入口 skill（skills/cloudbase）
```

### 命名规则（与 kimi 一致）
- **zip 名版本无关**：`cloudbase-kimi.zip` / `cloudbase-qoder.zip` / `cloudbase-skill.zip`
- **版本由 release tag 承载**（如 v2.30.1），zip-url 跨 release 稳定，对接方无需跟随版本改 URL
- 已同步修改：`pack-qoder-plugin.mjs`、`pack-qoder-skill.mjs` 默认输出名去掉 `v{version}` 后缀（保留 `--out` 自定义能力）

### 不纳入 zip 白名单的说明
- `cloudbase-sites` 插件：与 cloudbase 插件同构但走 `cloudbase-sites-plugin` 独立仓库分发，暂无 zip 需求；若后续上架需要，可仿照 `pack-qoder-plugin.mjs` 新增脚本并加入白名单。

## 四、验证记录

本地（macOS, zip CLI）跑通三个脚本，产物结构正确：

| 产物 | 大小 | 顶层结构 |
|------|------|---------|
| `dist/cloudbase-kimi.zip` | 0.46 MiB | `kimi.plugin.json`、`skills/cloudbase/`（+ 28 sibling skills 组装进 `references/`） |
| `dist/cloudbase-qoder.zip` | 0.57 MiB | `.qoder-plugin/`、`.plugin/`、`.cursor-plugin/`、`.mcp.json`、`agents/`、`skills/` 等插件内容 |
| `dist/cloudbase-skill.zip` | 21 KiB | `cloudbase/SKILL.md`（skill 目录为 zip 根） |

`pack-qoder-plugin.mjs` 内置的 `build-open-plugin-spec.mjs` 在 CI 中可正常执行（node 已就绪），本地跑完生成物与仓库一致（无 dirty diff）。

## 五、回填历史 release（可选）

若需给历史 release 补挂 qoder zip（如 v2.30.1），可用 `release-plugin-zips.yml` 的 `workflow_dispatch` 输入 tag 回填；zip 内容按该 tag 的代码打包。
