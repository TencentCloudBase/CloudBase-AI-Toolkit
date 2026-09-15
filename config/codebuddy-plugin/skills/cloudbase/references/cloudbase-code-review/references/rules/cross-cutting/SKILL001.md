# SKILL001 `searchKnowledgeBase` 后必须 `Read` 完整文件内容

- **Module**: cross-cutting (skill-usage)
- **Severity**: warning
- **Stage**: code-generation

---

## 正则检查 (Lint)

`references/lint-rules/README.md` 中可选 lint 代码块的扫描条件：

- 检查 trace 或日志中是否有 `searchKnowledgeBase` 调用
- 检查对应的 skill 文件是否被 `Read` 过
- 如果 `searchKnowledgeBase(mode="skill")` 返回了文件路径但未 `Read` 该路径，触发 SKILL001

当前 lint 脚本暂不覆盖此项（需要解析 trace.json）。

## LLM 检查

请人工或 LLM 审查以下问题：

1. 本次开发过程中是否调用了 `searchKnowledgeBase(mode="skill")` 来查询 skill？
2. 如果是，是否 `Read` 了返回的完整 skill 文件路径？
3. `searchKnowledgeBase` 返回的通常是 skill 路径 + 元信息（name, description），**不是完整内容**。关键的 API 签名、参数说明、陷阱警告都在完整 SKILL.md 中。
4. 确认没有"搜到了但没读完"的情况。

## 修复指引

1. 调用 `searchKnowledgeBase(mode="skill", skillName="xxx")`
2. 从返回结果中提取 `absolute path`（如 `/Users/.../.claude/skills/xxx/SKILL.md`）
3. 执行 `Read` 工具，传入该绝对路径
4. 阅读完整内容后再写代码

## 根因

`searchKnowledgeBase(mode="skill")` 返回的内容以元信息为主（路径、标题、简介），不包含完整文档。agent 如果只依赖返回的片段就写代码，容易遗漏 skill 中的重要约束和陷阱。必须再 `Read` 一次拿到完整内容。
