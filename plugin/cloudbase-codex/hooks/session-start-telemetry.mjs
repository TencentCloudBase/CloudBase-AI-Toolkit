// hooks/session-start-telemetry.mjs — SessionStart entry for lightweight plugin DAU
// Fire-and-forget style with a short timeout; never blocks or breaks the session hook chain.
import { readFileSync } from "fs";
import { createLogger, logCaughtError } from "./logger.mjs";
import { normalizeInput, formatOutput } from "./compat.mjs";
import { reportPluginSessionTelemetry } from "./plugin-telemetry.mjs";

var log = createLogger();

async function main() {
  const raw = readFileSync(0, "utf-8");
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    input = {};
  }
  const normalized = normalizeInput(input);
  const platform = normalized.platform;

  try {
    const result = await reportPluginSessionTelemetry({ timeoutMs: 1500 });
    log.debug("session-start-telemetry", {
      enabled: result.enabled,
      sent: result.sent,
      pluginVersion: result.pluginVersion,
      source: normalized.source || "",
    });
  } catch (error) {
    logCaughtError(log, "session-start-telemetry:failed", error);
  }

  process.stdout.write(JSON.stringify(formatOutput(platform, {})));
}

main();
