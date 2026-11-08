import { EXPIRING_SOON_MS, RETENTION_MS } from "./config";

export type RetentionFields = {
  publishedAt: number | null;
  firstSeenAt: number;
  expiresAt: number | null;
};

/**
 * Clock for the 7-day window.
 * Published time wins. If the source has no date, the first time we stored it is used.
 */
export function referenceTime(item: Pick<RetentionFields, "publishedAt" | "firstSeenAt">): number {
  return item.publishedAt ?? item.firstSeenAt;
}

/**
 * Drop when either boundary is crossed:
 * - expiry instant is inclusive (`expiresAt <= now` is gone; `expiresAt === now + 1` stays)
 * - age is exclusive at exactly 7 days (`reference === now - 7d` stays; one millisecond older is gone)
 */
export function isStale(item: RetentionFields, now: number): boolean {
  if (item.expiresAt != null && item.expiresAt <= now) return true;
  return referenceTime(item) < now - RETENTION_MS;
}

export function isExpiringSoon(expiresAt: number | null, now: number): boolean {
  if (expiresAt == null) return false;
  const delta = expiresAt - now;
  return delta > 0 && delta <= EXPIRING_SOON_MS;
}
