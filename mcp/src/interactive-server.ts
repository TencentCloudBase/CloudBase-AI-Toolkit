import express from "express";
import http from "http";
import { execFile } from "child_process";
import open from "open";
import { WebSocket, WebSocketServer } from "ws";
import { renderEnvSetupPage } from "./templates/env-setup/index.js";
import { debug, error, info, warn } from "./utils/logger.js";

function isVSCodeEnvironment() {
  return Boolean(
    process.env.VSCODE_IPC_HOOK_CLI ||
      process.env.VSCODE_PID ||
      process.env.TERM_PROGRAM === "vscode",
  );
}

/**
 * Validates that a URL is safe to open, blocking SSRF targets.
 * Only allows http/https schemes and rejects private/reserved IP ranges
 * and sensitive hostnames.
 */
function isUrlSafeToOpen(url: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }

  // Only allow http and https schemes
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `Unsupported scheme: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block common sensitive / internal hostnames
  const blockedHostnames = [
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
    "metadata.google.internal",
    "metadata.internal",
  ];
  if (blockedHostnames.includes(hostname)) {
    return { safe: false, reason: `Blocked hostname: ${hostname}` };
  }

  // Block hostnames ending with .internal or .local
  if (hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    return { safe: false, reason: `Blocked internal hostname: ${hostname}` };
  }

  // Block IP addresses in private/reserved ranges (RFC 1918, loopback, link-local, etc.)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ipv4Regex.exec(hostname);
  if (match) {
    const octets = [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10), parseInt(match[4], 10)];

    // Loopback: 127.0.0.0/8
    if (octets[0] === 127) {
      return { safe: false, reason: "Blocked loopback IP address" };
    }
    // Link-local: 169.254.0.0/16
    if (octets[0] === 169 && octets[1] === 254) {
      return { safe: false, reason: "Blocked link-local IP address" };
    }
    // RFC 1918 private: 10.0.0.0/8
    if (octets[0] === 10) {
      return { safe: false, reason: "Blocked private IP address (10.x.x.x)" };
    }
    // RFC 1918 private: 172.16.0.0/12
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
      return { safe: false, reason: "Blocked private IP address (172.16-31.x.x)" };
    }
    // RFC 1918 private: 192.168.0.0/16
    if (octets[0] === 192 && octets[1] === 168) {
      return { safe: false, reason: "Blocked private IP address (192.168.x.x)" };
    }
    // Broadcast: 0.0.0.0
    if (octets[0] === 0 && octets[1] === 0 && octets[2] === 0 && octets[3] === 0) {
      return { safe: false, reason: "Blocked broadcast address" };
    }
  }

  // Block IPv6 loopback and link-local
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const ipv6 = hostname.slice(1, -1).toLowerCase();
    if (ipv6 === "::1" || ipv6 === "0:0:0:0:0:0:0:1" || ipv6 === "::" || ipv6 === "0:0:0:0:0:0:0:0") {
      return { safe: false, reason: "Blocked IPv6 loopback/reserved address" };
    }
    if (ipv6.startsWith("fe80:")) {
      return { safe: false, reason: "Blocked IPv6 link-local address" };
    }
    if (ipv6.startsWith("fc") || ipv6.startsWith("fd")) {
      return { safe: false, reason: "Blocked IPv6 unique-local address" };
    }
  }

  return { safe: true };
}

function parseBrowserCommand(browser: string) {
  const parts = browser.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return parts.map((item) => item.replace(/^"(.*)"$/, "$1"));
}

async function openUrlByBrowserEnv(url: string) {
  const browser = process.env.BROWSER?.trim();
  if (!browser) {
    return false;
  }

  const [command, ...args] = parseBrowserCommand(browser);
  if (!command) {
    return false;
  }

  const finalArgs = args.map((arg) => (arg === "%s" ? url : arg));
  if (!args.includes("%s")) {
    finalArgs.push(url);
  }

  return new Promise<boolean>((resolve) => {
    execFile(command, finalArgs, (execError: unknown) => {
      resolve(!execError);
    });
  });
}

function shouldUseBrowserEnvFallback() {
  return process.platform === "linux" && isVSCodeEnvironment();
}

// Dynamic open behavior with IDE awareness and VSCode/Linux fallback
async function openUrl(url: string, options?: any, mcpServer?: any) {
  // mcpServer 是 ExtendedMcpServer 实例，它有 server 和 ide 属性
  // server 属性是 MCP server 的内部 server 实例，有 sendLoggingMessage 方法
  const currentIde = mcpServer?.ide || process.env.INTEGRATION_IDE;
  const internalServer = mcpServer?.server; // 内部的 server 实例
  
  debug(`[openUrl] Checking IDE: ${currentIde}`);
  debug(`[openUrl] mcpServer type: ${typeof mcpServer}, has server: ${!!mcpServer?.server}, has ide: ${!!mcpServer?.ide}`);
  if (internalServer) {
    debug(`[openUrl] internalServer type: ${typeof internalServer}, has sendLoggingMessage: ${typeof internalServer.sendLoggingMessage === 'function'}`);
  }
  
  // 检查是否为 CodeBuddy IDE (优先使用 mcpServer.ide，回退到环境变量)
  if (currentIde === "CodeBuddy" && internalServer && typeof internalServer.sendLoggingMessage === 'function') {
    try {
      // internalServer 是 MCP server 的内部 server 实例，有 sendLoggingMessage 方法
      internalServer.sendLoggingMessage({
        level: "notice",
        data: {
          type: "tcb",
          url: url,
        },
      });
      info(`CodeBuddy IDE: 已发送网页打开通知 - ${url}`);
      return;
    } catch (err) {
      error(
        `Failed to send logging message for ${url}: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err : new Error(String(err)),
      );
      // 如果发送通知失败，在 CodeBuddy IDE 中不打开网页，直接返回
      warn(`CodeBuddy IDE: 发送通知失败，不打开网页 - ${url}`);
      return;
    }
  }

  // 默认行为：直接打开网页（带 VSCode/Linux 降级逻辑）
  debug(`[openUrl] Opening URL in browser: ${url}`);
  try {
    const openOptions = options ? { url: true, ...options } : { url: true };
    const child = await open(url, openOptions as any);

    if ((child as any)?.once) {
      (child as any).once("error", async () => {
        if (shouldUseBrowserEnvFallback()) {
          debug("[openUrl] open() failed, trying BROWSER fallback");
          await openUrlByBrowserEnv(url);
        }
      });
    }

    return;
  } catch (err: unknown) {
    error(
      `Failed to open ${url} ${options} ${
        err instanceof Error ? err.message : err
      } `,
      err instanceof Error ? err : new Error(String(err)),
    );

    if (shouldUseBrowserEnvFallback()) {
      debug("[openUrl] open() threw, trying BROWSER fallback");
      await openUrlByBrowserEnv(url);
      return;
    }

    warn(`Please manually open: ${url}`);
  }
}

export interface InteractiveResult {
  type: "envId" | "clarification" | "confirmation";
  data: any;
  cancelled?: boolean;
  switch?: boolean;
  timeout?: boolean; // Indicates if the cancellation was due to timeout
  timeoutDuration?: number; // Timeout duration in milliseconds (if timeout occurred)
}

