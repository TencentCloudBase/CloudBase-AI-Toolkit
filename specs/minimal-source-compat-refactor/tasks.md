# 实施计划

- [x] 1. 盘点外部兼容契约并固化基线
  - 列出 `downloadTemplate` 当前依赖的全部路径、文件名和 IDE 过滤映射
  - 列出 `awsome-cloudbase-examples/web/cloudbase-project` 与 `airules/codebuddy` 当前同步结果
  - 产出兼容基线清单，作为重构后的对比标准
  - _需求: 需求 2, 需求 4_

- [x] 2. 设计并落地新的源目录布局
  - 新建 `skills/` 作为模块化技能唯一语义源
  - 新建 `guideline/` 作为总入口 guideline 唯一语义源
  - 新建 `editor-config/` 作为唯一机器配置源
  - 迁移现有 `config/.claude/skills` 与 `scripts/skills-repo-template/cloudbase-guidelines` 内容到新布局
  - _需求: 需求 1, 需求 5_

- [x] 3. 实现兼容产物生成器
  - 新增 `scripts/build-compat-config.mjs`
  - 从 `skills/` 生成 `rules/`、IDE rules 目录和 `.codebuddy/skills/`
  - 从 `guideline/` 生成 `AGENTS.md`、`CLAUDE.md`、`CODEBUDDY.md` 等单文件兼容层
  - 从 `editor-config/` 生成各 IDE 所需 JSON/TOML/设置文件
  - 输出到 `.generated/compat-config/`
  - _需求: 需求 1, 需求 2, 需求 5_

- [x] 4. 改造内部文档消费方
  - 修改 `scripts/generate-prompts.mjs`
  - 修改 `scripts/generate-prompts-data.mjs`
  - 让 prompts 文档直接读取 `skills/`，以 `SKILL.md` 为主入口
  - _需求: 需求 3_

- [x] 5. 改造 skills 发布构建
  - 修改 `scripts/build-skills-repo.mjs` 读取 `skills/` 与 `guideline/`
  - 修改 `scripts/build-allinone-skill.ts` 读取 `skills/` 与 `guideline/`
  - 修改相关 workflow 的触发路径
  - _需求: 需求 3, 需求 4_

- [x] 6. 改造同步与外部发布入口
  - 修改 `scripts/sync-config.mjs`，先构建 `.generated/compat-config/`
  - 再将 `.generated/compat-config/` 同步到 `awsome-cloudbase-examples`
  - 保持外部仓库目录结构和 ZIP 打包入口不变
  - _需求: 需求 2, 需求 3_

- [x] 7. 建立兼容性回归测试
  - 增加生成目录与现有发布目录的 diff 校验
  - 扩展 `downloadTemplate` 相关测试以覆盖生成后的兼容目录
  - 增加 skills repo、prompts、all-in-one 构建测试；all-in-one 测试在检测到 `nvm` Node 24 环境时执行
  - _需求: 需求 2, 需求 4_

- [x] 8. 分阶段切换并删除旧产物
  - 先并行保留旧 `config` 兼容层进行比对
  - 验证通过后切换工作流与同步入口
  - 最后删除仓库内旧的 `config/rules`、IDE rules 与单文件 instructions 副本
  - 补充维护文档，声明 source 与 generated 的边界
  - _需求: 需求 4, 需求 5_
