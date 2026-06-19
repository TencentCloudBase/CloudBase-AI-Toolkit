# 需求文档

## 介绍

CloudBase Sites 需要在现有 Claude Code / CodeBuddy 插件基础上补充 Codex 插件形态，使 Codex 用户可以安装并使用 CloudBase 的站点创建、预览、版本保存、部署、回滚和后端能力。该能力参考 Codex Sites 的 save -> deploy 心智，但实际托管、数据库、存储、认证、云函数和云托管能力由 Tencent CloudBase 与 `cloudbase-mcp` 提供。

本需求不追求复制 OpenAI 官方 Sites 的托管控制台或访问控制面板，而是让 CloudBase Sites 在 Codex 中成为可安装、可调用、可验证的 CloudBase 全栈建站插件。实现时需要复用现有 `plugin/cloudbase-sites` 的 CLI、skills、MCP 配置和运行时逻辑，同时隔离 Claude Code / CodeBuddy 专属 manifest 与 hook 行为，避免破坏现有宿主。

## 需求

### 需求 1 - Codex 插件元数据与安装入口

**用户故事：** 作为 Codex 用户，我希望能以 Codex 插件的形式安装 CloudBase Sites，从而在 Codex 中直接调用 CloudBase 建站和部署能力。

#### 验收标准

1. When Codex 读取 `plugin/cloudbase-sites` 插件目录时，the CloudBase Sites plugin shall provide a valid `.codex-plugin/plugin.json` manifest with name `cloudbase-sites`, display name `CloudBase Sites`, semver version, author, description, interface metadata, skills path, and MCP server path.
2. When Codex 插件校验脚本运行时，the CloudBase Sites plugin shall pass the local plugin validation without unsupported manifest fields, placeholder values, or missing referenced files.
3. When Codex 用户浏览插件时，the CloudBase Sites plugin shall present CloudBase-oriented descriptions and starter prompts that distinguish it from OpenAI official Sites while preserving the site-building mental model.
4. While preserving existing Claude Code / CodeBuddy support, when Codex metadata is added, the CloudBase Sites plugin shall keep `.claude-plugin/plugin.json` working and shall not rename or remove existing runtime files used by those hosts.

### 需求 2 - 跨宿主复用边界

**用户故事：** 作为插件维护者，我希望 Codex、Claude Code 和 CodeBuddy 复用同一套 CloudBase Sites 核心能力，同时把宿主专属配置隔离开，降低维护成本和兼容风险。

#### 验收标准

1. When maintaining shared behavior, the CloudBase Sites plugin shall keep the shared CLI under `bin/cloudbase-sites` and shared runtime under `lib/` as the single implementation source for init, preview, save, deploy, rollback, versions, and supervisor behavior.
2. When host-specific behavior is required, the CloudBase Sites plugin shall keep host-specific manifests or hook contracts in separate host-facing files instead of embedding Claude-only assumptions into the Codex manifest.
3. When the skill documentation references host-specific lifecycle behavior, the CloudBase Sites plugin shall describe Codex, Claude Code, and CodeBuddy differences accurately enough that agents do not rely on unavailable features.
4. When adding Codex support, the CloudBase Sites plugin shall continue to register `cloudbase-mcp` via the plugin MCP configuration so CloudBase tools remain the source of cloud-side effects.

### 需求 3 - Codex hooks 支持与降级策略

**用户故事：** 作为 Codex 用户，我希望 CloudBase Sites 能自动启动预览和在配置变更后重启预览，但在 hooks 未启用或未信任时仍能通过显式命令工作。

#### 验收标准

1. While Codex hooks are enabled and trusted, when a Codex thread starts in a supported project directory, the CloudBase Sites plugin shall run its SessionStart lifecycle logic to initialize or start preview according to the existing safety rules.
2. While Codex hooks are enabled and trusted, when Codex edits Vite-related config files, package metadata, or environment files, the CloudBase Sites plugin shall trigger a debounced preview restart through `cloudbase-sites preview --restart`.
3. While Codex hooks are disabled, untrusted, or unavailable, when the user asks for preview status, save, deploy, versions, or rollback, the CloudBase Sites plugin shall still provide explicit CLI-based workflows through the bundled skill.
4. When Codex hook configuration is packaged, the CloudBase Sites plugin shall use a Codex-compatible hook layout and shall not depend on Claude-only environment variables such as `CLAUDE_PLUGIN_ROOT` unless a host-specific branch guarantees them.
5. When a hook command fails, the CloudBase Sites plugin shall avoid blocking the user’s editing action and shall write diagnostics to the configured local log path.

