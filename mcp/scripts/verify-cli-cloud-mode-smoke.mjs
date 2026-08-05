#!/usr/bin/env node
/**
 * Smoke: `node dist/cli.cjs --cloud-mode` must stay alive on stdio.
 *
 * Catches the historical cloud-mode ↔ logger circular-dependency crash
 * (misreported as an ajv SyntaxError because Node dumps the minified line
 * before printing `TypeError: (0 , *.debug) is not a function`).
 *
 * Usage:
 *   node ./scripts/verify-cli-cloud-mode-smoke.mjs
 *   CLI_PATH=/path/to/cli.cjs node ./scripts/verify-cli-cloud-mode-smoke.mjs
 *
 * Env:
 *   CLI_PATH           absolute/relative path to cli.cjs (default: ../dist/cli.cjs)
 *   SMOKE_ALIVE_MS     how long the process must stay alive (default: 2500)
 */

import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, "..");
const CLI_PATH = path.resolve(
  process.env.CLI_PATH || path.join(packageDir, "dist", "cli.cjs"),
);
const SMOKE_ALIVE_MS = Number(process.env.SMOKE_ALIVE_MS || 2500);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function log(step, detail) {
  console.log(`[cli-cloud-mode-smoke] ${step}${detail ? `: ${detail}` : ""}`);
}

function runOnce(args, envExtra = {}) {
  return new Promise((resolve) => {
    // Attach stderr to a real file fd (not a pipe). Node's crash printer can
    // emit a multi-MB minified line; a pipe silently truncates around 64KB
    // and hides `TypeError: (0 , *.debug) is not a function` at the end.
    const workDir = mkdtempSync(path.join(tmpdir(), "cli-cloud-mode-smoke-"));
    const stderrPath = path.join(workDir, "stderr.txt");
    const stderrFd = openSync(stderrPath, "w");

    const child = spawn(process.execPath, args, {
      stdio: ["pipe", "ignore", stderrFd],
      env: {
        ...process.env,
        ...envExtra,
        // Keep telemetry/network noise out of smoke.
        NODE_ENV: "test",
        VITEST: "true",
      },
    });

    // Parent no longer needs the fd after spawn inherits it.
    closeSync(stderrFd);

    let settled = false;
    let killRequested = false;
    const startedAt = Date.now();

    const cleanup = () => {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    };

    const readStderr = () => {
      try {
        return readFileSync(stderrPath, "utf8");
      } catch {
        return "";
      }
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Give the OS a tick to flush the inherited fd writes.
      setTimeout(() => {
        const stderr = readStderr();
        cleanup();
        resolve({ ...result, stderr });
      }, 50);
    };

    const timer = setTimeout(() => {
      killRequested = true;
      child.kill("SIGTERM");
      // Fallback if the process ignores SIGTERM.
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        finish({
          status: "alive",
          code: null,
          signal: "SIGTERM",
        });
      }, 1000);
    }, SMOKE_ALIVE_MS);

    child.on("error", (error) => {
      finish({
        status: "spawn-error",
        error,
      });
    });

    child.on("exit", (code, signal) => {
      const livedMs = Date.now() - startedAt;
      // Success: we asked it to stop after the alive window, or it outlived the window.
      if (killRequested || livedMs >= SMOKE_ALIVE_MS - 50) {
        finish({
          status: "alive",
          code,
          signal,
          livedMs,
        });
        return;
      }
      finish({
        status: "exited",
        code,
        signal,
        livedMs,
      });
    });
  });
}

function summarizeStderr(stderr) {
  const text = stderr || "";
  // Specific to the cloud-mode↔logger circular-dep crash shape after webpack.
  // Avoid bare "SyntaxError"/"TypeError" — those substrings appear inside the
  // minified dump itself and cause false positives.
  const markers = [
    "TypeError: (0 , ",
    ".debug) is not a function",
    "debug is not a function",
  ];
  const hits = markers.filter((marker) => text.includes(marker));
  // Prefer the real error line when present; otherwise the useful tail.
  // Node dumps a multi-MB minified source line before the TypeError.
  const typeErrorMatch = text.match(/TypeError: \(0 , [^\n]+/);
  const tail = typeErrorMatch
    ? typeErrorMatch[0]
    : text.slice(-1200);
  return { hits, tail, bytes: Buffer.byteLength(text, "utf8") };
}

async function assertCloudModeBoot(label, args, envExtra = {}) {
  log("run", `${label} -> ${args.join(" ")}`);
  const result = await runOnce(args, envExtra);
  const errSummary = summarizeStderr(result.stderr);

  if (result.status === "spawn-error") {
    throw new Error(`${label}: failed to spawn: ${result.error?.message}`);
  }

  if (result.status === "exited") {
    throw new Error(
      `${label}: process exited early code=${result.code} signal=${result.signal}; stderrBytes=${errSummary.bytes}; error=${JSON.stringify(errSummary.tail)}; markers=${errSummary.hits.join("|") || "none"}`,
    );
  }

  assert(result.status === "alive", `${label}: unexpected status ${result.status}`);
  assert(
    errSummary.hits.length === 0,
    `${label}: stderr contained crash markers: ${errSummary.hits.join(", ")}`,
  );
  log("pass", `${label} stayed alive for ${SMOKE_ALIVE_MS}ms (stderrBytes=${errSummary.bytes})`);
}

async function main() {
  assert(existsSync(CLI_PATH), `CLI bundle missing: ${CLI_PATH}. Run npm run build first.`);
  log("cli", CLI_PATH);

  await assertCloudModeBoot("flag", [CLI_PATH, "--cloud-mode"]);
  await assertCloudModeBoot("env", [CLI_PATH], {
    CLOUDBASE_MCP_CLOUD_MODE: "true",
  });

  // Control: default stdio mode must also stay alive.
  await assertCloudModeBoot("default", [CLI_PATH]);

  console.log(
    JSON.stringify(
      {
        success: true,
        cli: CLI_PATH,
        aliveMs: SMOKE_ALIVE_MS,
        cases: ["--cloud-mode", "CLOUDBASE_MCP_CLOUD_MODE=true", "default"],
      },
      null,
      2,
    ),
  );
  log("done", "all cases passed");
}

main().catch((error) => {
  console.error("[cli-cloud-mode-smoke] FAILED:", error);
  process.exit(1);
});
