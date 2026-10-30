// hooks/plugin-telemetry.mjs — Lightweight plugin DAU telemetry (Vercel-aligned, Beacon/灯塔 upload)
//
// Collects only:
// - toolkit_plugin_dau: at most once per UTC day when SessionStart runs
// - toolkit_plugin_first_use: once per local user profile
// Always includes pluginVersion. No prompts, paths, tool args, or skill-injection details.
//
// Account attribution: reads ONLY `uin` (主账号 uin) and `envId` from the local CloudBase auth
// file (~/.config/.cloudbase/auth.json). No network, no credential exchange — one file read.
// Secret fields (refreshToken / tmpSecretId / tmpSecretKey / …) are never read, logged or sent.
// Unreadable (no file / not logged in / env-level API Key, which carries no uin) → "unknown".
//
// Disable: CLOUDBASE_PLUGIN_TELEMETRY=off (or CLOUDBASE_MCP_TELEMETRY_DISABLED=true)
import { createHash, randomBytes } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import http from "http";
import https from "https";
import {
  arch as osArch,
  cpus,
  hostname as osHostname,
  homedir,
  networkInterfaces,
  release as osRelease,
  type as osType,
} from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createLogger, logCaughtError } from "./logger.mjs";

var log = createLogger();

var BEACON_UPLOAD_URL = "https://otheve.beacon.qq.com/analytics/v2_upload";
var BEACON_APP_KEY = "0WEB0AD0GM4PUUU1";
var DEFAULT_TIMEOUT_MS = 1500;

// 本地登录态。只读 uin / envId 两个字段 —— 该文件同时装着 refreshToken 与临时密钥。
var AUTH_FILE = join(homedir(), ".config", ".cloudbase", "auth.json");
// CLI 站点配置；slotted 形态下靠它的 isIntl 决定取哪个槽（与 @cloudbase/toolbox 同规则）。
var CLI_CONFIG_FILE = join(homedir(), ".config", ".cloudbase", "config.json");

export var PLUGIN_DAU_EVENT = "toolkit_plugin_dau";
export var PLUGIN_FIRST_USE_EVENT = "toolkit_plugin_first_use";

function pluginPackageRoot(metaUrl = import.meta.url) {
  return join(dirname(fileURLToPath(metaUrl)), "..");
}

export function isPluginTelemetryEnabled(env = process.env) {
  const pluginFlag = String(env.CLOUDBASE_PLUGIN_TELEMETRY || "")
    .trim()
    .toLowerCase();
  if (pluginFlag === "off" || pluginFlag === "0" || pluginFlag === "false") {
    return false;
  }
  if (env.CLOUDBASE_MCP_TELEMETRY_DISABLED === "true") {
    return false;
  }
  return true;
}

export function resolveStampDir(env = process.env, home = homedir()) {
  const configured = env.CLOUDBASE_PLUGIN_TELEMETRY_DIR;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  return join(home, ".config", "cloudbase-plugin");
}

