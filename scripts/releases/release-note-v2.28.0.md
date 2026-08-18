# CloudBase MCP v2.28.0

## 🎉 新功能

### 环境管理
- `queryEnv` 新增 metrics 分支，可按 `DescribeCurveData` 查询环境指标
- 补齐环境资源用量查询，对齐 tcb env usage / info

### 云托管
- `queryCloudRun` 新增 `getProcessLog`，可查运行日志
- `manageCloudRun` 补齐流量管理（灰度 / 全量 / 回滚）与部署记录查询
- 镜像部署返回 `runId` / `next_step`，引导用 `getProcessLog` 轮询（BuildId 为 0 时跳过 `getDeployLog`）
- `initEnv` 补齐 `EnvType=tcbr`、可选 VPC、部署 VPC 自动填充，以及 CAM / API Key 失败时的鉴权引导
- 屏蔽云托管小租户创建接口，避免误调

### 网关与注册表
- 网关补齐 OPA 授权策略管理（对齐 tcb policy + SDK）
- `@cloudbase/cloudbase-mcp` 已发布到 Official MCP Registry

### Skills / 运维
- ops-inspector v3：告警解读（峰值 QPS / CPU）+ 四个故障剧本
- skill-inject 匹配数据持久化到独立 `skill-metadata.json`；React 全栈提示词路由到 `web-development`

## 🐛 问题修复

- CloudRun / Apps / Gateway 对平台状态做大小写归一化，避免 `FAILED` / `CREATING` / `success` 漏判
- `readNoSql` 加强 projection / `MgoLimit` 使用指引
- Compat Check：pass-through 仅复制 git 跟踪文件，并支持 `.yaml` / `.yml` 基线分类
- PostgreSQL `ExecutePGSql` 对 `set role` 报错补充引导

## 📚 文档更新

- 云托管容器部署失败 SOP（`deploy_failed`、probe、镜像拉不起等）
- 云函数 Layer 命名约定 `{layerName}_{envId}`

## 🔧 维护与工程改进（可选阅读）

- ClawHub / SkillHub 发布幂等，避免「版本已存在」导致流水线失败
- 废弃并移除 `workbuddy-template-prewarm`
- Skills / guideline `version` 元数据同步至 2.28.0
