import { NextResponse } from "next/server";
import { GuardError, assertSameOrigin, assertSmallBody, clientIp, consumeManualAttempt } from "@/lib/guard";
import { RefreshRejected, runRefresh } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200, extra?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", ...Object.fromEntries(new Headers(extra).entries()) },
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request.headers);
    assertSmallBody(request.headers);
    const ip = clientIp(request.headers);
    if (!consumeManualAttempt(ip, Date.now())) {
      return json({ error: "手动刷新过于频繁，请稍后再试" }, 429, { "retry-after": "60" });
    }
    const board = await runRefresh({ trigger: "manual" });
    return json(board);
  } catch (error) {
    if (error instanceof GuardError) return json({ error: error.message }, error.status);
    if (error instanceof RefreshRejected) {
      const status = error.code === "BUSY" ? 409 : 429;
      const headers = error.retryAfterMs
        ? { "retry-after": String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))) }
        : undefined;
      return json({ error: error.message }, status, headers);
    }
    console.error("[deals] manual refresh failed", error);
    return json({ error: "刷新失败" }, 500);
  }
}
