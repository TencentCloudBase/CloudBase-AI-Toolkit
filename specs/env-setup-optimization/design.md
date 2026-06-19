# 技术方案设计

## 1. 当前代码流程分析

### 1.1 环境查询触发流程

```
User: "登录云开发" 或调用 envQuery 工具
    ↓
mcp/src/tools/env.ts:registerEnvTools() - login 工具
    ↓
mcp/src/tools/interactive.ts:_promptAndSetEnvironmentId()
    ↓
1. getLoginState() - 确保用户已登录
2. getCloudBaseManager() - 获取 CloudBase Manager 实例
3. commonService("tcb").call({Action: "DescribeEnvs"}) - 查询环境列表
4. 根据环境数量决定：
   - 0个环境 → 调用 InteractiveServer.collectEnvId([])
   - 1个环境 → 自动选择
   - 多个环境 → 调用 InteractiveServer.collectEnvId(EnvList)
    ↓
mcp/src/interactive-server.ts:collectEnvId()
    ↓
打开本地 HTTP 服务器 (http://localhost:3721)
展示环境选择页面 (getEnvSetupHTML())
```

### 1.2 环境选择页面结构

当前页面结构（位于 `mcp/src/interactive-server.ts:getEnvSetupHTML()`）：

```html
<div class="env-list">
  <!-- 如果有环境 -->
  <div class="env-item" onclick="selectEnv()">...</div>
  
  <!-- 如果没有环境 -->
  <div class="empty-state">
    <h3>暂无 CloudBase 环境</h3>
    <button onclick="createNewEnv()">新建环境</button>
  </div>
</div>

<div class="actions">
  <button onclick="cancel()">取消</button>
  <button onclick="confirm()">确认选择</button>
</div>
```

## 2. 新增自动开通流程设计

### 2.1 整体流程图

```
User: "登录云开发"
    ↓
_promptAndSetEnvironmentId()
    ↓
getLoginState() - 获取登录状态（包含 uin）
    ↓
[新增] checkAndInitTcbService() - 检查并初始化 TCB 服务
    ↓
    CheckTcbService 接口
    ↓
    Initialized = true?
    ├─ Yes → 继续查询环境
    └─ No → InitTcb 接口
         ↓
         成功? 
         ├─ Yes → 继续查询环境
         └─ No → 记录错误，保存到 context
    ↓
DescribeEnvs - 查询环境列表
    ↓
EnvList.length = 0?
    ├─ No → 显示环境列表
    └─ Yes → [新增] checkAndCreateFreeEnv() - 检查并创建免费环境
         ↓
         DescribeUserPromotionalActivity 接口
         (Names: ["NewUser", "ReturningUser", "BaasFree"])
         ↓
         Activities 不为空?
         ├─ Yes → CreateFreeEnvByActivity 接口
         │    (Alias: "ai-native", Type: Activities[0].Type)
         │    ↓
         │    成功? 
         │    ├─ Yes → 返回新环境，刷新页面
         │    └─ No → 记录错误，保存到 context
         └─ No → 不符合免费条件
    ↓
collectEnvId(envList, errorContext) - 展示环境选择页面
    ↓
[新增] 根据 errorContext 展示错误提示和重试按钮
```

### 2.2 核心函数设计

#### 2.2.1 checkAndInitTcbService() 函数

新增文件：`mcp/src/tools/env-setup.ts`

