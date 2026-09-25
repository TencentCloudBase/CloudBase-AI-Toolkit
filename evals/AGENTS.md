# evals/ 子目录约定

- 本目录是 CloudBase Evals：面向 AI agent 的开源平台评测（对标 supabase/evals 形态）。设计背景与阶段性方案在评测仓库的 `specs/`（不入库），本目录只放对外内容。
- `evals/benchmark/` 是公开榜单场景；`evals/regression/` 追踪已知失败模式，不进公开榜单。
- 场景格式：每个场景一个目录，`PROMPT.md`（frontmatter：stage / interface（必填）/ product / topic）+ `EVAL.ts`（评分器）+ 可选 `README.md`。
- 评分器以确定性断言为主（真实状态回读），LLM judge 只做语义判断；静态正则只做客观二元判断。
- 编写场景前必须先核对 CloudBase 官方文档（API 签名、包名、端口、参数），不要凭记忆假设。
- runner 类型在 `packages/core`。`EVAL.ts` 仍是 scorer 草案，干跑用假上下文，不创建云环境。根 tsconfig 未 include 本目录，不会影响主构建。
- 进榜 experiment 必须有 `-no-skills` 孪生（见 `experiments/presets.ts`）。CLI 版本写在各 harness 的 `defaultCliVersion`。
- 榜单统计规范见 README：3-run 平均、harness 版本 pin、一次运行独占一个环境。
