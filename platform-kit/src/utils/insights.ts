import type { AppUser } from "../core/types.js";

export function bucketUserGrowth(users: AppUser[], days = 14): number[] {
  const buckets = Array.from({ length: days }, () => 0);
  const now = Date.now();
  for (const user of users) {
    if (!user.createdAt) continue;
    const created = Date.parse(user.createdAt);
    if (!Number.isFinite(created)) continue;
    const dayIndex = days - 1 - Math.floor((now - created) / 86400000);
    if (dayIndex >= 0 && dayIndex < days) {
      buckets[dayIndex] = (buckets[dayIndex] ?? 0) + 1;
    }
  }
  let running = 0;
  return buckets.map((count) => {
    running += count;
    return running;
  });
}
