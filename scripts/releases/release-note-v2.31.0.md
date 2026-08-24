# CloudBase MCP v2.31.0

## 🐛 问题修复

### 云托管 getDeployLog CODING 改写

- `queryCloudRun(getDeployLog)`（DescribeCloudRunBuildLog）遇腾讯云账号未开通 CODING 用户、或镜像部署无云端构建（BuildId=0）时，不再暴露原始英文报错
- 自动改写为 `getProcessLog` / `getDeployRecords` 的 next_step 与 nextActions 建议，AI 可直接跟进获取部署步骤与运行时日志
- 配套收窄 fallback next_step 的 action 联合类型，保证 webpack/tsc 编译通过

## 🔧 维护与工程改进（可选阅读）

- Skills / guideline `version` 元数据同步至 2.31.0
