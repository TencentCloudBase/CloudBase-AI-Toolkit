import { defineModule } from "../types.js";

export const functionDeploy = defineModule(
  {
    taskSubject: "云函数 {fnName}",
    pollHint: "请继续轮询，不要向用户报告部署完成。",
    phaseWaitingActive: "正在等待 Active 状态",
    phaseBuildQueued: "镜像构建排队中（尚未收到首个构建事件）",
    phaseBuilding: "正在执行镜像构建（{status}）",
    phaseRunning: "部署任务执行中",
    statusSucceeded: "镜像部署成功。",
    statusFailed: "部署失败，请根据 error.stage 和 progress 排查。",
    statusExpired:
      "的部署任务已过期（超过最长保留时间）；云端可能仍在部署，请用 getFunctionDetail 确认实际状态。",
    statusUnknown: "部署任务状态未知。",
    registryCredentialHint:
      "个人版 TCR 推送凭证缺失或不合法：请在 MCP 配置的 env 中设置 {username}（腾讯云账号 UIN）与 {password}，配置后无需在请求参数中传递密码；不要向用户索要密码明文并写入工具参数。",
    configInvalid: "云函数镜像部署配置校验未通过，未执行部署。",
    dryRunPlanGenerated:
      "已生成云函数 {fnName} 的镜像部署 dry-run 计划，未执行构建、推送或云端变更。",
    deploySucceeded: "云函数 {fnName} 镜像部署成功。",
    taskExpired:
      "部署任务超过最长保留时间（2 小时）已被标记为过期；云端构建或云函数部署可能仍在继续，请通过 queryFunctions 的 getFunctionDetail 确认实际状态。",
    taskStoreLimitWarn:
      "云函数部署任务缓存已达上限但无可清理的终态任务，将暂时超过上限以避免中断正在执行的部署",
  },
  {
    taskSubject: "Cloud function {fnName}",
    pollHint:
      "Please keep polling; do not report the deployment as complete to the user.",
    phaseWaitingActive: "waiting for Active status",
    phaseBuildQueued:
      "image build queued (no build event received yet)",
    phaseBuilding: "running image build ({status})",
    phaseRunning: "deployment task in progress",
    statusSucceeded: "image deployment succeeded.",
    statusFailed:
      "deployment failed; investigate via error.stage and progress.",
    statusExpired:
      "'s deployment task has expired (maximum retention exceeded); the cloud deployment may still be running, use getFunctionDetail to confirm the actual status.",
    statusUnknown: "deployment task status unknown.",
    registryCredentialHint:
      "Personal-edition TCR push credentials are missing or invalid: set {username} (Tencent Cloud account UIN) and {password} in the MCP config env; once configured there is no need to pass the password in request parameters; do not ask the user for a plaintext password and write it into tool arguments.",
    configInvalid:
      "Cloud function image deployment config validation failed; deployment was not executed.",
    dryRunPlanGenerated:
      "Generated the image deployment dry-run plan for cloud function {fnName}; no build, push, or cloud changes were executed.",
    deploySucceeded: "Cloud function {fnName} image deployment succeeded.",
    taskExpired:
      "The deployment task has exceeded the maximum retention time (2 hours) and was marked expired; the cloud build or function deployment may still be in progress, use getFunctionDetail of queryFunctions to confirm the actual status.",
    taskStoreLimitWarn:
      "The cloud function deployment task cache has reached its limit but there are no terminal tasks to clean up; it will temporarily exceed the limit to avoid interrupting running deployments",
  },
);