```typescript
interface EnvSetupContext {
  initTcbError?: {
    code: string;
    message: string;
    // TODO: 需要确认具体的错误码映射关系
    needRealNameAuth?: boolean;  // 是否需要实名认证
    needCamAuth?: boolean;       // 是否需要 CAM 授权
    helpUrl?: string;            // 帮助链接
  };
  createEnvError?: {
    code: string;
    message: string;
    helpUrl?: string;
  };
  uin?: string;  // 用户 UIN，用于统计上报
}

/**
 * Check and initialize TCB service
 * @returns {success: boolean, context: EnvSetupContext}
 */
async function checkAndInitTcbService(
  cloudbase: CloudBase,
  loginState: any
): Promise<{
  success: boolean;
  context: EnvSetupContext;
}> {
  const context: EnvSetupContext = {
    uin: loginState?.uin ? String(loginState.uin) : undefined
  };

  try {
    // Step 1: Check TCB service status
    const checkResult = await cloudbase.commonService("tcb").call({
      Action: "CheckTcbService",
      Param: {}
    });

    // Report check result
    await reportEnvSetupFlow({
      step: "check_tcb_service",
      success: true,
      uin: context.uin,
      result: checkResult
    });

    // If already initialized, return success
    if (checkResult.Initialized === true) {
      debug("TCB service already initialized");
      return { success: true, context };
    }

    // Step 2: Initialize TCB service
    debug("TCB service not initialized, calling InitTcb...");
    
    const initResult = await cloudbase.commonService("tcb").call({
      Action: "InitTcb",
      Param: {
        Source: "qcloud",
        Channel: "mcp",
        // PolicyNames: No longer required (removed)
      }
    });

    // Report init result
    await reportEnvSetupFlow({
      step: "init_tcb",
      success: true,
      uin: context.uin,
      result: initResult
    });

    return { success: true, context };

  } catch (error: any) {
    // Parse error and save to context
    context.initTcbError = parseInitTcbError(error);

    // Report error
    await reportEnvSetupFlow({
      step: error.message?.includes("CheckTcbService") ? "check_tcb_service" : "init_tcb",
      success: false,
      uin: context.uin,
      error: error.message || String(error)
    });

    debug("TCB initialization failed", error);
    return { success: false, context };
  }
}

/**
 * Parse InitTcb error and generate help info
 * TODO: 需要确认具体的错误码和对应的处理链接
 */
function parseInitTcbError(error: any): EnvSetupContext["initTcbError"] {
  const code = error.code || error.Code || "UnknownError";
  const message = error.message || String(error);

  const errorInfo: EnvSetupContext["initTcbError"] = {
    code,
    message
  };

  // TODO: 需要根据实际错误码映射
  // 常见错误码示例（需要确认）：
  // - "RealNameAuthRequired" → 需要实名认证
  // - "CamAuthRequired" → 需要 CAM 授权
  // - "AccountNotAuthorized" → 账号未授权
  
  // Unified help URL for all Init errors
  errorInfo.helpUrl = "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp";
  
  // Try to identify error type from message
  if (message.includes("实名") || message.includes("RealName")) {
    errorInfo.needRealNameAuth = true;
  } else if (message.includes("授权") || message.includes("CAM")) {
    errorInfo.needCamAuth = true;
  }

  return errorInfo;
}
```

#### 2.2.2 checkAndCreateFreeEnv() 函数