### 需求 4 - 本地状态、日志和 Git 安全

**用户故事：** 作为使用 CloudBase Sites 迭代项目的开发者，我希望预览状态、部署历史和日志可靠保存，但不希望 PID、日志、环境信息或构建产物被误提交。

#### 验收标准

1. When CloudBase Sites records preview runtime state, the CloudBase Sites plugin shall store process-local state such as PID, port, preview URL, and log paths under `<cwd>/.cloudbase-sites/`.
2. When CloudBase Sites records site lifecycle state, the CloudBase Sites plugin shall store site name, saved versions, deployments, current version, and current deploy metadata under `<cwd>/.cloudbase-sites/app.json`.
3. When CloudBase Sites initializes or manages a project, the CloudBase Sites plugin shall ensure `.cloudbase-sites/` is ignored by Git to prevent local state and logs from being committed.
4. When cross-project supervision is active, the CloudBase Sites plugin shall store machine-level registry and supervisor state under `~/.cloudbase-sites/`, not in an individual project repository.
5. When future shared project metadata is needed, the CloudBase Sites plugin shall use a separate commit-safe file such as `.cloudbase/sites.json` and shall keep secrets, logs, PIDs, and transient runtime details out of that file.

### 需求 5 - Save / deploy / rollback 语义一致性

**用户故事：** 作为 CloudBase Sites 用户，我希望保存版本、部署版本和回滚版本的行为清楚一致，避免以为部署的是某个保存版本但实际部署了当前工作区。

#### 验收标准

1. When the user runs `cloudbase-sites save`, the CloudBase Sites plugin shall create a labeled Git checkpoint and append a version record to `app.json.versions[]`.
2. When the user deploys a specified saved version, the CloudBase Sites plugin shall either build exactly that saved version or clearly document and report that it is deploying the current working tree associated with that version label.
3. When deployment phase 1 succeeds, the CloudBase Sites plugin shall emit a JSON `nextAction` instructing the agent to call `manageApps(action="deployApp")` with stable `siteName`, `filePath`, `buildPath`, `framework`, `installCmd`, and `buildCmd`.
4. When deployment phase 2 records a CloudBase access URL, the CloudBase Sites plugin shall append deployment metadata to `app.json.deployments[]` and report a final URL with cache-busting when appropriate.
5. When `manageApps` returns a build identifier or version identifier, the CloudBase Sites plugin shall record that CloudBase build metadata in the deployment entry so future status and log queries can trace the deployed artifact.
6. When the user rolls back to a saved version, the CloudBase Sites plugin shall preserve uncommitted edits through Git stash, reset to the target version, mark newer versions as rolled back, and restart preview unless disabled by user option.

### 需求 6 - 现有 runtime 缺陷修正

**用户故事：** 作为插件维护者，我希望在接入 Codex 前修复现有 CloudBase Sites runtime 中会影响稳定性的明显问题。

#### 验收标准

1. When the user runs `cloudbase-sites status`, the CloudBase Sites CLI shall behave as an alias for `cloudbase-sites preview --status` and shall not recurse indefinitely.
2. When SessionStart reports deployment state, the hook shall read the current V2 `app.json` schema including `versions`, `deployments`, `currentVersion`, and `currentDeploy`.
3. When `save`, `deploy`, or `rollback` perform Git operations, the CloudBase Sites plugin shall avoid staging ignored runtime state such as `.cloudbase-sites/`, `dist/`, `node_modules/`, and `.env`.
4. When generated tool/schema docs are unrelated to this plugin task, the implementation shall not include accidental generated artifact drift in the final change.

### 需求 7 - 验证与文档

**用户故事：** 作为维护者和用户，我希望 CloudBase Sites 的 Codex 插件形态有基本验证和说明，方便本地安装、回归和后续发布。

#### 验收标准

1. When implementation is complete, the CloudBase Sites plugin shall be validated with the local Codex plugin validator.
2. When runtime CLI behavior changes, the implementation shall include focused verification for affected commands such as `status`, `save`, `deploy --skip-build`, and version listing where feasible.
3. When Codex support is added, the repository shall include concise documentation or comments explaining how to install or test CloudBase Sites as a local Codex plugin.
4. When final diffs are reviewed, the implementation shall not include unrelated changes to generated MCP docs or tool JSON unless the task explicitly requires them.
