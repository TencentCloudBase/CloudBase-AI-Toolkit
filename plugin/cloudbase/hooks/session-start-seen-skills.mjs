// hooks/session-start-seen-skills.mjs — Initialize/reset seen-skills dedup state
// On clear/compact events, removes session dedup artifacts so high-priority
// skills can be re-injected. Adapted from Vercel plugin.
import { readFileSync } from "fs";
import { createLogger } from "./logger.mjs";
import { normalizeInput, formatOutput } from "./compat.mjs";
import { removeAllSessionDedupArtifacts } from "./hook-env.mjs";

var log = createLogger();

var CONTEXT_CLEARING_EVENTS = new Set(["clear", "compact"]);

function main() {
  const raw = readFileSync(0, "utf-8");
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    input = {};
  }
  const normalized = normalizeInput(input);
  const platform = normalized.platform;

  // Cursor: emit reset env
  if (platform === "cursor") {
    process.stdout.write(
      JSON.stringify(
        formatOutput(platform, {
          env: { CLOUDBASE_PLUGIN_SEEN_SKILLS: "" },
        })
      )
    );
    return;
  }

  // Claude Code: on clear/compact, remove dedup artifacts
  // SessionStart hooks receive the trigger source ("startup"/"resume"/"clear"/
  // "compact") in the `source` field, not in `hook_event_name` (which is always
  // "SessionStart").
  const source = normalized.source || "";
  const sessionId = normalized.sessionId || "";
  const resetTriggered = CONTEXT_CLEARING_EVENTS.has(source) && !!sessionId;

  if (resetTriggered) {
    const result = removeAllSessionDedupArtifacts(sessionId);
    log.summary("seen-skills:reset", {
      sessionId,
      source,
      removedFiles: result.removedFiles,
      removedDirs: result.removedDirs,
    });
  } else {
    log.debug("seen-skills:no-reset", { sessionId, source });
  }

  // Emit empty output (no additionalContext for this hook)
  process.stdout.write(JSON.stringify(formatOutput(platform, {})));
}

main();
