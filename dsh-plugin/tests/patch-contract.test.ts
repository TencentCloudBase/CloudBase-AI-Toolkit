import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("cordis patch contract", () => {
  it("forwards no CloudBase credentials and uses env proxy for session MCP", () => {
    const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
    expect(patch).toContain("serverName: cloudbase");
    expect(patch).toContain("mcp-env-proxy.mjs");
    expect(patch).not.toContain("CLOUDBASE_ENV_ID");
    expect(patch).not.toContain("CLOUDBASE_API_KEY");
    expect(patch).not.toMatch(/TENCENTCLOUD_SECRET/);
    expect(patch).not.toMatch(/!!js/);
  });

  it("ships a 0-runtime-dep package with DSH compat range", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      name: string;
      dependencies?: Record<string, string>;
      peerDependencies: Record<string, string>;
      dsh?: { client?: { inject?: string[] } };
      files?: string[];
    };
    expect(pkg.name).toBe("@cloudbase/dsh-plugin");
    expect(pkg.dependencies ?? {}).toEqual({});
    // dsh 的 cordis 实际版本为 4.x（typert-protocol peer 亦要求 ^4.0.1）
    expect(pkg.peerDependencies["@deepseek-ai/cordis"]).toBe("^4.0.1");
    expect(pkg.dsh?.client?.inject).toEqual(
      expect.arrayContaining(["connection", "slots", "layout"]),
    );
    expect(pkg.files).toEqual(expect.arrayContaining(["dist/skill-cli.js"]));
  });
});
