import { defineModule } from "../types.js";

export const functionUpdating = defineModule(
  {
    namedFn: "函数 `{fnName}`",
    targetFn: "目标函数",
    statusSuffix: "（当前 Status={status}）",
    notReady:
      "{namePart} 尚未就绪{statusPart}，无法执行 manageFunctions(action=\"{action}\")。",
    doNotRetryImmediately:
      "不要立即重试同一写操作（SCF 会在 Updating 期间连续拒绝 UpdateFunctionConfiguration / UpdateFunctionCode）。",
    waitAndRetry:
      "请等待 {seconds} 秒后重试，或先调用 queryFunctions(action=\"getFunctionDetail\") 确认 Status 为 Active。",
    rawError: "原始错误: {message}",
    reasonCheckStatus: "查看函数 Status，等到 Active 后再写配置/代码",
    reasonRetryAfterWait:
      "等待 {seconds} 秒且 Status=Active 后，用相同参数重试；禁止立刻连打",
  },
  {
    namedFn: "Function `{fnName}`",
    targetFn: "The target function",
    statusSuffix: " (current Status={status})",
    notReady:
      "{namePart} is not ready yet{statusPart}; cannot execute manageFunctions(action=\"{action}\").",
    doNotRetryImmediately:
      "Do not retry the same write operation immediately (SCF will keep rejecting UpdateFunctionConfiguration / UpdateFunctionCode while Updating).",
    waitAndRetry:
      "Wait {seconds} seconds before retrying, or call queryFunctions(action=\"getFunctionDetail\") first to confirm the Status is Active.",
    rawError: "Original error: {message}",
    reasonCheckStatus:
      "Check the function Status and wait until it is Active before writing config/code",
    reasonRetryAfterWait:
      "Wait {seconds} seconds until Status=Active, then retry with the same arguments; do not retry in rapid succession",
  },
);
