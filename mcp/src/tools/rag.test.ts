import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";

const { mockGetCloudBaseManager, mockCreateCloudBaseManagerWithOptions } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockCreateCloudBaseManagerWithOptions: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  createCloudBaseManagerWithOptions: mockCreateCloudBaseManagerWithOptions,
}));

import { registerRagTools, resolveSkillSearchRoots } from "./rag.js";

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    registerTool: vi.fn(
      (name: string, meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { meta, handler };
      },
    ),
  } as unknown as ExtendedMcpServer;

  return { server, tools };
}

describe("rag tools", () => {
  beforeEach(() => {
    mockGetCloudBaseManager.mockReset();
    mockCreateCloudBaseManagerWithOptions.mockReset();
  });

  it("resolveSkillSearchRoots should prefer local generated and source skill roots before cache", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rag-skill-roots-"));
    const repoRoot = path.join(tempRoot, "cloudbase-turbo-delploy.feature-test");
    const cliEntryPath = path.join(repoRoot, "mcp", "dist", "cli.cjs");
    const generatedSkills = path.join(
      repoRoot,
      ".generated",
      "compat-config",
      ".codebuddy",
      "skills",
    );
    const sourceSkills = path.join(repoRoot, "config", "source", "skills");
    const cacheSkills = path.join(
      tempRoot,
      ".cloudbase-mcp",
      "web-template",
      ".claude",
      "skills",
    );

    await fs.mkdir(path.dirname(cliEntryPath), { recursive: true });
    await fs.writeFile(cliEntryPath, "");
    await fs.mkdir(generatedSkills, { recursive: true });
    await fs.mkdir(sourceSkills, { recursive: true });
    await fs.mkdir(cacheSkills, { recursive: true });

    const roots = await resolveSkillSearchRoots({
      cliEntryPath,
      homeDir: tempRoot,
    });

    expect(roots).toEqual([generatedSkills, sourceSkills, cacheSkills]);
  });

  it("searchKnowledgeBase no longer requires id when mode=vector", async () => {
    const { server, tools } = createMockServer();

    await registerRagTools(server);

    await expect(
      tools.searchKnowledgeBase.handler({
        mode: "vector",
      }),
    ).rejects.toThrow("检索内容不能为空");
  });

  it("searchKnowledgeBase should expose docs mode and official app.docs actions", async () => {
    const { server, tools } = createMockServer();

    await registerRagTools(server);

    expect(tools.searchKnowledgeBase.meta.inputSchema.mode.options).toEqual(
      expect.arrayContaining(["vector", "skill", "openapi", "docs"]),
    );
    expect(tools.searchKnowledgeBase.meta.inputSchema.action).toBeDefined();
    expect(tools.searchKnowledgeBase.meta.inputSchema.moduleName).toBeDefined();
    expect(tools.searchKnowledgeBase.meta.inputSchema.input).toBeDefined();
    expect(tools.searchKnowledgeBase.meta.inputSchema.docPath).toBeDefined();
    expect(tools.searchKnowledgeBase.meta.inputSchema.query).toBeDefined();

    expect(
      tools.searchKnowledgeBase.meta.inputSchema.action.unwrap().options,
    ).toEqual(
      expect.arrayContaining([
        "listModules",
        "listModuleDocs",
        "findByName",
        "readDoc",
        "searchDocs",
      ]),
    );
  });

  it("searchKnowledgeBase docs mode should use public docs sdk without requiring login", async () => {
    const { server, tools } = createMockServer();
    const searchDocs = vi.fn().mockResolvedValue([
      {
        title: "云函数超时说明",
        url: "https://docs.cloudbase.net/cloud-function/timeout",
        content: "云函数默认超时时间说明",
      },
    ]);

    mockGetCloudBaseManager.mockRejectedValue(new Error("AUTH_REQUIRED"));
    mockCreateCloudBaseManagerWithOptions.mockReturnValue({
      docs: {
        searchDocs,
      },
    });

    await registerRagTools(server);

    const result = await tools.searchKnowledgeBase.handler({
      mode: "docs",
      action: "searchDocs",
      query: "云函数 超时",
    });

    expect(mockGetCloudBaseManager).not.toHaveBeenCalled();
    expect(mockCreateCloudBaseManagerWithOptions).toHaveBeenCalledWith({});
    expect(searchDocs).toHaveBeenCalledWith("云函数 超时");
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      success: true,
      data: {
        action: "searchDocs",
        query: "云函数 超时",
        results: [
          {
            title: "云函数超时说明",
          },
        ],
      },
    });
  });

  it("searchKnowledgeBase docs mode should validate action specific params", async () => {
    const { server, tools } = createMockServer();

    mockCreateCloudBaseManagerWithOptions.mockReturnValue({
      docs: {
        readDoc: vi.fn(),
      },
    });

    await registerRagTools(server);

    const result = await tools.searchKnowledgeBase.handler({
      mode: "docs",
      action: "readDoc",
    });

    expect(JSON.parse(result.content[0].text)).toMatchObject({
      success: false,
      message: expect.stringContaining("docPath"),
    });
  });

  it("searchKnowledgeBase should avoid empty enums when dynamic catalogs are unavailable", async () => {
    const originalFetch = globalThis.fetch;
    const realFs = await vi.importActual<typeof import("fs/promises")>(
      "fs/promises",
    );
    const missingSkillRoots = [
      `${path.sep}.generated${path.sep}compat-config${path.sep}.codebuddy${path.sep}skills`,
      `${path.sep}config${path.sep}source${path.sep}skills`,
      `${path.sep}.cloudbase-mcp${path.sep}web-template${path.sep}.claude${path.sep}skills`,
    ];

    vi.resetModules();
    vi.doMock("lockfile", () => {
      const lock = vi.fn((lockPath: string, optionsOrCallback: unknown, maybeCallback?: (error: Error | null) => void) => {
        const callback =
          typeof optionsOrCallback === "function"
            ? optionsOrCallback as (error: Error | null) => void
            : maybeCallback;
        callback?.(null);
      });
      const unlock = vi.fn((lockPath: string, callback?: (error: Error | null) => void) => {
        callback?.(null);
      });

      return {
        default: { lock, unlock },
        lock,
        unlock,
      };
    });
    vi.doMock("fs/promises", () => ({
      ...realFs,
      readFile: vi.fn(
        async (
          filePath: Parameters<typeof realFs.readFile>[0],
          options?: Parameters<typeof realFs.readFile>[1],
        ) => {
          if (String(filePath).endsWith("cache-meta.json")) {
            throw new Error("cache miss");
          }
          return realFs.readFile(filePath, options);
        },
      ),
      stat: vi.fn(async (filePath: Parameters<typeof realFs.stat>[0]) => {
        const targetPath = String(filePath);
        if (missingSkillRoots.some((segment) => targetPath.includes(segment))) {
          throw new Error("missing skill root");
        }
        return realFs.stat(filePath);
      }),
      mkdir: vi.fn(
        async (
          filePath: Parameters<typeof realFs.mkdir>[0],
          options?: Parameters<typeof realFs.mkdir>[1],
        ) => {
          if (String(filePath).includes(`${path.sep}.cloudbase-mcp`)) {
            return undefined;
          }
          return realFs.mkdir(filePath, options);
        },
      ),
    }));

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as typeof fetch;

    try {
      const { registerRagTools: isolatedRegisterRagTools } = await import("./rag.js");
      const { server, tools } = createMockServer();

      await isolatedRegisterRagTools(server);

      expect(
        tools.searchKnowledgeBase.meta.inputSchema.skillName.unwrap().safeParse("auth-tool").success,
      ).toBe(true);
      expect(
        tools.searchKnowledgeBase.meta.inputSchema.apiName.unwrap().safeParse("functions").success,
      ).toBe(true);
      expect(tools.searchKnowledgeBase.meta.inputSchema.skillName.description).toContain(
        "当前暂时无法枚举可选值",
      );
    } finally {
      globalThis.fetch = originalFetch;
      vi.doUnmock("fs/promises");
      vi.doUnmock("lockfile");
      vi.resetModules();
    }
  });
});
