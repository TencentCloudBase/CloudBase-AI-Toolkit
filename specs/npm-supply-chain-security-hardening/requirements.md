# 需求文档

## 介绍

CloudBase AI Toolkit（本仓库）是腾讯云开发官方提供的 AI 编程增强工具，核心产物包括：

- 发布到 npm 的 `@cloudbase/cloudbase-mcp` MCP Server
- 大量通过 CI 自动同步到 Claude、Cursor、Windsurf、CodeBuddy 等 IDE 及 ClawHub、skills 仓库的技能（skills）和规则配置

该项目具有极高的供应链攻击价值：一旦被成功投毒，攻击者可通过恶意依赖或被污染的生成产物，实现对大量开发者本地环境、CloudBase 凭证的窃取，以及 AI Agent 提示词层面的持久化投毒。

Supabase 于 2026-05-26 发布的《Protecting your Supabase projects from npm supply chain attacks》详细分析了当前 npm 生态的主要攻击路径（Maintainer 账户攻破、Typosquatting、Build Pipeline 投毒），并给出了经过实战验证的分层防御措施。本需求旨在系统性对齐这些最佳实践，消除本项目在 GitHub Actions、包管理、依赖版本控制、CI 流程、文档指引等方面的安全差距，建立可持续的供应链安全 posture。

## 需求

### 需求 1 - GitHub Actions 固定到 Commit SHA

**用户故事：** 作为项目维护者，我希望仓库内所有 GitHub Actions 引用都固定到具体的 commit SHA，而非浮动 tag 或 `@beta`，防止第三方 Action 维护者账户被攻破后通过 tag 覆盖进行投毒，保护发布、同步、构建等关键流程的安全。

#### 验收标准

1. When 任何 `.github/workflows/*.yml` 或 `.github/workflows/*.yaml` 文件中出现 `uses:` 引用第三方 Action 时，the 系统 shall 将其替换为 40 字符完整 commit SHA，并以 `# vX.Y.Z` 形式保留原版本号作为注释。
2. When 执行 `actions/checkout`、`actions/setup-node`、`actions/github-script` 等核心 Action 时，the 系统 shall 使用固定 SHA 而非 `@v4` / `@v6` 等 tag。
3. When 存在 `anthropics/claude-code-action@beta` 等使用 branch 或 pre-release tag 的 Action 时，the 系统 shall 改为使用固定 SHA 或移除该高风险用法。
4. When 未来新增或更新 workflow 时，the CI 系统 shall 在 compat-check 或 PR 检查中验证是否存在未 pin SHA 的 Action。
5. When 使用 Dependabot / Renovate 更新 Action 时，the 系统 shall 仅接受将其更新为新 commit SHA 的变更。

### 需求 2 - 包管理器供应链防护加固

**用户故事：** 作为开发者与 CI 维护者，我希望项目采用现代包管理器防护能力（版本时效隔离 + 脚本执行白名单 + 外来子依赖阻断），使恶意包在发布后 24-72 小时内无法被本项目 CI 立即引入，显著降低供应链攻击成功率。

#### 验收标准

1. When 在根目录或 `mcp/` 目录执行安装时，the 系统 shall 默认使用支持 `minimumReleaseAge`（或等效）的包管理器配置（优先 pnpm 11+，或 npm 11+ 配合 `.npmrc`）。
2. When 配置生效后，the 新发布的 npm 包 shall 在至少 3 天（推荐 7 天）内无法被本项目 CI 通过正常 `npm ci` / `pnpm install` 引入。
3. When 根目录和 `mcp/package.json` 中，the 项目 shall 声明精确的 `packageManager` 字段（包含版本 + sha512 hash），并在 CI 中通过 `corepack enable` 强制使用该版本。
4. When 存在 `pnpm-workspace.yaml` 或 `.npmrc` 时，the 配置 shall 同时启用 `blockExoticSubdeps`（或 npm 等效的 `allow-git=root` 等限制）。
5. When CI 运行 `npm ci` 或 `pnpm install` 时，the 流程 shall 明确记录并阻断任何违反 quarantine 策略的安装尝试。

### 需求 3 - 安全敏感依赖精确版本 Pinning

**用户故事：** 作为安全负责人，我希望所有涉及 CloudBase 认证、凭证处理、MCP 协议通信、敏感网络请求的依赖都使用精确版本号（而非 `^` 或 `~` 范围），避免攻击者通过次要版本升级植入恶意代码。

#### 验收标准

1. When `package.json` 中声明 `@cloudbase/manager-node`、`@cloudbase/*` 系列、`@modelcontextprotocol/sdk` 等安全敏感依赖时，the 版本声明 shall 使用精确版本（如 `5.5.0`），禁止使用 `^5.3.1`。
2. When 存在其他处理认证、密钥、云 API 调用、文件系统访问的 runtime 依赖时，the 项目 shall 在 requirements review 阶段明确标记并执行精确 pinning。
3. When 依赖更新时，the 变更 PR shall 要求人工 review lockfile diff，并说明该依赖的安全敏感性。
4. When 发现仍有使用 `^` 的安全敏感依赖时，the 静态检查或 CI shall 发出明确警告或阻断合并。

