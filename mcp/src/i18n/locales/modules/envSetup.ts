import { defineModule } from "../types.js";

export const envSetup = defineModule(
  {
    "initFailed": "CloudBase 服务初始化失败",
    "action.prepareAccount": "请完成所需的账号准备后重新调用 auth(action=\"status\")。",
    "action.realNameAuth": "请先完成实名认证，完成后重新调用 auth(action=\"status\")。",
    "action.camAuth": "请先开通 CloudBase 服务，完成后重新调用 auth(action=\"status\")。",
    "needRealNameAuth": "当前账号需要先完成实名认证",
    "needCamAuth": "当前账号需要先开通 CloudBase 服务",
    "userNotice":
      "系统检测到您当前没有可用的 CloudBase 环境，将自动尝试为您创建一个免费环境。\n创建依据：通过 NewUser / ReturningUser / BaasFree 等优惠活动资格检查；\n环境别名：ai-native（默认）；\n费用说明：该环境为免费活动赠送，创建过程不会产生费用；如不符合免费条件，将引导您前往购买页；\n流程说明：此为自动流程，无需您确认；创建成功后将自动绑定到当前会话。",
    "noPromotionalActivity": "当前账号不符合免费环境创建条件，请手动创建环境",
    "invalidEnvId": "环境创建成功但未返回有效的环境ID，请稍后重试或手动创建环境",
  },
  {
    "initFailed": "Failed to initialize the CloudBase service",
    "action.prepareAccount":
      "Complete the required account preparation, then call auth(action=\"status\") again.",
    "action.realNameAuth":
      "Complete real-name verification first, then call auth(action=\"status\") again.",
    "action.camAuth":
      "Activate the CloudBase service first, then call auth(action=\"status\") again.",
    "needRealNameAuth":
      "The current account must complete real-name verification first",
    "needCamAuth":
      "The current account must activate the CloudBase service first",
    "userNotice":
      "We detected that you currently have no available CloudBase environment, and will automatically try to create a free environment for you.\nEligibility: checked via promotional activities such as NewUser / ReturningUser / BaasFree;\nEnvironment alias: ai-native (default);\nCost: this environment is a free promotional gift and creating it incurs no charge; if you are not eligible for the free tier, you will be guided to the purchase page;\nProcess: this is an automatic flow and requires no confirmation; once created, the environment will be automatically bound to the current session.",
    "noPromotionalActivity":
      "The current account is not eligible for free environment creation. Please create an environment manually.",
    "invalidEnvId":
      "The environment was created but no valid environment ID was returned. Please retry later or create an environment manually.",
  },
);
