import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockGetCloudBaseManager, mockGetEnvId } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
}));

function createMockServer() {
  const tools: Record<
    string,
    { meta: any; handler: (args: any) => Promise<any> }
  > = {};

  const server: any = {
    cloudBaseOptions: {},
    registerTool: vi.fn(
      (name: string, meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { meta, handler };
      },
    ),
  };

  return { server, tools };
}

/**
 * `manageCloudRun(action="init")` turns serverName into an on-disk path: the Manager SDK resolves
 * it against targetPath and extracts the downloaded template archive there, and the handler writes
 * `<targetPath>/<serverName>/cloudbaserc.json`. The value must therefore stay a single path segment.
 *
 * Assertions go through the registered input shape, which is what the MCP SDK validates every
 * `tools/call` against before the handler runs.
 */
describe("manageCloudRun serverName schema guard", () => {
  let schema: z.ZodObject<any, any, any, any>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetEnvId.mockResolvedValue("env-test");

    const { server, tools } = createMockServer();
    const { registerCloudRunTools } = await import("./cloudrun.js");
    registerCloudRunTools(server);

    schema = z.object(tools.manageCloudRun.meta.inputSchema);
  });

  it.each([
    "my-service",
    "MyService_01",
    "abc",
    "a".repeat(45),
    "svc-2026_09",
  ])("accepts the documented name %s", (serverName) => {
    const parsed = schema.safeParse({ action: "init", serverName });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["parent traversal", "../../victim-project"],
    ["traversal followed by a name", "services/../../../victim"],
    ["windows separators", "..\\..\\victim-project"],
    ["absolute posix path", "/tmp/evil"],
    ["absolute windows path", "C:\\evil"],
    ["leading digit", "1service"],
    ["leading hyphen", "-service"],
    ["leading underscore", "_service"],
    ["shorter than 3 chars", "ab"],
    ["longer than 45 chars", "a".repeat(46)],
    ["empty string", ""],
    ["whitespace padded name", " svc"],
  ])("rejects %s", (_label, serverName) => {
    const parsed = schema.safeParse({ action: "init", serverName });
    expect(parsed.success).toBe(false);
  });

  it("keeps the same rule for every manage action, not just init", () => {
    for (const action of [
      "download",
      "run",
      "deploy",
      "delete",
      "createAgent",
      "updateConfig",
      "traffic",
    ]) {
      expect(schema.safeParse({ action, serverName: "../../victim" }).success).toBe(false);
    }
  });
});
