import type { CloudBaseData } from "../../shared/types.js";
import type { SlotHost } from "./slots.js";

export function getDataService(ctx: SlotHost | undefined): CloudBaseData | undefined {
  return ctx?.cloudbaseData;
}

export async function appendUserMessage(
  data: CloudBaseData | undefined,
  text: string,
): Promise<void> {
  if (!data?.appendToSession) {
    throw new Error("无法写入会话。请直接在对话框发送该指令。");
  }
  await data.appendToSession(text);
}
