# 需求文档

## 介绍

CloudBase 后续需要规划一条可持续演进的 CMS 产品路线，用于支撑内容管理、活动运营、小程序/小游戏配置、项目级数据展示，以及后续可能扩展到更复杂的台账、可视化、报告和多角色后台场景。

当前已确认的背景与约束如下：

- CloudBase 现有文档型数据库 ACL 与安全规则可以支撑轻量场景，但在复杂 RBAC、工作流、字段级控制、多项目隔离等场景下扩展性有限。
- 历史 `cloudbase-extension-cms` 已通过云函数和服务层自建了 `project`、`schema`、`webhook`、`role`、`permission` 等核心骨架，证明 CloudBase CMS 的复杂能力不能完全依赖底层 ACL 直接表达。
- 后续团队计划引入 PG / Supabase 类能力，以提升关系建模、复杂权限、工作流和多租户支撑能力，但当前公开能力与交付节奏尚不适合作为 CloudBase CMS 首发的唯一前提。
- 因此需要一条清晰的产品与架构策略，明确：CMS 是否可以先以 CloudBase-first 方式发布、何时需要 PG 增强、如何从第一天起保持 PG-ready 的兼容设计。

本需求目标不是立即实现完整 CMS，而是沉淀一套正式的产品路线、架构边界与验收标准，为后续 `cms` skill、CMS 产品功能规划和实现任务拆分提供统一依据。

## 需求

### 需求 1 - 明确 CloudBase-first 的 CMS v1 发布边界

**用户故事：** 作为产品和研发决策者，我希望明确 CMS v1 在不依赖 PG 的前提下可以承诺哪些能力、不能承诺哪些能力，这样团队可以在当前能力边界内先发布一个真实可用的版本，而不是被未来 PG 规划阻塞。

#### 验收标准

1. When 团队定义 CMS v1 时，CloudBase AI Toolkit shall 将 v1 定位为可基于 CloudBase 现有能力发布的 CloudBase-first 版本，而不是要求 PG 成为首发前置条件。
2. When 团队评估 CMS v1 范围时，CloudBase AI Toolkit shall 明确列出适合 v1 首发的核心场景，至少覆盖内容管理、活动运营、小程序/小游戏配置、基础 API 暴露、基础 hook/webhook 与轻量角色控制。
3. When 团队评估复杂企业级 CMS 能力时，CloudBase AI Toolkit shall 明确列出不应在 v1 中强承诺的能力，至少包括复杂 RBAC、多租户 SaaS 级隔离、复杂审批工作流、字段级细粒度权限和高复杂分析查询。
4. While 团队讨论是否必须等待 PG 才能发布 CMS 时, when 当前目标能力落在 CloudBase 可承接范围内，CloudBase AI Toolkit shall 给出“允许先发 v1”的结论与依据。

### 需求 2 - 定义 PG-enhanced 的 CMS v2 方向与升级触发条件

**用户故事：** 作为产品和架构设计者，我希望明确哪些能力应当进入 PG-enhanced 的 CMS v2，以及什么情况下需要从 CloudBase-first 路线升级到 PG 路线，这样后续演进方向和资源投入更可控。

#### 验收标准

1. When 团队定义 CMS v2 时，CloudBase AI Toolkit shall 将 v2 定位为 PG-enhanced 版本，用于承接复杂关系建模、复杂 RBAC、工作流、审计、版本和多租户等能力。
2. When 团队评估某个需求是否超出 v1 范围时，CloudBase AI Toolkit shall 提供从 v1 升级到 PG-enhanced 路线的触发条件，至少覆盖复杂权限、多项目/多客户隔离、复杂工作流、复杂报表聚合和大规模 API 暴露。
3. When 团队规划 v2 时，CloudBase AI Toolkit shall 说明 PG/RLS 只能增强底层数据隔离与查询能力，而不能替代 CMS 业务层的 RBAC、工作流权限和领域服务授权。
4. While 团队讨论“上 PG 后是否能自然解决 CMS 权限问题”时, when 需求涉及状态流转、字段级可编辑性、工作流审批或 webhook 触发策略，CloudBase AI Toolkit shall 明确要求保留服务层授权逻辑。

