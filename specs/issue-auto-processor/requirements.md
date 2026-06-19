# 需求文档 - Issue 自动处理系统

## 介绍

为仓库提供一个低维护成本、但比纯定时扫描更可控的 GitHub Issue 自动处理能力：

- issue 创建后 **4 小时内不自动处理**
- bug 类 issue 尝试自动修复并提 PR
- 其他 issue 自动分析并回复
- maintainer 可通过 issue 评论命令显式控制单个 issue
- 不依赖脆弱的 CI 会话持久化，而是每次从 issue 线程重建上下文

## 需求

### 需求 1 - 延迟触发

**用户故事：** 作为仓库维护者，我希望新建 issue 不会被 AI 立即响应，而是至少保留 4 小时的人工介入窗口。

#### 验收标准

1. When an issue is created, the system shall not automatically process it within the first 4 hours.
2. When an issue is at least 4 hours old, the scheduled workflow shall consider it eligible for automatic processing.
3. When a maintainer manually triggers the workflow for a specific issue, the system may process that issue immediately.

### 需求 2 - 分类处理

**用户故事：** 作为仓库维护者，我希望 bug 和非 bug issue 走不同路径，bug 尝试修复，其余只分析回复。

#### 验收标准

1. When an issue has a bug-like label or bug-like keywords in title/body, the system shall route it to the auto-fix path.
2. When an issue does not match bug conditions, the system shall route it to the analysis-only path.
3. When an issue is on the analysis-only path, the system shall not create a fix branch or PR.
4. When a maintainer comments `/cloudbase fix`, the system shall force the issue into the fix path.

### 需求 3 - 自动分析回复

**用户故事：** 作为 issue 提交者，我希望非 bug issue 能收到一条简洁、结构化、可执行的 AI 分析回复。

#### 验收标准

1. When the system processes a non-bug issue, it shall generate a Markdown comment with classification, likely area, suggested next step, and optional open questions.
2. The system shall post the generated analysis as an issue comment.
3. When a maintainer comments `/cloudbase continue`, the system shall regenerate the analysis using the full issue thread as context.

### 需求 4 - 自动修复与 PR

**用户故事：** 作为仓库维护者，我希望 bug issue 在 AI 产出实际 patch 时能自动生成 PR，但不空建 PR。

#### 验收标准

1. When the system processes a bug issue, it shall ask the AI to investigate and attempt the smallest credible fix.
2. When the AI produces repository changes, the workflow shall create branch `ai-fix/issue-{number}`, commit the diff, and open a PR linked to the issue.
3. When the AI does not produce a diff, the workflow shall not create a PR and shall instead leave a diagnostic comment on the issue.

### 需求 5 - 去重与状态标记

**用户故事：** 作为仓库维护者，我希望同一个 issue 不会被重复自动处理，并且处理状态可见。

#### 验收标准

1. When processing starts, the system shall add `ai-processing`.
2. When processing succeeds, the system shall remove `ai-processing` and add `ai-processed`.
3. When a fix PR is created, the system shall also add `ai-fix`.
4. When processing fails or produces no safe patch, the system shall remove `ai-processing` and add `ai-failed`.
5. When an issue already has `ai-processed`, `ai-processing`, or `no-ai`, the scheduled workflow shall skip it.
6. When a maintainer comments `/cloudbase skip`, the system shall add `no-ai` and stop automatic processing for that issue.

### 需求 6 - 评论命令与权限边界

**用户故事：** 作为仓库维护者，我希望用真实存在的 slash command 控制 issue 自动化，并限制只有仓库维护者可以触发。

#### 验收标准

1. When an issue comment contains `/cloudbase fix`, `/cloudbase skip`, or `/cloudbase continue`, the system shall recognize it as a command trigger.
2. The system shall accept command triggers only from users whose author association is `OWNER`, `MEMBER`, or `COLLABORATOR`.
3. The system shall ignore pull request comments for this workflow.

### 需求 7 - 线程上下文重建

**用户故事：** 作为仓库维护者，我希望“继续处理”依赖 issue 线程里的真实记录，而不是依赖不稳定的 CI 内部会话状态。

#### 验收标准

1. When the system calls the AI for analysis or fix, it shall provide the issue title, body, labels, and full issue comment history.
2. When the workflow runs again for the same issue, it shall reconstruct context from the current issue thread instead of restoring a hidden session ID.

### 需求 8 - 稳健输出解析

**用户故事：** 作为仓库维护者，我希望 workflow 不会因为 CLI 输出结构变化而发出空评论。

#### 验收标准

1. When `codebuddy --output-format json` returns an object payload, the system shall extract the final text correctly.
2. When the command returns an array payload, the system shall extract the final text correctly.
3. When the command returns plain text instead of JSON, the system shall fall back to that text.
4. When the extracted text is empty, the system shall treat the run as failed and shall not post a success comment.

## 非功能性需求

1. **可靠性**：应避免把复杂 JSON 通过脆弱的 shell 单引号或单一路径字段假设传递
2. **可回滚性**：禁用 workflow 后应能立即停止自动处理
3. **安全性**：仅使用完成 issue comment / branch / PR 所需的最小 GitHub 权限
4. **可配置性**：认证方式应支持 `CODEBUDDY_AUTH_TOKEN` 或 `CODEBUDDY_API_KEY`
5. **可测试性**：输出解析、slash command 识别与 prompt 组装应具备最小回归测试
