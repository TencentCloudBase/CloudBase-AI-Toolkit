# 需求文档

## 介绍

为 CloudBase AI Toolkit 新增一个面向社区发布的通用 skill，名称暂定为 `manage-local-skills`，用于帮助用户统一管理本地维护的 skills 资产。该 skill 需要支持两类输入：

- 已符合 `SKILL.md` 规范的标准 skill 目录
- 来自各类非标准目录结构的“类 skill”资产，例如散落在 IDE 配置目录、规则目录、提示词目录、私有约定目录下的说明文件、脚本和参考资料

该 skill 的目标不是只讲概念，而是要给 Agent 一套可复用的本地 skills 管理工作流，使其能够：识别来源结构、抽取核心信息、重组为标准 skill 目录、校验产物、并把选定 skill 以软链接或复制方式安装到指定 Agent 的 skills 目录下。同时，该 skill 需要支持维护一套可扩展的 Agent/IDE 目录映射规则，便于后续为新的编辑器或 Agent 增加目标安装位置。

该 skill 的安装行为需要参考 `skills` CLI 的实现语义，尤其是：单一 canonical 源目录、按 Agent 目录安装、优先软链接、失败时回退复制、区分 project/global scope、以及保留对通用 `.agents/skills` 与 Agent 专有 skills 目录的统一抽象。该 skill 在本仓库中的源码维护位置属于项目自身 skills，落在 `skills/` 目录。

这个命名强调它解决的是“本地维护的一组 skills 如何被整理、标准化、挂载到不同 Agent 使用”的问题，而不把能力收窄为单纯 installer。

## 需求

### 需求 1 - 识别标准与非标准 skills 来源

**用户故事：** 作为 skill 维护者，我希望 Agent 能先判断输入来源属于标准 skill 还是非标准目录，这样后续迁移和安装动作可以选择正确流程，而不是假设所有来源都已经符合 `SKILL.md` 规范。

#### 验收标准

1. When 用户要求迁移或安装 skills 时，CloudBase AI Toolkit shall 指导 Agent 先识别输入来源是标准 skill、非标准目录，还是混合来源。
2. When 输入来源已经包含可用的 `SKILL.md` 时，CloudBase AI Toolkit shall 指导 Agent 优先按标准 skill 流程处理，而不是重复重建结构。
3. When 输入来源不包含标准 `SKILL.md` 但包含规则、提示词、脚本或说明文档时，CloudBase AI Toolkit shall 指导 Agent 将其识别为可迁移的非标准来源，而不是直接判定为不可用。
4. While Agent 分析非标准来源时, when 来源目录中同时存在说明文档、脚本、模板或编辑器专属配置时，CloudBase AI Toolkit shall 指导 Agent 区分哪些内容应进入主 `SKILL.md`、`references/`、`scripts/` 或 `assets/`。
5. When Agent 无法从来源中识别出稳定的能力边界时，CloudBase AI Toolkit shall 指导 Agent 先向用户确认 skill 的目标、触发场景和非目标场景，再继续迁移。

### 需求 2 - 将非标准目录迁移为标准 skill 结构

**用户故事：** 作为 skill 维护者，我希望 Agent 能把历史上放在各种非标准目录中的 skill 资料迁移成统一的 skill 结构，这样这些能力可以被社区按统一方式安装和复用。

#### 验收标准

1. When 用户要求迁移非标准目录时，CloudBase AI Toolkit shall 指导 Agent 生成符合 `skill-name/SKILL.md` 规范的标准 skill 目录。
2. When Agent 为迁移结果生成 `SKILL.md` 时，CloudBase AI Toolkit shall 要求 frontmatter 至少包含 `name` 与 `description`，并使 `description` 同时描述能力和触发条件。
3. When 非标准来源包含大量细节说明时，CloudBase AI Toolkit shall 指导 Agent 将细节拆分到 `references/`、`scripts/` 或 `assets/`，避免把所有信息堆入主 `SKILL.md`。
4. While Agent 执行迁移时, when 来源文件存在命名不一致、层级过深、或目录语义不清的问题，CloudBase AI Toolkit shall 指导 Agent 进行规范化命名和最小必要重组，并保留可追溯的来源说明。
5. When 非标准来源中的内容不足以形成稳定可复用 skill 时，CloudBase AI Toolkit shall 指导 Agent 明确指出缺失信息，并说明哪些最小补充信息是完成迁移所必需的。

