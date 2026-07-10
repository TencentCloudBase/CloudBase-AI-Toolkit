---
description: "CloudBase 项目健康检查。检查环境状态、云函数列表、部署历史、日志状态。"
---

# CloudBase 项目健康检查

对 CloudBase 环境进行全面健康检查：环境状态、云函数列表、静态托管状态、日志服务状态。全量只读，无破坏性。

## Preflight

运行以下检查，失败时停止并给出可执行指引。

1. **MCP 连接检查** — 确认 `cloudbase-mcp` server 已连接。
   - 尝试调用 `envQuery({action:"info"})`。若调用失败，提示用户：
     > CloudBase MCP 未连接或未鉴权。请确认 `cloudbase-mcp` server 已启动并完成授权流程。
2. **环境选择** — 确认当前操作的 EnvId（`CLOUDBASE_ENV_ID` 或会话中已选定）。
   - 若未设置：调用 `envQuery({action:"list"})` 让用户选择目标环境。
3. **项目检测** — 检查当前目录是否为 CloudBase 项目：
   - `cloudbaserc.json` 存在 → 读取 `envId` 和 `functionRoot` 用于状态关联
   - `cloudfunctions/` 存在 → 标记为云函数项目
   - `dist/` 或 `public/` 存在 → 标记为静态托管项目
   - 非项目目录 → 仅做环境级检查，跳过项目级关联

## Plan

使用 MCP 工具执行只读取诊断：

1. 获取环境信息（RuntimeMode + Backends + 套餐状态）
2. 查询云函数列表及状态
3. 查询静态托管服务状态
4. 查询日志服务状态
5. 汇总异常项，给出修复建议

无破坏性操作 — 全部为只读查询。

## Commands

### 1. 环境信息检查

```
envQuery({ action: "info", envId: "<current-env-id>" })
```

提取并呈现：

- **EnvId** / **Alias** — 环境标识
- **RuntimeMode** — 运行模式（决定后端形态）
- **Backends** — 已开通的后端服务列表（NoSQL / MySQL / PostgreSQL / CloudRun / Functions / Storage / Hosting）
- **PackageType** — 套餐类型
- **Status** — 环境状态（正常 / 异常）

### 2. 云函数列表

```
queryFunctions({ action: "listFunctions", envId: "<current-env-id>" })
```

呈现云函数清单：

| FunctionName | Runtime | Status | LastModified |
|--------------|---------|--------|--------------|
| ...          | ...     | ...    | ...          |

异常标记：
- 函数状态为 ERROR → 标记异常
- 函数长时间未更新（>30 天）→ 提示可能过期

### 3. 静态托管状态

```
queryHosting({ action: "status", envId: "<current-env-id>" })
```

若环境已开通静态托管：

- 呈现托管状态（已开启 / 未开启）
- 呈现静态域名

```
queryHosting({ action: "websiteConfig", envId: "<current-env-id>" })
```

提取网站文档配置和站点域名信息。

若环境未开通静态托管：标记为"未开通"，不视为异常（取决于项目类型）。

### 4. 静态托管文件列表（可选）

```
queryHosting({ action: "listFiles", envId: "<current-env-id>" })
```

呈现已上传的文件清单，辅助判断部署状态。若文件列表为空但项目类型为 Web，提示用户部署静态资源。

### 5. 云托管服务状态（如适用）

若环境 RuntimeMode 支持云托管（`Cbr` 模式）：

```
queryCloudRun({ action: "status", envId: "<current-env-id>" })
```

呈现云托管服务状态：

| ServiceName | Status | Version | UpdatedAt |
|-------------|--------|---------|-----------|
| ...         | ...    | ...     | ...        |

### 6. 日志服务状态

```
queryLogs({ action: "status", envId: "<current-env-id>" })
```

呈现日志服务状态：
- 日志服务是否已开启
- 日志保留时长
- 最近日志写入时间

若日志服务未开启，提示用户：
> 日志服务未开启，无法查看运行日志。建议在控制台开启日志服务以便排查问题。

### 7. ops-inspector skill 提示

若检测到任何异常项（函数错误、托管未开通但项目为 Web、日志未开启等），提示用户使用 `ops-inspector` skill 进行深度巡检：

> 检测到 N 项异常。建议使用 `ops-inspector` skill 进行深度诊断，获取详细修复建议。

## Verification

确认每个检查项已成功执行：

- [ ] 环境信息查询成功（`envQuery` 返回有效结果）
- [ ] 云函数列表查询成功（或环境无函数时标记"无云函数"）
- [ ] 静态托管状态查询成功（或环境未开通时标记"未开通"）
- [ ] 云托管状态查询成功（如适用，环境不支持时跳过）
- [ ] 日志服务状态查询成功
- [ ] 异常项已汇总并给出修复建议

若某项检查失败，报告具体错误并继续执行其余检查（一项失败不阻塞其他检查）。

## Summary

呈现诊断报告：

```
## CloudBase Health Check

**EnvId**: <环境 ID> (<Alias>)
**RuntimeMode**: <运行模式>
**Overall Health**: healthy | warning | critical

### Environment
- Status: <正常/异常>
- Backends: <已开通的后端服务列表>
- PackageType: <套餐类型>

### Cloud Functions
- Total: <N>
- Healthy: <N>
- Error: <N>

| Function | Status | Last Modified |
|----------|--------|---------------|
| ...      | ...    | ...           |

### Static Hosting
- Status: <已开启/未开通>
- Domain: <静态域名>
- File Count: <N>

### CloudRun (if applicable)
- Services: <N>
- Running: <N>
- Stopped: <N>

### Logs
- Service: <已开启/未开启>
- Retention: <保留时长>

### Issues Found
- [⚠] <异常项 1 描述>
- [⚠] <异常项 2 描述>
```

若无异常，显示 `### Issues Found — None`。

## Next Steps

根据诊断结果建议修复操作：

- **函数状态错误** → "查看错误日志：`queryLogs({action:'list', functionName:'<name>'})`。或重新部署函数：`/cloudbase-deploy function`。"
- **静态托管未开通** → "若为 Web 项目，需在控制台开通静态托管服务。开通后运行 `/cloudbase-deploy hosting` 部署。"
- **静态托管文件为空** → "运行 `/cloudbase-deploy hosting` 上传静态资源到托管。"
- **云托管服务停止** → "运行 `manageCloudRun({action:'start'})` 启动服务，或检查服务配置。"
- **日志服务未开启** → "在控制台开启日志服务。开启后可使用 `queryLogs` 查看运行日志辅助排查问题。"
- **环境状态异常** → "环境状态异常，请前往 CloudBase 控制台检查环境配置和套餐状态。"
- **全部正常** → "环境运行正常。可运行 `/cloudbase-deploy` 部署新版本，或运行 `/cloudbase-env info` 查看环境详情。"
- **检测到多项异常** → "建议使用 `ops-inspector` skill 进行深度巡检，获取详细的修复指引和最佳实践建议。"
