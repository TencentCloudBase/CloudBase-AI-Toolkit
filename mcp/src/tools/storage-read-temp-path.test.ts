import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { ExtendedMcpServer } from "../server.js";

const { mockGetCloudBaseManager, mockGetEnvId } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
}));

import { registerStorageTools } from "./storage.js";

function createMockServer(downloadFile: (options: any) => Promise<void>) {
  const tools: Record<
    string,
    { meta: any; handler: (args: any) => Promise<any> }
  > = {};

  const server = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    ide: "TestIDE",
    pluginOptions: { storage: { downloadFile } },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    server: { sendLoggingMessage: vi.fn() },
    registerTool: vi.fn(
      (name: string, meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { meta, handler };
      },
    ),
  } as unknown as ExtendedMcpServer;

  registerStorageTools(server);
  return tools;
}

/**
 * `queryStorage(action="read")` downloads the object into a fresh temp directory and names the
 * local file after the last segment of cloudPath. A cloud path that only *looks* like a single
 * segment on the current platform (e.g. a Windows-style `..\..\win.ini` sent by a client) must not
 * become a directory hop once joined onto that temp directory.
 */
describe("queryStorage action=read temp file name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvId.mockResolvedValue("env-test");
    mockGetCloudBaseManager.mockResolvedValue({});
  });

  it.each([
    ["nested posix path", "docs/report.txt", "report.txt"],
    ["windows separators", "..\\..\\Windows\\win.ini", "win.ini"],
    ["posix traversal", "../../etc/passwd", "passwd"],
    ["mixed separators", "a/..\\b/../../secret.txt", "secret.txt"],
    ["trailing separator", "docs/", "storage-file"],
    ["parent directory only", "..", "storage-file"],
    ["current directory only", ".", "storage-file"],
    ["blank path", "   ", "storage-file"],
  ])("resolves %s to a single temp file name", async (_label, cloudPath, expected) => {
    const captured: string[] = [];
    const tools = createMockServer(async ({ localPath }: { localPath: string }) => {
      captured.push(localPath);
      await fs.writeFile(localPath, "hello", "utf8");
    });

    const result = await tools.queryStorage.handler({ action: "read", cloudPath });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(true);
    expect(captured).toHaveLength(1);
    expect(path.basename(captured[0])).toBe(expected);

    // The downloaded file has to sit directly inside the directory created by mkdtemp, never above it.
    const relative = path.relative(os.tmpdir(), captured[0]);
    expect(relative.startsWith("..")).toBe(false);
    expect(relative.split(path.sep)).toHaveLength(2);
  });
});
