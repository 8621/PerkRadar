import { BOARD_MAX_ITEMS } from "./config";
import { normalizeBoardState } from "./board-view";
import { RETENTION_MS } from "./config";
import type { BoardState } from "./types";

/** The session cookie expired or the token changed; the page should send the person to /login. */
export class AuthExpiredError extends Error {
  constructor() {
    super("登录已过期，请重新登录");
    this.name = "AuthExpiredError";
  }
}

export async function readBoard(signal: AbortSignal): Promise<BoardState> {
  let board: BoardState | null = null;
  let offset = 0;
  // A page sequence must come from one refresh generation; retry next poll if it changes.
  for (;;) {
    const response = await fetch(`/api/deals?limit=1000&offset=${offset}`, { cache: "no-store", signal });
    if (response.status === 401) throw new AuthExpiredError();
    if (!response.ok) throw new Error("数据暂时不可用");
    const page = normalizeBoardState(await response.json());
    if (!page) throw new Error("看板数据格式异常");
    if (!board) board = { ...page, deals: [] };
    if (page.lastUpdatedAt !== board.lastUpdatedAt) throw new Error("抓取已更新，下一轮重新读取");
    board.deals.push(...page.deals);
    offset += page.deals.length;
    if (!page.pagination?.hasMore) break;
    if (!page.deals.length || offset >= BOARD_MAX_ITEMS) throw new Error("看板超过安全上限，请使用分页 API");
  }
  board.pagination = { offset: 0, limit: board.deals.length, total: board.deals.length, hasMore: false };
  board.sources = board.sources.map((source) => ({ ...source, activeCount: board!.deals.filter((deal) => deal.sourceId === source.id).length }));
  board.activeCount = board.deals.length;
  board.newCount = board.deals.filter((deal) => deal.isNew).length;
  return board;
}
/** Expiry updates even while upstream is unavailable. Undated age remains server-owned. */
export function expireBoard(board: BoardState, now: number): BoardState {
  const deals = board.deals.filter((deal) => (deal.expiresAt == null || deal.expiresAt > now) && (deal.publishedAt == null || deal.publishedAt >= now - RETENTION_MS));
  const age = board.lastUpdatedAt == null ? null : Math.max(0, now - board.lastUpdatedAt);
  return { ...board, deals, activeCount: deals.length, newCount: deals.filter((deal) => deal.isNew).length,
    sources: board.sources.map((source) => ({ ...source, activeCount: deals.filter((deal) => deal.sourceId === source.id).length })),
    freshness: { lastRoundAgeMs: age, stale: age != null && age > 2.5 * 3_600_000, severe: age != null && age > 4 * 3_600_000 } };
}
