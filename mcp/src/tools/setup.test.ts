import AdmZip from "adm-zip";
import * as dns from "dns";
import * as fs from "fs/promises";
import type { ClientRequest, IncomingHttpHeaders, IncomingMessage, RequestOptions } from "http";
import { EventEmitter } from "node:events";
import * as os from "os";
import * as path from "path";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";

type RegisteredTool = { meta: any; handler: (args: any) => Promise<any> };

async function createMockServer() {
  const tools: Record<string, RegisteredTool> = {};
  const server: ExtendedMcpServer = {
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  const { registerSetupTools } = await import("./setup.js");
  registerSetupTools(server);
  return tools;
}

function createZipBuffer(): Buffer {
  const zip = new AdmZip();
  zip.addFile("CODEBUDDY.md", Buffer.from("cloudbase rules"));
  return zip.toBuffer();
}

function createMockRequest(): ClientRequest {
  return new EventEmitter() as ClientRequest;
}

function createMockResponse(
  statusCode: number,
  headers: IncomingHttpHeaders,
  body: Buffer | string = "",
): IncomingMessage {
  const response = new PassThrough() as PassThrough & IncomingMessage;
  response.statusCode = statusCode;
  response.headers = headers;
  process.nextTick(() => {
    response.end(body);
  });
  return response;
}

function mockPublicDnsLookup(hostnames: string[]) {
  vi.spyOn(dns.promises, "lookup").mockImplementation((async (hostname: string, options?: dns.LookupOneOptions | dns.LookupAllOptions) => {
    if (!hostnames.includes(hostname)) {
      throw new Error(`unexpected hostname: ${hostname}`);
    }

    const result = { address: "93.184.216.34", family: 4 };
    if (typeof options === "object" && options?.all) {
      return [result];
    }

    return result;
  }) as any);
}

describe("downloadTemplate redirect handling", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "setup-tool-test-"));
    process.env.WORKSPACE_FOLDER_PATHS = tempRoot;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("https");
    delete process.env.WORKSPACE_FOLDER_PATHS;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("should follow 307 redirects when downloading templates", async () => {
    const zipBuffer = createZipBuffer();

    mockPublicDnsLookup(["static.cloudbase.net", "cdn.safe.example"]);

    const mockedGet = vi.fn((url: URL, options: RequestOptions, callback: (res: IncomingMessage) => void) => {
      expect(typeof options.lookup).toBe("function");
      process.nextTick(() => {
        if (url.hostname === "static.cloudbase.net") {
          callback(
            createMockResponse(307, {
              location: "https://cdn.safe.example/template.zip",
            }),
          );
          return;
        }

        if (url.hostname === "cdn.safe.example") {
          callback(createMockResponse(200, {}, zipBuffer));
          return;
        }

        throw new Error(`unexpected request target: ${url.toString()}`);
      });
      return createMockRequest();
    });

    vi.doMock("https", async () => {
      const actual = await vi.importActual<typeof import("https")>("https");
      return {
        ...actual,
        get: mockedGet,
      };
    });

    const tools = await createMockServer();
    const result = await tools.downloadTemplate.handler({
      template: "rules",
      ide: "codebuddy",
      overwrite: false,
    });

    const text = result.content[0].text as string;
    expect(text).toContain("同步完成");
    await expect(fs.readFile(path.join(tempRoot, "CODEBUDDY.md"), "utf8")).resolves.toBe("cloudbase rules");
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
