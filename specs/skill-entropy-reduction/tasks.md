# 实施计划

- [x] 1. 创建共享变更安全协议微文件（最高杠杆）
  - 在 `config/source/skills/shared/` 目录下新增 `change-safety-protocol.md`（纯英文，~140 tokens）。
  - 已通过 `cloudbase-all-in-one`（alwaysApply）和其他高频 skill 植入 guardrail。
  - _需求: 需求 3, 需求 5

- [x] 2. 创建部署前置条件门禁微文件
  - 在 `config/source/skills/cloudbase-platform/` 下新增 `deployment-gate.md`（纯英文）。
  - 已通过 cloudbase-platform、cloudbase-cli、cloud-functions、web-development、miniprogram-development 等 skill 引用。
  - _需求: 需求 2, 需求 5

- [ ] 3. 在 cloudbase-all-in-one 中落地 Scope Classifier
  - 更新 `config/source/skills/SKILL.md` 顶部，增加极短的 CloudBase 任务 Scope Classifier 决策表。
  - 明确列出 5-6 个必须硬拒绝的真实负面模式（基于质量反馈报告中的典型案例匿名化处理）。
  - 增加标准化硬拒绝话术模板。
  - _需求: 需求 1, 需求 5

- [ ] 4. 在 cloudbase-platform 中强化 Activation Contract 并引用新门禁
  - 更新 `config/source/skills/cloudbase-platform/SKILL.md` 的 Activation Contract，采用 5 段式结构（Hard exclusions + 负面案例）。
  - 在“部署、发布、公网暴露”相关触发条件中增加 1-2 行强制引用 `deployment-gate.md`。
  - 同步更新 Common mistakes / gotchas 区块。
  - _需求: 需求 1, 需求 2

- [ ] 5. 在 cloudbase-cli 中增加部署门禁引用
  - 在 `config/source/skills/cloudbase-cli/SKILL.md` 的 Activation Contract 和 Core Principles 中增加对 `deployment-gate.md` 的强制引用。
  - 确保 CLI 路径的部署操作也走统一前置检查。
  - _需求: 需求 2

- [ ] 6. 在 cloud-functions 中增加变更安全协议 + 部署门禁引用
  - 在 `config/source/skills/cloud-functions/SKILL.md` 中通过 1 行引用方式引入变更安全协议。
  - 在涉及部署/公网暴露的章节增加 deployment-gate 引用。
  - 更新其 checklist.md 使其与新门禁保持一致（不重复内容）。
  - _需求: 需求 2, 需求 3

- [ ] 7. 在 web-development、miniprogram-development、auth-* 等高频写代码 skill 中落地变更安全协议
  - 在 `config/source/skills/web-development/SKILL.md`、`miniprogram-development/SKILL.md`、`auth-tool/SKILL.md`、`auth-web/SKILL.md` 等文件中增加变更安全协议的 1 行引用 + 适用说明。
  - 明确区分微小修改与结构变更的豁免规则。
  - _需求: 需求 3

- [ ] 8. 为小程序领域补充关键 pitfalls 卡片（P1）
  - 在 `config/source/skills/miniprogram-development/references/` 下补充或新建 pitfalls 相关内容。
  - 优先覆盖：可选链语法兼容性、TDesign ::after 伪元素机制、Canvas API + 云存储权限、小游戏特有陷阱。
  - 在主 SKILL.md 中增加高频陷阱速查表（仅 4-6 条）。
  - _需求: 需求 4

- [ ] 9. 在其他高频领域逐步补充 pitfalls / exact-contracts（按需）
  - 针对报告中提到的认证机制（OAuth2 vs Bearer）、registerAi/app.ai 陷阱、匿名用户权限等，在对应 skill 的 references/ 下补充卡片。
  - 主文件仅保留速查表。
  - _需求: 需求 4

- [ ] 10. 在 cloudbase-all-in-one 中提供变更安全协议的低成本兜底支持
  - 评估是否需要在 `config/source/skills/SKILL.md`（alwaysApply）中对核心协议做最小内联或极短引用，确保纯单 skill 安装环境也能获得基本变更保护。
  - 避免显著增加 alwaysApply 文件体积。
  - _需求: 需求 3, 需求 5

- [ ] 11. 更新 Standalone Install Note 与引用路径说明
  - 在所有受影响的 SKILL.md（尤其是 cloudbase-platform、cloudbase-cli、cloud-functions）中更新 Standalone Install Note，说明新微协议文件的 standalone fallback 路径。
  - 确保 one-skill 安装场景下新防御能力不完全丢失。
  - _需求: 需求 5, 需求 6

- [ ] 12. 建立简单验证机制
  - 在 `specs/skill-entropy-reduction/` 下新增 `validation.md`，记录：
    - 典型任务加载 token before/after 对比方法
    - 报告中 Conv 案例的重放验证 checklist
    - 熵减与 token 减目标的量化口径
  - 完成至少 2-3 个代表性场景的初步验证数据。
  - _需求: 需求 5, 需求 6

- [ ] 13. 与 skill-activation-optimization 保持一致性审查
  - 确认本次新增文件和改动不会与该 spec 的路由契约、入口强化方向产生冲突。
  - 如有需要，在两个 spec 的设计或任务中增加交叉引用说明。
  - _需求: 需求 6

- [x] 14. 准备提交材料
  - 完成本 spec 三个核心文件（requirements.md、design.md、tasks.md）的最终 review。
  - 按项目 git_push 规则准备 commit（conventional-changelog + emoji）。
  - 提交 PR 后观察 CI 与 review 反馈。
  - _需求: 需求 6

## Additional Work Completed in This Round

- [x] Low-cost inclusion of both protocols in `cloudbase-all-in-one` + Deployment Gate reference added.
- [x] Updated Standalone Install Notes across all major skills with fallback URLs for the new shared protocols.
- [x] Created `miniprogram-development/references/pitfalls.md` covering optional chaining, TDesign ::after, Canvas + storage, and environment drift (directly addressing quality feedback).
- [x] Added cross-reference in design.md to `specs/skill-activation-optimization/` for consistency.
- [x] All new content kept in pure English per project rules.
