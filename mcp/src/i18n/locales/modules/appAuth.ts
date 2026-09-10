import { defineModule } from "../types.js";

export const appAuth = defineModule(
  {
    queryTitle: "查询 CloudBase 应用认证配置",
    queryDescription:
      "CloudBase 应用侧认证配置只读入口。用于查询登录方式、provider、publishable key、API key、client 配置和静态域名等认证准备状态。⚠️ 本工具为管理端配置查询工具，不执行用户登录。当任务要求编写客户端登录代码时（例如「用 JS SDK 登录」），应先通过本工具确认配置状态，再在项目代码中编写 @cloudbase/js-sdk 客户端登录代码（如 auth.signInWithPassword()），而非使用本工具完成登录。若业务要接受普通用户名样式标识符，先查询 action=getLoginConfig；若 usernamePassword=false，下一步应立即调用 manageAppAuth(action=patchLoginStrategy, patch={ usernamePassword: true })，不要直接写 email 登录 API。",
    manageTitle: "管理 CloudBase 应用认证配置",
    manageDescription:
      "CloudBase 应用侧认证配置写入口。用于修改登录方式、provider、client 配置，确保 publishable key，以及创建或删除 API key、自定义登录密钥。⚠️ 本工具为管理端配置工具，不执行用户登录。当任务要求编写客户端登录代码时（例如「用 JS SDK 登录」），应先通过本工具完成配置（如启用 usernamePassword、获取 publishable key），再在项目代码中编写 @cloudbase/js-sdk 客户端登录代码（如 auth.signInWithPassword()），而非使用本工具完成登录。若前端要接受普通用户名样式标识符，应先执行 action=patchLoginStrategy 并传入 patch={ usernamePassword: true }，再实现对应前端登录逻辑。⚠️ 短信验证码登录（patch={ phone: true }）使用云开发默认短信通道，开启后即可收发验证码，不需要配置短信签名/模板/自定义 Provider；仅当需要自定义模板/签名或更换短信服务商时才需配置 SmsVerificationConfig 或自定义短信通道。⚠️ action=createApiKey 返回体中的 created 字段表示是否真正新建：created=false 说明复用了环境中已存在的 key，此时 keyName/expireIn 入参不会生效，返回的 keyName/expireAt 均为服务端真实值，并会附带 warnings，切勿把它当作临时凭证分发。",
    mustBeObject: "{label} 必须是对象",
    mustBeStringOrObject: "{label} 必须是字符串或对象",
    noActiveEnv: "未选择当前环境",
    authRequired: "需要先完成认证",
    paramRequired: "action={action} 时必须提供 {param}",
    smsHint:
      "短信验证码登录已开启，可直接使用云开发默认短信通道收发验证码，无需配置短信签名/模板/自定义 Provider。" +
      "前端调用 auth.getVerification({ phone_number }) 发送验证码、auth.signInWithSms({ verificationInfo, verificationCode, phoneNum }) 登录。" +
      "仅当需要自定义短信模板/签名或更换短信服务商时，才需要配置 SmsVerificationConfig 或接入自定义短信通道。",
    webSdkBlockedReason: "普通用户名样式的标识符需要启用 usernamePassword 认证",
    webSdkRegisterHint:
      "直接使用用户名/密码 signUp 取决于 SDK/provider 的支持情况，使用前必须验证；否则请通过后端或管理端 API 边界创建用户。",
    sdkHintCaution:
      "verifyOtp 是 signInWithOtp / signUp 返回结果上的回调：只传 token，调用 data.verifyOtp({ token })。不要调用独立的 auth.verifyOtp({ token })——它还需要额外的 messageId，缺少 messageId 时会报错 'messageId is required'。报错 'messageId is required' 说明你用的是独立调用而不是回调。",
    warnKeyReused:
      "keyType={keyType} 未创建新的 key，返回的是环境中已存在的 key（keyId={keyId}）。若该类型每个环境唯一，请改用 action=ensurePublishableKey 语义理解此结果。",
    warnKeyNameIgnored:
      "请求的 keyName=\"{keyName}\" 未生效，服务端实际存储的名称为 \"{resolvedKeyName}\"。",
    warnExpireInIgnored:
      "请求的 expireIn={expireIn} 未生效，返回的 key 使用其原有过期时间 {expireAt}。请勿将其视为临时凭证。",
  },
  {
    queryTitle: "Query CloudBase app authentication config",
    queryDescription:
      "Read-only entry for CloudBase app-side authentication configuration. Queries login methods, providers, publishable key, API keys, client config, and static domain to check auth readiness. ⚠️ This is a management-side config query tool; it does not perform user login. When a task asks you to write client login code (e.g. \"login with the JS SDK\"), first confirm the configuration via this tool, then write @cloudbase/js-sdk client login code (e.g. auth.signInWithPassword()) in the project code instead of using this tool to log in. If the app should accept plain username-style identifiers, query action=getLoginConfig first; if usernamePassword=false, immediately call manageAppAuth(action=patchLoginStrategy, patch={ usernamePassword: true }) next — do not write email login APIs directly.",
    manageTitle: "Manage CloudBase app authentication config",
    manageDescription:
      "Write entry for CloudBase app-side authentication configuration. Modifies login methods, providers, and client config, ensures the publishable key, and creates or deletes API keys and custom login keys. ⚠️ This is a management-side config tool; it does not perform user login. When a task asks you to write client login code (e.g. \"login with the JS SDK\"), first complete the configuration here (e.g. enable usernamePassword, obtain the publishable key), then write @cloudbase/js-sdk client login code (e.g. auth.signInWithPassword()) in the project code instead of using this tool to log in. If the frontend should accept plain username-style identifiers, run action=patchLoginStrategy with patch={ usernamePassword: true } first, then implement the corresponding frontend login logic. ⚠️ SMS verification code login (patch={ phone: true }) uses the CloudBase default SMS channel; once enabled you can send/receive verification codes without configuring SMS signature/template/custom providers; only configure SmsVerificationConfig or a custom SMS channel if you need custom templates/signatures or a different SMS provider. ⚠️ The created field in the action=createApiKey response indicates whether a key was really created: created=false means an existing key in the environment was reused — the keyName/expireIn inputs take no effect, the returned keyName/expireAt are the server's real values, and warnings are attached. Never distribute it as a temporary credential.",
    mustBeObject: "{label} must be an object",
    mustBeStringOrObject: "{label} must be a string or an object",
    noActiveEnv: "no active environment selected",
    authRequired: "authentication required",
    paramRequired: "{param} is required when action={action}",
    smsHint:
      "SMS verification code login is enabled; the CloudBase default SMS channel can send/receive codes without configuring SMS signature/template/custom providers. " +
      "The frontend calls auth.getVerification({ phone_number }) to send codes and auth.signInWithSms({ verificationInfo, verificationCode, phoneNum }) to log in. " +
      "Only configure SmsVerificationConfig or a custom SMS channel if you need custom templates/signatures or a different SMS provider.",
    webSdkBlockedReason: "plain username-style identifiers require usernamePassword auth",
    webSdkRegisterHint:
      "direct username/password signUp is SDK/provider dependent; verify before use, otherwise create users through a backend or management API boundary",
    sdkHintCaution:
      "verifyOtp is a callback on the signInWithOtp / signUp result: call data.verifyOtp({ token }) with only the token. Do NOT call a standalone auth.verifyOtp({ token }) — it requires an extra messageId and fails with 'messageId is required' when the messageId is missing. Error 'messageId is required' means you used the standalone call instead of the callback.",
    warnKeyReused:
      "keyType={keyType} did not create a new key; the response is an existing key in the environment (keyId={keyId}). If this type is unique per environment, interpret this result with the action=ensurePublishableKey semantics.",
    warnKeyNameIgnored:
      "The requested keyName=\"{keyName}\" took no effect; the name actually stored by the server is \"{resolvedKeyName}\".",
    warnExpireInIgnored:
      "The requested expireIn={expireIn} took no effect; the returned key keeps its original expiry {expireAt}. Do not treat it as a temporary credential.",
  },
);
