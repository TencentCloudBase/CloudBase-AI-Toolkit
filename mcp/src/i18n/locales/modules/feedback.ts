import { defineModule } from "../types.js";

export const feedback = defineModule(
  {
    title: "整理本次开发反馈",
    description:
      "把当前这次 CloudBase 开发整理成用户可以自己提交的反馈。" +
      "作品做出来了，用它生成案例，方便展示；开发不顺利，用它生成复盘，方便把卡点反馈给平台。" +
      "\n\n**什么时候用**：" +
      "\n- `channel=\"case\"`：部署或发布已经成功，用户愿意把作品放到案例墙时使用。返回案例草稿；用户确认后附上预填好的新建 issue 链接。" +
      "\n- `channel=\"retrospective\"`：用户表示这次开发不顺利、想反馈时使用。根据本会话里真实的工具调用失败生成复盘草稿；用户确认后同样附上预填链接。" +
      "\n\n**怎么用**：" +
      "\n- 第一次不要传 `confirmed`。先把返回的草稿全文给用户看。" +
      "\n- 用户明确同意后，再以 `confirmed=true` 调用。这时才会返回可打开的链接。" +
      "\n- 本工具不会替用户提交。取不到的内容会留空，不要编造作品名、简介、公网地址或对话轮次。" +
      "\n- 国际站链接指向 GitHub，正文为英文；国内站链接指向 CNB 上的 CloudBase-AI-ToolKit 仓库，正文为中文。",
    "schema.channel":
      "反馈用途：`case` 是把已完成的作品整理成案例；`retrospective` 是把这次不顺利的开发整理成复盘。",
    "schema.confirmed":
      "用户是否已经看过草稿全文并明确同意提交。省略或 false 时只返回草稿、不给链接。",
  },
  {
    title: "Prepare feedback for this session",
    description:
      "Turn this CloudBase session into feedback the user can submit themselves. " +
      "Use it to showcase a finished work, or to report a session that was hard to finish." +
      "\n\n**When to use**:" +
      "\n- `channel=\"case\"`: the deploy or publish already succeeded and the user wants the work on the case wall. Returns a case draft, and a prefilled new-issue link after the user confirms." +
      "\n- `channel=\"retrospective\"`: the user says this session went badly and wants to report it. Builds the retrospective from tool failures that actually happened in this session, and adds a prefilled link after confirmation." +
      "\n\n**How to use**:" +
      "\n- Do not pass `confirmed` on the first call. Show the returned draft to the user in full." +
      "\n- Call again with `confirmed=true` only after the user explicitly agrees. That call returns the link." +
      "\n- This tool does not submit the issue. Fields it cannot verify are left blank. Do not invent a title, summary, public URL, or conversation turn count." +
      "\n- International site: English draft and a GitHub link. China site: Chinese draft and a link to the CloudBase-AI-ToolKit repo on CNB.",
    "schema.channel":
      "What the feedback is for: `case` turns a finished work into a showcase entry; `retrospective` turns a difficult session into a write-up.",
    "schema.confirmed":
      "Whether the user has read the full draft and agreed to submit it. Omit or pass false to return the draft only, with no link.",
  },
);
