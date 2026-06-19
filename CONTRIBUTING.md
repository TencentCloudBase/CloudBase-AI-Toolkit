# 贡献指南

感谢你考虑为 CloudBase AI ToolKit 做出贡献！在提交贡献之前，请花点时间阅读以下指南。

## 项目安装

1. 克隆项目
```bash
git clone https://github.com/TencentCloudBase/CloudBase-AI-ToolKit.git
cd CloudBase-AI-ToolKit
```

2. 安装依赖
```bash
# 使用 npm
npm install

# 或使用 yarn
yarn install

# 或使用 pnpm
pnpm install
```

## 开发流程

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 提交规范

为了自动生成 changelog，请遵循以下提交规范：

- `feat`: ✨ 新功能
- `fix`: 🐛 修复 bug
- `docs`: 📝 文档更新
- `style`: 💄 代码格式（不影响代码运行的变动）
- `refactor`: ♻️ 重构（既不是新增功能，也不是修改 bug 的代码变动）
- `perf`: ⚡ 性能优化
- `test`: ✅ 增加测试
- `chore`: 🔧 构建过程或辅助工具的变动

提交示例：
```bash
git commit -m "feat: 添加自动生成 changelog 功能"
git commit -m "fix: 修复部署失败的问题"
git commit -m "docs: 更新 README 文档"
```

## 版本发布

仓库不再使用旧版脚本化版本发布链路维护发布流程。

当前发布流程以仓库内的 git workflow 说明为准，维护者应参考：

- `skills/git-workflows/references/source-commands.md` 中的 `version_publish_main`
- `mcp/package.json` 中由 `bumpp` 驱动的版本号更新

发布时需要额外执行：

```bash
node scripts/sync-skill-versions.mjs --version X.Y.Z
```

这个脚本会把 `config/source/skills/*/SKILL.md` 与 `config/source/guideline/cloudbase/SKILL.md` 中的 `version` 同步到当前发布版本。

## Rules 管理流程

项目现在采用“最小源 + 生成兼容层”的方式维护 AI IDE 配置，不再依赖仓库内硬链接副本。

### 核心原则

1. **模块化 skill 源**：在 `config/source/skills/` 中维护
2. **总入口 guideline 源**：在 `config/source/guideline/` 中维护
3. **IDE / MCP 机器配置源**：在 `config/source/editor-config/` 中维护
4. **Claude skills 兼容镜像**：保留在 `config/.claude/skills/`，由 source 自动同步，不要手改
5. **CodeBuddy 插件专属源**：在 `config/codebuddy-plugin/` 中维护
6. **兼容产物**：统一生成到 `.generated/compat-config/`，不要手改

### 当前目录关系

```
config/source/skills/      # 模块化 skills 唯一语义源
config/source/guideline/   # 总入口 guideline 唯一语义源
config/source/editor-config/ # IDE / MCP 配置唯一机器源
config/.claude/skills/     # Claude skills 兼容镜像（生成并提交）
config/codebuddy-plugin/   # CodeBuddy 插件保留源

.generated/compat-config/  # 兼容产物输出目录（生成）
.skills-repo-output/       # skills 仓库发布产物（生成）
```

### 日常维护流程

大多数情况下，日常修改只需要改源目录并提交，不需要像以前一样手动跑同步脚本：

1. 修改 `config/source/skills/`、`config/source/guideline/`、`config/source/editor-config/`
2. 如果是 CodeBuddy 插件专属内容，修改 `config/codebuddy-plugin/`
3. `config/.claude/skills/` 会由 CI 自动从 `config/source/skills/` 同步，不要手改
3. 如果 skill 内容变更影响 prompts 文档，运行：
   ```bash
   node scripts/generate-prompts-data.mjs && node scripts/generate-prompts.mjs
   ```
4. 提交源码和需要跟随提交的文档产物

兼容文件的生成、外部模板同步、skills repo 发布和 all-in-one 发布，主要由 CI / workflow 负责。

