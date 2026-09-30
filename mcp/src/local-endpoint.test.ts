import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { createLocalCloudApiRequestFn } from './local-endpoint.js';

describe('local cloud api request', () => {
  it('unwraps Response and throws Error.Code', async () => {
    const server = http.createServer((req, res) => {
      const action = req.headers['x-tc-action'];
      const body = action === 'DescribeEnvs'
        ? { Response: { EnvList: [{ EnvId: 'local' }], RequestId: 'req-1' } }
        : { Response: { Error: { Code: 'InvalidAction', Message: 'The request action is invalid or not found' }, RequestId: 'req-2' } };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const request = createLocalCloudApiRequestFn(`http://127.0.0.1:${address.port}`);
    await expect(request({
      service: 'tcb',
      action: 'DescribeEnvs',
      version: '2018-06-08',
      region: 'ap-shanghai',
      payload: {},
    })).resolves.toMatchObject({ EnvList: [{ EnvId: 'local' }], RequestId: 'req-1' });
    await expect(request({
      service: 'tcb',
      action: 'Missing',
      version: '2018-06-08',
      region: 'ap-shanghai',
      payload: {},
    })).rejects.toMatchObject({
      message: 'The request action is invalid or not found',
      code: 'InvalidAction',
    });
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  });
});
