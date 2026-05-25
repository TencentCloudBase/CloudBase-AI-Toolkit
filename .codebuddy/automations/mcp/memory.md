# 自动化执行记忆

## 2026-04-01

- 本轮仅通过 report-api 处理 api_design 归因。
- 已将 5 条证据明确的问题更新为 `in_progress` 且 `owner=codex`，覆盖 JSSDK 与后端 API 两类。
- `npm run report:dev` 在当前仓库不存在，但本地 report-api 已可访问。
- issue 详情接口多次出现 Prisma connection pool timeout，因此本轮主要通过 `/runs`、`/runs/.../attribution`、`/result`、`/trace` 回溯证据。
- 新增 429 历史修复：将 997 条 workerLog 含 `429 usage exceeds frequency limit` 的 run attribution 统一回填为 `status=error`。
- 新增 issue 清理：将 6 条完全由 429 造成的历史 issue 标记为 `invalid`；保留 2 条混合样本 issue，不做误伤处理。
- 发现当前 report-api 只能写 attribution，不能直接改 `/api/runs/.../result` 的 run status。
