import { NextResponse } from "next/server";
import { getBoardState } from "@/lib/board";
import { toHealthReport } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  try {
    const report = toHealthReport(getBoardState());
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[deals] health check failed", error);
    return NextResponse.json(
      { ok: false, error: "数据库不可读" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
