import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import { z } from "zod";

const { mockGetCloudBaseManager, mockGetEnvId } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
}));

/**
 * Every manage action except `initEnv` reads `serverName` — `init`/`download`/`createAgent` turn it
 * into an on-disk directory, the rest use it as a service name. `initEnv` provisions the environment
 * and never touches it.
 */
const ACTIONS_REQUIRING_SERVER_NAME = [
  "init",
  "download",
  "run",
  "deploy",
  "delete",
  "createAgent",
  "updateConfig",
  "traffic",
] as const;

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
 * `manageCloudRun` turns `serverName` into a path for `init`, `download` and `createAgent`: the
 * Manager SDK resolves it against `targetPath` and extracts the downloaded template archive there,
 * and the handler writes `<targetPath>/<serverName>/{cloudbaserc.json,package.json,...}`. The value
 * must stay a single path segment.
 *
 * The schema carries the naming rule; presence is enforced in the handler because `initEnv` is
 * documented as taking no server name. Assertions therefore go through both layers: the registered
 * input shape (what the MCP SDK validates every `tools/call` against) and the registered handler
 * (what runs after validation).
 */
describe("manageCloudRun serverName", () => {
  let schema: z.ZodObject<any, any, any, any>;
  let tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }>;
  let resolveCloudRunProjectDir: typeof import("./cloudrun.js").resolveCloudRunProjectDir;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetEnvId.mockResolvedValue("env-test");

    const mockServer = createMockServer();
    const cloudrun = await import("./cloudrun.js");
    cloudrun.registerCloudRunTools(mockServer.server);

    schema = z.object(mockServer.tools.manageCloudRun.meta.inputSchema);
    tools = mockServer.tools;
    resolveCloudRunProjectDir = cloudrun.resolveCloudRunProjectDir;
  });

  describe("naming rule (schema)", () => {
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
      for (const action of ACTIONS_REQUIRING_SERVER_NAME) {
        expect(schema.safeParse({ action, serverName: "../../victim" }).success).toBe(false);
      }
    });
  });

  describe("presence (handler)", () => {
    // The schema leaves serverName optional so that `initEnv` can be called the way it is documented
    // (envId only). Presence moved to the handler, which fails closed before any branch reads it.
    it.each([...ACTIONS_REQUIRING_SERVER_NAME, "initEnv"])(
      "accepts a missing serverName at the schema layer (%s)",
      (action) => {
        expect(schema.safeParse({ action }).success).toBe(true);
      },
    );

    it.each(ACTIONS_REQUIRING_SERVER_NAME)(
      "fails closed in the handler for %s without serverName",
      async (action) => {
        // No credentials are configured in these tests, so a guard that failed to fire would let the
        // call fall through to the manager and raise a different error.
        const error: unknown = await tools.manageCloudRun.handler({ action }).catch((e) => e);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/serverName/);
        expect((error as Error).message).toContain(action);
      },
    );

    it("does not require serverName for initEnv", async () => {
      const error: unknown = await tools.manageCloudRun
        .handler({ action: "initEnv", envId: "env-test" })
        .catch((e) => e);

      // initEnv goes past the guard and stops later (no manager in this test), which is the point.
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/serverName/);
    });
  });

  describe("targetPath containment (resolveCloudRunProjectDir)", () => {
    const base = "/tmp/cloudrun-ws";

    it.each([
      ["parent traversal", "../victim"],
      ["traversal after a segment", "svc/../../victim"],
      ["absolute posix path", "/tmp/evil"],
      ["a value carrying windows separators", "..\\..\\victim"],
      ["a name that normalizes back inside", "a/../b"],
      ["the target directory itself", "."],
      ["an empty value", ""],
    ])("refuses %s", (_label, serverName) => {
      expect(() => resolveCloudRunProjectDir(base, serverName)).toThrow(/targetPath/);
    });

    it("contains a windows-style absolute name (refused on Windows, one string segment on POSIX)", () => {
      if (process.platform === "win32") {
        expect(() => resolveCloudRunProjectDir(base, "C:\\evil")).toThrow(/targetPath/);
        return;
      }
      // 'C:\evil' carries no separator that POSIX recognizes, so it is a contained single segment
      // there — the assert only guarantees it never lands above targetPath.
      expect(path.relative(base, resolveCloudRunProjectDir(base, "C:\\evil"))).toBe("C:\\evil");
    });

    it("returns the direct child for a documented name", () => {
      expect(resolveCloudRunProjectDir(base, "my-service")).toBe(
        path.resolve(base, "my-service"),
      );
    });
  });
});
