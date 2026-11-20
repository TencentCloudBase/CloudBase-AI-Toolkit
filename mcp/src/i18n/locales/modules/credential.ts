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

    "expired.pg":
      "临时密钥已过期，不是 PostgreSQL 实例尚未就绪。MCP 会重新换取密钥，请重试该操作；不要解绑重连。原始错误：{reason}",
    "expired.env":
      "临时密钥已过期，不是登录态丢失。MCP 会重新换取密钥，请重试该操作；不要解绑重连，也不要重新授权。",
    "scopeLimited.env":
      "凭据权限边界：环境级凭据（API Key 或托管授权）调用账号级管控面接口被拒。这不是临时密钥过期，重新换取密钥或重试同一请求都不会成功；不要解绑重连。改用带 EnvId 的接口（如 DescribeEnvInfo），或换用账号级凭据。",
    "scopeLimited.pg":
      "凭据权限边界：环境级凭据无法调用该账号级管控面接口，不是 PostgreSQL 实例未就绪，也不是临时密钥过期。重试或刷新密钥都不会成功。请改用带 EnvId 的接口，或换用账号级凭据。原始错误：{reason}",

    "trigger.unexpected":
      "已从函数 {fnName} 删除触发器 {triggerName}，但 {names} 也一并消失了。请核对下方列表并按需重建。",
    "trigger.dryRunDelete":
      "未执行：dryRun=true 时不会删除触发器。当前列表：{triggers}；计划删除：{triggerName}。去掉 dryRun 或设为 false 才会真实执行。",
    "trigger.dryRunCreate":
      "未执行：dryRun=true 时不会创建触发器。计划创建：{triggers}。去掉 dryRun 或设为 false 才会真实执行。",
    "trigger.replaceAll":
      "默认 false：若函数上还有未列入 triggers 的定时触发器，工具会拒绝执行并列出名字。确认要用本次提交替换全部定时触发器时设为 true。",
    "trigger.wouldReplace":
      "未执行：底层按定时触发器全量替换，继续创建会删除 {names}。若要保留请把它们一起传入 triggers；确认替换请显式设置 replaceAll=true。",
    "trigger.listUnavailable":
      "未执行：无法读取当前触发器列表，已停止操作以避免误判。请先用 queryFunctions(action=\"listFunctionTriggers\") 核对后重试。",
    "trigger.dryRunCreateWithRemoval":
      "未执行：dryRun=true 时不会创建触发器。计划创建：{triggers}；真实执行时会被替换删除：{names}。保留它们请一起传入 triggers，或设置 replaceAll=true 确认替换。",
    "trigger.createdUnexpected":
      "已创建触发器，但 {names} 也消失了。请核对返回的 triggersBefore / triggersAfter 并按需重建。",
    "trigger.listUnavailableAfter":
      "操作已执行，但无法读取操作后的触发器列表，本次无法核对是否有其它触发器消失。请用 queryFunctions(action=\"listFunctionTriggers\") 复核。",
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

    "expired.pg":
      "The temporary credential expired; this is not a PostgreSQL instance that is still initializing. A new credential will be requested. Retry the operation; do not reconnect. Original error: {reason}",
    "expired.env":
      "The temporary credential expired; this is not a lost login. A new credential will be requested. Retry the operation; do not reconnect or re-authorize.",
    "scopeLimited.env":
      "Credential permission boundary: an env-level credential (API Key or hosted authorization) was rejected by an account-level control-plane API. This is not an expired temporary credential; renewing it or retrying the same request will not help. Do not reconnect. Use an EnvId-scoped action such as DescribeEnvInfo, or switch to account-level credentials.",
    "scopeLimited.pg":
      "Credential permission boundary: an env-level credential cannot call this account-level control-plane API. This is not a PostgreSQL instance that is still initializing, and not an expired temporary credential. Retrying or renewing the credential will not help. Use an EnvId-scoped action, or switch to account-level credentials. Original error: {reason}",

    "trigger.unexpected":
      "Deleted trigger {triggerName} of function {fnName}, but {names} also disappeared. Review the lists below and recreate them if needed.",
    "trigger.dryRunDelete":
      "Not executed: dryRun=true does not delete triggers. Current list: {triggers}; planned removal: {triggerName}. Omit dryRun or set it to false to execute.",
    "trigger.dryRunCreate":
      "Not executed: dryRun=true does not create triggers. Planned: {triggers}. Omit dryRun or set it to false to execute.",
    "trigger.replaceAll":
      "Default false: if the function has timer triggers not listed in triggers, the tool refuses and lists their names. Set true to replace all timer triggers with this submission.",
    "trigger.wouldReplace":
      "Not executed: the backend replaces all timer triggers, so continuing would delete {names}. Include them in triggers to keep them, or set replaceAll=true to confirm the replacement.",
    "trigger.listUnavailable":
      "Not executed: the current trigger list could not be read, so the operation stopped. Check it with queryFunctions(action=\"listFunctionTriggers\") first, then retry.",
    "trigger.dryRunCreateWithRemoval":
      "Not executed: dryRun=true does not create triggers. Planned: {triggers}; a real run would delete {names}. Include them in triggers to keep them, or set replaceAll=true to confirm.",
    "trigger.createdUnexpected":
      "Triggers were created, but {names} also disappeared. Review triggersBefore / triggersAfter in the result and recreate them if needed.",
    "trigger.listUnavailableAfter":
      "The operation ran, but the resulting trigger list could not be read, so this call cannot confirm what disappeared. Check it with queryFunctions(action=\"listFunctionTriggers\").",
  },
);
