import { accessToken } from "@/lib/auth";
import { requirePageAuth } from "@/lib/page-auth";
import { DealBoard } from "@/components/deal-board";
import { getBoardState } from "@/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  await requirePageAuth();
  const board = getBoardState();
  return <DealBoard initial={board} authEnabled={accessToken() !== null} />;
}
