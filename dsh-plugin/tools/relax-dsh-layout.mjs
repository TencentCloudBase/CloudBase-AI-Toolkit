#!/usr/bin/env node
/**
 * Patch installed @deepseek-ai/dsh-client-ui-layout so the CloudBase details
 * panel can open on a blank "new session". Upstream zeros the details column
 * when the current session is blank (`detailsSession === void 0 ? 0`), which
 * makes the plugin UI unoperable for unattended / first-paint flows.
 *
 * Safe to re-run. Does not change repo sources — only local DSH installs.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const NEEDLE = "detailsSession === void 0 ? 0 : panels.details";
const REPLACEMENT = "panels.details";

const candidates = [
  join(homedir(), ".dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js"),
  join(homedir(), ".dsh/profiles/web/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js"),
];

let patched = 0;
for (const file of candidates) {
  if (!existsSync(file)) continue;
  const before = readFileSync(file, "utf8");
  if (!before.includes(NEEDLE)) {
    if (before.includes("detailsSession === void 0 ? 0")) {
      console.error("unrecognized layout snippet in", file);
      process.exitCode = 1;
      continue;
    }
    console.log("already patched or different version:", file);
    continue;
  }
  writeFileSync(file, before.replaceAll(NEEDLE, REPLACEMENT));
  console.log("patched", file);
  patched += 1;
}

if (patched === 0 && process.exitCode !== 1) {
  console.log("no layout copies needed a patch (already applied or DSH not installed)");
}
