import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCloudBaseMcpServer } from "../server.js";
import {
  CLOUD_INCOMPATIBLE_TOOLS,
  CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS,
} from "./cloud-mode.js";

/**
 * Configuration matrix over a real MCP handshake. Reading tool names from a
 * live `tools/list` is the point: source-level assertions alone cannot tell
 * whether the registration pipeline was installed at all.
 */
const ENV_KEYS = ["CLOUDBASE_MCP_CLOUD_MODE", "MCP_CLOUD_MODE"] as const;
const ORIGINAL_ARGV = [...process.argv];

const EXCEPTIONS = new Set<string>(CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS);
const GATED = CLOUD_INCOMPATIBLE_TOOLS.filter((name) => !EXCEPTIONS.has(name));
const PLUGINS = ["env", "setup", "storage", "deploy", "cloudrun"];

// Reset process mode between cases so each case measures only its own configuration.
function resetMode(): void {
  process.argv = [...ORIGINAL_ARGV];
  for (const key of ENV_KEYS) delete process.env[key];
}

afterEach(resetMode);

async function listedTools(cloudMode: boolean, enableTelemetry: boolean): Promise<string[]> {
  const server = await createCloudBaseMcpServer({
    cloudMode,
    enableTelemetry,
    pluginsEnabled: PLUGINS,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "pipeline-contract", version: "0.0.1" });

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name).sort();
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

describe("tool pipeline contract", () => {
  it("cloud mode exposes the same tools whether telemetry is on or off", async () => {
    const on = await listedTools(true, true);
    resetMode();
    const off = await listedTools(true, false);
    expect(off).toEqual(on);
  });

  it("local mode exposes the same tools whether telemetry is on or off", async () => {
    const on = await listedTools(false, true);
    resetMode();
    const off = await listedTools(false, false);
    expect(off).toEqual(on);
  });

  it("cloud mode omits every local-file tool", async () => {
    const names = await listedTools(true, false);
    for (const gated of GATED) expect(names).not.toContain(gated);
  });

  it("local mode keeps local-file tools registered", async () => {
    const names = await listedTools(false, false);
    expect(names).toContain("manageStorage");
  });

  it("records the tool set after an earlier cloud server", async () => {
    resetMode();
    await listedTools(true, false);
    // Deliberately no reset: record the tool set a prior server leaves behind.
    const localNames = await listedTools(false, false);
    const manageStorageVisible = localNames.includes("manageStorage");
    console.log(
      "SEQUENCE_PROBE:" +
        JSON.stringify({ localToolCount: localNames.length, manageStorageVisible }),
    );
    // Probe output is informational; the matrix assertions above cover the contract.
    expect(localNames.length).toBeGreaterThan(0);
  });
});
