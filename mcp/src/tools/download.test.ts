import * as dns from "dns";
import * as fs from "fs/promises";
import * as http from "http";
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

  const { registerDownloadTools } = await import("./download.js");
  registerDownloadTools(server);
  return tools;
}

function createMockRequest(): http.ClientRequest {
  return new EventEmitter() as http.ClientRequest;
}

function createMockResponse(
  statusCode: number,
  headers: http.IncomingHttpHeaders,
  body = "",
): http.IncomingMessage {
  const response = new PassThrough() as PassThrough & http.IncomingMessage;
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

describe("downloadRemoteFile security", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "download-tool-test-"));
    process.env.PROJECT_ROOT = tempRoot;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("http");
    delete process.env.PROJECT_ROOT;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("should block localhost targets before any request is sent", async () => {
    const tools = await createMockServer();
    let hitCount = 0;

    const localServer = http.createServer((req, res) => {
      hitCount += 1;
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });

    await new Promise<void>((resolve) => localServer.listen(18090, "127.0.0.1", () => resolve()));

    try {
      await expect(
        tools.downloadRemoteFile.handler({
          url: "http://127.0.0.1:18090/poc.txt",
          relativePath: "tmp/poc.txt",
        }),
      ).rejects.toThrow(/内网地址|不安全/);

      expect(hitCount).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => localServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("should reject localhost closed ports before connect errors leak", async () => {
    const tools = await createMockServer();

    await expect(
      tools.downloadRemoteFile.handler({
        url: "http://127.0.0.1:18091/poc.txt",
        relativePath: "tmp/poc.txt",
      }),
    ).rejects.toThrow(/内网地址|不安全/);
  });

  it("should reject ipv6-mapped localhost targets before any request is sent", async () => {
    const tools = await createMockServer();

    await expect(
      tools.downloadRemoteFile.handler({
        url: "http://[::ffff:127.0.0.1]:18092/poc.txt",
        relativePath: "tmp/poc.txt",
      }),
    ).rejects.toThrow(/内网地址|不安全/);
  });

  it("should block redirects to localhost before sending the next request", async () => {
    mockPublicDnsLookup(["safe.example"]);

    const mockedGet = vi.fn((url: URL, options: http.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
      expect(typeof options.lookup).toBe("function");
      process.nextTick(() => {
        callback(
          createMockResponse(302, {
            location: "http://localhost:18090/blocked.txt",
          }),
        );
      });
      return createMockRequest();
    });

    vi.doMock("http", async () => {
      const actual = await vi.importActual<typeof import("http")>("http");
      return {
        ...actual,
        get: mockedGet,
      };
    });

    const tools = await createMockServer();

    await expect(
      tools.downloadRemoteFile.handler({
        url: "http://safe.example/entry.txt",
        relativePath: "tmp/redirected.txt",
      }),
    ).rejects.toThrow(/内网地址|不安全/);

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet.mock.calls[0]?.[0].toString()).toBe("http://safe.example/entry.txt");
  });

  it("should download allowed public content to the target path", async () => {
    mockPublicDnsLookup(["safe.example"]);

    const mockedGet = vi.fn((url: URL, options: http.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
      expect(url.toString()).toBe("http://safe.example/file.txt");
      expect(typeof options.lookup).toBe("function");
      process.nextTick(() => {
        callback(
          createMockResponse(
            200,
            {
              "content-type": "text/plain",
              "content-length": "5",
            },
            "hello",
          ),
        );
      });
      return createMockRequest();
    });

    vi.doMock("http", async () => {
      const actual = await vi.importActual<typeof import("http")>("http");
      return {
        ...actual,
        get: mockedGet,
      };
    });

    const tools = await createMockServer();
    const result = await tools.downloadRemoteFile.handler({
      url: "http://safe.example/file.txt",
      relativePath: "tmp/safe-file.txt",
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.relativePath).toBe("tmp/safe-file.txt");
    expect(payload.contentType).toBe("text/plain");
    expect(payload.fileSize).toBe(5);
    await expect(fs.readFile(path.join(tempRoot, "tmp/safe-file.txt"), "utf8")).resolves.toBe("hello");
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });
});
