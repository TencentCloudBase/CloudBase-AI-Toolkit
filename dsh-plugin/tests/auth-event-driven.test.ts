import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createCloudBaseDataService } from "../src/server/data-service.js";
import type { CloudBaseMcpBridge } from "../src/server/mcp-client.js";

type CapiCall = { service: string; action: string; params: Record<string, unknown> };

interface EnvBridge extends CloudBaseMcpBridge {
  capiCalls: CapiCall[];
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  emitEnvChanged(envId: string): void;
}

function envBridge(
  handlers: Record<string, unknown>,
  authHandlers: Record<string, unknown> = {},
): EnvBridge {
  const capiCalls: CapiCall[] = [];
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const envListeners = new Set<(envId: string) => void>();
  return {
    capiCalls,
    toolCalls,
    emitEnvChanged(envId) {
      for (const listener of envListeners) listener(envId);
    },
    onEnvChanged(listener: (envId: string) => void) {
      envListeners.add(listener);
      return () => {
        envListeners.delete(listener);
      };
    },
    async callTool(name: string, args: Record<string, unknown>) {
      toolCalls.push({ name, args });
      if (name === "callCloudApi") {
        const service = String(args.service);
        const action = String(args.action);
        capiCalls.push({ service, action, params: (args.params ?? {}) as Record<string, unknown> });
        const result = handlers[`${service}:${action}`] ?? handlers[action] ?? handlers["*"];
        if (result instanceof Error) throw result;
        return result ?? {};
      }
      if (name === "auth") {
        const action = String(args.action ?? "");
        const result = authHandlers[`auth:${action}`] ?? authHandlers.auth;
        if (result instanceof Error) throw result;
        return typeof result === "function" ? result(args) : (result ?? {});
      }
      throw new Error(`unexpected tool ${name}`);
    },
    async listTools() {
      return ["callCloudApi", "auth"];
    },
    dispose() {},
  } as EnvBridge;
}

describe("auth/event-driven data-service", () => {
  const signedInAuth = {
    "auth:status": { current_env_id: "env-a", auth_status: "READY", signedIn: true },
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("authStatus does zero cloud calls even when signed in locally", async () => {
    const bridge = envBridge({ "tcb:DescribeEnvs": { EnvList: [{ EnvId: "env-a" }] } }, signedInAuth);
    const data = createCloudBaseDataService(bridge);
    const status = await data.authStatus!();
    expect(status.signedIn).toBe(true);
    expect(status.envId).toBe("env-a");
    expect(bridge.capiCalls).toHaveLength(0);
  });

  it("panel mounted with fallback timer makes zero cloud calls over 10 minutes", async () => {
    const bridge = envBridge({}, signedInAuth);
    const data = createCloudBaseDataService(bridge);
    const listener = vi.fn();
    const unsub = data.authStateChange!(listener);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    unsub();
    expect(bridge.capiCalls).toHaveLength(0);
    expect(listener).toHaveBeenCalled();
  });

  it("setEnvironment updates status locally with zero cloud calls and notifies listeners", async () => {
    const bridge = envBridge({}, {
      "auth:status": { auth_status: "READY", signedIn: true },
      "auth:set_env": { envId: "env-b", auth_status: "READY", signedIn: true },
    });
    const data = createCloudBaseDataService(bridge);
    const listener = vi.fn();
    const unsub = data.authStateChange!(listener);
    await Promise.resolve();
    listener.mockClear();
    const status = await data.setEnvironment!("env-b");
    expect(status.envId).toBe("env-b");
    expect(bridge.capiCalls).toHaveLength(0);
    expect(listener).toHaveBeenCalled();
    const last = listener.mock.calls.at(-1)?.[0];
    expect(last?.envId).toBe("env-b");
    unsub();
  });

  it("session AI set_env broadcasts through bridge.onEnvChanged to panel listeners", async () => {
    const bridge = envBridge({}, {
      "auth:status": { auth_status: "READY", signedIn: true },
    });
    const data = createCloudBaseDataService(bridge);
    const listener = vi.fn();
    const unsub = data.authStateChange!(listener);
    await Promise.resolve();
    listener.mockClear();
    bridge.emitEnvChanged("env-c");
    await vi.advanceTimersByTimeAsync(1);
    expect(listener).toHaveBeenCalled();
    const last = listener.mock.calls.at(-1)?.[0];
    expect(last?.envId).toBe("env-c");
    unsub();
  });

  it("probeCredentials caches DescribeEnvs result for repeated probes within TTL", async () => {
    const bridge = envBridge({ "tcb:DescribeEnvs": { EnvList: [{ EnvId: "env-a" }] } }, signedInAuth);
    const data = createCloudBaseDataService(bridge);
    await data.startLogin!("host-injected");
    await data.startLogin!("host-injected");
    const probes = bridge.capiCalls.filter((c) => c.action === "DescribeEnvs");
    expect(probes).toHaveLength(1);
  });

  it("metrics/envInfo results are TTL-cached across React re-polls", async () => {
    const handlers = { "tcb:DescribeCurveData": { Values: [1] }, "tcb:DescribeEnvs": { EnvList: [{ EnvId: "env-a" }] } };
    const bridge = envBridge(handlers, signedInAuth);
    const data = createCloudBaseDataService(bridge);
    const first = await data.metrics!();
    const second = await data.metrics!();
    expect(second).toEqual(first);
    expect(bridge.capiCalls.filter((c) => c.action === "DescribeCurveData")).toHaveLength(4);
    await data.envInfo!();
    await data.envInfo!();
    expect(bridge.capiCalls.filter((c) => c.action === "DescribeEnvs")).toHaveLength(1);
  });

  it("ENV_REQUIRED error trips circuit breaker; user ops reset it", async () => {
    const bridge = envBridge(
      { "tcb:DescribeUsage": new Error("[DescribeUsage] EnvBindingError: ENV_REQUIRED") },
      signedInAuth,
    );
    const data = createCloudBaseDataService(bridge);
    await expect(data.usage!()).rejects.toThrow("ENV_REQUIRED");
    expect(bridge.toolCalls.filter((t) => t.name === "callCloudApi")).toHaveLength(1);
    // 熔断期内不再打云端，本地快速失败
    await expect(data.usage!()).rejects.toThrow("环境绑定校验已暂停重试");
    expect(bridge.toolCalls.filter((t) => t.name === "callCloudApi")).toHaveLength(1);
    // 用户主动切环境重置熔断
    await data.setEnvironment!("env-a");
    expect(bridge.toolCalls.filter((t) => t.name === "callCloudApi")).toHaveLength(1);
  });
});
