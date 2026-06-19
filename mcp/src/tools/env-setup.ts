/**
 * Environment Setup Module
 * 
 * Handles automatic environment provisioning for CloudBase MCP:
 * - TCB service initialization check and auto-init
 * - Free environment creation based on promotional activities
 * - Error handling and telemetry reporting
 */

import CloudBase from "@cloudbase/manager-node";
import { getLoginState } from "../auth.js";
import { debug, error as logError } from "../utils/logger.js";
import { telemetryReporter } from "../utils/telemetry.js";

/**
 * Error information for environment setup failures
 */
export interface EnvSetupError {
  code: string;
  message: string;
  helpUrl?: string;
  needRealNameAuth?: boolean;
  needCamAuth?: boolean;
  actionText?: string; // User-friendly action text
  requestId?: string; // Request ID for debugging
}

/**
 * Context object to track environment setup flow state
 */
export interface EnvSetupContext {
  uin?: string; // User UIN for telemetry
  checkTcbServiceAttempted?: boolean; // Whether CheckTcbService was called
  initTcbAttempted?: boolean; // Whether InitTcb was called
  tcbServiceChecked?: boolean; // Whether TCB service check was performed
  tcbServiceInitialized?: boolean; // Result of TCB service check
  initTcbError?: EnvSetupError; // Error from InitTcb if any
  promotionalActivitiesChecked?: boolean; // Whether promotional activities were checked
  promotionalActivities?: string[]; // List of available promotional activity keys
  createFreeEnvAttempted?: boolean; // Whether CreateFreeEnvByActivity was called
  createEnvError?: EnvSetupError; // Error from CreateFreeEnvByActivity if any
}

/**
 * Result of environment setup operations
 */
export interface EnvSetupResult {
  success: boolean;
  envId?: string;
  context: EnvSetupContext;
}

/**
 * Parse InitTcb error and extract user-friendly information
 */
