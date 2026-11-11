import { NextResponse, type NextRequest } from "next/server";
import { uiAuthorized } from "./lib/auth-edge";

const HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

/**
 * Where to send an unauthenticated visitor. Middleware redirects must be absolute, and
 * `request.url` carries the address the server listens on (localhost:38471), which is
 * wrong behind a reverse proxy. Use the Host the browser asked for, and the scheme the
 * proxy reports. Both only ever point the requester back at the origin they came from.
 */
export function loginUrl(request: NextRequest): URL {
  const fallback = new URL("/login", request.url);
  const host = request.headers.get("host");
  if (!host || !HOST.test(host)) return fallback;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwarded === "https" || forwarded === "http" ? `${forwarded}:` : fallback.protocol;
  try {
    return new URL(`${protocol}//${host}/login`);
  } catch {
    return fallback;
  }
}

/** Gate UI before loading.tsx can commit streaming HTTP 200 headers. APIs also authenticate in-route. */
export async function middleware(request: NextRequest) {
  const token = process.env.PERKRADAR_ACCESS_TOKEN;
  if (!token) return NextResponse.next();
  if (token.length < 32) return new NextResponse("访问认证配置无效", { status: 503, headers: { "cache-control": "no-store" } });
  if (await uiAuthorized(request.headers, token)) return NextResponse.next();
  const response = NextResponse.redirect(loginUrl(request));
  response.headers.set("cache-control", "no-store");
  return response;
}
export const config = { matcher: ["/", "/demo/:path*"] };
