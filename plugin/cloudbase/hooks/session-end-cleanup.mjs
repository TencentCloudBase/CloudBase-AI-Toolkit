// hooks/session-end-cleanup.mjs — SessionEnd cleanup hook
// Removes session-scoped dedup artifacts when session ends.
// Adapted from Vercel plugin.
import { readFileSync } from "fs";
import { createLogger } from "./logger.mjs";
import { normalizeInput, formatOutput } from "./compat.mjs";
import { removeAllSessionDedupArtifacts } from "./hook-env.mjs";

var log = createLogger();

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
  const sessionId = normalized.sessionId || "";

  if (sessionId) {
    const result = removeAllSessionDedupArtifacts(sessionId);
    log.summary("session-end-cleanup:complete", {
      sessionId,
      removedFiles: result.removedFiles,
      removedDirs: result.removedDirs,
    });
  } else {
    log.debug("session-end-cleanup:no-session-id", {});
  }

  // Emit empty output
  process.stdout.write(JSON.stringify(formatOutput(platform, {})));
}

main();
