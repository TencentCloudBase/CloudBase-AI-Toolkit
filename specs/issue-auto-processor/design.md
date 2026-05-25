# 技术方案设计 - Issue 自动处理系统

## 目标

用 **GitHub Actions workflow + CodeBuddy CLI headless 模式 + 一个可测试的 helper 脚本** 实现 issue 自动处理，在保持整体简单的前提下，补齐评论命令、线程上下文重建和输出解析兜底。

## 架构

```text
schedule / workflow_dispatch / issue_comment
                 ↓
      github-script 收集 issue 与 comments
                 ↓
     workflow 判断 slash command / skip / fix
                 ↓
   ┌────────────────────┬────────────────────┐
   │ bug / forced fix   │ non-bug / continue │
   │                    │                    │
   │ CodeBuddy 改代码    │ CodeBuddy 产出分析  │
   │ workflow 提交 PR    │ workflow 发评论     │
   └────────────────────┴────────────────────┘
```

## 文件边界

### 1. `.github/workflows/issue-auto-processor-simple.yml`

职责：

- 定义三种触发方式：`schedule` / `workflow_dispatch` / `issue_comment`
- 通过 `actions/github-script` 收集 issue、labels 和完整 comment 线程
- 执行标签流转、CodeBuddy 调用、git / gh 副作用
- 在失败时统一回贴 issue 评论

### 2. `scripts/issue-auto-processor.cjs`

职责：

- 解析 `/cloudbase fix|skip|continue`
- 从 CodeBuddy CLI 输出中提取最终文本，兼容 object / array / plain text
- 构建 analysis / fix prompt，并把完整 issue 线程带入 AI

选择它的原因：

- 这些逻辑很容易出错，但也很适合做单元回归测试
- 保持 workflow 仍然是主入口，不回退到早期多脚本状态机

### 3. `tests/issue-auto-processor.test.js`

职责：

- 校验输出解析
- 校验 slash command 权限边界
- 校验 prompt 是否包含 issue comment 线程
- 校验 workflow 是否接入 `issue_comment`

## 核心决策

### 1. 不做隐藏 session 持久化

采用：

- 每次执行时重新读取 issue title / body / labels / 全部 comments
- `/cloudbase continue` 只是“基于当前线程继续处理”

不采用：

- 在 CI run 之间保存 `session_id`
- 依赖隐藏 comment / artifact / cache 恢复 AI 会话

原因：

- CI 流水线不稳定，隐藏状态容易丢
- issue 线程本身就是最可靠的公开上下文来源
- 和 GitHub review 语义更一致

### 2. 评论命令用真实 slash command，不用假 mention

采用：

- `/cloudbase fix`
- `/cloudbase skip`
- `/cloudbase continue`

不采用：

- `@ai fix`
- 任何并不存在的 bot 账号 mention

原因：

- 避免制造虚假的机器人身份
- slash command 语义更清楚，也更容易做权限边界

### 3. workflow 控制副作用，AI 不直接拥有流程主导权

采用：

- CodeBuddy CLI 负责分析和改代码
- workflow 负责 branch / commit / push / PR / issue comment / labels

不采用：

- 让 AI 自己决定所有 `gh` 副作用

原因：

- GitHub 外部副作用更可控
- slash command、skip、失败回贴这些流程动作更适合由 workflow 统一管理
- 便于在失败时保证状态一致

## 触发与筛选规则

### 1. 自动任务

自动任务只处理满足以下条件的 issue：

1. `state=open`
2. 不是 PR
3. 创建时间 >= 4 小时
4. 不带 `ai-processed`
5. 不带 `ai-processing`
6. 不带 `no-ai`
7. 每轮最多处理 5 个

### 2. 手动任务

`workflow_dispatch(issue_number)` 直接处理指定 issue，不受 4 小时延迟限制。

### 3. 评论命令任务

`issue_comment.created` 事件进入以下判断：

1. comment body 必须匹配 `/cloudbase fix|skip|continue`
2. `author_association` 必须是 `OWNER` / `MEMBER` / `COLLABORATOR`
3. 必须是 issue comment，而不是 PR comment

