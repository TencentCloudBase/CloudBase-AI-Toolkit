#!/usr/bin/env node

import {
  BASELINE_FILE,
  GENERATED_CONFIG_DIR,
  compareCompatBaseline,
  loadCompatBaseline,
  COMPAT_SURFACE_GROUPS,
} from "./compat-baseline-lib.mjs";
import { buildCompatConfig } from "./build-compat-config.mjs";

export function compareCompatSurface() {
  return compareCompatBaseline(loadCompatBaseline(), GENERATED_CONFIG_DIR);
}

function printSection(title, items) {
  console.log(`\n${title}: ${items.length}`);
  for (const item of items.slice(0, 200)) {
    console.log(`- ${item}`);
  }
  if (items.length > 200) {
    console.log(`- ... and ${items.length - 200} more`);
  }
}

function printGroupSummary(groupName, result) {
  const label = groupName === "machine" ? "Machine configs" : "Text surfaces";
  console.log(`\n${label}`);
  console.log("-".repeat(label.length));
  console.log(`Expected files: ${result.expectedCount}`);
  console.log(`Generated files: ${result.generatedCount}`);
  console.log(`Existence mode: ${result.existenceMode}`);
  console.log(`Hash mode: ${result.hashMode}`);

  if (result.blockingMissing.length > 0) {
    printSection(`${label} missing (blocking)`, result.blockingMissing);
  }
  if (result.blockingExtra.length > 0) {
    printSection(`${label} extra (blocking)`, result.blockingExtra);
  }
  if (result.blockingChanged.length > 0) {
    printSection(`${label} changed (blocking)`, result.blockingChanged);
  }
  if (result.advisoryChanged.length > 0) {
    printSection(`${label} changed (advisory)`, result.advisoryChanged);
  }
}

function main() {
  const shouldBuild = !process.argv.includes("--skip-build");

  if (shouldBuild) {
    buildCompatConfig({ outputDir: GENERATED_CONFIG_DIR });
  }

  const result = compareCompatSurface();

  console.log("Compatibility surface diff");
  console.log("==========================");
  console.log(`Baseline file: ${BASELINE_FILE}`);
  console.log(`Tracked groups: ${result.groupCount}`);
  console.log(`Generated files: ${result.generatedCount}`);
  console.log(`Has blocking diff: ${result.hasBlockingDiff ? "YES" : "NO"}`);
  console.log(`Has advisory diff: ${result.hasAdvisoryDiff ? "YES" : "NO"}`);

  if (result.unclassifiedGenerated.length > 0) {
    printSection("Unclassified generated files (blocking)", result.unclassifiedGenerated);
  }

  for (const groupName of Object.keys(COMPAT_SURFACE_GROUPS)) {
    printGroupSummary(groupName, result.groups[groupName]);
  }

  if (result.hasBlockingDiff) {
    process.exit(1);
  }

  if (result.hasAdvisoryDiff) {
    console.log(
      "\nCompatibility contract is intact. Advisory text-surface drift detected; update the baseline when you want future reports to be clean.",
    );
    return;
  }

  console.log("\nNo compatibility diffs found.");
}

main();