export function utcDateStamp(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function resolvePluginVersion(root = pluginPackageRoot()) {
  const candidates = [
    join(root, ".claude-plugin", "plugin.json"),
    join(root, ".plugin", "plugin.json"),
  ];
  for (const filePath of candidates) {
    try {
      const pluginJson = JSON.parse(readFileSync(filePath, "utf-8"));
      if (typeof pluginJson.version === "string" && pluginJson.version.trim()) {
        return pluginJson.version.trim();
      }
    } catch {
      // try next
    }
  }
  return "unknown";
}

function buildDeviceId() {
  try {
    const nics = Object.values(networkInterfaces())
      .flat()
      .filter((nic) => nic && !nic.internal && nic.mac)
      .map((nic) => nic.mac)
      .join(",");
    const deviceInfo = [
      osHostname(),
      cpus()
        .map((cpu) => cpu.model)
        .join(","),
      nics,
    ].join("|");
    return createHash("sha256").update(deviceInfo).digest("hex").slice(0, 32);
  } catch {
    return randomBytes(16).toString("hex");
  }
}

function buildUserAgent(pluginVersion) {
  return `${osType()} ${osRelease()} ${osArch()} ${process.version} CloudBase-Plugin/${pluginVersion}`;
}

export function shouldSendDau(stampDir, now = new Date()) {
  const stampPath = join(stampDir, "dau-stamp");
  if (!existsSync(stampPath)) {
    return true;
  }
  try {
    const previous = readFileSync(stampPath, "utf-8").trim();
    return previous !== utcDateStamp(now);
  } catch {
    return true;
  }
}

export function shouldSendFirstUse(stampDir) {
  return !existsSync(join(stampDir, "first-use-stamp"));
}

export function markDauSent(stampDir, now = new Date()) {
  mkdirSync(stampDir, { recursive: true });
  writeFileSync(join(stampDir, "dau-stamp"), `${utcDateStamp(now)}\n`, "utf-8");
}

export function markFirstUseSent(stampDir, now = new Date()) {
  mkdirSync(stampDir, { recursive: true });
  writeFileSync(
    join(stampDir, "first-use-stamp"),
    `${now.toISOString()}\n`,
    "utf-8",
  );
}

export function buildBeaconPayload({
  eventCode,
  eventData,
  deviceId,
  userAgent,
  now = Date.now(),
}) {
  return {
    appVersion: "",
    sdkId: "js",
    sdkVersion: "4.5.14-web",
    mainAppKey: BEACON_APP_KEY,
    platformId: 3,
    common: {
      A2: deviceId,
      A101: userAgent,
      from: "cloudbase-plugin",
      xDeployEnv: process.env.NODE_ENV || "production",
    },
    events: [
      {
        eventCode,
        eventTime: String(now),
        mapValue: {
          ...eventData,
        },
      },
    ],
  };
}

function postJson(url, data, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const urlObj = new URL(url);
    const client = urlObj.protocol === "https:" ? https : http;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: `${urlObj.pathname}${urlObj.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": data?.common?.A101 || "CloudBase-Plugin",
      },
      timeout: timeoutMs,
    };
    if (urlObj.protocol === "https:") {
      options.minVersion = "TLSv1.2";
      options.maxVersion = "TLSv1.2";
    }

    const req = client.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.write(postData);
    req.end();
  });
}

function readJsonQuietly(file) {
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return undefined;
  }
}

/**
 * 从登录态里挑出「当前有效的那份凭证」。
 *
 * 这个文件的形状**会变**，三种都要认（实测都出现过）：
 *   A. `{ credential: { uin, envId, tmpSecretId, … } }`          ← flat，当前 CLI 写的就是它
 *   B. `{ credential: { domestic: {…}, intl: {…} } }`            ← slotted，双站点登录 / 旧版
 *   C. `{ uin, envId, … }`                                       ← 没有 credential 包裹（防御）
 *
 * slotted 时取哪个槽与 `@cloudbase/toolbox` 的 `migrateSlottedCredentialToFlat` 同规则：
 * 读 CLI `config.json` 的 `isIntl`；读不到 / 不是布尔值 ⇒ 退化为「取有凭证的那个，优先 domestic」。
 * 取错槽会拿到**另一个站点的 uin**，所以这一步不能省。
 */
function pickCredentialSlot(raw, cliConfigFile) {
  if (!raw || typeof raw !== "object") return undefined;
  const inner = raw.credential;
  const c = inner && typeof inner === "object" ? inner : raw;
  if (!c || typeof c !== "object") return undefined;

  const domestic =
    c.domestic && typeof c.domestic === "object" ? c.domestic : undefined;
  const intl = c.intl && typeof c.intl === "object" ? c.intl : undefined;
  if (!domestic && !intl) return c; // flat

  const cli = readJsonQuietly(cliConfigFile);
  const isIntl =
    cli && typeof cli.isIntl === "boolean" ? cli.isIntl : undefined;
  if (isIntl === true) return intl ?? domestic;
  if (isIntl === false) return domestic ?? intl;
  return domestic ?? intl;
}

/** uin 可能是数字（实测 123811017）也可能是字符串；空 / "0" 视为没有。 */
function normalizeUin(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s && s !== "0" ? s : undefined;
}

/**
 * 从本地登录态读「主账号 uin」与「凭证上绑的环境 id」。
 *
 * ⚠️ **两者都可能读不到，这是常态**：
 *   - `uin` 只在**账号级**登录态里有；环境级 API Key 的凭证自身不带 uin。
 *   - `envId` 由 CLI 登录时写入（MCP 侧从不写），实测历史快照里只有很小一部分带它。
 * 读不到一律返回 undefined，由调用方上报 `unknown` —— 不抛错、不阻塞会话。
 *
 * 🔴 只读 `uin` / `envId`：同文件里的 refreshToken 与临时密钥绝不读取、绝不落日志、绝不上报。
 */
export function resolveLocalAuthFacts(options = {}) {
  const facts = { loginUin: undefined, envId: undefined };
  const slot = pickCredentialSlot(
    readJsonQuietly(options.authFile ?? AUTH_FILE),
    options.cliConfigFile ?? CLI_CONFIG_FILE,
  );
  if (!slot) return facts;

  const uin = normalizeUin(slot.uin);
  if (uin) facts.loginUin = uin;
  if (typeof slot.envId === "string" && slot.envId.trim()) {
    facts.envId = slot.envId.trim();
  }
  return facts;
}

/** 上报字段：读不到就报 `unknown`（与 MCP 侧 `toolkit_tool_call.envId` 同一约定）。 */
export function buildAuthAttribution(options = {}) {
  const { loginUin, envId } = resolveLocalAuthFacts(options);
  return { login_uin: loginUin ?? "unknown", envId: envId ?? "unknown" };
}

/**
 * Report lightweight plugin session telemetry (DAU + first use).
 * Stamps are written only after a successful Beacon upload (Vercel-aligned).
 */
export async function reportPluginSessionTelemetry(options = {}) {
  const {
    env = process.env,
    pluginRoot = pluginPackageRoot(),
    stampDir = resolveStampDir(env),
    now = new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    postFetch = postJson,
    authFile,
    cliConfigFile,
  } = options;

  if (!isPluginTelemetryEnabled(env)) {
    return { enabled: false, sent: [] };
  }

  const pluginVersion = resolvePluginVersion(pluginRoot);
  const deviceId = buildDeviceId();
  const userAgent = buildUserAgent(pluginVersion);
  // 一次文件读；读不到就是两个 unknown，不影响下面两条事件
  const attribution = buildAuthAttribution({ authFile, cliConfigFile });
  const sent = [];

  const sendEvent = async (eventCode, eventData, onSuccess) => {
    const payload = buildBeaconPayload({
      eventCode,
      eventData: {
        pluginVersion,
        value: "1",
        ...attribution,
        ...eventData,
      },
      deviceId,
      userAgent,
      now: now.getTime(),
    });
    await postFetch(BEACON_UPLOAD_URL, payload, timeoutMs);
    onSuccess();
    sent.push(eventCode);
  };

  try {
    if (shouldSendFirstUse(stampDir)) {
      await sendEvent(PLUGIN_FIRST_USE_EVENT, { event: "first_use" }, () =>
        markFirstUseSent(stampDir, now),
      );
    }
  } catch (error) {
    logCaughtError(log, "plugin-telemetry:first-use-failed", error, {
      pluginVersion,
    });
  }

  try {
    if (shouldSendDau(stampDir, now)) {
      await sendEvent(PLUGIN_DAU_EVENT, { event: "dau_active_today" }, () =>
        markDauSent(stampDir, now),
      );
    }
  } catch (error) {
    logCaughtError(log, "plugin-telemetry:dau-failed", error, { pluginVersion });
  }

  return {
    enabled: true,
    pluginVersion,
    sent,
  };
}
