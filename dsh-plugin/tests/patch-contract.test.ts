import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("cordis patch contract", () => {
  it("forwards only CLOUDBASE_ENV_ID with a string fallback and never an API Key", () => {
    const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
    expect(patch).toContain("serverName: cloudbase");
    expect(patch).toContain("@cloudbase/cloudbase-mcp@latest");
    expect(patch).toContain("CLOUDBASE_ENV_ID: !!js (process.env.CLOUDBASE_ENV_ID || 'ai-share-d2guukyxybb63b206')");
    expect(patch).not.toMatch(/CLOUDBASE_API_KEY/);
    expect(patch).not.toMatch(/TENCENTCLOUD_SECRET/);
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
    expect(pkg.peerDependencies["@deepseek-ai/cordis"]).toBe(">=0.1.0-rc.6 <0.2.0");
    expect(pkg.dsh?.client?.inject).toEqual(
      expect.arrayContaining(["cloudbaseData", "slots", "layout"]),
    );
    expect(pkg.files).toEqual(expect.arrayContaining(["dist/skill-cli.js"]));
  });
});
