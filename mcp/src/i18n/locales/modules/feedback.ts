import { defineModule } from "../types.js";

export const feedback = defineModule(
  {
    title: "打开反馈页面",
    description:
      "返回公开仓库的新建 issue 页面。" +
      "\n\n**什么时候用**：" +
      "\n- `channel=\"case\"`：作品已经做出来，用户想展示到案例墙。" +
      "\n- `channel=\"retrospective\"`：这次开发不顺利，用户想把卡点反馈给平台。" +
      "\n\n**怎么用**：" +
      "\n- 只调用一次。返回的是页面地址，不是已提交的 issue。" +
      "\n- 在对话里写好正文，把链接交给用户。用户登录后自己提交。" +
      "\n- 不要代为提交，不要把环境 ID 或密钥写进正文。",
    "schema.channel":
      "`case` 打开案例模板；`retrospective` 打开复盘模板。",
    nextStep:
      "链接只打开新建页面，由用户登录后自己提交。不要代为提交，不要把环境 ID 或密钥写进正文。正文写在对话里，让用户粘贴到页面。",
  },
  {
    title: "Open the feedback page",
    description:
      "Return the public repository's new-issue page." +
      "\n\n**When to use**:" +
      "\n- `channel=\"case\"`: the work is done and the user wants it on the case wall." +
      "\n- `channel=\"retrospective\"`: the session went badly and the user wants to report it." +
      "\n\n**How to use**:" +
      "\n- Call once. The result is a page URL, not a submitted issue." +
      "\n- Write the text in the chat and give the user the link. They log in and submit it." +
      "\n- Do not submit it for them. Do not put an environment ID or secrets in the text.",
    "schema.channel":
      "`case` opens the showcase template; `retrospective` opens the retrospective template.",
    nextStep:
      "The link only opens the new-issue page. The user logs in and submits it. Do not submit it for them, and do not put an environment ID or secrets in the text. Write the text in chat for the user to paste.",
  },
);
