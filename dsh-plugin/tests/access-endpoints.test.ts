import { describe, expect, it } from "vitest";
import {
  mapAppToEndpoint,
  mapVersionToDeployment,
} from "../src/shared/apps-access.js";

describe("data-service access endpoints mapping", () => {
  it("maps queryApps getApp Domain to endpoint", () => {
    const endpoint = mapAppToEndpoint("my-app", {
      ServiceName: "my-app",
      Domain: "my-app-env.webapps.tcloudbase.com",
    });
    expect(endpoint?.url).toContain("my-app-env.webapps.tcloudbase.com");
    expect(endpoint?.resourceType).toBe("app");
  });

  it("maps app version to deployment record", () => {
    const record = mapVersionToDeployment(
      "my-app",
      { Status: "SUCCESS", BuildId: "build-1", CreateTime: "2026-08-19T10:00:00Z" },
      "https://my-app-env.webapps.tcloudbase.com",
    );
    expect(record?.status).toBe("success");
    expect(record?.resourceName).toBe("my-app");
  });
});
