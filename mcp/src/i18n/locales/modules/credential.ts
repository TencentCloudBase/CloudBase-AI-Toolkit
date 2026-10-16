import { defineModule } from "../types.js";

/**
 * 凭证形态入参的**执行前软确认**文案。
 *
 * 两条硬约束：
 *   1. **消息里不得出现密钥明文** —— 只给长度、分段长度、指纹（sha256 前 12 位）三样摘要，
 *      足够客户端做程序化比对、也足够人眼看异常，而明文一旦进对话就等于进了客户端数据与日志；
 *   2. 文案必须给**动作**（回到原始来源重新复制 / 改用引用方式传入），而不是只说"校验失败"。
 *
 * ⚠️ 这三样摘要同样是凭证派生数据，**不得写进任何日志或遥测**。
 */
export const credential = defineModule(
  {
    "message.confirmJwt":
      "参数里出现了一段三段式凭证（JWT）。请把它与你手上的**原始来源**逐字比对下面这份摘要，一致再确认：\n" +
      "· 长度：{length} 字符\n" +
      "· 分段长度：{segments}\n" +
      "· 指纹（sha256 前 12 位）：{fingerprint}\n" +
      "不一致说明它在复制或转写时被改写过：请回到原始来源重新复制，或改用引用方式传入。",
    "message.confirmOpaque":
      "参数里出现了一段密钥（{kind}）。请把它与你手上的**原始来源**逐字比对下面这份摘要，一致再确认：\n" +
      "· 长度：{length} 字符\n" +
      "· 指纹（sha256 前 12 位）：{fingerprint}\n" +
      "不一致说明它在复制或转写时被改写过：请回到原始来源重新复制，或改用引用方式传入。",

    "option.confirm": "一致，确认写入",
    "option.cancel": "取消",

    "blocked.instant":
      "未执行：核对在 {durationMs}ms 内就返回了，物理上不可能包含人工比对这一步。请回到原始来源重新复制该凭证后重试。",
    "blocked.cancelled": "未执行：你取消了核对。请回到原始来源重新复制该凭证，或改用引用方式传入。",
    "blocked.timeout": "未执行：{seconds}s 内没有收到核对结果（超时）。请重试。",
    "blocked.error": "未执行：核对流程出错（{reason}）。请重试。",
    "hint.release": "如需放行：把 {action} 加入 CLOUDBASE_MCP_SKIP_CREDENTIAL_GUARD。",
  },
  {
    "message.confirmJwt":
      "A three-part credential (JWT) appears in this call's arguments. Compare it character by character against your original source and confirm only if the digest below matches:\n" +
      "· length: {length} characters\n" +
      "· segment lengths: {segments}\n" +
      "· fingerprint (first 12 hex of sha256): {fingerprint}\n" +
      "A mismatch means it was changed while copying or transcribing: copy it again from the original source, or pass it by reference instead.",
    "message.confirmOpaque":
      "A key ({kind}) appears in this call's arguments. Compare it character by character against your original source and confirm only if the digest below matches:\n" +
      "· length: {length} characters\n" +
      "· fingerprint (first 12 hex of sha256): {fingerprint}\n" +
      "A mismatch means it was changed while copying or transcribing: copy it again from the original source, or pass it by reference instead.",

    "option.confirm": "Matches, write it",
    "option.cancel": "Cancel",

    "blocked.instant":
      "Not executed: the check returned within {durationMs}ms, which cannot have included a human comparison. Copy the credential again from its original source and retry.",
    "blocked.cancelled":
      "Not executed: you cancelled the check. Copy the credential again from its original source, or pass it by reference instead.",
    "blocked.timeout": "Not executed: no check result within {seconds}s (timed out). Please retry.",
    "blocked.error": "Not executed: the check failed ({reason}). Please retry.",
    "hint.release": "To allow it: add {action} to CLOUDBASE_MCP_SKIP_CREDENTIAL_GUARD.",
  },
);
