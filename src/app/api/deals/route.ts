import { NextResponse } from "next/server";
import { getBoardState } from "@/lib/board";
import { logFailure } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  try {
    const board = getBoardState();
    return NextResponse.json(board, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    // 数据库读失败时不能让调用方把异常当成空数据，明确降级成 503 且不留缓存。
    logFailure("deals_read_failed", error);
    return NextResponse.json(
      { error: "数据库不可读" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