### 需求 3 - 将本地标准 skill 挂载到指定 Agent 目录

**用户故事：** 作为 skill 维护者，我希望即使我只维护一份本地标准 skills 源目录，也可以把其中指定的 skills 挂载到不同 Agent 的目录下，这样我不需要为每个 Agent 复制维护一份内容。

#### 验收标准

1. When 用户要求将某个本地标准 skill 挂载到目标 Agent 时，CloudBase AI Toolkit shall 指导 Agent 支持从单一 skills 源目录选择一个或多个 skills 进行安装。
2. When 目标 Agent 目录与源目录位于同一文件系统并允许软链接时，CloudBase AI Toolkit shall 优先支持通过软链接安装 skills，而不是默认复制文件。
3. When 运行环境不适合软链接、用户显式要求复制、或软链接失败时，CloudBase AI Toolkit shall 支持回退到复制安装模式。
4. While Agent 执行安装时, when 同一个 skill 需要安装到多个 Agent 目录时，CloudBase AI Toolkit shall 保持单一源目录不被重复改写，并明确区分源目录、规范目录和目标 Agent 目录。
5. When 目标路径中已存在同名 skill 时，CloudBase AI Toolkit shall 指导 Agent 在覆盖前检查冲突，并向用户说明将发生覆盖、替换、跳过或更新中的哪一种行为。

### 需求 4 - 对齐 skills CLI 的本地安装模型

**用户故事：** 作为 skill 维护者，我希望这个 skill 管理本地 skills 的效果与 `skills` CLI 尽量一致，这样社区用户可以获得熟悉且可预期的行为，而不是另一套不兼容的安装语义。

#### 验收标准

1. When Agent 设计安装流程时，CloudBase AI Toolkit shall 读取并参考 `skills` CLI 的相关源码实现，而不是只依据官网文档描述推断行为。
2. When Agent 安装 skill 到多个 Agent 时，CloudBase AI Toolkit shall 采用与 `skills` CLI 一致的 canonical source plus per-agent target 思路，避免为每个 Agent 重新生成不同源副本。
3. When 目标 Agent 属于通用型 Agent 时，CloudBase AI Toolkit shall 支持将 skill 直接视为 `.agents/skills` 体系的一部分，并与专有 Agent 路径一并建模。
4. When 安装模式为软链接时，CloudBase AI Toolkit shall 以与 `skills` CLI 一致的方式优先创建相对安全的链接，并在失败时回退到复制模式。
5. When 用户要求 project scope 或 global scope 安装时，CloudBase AI Toolkit shall 支持与 `skills` CLI 同类的 scope 区分，并明确说明各自的目标目录语义。
6. When Agent 无法完全复刻 `skills` CLI 的某个行为时，CloudBase AI Toolkit shall 明确指出差异点，而不是静默采用不同语义。

### 需求 5 - 维护可扩展的 Agent / IDE 映射

**用户故事：** 作为该 skill 的维护者，我希望后续新增一个编辑器或 Agent 时，只需要补充映射规则，就能继续使用同一套迁移与安装工作流。

#### 验收标准