### 本地验证与手动同步

只有在你需要本地验证兼容面，或者要手动同步外部模板仓库时，才运行下面这些脚本：

```bash
node scripts/sync-claude-skills-mirror.mjs
node scripts/build-compat-config.mjs
node scripts/diff-compat-config.mjs
node scripts/sync-config.mjs
```

脚本含义：

- `sync-claude-skills-mirror.mjs`：将 `config/source/skills/` 同步到仓库内保留的 `config/.claude/skills/` 兼容镜像
- `build-compat-config.mjs`：从最小源生成 `.generated/compat-config/`
- `diff-compat-config.mjs`：校验兼容契约（机器配置与结构为阻断项，文本类 rules / skills 内容漂移仅报告）
- `sync-config.mjs`：将兼容产物同步到外部 `awsome-cloudbase-examples` 仓库

### 如何新增模块 Skill

1. 在 `config/source/skills/[module-name]/SKILL.md` 中创建模块
2. 如该模块还包含补充文档，可与 `SKILL.md` 并列放置
3. 如果需要更新 prompts 展示，运行：
   ```bash
   node scripts/generate-prompts-data.mjs && node scripts/generate-prompts.mjs
   ```

### 如何修改总入口 guideline

1. 修改 `config/source/guideline/cloudbase/SKILL.md`
2. 这会影响：
   - all-in-one skill 构建
   - skills repo 里的 `cloudbase-guidelines`
3. 如需本地验证 all-in-one，可运行：
   ```bash
   npx tsx scripts/build-allinone-skill.ts --dir /tmp/allinone-build
   ```

### 如何新增 IDE 支持

新增 IDE 时，不再修改硬链接脚本，而是更新生成链和消费映射：

1. 在 `config/source/editor-config/` 中添加该 IDE 所需的机器配置或兼容说明文件
2. 更新 `scripts/build-compat-config.mjs`，让生成器输出该 IDE 的兼容产物
3. 更新 `mcp/src/tools/setup.ts` 中的 IDE 枚举、文件映射和描述
4. 运行：
   ```bash
   node scripts/build-compat-config.mjs
   node scripts/diff-compat-config.mjs
   ```
   - 机器可消费配置或目录结构异常会阻断校验
   - rules / skills / guideline 等文本镜像的内容变化会输出 advisory 报告，但不再单独阻断 CI
5. 更新相关文档

### 重要提示

- ⚠️ **不要手改** `.generated/compat-config/` 中的文件
- ⚠️ **不要手改** `config/.claude/skills/`，它是兼容镜像
- ⚠️ **不要把 `config/` 当作通用 rules 源目录**
- ✅ **新增模块**：在 `config/source/skills/` 中创建
- ✅ **修改总控 guideline**：在 `config/source/guideline/` 中修改
- ✅ **修改 IDE / MCP 配置**：在 `config/source/editor-config/` 中修改
- ✅ **需要本地验证时**：运行 `node scripts/diff-compat-config.mjs`

## 对外 Skill 贡献与维护流程

CloudBase AI ToolKit 的对外 Skill（例如对外发布的 Skill 仓库、IDE 集成使用的 all-in-one Skill 等）统一从 `config/source` 系列目录生成，不直接在生成产物目录中维护。

### 1. 修改已有对外 Skill

1. 找到对应模块的源 Skill：
   - 功能模块 Skill：`config/source/skills/[module-name]/SKILL.md`
   - 全局 guideline / 入口 Skill：`config/source/guideline/cloudbase/SKILL.md` 等
2. 在上述源文件中修改说明、约束或行为描述（保持英文注释、中文对外文档的既有风格）
3. 如该修改会影响对外展示的 prompts 文档，建议本地运行：
   ```bash
   node scripts/generate-prompts-data.mjs && node scripts/generate-prompts.mjs
   ```
