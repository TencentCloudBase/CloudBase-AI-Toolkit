import { afterEach, describe, expect, it } from "vitest";
import {
  enableCloudMode,
  getCloudModeStatus,
  isCloudMode,
  shouldRegisterTool,
} from "./cloud-mode.js";

const ORIGINAL_ARGV = [...process.argv];
const ENV_KEYS = ["CLOUDBASE_MCP_CLOUD_MODE", "MCP_CLOUD_MODE"] as const;

function clearCloudModeSignals() {
  process.argv = ORIGINAL_ARGV.filter((arg) => arg !== "--cloud-mode");
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  clearCloudModeSignals();
});

describe("cloud-mode", () => {
  it("detects --cloud-mode without importing logger (no throw)", () => {
    clearCloudModeSignals();
    process.argv = [...process.argv, "--cloud-mode"];
    expect(isCloudMode()).toBe(true);
    expect(getCloudModeStatus()).toEqual({ enabled: true, source: "CLI_ARG" });
  });

  it("detects CLOUDBASE_MCP_CLOUD_MODE env", () => {
    clearCloudModeSignals();
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    expect(isCloudMode()).toBe(true);
    expect(getCloudModeStatus().source).toBe("CLOUDBASE_MCP_CLOUD_MODE");
  });

  it("enableCloudMode sets env flag", () => {
    clearCloudModeSignals();
    expect(isCloudMode()).toBe(false);
    enableCloudMode();
    expect(isCloudMode()).toBe(true);
  });

  it("skips local-file tools in cloud mode", () => {
    clearCloudModeSignals();
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    expect(shouldRegisterTool("envQuery")).toBe(true);
    expect(shouldRegisterTool("createFunction")).toBe(false);
    expect(shouldRegisterTool("downloadTemplate")).toBe(false);
  });
});
