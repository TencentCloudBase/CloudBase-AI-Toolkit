import { describe, expect, it } from "vitest";
import {
  filterRoutesByUpstream,
  flattenHttpServiceRoutes,
  isDomainPathReachableViaGateway,
  preferGatewayOrFallback,
  rankGatewayAccessUrls,
  toAccessUrlEnvelope,
} from "./gateway-access-urls.js";

describe("gateway-access-urls", () => {
  it("ranks custom domain URLs before default domain URLs", () => {
    const ranked = rankGatewayAccessUrls([
      {
        Domain: "env-test.service.tcloudbase.com",
        Path: "/api",
        IsDefault: true,
        UpstreamResourceName: "hello",
        UpstreamResourceType: "WEB_SCF",
      },
      {
        Domain: "api.example.com",
        Path: "/api",
        IsDefault: false,
        UpstreamResourceName: "hello",
        UpstreamResourceType: "WEB_SCF",
      },
    ]);

    expect(ranked.map((item) => item.url)).toEqual([
      "https://api.example.com/api",
      "https://env-test.service.tcloudbase.com/api",
    ]);
    expect(ranked[0].source).toBe("gateway.custom");
    expect(ranked[1].source).toBe("gateway.default");
  });

  it("dedupes identical URLs and normalizes paths", () => {
    const ranked = rankGatewayAccessUrls([
      {
        Domain: "api.example.com",
        Path: "api",
        IsDefault: false,
      },
      {
        Domain: "api.example.com",
        Path: "/api",
        IsDefault: false,
      },
    ]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].url).toBe("https://api.example.com/api");
  });

  it("excludes Enable=false routes from ranked access URLs by default", () => {
    const ranked = rankGatewayAccessUrls([
      {
        Domain: "disabled.tcloudbaseapp.com",
        Path: "/",
        IsDefault: true,
        Enable: false,
        UpstreamResourceName: "staticstore",
        UpstreamResourceType: "STATIC_STORE",
      },
      {
        Domain: "app.webapps.tcloudbase.com",
        Path: "/",
        IsDefault: true,
        Enable: true,
        UpstreamResourceName: "staticstore",
        UpstreamResourceType: "STATIC_STORE",
      },
    ]);

    expect(ranked.map((item) => item.url)).toEqual([
      "https://app.webapps.tcloudbase.com/",
    ]);
  });

  it("can include disabled routes when includeDisabled=true", () => {
    const ranked = rankGatewayAccessUrls(
      [
        {
          Domain: "disabled.tcloudbaseapp.com",
          Path: "/",
          IsDefault: true,
          Enable: false,
        },
      ],
      { includeDisabled: true },
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].enabled).toBe(false);
  });

  it("returns empty envelope when no routes match", () => {
    expect(toAccessUrlEnvelope([])).toEqual({
      accessUrls: [],
      routes: [],
      disabledAccessUrls: [],
    });
  });

  it("flattens Enable and filters routes by upstream type and name", () => {
    const flattened = flattenHttpServiceRoutes({
      Domains: [
        {
          Domain: "api.example.com",
          IsDefault: false,
          Routes: [
            {
              Path: "/run",
              UpstreamResourceType: "CBR",
              UpstreamResourceName: "my-service",
              Enable: true,
            },
            {
              Path: "/fn",
              UpstreamResourceType: "WEB_SCF",
              UpstreamResourceName: "hello",
              Enable: false,
            },
          ],
        },
      ],
    });

    expect(flattened[0].Enable).toBe(true);
    expect(flattened[1].Enable).toBe(false);

    const matched = filterRoutesByUpstream(flattened, {
      upstreamResourceName: "my-service",
      upstreamResourceTypes: ["CBR"],
    });

    expect(matched).toHaveLength(1);
    expect(matched[0].Path).toBe("/run");
  });

  it("detects disabled covering route for a static domain path", () => {
    const routes = flattenHttpServiceRoutes({
      Domains: [
        {
          Domain: "env.tcloudbaseapp.com",
          IsDefault: true,
          Routes: [
            {
              Path: "/",
              Enable: false,
              UpstreamResourceType: "STATIC_STORE",
              UpstreamResourceName: "staticstore",
            },
          ],
        },
      ],
    });

    expect(
      isDomainPathReachableViaGateway(routes, "env.tcloudbaseapp.com", "/site/"),
    ).toBe(false);
    expect(
      isDomainPathReachableViaGateway(
        routes,
        "https://env.tcloudbaseapp.com/site/",
        "/site/",
      ),
    ).toBe(false);
  });

  it("prefers gateway URLs over resource-native fallback", () => {
    const preferred = preferGatewayOrFallback({
      gateway: {
        accessUrl: "https://api.example.com/app",
        accessUrls: ["https://api.example.com/app"],
        accessUrlSource: "gateway.custom",
        routes: [],
        disabledAccessUrls: [],
      },
      fallbackUrl: "https://env.tcloudbaseapp.com/app/",
      fallbackSource: "hosting.staticDomain",
    });

    expect(preferred).toEqual({
      accessUrl: "https://api.example.com/app",
      accessUrls: [
        "https://api.example.com/app",
        "https://env.tcloudbaseapp.com/app/",
      ],
      accessUrlSource: "gateway.custom",
      accessUrlReachable: true,
      disabledAccessUrls: [],
    });
  });

  it("omits unreachable hosting.staticDomain fallback from accessUrls", () => {
    const preferred = preferGatewayOrFallback({
      gateway: {
        accessUrl: "https://app.webapps.tcloudbase.com/",
        accessUrls: ["https://app.webapps.tcloudbase.com/"],
        accessUrlSource: "gateway.default",
        routes: [],
        disabledAccessUrls: [
          "https://env.tcloudbaseapp.com/",
        ],
      },
      fallbackUrl: "https://env.tcloudbaseapp.com/site/",
      fallbackSource: "hosting.staticDomain",
      fallbackReachable: false,
    });

    expect(preferred.accessUrl).toBe(
      "https://app.webapps.tcloudbase.com/",
    );
    expect(preferred.accessUrls).toEqual([
      "https://app.webapps.tcloudbase.com/",
    ]);
    expect(preferred.accessUrlReachable).toBe(true);
    expect(preferred.disabledAccessUrls).toContain(
      "https://env.tcloudbaseapp.com/site/",
    );
  });

  it("falls back to resource-native URL when gateway has no match", () => {
    const preferred = preferGatewayOrFallback({
      gateway: { accessUrls: [], routes: [], disabledAccessUrls: [] },
      fallbackUrl: "https://svc.run.tcloudbase.com",
      fallbackSource: "cloudrun.defaultDomain",
    });

    expect(preferred).toEqual({
      accessUrl: "https://svc.run.tcloudbase.com",
      accessUrls: ["https://svc.run.tcloudbase.com"],
      accessUrlSource: "cloudrun.defaultDomain",
      accessUrlReachable: true,
      disabledAccessUrls: [],
    });
  });

  it("returns no accessUrl when only disabled fallback remains", () => {
    const preferred = preferGatewayOrFallback({
      gateway: {
        accessUrls: [],
        routes: [],
        disabledAccessUrls: ["https://env.tcloudbaseapp.com/"],
      },
      fallbackUrl: "https://env.tcloudbaseapp.com/site/",
      fallbackSource: "hosting.staticDomain",
      fallbackReachable: false,
    });

    expect(preferred.accessUrl).toBeUndefined();
    expect(preferred.accessUrls).toEqual([]);
    expect(preferred.accessUrlReachable).toBe(false);
    expect(preferred.disabledAccessUrls).toEqual([
      "https://env.tcloudbaseapp.com/",
      "https://env.tcloudbaseapp.com/site/",
    ]);
  });
});
