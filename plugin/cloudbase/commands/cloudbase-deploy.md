---
description: "部署 CloudBase 资源。子命令: function (云函数), hosting (静态托管), cloudrun (云托管)。默认: 检测项目类型后提示"
---

# 部署 CloudBase 资源

将当前项目的云函数、静态托管或云托管服务部署到 CloudBase 环境。包含项目类型自动检测、生产环境门控确认和部署后验证。

## Preflight

运行以下检查，失败时停止并给出可执行指引。

1. **MCP 连接检查** — 确认 `cloudbase-mcp` server 已连接。
   - 调用 `envQuery({action:"info"})` 验证连接和登录状态。若失败，提示用户完成授权。
2. **环境选择** — 确认当前操作的 EnvId（`CLOUDBASE_ENV_ID` 或会话中已选定）。若未设置，先调用 `envQuery({action:"list"})` 让用户选择。
3. **项目类型检测** — 扫描当前目录结构，判断部署目标：

   | 目录/文件标记 | 部署目标 | 说明 |
   |--------------|---------|------|
   | `cloudfunctions/` 目录存在 | function | 云函数项目，目录下每个子目录为一个云函数 |
   | `dist/` 或 `public/` 或 `build/` 存在 | hosting | 静态托管项目，需先构建再部署 |
   | `Dockerfile` 存在 | cloudrun | 云托管项目，基于容器镜像部署 |
   | `project.config.json` 存在 | 小程序 | 提示使用微信开发者工具上传，非 MCP 部署 |

   若 "$ARGUMENTS" 指定了子命令（`function`/`hosting`/`cloudrun`），以参数为准；否则根据检测结果提示用户确认。

4. **Git 状态检查** — 运行 `git status --porcelain`。
   - 若输出非空：提示用户未提交的改动不会进入部署产物（MCP 直接读取本地文件，不经过 git）。询问是否先提交再部署。
   - 若非 git 仓库，跳过此检查。
5. **构建产物检查**（hosting 部署时）— 检测 `dist/`、`public/`、`build/` 是否存在且非空。
   - 若不存在：提示用户先运行构建命令（`npm run build` / `pnpm build` 等）。

## Plan

根据项目类型确定部署策略：

| 子命令 | MCP 工具 | 说明 |
|--------|---------|------|
| `function` | `manageFunctions({action:"deploy", ...})` | 部署 cloudfunctions/ 目录下的云函数 |
| `hosting` | `manageHosting({action:"uploadFiles", ...})` | 上传静态文件到静态托管 |
| `cloudrun` | `manageCloudRun({action:"deploy", ...})` | 部署云托管服务 |

**生产环境门控**：

若当前 EnvId 为生产环境（通过 `envQuery({action:"info"})` 的 Alias 或 Source 判断，或用户明确声明），必须获得显式确认：

> ⚠️ **生产环境部署请求。**
> 当前环境 `<EnvId>`（`<Alias>`）为生产环境，此次部署将影响线上服务。
> **请用户明确回复 "yes" 确认部署。** 未获确认前不得执行。

## Commands

### function — 云函数部署

将 `cloudfunctions/` 目录下的云函数部署到 CloudBase：

```
manageFunctions({
  action: "deploy",
  functionRootPath: "<cloudfunctions 目录的绝对路径>",
  envId: "<current-env-id>"
})
```

- `functionRootPath` 指向云函数目录的**父目录**（例如 `cloudfunctions` 目录的绝对路径）
- 工具会自动读取 `functionRootPath` 下每个同名子目录的文件并部署
- 无需手动压缩代码，工具自动处理

部署后，若需要更新单个函数代码：

```
manageFunctions({
  action: "updateFunctionCode",
  functionName: "<function-name>",
  functionRootPath: "<path-to-single-function-dir>",
  envId: "<current-env-id>"
})
```

### hosting — 静态托管部署

上传静态文件到 CloudBase 静态托管：

```
manageHosting({
  action: "uploadFiles",
  localPath: "<dist 或 public 目录的绝对路径>",
  cloudPath: "/",
  envId: "<current-env-id>"
})
```

上传完成后，获取静态托管的访问域名：

```
queryHosting({ action: "websiteConfig", envId: "<current-env-id>" })
```

生成带有随机 queryString 的访问链接（用于绕过 CDN 缓存验证最新版本）：

```
https://<static-domain>/?v=<random-string>
```

### cloudrun — 云托管部署

部署云托管服务（基于 Dockerfile）：

```
manageCloudRun({
  action: "deploy",
  serverName: "<service-name>",
  envId: "<current-env-id>"
})
```

- 需要当前目录存在 `Dockerfile`
- 部署后通过 `queryCloudRun({action:"status", serverName:"<name>"})` 查询服务状态

### CLI Fallback

当 MCP 工具不可用或缺少某项能力时，回退到 `tcb` CLI：

```bash
# 云函数部署
tcb fn deploy --envId <env-id> --name <function-name>

# 静态托管上传
tcb hosting deploy --envId <env-id> --dir <local-path>

# 云托管部署
tcb run deploy --envId <env-id> --name <service-name>
```

仅当 MCP 调用明确失败或缺少所需 action 时使用 CLI fallback，并在 Plan 中说明原因。

## Verification

部署完成后，验证操作是否生效：

### function 验证

```
queryFunctions({ action: "listFunctions", envId: "<current-env-id>" })
```

确认：
- 新部署的函数出现在列表中
- 函数状态为正常（非 ERROR）
- 对比部署前后的函数数量（如适用）

### hosting 验证

```
queryHosting({ action: "status", envId: "<current-env-id>" })
```

确认：
- 静态托管服务状态为已开启
- 上传的文件出现在文件列表中（`queryHosting({action:"listFiles"})`）

### cloudrun 验证

```
queryCloudRun({ action: "status", serverName: "<service-name>", envId: "<current-env-id>" })
```

确认：
- 服务状态为 Running
- 版本号已更新

### 失败处理

若部署失败：
- 提取错误信息中的关键字段（错误码、错误消息）
- 呈现错误详情
- 建议常见修复方案（构建失败 → 检查依赖；权限不足 → 检查 envId 权限）

## Summary

```
## Deploy Result
- **Action**: function | hosting | cloudrun
- **Status**: success | partial | failed
- **EnvId**: <环境 ID>
- **Target**: <函数名 / 托管域名 / 服务名>
- **URL**: <访问链接>（hosting 时，含随机 queryString）
- **BuildId / VersionId**: <构建版本>（function/cloudrun 时）
- **Details**: <关键输出摘要>
```

若部署失败，附加：

```
- **Error**: <失败原因摘要>
```

## Next Steps

根据部署结果建议后续操作：

- **function 成功** → "运行 `queryFunctions({action:'listFunctionLogs', functionName:'<name>'})` 查看运行日志，或运行 `/cloudbase-status` 检查整体状态。"
- **hosting 成功** → "CDN 缓存有几分钟延迟，可使用生成的随机 queryString 链接验证最新版本。运行 `/cloudbase-status` 查看托管状态。"
- **cloudrun 成功** → "运行 `queryCloudRun({action:'status'})` 监控服务运行状态，或查看访问日志。"
- **构建失败** → "检查 package.json 的 build 脚本，确认依赖已安装（`npm install`）。"
- **权限不足** → "确认当前 EnvId 的访问权限，或切换到有权限的环境：`/cloudbase-env list`。"
- **生产环境部署后** → "密切关注线上服务状态，可运行 `/cloudbase-status` 进行健康检查。"
