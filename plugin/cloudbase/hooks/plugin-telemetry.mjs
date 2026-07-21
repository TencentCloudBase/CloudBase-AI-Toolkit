// hooks/plugin-telemetry.mjs — Lightweight plugin DAU telemetry (Vercel-aligned, Beacon/灯塔 upload)
//
// Collects only:
// - toolkit_plugin_dau: at most once per UTC day when SessionStart runs
// - toolkit_plugin_first_use: once per local user profile
// Always includes pluginVersion. No prompts, paths, tool args, or skill-injection details.
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
  } = options;

  if (!isPluginTelemetryEnabled(env)) {
    return { enabled: false, sent: [] };
  }

  const pluginVersion = resolvePluginVersion(pluginRoot);
  const deviceId = buildDeviceId();
  const userAgent = buildUserAgent(pluginVersion);
  const sent = [];

  const sendEvent = async (eventCode, eventData, onSuccess) => {
    const payload = buildBeaconPayload({
      eventCode,
      eventData: {
        pluginVersion,
        value: "1",
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
