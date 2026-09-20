import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * DSH evaluates `!!js` scalars by evaluating the expression with the loader
 * context in scope (see `@deepseek-ai/cordis-plugin-loader`):
 * `new Function("ctx", "expr", "with (ctx) { return eval(expr) }")`.
 */
const evaluate = new Function("ctx", "expr", "with (ctx) { return eval(expr) }") as (
  ctx: Record<string, unknown>,
  expr: string,
) => string;

/** The single `!!js` args expression that anchors the env proxy to the package. */
function proxyArgsExpression(): string {
  const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
  const captured = patch.match(/args: \[!!js '(.+)'\]/)?.[1];
  if (!captured) {
    throw new Error("cordis.patch.yml: no `!!js` args expression found");
  }
  return captured;
}

describe("cordis patch: proxy path resolution", () => {
  const expr = proxyArgsExpression();
  const suffix = "node_modules/@cloudbase/dsh-plugin/scripts/mcp-env-proxy.mjs";

  // `baseUrl` comes from `pathToFileURL(<profile dir>).href`, so a home
  // directory containing a space or non-ASCII character arrives percent-encoded
  // (`%20`, `%E5%BC%A0…`) — on every platform, not just Windows. Feeding that
  // back to `node` is what makes it a MODULE_NOT_FOUND.
  const cases: Array<[string, string, string]> = [
    [
      "plain posix home",
      "file:///Users/booker/.dsh/profiles/web/",
      "/Users/booker/.dsh/profiles/web/",
    ],
    [
      "home directory containing a space",
      "file:///Users/john%20doe/.dsh/profiles/web/",
      "/Users/john doe/.dsh/profiles/web/",
    ],
    [
      "home directory containing CJK characters",
      "file:///Users/%E5%BC%A0%E4%B8%89/.dsh/profiles/web/",
      "/Users/张三/.dsh/profiles/web/",
    ],
    [
      "windows path with CJK characters",
      "file:///C:/Users/%E5%BC%A0%E4%B8%89/.dsh/profiles/web/",
      "C:/Users/张三/.dsh/profiles/web/",
    ],
    [
      "path containing a literal percent sign",
      "file:///Users/100%25done/.dsh/profiles/web/",
      "/Users/100%done/.dsh/profiles/web/",
    ],
  ];

  for (const [label, baseUrl, expectedDir] of cases) {
    it(`resolves the env proxy with a ${label}`, () => {
      expect(evaluate({ baseUrl }, expr)).toBe(`${expectedDir}${suffix}`);
    });
  }
});
