import { authFailure } from "@/lib/auth";
import { NextResponse } from "next/server";
import { GuardError, assertSameOrigin, assertSmallBody, clientIp, consumeManualAttempt } from "@/lib/guard";
import { logEvent, logFailure } from "@/lib/log";
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
  const denied = authFailure(request);
  if (denied) return denied;
  try {
    assertSameOrigin(request.headers);
    assertSmallBody(request.headers);
    const ip = clientIp(request.headers);
    if (!consumeManualAttempt(ip, Date.now())) {
      logEvent("manual_refresh_rejected", { code: "rate_limit", status: 429 });
      return json({ error: "手动刷新过于频繁，请稍后再试" }, 429, { "retry-after": "60" });
    }
    const board = await runRefresh({ trigger: "manual" });
    logEvent("manual_refresh_ok", {
      roundStatus: board.roundStatus,
      activeCount: board.activeCount,
    });
    return json(board);
  } catch (error) {
    if (error instanceof GuardError) {
      logEvent("manual_refresh_rejected", { code: "guard", status: error.status });
      return json({ error: error.message }, error.status);
    }
    if (error instanceof RefreshRejected) {
      const status = error.code === "BUSY" ? 409 : 429;
      logEvent("manual_refresh_rejected", { code: error.code, status });
      const headers = error.retryAfterMs
        ? { "retry-after": String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))) }
        : undefined;
      return json({ error: error.message }, status, headers);
    }
    logFailure("manual_refresh_failed", error);
    return json({ error: "刷新失败" }, 500);
  }
}
