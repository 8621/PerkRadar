import { NextResponse } from "next/server";
import { accessToken, createSession, SESSION_COOKIE, validToken } from "@/lib/auth";
import { assertSameOrigin, consumeManualAttempt, GuardError } from "@/lib/guard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  try {
    assertSameOrigin(request.headers);
    // Global login budget, independent of spoofable forwarding headers.
    if (!consumeManualAttempt("auth-global", Date.now(), 10, 60_000)) return NextResponse.json({ error: "请稍后重试" }, { status: 429, headers });
    const token = accessToken();
    if (!token) return NextResponse.json({ error: "未启用访问认证" }, { status: 400, headers });
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new GuardError("表单格式无效", 415);
    const form = await smallForm(request);
    if (!validToken(form.get("token") ?? "", token)) return NextResponse.json({ error: "令牌无效" }, { status: 401, headers });
    // Relative redirect cannot be poisoned by client Host/forwarded-host values.
    const response = new NextResponse(null, { status: 303, headers: { ...headers, location: "/" } });
    response.cookies.set(SESSION_COOKIE, createSession(token), { httpOnly: true, sameSite: "strict", secure: process.env.PERKRADAR_SECURE_COOKIE !== "0" && process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof GuardError ? error.message : "认证配置或请求无效" }, { status: error instanceof GuardError ? error.status : 503, headers });
  }
}
