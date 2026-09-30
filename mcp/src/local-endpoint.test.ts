import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertLocalEndpoint,
  createLocalCloudApiRequestFn,
  resolveLocalEndpoint,
} from './local-endpoint.js';

afterEach(() => {
  delete process.env.CLOUDBASE_LOCAL_ENDPOINT;
});

async function listen(handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}

const requestInput = {
  service: 'tcb',
  action: 'DescribeEnvs',
  version: '2018-06-08',
  region: 'ap-shanghai',
  payload: {},
};

describe('local cloud api request', () => {
  it('unwraps Response and throws Error.Code', async () => {
    const { port, close } = await listen((req, res) => {
      const action = req.headers['x-tc-action'];
      const body = action === 'DescribeEnvs'
        ? { Response: { EnvList: [{ EnvId: 'local' }], RequestId: 'req-1' } }
        : { Response: { Error: { Code: 'InvalidAction', Message: 'The request action is invalid or not found' }, RequestId: 'req-2' } };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    });
    const request = createLocalCloudApiRequestFn(`http://127.0.0.1:${port}`);
    await expect(request(requestInput)).resolves.toMatchObject({
      EnvList: [{ EnvId: 'local' }],
      RequestId: 'req-1',
    });
    await expect(request({ ...requestInput, action: 'Missing' })).rejects.toMatchObject({
      message: 'The request action is invalid or not found',
      code: 'InvalidAction',
    });
    await close();
  });

  it('rejects hosts that are not loopback', () => {
    expect(() => assertLocalEndpoint('http://10.0.0.1:8797')).toThrow(/loopback/);
    expect(() => assertLocalEndpoint('https://example.com')).toThrow(/loopback/);
    // a loopback-looking prefix must not pass
    expect(() => assertLocalEndpoint('http://127.0.0.1.evil.com:8797')).toThrow(/loopback/);
  });

  it('rejects non-http schemes and malformed URLs', () => {
    expect(() => assertLocalEndpoint('file:///etc/passwd')).toThrow(/http or https/);
    expect(() => assertLocalEndpoint('not-a-url')).toThrow(/not a valid URL/);
  });

  it('accepts loopback v4, v6 and localhost, and trims trailing slashes', () => {
    expect(assertLocalEndpoint('http://127.0.0.1:8797/')).toBe('http://127.0.0.1:8797');
    expect(assertLocalEndpoint('http://[::1]:8797')).toBe('http://[::1]:8797');
    expect(assertLocalEndpoint('http://localhost:8797')).toBe('http://localhost:8797');
  });

  it('does not follow redirects', async () => {
    const { port, close } = await listen((_req, res) => {
      res.statusCode = 302;
      res.setHeader('location', 'http://127.0.0.1:1/capi');
      res.end();
    });
    const request = createLocalCloudApiRequestFn(`http://127.0.0.1:${port}`);
    await expect(request(requestInput)).rejects.toThrow(/redirect/);
    await close();
  });

  it('resolveLocalEndpoint is undefined when unset and throws on an invalid value', () => {
    delete process.env.CLOUDBASE_LOCAL_ENDPOINT;
    expect(resolveLocalEndpoint()).toBeUndefined();

    process.env.CLOUDBASE_LOCAL_ENDPOINT = 'http://10.0.0.1:8797';
    expect(() => resolveLocalEndpoint()).toThrow(/loopback/);

    process.env.CLOUDBASE_LOCAL_ENDPOINT = 'http://127.0.0.1:8797';
    expect(resolveLocalEndpoint()).toBe('http://127.0.0.1:8797');
  });
});
