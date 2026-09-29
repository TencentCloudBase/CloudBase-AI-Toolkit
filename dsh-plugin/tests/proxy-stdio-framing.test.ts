import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const proxyPath = join(root, "scripts", "mcp-env-proxy.mjs");

/** A minimal MCP stdio server that speaks newline-delimited JSON, like cloudbase-mcp. */
const STUB_CHILD = `import { stdin, stdout } from "node:process";
let buf = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
  buf += chunk;
  for (;;) {
    const nl = buf.indexOf("\\n");
    if (nl === -1) break;
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.method === "initialize") {
      stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "stub-mcp", version: "0.0.0" } } }) + "\\n");
    } else if (msg.method === "tools/list") {
      stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "stubEcho", description: "echo", inputSchema: { type: "object" } }] } }) + "\\n");
    }
  }
});
`;

interface ProxyHarness {
  child: ChildProcessWithoutNullStreams;
  send: (message: unknown) => void;
  next: (timeoutMs: number) => Promise<Record<string, unknown>>;
}

/**
 * Spawn the env proxy with its child replaced by the stub, so the test needs no
 * network and no npx cache.
 */
function startProxy(): ProxyHarness {
  const dir = mkdtempSync(join(tmpdir(), "cloudbase-proxy-test-"));
  const stubPath = join(dir, "stub-child.mjs");
  writeFileSync(stubPath, STUB_CHILD, "utf8");

  const child = spawn(process.execPath, [proxyPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      CLOUDBASE_MCP_COMMAND: process.execPath,
      CLOUDBASE_MCP_ARGS: stubPath,
      CLOUDBASE_MCP_DISABLE_LOG_FILE: "true",
    },
  }) as ChildProcessWithoutNullStreams;

  let buf = "";
  const waiters: Array<(message: Record<string, unknown>) => void> = [];
  const pending: Array<Record<string, unknown>> = [];
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl === -1) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      // The proxy replies with Content-Length framing, so a header line arrives
      // ahead of the JSON body. Parse FIRST and only consume a waiter once a
      // real message exists — shifting before parsing would consume the waiter
      // on the header line and lose the reply that follows it.
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // Content-Length header line
      }
      const waiter = waiters.shift();
      if (waiter) waiter(message);
      else pending.push(message);
    }
  });

  return {
    child,
    send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`),
    next: (timeoutMs) => {
      const queued = pending.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no reply within timeout")), timeoutMs);
        waiters.push((message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
    },
  };
}

let running: ProxyHarness | undefined;
afterEach(() => {
  running?.child.kill();
  running = undefined;
});

describe("env proxy stdio framing", () => {
  it("keeps the newline fallback that the in-process bridge already has", () => {
    // The regression this guards: the proxy used to understand Content-Length
    // framing only, while the host (dsh-mcp-client, via the MCP SDK) and the
    // cloudbase-mcp child both speak newline-delimited JSON. The same function
    // parses BOTH legs, so the omission stalled the initialize handshake until
    // the SDK request timed out and no mcp__cloudbase__* tool ever registered.
    //
    // src/server/mcp-client.ts (parseMcpFrames) has carried this fallback all
    // along; this asserts the proxy script does not drift back out of sync.
    const source = readFileSync(proxyPath, "utf8");
    const fn = source.slice(source.indexOf("function parseFrames"));
    expect(fn).toContain("indexOf(0x0a)");
  });

  it("stays in sync with the in-process bridge framing", () => {
    const proxy = readFileSync(proxyPath, "utf8");
    const bridge = readFileSync(join(root, "src/server/mcp-client.ts"), "utf8");
    const fallbackOf = (text: string) => {
      const start = text.indexOf("const headerEnd = rest.indexOf(");
      return text.slice(start, start + 420).replace(/\s+/g, " ");
    };
    // Both parsers must decode a bare newline-delimited JSON message.
    expect(fallbackOf(proxy)).toContain("indexOf(0x0a)");
    expect(fallbackOf(bridge)).toContain("indexOf(0x0a)");
  });

  it("answers a newline-framed initialize from the host", async () => {
    running = startProxy();
    running.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "host", version: "0" } },
    });
    const reply = await running.next(20_000);
    expect(reply.id).toBe(1);
    expect((reply.result as { serverInfo?: { name?: string } })?.serverInfo?.name).toBe("stub-mcp");
  }, 30_000);

  it("forwards tools/list end to end", async () => {
    running = startProxy();
    running.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "host", version: "0" } },
    });
    await running.next(20_000);

    running.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const reply = await running.next(20_000);
    expect(reply.id).toBe(2);
    const tools = (reply.result as { tools?: Array<{ name: string }> })?.tools ?? [];
    expect(tools.map((tool) => tool.name)).toEqual(["stubEcho"]);
  }, 30_000);
});
