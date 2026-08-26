#!/usr/bin/env node
// Independent MCP stdio probe: initialize + tools/list + queryEnv(list).
// Does NOT pass CLOUDBASE_API_KEY — reuses local tcb login state.
const { spawn } = require("node:child_process");

const env = {
  ...process.env,
  CLOUDBASE_ENV_ID: process.env.CLOUDBASE_ENV_ID || "ai-share-d2guukyxybb63b206",
  CLOUDBASE_MCP_DISABLE_LOG_FILE: "true",
};
delete env.CLOUDBASE_API_KEY;

const child = spawn("npx", ["-y", "@cloudbase/cloudbase-mcp@latest"], {
  env,
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = Buffer.alloc(0);
const pending = new Map();
let nextId = 1;

function send(payload) {
  const json = Buffer.from(JSON.stringify(payload));
  child.stdin.write(`Content-Length: ${json.length}\r\n\r\n`);
  child.stdin.write(json);
}

child.stdout.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    const headerEnd = buf.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = buf.subarray(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buf = buf.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (buf.length < bodyStart + length) break;
    const body = JSON.parse(buf.subarray(bodyStart, bodyStart + length).toString("utf8"));
    buf = buf.subarray(bodyStart + length);
    if (body.id && pending.has(body.id)) {
      const { resolve } = pending.get(body.id);
      pending.delete(body.id);
      resolve(body);
    }
  }
});

function call(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve });
    send({ jsonrpc: "2.0", id, method, params });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} timeout`));
      }
    }, 45000);
  });
}

(async () => {
  try {
    await call("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "cloudbase-dsh-probe", version: "0.1.0" },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    const tools = await call("tools/list", {});
    const names = ((tools.result && tools.result.tools) || []).map((t) => t.name);
    console.log("TOOLS_COUNT:", names.length);
    console.log(
      "CLOUDBASE_TOOLS:",
      names.filter((n) => !n.startsWith("mcp__")).length || names.length,
    );
    const envList = await call("tools/call", {
      name: "queryEnv",
      arguments: { action: "list" },
    });
    const text = ((envList.result && envList.result.content) || []).map((c) => c.text).join("\n");
    console.log("QUERY_ENV:", text.slice(0, 500));
  } catch (error) {
    console.error("PROBE_ERROR:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    child.kill();
  }
})();
