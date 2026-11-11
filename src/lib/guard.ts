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

export function clientIp(headers: Headers, options?: { trustProxy?: boolean }): string {
  // 只监听 loopback、前面没有可信代理；转发头由客户端可控，默认一律归到 local，否则可伪造来绕开限流。
  const trustProxy = options?.trustProxy ?? (process.env.TRUST_PROXY_HEADERS === "1");
  if (!trustProxy) return "local";
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim().slice(0, 80) || "unknown";
  return headers.get("x-real-ip")?.slice(0, 80) || "local";
}

export function assertSameOrigin(headers: Headers): void {
  // 浏览器会给跨站请求打上 Sec-Fetch-Site，而 curl 排障命令不带它；据此挡住伪装成同源的跨站刷新。
  if (headers.get("sec-fetch-site") === "cross-site") {
    throw new GuardError("拒绝跨站刷新", 403);
  }
  const origin = headers.get("origin");
  if (!origin) return;
  const host = (process.env.TRUST_PROXY_HEADERS === "1" ? headers.get("x-forwarded-host") : null) || headers.get("host");
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
  for (const [key, stamps] of attempts) if (!stamps.some((stamp) => now - stamp < windowMs)) attempts.delete(key);
  if (!attempts.has(ip) && attempts.size >= 10_000) return false;
  const recent = (attempts.get(ip) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    attempts.set(ip, recent);
    return false;
  }
  recent.push(now);
  attempts.set(ip, recent);
  return true;
}
