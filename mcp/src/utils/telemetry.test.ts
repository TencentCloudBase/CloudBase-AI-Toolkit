import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reportToolCall,
  reportToolkitLifecycle,
  telemetryReporter,
} from "./telemetry.js";

describe("telemetry payload serialization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should stringify duration and preserve requestId for tool calls", async () => {
    const reportSpy = vi
      .spyOn(telemetryReporter, "report")
      .mockResolvedValue(undefined);

    await reportToolCall({
      toolName: "readNoSqlDatabaseContent",
      success: true,
      requestId: "req-query",
      duration: 123,
    });

    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_tool_call",
      expect.objectContaining({
        requestId: "req-query",
        duration: "123",
      }),
    );
  });

  it("should stringify lifecycle duration and exitCode", async () => {
    const reportSpy = vi
      .spyOn(telemetryReporter, "report")
      .mockResolvedValue(undefined);

    await reportToolkitLifecycle({
      event: "exit",
      duration: 456,
      exitCode: 2,
    });

    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_lifecycle",
      expect.objectContaining({
        duration: "456",
        exitCode: "2",
      }),
    );
  });
});
