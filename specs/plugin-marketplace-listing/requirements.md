# 需求文档

## 介绍

CloudBase AI Toolkit 的插件 / Skills / MCP 已在部分产品（如 WorkBuddy 连接器、ZCode 插件市场）完成原生上架，并已支持：

- 自建 marketplace（用户手动 `marketplace add TencentCloudBase/CloudBase-MCP`）
- Open Plugin Spec（`npx plugins add TencentCloudBase/cloudbase-plugin`）

但在 Claude Code / Cursor / Codex 等官方精选目录，以及 Trae / Trae Work / Qoder / QoderWork 等国内产品市场，仍缺少系统化的上架盘点与可提交性评估。

本需求建立一套**可维护的市场矩阵 + 可运行的分析脚本**机制，用于：

1. 盘点相关 AI IDE / Agent 插件市场、连接器市场、MCP/Skill 目录
2. 按多种「上架口径」分别记录 CloudBase 当前状态
3. 输出每个市场的可提交性、门槛、提交流程 checklist 与缺口
4. 支持后续人工提交（本阶段不强制自动提交）

### 已确认决策

| 项 | 选择 |
|----|------|
| 交付物 | **C**：仓库内市场矩阵清单 + 可运行分析脚本 |
| 上架口径 | **D**：官方精选 / 社区目录 / 自建 marketplace / 原生连接器 / OPS 安装等分状态跟踪 |
| 市场范围 | 用户点名市场全部纳入，并按检索结果扩展（见下方清单）；矩阵支持后续增补 |
| 深度（默认） | **A**：可行性分析 + 提交流程 checklist；不在本需求内自动向各平台提交。提交动作作为后续独立任务 |

### 首批覆盖市场（可扩展）

矩阵至少覆盖以下条目（按类别分组；脚本与清单均以机器可读 ID 维护）：

**A. 官方 / 社区 Agent 插件市场**

| ID | 产品 | 市场形态（初判） |
|----|------|------------------|
| `claude-code-official` | Claude Code | Anthropic 官方 curated marketplace（无公开申请通道） |
| `claude-code-community` | Claude Code | Community marketplace（有公开提交表单） |
| `cursor-marketplace` | Cursor | 官方 Marketplace（`cursor.com/marketplace/publish`） |
| `cursor-directory` | Cursor | 社区目录 cursor.directory |
| `codex-universal` | Codex / ChatGPT Work | OpenAI 通用 Plugins Directory（submission portal） |
| `grok-marketplace` | Grok Build | `xai-org/plugin-marketplace` PR |
| `kimi-code-marketplace` | Kimi Code | Official / Third-party / Custom marketplace URL |
| `vscode-agent-plugins` | VS Code | Agent plugins marketplaces（如 copilot-plugins） |
| `github-copilot-cli` | GitHub Copilot CLI | 与 VS Code 共享插件格式 / 市场源 |

**B. 国内 / 伙伴 IDE 原生市场与连接器**

| ID | 产品 | 市场形态（初判） |
|----|------|------------------|
| `workbuddy-connector` | WorkBuddy | 内置连接器市场（已上架） |
| `zcode-plugin` | ZCode | IDE 插件市场（已上架） |
| `codebuddy-plugin` | CodeBuddy | 插件市场 / CLI plugins |
| `codebuddy-code-plugin` | CodeBuddy Code | CLI plugin marketplace |
| `qoder-plugin` | Qoder | 插件市场 / CN 社区 AppHub |
| `qoderwork-marketplace` | QoderWork | Skill / Plugin 自助公开市场 |
| `qoderwork-connector` | QoderWork | Connector（HTTPS MCP + OAuth，商务/合规） |
| `minimax-agent-mcp` | MiniMax Agent | 自定义 MCP / 产品内 marketplace（公开投稿待核实） |
| `trae-mcp-marketplace` | Trae IDE / Trae Work | **内置 MCP 市场**（设置 → MCP → 从市场添加）；与 Claude/Cursor 的 Agent Plugin 市场不是同一形态 |
| `trae-work-skills-marketplace` | Trae Work | **技能市场**（安装 `SKILL.md` / `.skill` / zip）；可本地上传，公开上架通道需核实 |
| `trae-ide-extension` | Trae IDE | VS Code 兼容 **编辑器扩展**市场（`.vsix`）；面向语言/调试类扩展，**不是** CloudBase Agent Plugin 的正确上架通道 |
| `trae-mcp-deeplink` | Trae IDE | MCP 安装 Schema 链接（`trae-cn://.../mcp-import`）；仓库文档已支持一键导入，属分发辅助而非商店上架 |
| `tongyi-lingma` | 通义灵码 | 插件 / MCP 接入（需核实） |
| `baidu-comate` | 百度 Comate | 插件 / MCP 接入（需核实） |
| `windsurf` | WindSurf | MCP / rules 接入；是否有 Agent 插件市场需核实 |

