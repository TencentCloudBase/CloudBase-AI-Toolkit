#!/usr/bin/env node

import fs from "fs";
import {
  BASELINE_FILE,
  GENERATED_CONFIG_DIR,
  buildCompatBaselineManifest,
} from "./compat-baseline-lib.mjs";
import { buildCompatConfig } from "./build-compat-config.mjs";

export function updateCompatBaseline() {
  buildCompatConfig({ outputDir: GENERATED_CONFIG_DIR });

  const manifest = buildCompatBaselineManifest(GENERATED_CONFIG_DIR);
  const totalFiles = Object.values(manifest.groups).reduce(
    (sum, group) => sum + Object.keys(group.files).length,
    0,
  );

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return {
    baselineFile: BASELINE_FILE,
    totalFiles,
    groupCounts: Object.fromEntries(
      Object.entries(manifest.groups).map(([groupName, group]) => [
        groupName,
        Object.keys(group.files).length,
      ]),
    ),
  };
}

function main() {
  const result = updateCompatBaseline();

  console.log(`✅ Updated compat baseline: ${result.baselineFile}`);
  console.log(`📦 Files tracked: ${result.totalFiles}`);
  for (const [groupName, count] of Object.entries(result.groupCounts)) {
    console.log(`- ${groupName}: ${count}`);
  }
}

main();