export class InteractiveServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private port: number = 0;
  private isRunning: boolean = false;
  private currentResolver: ((result: InteractiveResult) => void) | null = null;
  private sessionData: Map<string, any> = new Map();
  private _mcpServer: any = null; // 保存 MCP server 实例引用

  // 公共 getter 和 setter
  get mcpServer(): any {
    return this._mcpServer;
  }

  set mcpServer(server: any) {
    this._mcpServer = server;
  }

  private readonly DEFAULT_PORT = 3721;
  private readonly FALLBACK_PORTS = [
    3722, 3723, 3724, 3725, 3726, 3727, 3728, 3729, 3730, 3731, 3732, 3733,
    3734, 3735,
  ];

  /** Idle timeout for HTTP/WS connections (e.g. long login). Avoids "connection disconnected" after ~1 min. */
  private static readonly SERVER_IDLE_MS = 30 * 60 * 1000; // 30 minutes
  /** WebSocket ping interval to keep connection alive past proxies/firewalls. */
  private static readonly WS_PING_INTERVAL_MS = 25 * 1000; // 25 seconds

  constructor(mcpServer?: any) {
    this._mcpServer = mcpServer;
    this.app = express();
    this.server = http.createServer(this.app);
    this.applyServerTimeouts();
    this.wss = new WebSocketServer({ server: this.server });

    this.setupExpress();
    this.setupWebSocket();

    process.on("exit", () => this.cleanup());
    process.on("SIGINT", () => this.cleanup());
    process.on("SIGTERM", () => this.cleanup());
  }

  private cleanup() {
    if (this.isRunning) {
      debug("Cleaning up interactive server resources...");
      this.server.close();
      this.wss.close();
      this.isRunning = false;
    }
  }

  /** Apply timeouts so long-lived login does not cause "connection disconnected". */
  private applyServerTimeouts() {
    this.server.timeout = 0;
    if (typeof (this.server as any).keepAliveTimeout === "number") {
      (this.server as any).keepAliveTimeout = InteractiveServer.SERVER_IDLE_MS;
    }
    if (typeof (this.server as any).headersTimeout === "number") {
      (this.server as any).headersTimeout = Math.max(
        (this.server as any).headersTimeout || 0,
        InteractiveServer.SERVER_IDLE_MS,
      );
    }
  }

  private setupExpress() {
    this.app.use(express.json());

    this.app.get("/env-setup/:sessionId", (req, res) => {
      const { sessionId } = req.params;
      const sessionData = this.sessionData.get(sessionId);

      if (!sessionData) {
        res.status(404).send("会话不存在或已过期");
        return;
      }
      
      res.send(this.getEnvSetupHTML(
        sessionData.envs, 
        sessionData.accountInfo,
        sessionData.errorContext, // Pass error context
        sessionId // Pass sessionId for retry functionality
      ));
    });

    this.app.get("/clarification/:sessionId", (req, res) => {
      const { sessionId } = req.params;
      const sessionData = this.sessionData.get(sessionId);

      if (!sessionData) {
        res.status(404).send("会话不存在或已过期");
        return;
      }

      res.send(
        this.getClarificationHTML(sessionData.message, sessionData.options),
      );
    });

    this.app.post("/api/submit", (req, res) => {
      const { type, data } = req.body;
      debug("Received submit request", { type, data });

      if (this.currentResolver) {
        info("Resolving with user data");
        this.currentResolver({ type, data });
        this.currentResolver = null;
      } else {
        warn("No resolver waiting for response");
      }

      res.json({ success: true });
    });

    this.app.post("/api/cancel", (req, res) => {
      info("Received cancel request");

      if (this.currentResolver) {
        info("Resolving with cancelled status");
        this.currentResolver({
          type: "clarification",
          data: null,
          cancelled: true,
        });
        this.currentResolver = null;
      } else {
        warn("No resolver waiting for cancellation");
      }

      res.json({ success: true });
    });

    this.app.post("/api/switch", (req, res) => {
      info("Received switch account request");

      if (this.currentResolver) {
        info("Resolving with switch status");
        this.currentResolver({
          type: "envId",
          data: null,
          switch: true,
        });
        this.currentResolver = null;
      } else {
        warn("No resolver waiting for switch");
      }

      res.json({ success: true });
    });

    this.app.post("/api/retry-init-tcb", (req, res) => {
      const { sessionId } = req.body;
      info("Received retry InitTcb request", { sessionId });

      // Mark session for retry
      const sessionData = this.sessionData.get(sessionId);
      if (sessionData) {
        sessionData.retryInitTcb = true;
        debug("Marked session for InitTcb retry", { sessionId });
      }

      res.json({ success: true, message: "重试请求已提交，页面将刷新" });
    });

    // Universal URL opener API - ensures proper handling in different IDEs (e.g., CodeBuddy)
    this.app.post("/api/open-url", async (req, res) => {
      const { url } = req.body;
      
      if (!url) {
        res.status(400).json({ success: false, error: "URL is required" });
        return;
      }

      if (typeof url !== "string") {
        res.status(400).json({ success: false, error: "URL must be a string" });
        return;
      }

      // Validate URL to prevent SSRF
      const validation = isUrlSafeToOpen(url);
      if (!validation.safe) {
        warn(`Blocked open-url request for unsafe URL: ${url} (${validation.reason})`);
        res.status(403).json({ success: false, error: `URL not allowed: ${validation.reason}` });
        return;
      }

      info("Received open URL request", { url });

      try {
        // Pass mcpServer directly - it's an ExtendedMcpServer instance with server property
        await openUrl(url, undefined, this._mcpServer);
        res.json({ success: true });
      } catch (err) {
        error("Failed to open URL", err instanceof Error ? err : new Error(String(err)));
        res.status(500).json({ 
          success: false, 
          error: err instanceof Error ? err.message : String(err)
        });
      }
    });
  }

  private setupWebSocket() {
    this.wss.on("connection", (ws: WebSocket) => {
      debug("WebSocket client connected");

      // Keep connection alive during long login so proxies/firewalls do not close it
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, InteractiveServer.WS_PING_INTERVAL_MS);
      ws.on("close", () => {
        clearInterval(pingInterval);
        debug("WebSocket client disconnected");
      });

      ws.on("message", async (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          debug("WebSocket message received", data);

          // Handle session registration
          if (data.type === 'registerSession' && data.sessionId) {
            debug("Registering WebSocket for session:", data.sessionId);
            const sessionData = this.sessionData.get(data.sessionId);
            if (sessionData) {
              sessionData.ws = ws;
              debug("WebSocket registered successfully for session:", data.sessionId);
            } else {
              debug("Session not found:", data.sessionId);
            }
            return;
          }

          // Handle refresh environment list request
          if (data.type === 'refreshEnvList') {
            debug("Handling refreshEnvList request");
            try {
              // Find the session ID for this WebSocket connection
              let targetSessionId: string | null = null;
              for (const [sessionId, sessionData] of this.sessionData.entries()) {
                if (sessionData.ws === ws) {
                  targetSessionId = sessionId;
                  break;
                }
              }

              if (targetSessionId) {
                const sessionData = this.sessionData.get(targetSessionId);
                if (sessionData && sessionData.manager) {
                  // Re-fetch environment list using the same API and parameters as initial query
                  let envResult;
                  try {
                    // Use DescribeEnvs with filter parameters (same as initial query)
                    const queryParams = {
                      EnvTypes: ["weda", "baas"],
                      IsVisible: false,
                      Channels: ["dcloud", "iotenable", "tem", "scene_module"],
                    };
                    
                    envResult = await sessionData.manager.commonService("tcb", "2018-06-08").call({
                      Action: "DescribeEnvs",
                      Param: queryParams,
                    });
                    
                    // Transform response format to match original listEnvs() format
                    if (envResult && envResult.EnvList) {
                      envResult = { EnvList: envResult.EnvList };
                    } else if (envResult && envResult.Data && envResult.Data.EnvList) {
                      envResult = { EnvList: envResult.Data.EnvList };
                    } else {
                      // Fallback to listEnvs if format is unexpected
                      debug("Unexpected response format, falling back to listEnvs()");
                      envResult = await sessionData.manager.env.listEnvs();
                    }
                  } catch (error) {
                    debug("DescribeEnvs failed, falling back to listEnvs():", error instanceof Error ? error : new Error(String(error)));
                    // Fallback to original method on error
                    envResult = await sessionData.manager.env.listEnvs();
                  }
                  
                  const envs = envResult?.EnvList || [];

                  // Update session data
                  sessionData.envs = envs;

                  // Send updated environment list to client
                  ws.send(JSON.stringify({
                    type: 'envListRefreshed',
                    envs: envs,
                    success: true
                  }));

                  info(`Environment list refreshed, found ${envs.length} environments`);
                } else {
                  ws.send(JSON.stringify({
                    type: 'envListRefreshed',
                    success: false,
                    error: '无法获取环境管理器'
                  }));
                }
              } else {
                ws.send(JSON.stringify({
                  type: 'envListRefreshed',
                  success: false,
                  error: '会话不存在'
                }));
              }
            } catch (err) {
              error("Failed to refresh environment list", err instanceof Error ? err : new Error(String(err)));
              ws.send(JSON.stringify({
                type: 'envListRefreshed',
                success: false,
                error: err instanceof Error ? err.message : '刷新失败'
              }));
            }
            return;
          }

          if (this.currentResolver) {
            this.currentResolver(data);
            this.currentResolver = null;
          }
        } catch (err) {
          error("WebSocket message parsing error", err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  async start(): Promise<number> {
    if (this.isRunning) {
      debug(`Interactive server already running on port ${this.port}`);
      return this.port;
    }

    return new Promise((resolve, reject) => {
      info("Starting interactive server...");

      const tryPorts = [this.DEFAULT_PORT, ...this.FALLBACK_PORTS];
      let currentIndex = 0;

      const tryNextPort = () => {
        if (currentIndex >= tryPorts.length) {
          const err = new Error(
            `All ${tryPorts.length} ports are in use (${tryPorts.join(", ")}), failed to start server`,
          );
          error("Server start failed", err);
          reject(err);
          return;
        }

        const portToTry = tryPorts[currentIndex];
        currentIndex++;

        debug(
          `Trying to start server on port ${portToTry} (attempt ${currentIndex}/${tryPorts.length})`,
        );

        tryPort(portToTry);
      };

      const tryPort = (portToTry: number) => {
        // 清除之前的所有监听器
        this.server.removeAllListeners("error");
        this.server.removeAllListeners("listening");

        // 设置错误处理
        const errorHandler = (err: any) => {
          if (err.code === "EADDRINUSE") {
            warn(`Port ${portToTry} is in use, trying next port...`);
            // 清理当前尝试
            this.server.removeAllListeners("error");
            this.server.removeAllListeners("listening");
            tryNextPort();
          } else {
            error("Server error", err);
            reject(err);
          }
        };

        // Host: default 127.0.0.1 for security (prevents SSRF from remote access); set INTERACTIVE_SERVER_HOST=0.0.0.0 to allow remote connections
        const host = process.env.INTERACTIVE_SERVER_HOST ?? "127.0.0.1";

        // 设置成功监听处理
        const listeningHandler = () => {
          const address = this.server.address();
          if (address && typeof address === "object") {
            this.port = address.port;
            this.isRunning = true;
            info(
              `Interactive server started successfully on http://${host}:${this.port}`,
            );
            // 移除临时监听器
            this.server.removeListener("error", errorHandler);
            this.server.removeListener("listening", listeningHandler);
            resolve(this.port);
          } else {
            const err = new Error("Failed to get server address");
            error("Server start error", err);
            reject(err);
          }
        };

        this.server.once("error", errorHandler);
        this.server.once("listening", listeningHandler);

        try {
          this.server.listen(portToTry, host);
        } catch (err) {
          error(`Failed to bind to port ${portToTry}:`, err instanceof Error ? err : new Error(String(err)));
          tryNextPort();
        }
      };

      tryNextPort();
    });
  }

  async stop() {
    if (!this.isRunning) {
      debug("Interactive server is not running, nothing to stop");
      return;
    }

    info("Stopping interactive server...");

    return new Promise<void>((resolve, reject) => {
      // 设置超时，防止无限等待
      const timeout = setTimeout(() => {
        warn("Server close timeout, forcing cleanup");
        this.isRunning = false;
        this.port = 0;
        resolve();
      }, 30000);

      try {
        // 首先关闭WebSocket服务器，等待其完全关闭
        this.wss.close(() => {
          debug("WebSocket server closed");
          
          // WebSocket关闭后，再关闭HTTP服务器
          this.server.close((err) => {
            clearTimeout(timeout);
            if (err) {
              error("Error closing server:", err);
              reject(err);
            } else {
              info("Interactive server stopped successfully");
              this.isRunning = false;
              this.port = 0;
              
              // 重新创建整个服务器实例以便下次使用
              this.server = http.createServer(this.app);
              this.applyServerTimeouts();
              this.wss = new WebSocketServer({ server: this.server });
              this.setupWebSocket();
              debug("HTTP and WebSocket servers recreated for next use");
              
              resolve();
            }
          });
        });
      } catch (err) {
        clearTimeout(timeout);
        error("Error stopping server:", err instanceof Error ? err : new Error(String(err)));
        this.isRunning = false;
        this.port = 0;
        reject(err);
      }
    });
  }

  async collectEnvId(
    availableEnvs: any[],
    accountInfo?: { uin?: string },
    errorContext?: any, // EnvSetupContext
    manager?: any, // CloudBase manager instance for refreshing env list
    mcpServer?: any, // MCP server instance for IDE detection
  ): Promise<InteractiveResult> {
    try {
      // CRITICAL: Clean up any existing unresolved request to prevent hanging
      if (this.currentResolver) {
        warn("[collectEnvId] Found existing unresolved request, cleaning up...");
        const oldResolver = this.currentResolver;
        this.currentResolver = null;
        // Resolve the old request as cancelled to prevent it from hanging forever
        oldResolver({ type: "envId", data: null, cancelled: true });
      }

      // Update mcpServer if provided, or use existing this._mcpServer as fallback
      debug(`[collectEnvId] Received mcpServer parameter: type=${typeof mcpServer}, is null=${mcpServer === null}, is undefined=${mcpServer === undefined}, has server=${!!mcpServer?.server}, has ide=${!!mcpServer?.ide}`);
      debug(`[collectEnvId] Current this._mcpServer before update: type=${typeof this._mcpServer}, is null=${this._mcpServer === null}, is undefined=${this._mcpServer === undefined}, has server=${!!this._mcpServer?.server}, has ide=${!!this._mcpServer?.ide}`);
      
      // Use mcpServer parameter if provided, otherwise keep existing this._mcpServer
      const effectiveMcpServer = mcpServer || this._mcpServer;
      
      if (mcpServer) {
        this._mcpServer = mcpServer;
        debug(`[collectEnvId] Updated mcpServer from parameter, has server: ${!!mcpServer?.server}, has ide: ${!!mcpServer?.ide}`);
      } else if (this._mcpServer) {
        debug(`[collectEnvId] mcpServer parameter is falsy, using existing this._mcpServer`);
      } else {
        warn(`[collectEnvId] WARNING: Both mcpServer parameter and this._mcpServer are undefined! IDE detection will fail.`);
      }
      
      debug(`[collectEnvId] Effective mcpServer: type=${typeof effectiveMcpServer}, has server=${!!effectiveMcpServer?.server}, has ide=${!!effectiveMcpServer?.ide}`);
      
      info("Starting environment ID collection...");
      debug(`Available environments: ${availableEnvs.length}`);
      debug(`Account info:`, accountInfo);
      debug(`Error context:`, {
        hasInitTcbError: !!errorContext?.initTcbError,
        hasCreateEnvError: !!errorContext?.createEnvError,
        initTcbError: errorContext?.initTcbError,
        createEnvError: errorContext?.createEnvError
      });

      const port = await this.start();

      const sessionId = Math.random().toString(36).substring(2, 15);
      this.sessionData.set(sessionId, { 
        envs: availableEnvs, 
        accountInfo,
        errorContext, // Store error context
        manager, // Store manager for refreshing env list
        ws: null // Will be set when WebSocket connects
      });
      debug(`Created session: ${sessionId}`);

      setTimeout(
        () => {
          this.sessionData.delete(sessionId);
          debug(`Session ${sessionId} expired`);
        },
        5 * 60 * 1000,
      );

      const url = `http://localhost:${port}/env-setup/${sessionId}`;
      info(`Opening browser: ${url}`);

      // Check if this is CodeBuddy IDE and notification was sent (no browser opened)
      const isCodeBuddy = effectiveMcpServer?.ide === "CodeBuddy" || process.env.INTEGRATION_IDE === "CodeBuddy";
      let notificationSent = false;

      try {
        // Use effectiveMcpServer (from parameter or this._mcpServer) for openUrl
        debug(`[collectEnvId] Using effectiveMcpServer for openUrl: type=${typeof effectiveMcpServer}, has server=${!!effectiveMcpServer?.server}, has ide=${!!effectiveMcpServer?.ide}`);
        debug(`[collectEnvId] effectiveMcpServer keys: ${effectiveMcpServer ? Object.keys(effectiveMcpServer).slice(0, 10).join(', ') : 'null'}`);
        
        // Store the original openUrl to check if it returns early (notification sent)
        const openUrlResult = await openUrl(url, { wait: false }, effectiveMcpServer);
        if (isCodeBuddy && openUrlResult === undefined) {
          notificationSent = true;
          debug("[collectEnvId] CodeBuddy notification sent, no browser opened");
        }
        info("Browser opened successfully");
      } catch (browserError) {
        error("Failed to open browser", browserError instanceof Error ? browserError : new Error(String(browserError)));
        warn(`Please manually open: ${url}`);
      }

      info("Waiting for user selection...");

      // Use same 10 minutes for all IDEs so long login (re-auth, switch account) does not close the server
      const timeoutDuration = 10 * 60 * 1000;
      debug(`[collectEnvId] Using timeout duration: ${timeoutDuration / 1000} seconds`);

      return new Promise((resolve) => {
        this.currentResolver = (result) => {
          // 用户选择完成后，关闭服务器
          this.currentResolver = null;
          this.stop().catch((err) => {
            debug("Error stopping server after user selection:", err);
          });
          resolve(result);
        };

        const timeoutId = setTimeout(
          () => {
            if (this.currentResolver) {
              warn(`Request timeout after ${timeoutDuration / 1000} seconds, resolving with cancelled`);
              this.currentResolver = null;
              // 超时后也关闭服务器
              this.stop().catch((err) => {
                debug("Error stopping server after timeout:", err);
              });
              resolve({ type: "envId", data: null, cancelled: true, timeout: true, timeoutDuration });
            }
          },
          timeoutDuration,
        );

        // Store timeout ID so we can clear it if resolved early
        // Note: We can't clear it here, but the timeout will be cleared when the promise resolves
        // The timeout will be automatically cleared when the promise resolves or rejects
      });
    } catch (err) {
      // Clean up currentResolver on error
      if (this.currentResolver) {
        this.currentResolver = null;
      }
      error("Error in collectEnvId", err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async clarifyRequest(
    message: string,
    options?: string[],
  ): Promise<InteractiveResult> {
    const port = await this.start();

    // 生成会话ID并存储数据
    const sessionId = Math.random().toString(36).substring(2, 15);
    this.sessionData.set(sessionId, { message, options });

    // 设置会话过期时间（5分钟）
    setTimeout(
      () => {
        this.sessionData.delete(sessionId);
      },
      5 * 60 * 1000,
    );

    const url = `http://localhost:${port}/clarification/${sessionId}`;

    // Pass mcpServer directly - it's an ExtendedMcpServer instance with server property
    await openUrl(url, undefined, this._mcpServer);

    return new Promise((resolve) => {
      this.currentResolver = (result) => {
        // 用户选择完成后，关闭服务器
        this.stop().catch((err) => {
          debug("Error stopping server after user selection:", err);
        });
        resolve(result);
      };
    });
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getEnvSetupHTML(
    envs?: any[],
    accountInfo?: { uin?: string },
    errorContext?: any, // EnvSetupContext
    sessionId?: string,
  ): string {
    // Extract error information
    const initTcbError = errorContext?.initTcbError;
    const createEnvError = errorContext?.createEnvError;
    
    debug("getEnvSetupHTML called with:", {
      envCount: envs?.length || 0,
      hasInitTcbError: !!initTcbError,
      hasCreateEnvError: !!createEnvError,
      hasAccountInfo: !!accountInfo?.uin,
      sessionId
    });

    // Get current IDE information
    const currentIde = this._mcpServer?.ide || process.env.INTEGRATION_IDE;
    
    // Use new template system
    return renderEnvSetupPage({
      envs,
      accountInfo,
      errorContext,
      sessionId,
      wsPort: this.port,
      ide: currentIde
    });
  }

  // Keep the old implementation for reference (can be removed later)
  private getEnvSetupHTML_OLD(
    envs?: any[],
    accountInfo?: { uin?: string },
    errorContext?: any,
    sessionId?: string,
  ): string {
    const accountDisplay = accountInfo?.uin ? `UIN: ${accountInfo.uin}` : "";
    const hasAccountInfo = !!accountInfo?.uin;
    const hasEnvs = (envs || []).length > 0;
    
    // Extract error information
    const initTcbError = errorContext?.initTcbError;
    const createEnvError = errorContext?.createEnvError;
    const hasErrors = !!(initTcbError || createEnvError);
    const hasInitError = !!initTcbError;

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudBase AI Toolkit - 环境配置</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --primary-color: #1a1a1a;
            --primary-hover: #000000;
            --accent-color: #67E9E9;
            --accent-hover: #2BCCCC;
            --text-primary: #ffffff;
            --text-secondary: #a0a0a0;
            --border-color: rgba(255, 255, 255, 0.15);
            --bg-secondary: rgba(255, 255, 255, 0.08);
            --bg-glass: rgba(26, 26, 26, 0.95);
            --shadow: 0 25px 50px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2);
            --font-mono: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace;
            --header-bg: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0d1117 100%);
        }

        body {
            font-family: var(--font-mono);
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            position: relative;
            overflow-x: hidden;
            overflow-y: auto;
        }

        /* Custom scrollbar styles */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--accent-color);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--accent-hover);
        }

        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>') repeat;
            pointer-events: none;
            z-index: -1;
        }

        body::after {
            content: '';
            position: fixed;
            top: 50%; left: 50%;
            width: 500px; height: 500px;
            background: radial-gradient(circle, rgba(103, 233, 233, 0.05) 0%, transparent 70%);
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: -1;
            animation: pulse 8s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.1); }
        }

        .modal {
            background: var(--bg-glass);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            box-shadow: var(--shadow);
            border: 2px solid var(--border-color);
            width: 100%;
            max-width: 520px;
            overflow: hidden;
            animation: modalIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            position: relative;
        }

        .modal::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.02) 50%, transparent 70%);
            animation: shimmer 3s infinite;
            pointer-events: none;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        @keyframes modalIn {
            from {
                opacity: 0;
                transform: scale(0.9) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        .header {
            background: var(--header-bg);
            color: var(--text-primary);
            padding: 24px 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.03) 50%, transparent 70%);
            animation: headerShimmer 4s infinite;
            pointer-events: none;
        }

        @keyframes headerShimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 16px;
            z-index: 1;
        }

        .logo {
            width: 32px;
            height: 32px;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
            animation: logoFloat 3s ease-in-out infinite;
        }

        @keyframes logoFloat {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-3px); }
        }

        .title {
            font-size: 20px;
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .github-link {
            color: var(--text-primary);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            backdrop-filter: blur(10px);
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 500;
            z-index: 1;
            transition: all 0.3s ease;
        }

        .github-link:hover {
            background: rgba(255,255,255,0.15);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .content {
            padding: 32px 24px;
            position: relative;
        }

        .content-title {
            font-size: 24px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 8px;
            animation: fadeInUp 0.8s ease-out 0.2s both;
        }

        .content-subtitle {
            color: var(--text-secondary);
            margin-bottom: 16px;
            line-height: 1.5;
            animation: fadeInUp 0.8s ease-out 0.4s both;
        }

        .account-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: rgba(103, 233, 233, 0.06);
            border: 1px solid rgba(103, 233, 233, 0.15);
            border-radius: 8px;
            margin-bottom: 20px;
            animation: fadeInUp 0.8s ease-out 0.5s both;
        }

        .account-info {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
            color: var(--accent-color);
        }

        .account-info svg {
            flex-shrink: 0;
            opacity: 0.8;
        }

        .account-info span {
            font-family: var(--font-mono);
        }

        .btn-switch {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            font-size: 12px;
            background: transparent;
            border: 1px solid rgba(103, 233, 233, 0.3);
            border-radius: 6px;
            color: var(--accent-color);
            cursor: pointer;
            transition: all 0.2s ease;
            font-family: var(--font-mono);
        }

        .btn-switch:hover {
            background: rgba(103, 233, 233, 0.1);
            border-color: var(--accent-color);
        }

        .btn-switch svg {
            flex-shrink: 0;
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .env-list {
            border: 1px solid var(--border-color);
            border-radius: 12px;
            margin-bottom: 24px;
            max-height: 300px;
            overflow-y: auto;
            overflow-x: hidden;
            background: rgba(255, 255, 255, 0.03);
            animation: fadeInUp 0.8s ease-out 0.6s both;
        }

        .env-item {
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-color);
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 14px;
            position: relative;
            overflow: hidden;
            color: var(--text-primary);
        }

        .env-item::before {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 0;
            background: var(--accent-color);
            transition: width 0.3s ease;
        }

        .env-item:last-child {
            border-bottom: none;
        }

        .env-item:hover {
            background: var(--bg-secondary);
            transform: translateX(5px);
        }

        .env-item:hover::before {
            width: 4px;
        }

        .env-item.selected {
            background: rgba(103, 233, 233, 0.1);
            border-left: 4px solid var(--accent-color);
            transform: translateX(5px);
        }

        .env-icon {
            width: 20px;
            height: 20px;
            color: var(--accent-color);
            flex-shrink: 0;
            animation: iconGlow 2s ease-in-out infinite;
        }

        @keyframes iconGlow {
            0%, 100% { filter: drop-shadow(0 0 2px rgba(103, 233, 233, 0.3)); }
            50% { filter: drop-shadow(0 0 8px rgba(103, 233, 233, 0.6)); }
        }

        .env-info {
            flex: 1;
        }

        .env-name {
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 4px;
        }

        .env-alias {
            color: var(--text-secondary);
            font-size: 14px;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            text-align: center;
            animation: fadeIn 0.8s ease-out;
        }

        .empty-icon {
            margin-bottom: 24px;
            color: var(--text-secondary);
            opacity: 0.6;
        }

        .empty-title {
            font-size: 20px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 12px;
        }

        .empty-message {
            font-size: 14px;
            color: var(--text-secondary);
            line-height: 1.6;
            margin-bottom: 32px;
            max-width: 400px;
        }

        .error-banner {
            margin-bottom: 24px;
            padding: 16px;
            background: rgba(255, 193, 7, 0.1);
            border: 1px solid rgba(255, 193, 7, 0.3);
            border-radius: 12px;
            animation: fadeIn 0.5s ease-out;
        }

        .error-item {
            margin-bottom: 16px;
        }

        .error-item:last-child {
            margin-bottom: 0;
        }

        .error-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
            color: #ffc107;
        }

        .error-title {
            font-size: 15px;
            font-weight: 600;
            color: #ffc107;
        }

        .error-message {
            font-size: 14px;
            color: var(--text-primary);
            line-height: 1.6;
            margin-bottom: 12px;
            padding-left: 24px;
            word-wrap: break-word;
            word-break: break-word;
            overflow-wrap: break-word;
            max-width: 100%;
        }

        .error-action {
            padding-left: 24px;
            margin-top: 12px;
        }

        .error-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--accent-color);
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: color 0.2s ease;
            padding: 8px 16px;
            background: rgba(103, 233, 233, 0.1);
            border: 1px solid rgba(103, 233, 233, 0.3);
            border-radius: 6px;
        }

        .error-link:hover {
            color: var(--accent-hover);
            background: rgba(103, 233, 233, 0.2);
            border-color: var(--accent-color);
        }

        .error-retry-btn {
            margin-left: 12px;
            cursor: pointer;
            border: none;
            font-family: inherit;
        }

        .error-retry-btn:hover {
            transform: rotate(180deg);
            transition: transform 0.3s ease;
        }

        .error-action {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
        }

        .create-env-btn {
            padding: 14px 24px;
            font-size: 15px;
            background: var(--primary-color);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
        }

        .create-env-btn:hover {
            background: var(--primary-hover);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            animation: fadeInUp 0.8s ease-out 0.8s both;
        }

        .btn {
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: var(--font-mono);
            position: relative;
            overflow: hidden;
        }

        .btn::before {
            content: '';
            position: absolute;
            top: 50%; left: 50%;
            width: 0; height: 0;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            transition: all 0.3s ease;
            transform: translate(-50%, -50%);
        }

        .btn:hover::before {
            width: 100px; height: 100px;
        }

        .btn-primary {
            background: var(--primary-color);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
        }

        .btn-primary:hover:not(:disabled) {
            background: var(--primary-hover);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .btn-secondary {
            background: var(--bg-secondary);
            color: var(--text-secondary);
            border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15);
            color: var(--text-primary);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .loading {
            display: none;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 16px;
            color: var(--text-secondary);
            font-size: 14px;
        }

        .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid var(--border-color);
            border-top: 2px solid var(--accent-color);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .success-state {
            text-align: center;
            padding: 40px 20px;
            animation: fadeInUp 0.8s ease-out both;
        }

        .success-icon {
            margin-bottom: 20px;
            color: var(--accent-color);
            animation: successPulse 2s ease-in-out infinite;
        }

        @keyframes successPulse {
            0%, 100% {
                transform: scale(1);
                filter: drop-shadow(0 0 8px rgba(103, 233, 233, 0.3));
            }
            50% {
                transform: scale(1.1);
                filter: drop-shadow(0 0 16px rgba(103, 233, 233, 0.6));
            }
        }

        .success-title {
            font-size: 24px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 12px;
        }

        .success-message {
            color: var(--text-secondary);
            font-size: 16px;
            line-height: 1.5;
        }

        .selected-env-info {
            margin-top: 20px;
            padding: 16px;
            background: rgba(103, 233, 233, 0.1);
            border: 1px solid var(--accent-color);
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .env-label {
            color: var(--text-secondary);
            font-size: 14px;
            font-weight: 500;
        }

        .env-value {
            color: var(--accent-color);
            font-size: 16px;
            font-weight: 600;
            font-family: var(--font-mono);
        }
    </style>
</head>
<body>
    <div class="modal">
        <div class="header">
            <div class="header-left">
                <img class="logo" src="https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/mcp/cloudbase-logo.svg" alt="CloudBase Logo" />
                <span class="title">CloudBase AI Toolkit</span>
            </div>
            <a href="https://github.com/TencentCloudBase/CloudBase-AI-ToolKit" target="_blank" class="github-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
            </a>
        </div>

        <div class="content">
            <h1 class="content-title">选择 CloudBase 环境</h1>
            <p class="content-subtitle">请选择您要使用的 CloudBase 环境</p>

            ${
              (hasAccountInfo || hasEnvs) ? `
            ${
              (hasAccountInfo || hasEnvs) ? `
            <div class="account-bar">
                <div class="account-info">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <span>${accountDisplay ? `当前账号: ${accountDisplay}` : '未登录'}</span>
                </div>
                <button class="btn btn-switch" onclick="switchAccount()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/>
                        <path d="M20 8v6M23 11h-6"/>
                    </svg>
                    切换账号
                </button>
            </div>
            ` : ''
            }
            ` : ''
            }

            ${
              hasErrors ? `
            <div class="error-banner" id="errorBanner">
                ${
                  initTcbError ? `
                <div class="error-item">
                    <div class="error-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span class="error-title">CloudBase 服务初始化失败</span>
                    </div>
                    <div class="error-message">${this.escapeHtml(initTcbError.message)}</div>
                    ${
                      initTcbError.needRealNameAuth ? `
                    <div class="error-action">
                        <a href="${initTcbError.helpUrl || 'https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp'}" target="_blank" class="error-link">
                            前往实名认证
                        </a>
                    </div>
                    ` : ''
                    }
                    ${
                      initTcbError.needCamAuth ? `
                    <div class="error-action">
                        <a href="${initTcbError.helpUrl || 'https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp'}" target="_blank" class="error-link">
                            前往开通 CloudBase 服务
                        </a>
                        ${
                          sessionId ? `
                        <button class="error-link error-retry-btn" onclick="retryInitTcb('${sessionId}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                            </svg>
                            重试
                        </button>
                        ` : ''
                        }
                    </div>
                    ` : ''
                    }
                    ${
                      !initTcbError.needRealNameAuth && !initTcbError.needCamAuth && initTcbError.helpUrl ? `
                    <div class="error-action">
                        <a href="${initTcbError.helpUrl}" target="_blank" class="error-link">
                            前往开通 CloudBase 服务
                        </a>
                        ${
                          sessionId ? `
                        <button class="error-link error-retry-btn" onclick="retryInitTcb('${sessionId}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                            </svg>
                            重试
                        </button>
                        ` : ''
                        }
                    </div>
                    ` : ''
                    }
                </div>
                ` : ''
                }
                ${
                  createEnvError ? `
                <div class="error-item">
                    <div class="error-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span class="error-title">免费环境创建失败</span>
                    </div>
                    <div class="error-message">${this.escapeHtml(createEnvError.message)}</div>
                    ${
                      createEnvError.helpUrl ? `
                    <div class="error-action">
                        <a href="${createEnvError.helpUrl}" target="_blank" class="error-link">
                            手动创建环境
                        </a>
                    </div>
                    ` : ''
                    }
                </div>
                ` : ''
                }
            </div>
            ` : ''
            }

            <div class="env-list" id="envList">
                ${
                  (envs || []).length > 0
                    ? (envs || [])
                        .map(
                          (env, index) => `
                        <div class="env-item" onclick="selectEnv('${env.EnvId}', this)" style="animation-delay: ${index * 0.1}s;">
                            <svg class="env-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                            </svg>
                            <div class="env-info">
                                <div class="env-name">${env.EnvId}</div>
                                <div class="env-alias">${env.Alias || "无别名"}</div>
                            </div>
                        </div>
                    `,
                        )
                        .join("")
                    : `
                    <div class="empty-state">
                        <h3 class="empty-title">暂无 CloudBase 环境</h3>
                        ${
                          hasInitError ? `
                        <p class="empty-message">由于 CloudBase 服务初始化失败，无法创建新环境。请先解决初始化问题后重试。</p>
                        ` : `
                        <p class="empty-message">当前没有可用的 CloudBase 环境，请新建后重新在 AI 对话中重试</p>
                        <button class="btn btn-primary create-env-btn" onclick="createNewEnv()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12h14"/>
                            </svg>
                            新建环境
                        </button>
                        `
                        }
                    </div>
                    `
                }
            </div>

            <div class="actions">
                <button class="btn btn-secondary" onclick="cancel()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                    取消
                </button>
                <button class="btn btn-primary" id="confirmBtn" onclick="confirm()" disabled>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    确认选择
                </button>
            </div>

            <div class="loading" id="loading">
                <div class="spinner"></div>
                <span>正在配置环境...</span>
            </div>

            <div class="success-state" id="successState" style="display: none;">
                <div class="success-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 6L9 17l-5-5"/>
                    </svg>
                </div>
                <h2 class="success-title">环境配置成功！</h2>
                <p class="success-message">已成功选择 CloudBase 环境</p>
                <div class="selected-env-info">
                    <span class="env-label">环境 ID:</span>
                    <span class="env-value" id="selectedEnvDisplay"></span>
                </div>
            </div>
        </div>
    </div>

    <script>
        let selectedEnvId = null;

        function selectEnv(envId, element) {
            console.log('=== 环境选择事件触发 ===');
            console.log('传入的envId:', envId);
            console.log('传入的element:', element);
            console.log('element类名:', element ? element.className : 'null');

            selectedEnvId = envId;
            console.log('设置selectedEnvId为:', selectedEnvId);

            // Remove selected class from all items
            const allItems = document.querySelectorAll('.env-item');
            console.log('找到的所有环境项数量:', allItems.length);
            allItems.forEach(item => {
                item.classList.remove('selected');
            });

            // Add selected class to current item
            if (element) {
                element.classList.add('selected');
                console.log('✅ 已添加selected样式到当前项');
                console.log('当前项的最终类名:', element.className);
            } else {
                console.error('❌ element为空，无法添加选中样式');
            }

            // Enable confirm button
            const confirmBtn = document.getElementById('confirmBtn');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                console.log('✅ 确认按钮已启用');
            } else {
                console.error('❌ 找不到确认按钮');
            }
        }

        function confirm() {
            console.log('=== CONFIRM BUTTON CLICKED ===');
            console.log('selectedEnvId:', selectedEnvId);

            if (!selectedEnvId) {
                console.error('❌ 没有选择环境ID！');
                alert('请先选择一个环境');
                return;
            }

            console.log('✅ 环境ID验证通过，开始发送请求...');
            document.getElementById('loading').style.display = 'flex';
            document.getElementById('confirmBtn').disabled = true;

            const requestBody = {
                type: 'envId',
                data: selectedEnvId
            };

            console.log('📤 发送请求体:', JSON.stringify(requestBody, null, 2));

            fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }).then(response => {
                console.log('📥 收到响应状态:', response.status);
                console.log('📥 响应头:', [...response.headers.entries()]);
                return response.json();
            }).then(data => {
                console.log('📥 响应数据:', data);
                if (data.success) {
                    console.log('✅ 请求成功，展示成功提示');
                    // 隐藏选择区和按钮，仅展示成功提示
                    document.getElementById('envList').style.display = 'none';
                    document.querySelector('.actions').style.display = 'none';
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('successState').style.display = 'block';
                    // 显示选中的环境 ID
                    document.getElementById('selectedEnvDisplay').textContent = selectedEnvId;
                    window.close();
                } else {
                    console.error('❌ 请求失败:', data);
                    alert('选择环境失败: ' + (data.error || '未知错误'));
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('confirmBtn').disabled = false;
                }
              }).catch(err => {
                console.error('❌ 网络请求错误:', err);
                alert('网络请求失败: ' + err.message);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('confirmBtn').disabled = false;
              });
        }

        function createNewEnv() {
            const integrationIde = '${process.env.INTEGRATION_IDE || "AI Toolkit"}';
            const url = \`http://tcb.cloud.tencent.com/dev?from=\${encodeURIComponent(integrationIde)}\`;
            location.href = url;
        }

        function cancel() {
            fetch('/api/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).then(() => {
                window.close();
            });
        }

        function switchAccount() {
            fetch('/api/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).then(() => {
                // 页面会由服务端重新打开新的登录页面
                window.close();
            });
        }

        function retryInitTcb(sessionId) {
            const retryBtn = event.target.closest('.error-retry-btn');
            if (retryBtn) {
                retryBtn.disabled = true;
                retryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 重试中...';
            }

            fetch('/api/retry-init-tcb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            }).then(response => response.json())
              .then(result => {
                  if (result.success) {
                      // Refresh page to retry initialization
                      setTimeout(() => {
                          window.location.reload();
                      }, 500);
                  } else {
                      alert('重试失败，请稍后再试');
                      if (retryBtn) {
                          retryBtn.disabled = false;
                          retryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> 重试';
                      }
                  }
              })
              .catch(err => {
                  console.error('Retry failed:', err);
                  alert('重试失败，请稍后再试');
                  if (retryBtn) {
                      retryBtn.disabled = false;
                      retryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> 重试';
                  }
              });
        }
    </script>
</body>
</html>`;
  }

  private getClarificationHTML(message: string, options?: string[]): string {
    const optionsArray = options || null;

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudBase AI Toolkit - 需求澄清</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --primary-color: #1a1a1a;
            --primary-hover: #000000;
            --accent-color: #67E9E9;
            --accent-hover: #2BCCCC;
            --text-primary: #ffffff;
            --text-secondary: #a0a0a0;
            --border-color: rgba(255, 255, 255, 0.15);
            --bg-secondary: rgba(255, 255, 255, 0.08);
            --bg-glass: rgba(26, 26, 26, 0.95);
            --shadow: 0 25px 50px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2);
            --font-mono: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace;
            --header-bg: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0d1117 100%);
        }

        body {
            font-family: var(--font-mono);
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            position: relative;
            overflow-x: hidden;
            overflow-y: auto;
        }

        /* Custom scrollbar styles */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--accent-color);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--accent-hover);
        }

        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>') repeat;
            pointer-events: none;
            z-index: -1;
        }

        body::after {
            content: '';
            position: fixed;
            top: 50%; left: 50%;
            width: 500px; height: 500px;
            background: radial-gradient(circle, rgba(103, 233, 233, 0.05) 0%, transparent 70%);
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: -1;
            animation: pulse 8s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.1); }
        }

        .modal {
            background: var(--bg-glass);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            box-shadow: var(--shadow);
            border: 2px solid var(--border-color);
            width: 100%;
            max-width: 600px;
            overflow: hidden;
            animation: modalIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            position: relative;
        }

        .modal::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.02) 50%, transparent 70%);
            animation: shimmer 3s infinite;
            pointer-events: none;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        @keyframes modalIn {
            from {
                opacity: 0;
                transform: scale(0.9) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        .header {
            background: var(--header-bg);
            color: var(--text-primary);
            padding: 24px 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.03) 50%, transparent 70%);
            animation: headerShimmer 4s infinite;
            pointer-events: none;
        }

        @keyframes headerShimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 16px;
            z-index: 1;
        }

        .logo {
            width: 32px;
            height: 32px;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
            animation: logoFloat 3s ease-in-out infinite;
        }

        @keyframes logoFloat {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-3px); }
        }

        .title {
            font-size: 20px;
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .github-link {
            color: var(--text-primary);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            backdrop-filter: blur(10px);
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 500;
            z-index: 1;
            transition: all 0.3s ease;
        }

        .github-link:hover {
            background: rgba(255,255,255,0.15);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .content {
            padding: 32px 24px;
            position: relative;
        }

        .content-title {
            font-size: 24px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 8px;
            animation: fadeInUp 0.8s ease-out 0.2s both;
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message {
            background: rgba(103, 233, 233, 0.1);
            border: 1px solid var(--accent-color);
            border-left: 4px solid var(--accent-color);
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 24px;
            white-space: pre-wrap;
            font-size: 15px;
            line-height: 1.6;
            color: var(--text-primary);
            animation: fadeInUp 0.8s ease-out 0.4s both;
            position: relative;
            overflow: hidden;
        }

        .message::before {
            content: '';
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 2px;
            background: linear-gradient(90deg, var(--accent-color), transparent);
            animation: progress 2s ease-out;
        }

        @keyframes progress {
            from { width: 0%; }
            to { width: 100%; }
        }

        .options {
            margin-bottom: 24px;
            animation: fadeInUp 0.8s ease-out 0.6s both;
        }

        .option-item {
            padding: 16px 20px;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 14px;
            background: rgba(255, 255, 255, 0.03);
            position: relative;
            overflow: hidden;
            color: var(--text-primary);
        }

        .option-item::before {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 0;
            background: var(--accent-color);
            transition: width 0.3s ease;
        }

        .option-item:hover {
            background: var(--bg-secondary);
            border-color: var(--accent-color);
            transform: translateX(5px);
        }

        .option-item:hover::before {
            width: 4px;
        }

        .option-item.selected {
            background: rgba(103, 233, 233, 0.1);
            border-color: var(--accent-color);
            transform: translateX(5px);
        }

        .option-item.selected::before {
            width: 4px;
        }

        .option-icon {
            width: 20px;
            height: 20px;
            color: var(--accent-color);
            flex-shrink: 0;
            animation: iconGlow 2s ease-in-out infinite;
        }

        @keyframes iconGlow {
            0%, 100% { filter: drop-shadow(0 0 2px rgba(103, 233, 233, 0.3)); }
            50% { filter: drop-shadow(0 0 8px rgba(103, 233, 233, 0.6)); }
        }

        .custom-input {
            margin-bottom: 24px;
            animation: fadeInUp 0.8s ease-out 0.8s both;
        }

        .custom-input textarea {
            width: 100%;
            min-height: 120px;
            padding: 16px;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            font-size: 15px;
            font-family: var(--font-mono);
            resize: vertical;
            transition: all 0.3s ease;
            line-height: 1.5;
            background: rgba(255, 255, 255, 0.03);
            color: var(--text-primary);
        }

        .custom-input textarea::placeholder {
            color: var(--text-secondary);
        }

        .custom-input textarea:focus {
            outline: none;
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(103, 233, 233, 0.1);
            background: rgba(255, 255, 255, 0.05);
        }

        .actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            animation: fadeInUp 0.8s ease-out 1s both;
        }

        .btn {
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: var(--font-mono);
            position: relative;
            overflow: hidden;
        }

        .btn::before {
            content: '';
            position: absolute;
            top: 50%; left: 50%;
            width: 0; height: 0;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            transition: all 0.3s ease;
            transform: translate(-50%, -50%);
        }

        .btn:hover::before {
            width: 100px; height: 100px;
        }

        .btn-primary {
            background: var(--primary-color);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
        }

        .btn-primary:hover:not(:disabled) {
            background: var(--primary-hover);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .btn-secondary {
            background: var(--bg-secondary);
            color: var(--text-secondary);
            border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15);
            color: var(--text-primary);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .loading {
            display: none;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 16px;
            color: var(--text-secondary);
            font-size: 14px;
        }

        .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid var(--border-color);
            border-top: 2px solid var(--accent-color);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .success-state {
            text-align: center;
            padding: 40px 20px;
            animation: fadeInUp 0.8s ease-out both;
        }

        .success-icon {
            margin-bottom: 20px;
            color: var(--accent-color);
            animation: successPulse 2s ease-in-out infinite;
        }

        @keyframes successPulse {
            0%, 100% {
                transform: scale(1);
                filter: drop-shadow(0 0 8px rgba(103, 233, 233, 0.3));
            }
            50% {
                transform: scale(1.1);
                filter: drop-shadow(0 0 16px rgba(103, 233, 233, 0.6));
            }
        }

        .success-title {
            font-size: 24px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 12px;
        }

        .success-message {
            color: var(--text-secondary);
            font-size: 16px;
            line-height: 1.5;
        }

        .selected-env-info {
            margin-top: 20px;
            padding: 16px;
            background: rgba(103, 233, 233, 0.1);
            border: 1px solid var(--accent-color);
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .env-label {
            color: var(--text-secondary);
            font-size: 14px;
            font-weight: 500;
        }

        .env-value {
            color: var(--accent-color);
            font-size: 16px;
            font-weight: 600;
            font-family: var(--font-mono);
        }
    </style>
</head>
<body>
    <div class="modal">
        <div class="header">
            <div class="header-left">
                <img class="logo" src="https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/mcp/cloudbase-logo.svg" alt="CloudBase Logo" />
                <span class="title">CloudBase AI Toolkit</span>
            </div>
            <a href="https://github.com/TencentCloudBase/CloudBase-AI-ToolKit" target="_blank" class="github-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
            </a>
        </div>

        <div class="content">
            <h1 class="content-title">AI 需要您确认</h1>
            <div class="message">${message}</div>

            ${
              optionsArray
                ? `
            <div class="options" id="options">
                ${optionsArray
                  .map(
                    (option: string, index: number) => `
                    <div class="option-item" onclick="selectOption('${option}')" style="animation-delay: ${index * 0.1}s;">
                        <svg class="option-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
                        </svg>
                        <span>${option}</span>
                    </div>
                `,
                  )
                  .join("")}
            </div>
            `
                : ""
            }

            <div class="custom-input">
                <textarea id="customInput" placeholder="请输入您的具体需求或建议..." onkeyup="updateSubmitButton()"></textarea>
            </div>

            <div class="actions">
                <button class="btn btn-secondary" onclick="cancel()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                    取消
                </button>
                <button class="btn btn-primary" id="submitBtn" onclick="submit()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    确认执行
                </button>
            </div>

            <div class="loading" id="loading">
                <div class="spinner"></div>
                <span>正在提交...</span>
            </div>
        </div>
    </div>

    <script>
        let selectedOption = null;

        function selectOption(option) {
            selectedOption = option;

            document.querySelectorAll('.option-item').forEach(item => {
                item.classList.remove('selected');
            });
            event.currentTarget.classList.add('selected');

            updateSubmitButton();
        }

        function updateSubmitButton() {
            const customInput = document.getElementById('customInput').value.trim();
            const submitBtn = document.getElementById('submitBtn');

            if (selectedOption || customInput) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            } else {
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.5';
            }
        }

        function submit() {
            const customInput = document.getElementById('customInput').value.trim();
            const data = selectedOption || customInput;

            if (!data) return;

            document.getElementById('loading').style.display = 'flex';
            document.getElementById('submitBtn').disabled = true;

            fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'clarification',
                    data: data
                })
            }).then(response => response.json())
              .then(result => {
                if (result.success) {
                    window.close();
                }
              }).catch(err => {
                console.error('Error:', err);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('submitBtn').disabled = false;
              });
        }

        function cancel() {
            fetch('/api/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).then(() => {
                window.close();
            });
        }

        // Initialize
        updateSubmitButton();
    </script>
