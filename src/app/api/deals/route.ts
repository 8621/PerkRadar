import { NextResponse } from "next/server";
import { getBoardState } from "@/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const board = getBoardState();
  return NextResponse.json(board, { headers: { "cache-control": "no-store" } });
}