### 需求 4 - npm 生命周期脚本默认禁用

**用户故事：** 作为开发者，我希望项目在安装依赖时默认禁止所有包的 `preinstall` / `install` / `postinstall` 生命周期脚本执行，仅对极少数必要的 native 编译包进行白名单放行，从而切断绝大部分供应链恶意载荷的执行路径。

#### 验收标准

1. When 根目录或 `mcp/` 目录执行 `npm install` / `npm ci` 时，the 环境 shall 默认应用 `ignore-scripts=true`（通过 `.npmrc` 或 CI 参数）。
2. When 使用 pnpm 时，the 配置 shall 通过 `allowBuilds` 明确白名单仅允许必要的包（如 bcrypt、sharp 等）执行构建脚本。
3. When CI 中已存在 `npm ci --ignore-scripts` 的 workflow 时，the 做法 shall 被标准化并推广到所有执行安装的 workflow。
4. When 某依赖确实需要运行 install 脚本时，the 变更 shall 在 PR 中显式说明理由并获得安全 review 批准。

### 需求 5 - 发布与审计流程增强

**用户故事：** 作为发布负责人，我希望 npm 发布流程增加签名审计步骤，并强化现有 provenance 机制，使任何可疑的包版本变更都能被及时发现和阻断。

#### 验收标准

1. When 执行 `npm-publish.yaml` 发布流程时，the 工作流 shall 在 publish 前增加 `npm audit signatures`（或等效）步骤。
2. When 发布使用 provenance 时，the 配置 shall 保持开启，并确保 OIDC token 最小权限原则。
3. When 出现 lockfile 或依赖的大批量异常变更时，the 发布相关 workflow shall 增加人工确认环节或阻断自动发布。
4. When 发布产物生成时，the 系统 shall 记录关键依赖的完整解析信息，便于事后溯源。

### 需求 6 - 高风险 Workflow 模式整改

**用户故事：** 作为 CI 安全维护者，我希望清理仓库中已知的高风险 workflow 模式（未 pin 的第三方 Action、PR 触发时注入生产密钥、全局安装未锁定 CLI 等），消除明显的攻击入口。

#### 验收标准

1. When `ai-dev.yaml` 中引用 `anthropics/claude-code-action@beta` 时，the 系统 shall 改为使用固定 commit SHA 或采用更安全的替代方案。
2. When 任意 workflow 在 `pull_request` 触发时需要访问敏感密钥（TENCENTCLOUD_*、CLOUDBASE_* 等）时，the 流程 shall 仅在非 fork PR 或受保护分支上才注入密钥。
3. When CI 中执行 `npm install -g` 安装 CLI 工具时，the 命令 shall 改为使用精确版本或通过 corepack / 锁定文件管理。
4. When 跨仓库推送（skills repo、examples、clawhub 等）使用的 token 时，the 权限 shall 被审查并限制为最小必要范围。

### 需求 7 - 供应链安全文档与 AI Agent 指引

**用户故事：** 作为开发者与使用本工具的 AI Agent，我希望仓库提供清晰、可被 Agent 直接消费的 npm 供应链安全指南和审计 prompt，使贡献者和 AI 都能按照统一标准维护项目安全卫生。

#### 验收标准

1. When 开发者或 AI Agent 查看仓库时，the 系统 shall 在 `doc/` 目录下提供 `npm-security.md`（或 `SECURITY.md`）文档，内容对齐 Supabase 官方指南。
2. When 文档中，the 系统 shall 包含适配本项目的 Agent 审计 prompt（可直接粘贴给 Claude Code、Cursor、Codex 等使用）。
3. When AGENTS.md 或项目根规则更新时，the 供应链安全要求 shall 被同步纳入，作为所有变更的默认约束。
4. When 新增或修改 workflow、package.json 时，the 相关变更说明 shall 引用供应链安全文档中的对应条款。

### 需求 8 - 依赖更新自动化策略

**用户故事：** 作为维护者，我希望引入受控的依赖自动更新机制（Dependabot 或 Renovate），并配置安全的更新策略，使安全补丁能及时到达，同时避免未经验证的版本被自动合并。

#### 验收标准

1. When 项目启用 Dependabot / Renovate 时，the 配置 shall 对 GitHub Actions 和 npm 依赖分别设置不同的更新频率和自动合并条件。
2. When 安全敏感依赖或 Actions 发生更新时，the 更新 PR shall 默认设置为需要人工 review。
3. When 配置生效后，the 项目 shall 在 README 或开发文档中说明依赖更新流程和 review 要求。

---

**非功能性要求（隐含验收）：**

- 所有变更必须通过现有 `compat-check.yml` 等质量门禁。
- 不得引入新的高权限 token 或扩大现有 token 权限范围。
- 所有安全加固措施应尽量对日常开发体验影响最小（例如通过配置文件而非强制所有开发者立即切换包管理器）。
- 加固完成后，应能在 CI 中通过模拟的“新恶意包发布”场景验证防护能力（可作为后续增强项）。