### 需求 3 - 保持 CloudBase-first / PG-ready 的领域模型兼容设计

**用户故事：** 作为架构设计者，我希望从 CMS 第一天起就保持核心概念和领域模型的稳定性，这样 v1 使用 CloudBase 实现时不会把未来切换或兼容 PG 的路径锁死。

#### 验收标准

1. When 团队定义 CMS 核心模型时，CloudBase AI Toolkit shall 先定义与底层存储无关的领域概念，而不是直接把 CloudBase collection 或 PG table 当作产品概念。
2. When 团队规划 CMS 核心概念时，CloudBase AI Toolkit shall 至少包含 `workspace/project`、`content type/schema`、`entry`、`media asset`、`role`、`policy`、`workflow`、`webhook` 和 `api token` 等兼容性概念。
3. When 团队规划 v1 的实现时，CloudBase AI Toolkit shall 允许这些领域概念先由 CloudBase collection、云函数和存储承接，同时保留迁移或并行映射到 PG 的空间。
4. While 团队为 v1 设计 API 或操作入口时, when 某个能力名称暴露了 CloudBase 专属实现细节，CloudBase AI Toolkit shall 要求将其重构为稳定的领域能力名称，以保证后续双后端兼容。

### 需求 4 - 定义 CloudBase 与 PG 的分层职责

**用户故事：** 作为架构设计者，我希望明确 CloudBase、PG 和服务层分别负责什么，这样系统不会把所有授权、数据和交付能力混在一层里，导致后续演进困难。

#### 验收标准

1. When 团队规划 CloudBase-first / PG-ready 架构时，CloudBase AI Toolkit shall 明确区分“产品领域层、服务授权层、数据层、交付接入层”的职责边界。
2. When 团队规划 CloudBase 在 CMS 中的角色时，CloudBase AI Toolkit shall 优先将其定位为小程序/小游戏接入、文件存储、云函数编排、静态托管和腾讯生态交付能力承接层。
3. When 团队规划 PG 在 CMS 中的角色时，CloudBase AI Toolkit shall 优先将其定位为复杂关系建模、多租户/多项目隔离、复杂查询、工作流状态和审计数据的核心数据层。
4. When 团队规划服务层时，CloudBase AI Toolkit shall 明确服务层需要承担 CMS 领域 RBAC、状态流转授权、批量操作、hook/webhook 触发策略和 AI/报告编排，而不是完全依赖底层 ACL 或 RLS。

### 需求 5 - 形成面向产品规划与 skill 设计的决策矩阵

**用户故事：** 作为 skill 维护者和产品设计者，我希望后续 `cms` skill、CMS 方案输出和实现规划都能基于同一套决策矩阵工作，这样面对不同复杂度的 CMS 需求时，agent 能稳定地推荐合适路线，而不是默认从零造一个系统。

#### 验收标准

1. When 后续 `cms` skill 处理用户请求时，CloudBase AI Toolkit shall 能根据需求复杂度在 `CloudBase-native`、`PG-based` 与 `Hybrid` 路线之间做出明确推荐。
2. When 用户需求属于轻量内容管理、活动页运营或小程序/小游戏配置时，CloudBase AI Toolkit shall 默认优先推荐 CloudBase-native 路线。
3. When 用户需求涉及复杂权限、多客户隔离、复杂工作流、复杂报表或高复杂查询时，CloudBase AI Toolkit shall 默认优先推荐 PG-based 或 Hybrid 路线。
4. When 团队后续编写 `cms` skill 参考材料时，CloudBase AI Toolkit shall 基于本需求定义的路线、边界、核心概念和分层职责构建对应的 archetype、snippet 和 CloudBase mapping 资料，而不是再次从零定义路线。
