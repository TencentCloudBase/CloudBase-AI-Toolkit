---
description: "CloudBase 环境管理。子命令: list (列出环境), info (当前环境详情), domains (安全域名)。默认: info"
---

# CloudBase 环境管理

管理 CloudBase 环境：列出所有环境、查看当前环境详情、查看安全域名配置。所有操作均为只读，无破坏性。

## Preflight

运行以下检查，失败时停止并给出可执行指引。

1. **MCP 连接检查** — 确认 `cloudbase-mcp` server 已连接。
   - 尝试调用 `envQuery({action:"list"})`，若调用失败或返回错误，提示用户：
     > CloudBase MCP 未连接或未鉴权。请确认 `cloudbase-mcp` server 已启动并完成授权流程。
2. **登录状态验证** — 若 `envQuery({action:"list"})` 返回空列表或鉴权错误，引导用户完成 CloudBase 登录。
3. **当前环境检测** — 检查 `CLOUDBASE_ENV_ID` 环境变量或会话上下文中是否已选定 EnvId。
   - 若未设置，`info` 和 `domains` 子命令需要先让用户从 `list` 结果中选择一个环境。

## Plan

根据 "$ARGUMENTS" 确定操作：

| 参数 | 操作 | 破坏性? |
|------|------|---------|
| `list` / `ls` | 列出所有可访问的 CloudBase 环境 | 否 |
| `info` / _(无参数)_ | 查看当前环境详情（含 RuntimeMode、Backends） | 否 |
| `domains` | 查看当前环境的安全域名配置 | 否 |

所有操作均为只读查询，无破坏性风险。

## Commands

### "list" 或 "ls"

调用 MCP 工具列出所有可访问的环境：

```
envQuery({ action: "list" })
```

解析返回结果，提取每个环境的关键信息：

| EnvId | Alias | Source | PackageType | RuntimeMode |
|-------|-------|--------|-------------|-------------|
| ...   | ...   | ...    | ...         | ...          |

- **EnvId** — 环境唯一标识
- **Alias** — 环境别名
- **Source** — 环境来源（miniapp / cloudrun / 等）
- **RuntimeMode** — 运行模式（FcRad / Cbr / 等）

### "info" 或无参数

查看当前环境的详细信息：

```
envQuery({ action: "info", envId: "<current-env-id>" })
```

若当前未选定环境，先执行 `list` 让用户选择，再调用 `info`。

呈现完整环境详情，包含但不限于：

- **EnvId** / **Alias** — 环境标识
- **RuntimeMode** — 运行模式（决定后端形态：函数计算 / 云托管 / 混合）
- **Backends** — 已开通的后端服务列表（NoSQL / MySQL / PostgreSQL / CloudRun / Functions / Storage / Hosting）
- **PackageType** / **Source** — 套餐类型与来源
- **Region** — 所在地域
- **CreatedAt** — 创建时间

同时基于 RuntimeMode 和 Backends 推荐相关 skills（RecommendedSkills）：

- 若 Backends 包含 `Functions` → 推荐 `cloud-functions` skill
- 若 Backends 包含 `Hosting` → 推荐 `web-development` skill
- 若 Backends 包含 `NoSQL` → 推荐 `cloudbase-document-database-*` skill
- 若 RuntimeMode 为 `Cbr` → 推荐 `cloudrun-development` skill

### "domains"

查看当前环境的安全域名配置：

```
envQuery({ action: "domains", envId: "<current-env-id>" })
```

呈现安全域名列表：

| Domain | Type | Status |
|--------|------|--------|
| ...    | ...  | ...    |

若未配置安全域名，提示用户：
> 当前环境未配置安全域名。Web 应用调用 CloudBase SDK 时需要安全域名白名单，请前往控制台或使用 `manageEnv` 工具添加。

## Verification

确认查询操作成功完成：

- [ ] `envQuery` 调用返回有效结果（非空且无错误）
- [ ] 环境列表或详情信息已完整呈现
- [ ] 若当前环境未设置，已引导用户选择

若调用失败，报告具体错误信息并建议：
- 鉴权失败 → 重新完成 CloudBase 登录授权
- 网络错误 → 检查网络连接后重试

## Summary

```
## Env Result
- **Action**: list | info | domains
- **Status**: success | failed
- **EnvId**: <当前环境 ID>（info/domains 时）
- **Details**: <关键输出摘要>
```

`list` 时展示环境数量；`info` 时展示 RuntimeMode 和 Backends；`domains` 时展示域名数量。

## Next Steps

根据操作结果建议后续操作：

- **list 后** → "运行 `/cloudbase-env info` 查看选定环境的详情，或运行 `/cloudbase-status` 进行健康检查。"
- **info 后** → "根据环境后端能力，运行 `/cloudbase-deploy` 部署资源，或运行 `/cloudbase-status` 检查资源状态。"
- **domains 后** → "如需添加安全域名，使用 `manageEnv` 工具或在控制台配置。Web 应用上线前务必添加访问域名。"
- **鉴权失败** → "请完成 CloudBase 授权流程后重试。参考 `auth-tool` skill 获取认证指引。"