4. 提交时仅提交 `config/source/*` 及必要的文档产物，不直接提交 `.generated/compat-config/` 与 `.skills-repo-output/` 中的内容（除非明确说明需要）。

### 2. 新增对外 Skill

1. 在 `config/source/skills/[module-name]/SKILL.md` 中创建新的模块化 Skill 文件，推荐按功能维度划分目录：
   - 例如：`config/source/skills/web/`、`config/source/skills/database/`、`config/source/skills/miniprogram/` 等
2. 如果该 Skill 需要在对外 all-in-one Skill 或指南中出现：
   - 在 `config/source/guideline/` 中更新对应入口（例如 `cloudbase/SKILL.md`）
3. 如需要更新 prompts 展示，同样可以运行：
   ```bash
   node scripts/generate-prompts-data.mjs && node scripts/generate-prompts.mjs
   ```
4. 提交 PR 时在描述里简要说明：
   - 新增了哪些模块 Skill
   - 预期对哪些 IDE / 对外集成场景有影响

### 3. 对外 Skill 生成与发布（维护者视角）

一般贡献者只需要修改源目录，生成与发布由 CI 完成；维护者在需要本地验证、调试发布流程时，可参考：

1. 本地验证兼容配置与对外 Skill 产物：
   ```bash
   node scripts/sync-claude-skills-mirror.mjs
   node scripts/build-compat-config.mjs
   node scripts/diff-compat-config.mjs
   ```
   - 生成产物会输出到：
     - `.generated/compat-config/`：IDE / 外部模板使用的兼容配置
     - `.skills-repo-output/`：对外 Skill 仓库发布产物
   - `diff-compat-config.mjs` 现在采用分层校验：
     - machine configs：缺失 / 多出 / 内容变化都会阻断
     - text surfaces：缺失 / 多出会阻断，内容变化仅报告；如需清理后续报告，可再执行 `npm run update:compat-baseline`
2. 如需将配置同步到外部模板 / 示例仓库，可使用：
   ```bash
   node scripts/sync-config.mjs
   ```
   或通过仓库提供的 GitHub Actions（如 `build-zips.yml`、`sync-branch.yml`）进行自动同步和构建。
3. 维护者在评审 PR 时，重点检查：
   - 是否只修改了 `config/source/*` 源目录（以及必要的文档）
   - 是否没有直接修改 `config/.claude/skills/`、`.generated/compat-config/`、`.skills-repo-output/`
   - 是否在 PR 描述中清晰说明了对外 Skill 行为变化

## 代码风格

- 遵循项目的代码风格指南
- 确保所有测试通过

## 提交 Pull Request

1. 确保你的 PR 描述清晰地说明了变更内容
2. 如果可能，添加相关的测试用例
3. 确保你的代码符合项目的代码风格
4. 更新相关文档

## 问题反馈

如果你发现任何问题或有改进建议，请：

1. 使用 GitHub Issues 提交问题
2. 提供详细的问题描述和复现步骤
3. 如果可能，提供相关的代码示例

## GitHub Actions Workflows

项目提供了多个 GitHub Actions workflow，用于自动化配置同步、构建和 issue 处理：

### Build Example Zips

**Workflow**: `.github/workflows/build-zips.yml`

用于同步配置到 cloudbase-examples 仓库并构建 zip 文件。

**使用场景**：
- 需要构建示例模板的 zip 文件
- 需要将构建产物发布为 artifact 供内网系统拉取

**参数**：
- `source_branch`: 源分支（本仓库的分支，默认：main）
- `target_branch`: 目标分支（cloudbase-examples 的分支，默认：master）
- `build_zips`: 是否构建 zip 文件（默认：true）
- `commit_changes`: 是否提交更改到 cloudbase-examples（默认：false）

**使用方法**：
1. 在 GitHub 仓库的 Actions 页面选择 "Build Example Zips"
2. 点击 "Run workflow"
3. 填写参数（可选）
4. 点击 "Run workflow" 按钮