通过后直接处理当前 issue，并将 `requestedAction` 写入 issue JSON。

## 上下文构建

收集 issue 时，除基础字段外，还会额外拉取：

- `comments[].author`
- `comments[].authorAssociation`
- `comments[].body`
- `comments[].createdAt`
- `comments[].url`

AI prompt 固定包含：

- issue 标题、正文、URL、labels
- 若由 slash command 触发，则包含 `requestedAction` 和原始命令
- 全部 issue comments

这样 `/cloudbase continue` 不依赖上次 run 的内部状态，也能沿着公开线程继续走。

## 输出解析策略

`extractResultText(rawOutput)` 的优先级：

1. 尝试将完整输出解析成 JSON
2. 若是 object，则优先取 `result`，再回退到常见文本字段
3. 若是 array，则从尾部向前查找可用文本，兼容 message/result 结构
4. 若完整 JSON 失败，再尝试逐行 JSON 解析
5. 若都失败，则回退到 plain text

空结果处理规则：

- 解析后正文为空，直接判失败
- 发表评论时使用失败模板
- 不打 `ai-processed`
- 改打 `ai-failed`

## slash command 语义

### `/cloudbase skip`

- 不调用 CodeBuddy
- 给 issue 打 `no-ai`
- 移除 `ai-processing` / `ai-failed` / `ai-processed` / `ai-fix`
- 回贴一条确认评论

### `/cloudbase fix`

- 强制走修复路径
- 即使当前 issue 没有 bug label，也按 fix prompt 处理
- 若 issue 已有 `no-ai`，显式去掉 `no-ai` 再处理

### `/cloudbase continue`

- 重新读取完整线程上下文
- 按当前 issue 的 bug / non-bug 判断决定是修复还是分析
- 如果历史 AI 评论有误，允许本次输出直接修正

## 稳定性设计

### 1. 避免空评论成功

旧问题：

- workflow 把 CodeBuddy 输出按对象 `.result` 单一路径提取
- 实际返回数组时，`jq` 报错但流程继续
- 最终留下空正文评论并错误标记 `ai-processed`

新设计：

- 解析逻辑集中到 helper 脚本
- 先提取，再判空，再决定是否发成功评论
- 空结果一定走失败路径

### 2. 标签作为轻量状态机

| 标签 | 含义 |
|------|------|
| `ai-processing` | 当前正在跑 |
| `ai-processed` | 成功完成 |
| `ai-failed` | 失败或未产出 patch |
| `ai-fix` | 已创建修复 PR |
| `no-ai` | 显式跳过 |

### 3. 自动 PR 仍然只在有 diff 时创建

修复路径只有在仓库里出现真实 diff 时才：

1. `git add -A`
2. `git commit`
3. `git push origin ai-fix/issue-{number}`
4. `gh pr create`

没有 diff 时，只回 issue 评论并打 `ai-failed`。

## 认证方案

按照官方 IAM 文档，workflow 支持：

1. `CODEBUDDY_AUTH_TOKEN`（优先）
2. `CODEBUDDY_API_KEY`

若使用中国版 API Key，建议额外设置：

- repository variable: `CODEBUDDY_INTERNET_ENVIRONMENT=internal`

## 验证策略

最小验证聚焦 4 件事：

1. helper 脚本的输出解析 / slash command / prompt 回归测试通过
2. workflow YAML 可被解析
3. workflow 主 bash step 的 shell 语法通过
4. PR diff 只包含 issue automation 相关文件

## issue #488 现场修复策略

issue #488 的空评论问题按两步处理：

1. 先修 workflow，阻止空评论再次出现
2. 再在 issue 线程中补说明并重跑一次，让线程状态回到可信状态

## 回滚方案

如果需要停止这套自动化：

1. 直接禁用 `.github/workflows/issue-auto-processor-simple.yml`
2. 或者批量给 issue 打 `no-ai`
3. 已经生成的 `ai-fix/*` 分支和 PR 按正常人工流程关闭即可
