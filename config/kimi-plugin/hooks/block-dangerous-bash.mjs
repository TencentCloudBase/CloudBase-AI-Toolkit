#!/usr/bin/env node
/**
 * Kimi PreToolUse hook (matcher: Bash).
 * Blocks clearly destructive shell commands. Exit 2 denies; 0 allows.
 * Fail-open on parse errors so a broken hook never stalls the session.
 *
 * Intent matches the official Kimi Bash example and Claude plugin
 * PreToolUse safety, without importing plugin/cloudbase/hooks (Kimi
 * copies the plugin into ~/.kimi-code/plugins/managed/ and rejects
 * paths that resolve outside the plugin root).
 */

let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let payload = {};
  try {
    payload = JSON.parse(input || "{}");
  } catch {
    process.exit(0);
  }

  const command = String(
    payload.tool_input?.command ?? payload.toolInput?.command ?? "",
  );

  if (!command) {
    process.exit(0);
  }

  const denied = matchDenied(command);
  if (denied) {
    process.stderr.write(`${denied}\n`);
    process.exit(2);
  }

  process.exit(0);
});

function matchDenied(command) {
  const checks = [
    {
      re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b/,
      reason:
        "Blocked recursive force-delete (rm -rf). Use a narrower, reversible delete.",
    },
    {
      re: /\bmkfs(\.\w+)?\b/,
      reason: "Blocked filesystem format command (mkfs).",
    },
    {
      re: /\bdd\s+if=/,
      reason: "Blocked raw disk write (dd if=).",
    },
    {
      re: /\btcb(\s+|-)env(:|\s+)destroy\b/,
      reason:
        "Blocked CloudBase environment destroy. Confirm with the user, then run it only after explicit approval.",
    },
    {
      re: /\bDROP\s+DATABASE\b/i,
      reason:
        "Blocked DROP DATABASE. Confirm with the user before destroying a database.",
    },
  ];

  for (const check of checks) {
    if (check.re.test(command)) {
      return check.reason;
    }
  }
  return null;
}