**C. Open Plugin Spec / 本仓库已具备的安装面**

| ID | 说明 |
|----|------|
| `ops-cli` | `npx plugins add` 多 target 安装面（claude-code / cursor / codex / grok / kimi / github-copilot / vscode） |
| `self-marketplace-claude` | 本仓库 `.claude-plugin/marketplace.json` 自建市场 |
| `self-marketplace-codex` | 本仓库 `.agents/plugins/marketplace.json`（优先）/ 根 `marketplace.json` 自建市场 |

**D. MCP / Skill 聚合目录（发现面，非 IDE 原生商店）**

| ID | 说明 |
|----|------|
| `mcp-official-registry` | registry.modelcontextprotocol.io |
| `smithery` | Smithery |
| `pulsemcp` | PulseMCP |
| `glama` | Glama |
| `mcp-so` | mcp.so |
| `clawhub` | ClawHub public skill registry（与既有 clawhub spec 衔接，不重复造发布流水线） |

**E. 配置面 / 文档面（无商店时的兜底）**

覆盖仓库 `IDE_TYPES` 中尚未落入 A–D 的产品（如 Cline、RooCode、Gemini CLI、OpenCode、Augment、Antigravity、Kiro、iFlow、Aider、OpenClaw 等）：至少记录「是否有市场」「若无则推荐安装路径（MCP / Skills / OPS）」状态，避免遗漏。

### 非目标（本阶段不做）

- 不自动向各平台提交上架申请（可输出材料清单，人工提交）
- 不改造各 IDE 产品本身以支持 Open Plugin Spec
- 不替代现有 `doc/ai-agent-plugins.mdx` 用户安装文档（本机制产出维护者用矩阵与报告；用户文档更新可作为后续任务）
- 不重做 ClawHub 发布流水线（已有独立 spec）

## 需求

### 需求 1 - 机器可读的市场矩阵真源

**用户故事：** 作为维护者，我希望有一份仓库内可维护的市场矩阵，按统一字段记录每个市场的形态、上架状态与提交流程入口，这样团队能一眼看到缺口并持续更新。

#### 验收标准

1. When 维护者查看市场矩阵真源时, the CloudBase AI Toolkit shall 在仓库内提供机器可读清单（YAML 或等价格式），每个市场条目至少包含：`id`、`product`、`region`（global/cn/other）、`channel_type`、`listing_statuses`、`submit_url_or_process`、`eligibility`、`blockers`、`evidence_links`、`last_reviewed_at`、`owner`。
2. When 记录上架状态时, the CloudBase AI Toolkit shall 允许同一市场并行维护多种口径状态，至少包括：`official_curated`、`community_directory`、`self_marketplace`、`native_connector_or_builtin`、`open_plugin_spec`、`mcp_or_skill_registry`、`docs_only`；每种状态取值为 `listed` / `submittable` / `blocked` / `not_applicable` / `unknown`。
3. When 新增市场条目时, the CloudBase AI Toolkit shall 不要求修改脚本硬编码列表即可被分析报告纳入（脚本以矩阵文件为输入源）。
4. While 矩阵中存在 `unknown` 或 `last_reviewed_at` 过期条目时, when 生成报告, the CloudBase AI Toolkit shall 在报告中单独标出需复核项。

### 需求 2 - 可运行的上架可行性分析脚本

**用户故事：** 作为维护者，我希望运行一条本地命令就能得到各市场上架可行性与缺口报告，这样在发版前可以定期盘点，而不依赖口头记忆。

#### 验收标准

1. When 维护者执行分析脚本时, the CloudBase AI Toolkit shall 读取市场矩阵真源，输出结构化报告（至少 Markdown；可选 JSON），包含：每个市场的状态摘要、可提交性结论、提交流程 checklist、当前 blockers。
2. When 脚本检查本仓库插件产物时, the CloudBase AI Toolkit shall 校验与上架相关的本地证据是否存在（例如 `.claude-plugin/marketplace.json`、`.agents/plugins/marketplace.json`、根 `marketplace.json`、`plugin/cloudbase/.plugin/plugin.json`、`.claude-plugin/plugin.json`、`.codex-plugin/plugin.json`、Open Plugin Spec 构建产物），并映射到对应市场条目的 `self_marketplace` / `open_plugin_spec` 状态建议。
3. When 某个市场标记为 `submittable` 且提供了公开文档/提交 URL 时, the CloudBase AI Toolkit shall 在报告中给出该市场的提交 checklist（材料要求、入口链接、已知门槛）。
4. While 网络不可用或外部页面不可抓取时, when 脚本运行, the CloudBase AI Toolkit shall 仍能基于矩阵真源与本地产物完成离线分析，并将依赖网络的检查标记为 `skipped` 而非失败退出（除非维护者显式要求严格模式）。
5. When 脚本以严格模式运行且关键本地产物缺失时, the CloudBase AI Toolkit shall 以非零退出码失败并指出缺失路径。

