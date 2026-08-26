import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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

const tscBin = join(root, "node_modules/typescript/bin/tsc");
const tsc = spawnSync(process.execPath, [tscBin, "-p", "tsconfig.build.json"], {
  cwd: root,
  stdio: "inherit",
});
if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

writeFileSync(
  join(root, "dist/styles.d.ts"),
  `export { ensureKitStyles, KIT_CSS } from "./theme/styles.js";\n`,
);

console.log("built @cloudbase/platform-kit");
