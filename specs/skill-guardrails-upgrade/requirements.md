# 需求文档

## 介绍

本需求面向当前 CloudBase source skills 做一轮高杠杆、低扩散的结构化升级，目标不是重写整套 skill 体系，而是在现有 `config/source/guideline/cloudbase/SKILL.md`、`activation-map.yaml`、核心子 skill、`references/`、`checklist.md` 与测试契约之上，优先补齐三类最直接影响效果的能力：

1. 可执行验证闭环
2. 任务拆分与路由决策入口
3. 最小运行态风险护栏

本轮改造必须遵循仓库现有 skills 规范：以 source files 为单一语义源，保持 frontmatter 完整性，避免跨平台示例漂移，优先渐进披露，不手改兼容镜像，并通过测试与 prompts 同步保证公开面不漂移。

## 需求

### 需求 1 - 核心 skill 必须提供可执行验证闭环

**用户故事：** 作为 CloudBase skill 的维护者，我希望 Agent 在完成 Web、云函数、HTTP API 和小程序相关改动后，能明确知道应该验证什么、如何验证、何时算完成，这样 skill 不会只指导实现而缺少交付闭环。

#### 验收标准

1. When Agent 使用核心 skill 生成或修改实现时, the CloudBase skill collection shall 明确要求在宣称完成前执行与当前平台匹配的最小验证步骤。
2. While 场景依赖浏览器行为、预览流程、部署结果或访问路径时, when Agent 完成代码改动后, the CloudBase skill collection shall 将验证动作路由到对应的 `browser-testing.md`、`checklist.md` 或小程序调试 reference，而不是只要求“自行检查”。
3. When 某个 skill 把验证定义为必做步骤时, the CloudBase skill collection shall 在示例、清单或完成标准中体现该要求，而不只停留在正文描述。
4. When Agent 完成一项高频改动后, the CloudBase skill collection shall 提供与该场景匹配的 done criteria，例如路由/交互复测、函数访问确认、OpenAPI 校验或真机/预览验证。
5. While 不同 skill 共享验证原则时, when 需要维护这些原则, the CloudBase skill collection shall 将共性规则优先收敛到主 guideline 或共享 reference，避免在多个 skill 中复制大段重复表述。

### 需求 2 - 路由与任务拆分入口必须更明确

**用户故事：** 作为使用 CloudBase skill 的 Agent，我希望在真正开始实现前，更稳定地知道当前请求应该先读哪个 skill、什么时候 reroute 到 spec 流程、什么时候需要继续读第二参考，这样可以减少误路由和返工。

#### 验收标准

1. When 用户请求属于 Web、云函数、HTTP API、小程序、UI 设计或 spec 规划场景时, the CloudBase skill collection shall 在主 guideline 与关键子 skill 中明确 first-read、then-read、do-not-use 和 before-action 规则。
2. When 任务跨多个模块、验收边界不清或包含架构性决策时, the CloudBase skill collection shall 将 Agent reroute 到 `spec-workflow`，而不是直接进入编码说明。
3. While 一个子 skill 不是当前场景的首要入口时, when 用户请求命中了容易混淆的近邻路径, the CloudBase skill collection shall 显式说明它不该优先处理哪些场景。
4. When 维护路由规则时, the CloudBase skill collection shall 保持 `config/source/guideline/cloudbase/activation-map.yaml` 与关键 skill 顶部合同语义一致，并可被现有路由测试锁定。
5. When 子 skill 需要补充更深层操作说明时, the CloudBase skill collection shall 采用浅层 `references/` 或 `checklist.md` 路由，而不是持续扩大主 `SKILL.md`。

### 需求 3 - 高频场景必须补最小运行态风险护栏

**用户故事：** 作为维护者，我希望 CloudBase skill 不只告诉 Agent 如何写代码，还能在高风险改动里提醒它关注日志、权限、访问路径、上线后 smoke 和异常观察，这样结果更接近真实交付，而不是只停留在开发态。

#### 验收标准

1. When 场景涉及 HTTP 函数、CloudBase API 调用、预览发布或跨资源行为时, the CloudBase skill collection shall 提示 Agent 在交付前检查关键运行态风险点，例如访问入口、鉴权、权限、日志或预览结果。
2. While 某项运行态风险属于多个 skill 的共性问题时, when 维护这些提醒, the CloudBase skill collection shall 将共性规则优先保留在主 guideline 或 `ops-inspector` 中，并在子 skill 中只保留最小本地提醒。
3. When Agent 遇到需要运行态观察或诊断的高风险改动时, the CloudBase skill collection shall 明确给出切换到 `ops-inspector` 或相应 checklist/reference 的条件。
4. When 某个 skill 声明需要日志、权限或访问链路确认时, the CloudBase skill collection shall 提供对应的最小观察步骤或完成标准，而不是抽象提醒。
5. While 运行态护栏被写入核心 skill 时, when 该场景存在明确的错误近邻, the CloudBase skill collection shall 同时标注常见误用方式，避免把运行态问题错误归因到实现细节。

### 需求 4 - 小程序调试预览链路必须恢复可执行性

**用户故事：** 作为维护者，我希望 `miniprogram-development` 不再只引用一个缺失的预览调试文档，而是具备完整可访问的 preview / DevTools / `miniprogram-ci` reference，这样小程序 skill 的执行链路是闭合的。

#### 验收标准

1. When Agent 在 `miniprogram-development` 中被要求处理调试、预览、发布或真机验证时, the CloudBase skill collection shall 提供真实存在且可访问的 reference 文件作为执行入口。
2. When 小程序场景同时涉及 CloudBase 与非 CloudBase 工作流时, the CloudBase skill collection shall 明确区分 `cloudbase-integration.md` 与预览调试 reference 的职责边界。
3. While Agent 处理小程序预览或发布相关任务时, when WeChat Developer Tools 不可用, the CloudBase skill collection shall 提供 `miniprogram-ci` 作为替代路径。
4. When 小程序 skill 宣称预览或发布前需要检查项目配置时, the CloudBase skill collection shall 明确列出例如 `project.config.json`、`appid`、`miniprogramRoot` 等关键检查项。

### 需求 5 - 变更必须符合 repo-managed CloudBase skill 规范

**用户故事：** 作为仓库维护者，我希望这轮改造在提升效果的同时，不破坏现有 skills collection 的维护方式和对外契约。

#### 验收标准

1. When 修改任一 source skill 时, the CloudBase skill collection shall 保持 `name`、`description`、`version`、`alwaysApply` 等 frontmatter 完整且符合现有格式要求。
2. When 新增或修改示例、reference 或 checklist 时, the CloudBase skill collection shall 保持平台边界正确，不把 Web 示例写进小程序 skill，也不把自建业务 HTTP API 混入平台 HTTP API skill。
3. While 多个 skill 需要相同规则时, when 维护这些规则, the CloudBase skill collection shall 遵循单一语义源原则，避免跨 skill 粘贴大段重复内容。
4. When skill 语义变化影响公开 prompts 文档时, the CloudBase skill collection shall 同步生成并校验对应 `doc/prompts/*.mdx` 产物。
5. When 本轮改造完成时, the CloudBase skill collection shall 通过现有质量测试、路由契约测试和新增断言，证明关键 reference、路由边界与护栏文案没有回退。