### 需求 3 - 首批市场调研结论落入矩阵

**用户故事：** 作为维护者，我希望首批清单不是空壳，而是带有基于公开文档的初判结论，这样机制一落地就能指导下一步提交优先级。

#### 验收标准

1. When 首版矩阵合入时, the CloudBase AI Toolkit shall 至少包含「介绍」中 A–D 类全部市场 ID，并为每个条目填写初判的 `channel_type`、`listing_statuses` 与 `evidence_links`（允许部分为 `unknown`，但不得缺条目）。
2. When 记录 Claude Code 时, the CloudBase AI Toolkit shall 区分 `claude-code-official`（Anthropic 自行 curated，无公开申请）与 `claude-code-community`（有公开 submission form）。
3. When 记录 Cursor 时, the CloudBase AI Toolkit shall 至少区分官方 Marketplace 与 cursor.directory 社区目录（若后者仍可用）。
4. When 记录 Codex 时, the CloudBase AI Toolkit shall 区分自建 marketplace（已具备）与 OpenAI universal Plugins Directory 官方提交通道。
5. When 记录已上架产品（WorkBuddy / ZCode 等）时, the CloudBase AI Toolkit shall 将对应 `native_connector_or_builtin`（或等价）状态标为 `listed`，并保留证据链接或文档路径。
6. When 记录 Trae 时, the CloudBase AI Toolkit shall 至少拆分并分别跟踪：`trae-mcp-marketplace`、`trae-work-skills-marketplace`、`trae-ide-extension`、`trae-mcp-deeplink`；不得将 VS Code 兼容扩展市场与 MCP/技能市场混为同一上架状态。
7. When 记录无独立 Agent 插件商店、仅支持 MCP/规则配置的 IDE 时, the CloudBase AI Toolkit shall 将商店类状态标为 `not_applicable`，并在 `docs_only` 或推荐安装路径字段中指向现有 ide-setup 文档。

### 需求 4 - 提交材料与优先级视图

**用户故事：** 作为维护者，我希望报告能按优先级列出「现在就能提交」的市场，并给出所需材料清单，这样可以排期人工上架。

#### 验收标准

1. When 生成分析报告时, the CloudBase AI Toolkit shall 产出优先级分组：`ready_to_submit`、`needs_packaging_or_manifest`、`needs_partner_outreach`、`listed`、`not_applicable`、`unknown`。
2. When 某市场属于 `ready_to_submit` 时, the CloudBase AI Toolkit shall 列出建议提交材料（例如：公开 GitHub 仓库 URL、plugin manifest 路径、README、logo、隐私/支持链接、测试说明），并标注仓库内已有 / 缺失项。
3. When 某市场属于 `needs_packaging_or_manifest` 时, the CloudBase AI Toolkit shall 明确缺少的产物类型（例如 Cursor 所需 `.cursor-plugin/plugin.json` / marketplace.json、Qoder 所需 connector 声明等），而不是仅写「不可提交」。
4. While 本需求范围内, when 维护者查看报告, the CloudBase AI Toolkit shall 不自动执行对外提交；报告须明确标注「人工提交」。

### 需求 5 - 可复用的维护约定与测试

**用户故事：** 作为维护者，我希望矩阵与脚本有基本测试和维护约定，避免清单腐烂或脚本与真源脱节。

#### 验收标准

1. When 矩阵 schema 或关键字段变更时, the CloudBase AI Toolkit shall 提供校验（脚本内建校验或测试），拒绝缺少必填字段的条目。
2. When 运行相关自动化测试时, the CloudBase AI Toolkit shall 至少覆盖：矩阵可解析、必填字段完整、脚本在离线模式下可成功生成报告、本地 marketplace/plugin 产物检查与仓库现状一致。
3. When 文档说明本机制时, the CloudBase AI Toolkit shall 在 `specs/plugin-marketplace-listing/` 内提供简短使用说明（如何更新矩阵、如何跑脚本、如何解读报告）；不强制同步改用户侧 README，除非后续单独开文档任务。
4. When 发现新的目标市场时, the CloudBase AI Toolkit shall 允许仅追加矩阵条目即可纳入下一轮报告，无需改产品代码。

## 假设与风险

1. **深度默认 A**：首版只做分析与 checklist；若需直接提交，另开任务并按市场拆分。
2. **外部政策易变**：各平台提交入口、审核标准会变化；矩阵以 `last_reviewed_at` + evidence 链接对抗过期。
3. **「上架」语义混杂**：同一产品可能同时有官方 curated、社区目录、自建 marketplace；必须分状态，禁止单一布尔字段。
4. **国内产品公开文档不全**：Trae Work / 部分 CN IDE 的第三方上架通道可能需商务对接；此类标 `needs_partner_outreach` / `unknown`，不强行写成可自助提交。
5. **MCP 目录与 IDE 商店分开跟踪**：避免把 Smithery 等发现面误当成 Cursor/Claude 官方上架完成。