```typescript
/**
 * Check promotional activity and create free environment
 * @returns {success: boolean, envId?: string, context: EnvSetupContext}
 */
async function checkAndCreateFreeEnv(
  cloudbase: CloudBase,
  context: EnvSetupContext
): Promise<{
  success: boolean;
  envId?: string;
  context: EnvSetupContext;
}> {
  try {
    // Step 1: Check promotional activity eligibility
    const activityResult = await cloudbase.commonService("tcb").call({
      Action: "DescribeUserPromotionalActivity",
      Param: {
        Names: ["NewUser", "ReturningUser", "BaasFree"]
        // Note: Do NOT pass EnvId here
      }
    });

    // Report activity check result
    await reportEnvSetupFlow({
      step: "check_promotional_activity",
      success: true,
      uin: context.uin,
      activities: activityResult.Activities?.map((a: any) => a.Name || a.Type) || []
    });

    // If no eligible activities, return
    if (!activityResult.Activities || activityResult.Activities.length === 0) {
      debug("User is not eligible for free environment");
      return { success: false, context };
    }

    // Step 2: Create free environment
    debug("User is eligible for free environment, creating...");
    
    // Use the Type from the first available activity
    const firstActivity = activityResult.Activities[0];
    const activityType = firstActivity.Type || firstActivity.ActivityType || "sv_tcb_personal_qps_free";

    const createResult = await cloudbase.commonService("tcb").call({
      Action: "CreateFreeEnvByActivity",
      Param: {
        Alias: "ai-native",  // Fixed alias, confirmed by user
        Type: activityType,  // Use activity's Type dynamically
        CloseAutoPay: true,
        EnableExcess: "true",
        IsAutoRenew: "false",
        Source: "qcloud"
      }
    });

    // Report create result
    await reportEnvSetupFlow({
      step: "create_free_env",
      success: true,
      uin: context.uin,
      envId: createResult.EnvId,
      alias: "ai-native"
    });

    return {
      success: true,
      envId: createResult.EnvId,
      context
    };

  } catch (error: any) {
    // Parse error and save to context
    context.createEnvError = {
      code: error.code || error.Code || "UnknownError",
      message: error.message || String(error),
      helpUrl: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp"
    };

    // Report error
    await reportEnvSetupFlow({
      step: error.message?.includes("DescribeUserPromotionalActivity") 
        ? "check_promotional_activity" 
        : "create_free_env",
      success: false,
      uin: context.uin,
      error: error.message || String(error)
    });

    debug("Free environment creation failed", error);
    return { success: false, context };
  }
}

// Note: Environment alias is now fixed as "ai-native" (confirmed by user)
// No need for generateEnvAlias() function
```

#### 2.2.3 修改 _promptAndSetEnvironmentId() 函数

```typescript
// 修改 mcp/src/tools/interactive.ts

export async function _promptAndSetEnvironmentId(
  autoSelectSingle: boolean,
  server?: any,
): Promise<{
  selectedEnvId: string | null;
  cancelled: boolean;
  error?: string;
  noEnvs?: boolean;
  switch?: boolean;
}> {
  // 1. 确保用户已登录
  const loginState = await getLoginState();
  if (!loginState) {
    return {
      selectedEnvId: null,
      cancelled: false,
      error: "请先登录云开发账户",
    };
  }

  // 2. [新增] 检查并初始化 TCB 服务
  let setupContext: EnvSetupContext = {
    uin: loginState?.uin ? String(loginState.uin) : undefined
  };

  const cloudbase = await getCloudBaseManager({
    requireEnvId: false,
    cloudBaseOptions: server?.cloudBaseOptions,
  });

  const { success: initSuccess, context: initContext } = 
    await checkAndInitTcbService(cloudbase, loginState);
  
  // Merge context
  setupContext = { ...setupContext, ...initContext };

  // 3. 获取可用环境列表
  let envResult;
  try {
    // Report env list query
    await reportEnvSetupFlow({
      step: "query_env_list",
      success: true,
      uin: setupContext.uin
    });

    envResult = await cloudbase.commonService("tcb").call({
      Action: "DescribeEnvs",
      Param: {
        EnvTypes: ["weda", "baas"],
        IsVisible: false,
        Channels: ["dcloud", "iotenable", "tem", "scene_module"],
      },
    });

    // Transform response format
    if (envResult && envResult.EnvList) {
      envResult = { EnvList: envResult.EnvList };
    } else if (envResult && envResult.Data && envResult.Data.EnvList) {
      envResult = { EnvList: envResult.Data.EnvList };
    }
  } catch (error) {
    // Report error
    await reportEnvSetupFlow({
      step: "query_env_list",
      success: false,
      uin: setupContext.uin,
      error: error instanceof Error ? error.message : String(error)
    });

    // Fallback to original method
    try {
      envResult = await cloudbase.env.listEnvs();
    } catch (fallbackError) {
      debug("降级到 listEnvs() 也失败:", fallbackError);
    }
  }

  const { EnvList } = envResult || {};

  // 4. [新增] 如果没有环境，尝试创建免费环境
  let selectedEnvId: string | null = null;
  
  if (!EnvList || EnvList.length === 0) {
    // Report no envs
    await reportEnvSetupFlow({
      step: "no_envs",
      success: true,
      uin: setupContext.uin
    });

    const { success: createSuccess, envId, context: createContext } = 
      await checkAndCreateFreeEnv(cloudbase, setupContext);
    
    // Merge context
    setupContext = { ...setupContext, ...createContext };

    if (createSuccess && envId) {
      // Auto-select the newly created environment
      selectedEnvId = envId;
      await envManager.setEnvId(selectedEnvId);
      return { selectedEnvId, cancelled: false };
    }
  }

  // 5. 显示环境选择页面（包含错误提示）
  if (autoSelectSingle && EnvList && EnvList.length === 1) {
    selectedEnvId = EnvList[0].EnvId;
  } else {
    const interactiveServer = getInteractiveServer(server);
    const accountInfo: { uin?: string } = {
      uin: setupContext.uin
    };
    
    // Report env selection display
    await reportEnvSetupFlow({
      step: "display_env_selection",
      success: true,
      uin: setupContext.uin,
      envIds: EnvList?.map((e: any) => e.EnvId) || []
    });

    // Pass error context to UI
    const result = await interactiveServer.collectEnvId(
      EnvList || [],
      accountInfo,
      setupContext  // [新增] 传递错误上下文
    );

    if (result.cancelled) {
      return { selectedEnvId: null, cancelled: true };
    }
    if (result.switch) {
      // Report switch account
      await reportEnvSetupFlow({
        step: "switch_account",
        success: true,
        uin: setupContext.uin
      });
      return { selectedEnvId: null, cancelled: false, switch: true };
    }
    selectedEnvId = result.data;
  }

  // 6. 更新环境ID缓存
  if (selectedEnvId) {
    await envManager.setEnvId(selectedEnvId);
  }

  return { selectedEnvId, cancelled: false };
}
```

