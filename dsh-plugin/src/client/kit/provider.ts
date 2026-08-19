import type { CloudBaseData } from "../../shared/types.js";

/**
 * 通用平台数据 Provider —— kit 的输入输出协议。
 *
 * 只关心输入输出，不关心底层实现。任何满足该接口的对象都能驱动 kit 组件，
 * 因此**不同业务可以实现自己的 provider**：
 * - CloudBase 默认实现：cloudbase-data 服务（host 端包装 cloudbase-mcp，经 typert RPC
 *   暴露给浏览器，底层是 MCP capi / callCloudApi 直调腾讯云控制面 API）
 * - 其他云 / 自研服务：实现同样的接口即可复用 ResourceTable / UrlPreview / EnvSelect
 *   等 kit 组件（参见 examples/custom-provider.example.ts 的 mock 示例）
 *
 * 约定：kit 组件一律通过 PlatformProvider 访问数据，不做云耦合；业务侧负责把
 * 自己的云 API 翻译成这套输入输出协议。
 */
export type PlatformProvider = CloudBaseData;

/** kit 跨组件事件名（纯 UI 层信号，与具体云无关）。 */
export const KIT_EVENTS = {
  /** 当前环境已切换（会话 set_env 或面板下拉选择）。detail = envId */
  envBound: "cloudbase-dsh:env-bound",
  /** 环境正在切换（面板下拉选中，MCP 绑定完成前）。无 detail */
  envChanging: "cloudbase-dsh:env-changing",
  /** 环境已切换并应刷新 toolview 卡片。detail = envId */
  envChanged: "cloudbase-dsh:env-changed",
  /** 出现新访问地址，应激活预览视图。detail = url */
  activatePreview: "cloudbase-dsh:activate-preview",
  /** 最近访问地址列表变化。detail = RecentDeploy[] */
  recentDeploys: "cloudbase-dsh:recent-deploys",
} as const;

export type KitEventName = (typeof KIT_EVENTS)[keyof typeof KIT_EVENTS];

export { type CloudBaseData };
