import * as esbuild from "esbuild";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
mkdirSync(join(root, "dist"), { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/server/index.ts")],
  outfile: join(root, "dist/index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  sourcemap: true,
  packages: "bundle",
  external: ["@deepseek-ai/cordis"],
  logLevel: "info",
});

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/server/skill-cli.ts")],
  outfile: join(root, "dist/skill-cli.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
chmodSync(join(root, "dist/skill-cli.js"), 0o755);

const clientId = JSON.stringify(pkg.name);
// dsh ModuleLoader 只向 factory 传 require（参考 @deepseek-ai/dsh-client-runtime
// 的 client.js：`factory: (require) => { var module = { exports: {} } ... }`）。
// 必须用单参 factory 并在内部创建 module/exports，否则
// `Cannot set properties of undefined (setting 'exports')`。
await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/client/index.ts")],
  outfile: join(root, "dist/client.js"),
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2020",
  sourcemap: true,
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  external: ["react", "react-dom"],
  banner: {
    js: `window.__ModuleLoader__.load({id:${clientId},factory:function(require){var module={exports:{}};var exports=module.exports;var React=require("react");`,
  },
  footer: {
    js: `return module.exports;}});`,
  },
  logLevel: "info",
});

console.log("built @cloudbase/dsh-plugin server + client + skill-cli");
