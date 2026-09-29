import { defineModule } from "../types.js";

export const feedback = defineModule(
  {
    title: "反馈草稿",
    description:
      "在用户明确要求时，根据本会话已发生的工具调用生成案例草稿或开发复盘草稿。" +
      "未确认时只返回草稿。本工具不提交网络请求。" +
      "复盘里的轮次没有本地信号时留空，不估算数字。",
    "schema.channel": "case：正向案例草稿。retrospective：负向开发复盘草稿。",
    "schema.confirmed": "用户是否已经看过草稿全文并明确确认。省略或 false 时只返回草稿。",
  },
  {
    title: "Feedback draft",
    description:
      "When the user explicitly asks, build a case draft or a development retrospective from tool calls already made in this session. " +
      "Before confirmation, return the draft only. This tool does not submit anything. " +
      "Leave turn counts blank when there is no local signal, and do not invent a number.",
    "schema.channel": "case: positive case draft. retrospective: development retrospective draft.",
    "schema.confirmed":
      "Whether the user has seen the full draft and explicitly confirmed it. Omit or pass false to return the draft only.",
  },
);
