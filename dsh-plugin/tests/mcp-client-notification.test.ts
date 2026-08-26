import { describe, expect, it, vi } from "vitest";
import {
  CloudBaseMcpBridge,
  ENV_CHANGED_NOTIFICATION_METHOD,
  extractEnvChangedNotification,
} from "../src/server/mcp-client.js";

function encodeFrame(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"),
    body,
  ]);
}

type BridgeUnderTest = {
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  onData(chunk: Buffer): void;
};

describe("mcp-client server notifications", () => {
  it("extractEnvChangedNotification returns envId for env_changed method", () => {
    expect(
      extractEnvChangedNotification({
        jsonrpc: "2.0",
        method: ENV_CHANGED_NOTIFICATION_METHOD,
        params: { envId: "env-x" },
      }),
    ).toBe("env-x");
  });

  it("extractEnvChangedNotification returns undefined for other methods or missing envId", () => {
    expect(
      extractEnvChangedNotification({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
    ).toBeUndefined();
    expect(
      extractEnvChangedNotification({
        jsonrpc: "2.0",
        method: ENV_CHANGED_NOTIFICATION_METHOD,
      }),
    ).toBeUndefined();
    expect(
      extractEnvChangedNotification({
        jsonrpc: "2.0",
        method: ENV_CHANGED_NOTIFICATION_METHOD,
        params: { envId: "" },
      }),
    ).toBeUndefined();
  });

  it("onData broadcasts env_changed notification to listeners (cross-client event)", () => {
    const bridge = new CloudBaseMcpBridge({});
    const listener = vi.fn();
    bridge.onEnvChanged(listener);
    const frame = encodeFrame({
      jsonrpc: "2.0",
      method: ENV_CHANGED_NOTIFICATION_METHOD,
      params: { envId: "env-y" },
    });
    (bridge as unknown as BridgeUnderTest).onData(frame);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("env-y");
  });

  it("onData ignores non-env notifications without touching listeners", () => {
    const bridge = new CloudBaseMcpBridge({});
    const listener = vi.fn();
    bridge.onEnvChanged(listener);
    const frame = encodeFrame({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
    (bridge as unknown as BridgeUnderTest).onData(frame);
    expect(listener).not.toHaveBeenCalled();
  });

  it("onData still resolves pending responses for messages with id", () => {
    const bridge = new CloudBaseMcpBridge({});
    const underTest = bridge as unknown as BridgeUnderTest;
    const resolve = vi.fn();
    const reject = vi.fn();
    underTest.pending.set(7, { resolve, reject });
    const frame = encodeFrame({ jsonrpc: "2.0", id: 7, result: { ok: true } });
    underTest.onData(frame);
    expect(resolve).toHaveBeenCalledWith({ jsonrpc: "2.0", id: 7, result: { ok: true } });
    expect(reject).not.toHaveBeenCalled();
  });

  it("notification and response frames in one chunk are both handled", () => {
    const bridge = new CloudBaseMcpBridge({});
    const underTest = bridge as unknown as BridgeUnderTest;
    const listener = vi.fn();
    bridge.onEnvChanged(listener);
    const resolve = vi.fn();
    const reject = vi.fn();
    underTest.pending.set(8, { resolve, reject });
    const chunk = Buffer.concat([
      encodeFrame({
        jsonrpc: "2.0",
        method: ENV_CHANGED_NOTIFICATION_METHOD,
        params: { envId: "env-z" },
      }),
      encodeFrame({ jsonrpc: "2.0", id: 8, result: { ok: true } }),
    ]);
    underTest.onData(chunk);
    expect(listener).toHaveBeenCalledWith("env-z");
    expect(resolve).toHaveBeenCalled();
  });
});
