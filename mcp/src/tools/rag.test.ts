import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";
import type { ExtendedMcpServer } from "../server.js";

const { mockGetCloudBaseManager, mockCreateCloudBaseManagerWithOptions } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockCreateCloudBaseManagerWithOptions: vi.fn(),
}));

// 让测试可以把 os.homedir() 指向临时目录，从而控制技能搜索根（<home>/.cloudbase-mcp/...）。
const skillTestState = vi.hoisted(() => ({ home: "" }));

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    default: actual,
    homedir: () => skillTestState.home || actual.homedir(),
  };
});

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  createCloudBaseManagerWithOptions: mockCreateCloudBaseManagerWithOptions,
}));

import {
  SKILL_REMOTE_BASE_URL,
  buildSkillRawUrl,
  collectSkillMarkdownFiles,
  registerRagTools,
  resolveSkillSearchRoots,
  rewriteRelativeLinks,
} from "./rag.js";

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

  it("registerRagTools should not expose the retired searchWeb tool", async () => {
    const { server, tools } = createMockServer();

    await registerRagTools(server);

    expect(tools).not.toHaveProperty("searchWeb");
    expect(tools).toHaveProperty("searchKnowledgeBase");
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

  it("searchKnowledgeBase should no longer expose the retired vector mode", async () => {
    const { server, tools } = createMockServer();

    await registerRagTools(server);

    const { mode, ...rest } = tools.searchKnowledgeBase.meta.inputSchema;

    expect(mode.options).toEqual(["skill", "openapi", "docs"]);
    expect(mode.safeParse("vector").success).toBe(false);
    expect(Object.keys(rest)).toEqual(
      expect.not.arrayContaining([
        "threshold",
        "id",
        "content",
        "options",
        "limit",
      ]),
    );
  });

  it("searchKnowledgeBase should expose docs mode and official app.docs actions", async () => {
    const { server, tools } = createMockServer();

    await registerRagTools(server);

    expect(tools.searchKnowledgeBase.meta.inputSchema.mode.options).toEqual([
      "skill",
      "openapi",
      "docs",
    ]);
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
        tools.searchKnowledgeBase.meta.inputSchema.skillName.unwrap().safeParse("auth-tool-cloudbase").success,
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

  it("searchKnowledgeBase skill/openapi modes return remote URLs instead of local paths in cloud mode", async () => {
    const originalFetch = globalThis.fetch;
    const previousCloudMode = process.env.CLOUDBASE_MCP_CLOUD_MODE;
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as typeof fetch;

    try {
      const { server, tools } = createMockServer();
      await registerRagTools(server);

      const openapiResult = await tools.searchKnowledgeBase.handler({
        mode: "openapi",
        apiName: "nosql",
      });
      const openapiText = openapiResult.content[0].text;
      expect(openapiText).toContain(
        "https://docs.cloudbase.net/openapi/nosql.v1.openapi.yaml",
      );
      expect(openapiText).not.toContain("Path:");
      expect(openapiText).not.toContain(".cloudbase-mcp");

      // Skill enumeration may be unavailable offline; either way the response
      // must point at the remote SKILL.md URL instead of a server-local path.
      // Use a name that can never be enumerated so the assertion is stable.
      const skillResult = await tools.searchKnowledgeBase.handler({
        mode: "skill",
        skillName: "__missing-skill__",
      });
      const skillText = skillResult.content[0].text;
      expect(skillText).toContain(
        "https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/__missing-skill__/SKILL.md",
      );
      // 本地绝对路径提示必须缺失（断言按词典键构造，避免绑定具体语言）
      expect(skillText).not.toContain(
        t("rag.skillLocal", { path: "__SENTINEL__", content: "" }).split("__SENTINEL__")[0],
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (previousCloudMode === undefined) {
        delete process.env.CLOUDBASE_MCP_CLOUD_MODE;
      } else {
        process.env.CLOUDBASE_MCP_CLOUD_MODE = previousCloudMode;
      }
    }
  });
});

describe("searchKnowledgeBase mode=skill remote references", () => {
  const originalFetch = globalThis.fetch;
  const previousCloudMode = process.env.CLOUDBASE_MCP_CLOUD_MODE;
  let tempDirs: string[] = [];

  async function createFakeSkillHome(skillName: string) {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "rag-remote-skill-"));
    tempDirs.push(home);

    const skillDir = path.join(
      home,
      ".cloudbase-mcp",
      "web-template",
      ".claude",
      "skills",
      skillName,
    );
    await fs.mkdir(path.join(skillDir, "references", "nested"), {
      recursive: true,
    });

    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        `name: ${skillName}`,
        "description: fake skill used by rag remote-reference tests",
        "---",
        "",
        "# Fake Skill",
        "",
        "See [guide](references/guide.md) and [sibling](../sibling-skill/SKILL.md).",
        "Escape [outside](../../outside.md) stays relative.",
        "",
        "```ts",
        "// [must-not-rewrite](references/inside.md)",
        "```",
        "",
        "Keep [absolute](https://example.com/x.md) and [anchor](#section).",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(skillDir, "references", "guide.md"),
      "# Guide\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(skillDir, "references", "nested", "deep.md"),
      "# Deep\n",
      "utf8",
    );

    // 有效缓存：让 downloadResources 走快速路径，测试不触发网络下载
    await fs.writeFile(
      path.join(home, ".cloudbase-mcp", "cache-meta.json"),
      JSON.stringify({ timestamp: Date.now() }),
      "utf8",
    );

    return { home, skillDir };
  }

  function mockFetchByStatus(status: number) {
    globalThis.fetch = vi.fn(async (input: unknown) => {
      if (String(input).startsWith(SKILL_REMOTE_BASE_URL)) {
        return { status } as unknown as Response;
      }
      throw new Error("offline");
    }) as unknown as typeof fetch;
  }

  async function registerInFakeHome(home: string) {
    skillTestState.home = home;
    vi.resetModules();
    const { registerRagTools: isolatedRegisterRagTools } = await import(
      "./rag.js"
    );
    const { server, tools } = createMockServer();
    await isolatedRegisterRagTools(server);
    return tools;
  }

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (previousCloudMode === undefined) {
      delete process.env.CLOUDBASE_MCP_CLOUD_MODE;
    } else {
      process.env.CLOUDBASE_MCP_CLOUD_MODE = previousCloudMode;
    }
    skillTestState.home = "";
    vi.resetModules();
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  it("uses the live all-in-one skills repo and builds raw urls per skill", () => {
    expect(SKILL_REMOTE_BASE_URL).toBe(
      "https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references",
    );
    expect(
      buildSkillRawUrl("cloudrun-development", "references/vpc-and-database.md"),
    ).toBe(
      `${SKILL_REMOTE_BASE_URL}/cloudrun-development/references/vpc-and-database.md`,
    );
  });

  it("collects every markdown file recursively with SKILL.md first", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rag-skill-md-"));
    tempDirs.push(dir);
    await fs.mkdir(path.join(dir, "references", "rules"), { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), "", "utf8");
    await fs.writeFile(path.join(dir, "checklist.md"), "", "utf8");
    await fs.writeFile(path.join(dir, "references", "rules", "A.md"), "", "utf8");
    await fs.writeFile(path.join(dir, "notes.txt"), "", "utf8");

    await expect(collectSkillMarkdownFiles(dir)).resolves.toEqual([
      "SKILL.md",
      "checklist.md",
      "references/rules/A.md",
    ]);
  });

  it("rewrites fence-outside relative links only and preserves anchors", () => {
    const input = [
      "[a](references/x.md#sec)",
      "[abs](https://example.com/y.md)",
      "[root](/root.md)",
      "[anchor](#only)",
      "[sibling](../sibling-skill/SKILL.md)",
      "[escape](../../outside.md)",
      "```",
      "[inside](references/y.md)",
      "```",
      "[after](checklist.md)",
    ].join("\n");

    const output = rewriteRelativeLinks(input, "myskill");

    expect(output).toContain(
      `[a](${SKILL_REMOTE_BASE_URL}/myskill/references/x.md#sec)`,
    );
    expect(output).toContain("[abs](https://example.com/y.md)");
    expect(output).toContain("[root](/root.md)");
    expect(output).toContain("[anchor](#only)");
    expect(output).toContain(
      `[sibling](${SKILL_REMOTE_BASE_URL}/sibling-skill/SKILL.md)`,
    );
    expect(output).toContain("[escape](../../outside.md)");
    expect(output).toContain("[inside](references/y.md)");
    expect(output).toContain(
      `[after](${SKILL_REMOTE_BASE_URL}/myskill/checklist.md)`,
    );
  });

  it("returns the full remote md address list and rewritten body when the mirror exists", async () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    const { home } = await createFakeSkillHome("myskill");
    mockFetchByStatus(200);

    const tools = await registerInFakeHome(home);
    const result = await tools.searchKnowledgeBase.handler({
      mode: "skill",
      skillName: "myskill",
    });
    const text = result.content[0].text;

    expect(text).toContain(`${SKILL_REMOTE_BASE_URL}/myskill/SKILL.md`);
    expect(text).toContain(
      `${SKILL_REMOTE_BASE_URL}/myskill/references/guide.md`,
    );
    expect(text).toContain(
      `${SKILL_REMOTE_BASE_URL}/myskill/references/nested/deep.md`,
    );
    expect(text).toContain(
      `](${SKILL_REMOTE_BASE_URL}/myskill/references/guide.md)`,
    );
    expect(text).toContain(
      `](${SKILL_REMOTE_BASE_URL}/sibling-skill/SKILL.md)`,
    );
    expect(text).toContain("[must-not-rewrite](references/inside.md)");
    expect(text).not.toContain(
      `](${SKILL_REMOTE_BASE_URL}/myskill/references/inside.md)`,
    );
    expect(text).not.toContain(
      t("rag.skillLocal", { path: "__SENTINEL__", content: "" }).split("__SENTINEL__")[0],
    );
  });

  it("falls back to inline content without dead links when the mirror is missing", async () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    const { home } = await createFakeSkillHome("local-only-skill");
    mockFetchByStatus(404);

    const tools = await registerInFakeHome(home);
    const result = await tools.searchKnowledgeBase.handler({
      mode: "skill",
      skillName: "local-only-skill",
    });
    const text = result.content[0].text;

    expect(text).toContain(
      t("rag.skillRemoteMissing", { skillName: "local-only-skill" }),
    );
    expect(text).not.toContain(SKILL_REMOTE_BASE_URL);
    expect(text).toContain(t("rag.skillContentHeading", { body: "" }).trim());
    expect(text).toContain("](references/guide.md)");
  });

  it("points unknown skill names at the remote hint instead of throwing", async () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    const { home } = await createFakeSkillHome("myskill");
    mockFetchByStatus(200);

    const tools = await registerInFakeHome(home);
    const result = await tools.searchKnowledgeBase.handler({
      mode: "skill",
      skillName: "ghost-skill",
    });
    const text = result.content[0].text;

    expect(text).toContain(
      t("rag.skillNotFound", {
        skillName: "ghost-skill",
        available: "myskill",
        remoteHint: "",
      }).trim(),
    );
    expect(text).toContain(`${SKILL_REMOTE_BASE_URL}/ghost-skill/SKILL.md`);
  });
});
