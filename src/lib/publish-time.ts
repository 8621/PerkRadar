import { FUTURE_PUBLISH_TOLERANCE_MS, MIN_PUBLISH_MS } from "./config";
/** Shared untrusted-source date boundary. Null falls back to firstSeenAt. */
export function publishTime(value: string, now = Date.now()): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms >= MIN_PUBLISH_MS && ms <= now + FUTURE_PUBLISH_TOLERANCE_MS ? ms : null;
}
