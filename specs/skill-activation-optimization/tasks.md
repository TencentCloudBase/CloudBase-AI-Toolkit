# 实施计划

- [x] 1. 建立场景路由契约语义源
  - 新增 `config/source/guideline/cloudbase/activation-map.yaml`，定义高频 CloudBase 场景的 `firstRead`、`thenRead`、`beforeAction`、`doNotUse`、`commonMistakes` 和优先级。
  - 首批覆盖 Web 认证、小程序认证、原生 App/HTTP API、Web 文档数据库、MySQL、云函数、CloudRun、AI 集成、UI 设计前置和 spec 工作流场景。
  - 明确高冲突场景边界，优先沉淀“Web 认证不能走云函数”“原生 App 不走 Web SDK”“CloudRun 与云函数分流”等规则。
  - _需求: 需求 1, 需求 3, 需求 5, 需求 6

- [x] 2. 重构 CloudBase 主 guideline 的入口结构
  - 调整 `config/source/guideline/cloudbase/SKILL.md` 顶部结构，增加 `Activation Contract`、高优先级场景路由表、全局前置规则和语义源优先级说明。
  - 将产品介绍、安装说明、场景举例等内容下沉，避免主入口被背景信息淹没。
  - 明确“未完成最小必要阅读前，不得直接写代码或直接调用 CloudBase API”的入口约束。
  - _需求: 需求 1, 需求 2, 需求 3, 需求 6

- [x] 3. 为高频子 skill 增加统一的激活合同
  - 更新 `auth-tool`、`auth-web`、`web-development`、`miniprogram-development`、`http-api`、`cloud-functions`、`relational-database-tool`、`ui-design` 等高频 skill 顶部结构。
  - 统一补充 `Use this first when...`、`Read before writing code if...`、`Then also read...`、`Do NOT use for...`、`Common mistakes / gotchas`、`Minimal checklist` 等区块。
  - 让每个 skill 明确说明自己在决策链中的优先级、适用边界和错误近邻。
  - _需求: 需求 1, 需求 2, 需求 3, 需求 4

- [x] 4. 为高频失败场景补充最小可执行资产
  - 按场景补充 `gotchas.md`、`checklist.md` 或最小模板片段，优先处理认证配置、Web 登录、HTTP API 限制、云函数 runtime/HTTP 函数、UI 输出前置设计等失败高发区域。
  - 在对应 `SKILL.md` 中只保留资产入口和适用说明，避免继续把细节堆回正文。
  - 明确每份资产的输入要求、输出形态和常见误用方式。
  - _需求: 需求 2, 需求 4, 需求 5

- [x] 5. 对齐 IDE 兼容规则与 CodeBuddy 规则的激活语义
  - 更新 `config/source/editor-config/guides/cloudbase-rules.mdc`，使其与主 guideline 共享同一套路由顺序、must-read 和 do-not-use 语义。
  - 更新 `config/codebuddy-plugin/rules/cloudbase_rules.md`，避免其继续独立演化出与语义源不一致的强规则。
  - 保持不同入口的约束强度差异可控，但核心路由语义必须一致。
  - _需求: 需求 1, 需求 3, 需求 6

- [x] 6. 对齐对外 skill 与文档入口
  - 更新 `scripts/skills-repo-template/cloudbase-guidelines/SKILL.md`，确保对外 skills 仓库入口保留相同的场景路由和前置规则。
  - 更新 `doc/prompts/how-to-use.mdx`，把“如何提高激活率”的说明与仓库内的 first-read 策略、项目级规则和 hooks 建议对齐。
  - 如有必要，评估 `doc/prompts/config.yaml` 是否需要补充更贴近高频场景路由的展示文案。
  - _需求: 需求 1, 需求 2, 需求 6

- [x] 7. 校验 all-in-one 与同步链路保留关键激活语义
  - 检查 `scripts/build-allinone-skill.ts`、`scripts/sync-codebuddy-plugin.ts` 与 `scripts/build-skills-repo.mjs` 是否完整保留新的主入口结构、子 skill 顶部合同和关键 gotcha 引用。
  - 仅在语义无法完整透传时才做最小必要脚本调整，不改变 all-in-one 全量 references 的总体策略。
  - 确保聚合产物中的路径提示与主语义源保持一致。
  - _需求: 需求 3, 需求 6

- [x] 8. 增加路由契约与投影一致性测试
  - 新增 `tests/skill-activation-routing.test.js`，校验高频场景路由定义完整、skill 引用存在、错误近邻边界明确。
  - 扩展 `tests/build-allinone-skill.test.js`、`tests/build-compat-config.test.js`、`tests/sync-codebuddy-plugin.test.js`，校验关键 must-read 和 before-action 语义不会在聚合或兼容产物中丢失。
  - 为代表性 prompt 场景增加 fixture，验证 should-route-to / should-read-first / should-not-route-to 等预期。
  - _需求: 需求 3, 需求 5, 需求 6

- [x] 9. 建立失败归因到仓库修改面的映射说明
  - 在本次改动相关 spec 或测试说明中明确“知识缺失 / 没读到入口 / 读到错误近邻 / 信噪比过高 / 执行偏差”对应的优先改动位置。
  - 为后续 attribution issue 复盘提供统一口径，避免把“知识没被激活”再次误处理成单纯补正文。
  - 为后续增量优化预留可持续迭代入口。
  - _需求: 需求 5, 需求 6
