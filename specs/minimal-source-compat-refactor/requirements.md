# 需求文档

## 介绍

当前仓库同时保存了技能源文件、规则目录、IDE 专用规则目录、单文件指令文件、CodeBuddy skills 镜像等多层重复内容，导致维护成本高、同步链路复杂、实际源头不清晰。

本需求希望将仓库内的“语义类内容源”尽可能收敛到最少数量的人类维护目录，优先收敛为 `skills` 与一个 `guideline` skill，同时保持外部消费方行为不变。外部消费方包括但不限于：

- `awsome-cloudbase-examples` 中的模板目录与 ZIP 打包流程
- `downloadTemplate(template="rules")` 的文件过滤行为
- 外部 skills 仓库与 all-in-one skill 仓库

本需求允许改动本仓库内部消费方，但不允许要求外部消费方修改其读取协议、文件路径或打包行为。

## 需求

### 需求 1 - 最小化人工维护源

**用户故事：** 作为维护者，我希望仓库内只有极少数真正需要人工维护的规则/技能源文件，以便降低重复修改和同步错误。

#### 验收标准

1. When 维护者查看仓库中的规则与技能资产时，the CloudBase AI ToolKit shall 将语义类源文件收敛到最小集合，并明确区分 source 与 generated。
2. When 语义类内容可以由 `skills` 与 `guideline` 推导时，the CloudBase AI ToolKit shall 不再要求维护者直接编辑 `rules`、IDE rules 目录或单文件 instructions。
3. While 仓库内仍存在无法从 `skills` 与 `guideline` 安全推导的机器配置文件时, the CloudBase AI ToolKit shall 将其收敛为单一机器源，而不是保留多份编辑器特定副本。

### 需求 2 - 外部消费方路径兼容

**用户故事：** 作为使用外部模板、ZIP 包和编辑器配置的用户，我希望升级重构后仍然拿到与当前等价的外部文件布局，而不需要修改我的使用方式。

#### 验收标准

1. When 外部仓库 `awsome-cloudbase-examples` 接收同步产物时，the CloudBase AI ToolKit shall 继续生成与当前兼容的模板文件路径和文件名。
2. When 外部仓库执行 ZIP 打包流程时，the CloudBase AI ToolKit shall 继续产出可被 `downloadTemplate(template="rules")` 使用的 `web-cloudbase-project.zip`。
3. When `downloadTemplate` 按 `ide` 参数过滤文件时，the CloudBase AI ToolKit shall 保持当前支持的 IDE 路径契约不变，除非显式进行版本化下线。
4. While 外部消费方无法修改读取协议时, the CloudBase AI ToolKit shall 通过发布阶段生成兼容产物，而不是要求外部仓库改造。

### 需求 3 - 本仓库内部消费方可迁移

**用户故事：** 作为仓库维护者，我希望文档、脚本和发布流程直接消费新的最小源布局，以便内部逻辑与真实源头一致。

#### 验收标准

1. When 本仓库生成 prompts 文档时，the CloudBase AI ToolKit shall 直接消费新的技能源目录，而不依赖已签出的 `config/rules` 镜像。
2. When 本仓库构建 skills 仓库或 all-in-one skill 时，the CloudBase AI ToolKit shall 直接消费新的技能源目录与 guideline 源目录。
3. When 本仓库执行同步或发布脚本时，the CloudBase AI ToolKit shall 先生成兼容产物，再将兼容产物同步到外部仓库。

### 需求 4 - 生成流程可验证且可回滚

**用户故事：** 作为维护者，我希望在删除旧产物前，先验证新生成流程与旧外部行为等价，并能在出问题时快速定位与回滚。

#### 验收标准

1. When 引入新的兼容产物生成流程时，the CloudBase AI ToolKit shall 提供生成目录与现有外部布局的可比对验证机制。
2. When 兼容产物与现有发布结果存在差异时，the CloudBase AI ToolKit shall 能够识别差异文件并阻止未经确认的切换。
3. When 重构处于迁移阶段时，the CloudBase AI ToolKit shall 支持分阶段切换，先并行生成和验证，再删除仓库内旧产物。

### 需求 5 - 明确编辑边界

**用户故事：** 作为维护者，我希望团队清楚哪些文件可以手改，哪些文件只能由脚本生成。

#### 验收标准

1. When 维护者查看重构后的目录结构时，the CloudBase AI ToolKit shall 明确标识 source 目录、generated 目录和 publish 目录的职责。
2. When 维护者尝试修改 generated 产物时，the CloudBase AI ToolKit shall 通过文档、目录命名或脚本约束提示该文件不应手工维护。
3. While 外部兼容产物仍需存在时, the CloudBase AI ToolKit shall 将其定位为发布构建结果，而非长期维护源码。
