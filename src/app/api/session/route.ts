import { NextResponse } from "next/server";
import { accessToken, createSession, SESSION_COOKIE, validToken } from "@/lib/auth";
import { assertSameOrigin, consumeManualAttempt, GuardError } from "@/lib/guard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function secureCookie(): boolean {
  return process.env.PERKRADAR_SECURE_COOKIE !== "0" && process.env.NODE_ENV === "production";
}

/** Read the actual streamed bytes, not a forgeable Content-Length. */
async function smallForm(request: Request): Promise<URLSearchParams> {
  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new GuardError("请求过大", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

/**
 * A browser form post gets sent back to the login page with a short reason code, so the
 * person sees a message instead of a raw JSON body. Scripts keep the JSON status contract.
 * The redirect is relative: it cannot be poisoned by client Host/forwarded-host values.
 */
function failure(request: Request, status: number, message: string, code: string): NextResponse {
  if (request.headers.get("accept")?.includes("text/html")) {
    return new NextResponse(null, { status: 303, headers: { ...NO_STORE, location: `/login?error=${code}` } });
  }
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request.headers);
    // Global login budget, independent of spoofable forwarding headers.
    if (!consumeManualAttempt("auth-global", Date.now(), 10, 60_000)) return failure(request, 429, "请稍后重试", "rate");
    const token = accessToken();
    if (!token) return failure(request, 400, "未启用访问认证", "disabled");
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new GuardError("表单格式无效", 415);
    const form = await smallForm(request);
    if (!validToken(form.get("token") ?? "", token)) return failure(request, 401, "令牌无效", "invalid");
    const response = new NextResponse(null, { status: 303, headers: { ...NO_STORE, location: "/" } });
    response.cookies.set(SESSION_COOKIE, createSession(token), { httpOnly: true, sameSite: "strict", secure: secureCookie(), path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch (error) {
    const guard = error instanceof GuardError;
    return failure(request, guard ? error.status : 503, guard ? error.message : "认证配置或请求无效", guard ? "request" : "config");
  }
}

/**
 * Sign out of this browser. The cookie is signed, not stored server-side, so this only
 * removes it here; changing PERKRADAR_ACCESS_TOKEN is what invalidates every session.
 */
export function DELETE(request: Request) {
  try {
    assertSameOrigin(request.headers);
  } catch (error) {
    return NextResponse.json({ error: error instanceof GuardError ? error.message : "请求无效" }, { status: 403, headers: NO_STORE });
  }
  const response = new NextResponse(null, { status: 204, headers: NO_STORE });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: secureCookie(), path: "/", maxAge: 0 });
  return response;
}
