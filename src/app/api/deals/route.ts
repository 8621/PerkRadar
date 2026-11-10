import { authFailure } from "@/lib/auth";
import { NextResponse } from "next/server";
import { boardPage } from "@/lib/board-page";
import { getBoardState } from "@/lib/board";
import { logFailure } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const denied = authFailure(request);
  if (denied) return denied;
  try {
    const params = new URL(request.url).searchParams;
    let board;
    try { board = boardPage(getBoardState(), params); } catch (error) {
      if (error instanceof Error && error.message === "无效分页参数") return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }
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
