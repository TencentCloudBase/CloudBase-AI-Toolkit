# 实施计划 - Issue 自动处理系统

## 任务列表

- [x] 1. 收敛方案为单 workflow + 小型 helper 脚本
  - 保留 `issue-auto-processor-simple.yml` 作为唯一流程入口
  - 新增 `scripts/issue-auto-processor.cjs` 承载可测试的解析与 prompt 逻辑
  - _需求: 8_

- [x] 2. 实现 issue 收集与过滤
  - 使用 `actions/github-script` 收集 open issue
  - 加入 4 小时延迟、标签过滤、每轮最多 5 个的规则
  - _需求: 1, 5_

- [x] 3. 引入评论命令触发
  - 监听 `issue_comment.created`
  - 识别 `/cloudbase fix|skip|continue`
  - 限制为 `OWNER` / `MEMBER` / `COLLABORATOR`
  - _需求: 6_

- [x] 4. 把 issue 全线程上下文带入 AI
  - 收集并序列化 issue 下全部 comments
  - 在 analysis / fix prompt 中包含完整线程上下文
  - _需求: 3, 7_

- [x] 5. 修复 CodeBuddy 输出提取逻辑
  - 兼容 object / array / plain text 三种输出
  - 空结果直接判失败，不再发成功空评论
  - _需求: 8_

- [x] 6. 保留 workflow 对 git 副作用的控制
  - workflow 负责 branch / commit / push / PR / labels / comments
  - 只有产出实际 diff 时才创建 PR
  - _需求: 4, 5_

- [x] 7. 增加最小回归测试
  - 覆盖输出解析、slash command 权限边界、prompt 上下文拼装
  - 校验 workflow 已接入 `issue_comment`
  - _需求: 8_

- [x] 8. 同步文档与 spec
  - 更新 `doc/issue-auto-processor.md`
  - 更新需求 / 设计 / 任务文档，反映 slash command 与线程上下文方案
  - _需求: 全部_

- [ ] 9. 最小验证与 issue #488 修复
  - 校验 workflow YAML 与主 bash step 语法
  - 确认回归测试通过
  - 处理 #488 的空回复影响并重跑验证
  - _需求: 全部_
