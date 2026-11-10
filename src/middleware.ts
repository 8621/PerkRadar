import { NextResponse, type NextRequest } from "next/server";
import { uiAuthorized } from "./lib/auth-edge";
/** Gate UI before loading.tsx can commit streaming HTTP 200 headers. APIs also authenticate in-route. */
export async function middleware(request: NextRequest) {
  const token = process.env.PERKRADAR_ACCESS_TOKEN;
  if (!token) return NextResponse.next();
  if (token.length < 32) return new NextResponse("访问认证配置无效", { status: 503, headers: { "cache-control": "no-store" } });
  if (await uiAuthorized(request.headers, token)) return NextResponse.next();
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.headers.set("cache-control", "no-store");
  return response;
}
export const config = { matcher: ["/", "/demo/:path*"] };