1. When Agent 需要把 skill 安装到目标工具时，CloudBase AI Toolkit shall 指导 Agent 基于一套显式的 Agent / IDE 映射规则解析目标目录，而不是把路径硬编码在正文示例中。
2. When 用户指定新的编辑器或 Agent 类型时，CloudBase AI Toolkit shall 支持通过补充映射配置的方式扩展安装目标，而不要求重写整套 skill 流程。
3. When 某个 Agent 同时支持项目级目录和用户级目录时，CloudBase AI Toolkit shall 指导 Agent 区分 project scope 与 global scope 的安装路径和适用场景。
4. While Agent 处理映射规则时, when 某个 Agent 采用通用 `.agents/skills` 路径或专有路径时，CloudBase AI Toolkit shall 指导 Agent 统一处理两种情况，并说明差异。
5. When 用户请求列出支持的 Agent / IDE 时，CloudBase AI Toolkit shall 支持输出当前已知映射、对应 skills 目录和扩展方式说明。

### 需求 6 - 提供可执行的本地 skills 管理工作流

**用户故事：** 作为社区用户，我希望这个 skill 不只是告诉我“应该怎么做”，还要给出清晰步骤，必要时带脚本资源，这样我能稳定完成本地 skills 的迁移、整理和挂载。

#### 验收标准

1. When 该 skill 被触发时，CloudBase AI Toolkit shall 提供从来源识别、结构分析、标准化输出、安装决策到结果校验的完整工作流。
2. When 迁移或安装动作存在重复性或易错性时，CloudBase AI Toolkit shall 优先提供可复用的脚本入口或脚本模板，而不是只给人工操作说明。
3. When skill 提供脚本资源时，CloudBase AI Toolkit shall 指导 Agent 优先复用脚本完成标准化与安装动作，并在必要时说明参数、输入和输出语义。
4. While Agent 使用该 skill 处理用户请求时, when 用户只想做分析、不想落地修改时，CloudBase AI Toolkit shall 支持仅输出迁移计划、映射结果和拟执行动作，而不直接执行文件写入。
5. When 用户确认执行迁移或安装时，CloudBase AI Toolkit shall 支持把分析阶段产出的计划转换为具体落地动作，而无需重新推导整体流程。

### 需求 7 - 校验、可追溯性与社区可复用性

**用户故事：** 作为社区维护者，我希望迁移后的 skill 和安装结果是可校验、可解释、可复用的，这样别人接手时能看懂来源、结构和目标路径。

#### 验收标准

1. When Agent 完成迁移后的标准 skill 结构时，CloudBase AI Toolkit shall 指导 Agent 检查 `SKILL.md` 必要字段、目录命名和资源归类是否满足标准规范。
2. When Agent 完成安装动作时，CloudBase AI Toolkit shall 指导 Agent 校验目标 Agent 目录中的 skill 是否存在、指向是否正确，或复制结果是否完整。
3. When 迁移来源为非标准目录时，CloudBase AI Toolkit shall 指导 Agent 为迁移结果保留足够的来源说明，使后续维护者能理解该标准 skill 来自何处以及为何如此拆分。
4. While 用户将该 skill 用于社区项目时, when 不同项目存在不同目录结构或 Agent 类型时，CloudBase AI Toolkit shall 允许通过映射和参数化方式复用同一套流程，而不是绑定单个仓库结构。
5. When 该 skill 对外发布时，CloudBase AI Toolkit shall 使用英文编写主 `SKILL.md`、参考文档和脚本说明，使社区用户可以直接阅读和复用。

### 需求 8 - 项目内源码维护方式

**用户故事：** 作为仓库维护者，我希望这个 skill 按项目自身 skills 的方式维护在根目录 `skills/` 下，这样它和当前项目内其他自维护 skills 的定位保持一致。

#### 验收标准

1. When 该 skill 在仓库中落地时，CloudBase AI Toolkit shall 将源码放置在 `skills/<skill-name>/` 下，而不是默认放入 `config/source/skills/`。
2. When Agent 为该 skill 设计目录结构时，CloudBase AI Toolkit shall 允许根据需要增加 `references/`、`scripts/` 或 `assets/`，但仍以 `skills/<skill-name>/SKILL.md` 作为主入口。
3. When 后续维护者扩展该 skill 的 Agent 映射或迁移逻辑时，CloudBase AI Toolkit shall 保持该 skill 可作为项目内 skill 独立维护，而不依赖外部生成目录作为语义源。
