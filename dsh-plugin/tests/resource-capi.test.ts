import { describe, expect, it } from "vitest";
import {
  BUCKET_WRITE_UNSUPPORTED,
  INVOKE_UNSUPPORTED,
  mapCloudRunService,
  mapFunctionDetail,
  mapFunctionSummary,
  mapHostingInfo,
  mapStorageBuckets,
} from "../src/server/resource-capi.js";

describe("resource-capi mappers", () => {
  it("maps function summary and detail with triggers", () => {
    expect(mapFunctionSummary({ FunctionName: "hello", Runtime: "Nodejs18.15" })?.name).toBe("hello");
    const detail = mapFunctionDetail(
      {
        FunctionName: "hello",
        Handler: "index.main",
        Triggers: [{ TriggerName: "t1", Type: "timer" }],
        Environment: { Variables: [{ Key: "A", Value: "1" }] },
      },
      "hello",
    );
    expect(detail.handler).toBe("index.main");
    expect(detail.triggers[0]?.name).toBe("t1");
    expect(detail.environment[0]?.key).toBe("A");
  });

  it("maps CloudRun service and storage buckets", () => {
    expect(mapCloudRunService({ ServerName: "api", Status: "running", Cpu: "0.5" })?.name).toBe("api");
    const buckets = mapStorageBuckets({
      EnvList: [{ Storages: [{ Bucket: "b-1", Region: "ap-shanghai", Size: 2048 }] }],
    });
    expect(buckets[0]?.name).toBe("b-1");
    expect(buckets[0]?.sizeLabel).toContain("kB");
  });

  it("maps hosting DomainSet and StaticDomain defaultUrl", () => {
    const withDomain = mapHostingInfo(
      { DomainSet: [{ Domain: "a.tcloudbaseapp.com", Status: "ONLINE" }] },
      {},
    );
    expect(withDomain.domains[0]?.domain).toBe("a.tcloudbaseapp.com");
    const withStatic = mapHostingInfo(
      {},
      { StaticStorages: [{ StaticDomain: "env.tcloudbaseapp.com" }] },
    );
    expect(withStatic.defaultUrl).toBe("https://env.tcloudbaseapp.com");
  });

  it("exposes write degrade reasons", () => {
    expect(INVOKE_UNSUPPORTED.supported).toBe(false);
    expect(BUCKET_WRITE_UNSUPPORTED.supported).toBe(false);
    expect(INVOKE_UNSUPPORTED.reason).toMatch(/InvokeFunction/);
    expect(BUCKET_WRITE_UNSUPPORTED.reason).toMatch(/CreateBucket/);
  });
});