</body>
</html>`;
  }

  private getConfirmationHTML(
    message: string,
    risks?: string[],
    options?: string[],
  ): string {
    const availableOptions = options || ["确认执行", "取消操作"];

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudBase AI Toolkit - 操作确认</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --primary-color: #1a1a1a;
            --primary-hover: #000000;
            --accent-color: #67E9E9;
            --accent-hover: #2BCCCC;
            --text-primary: #ffffff;
            --text-secondary: #a0a0a0;
            --border-color: rgba(255, 255, 255, 0.15);
            --bg-secondary: rgba(255, 255, 255, 0.08);
            --bg-glass: rgba(26, 26, 26, 0.95);
            --warning-color: #ff6b6b;
            --warning-bg: rgba(255, 107, 107, 0.1);
            --warning-border: rgba(255, 107, 107, 0.3);
            --shadow: 0 25px 50px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2);
            --font-mono: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace;
            --header-bg: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0d1117 100%);
        }

        body {
            font-family: var(--font-mono);
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            position: relative;
            overflow-x: hidden;
            overflow-y: auto;
        }

        /* Custom scrollbar styles */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--accent-color);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--accent-hover);
        }

        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>') repeat;
            pointer-events: none;
            z-index: -1;
        }

        body::after {
            content: '';
            position: fixed;
            top: 50%; left: 50%;
            width: 500px; height: 500px;
            background: radial-gradient(circle, rgba(255, 107, 107, 0.03) 0%, transparent 70%);
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: -1;
            animation: pulse 8s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.1); }
        }

        .modal {
            background: var(--bg-glass);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            box-shadow: var(--shadow);
            border: 2px solid var(--border-color);
            width: 100%;
            max-width: 600px;
            overflow: hidden;
            animation: modalIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            position: relative;
        }

        .modal::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.02) 50%, transparent 70%);
            animation: shimmer 3s infinite;
            pointer-events: none;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        @keyframes modalIn {
            from {
                opacity: 0;
                transform: scale(0.9) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        .header {
            background: var(--header-bg);
            color: var(--text-primary);
            padding: 24px 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.03) 50%, transparent 70%);
            animation: headerShimmer 4s infinite;
            pointer-events: none;
        }

        @keyframes headerShimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 16px;
            z-index: 1;
        }

        .logo {
            width: 32px;
            height: 32px;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
            animation: logoFloat 3s ease-in-out infinite;
        }

        @keyframes logoFloat {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-3px); }
        }

        .title {
            font-size: 20px;
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .github-link {
            color: var(--text-primary);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            backdrop-filter: blur(10px);
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 500;
            z-index: 1;
            transition: all 0.3s ease;
        }

        .github-link:hover {
            background: rgba(255,255,255,0.15);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .content {
            padding: 32px 24px;
            position: relative;
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .content-title {
            font-size: 24px;
            margin-bottom: 8px;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 12px;
            position: relative;
            animation: fadeInUp 0.8s ease-out 0.2s both;
        }

        .message {
            background: rgba(103, 233, 233, 0.1);
            border: 1px solid var(--accent-color);
            border-left: 4px solid var(--accent-color);
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 24px;
            font-size: 15px;
            line-height: 1.6;
            color: var(--text-primary);
            animation: fadeInUp 0.8s ease-out 0.4s both;
            position: relative;
            overflow: scroll;
            white-space: pre-wrap;
            max-height: 300px;
        }

        .message::before {
            content: '';
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 2px;
            background: linear-gradient(90deg, var(--accent-color), transparent);
            animation: progress 2s ease-out;
        }

        @keyframes progress {
            from { width: 0%; }
            to { width: 100%; }
        }

        .risks {
            background: var(--warning-bg);
            border: 1px solid var(--warning-border);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
            animation: fadeInUp 0.8s ease-out 0.6s both;
        }

        .risks-title {
            color: var(--warning-color);
            font-weight: 600;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: warningGlow 2s ease-in-out infinite;
        }

        @keyframes warningGlow {
            0%, 100% { filter: drop-shadow(0 0 2px rgba(255, 107, 107, 0.3)); }
            50% { filter: drop-shadow(0 0 8px rgba(255, 107, 107, 0.6)); }
        }

        .risk-item {
            color: var(--text-primary);
            margin-bottom: 8px;
            padding-left: 24px;
            position: relative;
        }

        .risk-item:before {
            content: "⚠️";
            position: absolute;
            left: 0;
            color: var(--warning-color);
        }

        .options {
            margin-bottom: 24px;
            animation: fadeInUp 0.8s ease-out 0.8s both;
        }

        .option-item {
            padding: 16px 20px;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 14px;
            background: rgba(255, 255, 255, 0.03);
            position: relative;
            overflow: hidden;
            color: var(--text-primary);
        }

        .option-item::before {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 0;
            background: var(--accent-color);
            transition: width 0.3s ease;
        }

        .option-item.confirm::before {
            background: var(--accent-color);
        }

        .option-item.cancel::before {
            background: var(--warning-color);
        }

        .option-item:hover {
            background: var(--bg-secondary);
            transform: translateX(5px);
        }

        .option-item:hover::before {
            width: 4px;
        }

        .option-item.selected {
            background: rgba(103, 233, 233, 0.1);
            border-color: var(--accent-color);
            transform: translateX(5px);
        }

        .option-item.selected.cancel {
            background: rgba(255, 107, 107, 0.1);
            border-color: var(--warning-color);
        }

        .option-item.selected::before {
            width: 4px;
        }

        .option-icon {
            width: 20px;
            height: 20px;
            color: var(--accent-color);
            flex-shrink: 0;
        }

        .option-item.cancel .option-icon {
            color: var(--warning-color);
        }

        .loading {
            display: none;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 16px;
            color: var(--text-secondary);
            font-size: 14px;
            animation: fadeInUp 0.8s ease-out 1s both;
        }

        .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid var(--border-color);
            border-top: 2px solid var(--accent-color);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="modal">
        <div class="header">
            <div class="header-left">
                <img class="logo" src="https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/mcp/cloudbase-logo.svg" alt="CloudBase Logo" />
                <span class="title">CloudBase AI Toolkit</span>
            </div>
            <a href="https://github.com/TencentCloudBase/CloudBase-AI-ToolKit" target="_blank" class="github-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
            </a>
        </div>

        <div class="content">
            <h1 class="content-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                操作确认
            </h1>
            <div class="message">${message}</div>

            ${
              risks && risks.length > 0
                ? `
            <div class="risks">
                <div class="risks-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    风险提示
                </div>
                ${risks.map((risk) => `<div class="risk-item">${risk}</div>`).join("")}
            </div>
            `
                : ""
            }

            <div class="options">
                ${availableOptions
                  .map((option: string, index: number) => {
                    const isCancel =
                      option.includes("取消") ||
                      option.toLowerCase().includes("cancel");
                    const className = isCancel ? "cancel" : "confirm";
                    const iconPath = isCancel
                      ? '<path d="M18 6L6 18M6 6l12 12"/>'
                      : '<path d="M20 6L9 17l-5-5"/>';

                    return `
                        <div class="option-item ${className}" onclick="selectOption('${option}')" style="animation-delay: ${index * 0.1}s;">
                            <svg class="option-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${iconPath}
                            </svg>
                            <span>${option}</span>
                        </div>
                    `;
                  })
                  .join("")}
            </div>

            <div class="loading" id="loading">
                <div class="spinner"></div>
                <span>正在处理...</span>
            </div>
        </div>
    </div>

    <script>
        let selectedOption = null;

        function selectOption(option) {
            selectedOption = option;

            document.querySelectorAll('.option-item').forEach(item => {
                item.classList.remove('selected');
            });
            event.currentTarget.classList.add('selected');

            // Auto submit after selection
            setTimeout(() => {
                submit();
            }, 500);
        }

        function submit() {
            if (!selectedOption) return;

            document.getElementById('loading').style.display = 'flex';

            const isConfirmed = !selectedOption.includes('取消') && !selectedOption.toLowerCase().includes('cancel');

            fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'confirmation',
                    data: {
                        confirmed: isConfirmed,
                        option: selectedOption
                    }
                })
            }).then(response => response.json())
              .then(result => {
                if (result.success) {
                    window.close();
                }
              }).catch(err => {
                console.error('Error:', err);
                document.getElementById('loading').style.display = 'none';
              });
        }

        function cancel() {
            fetch('/api/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).then(() => {
                window.close();
            });
        }
    </script>
</body>
</html>`;
  }

  // 公共方法获取运行状态
  get running(): boolean {
    return this.isRunning;
  }

  // 公共方法获取端口
  get currentPort(): number {
    return this.port;
  }
}

