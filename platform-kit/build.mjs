import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, "dist"), { recursive: true });

const shared = {
  absWorkingDir: root,
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2020",
  sourcemap: true,
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  external: ["react", "react-dom"],
  logLevel: "info",
};

await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(root, "dist/index.js"),
});

await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/theme/styles.ts")],
  outfile: join(root, "dist/styles.js"),
});

console.log("built @cloudbase/platform-kit");