### 2.3 环境选择页面错误展示设计

#### 2.3.1 修改 collectEnvId() 函数签名

```typescript
// 修改 mcp/src/interactive-server.ts

async collectEnvId(
  envs: any[],
  accountInfo?: { uin?: string },
  errorContext?: EnvSetupContext  // [新增] 错误上下文
): Promise<InteractiveResult> {
  // ... existing code ...
  
  const html = this.getEnvSetupHTML(envs, accountInfo, errorContext);
  
  // ... existing code ...
}
```

#### 2.3.2 修改 getEnvSetupHTML() 函数

```typescript
private getEnvSetupHTML(
  envs?: any[],
  accountInfo?: { uin?: string },
  errorContext?: EnvSetupContext  // [新增] 错误上下文
): string {
  // ... existing code (head, styles, etc.) ...
  
  return `
  <!DOCTYPE html>
  <html>
  <head>...</head>
  <body>
    <div class="container">
      <div class="header">
        <h1>CloudBase 环境选择</h1>
        ${accountInfo?.uin ? `<p class="account-info">当前账号: ${accountInfo.uin}</p>` : ""}
      </div>

      <!-- [新增] 错误提示区域 -->
      ${errorContext && (errorContext.initTcbError || errorContext.createEnvError) ? `
      <div class="error-banner" id="errorBanner">
        <div class="error-icon">⚠️</div>
        <div class="error-content">
          ${errorContext.initTcbError ? `
            <h3>TCB 服务初始化失败</h3>
            <p class="error-message">${errorContext.initTcbError.message}</p>
            ${errorContext.initTcbError.needRealNameAuth ? `
              <p class="error-hint">
                <svg>...</svg>
                您需要先完成实名认证才能使用云开发服务
              </p>
              <a href="${errorContext.initTcbError.helpUrl}" target="_blank" class="help-link">
                前往实名认证 →
              </a>
            ` : ""}
            ${errorContext.initTcbError.needCamAuth ? `
              <p class="error-hint">
                <svg>...</svg>
                您需要授权云开发访问您的云资源
              </p>
              <a href="${errorContext.initTcbError.helpUrl}" target="_blank" class="help-link">
                前往授权页面 →
              </a>
            ` : ""}
            ${!errorContext.initTcbError.needRealNameAuth && !errorContext.initTcbError.needCamAuth ? `
              <p class="error-hint">
                <svg>...</svg>
                <!-- TODO: 需要确认通用错误的帮助文档链接 -->
                <a href="https://docs.cloudbase.net/faq" target="_blank">查看帮助文档</a>
              </p>
            ` : ""}
            <button class="btn btn-warning retry-btn" onclick="retryInitTcb()">
              <svg>...</svg>
              重试初始化
            </button>
          ` : ""}
          
          ${errorContext.createEnvError ? `
            <h3>免费环境创建失败</h3>
            <p class="error-message">${errorContext.createEnvError.message}</p>
            <p class="error-hint">
              <svg>...</svg>
              您可以手动创建环境或重试自动创建
            </p>
            <div class="error-actions">
              <a href="${errorContext.createEnvError.helpUrl}" target="_blank" class="btn btn-secondary">
                手动创建环境
              </a>
              <button class="btn btn-warning retry-btn" onclick="retryCreateEnv()">
                <svg>...</svg>
                重试创建
              </button>
            </div>
          ` : ""}
        </div>
      </div>
      ` : ""}

      <!-- 环境列表区域 -->
      <div class="env-list" id="envList">
        ${envs && envs.length > 0
          ? envs.map((env) => `...`).join("")
          : `
          <div class="empty-state">
            <h3>暂无 CloudBase 环境</h3>
            <p>当前没有可用的 CloudBase 环境，请新建后重新在 AI 对话中重试</p>
            <button class="btn btn-primary create-env-btn" onclick="createNewEnv()">
              新建环境
            </button>
          </div>
          `
        }
      </div>

      <!-- 操作按钮区域 -->
      <div class="actions">...</div>
    </div>

    <script>
      let selectedEnvId = null;

      // [新增] 重试 TCB 初始化
      function retryInitTcb() {
        document.getElementById('errorBanner').innerHTML = 
          '<div class="loading"><div class="spinner"></div><span>正在重试初始化...</span></div>';
        
        fetch('/api/retry-init-tcb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).then(response => response.json())
          .then(data => {
            if (data.success) {
              // Reload environment list
              location.reload();
            } else {
              alert('初始化失败: ' + (data.error || '未知错误'));
              location.reload();
            }
          }).catch(err => {
            alert('网络请求失败: ' + err.message);
            location.reload();
          });
      }

      // [新增] 重试创建免费环境
      function retryCreateEnv() {
        document.getElementById('errorBanner').innerHTML = 
          '<div class="loading"><div class="spinner"></div><span>正在重试创建环境...</span></div>';
        
        fetch('/api/retry-create-env', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).then(response => response.json())
          .then(data => {
            if (data.success && data.envId) {
              // Auto-select and submit the new environment
              selectedEnvId = data.envId;
              confirm();
            } else {
              alert('创建失败: ' + (data.error || '未知错误'));
              location.reload();
            }
          }).catch(err => {
            alert('网络请求失败: ' + err.message);
            location.reload();
          });
      }

      // ... existing functions (selectEnv, confirm, cancel, etc.) ...
    </script>

    <style>
      /* [新增] 错误提示样式 */
      .error-banner {
        background: #fff5f5;
        border: 1px solid #feb2b2;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 24px;
        display: flex;
        gap: 12px;
      }
      
      .error-icon {
        font-size: 24px;
        flex-shrink: 0;
      }
      
      .error-content {
        flex: 1;
      }
      
      .error-content h3 {
        margin: 0 0 8px 0;
        color: #c53030;
        font-size: 16px;
        font-weight: 600;
      }
      
      .error-message {
        margin: 0 0 12px 0;
        color: #742a2a;
        font-size: 14px;
      }
      
      .error-hint {
        margin: 8px 0;
        color: #744210;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .help-link {
        color: #2b6cb0;
        text-decoration: none;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      
      .help-link:hover {
        text-decoration: underline;
      }
      
      .retry-btn {
        margin-top: 12px;
        background: #ed8936;
        border-color: #ed8936;
      }
      
      .retry-btn:hover {
        background: #dd6b20;
        border-color: #dd6b20;
      }
      
      .error-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
    </style>
  </body>
  </html>
  `;
}
```

#### 2.3.3 添加重试 API 端点

```typescript
// 修改 mcp/src/interactive-server.ts:setupExpress()

private setupExpress() {
  this.app.use(express.json());
  this.app.use(express.static("public"));

  // ... existing routes ...

  // [新增] Retry init TCB endpoint
  this.app.post("/api/retry-init-tcb", async (req, res) => {
    try {
      const loginState = await getLoginState();
      const cloudbase = await getCloudBaseManager({
        requireEnvId: false,
      });

      const { success, context } = await checkAndInitTcbService(
        cloudbase,
        loginState
      );

      if (success) {
        res.json({ success: true });
      } else {
        res.json({
          success: false,
          error: context.initTcbError?.message || "初始化失败"
        });
      }
    } catch (error) {
      res.json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // [新增] Retry create free env endpoint
  this.app.post("/api/retry-create-env", async (req, res) => {
    try {
      const loginState = await getLoginState();
      const cloudbase = await getCloudBaseManager({
        requireEnvId: false,
      });

      const context: EnvSetupContext = {
        uin: loginState?.uin ? String(loginState.uin) : undefined
      };

      const { success, envId, context: resultContext } = 
        await checkAndCreateFreeEnv(cloudbase, context);

      if (success && envId) {
        res.json({ success: true, envId });
      } else {
        res.json({
          success: false,
          error: resultContext.createEnvError?.message || "创建失败"
        });
      }
    } catch (error) {
      res.json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
```

## 3. CloudMode 兼容方案

### 3.1 CloudMode 检测

当前代码已实现 CloudMode 检测（`mcp/src/utils/cloud-mode.ts`）：

```typescript
export function isCloudMode(): boolean {
  const hasCloudModeArg = process.argv.includes('--cloud-mode');
  const cloudModeEnabled = process.env.CLOUDBASE_MCP_CLOUD_MODE === 'true' || 
                          process.env.MCP_CLOUD_MODE === 'true';
  return hasCloudModeArg || cloudModeEnabled;
}
```

### 3.2 CloudMode 下的行为调整

在 CloudMode 下，不支持展示交互式 UI，因此需要调整行为：

```typescript
// 修改 mcp/src/tools/interactive.ts

export async function _promptAndSetEnvironmentId(
  autoSelectSingle: boolean,
  server?: any,
): Promise<{
  selectedEnvId: string | null;
  cancelled: boolean;
  error?: string;
  noEnvs?: boolean;
  switch?: boolean;
}> {
  // ... existing code ...

  // [新增] CloudMode 检测
  const inCloudMode = isCloudMode();
  
  // CloudMode: Auto-select first environment if available
  if (inCloudMode && EnvList && EnvList.length > 0) {
    selectedEnvId = EnvList[0].EnvId;
    debug("CloudMode: Auto-selected first environment:", selectedEnvId);
    await envManager.setEnvId(selectedEnvId);
    return { selectedEnvId, cancelled: false };
  }

  // Normal mode: show interactive UI
  // ... existing code ...
}
```

### 3.3 CloudMode 下的自动开通策略

在 CloudMode 下，自动开通流程的行为与正常模式一致：

1. **TCB 服务初始化**：执行自动初始化
   - 成功 → 继续
   - 失败 → 返回错误信息（包含处理链接）

2. **免费环境创建**：执行自动创建
   - 成功 → 自动选择新环境
   - 失败 → 返回错误信息（包含手动创建链接）

**重要变更**：CloudMode 下也支持自动创建环境，不再仅返回错误。

```typescript
// CloudMode 下的行为
export async function _promptAndSetEnvironmentId(
  autoSelectSingle: boolean,
  server?: any,
): Promise<{
  selectedEnvId: string | null;
  cancelled: boolean;
  error?: string;
  noEnvs?: boolean;
  switch?: boolean;
}> {
  // ... check and init TCB ...
  // ... query env list ...

  const inCloudMode = isCloudMode();
  
  // If no envs, try to create free environment (both normal and cloud mode)
  if (!EnvList || EnvList.length === 0) {
    const { success, envId, context: createContext } = 
      await checkAndCreateFreeEnv(cloudbase, setupContext);
    
    setupContext = { ...setupContext, ...createContext };

    if (success && envId) {
      // Auto-select the newly created environment
      selectedEnvId = envId;
      await envManager.setEnvId(selectedEnvId);
      return { selectedEnvId, cancelled: false };
    }

    // If creation failed in cloud mode, return error message
    if (inCloudMode) {
      let errorMsg = "未找到可用环境";
      if (setupContext.initTcbError) {
        errorMsg += `\nTCB 初始化失败: ${setupContext.initTcbError.message}`;
      }
      if (setupContext.createEnvError) {
        errorMsg += `\n环境创建失败: ${setupContext.createEnvError.message}`;
      }
      if (setupContext.createEnvError?.helpUrl || setupContext.initTcbError?.helpUrl) {
        errorMsg += `\n请访问: ${setupContext.createEnvError?.helpUrl || setupContext.initTcbError?.helpUrl}`;
      }
      return {
        selectedEnvId: null,
        cancelled: false,
        error: errorMsg,
        noEnvs: true
      };
    }

    // In normal mode, show UI (even if creation failed)
    // ... continue to show UI ...
  }

  // If in cloud mode and has envs, auto-select first one
  if (inCloudMode && EnvList && EnvList.length > 0) {
    selectedEnvId = EnvList[0].EnvId;
    debug("CloudMode: Auto-selected first environment:", selectedEnvId);
    await envManager.setEnvId(selectedEnvId);
    return { selectedEnvId, cancelled: false };
  }

  // Normal mode: show interactive UI
  // ... existing code ...
}
```

## 4. 统计上报机制

### 4.1 新增上报事件

新增文件：`mcp/src/utils/env-setup-telemetry.ts`

```typescript
import { telemetryReporter } from './telemetry.js';
import { debug } from './logger.js';

interface EnvSetupFlowEvent {
  // step: check_tcb_service:检查TCB服务;init_tcb:初始化TCB;query_env_list:查询环境列表;no_envs:无可用环境;check_promotional_activity:检查促销活动;create_free_env:创建免费环境;display_env_selection:显示环境选择;switch_account:切换账号
  step: 
    | "check_tcb_service"      // 检查TCB服务
    | "init_tcb"              // 初始化TCB
    | "query_env_list"         // 查询环境列表
    | "no_envs"                // 无可用环境
    | "check_promotional_activity"  // 检查促销活动
    | "create_free_env"        // 创建免费环境
    | "display_env_selection"  // 显示环境选择
    | "switch_account";        // 切换账号
  success: boolean;
  uin?: string;
  error?: string;
  result?: any;
  activities?: string[];
  envId?: string;
  envIds?: string[];
  alias?: string;
}

/**
 * Report environment setup flow events
 */
export async function reportEnvSetupFlow(event: EnvSetupFlowEvent) {
  if (!telemetryReporter.isEnabled()) {
    return;
  }

  try {
    const eventData: any = {
      step: event.step,
      success: event.success ? 'true' : 'false',
      uin: event.uin || 'unknown'
    };

    // Add optional fields
    if (event.error) {
      eventData.error = event.error.substring(0, 200); // Limit length
    }

    if (event.result) {
      // Log result type instead of full object to avoid data leak
      eventData.resultType = typeof event.result;
    }

    if (event.activities && event.activities.length > 0) {
      eventData.activities = event.activities.join(',');
    }

    if (event.envId) {
      eventData.envId = event.envId;
    }

    if (event.envIds && event.envIds.length > 0) {
      eventData.envCount = event.envIds.length;
      // Only report count, not actual IDs for privacy
    }

    if (event.alias) {
      eventData.alias = event.alias;
    }

    // Use consistent event code with other toolkit errors
    await telemetryReporter.report('toolkit_env_setup', eventData);
    
    debug('Reported env setup flow event', { step: event.step, success: event.success });
  } catch (err) {
    // Silent fail, do not affect main flow
    debug('Failed to report env setup flow event', err);
  }
}
```

### 4.2 上报时机汇总

| 上报点 | step | 数据 |
|--------|------|------|
| 检查 TCB 服务 | `check_tcb_service` | success, uin, result |
| 初始化 TCB | `init_tcb` | success, uin, result/error |
| 查询环境列表 | `query_env_list` | success, uin, error? |
| 无环境情况 | `no_envs` | success, uin |
| 检查活动资格 | `check_promotional_activity` | success, uin, activities/error |
| 创建免费环境 | `create_free_env` | success, uin, envId, alias/error |
| 展示环境选择 | `display_env_selection` | success, uin, envCount |
| 切换账号 | `switch_account` | success, uin |

## 5. 环境别名规则

### 5.1 固定别名

环境别名固定为：`ai-native`

根据用户确认，不需要动态生成别名，直接使用固定值。

## 6. 已确认配置

### 6.1 API 参数（已确认）

✅ **CreateFreeEnvByActivity 参数**：
```typescript
{
  Alias: "ai-native",
  Type: activityType,  // Use the Type from first available activity
  CloseAutoPay: true,
  EnableExcess: "true",
  IsAutoRenew: "false",
  Source: "qcloud"
}
```

✅ **InitTcb 的 Channel 参数**：使用 `mcp`

✅ **DescribeUserPromotionalActivity 的 Names 参数**：`["NewUser", "ReturningUser", "BaasFree"]`

✅ **PolicyNames 配置**：不再传入（已移除）

### 6.2 错误处理链接（已确认）

✅ **统一帮助链接**：`https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp`

适用于：
- InitTcb 失败（包括实名认证、CAM 授权等）
- CreateFreeEnvByActivity 失败

**注意**：具体错误码暂时未知，需要在实际运行中收集和分析。

### 6.3 其他确认事项

✅ **环境别名**：固定为 `ai-native`，不需要动态生成

✅ **CloudMode 支持**：CloudMode 下也执行自动创建环境流程

✅ **统计上报命名空间**：使用 `toolkit_env_setup` 保持与其他 toolkit 错误一致

⏸ **UI 展示**：暂时不实现错误提示 UI，后续根据需要调整

## 7. 实施优先级

### Phase 1: 核心自动开通流程（高优先级）
1. 实现 `checkAndInitTcbService()` 函数
2. 实现 `checkAndCreateFreeEnv()` 函数
3. 修改 `_promptAndSetEnvironmentId()` 集成自动开通流程
4. 实现基础统计上报

### Phase 2: 错误处理（高优先级）
1. 完善错误解析和上下文传递
2. CloudMode 下的错误消息优化
3. 错误日志记录和调试信息

⏸ **UI 展示（待后续调整）**
- 修改 `collectEnvId()` 和 `getEnvSetupHTML()` 支持错误上下文
- 添加错误提示 UI 组件
- 实现重试 API 端点

### Phase 3: CloudMode 兼容（中优先级）
1. 实现 CloudMode 检测和行为调整
2. 优化 CloudMode 下的错误消息
3. 测试 CloudMode 下的自动开通流程

### Phase 4: 统计完善和优化（低优先级）
1. 完善统计上报事件
2. 添加更多统计维度
3. 优化统计数据结构

## 8. 文件变更清单

### 新增文件
- `mcp/src/tools/env-setup.ts` - 环境开通核心逻辑
- `mcp/src/utils/env-setup-telemetry.ts` - 环境开通统计上报

### 修改文件
- `mcp/src/tools/interactive.ts` - 集成自动开通流程
- `mcp/src/interactive-server.ts` - 添加错误展示和重试 API
- `mcp/src/types.ts` - 添加 `EnvSetupContext` 类型定义








