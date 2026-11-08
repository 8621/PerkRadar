import { DealBoard } from "@/components/deal-board";
import { getBoardState } from "@/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function HomePage() {
  const board = getBoardState();
  return (
    <main>
      <DealBoard initial={board} />
    </main>
  );
}
