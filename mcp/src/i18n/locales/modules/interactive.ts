import { defineModule } from "../types.js";

export const interactive = defineModule(
  {
    loginRequired: "请先登录云开发账户",
    envQueryFailed: "无法获取环境列表: {error}",
    envNotYetAvailable: "环境正在创建中，请稍等片刻后刷新页面或重新尝试",
    invalidEnvId: "环境创建成功但环境ID无效，请稍后重试",
    missingEnvId: "环境创建成功但未返回环境ID，请稍后重试或手动创建环境",
    createEnvFailed: "免费环境创建失败，请手动创建环境",
    noEnvironments: "未找到可用环境",
    tcbInitFailed: "CloudBase 初始化失败: {message}",
    envCreationFailed: "环境创建失败: {message}",
    visitUrl: "请访问: {url}",
    envSelectionTimeout: "环境选择超时（{seconds}秒），请重新尝试或手动设置环境ID",
    userCancelled: "用户取消了环境选择",
    autoSetupError: "自动配置环境ID时出错:",
  },
  {
    loginRequired: "Please log in to your CloudBase account first",
    envQueryFailed: "Failed to retrieve the environment list: {error}",
    envNotYetAvailable:
      "The environment is being created. Please wait a moment, refresh the page, or try again.",
    invalidEnvId:
      "The environment was created but the environment ID is invalid. Please retry later.",
    missingEnvId:
      "The environment was created but no environment ID was returned. Please retry later or create an environment manually.",
    createEnvFailed:
      "Failed to create the free environment. Please create an environment manually.",
    noEnvironments: "No available environments found",
    tcbInitFailed: "CloudBase initialization failed: {message}",
    envCreationFailed: "Environment creation failed: {message}",
    visitUrl: "Please visit: {url}",
    envSelectionTimeout:
      "Environment selection timed out ({seconds}s). Please retry or set the environment ID manually.",
    userCancelled: "The user cancelled environment selection",
    autoSetupError: "Error while automatically configuring the environment ID:",
  },
);
