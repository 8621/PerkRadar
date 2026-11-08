import { MANUAL_IP_LIMIT, MANUAL_IP_WINDOW_MS } from "./config";

export class GuardError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GuardError";
    this.status = status;
  }
}

const attempts = new Map<string, number[]>();

export function resetGuards(): void {
  attempts.clear();
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim().slice(0, 80) || "unknown";
  return headers.get("x-real-ip")?.slice(0, 80) || "local";
}

export function assertSameOrigin(headers: Headers): void {
  const origin = headers.get("origin");
  if (!origin) return;
  const host = headers.get("x-forwarded-host") || headers.get("host");
  if (!host) throw new GuardError("缺少主机信息", 403);
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new GuardError("来源无效", 403);
  }
  if (originHost !== host) throw new GuardError("拒绝跨站刷新", 403);
}

export function assertSmallBody(headers: Headers): void {
  const length = headers.get("content-length");
  if (length && Number(length) > 2048) throw new GuardError("请求无效", 400);
}

/** Returns false when this IP has used its manual-refresh budget. */
export function consumeManualAttempt(
  ip: string,
  now: number,
  limit = MANUAL_IP_LIMIT,
  windowMs = MANUAL_IP_WINDOW_MS,
): boolean {
  const recent = (attempts.get(ip) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    attempts.set(ip, recent);
    return false;
  }
  recent.push(now);
  attempts.set(ip, recent);
  return true;
}
