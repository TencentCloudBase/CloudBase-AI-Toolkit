import { AuthorizationRecord } from '../types';
import { CONSUMED_TTL_MS } from '../config';

export function cleanupExpired(
  deviceStore: Map<string, AuthorizationRecord>,
  userCodeIndex: Map<string, string>,
): void {
  const now = Date.now();
  for (const [key, auth] of deviceStore.entries()) {
    if (now > auth.expiresAt) {
      deviceStore.delete(key);
      userCodeIndex.delete(auth.userCode);
    }
  }
}

export function scheduleExpiry(
  deviceStore: Map<string, AuthorizationRecord>,
  userCodeIndex: Map<string, string>,
  deviceCode: string,
  userCode: string,
  ttlMs: number,
): void {
  setTimeout(() => {
    const auth = deviceStore.get(deviceCode);
    if (auth && (auth.status === 'pending' || auth.status === 'authorized')) {
      auth.status = 'expired';
      setTimeout(() => {
        deviceStore.delete(deviceCode);
        userCodeIndex.delete(userCode);
      }, CONSUMED_TTL_MS);
    }
  }, ttlMs);
}