function parseInitTcbError(err: any): EnvSetupError {
  const rawMessage = err?.message || err?.Message || String(err);
  const errorCode = err.code || err.Code || "UnknownError";
  const requestId = err.requestId || err.RequestId || '';
  const searchBlob = [
    errorCode,
    rawMessage,
    err?.ErrorMessage,
    err?.Response?.Error?.Message,
    err?.Response?.Error?.Code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let friendlyMessage = rawMessage || "CloudBase 服务初始化失败";
  let actionText = "请完成所需的账号准备后重新调用 auth(action=\"status\")。";

  const errorInfo: EnvSetupError = {
    code: errorCode,
    message: friendlyMessage,
    helpUrl: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp",
    actionText,
    requestId
  };

  const realNamePatterns = [
    "realname",
    "real-name",
    "实名认证",
    "实名",
    "身份认证",
    "identity verification",
  ];
  const camPatterns = [
    "cam",
    "not authorized",
    "unauthorized",
    "forbidden",
    "开通cloudbase",
    "开通 cloudbase",
    "开通服务",
    "未开通",
    "未授权",
    "service not activated",
    "activate cloudbase",
    "cloudbase service",
  ];

  if (realNamePatterns.some((pattern) => searchBlob.includes(pattern))) {
    errorInfo.needRealNameAuth = true;
    errorInfo.message = "当前账号需要先完成实名认证";
    errorInfo.actionText = "请先完成实名认证，完成后重新调用 auth(action=\"status\")。";
    return errorInfo;
  }

  if (camPatterns.some((pattern) => searchBlob.includes(pattern))) {
    errorInfo.needCamAuth = true;
    errorInfo.message = "当前账号需要先开通 CloudBase 服务";
    errorInfo.actionText = "请先开通 CloudBase 服务，完成后重新调用 auth(action=\"status\")。";
    return errorInfo;
  }

  errorInfo.message = friendlyMessage;
  errorInfo.actionText = actionText;
  return errorInfo;
}

/**
 * Report environment setup flow event to telemetry
 */
async function reportEnvSetupFlow(params: {
  step: string;
  success: boolean;
  uin?: string;
  error?: string;
  activities?: string[];
  envId?: string;
  envCount?: number;
  alias?: string;
}) {
  try {
    const eventData: { [key: string]: any } = {
      step: params.step,
      success: params.success ? 'true' : 'false',
      uin: params.uin || 'unknown',
    };

    // Add optional fields
    if (params.error) {
      eventData.error = params.error.substring(0, 200); // Limit error length
    }
    if (params.activities) {
      eventData.activities = params.activities.join(',');
    }
    if (params.envId) {
      eventData.envId = params.envId;
    }
    if (params.envCount !== undefined) {
      eventData.envCount = params.envCount;
    }
    if (params.alias) {
      eventData.alias = params.alias;
    }

    await telemetryReporter.report('toolkit_env_setup', eventData);
  } catch (err) {
    // Silent failure for telemetry reporting
    debug('Failed to report env setup flow', { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Check TCB service initialization status and auto-initialize if needed
 * 
 * @param cloudbase CloudBase manager instance
 * @param context Environment setup context
 * @returns Updated context with TCB service status
 */
export async function checkAndInitTcbService(
  cloudbase: CloudBase,
  context: EnvSetupContext
): Promise<EnvSetupContext> {
  const newContext = { ...context };

  try {
    // Step 1: Check if TCB service is initialized
    debug('[env-setup] Starting TCB service check...');
    debug('[env-setup] Context before check:', {
      uin: newContext.uin,
      tcbServiceChecked: newContext.tcbServiceChecked
    });

    newContext.checkTcbServiceAttempted = true;
    const checkResult = await cloudbase.commonService("tcb", "2018-06-08").call({
      Action: "CheckTcbService",
      Param: {}
    });

    newContext.tcbServiceChecked = true;
    newContext.tcbServiceInitialized = checkResult.Initialized;

    debug('[env-setup] TCB service check completed:', {
      initialized: checkResult.Initialized,
      requestId: checkResult.RequestId
    });

    // Report check result
    await reportEnvSetupFlow({
      step: 'check_tcb_service',
      success: true,
      uin: newContext.uin
    });

    // Step 2: Initialize TCB if not initialized
    if (!checkResult.Initialized) {
      debug('[env-setup] TCB service not initialized, attempting to initialize...');
      debug('[env-setup] InitTcb params:', { Source: "qcloud", Channel: "mcp" });

      try {
        newContext.initTcbAttempted = true;
        const initResult = await cloudbase.commonService("tcb", "2018-06-08").call({
          Action: "InitTcb",
          Param: {
            Source: "qcloud",
            Channel: "mcp"
          }
        });

        newContext.tcbServiceInitialized = true;
        debug('[env-setup] TCB service initialization succeeded:', {
          requestId: initResult.RequestId
        });

        // Report init success
        await reportEnvSetupFlow({
          step: 'init_tcb',
          success: true,
          uin: newContext.uin
        });

      } catch (initErr: any) {
        // Parse and save error, but don't throw - allow flow to continue
        newContext.initTcbError = parseInitTcbError(initErr);

        debug('[env-setup] TCB service initialization failed:', {
          code: newContext.initTcbError.code,
          message: newContext.initTcbError.message,
          needRealNameAuth: newContext.initTcbError.needRealNameAuth,
          needCamAuth: newContext.initTcbError.needCamAuth,
          helpUrl: newContext.initTcbError.helpUrl,
          rawError: initErr
        });

        logError('[env-setup] Failed to initialize TCB service:', new Error(newContext.initTcbError.message));

        // Report init failure
        await reportEnvSetupFlow({
          step: 'init_tcb',
          success: false,
          uin: newContext.uin,
          error: newContext.initTcbError.message
        });
      }
    } else {
      debug('[env-setup] TCB service already initialized, skipping InitTcb');
    }

  } catch (err: any) {
    // Check TCB service call failed
    debug('[env-setup] CheckTcbService call failed:', {
      error: err.message || String(err),
      code: err.code || err.Code,
      stack: err.stack
    });

    logError('[env-setup] Failed to check TCB service status:', err.message || String(err));

    // Report check failure
    await reportEnvSetupFlow({
      step: 'check_tcb_service',
      success: false,
      uin: newContext.uin,
      error: err.message || String(err)
    });
  }

  debug('[env-setup] checkAndInitTcbService completed:', {
    tcbServiceChecked: newContext.tcbServiceChecked,
    tcbServiceInitialized: newContext.tcbServiceInitialized,
    hasInitTcbError: !!newContext.initTcbError,
    initTcbError: newContext.initTcbError
  });

  return newContext;
}

/**
 * Check for free environment eligibility and create if qualified
 * 
 * @param cloudbase CloudBase manager instance
 * @param context Environment setup context
 * @returns Result with success status and envId if created
 */
export async function checkAndCreateFreeEnv(
  cloudbase: CloudBase,
  context: EnvSetupContext
): Promise<EnvSetupResult> {
  const newContext = { ...context };

  debug('[env-setup] Starting checkAndCreateFreeEnv...');
  debug('[env-setup] Context:', {
    uin: newContext.uin,
    hasInitTcbError: !!newContext.initTcbError,
    initTcbError: newContext.initTcbError
  });

  try {
    // Step 1: Query promotional activities
    debug('[env-setup] Checking promotional activity eligibility...');
    debug('[env-setup] DescribeUserPromotionalActivity params:', {
      Names: ["NewUser", "ReturningUser", "BaasFree"]
    });

    newContext.promotionalActivitiesChecked = true;
    const activityResult = await cloudbase.commonService("tcb", "2018-06-08").call({
      Action: "DescribeUserPromotionalActivity",
      Param: {
        Names: ["NewUser", "ReturningUser", "BaasFree"]
      }
    });

    const activities = activityResult.Activities || [];
    newContext.promotionalActivities = activities.map((a: any) => a.Name || a.Type);

    debug('[env-setup] Promotional activities result:', {
      activities: newContext.promotionalActivities,
      count: activities.length,
      requestId: activityResult.RequestId,
      rawResult: activityResult
    });

    // Report activity check result
    await reportEnvSetupFlow({
      step: 'check_promotional_activity',
      success: true,
      uin: newContext.uin,
      activities: newContext.promotionalActivities
    });

    // Step 2: Create free environment if qualified
    if (activities.length === 0) {
      debug('[env-setup] No promotional activities available, cannot create free environment');

      // Set error context to inform user they don't qualify for free environment
      newContext.createEnvError = {
        code: "NoPromotionalActivity",
        message: "当前账号不符合免费环境创建条件，请手动创建环境",
        helpUrl: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp"
      };

      return {
        success: false,
        context: newContext
      };
    }

    debug('[env-setup] User is eligible for free environment, attempting to create...');

    // Use the Type from the first available activity
    const firstActivity = activities[0];
    const activityType = firstActivity.Type || firstActivity.ActivityType || "sv_tcb_personal_qps_free";

    debug('[env-setup] Using activity type:', {
      activityType,
      firstActivity,
      allActivities: activities
    });

    try {
      const createParams = {
        Alias: "ai-native",
        Type: activityType,
        CloseAutoPay: true,
        EnableExcess: "true",
        IsAutoRenew: "false",
        Source: "qcloud"
      };

      debug('[env-setup] CreateFreeEnvByActivity params:', createParams);

      newContext.createFreeEnvAttempted = true;
      const createResult = await cloudbase.commonService("tcb", "2018-06-08").call({
        Action: "CreateFreeEnvByActivity",
        Param: createParams
      });

      debug('[env-setup] CreateFreeEnvByActivity raw response:', {
        fullResult: createResult,
        hasEnvId: !!(createResult?.EnvId),
        hasResponse: !!(createResult?.Response),
        responseEnvId: createResult?.Response?.EnvId,
        keys: Object.keys(createResult || {})
      });

      // Try multiple possible paths for EnvId
      const envId = createResult?.EnvId ||
        createResult?.Response?.EnvId ||
        createResult?.Data?.EnvId ||
        createResult?.envId;

      debug('[env-setup] Extracted envId:', {
        envId,
        source: createResult?.EnvId ? 'EnvId' :
          createResult?.Response?.EnvId ? 'Response.EnvId' :
            createResult?.Data?.EnvId ? 'Data.EnvId' :
              createResult?.envId ? 'envId' : 'none'
      });

      debug('[env-setup] Free environment created successfully:', {
        envId,
        tranId: createResult?.TranId || createResult?.Response?.TranId,
        requestId: createResult?.RequestId || createResult?.Response?.RequestId,
        fullResult: createResult
      });

      // Validate envId
      if (!envId || typeof envId !== 'string' || envId.trim() === '') {
        debug('[env-setup] WARNING: CreateFreeEnvByActivity returned empty or invalid envId', {
          envId,
          createResult
        });

        newContext.createEnvError = {
          code: "InvalidEnvId",
          message: "环境创建成功但未返回有效的环境ID，请稍后重试或手动创建环境",
          helpUrl: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp"
        };

        return {
          success: false,
          context: newContext
        };
      }

      // Report create success
      await reportEnvSetupFlow({
        step: 'create_free_env',
        success: true,
        uin: newContext.uin,
        envId: envId,
        alias: "ai-native"
      });

      return {
        success: true,
        envId: envId.trim(), // Ensure no whitespace
        context: newContext
      };

    } catch (createErr: any) {
      // Parse and clean error message
      let errorMessage = createErr.message || String(createErr);

      // Replace TCB with CloudBase
      errorMessage = errorMessage.replace(/TCB/g, 'CloudBase');
      errorMessage = errorMessage.replace(/tcb/gi, 'CloudBase');

      // Handle JSON error messages like "[CreateFreeEnvByActivity] {"ReturnValue":-1,...}"
      if (errorMessage.includes('[') && errorMessage.includes(']')) {
        const match = errorMessage.match(/\]\s*(.+)/);
        if (match && match[1]) {
          const jsonPart = match[1].trim();
          try {
            const parsed = JSON.parse(jsonPart);
            if (parsed.ReturnMessage) {
              errorMessage = parsed.ReturnMessage;
            } else if (parsed.Message) {
              errorMessage = parsed.Message;
            }
          } catch (e) {
            // If it's not valid JSON, try to extract readable message
            if (jsonPart.includes('ReturnMessage')) {
              const msgMatch = jsonPart.match(/ReturnMessage["\s:]+([^",}]+)/);
              if (msgMatch && msgMatch[1]) {
                errorMessage = msgMatch[1].trim();
              }
            }
          }
        }
      }

      // Clean up common error patterns
      errorMessage = errorMessage.replace(/\[CreateFreeEnvByActivity\]/gi, '');
      errorMessage = errorMessage.trim();

      // Parse and save error
      newContext.createEnvError = {
        code: createErr.code || createErr.Code || "UnknownError",
        message: errorMessage,
        helpUrl: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp"
      };

      debug('[env-setup] CreateFreeEnvByActivity failed:', {
        code: newContext.createEnvError.code,
        message: newContext.createEnvError.message,
        helpUrl: newContext.createEnvError.helpUrl,
        rawError: createErr
      });

      logError('[env-setup] Failed to create free environment:', new Error(newContext.createEnvError.message));

      // Report create failure
      await reportEnvSetupFlow({
        step: 'create_free_env',
        success: false,
        uin: newContext.uin,
        error: newContext.createEnvError.message
      });

      return {
        success: false,
        context: newContext
      };
    }

  } catch (err: any) {
    // Query promotional activity failed
    debug('[env-setup] DescribeUserPromotionalActivity call failed:', {
      error: err.message || String(err),
      code: err.code || err.Code,
      stack: err.stack
    });

    logError('[env-setup] Failed to check promotional activities:', err.message || String(err));

    // Report check failure
    await reportEnvSetupFlow({
      step: 'check_promotional_activity',
      success: false,
      uin: newContext.uin,
      error: err.message || String(err)
    });

    return {
      success: false,
      context: newContext
    };
  }
}

/**
 * Get UIN from login state for telemetry
 */
export async function getUinForTelemetry(): Promise<string | undefined> {
  try {
    // Get region from environment variable for auth URL
    const region = process.env.TCB_REGION;
    const loginState = await getLoginState({ region });
    // Try to extract UIN from loginState
    // Note: actual field name may vary, adjust based on actual response
    if (
      loginState &&
      typeof loginState === "object" &&
      "uin" in loginState &&
      typeof loginState.uin !== "undefined"
    ) {
      return String(loginState.uin);
    }
    return undefined;
  } catch (err) {
    debug('Failed to get UIN for telemetry', { error: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}
