import type { CloudApiRequestFn } from './types.js';

/**
 * manager-node 5.8.8 routes both DatabaseService.executePGSql and
 * commonService().call through CloudService.request. That method delegates
 * to context.requestFn and skips TC3 when the function is set.
 */
export function createLocalCloudApiRequestFn(endpoint: string): CloudApiRequestFn {
  const base = endpoint.replace(/\/$/, '');
  return async ({ service, action, version, region, payload }) => {
    const response = await fetch(`${base}/capi`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tc-action': action,
        'x-tc-version': version,
        'x-tc-region': region,
        'x-tc-service': service,
      },
      body: JSON.stringify(payload ?? {}),
    });
    const body = await response.json() as { Response?: Record<string, unknown> };
    const inner = body.Response;
    if (!inner) {
      const error = new Error('missing Response');
      (error as Error & { code?: string }).code = 'InternalError';
      throw error;
    }
    const apiError = inner.Error as { Code?: string; Message?: string } | undefined;
    if (apiError) {
      const error = new Error(apiError.Message || apiError.Code || 'cloud api error');
      (error as Error & { code?: string }).code = apiError.Code;
      throw error;
    }
    return inner;
  };
}
