# 外部 AI IDE 生态调研

> 调研时间：2026-07-15
> 调研目的：判断 CloudBase MCP 还值得为哪些 IDE 做原生插件

## 核心结论

**几乎所有主流 AI IDE 都已原生支持 MCP 协议。** 对 CloudBase MCP 而言，绝大多数 IDE 只需提供"配置下载 + skills/rules 包"即可覆盖；真正值得投入做"原生插件包"的只有 **Cursor** 和 **Antigravity** 两个——且它们的 plugin 本质也是 `skills + rules + MCP servers + hooks` 的 bundle，并非传统 VSCode 扩展。

## 逐工具调研表

| # | IDE/工具 | 原生插件 | 扩展机制 | MCP 支持 | 开发成本 | 热度 | 是否值得做原生插件 |
|---|---------|---------|---------|---------|---------|------|------------------|
| 1 | **Cursor** | ✅ YES | 自定义 plugin（manifest: skills/agents/commands/hooks/MCP）+ 官方 Marketplace | ✅ 原生 | 低-中 | 高 | **值得**（做 plugin 包） |
| 2 | **Windsurf** | 部分 | VSCode fork + MCP 配置 | ✅ 原生 | 低 | 中-高 | 只需配置下载 |
| 3 | **Trae (字节)** | ✅ YES | Skills 插件系统 + MCP 市场 + Agent Skill 上传 | ✅ 原生（v1.1） | 中 | 中（国内高） | 看情况（国内可做 Skill） |
| 4 | **Qoder (阿里)** | 部分 | 独立 IDE + JetBrains/VSCode 插件 + MCP 工具 | ✅ | 低 | 中（国内） | 只需配置下载 |
| 5 | **Antigravity (Google)** | ✅ YES | 自定义 plugin（skills/rules/MCP/hooks bundle）+ MCP Store | ✅ 原生 | 低-中 | 中-高（上升） | **值得**（做 plugin 包） |
| 6 | **Kiro (AWS)** | 部分 | Code OSS fork + Hooks + Skills + MCP | ✅ 原生 | 低 | 中 | 只需配置下载 |
| 7 | **GitHub Copilot** | 已转向 MCP | 2025-11 废弃 GitHub App Extensions，转向 MCP + copilot-plugins（skills/hooks） | ✅ 原生 | 低 | 高 | 只需配置下载（可做 plugin 包） |
| 8 | **Augment Code** | ❌ NO | VSCode/JetBrains 扩展 + Easy MCP | ✅ 原生 | 低 | 中（企业） | 只需配置下载 |
| 9 | **Cline** | 部分 | VSCode 扩展 + MCP（"add a tool"） | ✅ 原生 | 低 | 中-高（开源） | 只需配置下载 |
| 10 | **RooCode** | ❌ | **已于 2026-05-15 关闭**，社区 fork 出 ZooCode | — | — | — | **不值得**（已死） |
| 11 | **Aider** | ❌ NO | 终端工具 + YAML 配置 MCP（2025 起为 MCP client） | ✅ | 低 | 中（开源终端） | 只需配置下载 |
| 12 | **Continue.dev** | ❌ NO | VSCode/JetBrains 扩展 + config.yaml 配置 MCP | ✅ 原生 | 低 | 中（开源） | 只需配置下载 |
| 13 | **Zed** | ✅ YES | 独立 Rust extension API | ✅ 原生 | 高（Rust） | 中（开发者向） | 只需配置下载（原生扩展成本高） |
| 14 | **Cody (Sourcegraph)** | ❌ NO | VSCode/JetBrains/VS 扩展 | ✅（2025-05 起） | 低 | 中（企业） | 只需配置下载 |

## 三个关键趋势

1. **MCP 已成行业标准**：14 个工具中 13 个原生支持 MCP（RooCode 已死除外）。GitHub Copilot 甚至主动废弃自有 Extensions 转 MCP，印证 MCP 赢了标准战。
2. **"原生插件"重新定义**：Cursor/Antigravity 的新一代 plugin 规范 ≠ 传统 VSCode 扩展，而是 `MCP servers + skills + rules + hooks` 的声明式 bundle，开发成本接近"配置下载"。
3. **VSCode fork 派**（Windsurf/Kiro/Qoder/Trae）天然兼容 VSCode 扩展配置，无需单独适配。

## 优先级矩阵建议

| 优先级 | IDE | 建议动作 | 理由 |
|--------|-----|---------|------|
| **P0 原生插件包** | Cursor、Antigravity | 产出 `.cursor-plugin/plugin.json` / Antigravity plugin manifest，bundle = CloudBase MCP server + skills + rules + hooks | 有独立 plugin 生态 + 官方 Marketplace 分发渠道，高曝光，成本低（声明式） |
| **P1 配置下载 + skills 包** | GitHub Copilot、Cline、Windsurf、Kiro、Trae、Continue.dev、Cody、Augment Code、Aider、Qoder | 在 setup 工具中提供 MCP 配置 + rules/skills 镜像即可 | 均原生支持 MCP，配置即用；无独立插件生态，做原生插件性价比低 |
| **P2 暂时忽略** | RooCode（已关闭）、Zed | 不投入 | RooCode 已死；Zed 原生扩展需 Rust 且 MCP 已覆盖 |

## 对 CloudBase MCP 项目的具体建议

1. **setup 工具现状已覆盖主要面**：现有 `ALL_IDE_FILES` / `IDE_FILE_MAPPINGS` 机制（配置下载）足以应对 P1 全部 IDE。
2. **新增 P0 动作**：为 Cursor 和 Antigravity 各产出一份 plugin bundle（manifest + skills + rules + MCP server 注册），参考 `github.com/cursor/plugins` 规范。
3. **RooCode 清理**：建议从 `setup.ts` 的 `IDE_TYPES` 中移除或标注 deprecated，引导用户转向 Cline/ZooCode。
4. **Trae/Qoder 国内市场**：若重视国内份额，可额外为 Trae Skills 市场做一次适配（成本低，收益集中在国内）。
