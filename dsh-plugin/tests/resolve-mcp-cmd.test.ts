import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findCachedCloudbaseMcpBin,
  resolveMcpLaunch,
} from "../src/server/resolve-mcp-cmd.js";

describe("resolveMcpLaunch", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeNpxCache(withBin: boolean): string {
    const root = mkdtempSync(join(tmpdir(), "npx-cache-"));
    dirs.push(root);
    if (withBin) {
      const binDir = join(root, "abc123", "node_modules", ".bin");
      mkdirSync(binDir, { recursive: true });
      const bin = join(binDir, "cloudbase-mcp");
      writeFileSync(bin, "#!/bin/sh\necho ok\n");
      chmodSync(bin, 0o755);
    }
    return root;
  }

  it("prefers CLOUDBASE_MCP_COMMAND over cache and npx", () => {
    const npxRoot = makeNpxCache(true);
    const launch = resolveMcpLaunch(
      { CLOUDBASE_MCP_COMMAND: "/custom/mcp", CLOUDBASE_MCP_ARGS: "a,b" },
      { npxRoot },
    );
    expect(launch).toEqual({
      command: "/custom/mcp",
      args: ["a", "b"],
      source: "env",
    });
  });

  it("prefers cached npx bin over live npx", () => {
    const npxRoot = makeNpxCache(true);
    const launch = resolveMcpLaunch({}, { npxRoot });
    expect(launch.source).toBe("npx-cache");
    expect(launch.command).toContain(`${join("abc123", "node_modules", ".bin", "cloudbase-mcp")}`);
    expect(launch.args).toEqual([]);
  });

  it("falls back to npx when cache is empty", () => {
    const npxRoot = makeNpxCache(false);
    const launch = resolveMcpLaunch({}, { npxRoot });
    expect(launch).toEqual({
      command: "npx",
      args: ["-y", "@cloudbase/cloudbase-mcp@latest"],
      source: "npx",
    });
  });

  it("findCachedCloudbaseMcpBin picks newest mtime", () => {
    const npxRoot = makeNpxCache(false);
    const olderDir = join(npxRoot, "old", "node_modules", ".bin");
    const newerDir = join(npxRoot, "new", "node_modules", ".bin");
    mkdirSync(olderDir, { recursive: true });
    mkdirSync(newerDir, { recursive: true });
    const older = join(olderDir, "cloudbase-mcp");
    const newer = join(newerDir, "cloudbase-mcp");
    writeFileSync(older, "old");
    writeFileSync(newer, "new");
    const future = new Date(Date.now() + 60_000);
    utimesSync(newer, future, future);
    expect(findCachedCloudbaseMcpBin(npxRoot)).toBe(newer);
  });
});