// 单例实例
let interactiveServerInstance: InteractiveServer | null = null;

export function getInteractiveServer(mcpServer?: any): InteractiveServer {
  if (!interactiveServerInstance) {
    interactiveServerInstance = new InteractiveServer(mcpServer);
  } else if (mcpServer) {
    // Always update mcpServer if provided, to ensure it's current
    interactiveServerInstance.mcpServer = mcpServer;
    debug(`[getInteractiveServer] Updated mcpServer, has server: ${!!mcpServer?.server}, has ide: ${!!mcpServer?.ide}`);
  }
  return interactiveServerInstance;
}

export async function resetInteractiveServer(): Promise<void> {
  if (interactiveServerInstance) {
    try {
      await interactiveServerInstance.stop();
    } catch (err) {
      error("Error stopping existing server instance:", err instanceof Error ? err : new Error(String(err)));
    }
    interactiveServerInstance = null;
  }
}

export async function getInteractiveServerSafe(
  mcpServer?: any,
): Promise<InteractiveServer> {
  // 如果当前实例存在但不在运行状态，先清理
  if (interactiveServerInstance && !interactiveServerInstance.running) {
    try {
      await interactiveServerInstance.stop();
    } catch (err) {
      debug("Error stopping non-running server:", err instanceof Error ? err : new Error(String(err)));
    }
    interactiveServerInstance = null;
  }

  return getInteractiveServer(mcpServer);
}