**输出**：
- 如果 `build_zips` 为 true，会在 Actions 页面生成 artifact `cloudbase-examples-zips`，保留 30 天

### Sync Main to Examples

**Workflow**: `.github/workflows/sync-main-to-examples.yml`

当本仓库 `main` 分支发生 push，且变更命中 examples 相关路径时自动触发。

**行为**：
- 先执行 `node scripts/diff-compat-config.mjs` 作为兼容面守门
- 再执行 `node scripts/sync-config.mjs --skip-git`
- 自动同步到 `TencentCloudBase/awsome-cloudbase-examples` 的 `master` 分支
- 如果同步结果没有产生 diff，则跳过 commit / push

### Sync Branch to Examples

**Workflow**: `.github/workflows/sync-branch.yml`

仅用于手动将本仓库的指定分支同步到 cloudbase-examples 的指定分支，不构建 zip 文件，也不替代 `main` 主线的自动同步 workflow。

**使用场景**：
- 需要将某个分支的配置同步到 cloudbase-examples 的对应分支
- 不需要构建 zip 文件

**参数**：
- `source_branch`: 源分支（本仓库的分支，必填）
- `target_branch`: 目标分支（cloudbase-examples 的分支，必填）
- `commit_changes`: 是否提交更改到 cloudbase-examples（默认：true）

**使用方法**：
1. 在 GitHub 仓库的 Actions 页面选择 "Sync Branch to Examples"
2. 点击 "Run workflow"
3. 填写必填参数：`source_branch` 和 `target_branch`
4. 选择是否提交更改
5. 点击 "Run workflow" 按钮

**注意事项**：
- 需要配置 `CLOUDBASE_EXAMPLES_TOKEN` secret（Personal Access Token）用于访问 cloudbase-examples 仓库
- 如果目标分支不存在，workflow 会自动创建
- 创建 PAT 时需要勾选 `repo` 权限

### Issue Auto Processor

**Workflow**: `.github/workflows/issue-auto-processor-simple.yml`

用于让 AI 基于 CodeBuddy CLI 自动分析或修复 GitHub issue，并在需要时创建修复 PR。

**前置配置**：
- repository secret：`CODEBUDDY_AUTH_TOKEN` 或 `CODEBUDDY_API_KEY`
- 如果使用中国版 `CODEBUDDY_API_KEY`，建议额外配置 repository variable：`CODEBUDDY_INTERNET_ENVIRONMENT=internal`
- 仓库 Actions 需允许 `GITHUB_TOKEN` 具有 `contents` / `issues` / `pull-requests` 写权限，并允许 GitHub Actions 创建 PR

**触发方式**：
- 定时：每 4 小时扫描一次符合条件的 open issue
- 手动：在 Actions 页面运行 workflow，并传入 `issue_number`
- 评论命令：在 issue 下评论 `/cloudbase fix`、`/cloudbase continue`、`/cloudbase skip`

**评论命令说明**：
- 只有 `OWNER` / `MEMBER` / `COLLABORATOR` 可以触发
- `issue_comment` 触发依赖 workflow 文件已存在于默认分支；在 PR 分支验证阶段，请先使用 `workflow_dispatch`
- `/cloudbase fix`：强制按修复路径处理当前 issue
- `/cloudbase continue`：重新读取当前 issue 的 title、body、labels 和全部 comments 后继续分析或修复
- `/cloudbase skip`：为当前 issue 打上 `no-ai`，停止自动处理

**处理边界**：
- 自动任务默认只处理创建满 4 小时、且未标记 `ai-processed` / `ai-processing` / `no-ai` 的 open issue
- 每次执行都会基于完整 issue 线程重建上下文，不依赖跨 CI run 的隐藏 session 持久化
- AI 输出为空时会直接标记失败，不会发布空评论
- 只有实际产生代码 diff 时才会创建修复 PR

## 行为准则

- 尊重所有贡献者
- 接受建设性的批评
- 关注问题本身

感谢你的贡献！ 
