# 技术方案设计

## 概述

本方案将仓库当前的“`skills/` 为主源、`config/.claude/skills/` 为镜像”的实现，调整为“两套独立 skills 资产”的实现。

目标模型：

- `skills/`
  - 本项目开发消费
  - 本项目内部维护
- `config/.claude/skills/`
  - 对外分发给用户项目消费
  - 面向用户项目的独立维护目录

因此，本方案的关键不是迁移 skill 内容本身，而是去除仓库中关于“镜像”与“自动同步覆盖”的错误假设。

## 目标

- 明确两套 skills 的职责边界
- 删除文档中的镜像表述
- 调整脚本注释、命名、行为或适用范围说明
- 调整相关测试，避免继续验证错误的单向同步关系

## 非目标

- 不要求本次统一重写两套目录下全部 skill 内容
- 不要求本次建立两套目录之间的复杂双向同步
- 不要求本次决定所有 skill 应该属于哪一套，只建立规则和基础设施边界

## 当前问题

当前仓库存在以下单源假设：

- `config/README.md` 将 `config/.claude/skills/` 描述为由 `skills/` 生成的 compatibility mirror
- `scripts/sync-claude-skills-mirror.mjs` 默认执行 `skills/ -> config/.claude/skills/`
- 相关测试验证 `config/.claude/skills/` 与 `skills/` 一致

这些实现和维护者期望的双源模型冲突。

## 设计原则

### 1. 角色优先于目录相似性

虽然两套目录都叫 “skills”，但它们服务对象不同，因此不应基于路径相似性推导出镜像关系。

### 2. 禁止隐式覆盖另一套资产

任何脚本如果会写入另一套 skills 目录，都必须重新评估。默认情况下，应避免自动覆盖另一套技能资产。

### 3. 文档先于自动化

先把仓库文档、注释、脚本说明和测试假设调整正确，再决定是否需要新的自动化。

## 需要调整的内容

### 文档

- `config/README.md`
  - 改为说明 `config/.claude/skills/` 是对外分发目录
  - 删除 mirror / generated from `skills/` 的表述

### 脚本

- `scripts/sync-claude-skills-mirror.mjs`
  - 不应再以默认工具身份保留“同步到 `config/.claude/skills/`”的语义
  - 可选方向：
    - 删除
    - 重命名并限制为某个显式转换用途
    - 保留但默认不再写入 `config/.claude/skills/`

- `scripts/build-skills-repo.mjs`
  - 需要明确它构建的是哪一套 skills
  - 若它只服务根目录 `skills/`，应在注释和输出中说明

### 测试

- `tests/sync-claude-skills-mirror.test.js`
  - 当前测试建立在镜像假设上，需要删除或重写

## 迁移策略

### Phase 1

- 修正文档
- 修正脚本注释与默认语义
- 删除或调整镜像一致性测试

### Phase 2

- 在维护流程文档中明确：
  - 本项目开发 skill 改 `skills/`
  - 对外分发 skill 改 `config/.claude/skills/`

### Phase 3

- 针对具体 skill 再决定归属和迁移路径

## 测试策略

1. 文档验证
   - 核对 `config/README.md` 不再声明镜像关系

2. 脚本验证
   - 核对 skills 相关脚本不再默认覆盖 `config/.claude/skills/`

3. 测试验证
   - 删除或重构与镜像一致性绑定的测试

## 风险与缓解

风险：

- 旧脚本仍被误用，覆盖分发 skill
- 维护者短期内继续沿用旧认知
- 两套目录职责虽已分开，但没有形成实际流程约束

缓解：

- 文档、脚本、测试同时调整
- 在脚本输出中明确警告适用范围
- 后续针对维护流程补充更清晰的说明文档
